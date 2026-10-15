from datetime import datetime, timedelta
from typing import List, Literal, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session
from app.database import get_db
from app import auth, models, schemas
from app.event_lifecycle import sync_event_statuses
from app.realtime import availability_connections

router = APIRouter(prefix="/api/events", tags=["Events"])

@router.get("", response_model=List[schemas.EventResponse])
def get_events(
    category: Optional[str] = Query(None, description="Category filter (Music, Tech, Sports, Business, Food & Drink)"),
    search: Optional[str] = Query(None, description="Search term for event title"),
    location: Optional[str] = Query(None, description="Filter by city or venue"),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    min_price: Optional[float] = Query(None, ge=0),
    max_price: Optional[float] = Query(None, ge=0),
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
    if min_price is not None and max_price is not None and min_price > max_price:
        raise HTTPException(status_code=422, detail="Minimum price cannot exceed maximum price.")
    if min_price is not None:
        query = query.filter(models.Event.ticket_price >= min_price)
    if max_price is not None:
        query = query.filter(models.Event.ticket_price <= max_price)

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

@router.get("/trending", response_model=List[schemas.EventResponse])
def get_trending_events(db: Session = Depends(get_db)):
    sync_event_statuses(db)
    popularity = (
        select(func.coalesce(func.sum(models.Booking.ticket_quantity), 0))
        .where(
            models.Booking.event_id == models.Event.id,
            models.Booking.booking_status == models.BookingStatus.CONFIRMED,
        )
        .correlate(models.Event)
        .scalar_subquery()
    )
    return (
        db.query(models.Event)
        .filter(models.Event.event_status == models.EventStatus.UPCOMING)
        .order_by(popularity.desc(), models.Event.event_date.asc())
        .limit(8)
        .all()
    )

@router.get("/recommendations", response_model=List[schemas.EventResponse])
def get_recommendations(
    current_user: models.User = Depends(auth.require_roles(models.UserRole.USER)),
    db: Session = Depends(get_db),
):
    sync_event_statuses(db)
    preferences = dict(
        db.query(models.Event.category, func.sum(models.EventView.view_count))
        .join(models.EventView, models.EventView.event_id == models.Event.id)
        .filter(models.EventView.user_id == current_user.id)
        .group_by(models.Event.category)
        .all()
    )
    booked_categories = db.query(
        models.Event.category,
        func.count(models.Booking.id),
    ).join(models.Booking, models.Booking.event_id == models.Event.id).filter(
        models.Booking.user_id == current_user.id,
        models.Booking.booking_status == models.BookingStatus.CONFIRMED,
    ).group_by(models.Event.category).all()
    for category, count in booked_categories:
        preferences[category] = preferences.get(category, 0) + int(count) * 3

    popularity = (
        select(func.coalesce(func.sum(models.Booking.ticket_quantity), 0))
        .where(
            models.Booking.event_id == models.Event.id,
            models.Booking.booking_status == models.BookingStatus.CONFIRMED,
        )
        .correlate(models.Event)
        .scalar_subquery()
    )
    events = db.query(models.Event).filter(
        models.Event.event_status == models.EventStatus.UPCOMING
    ).order_by(popularity.desc(), models.Event.event_date.asc()).all()
    popularity_by_event = dict(
        db.query(models.Booking.event_id, func.sum(models.Booking.ticket_quantity))
        .filter(models.Booking.booking_status == models.BookingStatus.CONFIRMED)
        .group_by(models.Booking.event_id)
        .all()
    )
    return sorted(
        events,
        key=lambda event: (
            preferences.get(event.category, 0),
            int(event.location.lower() == (current_user.location or "").lower()),
            int(popularity_by_event.get(event.id, 0)),
        ),
        reverse=True,
    )[:12]

@router.get("/{event_id}", response_model=schemas.EventResponse)
def get_event_detail(
    event_id: int,
    current_user: Optional[models.User] = Depends(auth.get_optional_current_user),
    db: Session = Depends(get_db),
):
    sync_event_statuses(db)
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if current_user and current_user.role == models.UserRole.USER:
        view = db.query(models.EventView).filter(
            models.EventView.user_id == current_user.id,
            models.EventView.event_id == event.id,
        ).first()
        if view:
            view.view_count += 1
            view.viewed_at = datetime.utcnow()
        else:
            db.add(models.EventView(user_id=current_user.id, event_id=event.id))
        db.commit()
    return event

@router.websocket("/{event_id}/availability")
async def event_availability(websocket: WebSocket, event_id: int, db: Session = Depends(get_db)):
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        db.close()
        await websocket.close(code=4404, reason="Event not found")
        return
    event_data = (event.id, event.available_tickets, event.event_status.value)
    db.close()
    await availability_connections.connect(event_id, websocket)
    await websocket.send_json({
        "event_id": event_data[0],
        "available_tickets": event_data[1],
        "event_status": event_data[2],
    })
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await availability_connections.disconnect(event_id, websocket)
