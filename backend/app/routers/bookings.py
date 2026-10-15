from datetime import datetime
from typing import List
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import update
from sqlalchemy.orm import Session
from app.database import get_db
from app import models, schemas, auth
from app.booking_utils import calculate_coupon_quote
from app.realtime import availability_connections

router = APIRouter(prefix="/api/bookings", tags=["Bookings"])

@router.post("", response_model=schemas.BookingResponse, status_code=status.HTTP_201_CREATED)
def book_tickets(
    payload: schemas.BookingCreate,
    background_tasks: BackgroundTasks,
    current_user: models.User = Depends(auth.require_roles(models.UserRole.USER)),
    db: Session = Depends(get_db)
):
    if payload.ticket_quantity <= 0:
        raise HTTPException(status_code=400, detail="Ticket quantity must be at least 1")

    event = db.query(models.Event).filter(models.Event.id == payload.event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if event.event_status != models.EventStatus.UPCOMING:
        raise HTTPException(status_code=400, detail="Tickets are only available for upcoming events")

    inventory_update = db.execute(
        update(models.Event)
        .where(
            models.Event.id == payload.event_id,
            models.Event.available_tickets >= payload.ticket_quantity,
        )
        .values(available_tickets=models.Event.available_tickets - payload.ticket_quantity)
    )
    if inventory_update.rowcount != 1:
        event = db.query(models.Event).filter(models.Event.id == payload.event_id).first()
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        raise HTTPException(
            status_code=400,
            detail=f"Sold out or insufficient tickets available. Remaining: {event.available_tickets}"
        )

    total_price = round(event.ticket_price * payload.ticket_quantity, 2)
    coupon_quote = None
    if payload.coupon_code:
        coupon_quote = calculate_coupon_quote(
            db, payload.coupon_code, event, payload.ticket_quantity
        )

    new_booking = models.Booking(
        user_id=current_user.id,
        event_id=event.id,
        ticket_quantity=payload.ticket_quantity,
        total_price=total_price,
        coupon_id=coupon_quote["coupon_id"] if coupon_quote else None,
        discount_amount=coupon_quote["discount_amount"] if coupon_quote else 0,
        final_amount=coupon_quote["final_amount"] if coupon_quote else total_price,
        booking_status=models.BookingStatus.PENDING,
    )
    db.add(new_booking)
    db.flush()

    db.add(models.Payment(
        booking_id=new_booking.id,
        payment_method="UNSELECTED",
        payment_status=models.PaymentStatus.PENDING,
        amount=new_booking.final_amount,
    ))

    db.commit()
    db.refresh(event)
    background_tasks.add_task(
        availability_connections.broadcast,
        event.id,
        event.available_tickets,
        event.event_status.value,
    )
    db.refresh(new_booking)
    return new_booking

@router.get("/my-bookings", response_model=List[schemas.BookingResponse])
def get_user_bookings(
    current_user: models.User = Depends(auth.require_roles(models.UserRole.USER)),
    db: Session = Depends(get_db)
):
    return (
        db.query(models.Booking)
        .filter(models.Booking.user_id == current_user.id)
        .order_by(models.Booking.created_at.desc())
        .all()
    )

@router.get("/{booking_id}", response_model=schemas.BookingResponse)
def get_booking(
    booking_id: int,
    current_user: models.User = Depends(auth.require_roles(models.UserRole.USER)),
    db: Session = Depends(get_db),
):
    booking = db.query(models.Booking).filter(
        models.Booking.id == booking_id,
        models.Booking.user_id == current_user.id,
    ).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    return booking

@router.post("/{booking_id}/cancel", response_model=schemas.BookingResponse)
def cancel_booking(
    booking_id: int,
    background_tasks: BackgroundTasks,
    current_user: models.User = Depends(auth.require_roles(models.UserRole.USER)),
    db: Session = Depends(get_db)
):
    booking = (
        db.query(models.Booking)
        .filter(
            models.Booking.id == booking_id,
            models.Booking.user_id == current_user.id,
        )
        .first()
    )
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.booking_status not in (
        models.BookingStatus.PENDING,
        models.BookingStatus.CONFIRMED,
    ):
        raise HTTPException(status_code=400, detail="This booking cannot be cancelled")
    if (
        booking.booking_status == models.BookingStatus.CONFIRMED
        and booking.event.event_date <= datetime.utcnow()
    ):
        raise HTTPException(status_code=400, detail="Past events cannot be cancelled")

    cancellation = db.execute(
        update(models.Booking)
        .where(
            models.Booking.id == booking.id,
            models.Booking.user_id == current_user.id,
            models.Booking.booking_status.in_(
                [models.BookingStatus.PENDING, models.BookingStatus.CONFIRMED]
            ),
        )
        .values(booking_status=models.BookingStatus.CANCELLED)
    )
    if cancellation.rowcount != 1:
        raise HTTPException(status_code=409, detail="Booking has already been updated")

    db.execute(
        update(models.Event)
        .where(models.Event.id == booking.event_id)
        .values(available_tickets=models.Event.available_tickets + booking.ticket_quantity)
    )
    db.add(models.Notification(
        user_id=current_user.id,
        title="Booking Cancelled",
        message=f"Your booking for '{booking.event.title}' was cancelled.",
        type=models.NotificationType.BOOKING,
    ))
    if booking.event.organizer_id is not None:
        db.add(models.Notification(
            user_id=booking.event.organizer_id,
            title="Booking cancelled",
            message=(
                f"{current_user.username} cancelled booking #{booking.id} for "
                f"'{booking.event.title}' ({booking.ticket_quantity} ticket(s))."
            ),
            type=models.NotificationType.BOOKING,
        ))
    db.commit()
    db.refresh(booking.event)
    background_tasks.add_task(
        availability_connections.broadcast,
        booking.event.id,
        booking.event.available_tickets,
        booking.event.event_status.value,
    )
    db.refresh(booking)
    return booking