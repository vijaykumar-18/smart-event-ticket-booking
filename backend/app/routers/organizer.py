from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import case, func
from sqlalchemy.orm import Session, joinedload

from app import auth, models, schemas
from app.database import get_db
from app.event_lifecycle import notify_event_bookers, sync_event_statuses

router = APIRouter(
    prefix="/api/organizer",
    tags=["Organizer"],
    dependencies=[Depends(auth.require_roles(models.UserRole.ORGANIZER))],
)


def owned_event(db: Session, event_id: int, organizer_id: int) -> models.Event:
    event = db.query(models.Event).filter(
        models.Event.id == event_id,
        models.Event.organizer_id == organizer_id,
    ).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return event


@router.post("/events", response_model=schemas.EventResponse, status_code=status.HTTP_201_CREATED)
def create_event(
    payload: schemas.EventCreate,
    current_user: models.User = Depends(auth.require_roles(models.UserRole.ORGANIZER)),
    db: Session = Depends(get_db),
):
    event = models.Event(
        **payload.model_dump(),
        organizer_id=current_user.id,
        available_tickets=payload.total_tickets,
        event_status=models.EventStatus.UPCOMING,
    )
    db.add(event)
    db.commit()
    sync_event_statuses(db)
    db.refresh(event)
    return event


@router.get("/events", response_model=List[schemas.EventResponse])
def get_organizer_events(
    current_user: models.User = Depends(auth.require_roles(models.UserRole.ORGANIZER)),
    db: Session = Depends(get_db),
):
    sync_event_statuses(db)
    return db.query(models.Event).filter(
        models.Event.organizer_id == current_user.id
    ).order_by(models.Event.event_date.asc()).all()


@router.put("/events/{event_id}", response_model=schemas.EventResponse)
def update_event(
    event_id: int,
    payload: schemas.EventUpdate,
    current_user: models.User = Depends(auth.require_roles(models.UserRole.ORGANIZER)),
    db: Session = Depends(get_db),
):
    event = owned_event(db, event_id, current_user.id)
    changes = payload.model_dump(exclude_unset=True)
    if "total_tickets" in changes:
        confirmed_tickets = db.query(
            func.coalesce(func.sum(models.Booking.ticket_quantity), 0)
        ).filter(
            models.Booking.event_id == event.id,
            models.Booking.booking_status == models.BookingStatus.CONFIRMED,
        ).scalar()
        if changes["total_tickets"] < confirmed_tickets:
            raise HTTPException(
                status_code=400,
                detail="Total tickets cannot be lower than tickets already sold",
            )
        changes["available_tickets"] = changes["total_tickets"] - confirmed_tickets

    new_start = changes.get("event_date", event.event_date)
    new_end = changes.get("event_end_date", event.event_end_date)
    if new_end is not None and new_end <= new_start:
        raise HTTPException(status_code=400, detail="Event end date must be after the start date")

    changed_fields = [
        field for field, value in changes.items()
        if getattr(event, field) != value
    ]
    for field in changed_fields:
        setattr(event, field, changes[field])
    if changed_fields:
        notify_event_bookers(
            db,
            event,
            "Event updated",
            f"'{event.title}' has been updated. Check the event page for the latest details.",
        )
    db.commit()
    sync_event_statuses(db)
    db.refresh(event)
    return event


@router.post("/events/{event_id}/cancel", response_model=schemas.EventResponse)
def cancel_event(
    event_id: int,
    current_user: models.User = Depends(auth.require_roles(models.UserRole.ORGANIZER)),
    db: Session = Depends(get_db),
):
    event = owned_event(db, event_id, current_user.id)
    if event.event_status == models.EventStatus.CANCELLED:
        raise HTTPException(status_code=400, detail="Event is already cancelled")
    event.event_status = models.EventStatus.CANCELLED
    notify_event_bookers(
        db,
        event,
        "Event cancelled",
        f"'{event.title}' has been cancelled by the organizer.",
    )
    db.query(models.Booking).filter(
        models.Booking.event_id == event.id,
        models.Booking.booking_status.in_(
            [models.BookingStatus.PENDING, models.BookingStatus.CONFIRMED]
        ),
    ).update(
        {models.Booking.booking_status: models.BookingStatus.CANCELLED},
        synchronize_session=False,
    )
    db.commit()
    db.refresh(event)
    return event


