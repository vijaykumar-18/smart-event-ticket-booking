from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import extract, func
from sqlalchemy.orm import Session, joinedload

from app import auth, models, schemas
from app.database import get_db
from app.event_lifecycle import sync_event_statuses

router = APIRouter(
    prefix="/api/admin",
    tags=["Administration"],
    dependencies=[Depends(auth.require_roles(models.UserRole.ADMIN))],
)


def booking_filters(query, start_date: Optional[datetime], end_date: Optional[datetime]):
    if start_date:
        query = query.filter(models.Booking.created_at >= start_date)
    if end_date:
        query = query.filter(models.Booking.created_at < end_date + timedelta(days=1))
    return query


@router.get("/users", response_model=list[schemas.UserResponse])
def list_users(db: Session = Depends(get_db)):
    return db.query(models.User).order_by(models.User.created_at.desc()).all()


@router.put("/users/{user_id}/role", response_model=schemas.UserResponse)
def update_user_role(
    user_id: int,
    payload: schemas.UserRoleUpdate,
    current_user: models.User = Depends(auth.require_roles(models.UserRole.ADMIN)),
    db: Session = Depends(get_db),
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current_user.id and payload.role != models.UserRole.ADMIN:
        raise HTTPException(status_code=400, detail="You cannot remove your own administrator role")
    if user.role == models.UserRole.ADMIN and payload.role != models.UserRole.ADMIN:
        admin_count = db.query(models.User).filter(
            models.User.role == models.UserRole.ADMIN
        ).count()
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="The last administrator cannot be demoted")
    user.role = payload.role
    db.commit()
    db.refresh(user)
    return user


@router.get("/events", response_model=list[schemas.EventResponse])
def list_events(db: Session = Depends(get_db)):
    sync_event_statuses(db)
    return db.query(models.Event).order_by(models.Event.created_at.desc()).all()


@router.get("/bookings", response_model=list[schemas.AdminBookingResponse])
def list_bookings(
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(models.Booking).options(
        joinedload(models.Booking.event),
        joinedload(models.Booking.user),
        joinedload(models.Booking.tickets).joinedload(models.Ticket.booking),
    )
    query = booking_filters(query, start_date, end_date)
    return query.order_by(models.Booking.created_at.desc()).all()


@router.get("/analytics")
def get_platform_analytics(
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    db: Session = Depends(get_db),
):
    bookings = booking_filters(db.query(models.Booking), start_date, end_date)
    confirmed = bookings.filter(
        models.Booking.booking_status == models.BookingStatus.CONFIRMED
    )
    total_booking_count = bookings.with_entities(func.count(models.Booking.id)).scalar()
    totals = confirmed.with_entities(
        func.coalesce(func.sum(models.Booking.ticket_quantity), 0),
        func.coalesce(func.sum(models.Booking.final_amount), 0),
    ).one()

    filtered_ids = confirmed.with_entities(models.Booking.id).statement
    all_filtered_ids = bookings.with_entities(models.Booking.id).statement
    daily = (
        db.query(
            func.date(models.Booking.created_at),
            func.coalesce(func.sum(models.Booking.ticket_quantity), 0),
        )
        .filter(
            models.Booking.id.in_(all_filtered_ids),
        )
        .group_by(func.date(models.Booking.created_at))
        .order_by(func.date(models.Booking.created_at))
        .all()
    )
    monthly = (
        db.query(
            extract("year", models.Booking.created_at).label("year"),
            extract("month", models.Booking.created_at).label("month"),
            func.count(models.Booking.id),
        )
        .filter(
            models.Booking.id.in_(filtered_ids),
            models.Booking.booking_status == models.BookingStatus.CONFIRMED,
        )
        .group_by(
            extract("year", models.Booking.created_at),
            extract("month", models.Booking.created_at),
        )
        .order_by(
            extract("year", models.Booking.created_at),
            extract("month", models.Booking.created_at),
        )
        .all()
    )
    popular = (
        db.query(
            models.Event.id,
            models.Event.title,
            func.coalesce(func.sum(models.Booking.ticket_quantity), 0).label("tickets_sold"),
        )
        .join(models.Booking, models.Booking.event_id == models.Event.id)
        .filter(
            models.Booking.booking_status == models.BookingStatus.CONFIRMED,
            models.Booking.id.in_(filtered_ids),
        )
        .group_by(models.Event.id)
        .order_by(func.sum(models.Booking.ticket_quantity).desc())
        .limit(10)
        .all()
    )
    top_revenue = (
        db.query(
            models.Event.id,
            models.Event.title,
            func.coalesce(func.sum(models.Booking.final_amount), 0).label("revenue"),
        )
        .join(models.Booking, models.Booking.event_id == models.Event.id)
        .filter(
            models.Booking.booking_status == models.BookingStatus.CONFIRMED,
            models.Booking.id.in_(filtered_ids),
        )
        .group_by(models.Event.id)
        .order_by(func.sum(models.Booking.final_amount).desc())
        .limit(10)
        .all()
    )
    return {
        "total_users": db.query(models.User).count(),
        "total_events": db.query(models.Event).count(),
        "total_tickets_sold": int(totals[0]),
        "total_bookings": int(total_booking_count),
        "platform_revenue": float(totals[1]),
        "daily_ticket_sales": [
            {"date": str(row[0]), "tickets_sold": int(row[1])} for row in daily
        ],
        "monthly_booking_trends": [
            {"month": f"{int(row[0]):04d}-{int(row[1]):02d}", "bookings": int(row[2])}
            for row in monthly
        ],
        "popular_events": [
            {"event_id": row[0], "title": row[1], "tickets_sold": int(row[2])}
            for row in popular
        ],
        "top_revenue_events": [
            {"event_id": row[0], "title": row[1], "revenue": float(row[2])}
            for row in top_revenue
        ],
    }
