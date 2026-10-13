from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app import models, schemas, auth

router = APIRouter(prefix="/api/tickets", tags=["Tickets"])

@router.get("/my-tickets", response_model=List[schemas.TicketResponse])
def get_user_tickets(
    current_user: models.User = Depends(auth.require_roles(models.UserRole.USER)),
    db: Session = Depends(get_db)
):
    tickets = (
        db.query(models.Ticket)
        .join(models.Booking)
        .options(
            joinedload(models.Ticket.booking).joinedload(models.Booking.event)
        )
        .filter(
            models.Booking.user_id == current_user.id,
            models.Booking.booking_status == models.BookingStatus.CONFIRMED,
        )
        .order_by(models.Ticket.created_at.desc())
        .all()
    )
    return [
        {
            "id": ticket.id,
            "booking_id": ticket.booking_id,
            "ticket_code": ticket.ticket_code,
            "qr_code_url": ticket.qr_code_url,
            "created_at": ticket.created_at,
            "event": ticket.booking.event,
        }
        for ticket in tickets
    ]

@router.get("/verify/{ticket_code}")
def verify_ticket(ticket_code: str, db: Session = Depends(get_db)):
    ticket = (
        db.query(models.Ticket)
        .options(
            joinedload(models.Ticket.booking).joinedload(models.Booking.event)
        )
        .filter(models.Ticket.ticket_code == ticket_code)
        .first()
    )
    if not ticket:
        raise HTTPException(status_code=404, detail="Invalid ticket code")
    if ticket.booking.booking_status != models.BookingStatus.CONFIRMED:
        raise HTTPException(status_code=400, detail="Ticket is not valid for entry")
    if ticket.booking.event.event_status == models.EventStatus.CANCELLED:
        raise HTTPException(status_code=400, detail="The event has been cancelled")
    return {
        "valid": True,
        "ticket_code": ticket.ticket_code,
        "event_title": ticket.booking.event.title,
        "event_location": ticket.booking.event.location,
        "event_date": ticket.booking.event.event_date,
        "status": ticket.booking.booking_status
    }