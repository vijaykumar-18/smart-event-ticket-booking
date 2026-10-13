from datetime import datetime, timedelta
from typing import List, Literal, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session
from app.database import get_db
from app import models, schemas
from app.event_lifecycle import sync_event_statuses

router = APIRouter(prefix="/api/events", tags=["Events"])

@router.get("", response_model=List[schemas.EventResponse])
def get_events(
    category: Optional[str] = Query(None, description="Category filter (Music, Tech, Sports, Business, Food & Drink)"),
    search: Optional[str] = Query(None, description="Search term for event title"),
    location: Optional[str] = Query(None, description="Filter by city or venue"),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    sort: Literal["date", "popularity", "price"] = Query("date"),
    db: Session = Depends(get_db)
):
    sync_event_statuses(db)
    query = db.query(models.Event)
    if category and category.lower() != "all":
        query = query.filter(models.Event.category.ilike(category.strip()))
    if search:
        query = query.filter(models.Event.title.ilike(f"%{search.strip()}%"))
    if location:
        location_match = f"%{location.strip()}%"
        query = query.filter(or_(
            models.Event.location.ilike(location_match),
            models.Event.venue.ilike(location_match),
        ))
    if start_date:
        query = query.filter(models.Event.event_date >= start_date)
    if end_date:
        query = query.filter(models.Event.event_date < end_date + timedelta(days=1))

    if sort == "price":
        query = query.order_by(models.Event.ticket_price.asc(), models.Event.event_date.asc())
    elif sort == "popularity":
        popularity = (
            select(func.coalesce(func.sum(models.Booking.ticket_quantity), 0))
            .where(
                models.Booking.event_id == models.Event.id,
                models.Booking.booking_status == models.BookingStatus.CONFIRMED,
            )
            .correlate(models.Event)
            .scalar_subquery()
        )
        query = query.order_by(popularity.desc(), models.Event.event_date.asc())
    else:
        query = query.order_by(models.Event.event_date.asc())
    return query.all()

@router.get("/{event_id}", response_model=schemas.EventResponse)
def get_event_detail(event_id: int, db: Session = Depends(get_db)):
    sync_event_statuses(db)
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return event