@router.get("/events/{event_id}/bookings", response_model=List[schemas.OrganizerBookingResponse])
def get_event_bookings(
    event_id: int,
    current_user: models.User = Depends(auth.require_roles(models.UserRole.ORGANIZER)),
    db: Session = Depends(get_db),
):
    owned_event(db, event_id, current_user.id)
    return (
        db.query(models.Booking)
        .options(joinedload(models.Booking.event), joinedload(models.Booking.user))
        .filter(models.Booking.event_id == event_id)
        .order_by(models.Booking.created_at.desc())
        .all()
    )


@router.get("/bookings", response_model=List[schemas.OrganizerBookingResponse])
def get_organizer_bookings(
    current_user: models.User = Depends(auth.require_roles(models.UserRole.ORGANIZER)),
    db: Session = Depends(get_db),
):
    return (
        db.query(models.Booking)
        .join(models.Event, models.Booking.event_id == models.Event.id)
        .options(joinedload(models.Booking.event), joinedload(models.Booking.user))
        .filter(models.Event.organizer_id == current_user.id)
        .order_by(models.Booking.created_at.desc())
        .limit(100)
        .all()
    )


@router.get("/analytics", response_model=List[schemas.EventAnalytics])
def get_event_analytics(
    current_user: models.User = Depends(auth.require_roles(models.UserRole.ORGANIZER)),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(
            models.Event.id,
            models.Event.title,
            models.Event.total_tickets,
            models.Event.available_tickets,
            func.coalesce(func.sum(
                case(
                    (models.Booking.booking_status == models.BookingStatus.CONFIRMED,
                     models.Booking.ticket_quantity),
                    else_=0,
                )
            ), 0),
            func.coalesce(func.sum(
                case(
                    (models.Booking.booking_status == models.BookingStatus.CONFIRMED,
                     models.Booking.final_amount),
                    else_=0,
                )
            ), 0            ),
            func.count(models.Booking.id),
            func.coalesce(func.sum(models.Booking.ticket_quantity), 0),
            func.sum(case(
                (models.Booking.booking_status == models.BookingStatus.CONFIRMED, 1),
                else_=0,
            )),
            func.sum(case(
                (models.Booking.booking_status == models.BookingStatus.CANCELLED, 1),
                else_=0,
            )),
            func.sum(case(
                (models.Booking.booking_status == models.BookingStatus.PENDING, 1),
                else_=0,
            )),
            func.coalesce(func.sum(case(
                (models.Booking.booking_status == models.BookingStatus.CONFIRMED,
                 models.Booking.ticket_quantity),
                else_=0,
            )), 0),
            func.coalesce(func.sum(case(
                (models.Booking.booking_status == models.BookingStatus.CANCELLED,
                 models.Booking.ticket_quantity),
                else_=0,
            )), 0),
            func.coalesce(func.sum(case(
                (models.Booking.booking_status == models.BookingStatus.PENDING,
                 models.Booking.ticket_quantity),
                else_=0,
            )), 0),
        )
        .outerjoin(models.Booking, models.Booking.event_id == models.Event.id)
        .filter(models.Event.organizer_id == current_user.id)
        .group_by(models.Event.id)
        .all()
    )
    return [
        {
            "event_id": row[0],
            "event_title": row[1],
            "remaining_tickets": row[3],
            "tickets_sold": int(row[4]),
            "revenue": float(row[5]),
            "booking_count": int(row[6]),
            "tickets_booked": int(row[7]),
            "confirmed_bookings": int(row[8] or 0),
            "cancelled_bookings": int(row[9] or 0),
            "pending_bookings": int(row[10] or 0),
            "confirmed_tickets": int(row[11]),
            "cancelled_tickets": int(row[12]),
            "pending_tickets": int(row[13]),
            "total_tickets": int(row[2]),
        }
        for row in rows
    ]
