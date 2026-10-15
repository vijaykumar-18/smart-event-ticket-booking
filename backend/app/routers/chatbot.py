import json
import urllib.error
import urllib.request
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import auth, models, schemas
from app.config import CHATBOT_API_KEY, CHATBOT_BASE_URL, CHATBOT_MODEL
from app.database import get_db


router = APIRouter(prefix="/api/chat", tags=["Chat Assistant"])
EVENT_CATEGORIES = ("Music", "Tech", "Sports", "Business", "Food & Drink")
EVENT_LOCATIONS = (
    "Mumbai", "Chennai", "Hyderabad", "Pune", "Goa", "Kolkata", "Delhi",
    "Ahmedabad", "Bengaluru", "Gurugram", "Jaipur", "Kochi",
)


def _ai_answer(message: str, history: list[schemas.ChatMessage], event_context: str) -> Optional[str]:
    if not CHATBOT_API_KEY:
        return None
    messages = [{
        "role": "system",
        "content": (
            "You are SmartEvent's concise event discovery and support assistant. "
            "Only recommend events present in the supplied catalog context. Do not claim "
            "to access or change bookings. For account-specific issues, direct users to "
            "Bookings or Notifications.\n" + event_context
        ),
    }]
    messages.extend({"role": item.role, "content": item.content} for item in history[-8:])
    messages.append({"role": "user", "content": message})
    payload = json.dumps({"model": CHATBOT_MODEL, "messages": messages, "temperature": 0.3}).encode()
    request = urllib.request.Request(
        f"{CHATBOT_BASE_URL}/chat/completions",
        data=payload,
        headers={
            "Authorization": f"Bearer {CHATBOT_API_KEY}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            result = json.loads(response.read().decode())
        answer = result["choices"][0]["message"]["content"]
        return answer.strip() if isinstance(answer, str) and answer.strip() else None
    except (urllib.error.URLError, TimeoutError, ValueError, KeyError, IndexError):
        return None


@router.post("", response_model=schemas.ChatResponse)
def chat(
    payload: schemas.ChatRequest,
    current_user: Optional[models.User] = Depends(auth.get_optional_current_user),
    db: Session = Depends(get_db),
):
    message = payload.message.strip()
    lowered = message.lower()

    if any(term in lowered for term in ("my booking", "my bookings", "my ticket", "my tickets", "my order")):
        if not current_user or current_user.role != models.UserRole.USER:
            return {
                "response": "Sign in as an attendee to view your bookings.",
                "events": [],
            }
        bookings = db.query(models.Booking).join(models.Event).filter(
            models.Booking.user_id == current_user.id,
        ).order_by(models.Booking.created_at.desc()).limit(5).all()
        if not bookings:
            return {"response": "You do not have any bookings yet. Browse upcoming events to get started.", "events": []}
        details = [
            f"{booking.event.title}: {booking.ticket_quantity} ticket(s), {booking.booking_status.value.lower()}"
            for booking in bookings
        ]
        return {"response": "Your recent bookings: " + "; ".join(details) + ".", "events": []}

    if any(term in lowered for term in ("ticket issue", "ticket problem", "refund", "qr code", "payment issue", "can't find my ticket")):
        return {
            "response": (
                "For a ticket or QR issue, open Bookings to check payment status, then Tickets "
                "to view confirmed passes. Payment or booking updates are also in Notifications. "
                "If a payment was charged but no booking is confirmed, contact the event organizer."
            ),
            "events": [],
        }

    is_weekend = "weekend" in lowered or "this saturday" in lowered or "this sunday" in lowered
    category = next((item for item in EVENT_CATEGORIES if item.lower() in lowered), None)
    location = next((item for item in EVENT_LOCATIONS if item.lower() in lowered), None)
    if not location and ("near me" in lowered or "nearby" in lowered) and current_user:
        location = current_user.location

    query = db.query(models.Event).filter(
        models.Event.event_status == models.EventStatus.UPCOMING,
    )
    if category:
        query = query.filter(models.Event.category == category)
    if location:
        query = query.filter(models.Event.location.ilike(f"%{location}%"))
    if is_weekend:
        now = datetime.utcnow()
        days_until_saturday = (5 - now.weekday()) % 7
        saturday = (now + timedelta(days=days_until_saturday)).replace(hour=0, minute=0, second=0, microsecond=0)
        sunday_end = saturday + timedelta(days=2)
        query = query.filter(models.Event.event_date >= saturday, models.Event.event_date < sunday_end)

    sales = (
        select(func.coalesce(func.sum(models.Booking.ticket_quantity), 0))
        .where(
            models.Booking.event_id == models.Event.id,
            models.Booking.booking_status == models.BookingStatus.CONFIRMED,
        )
        .correlate(models.Event)
        .scalar_subquery()
    )
    events = query.order_by(sales.desc(), models.Event.event_date.asc()).limit(5).all()
    if ("near me" in lowered or "nearby" in lowered) and not location:
        return {
            "response": "Add a city to your profile or include a city name, and I can find nearby events.",
            "events": [],
        }
    if not events:
        return {"response": "I couldn't find matching upcoming events. Try another category, city, or date.", "events": []}

    event_context = "Catalog results: " + "; ".join(
        f"{event.title} | {event.category} | {event.location} | "
        f"{event.event_date.isoformat()} | INR {event.ticket_price:.2f} | "
        f"{event.available_tickets} available"
        for event in events
    )
    ai_response = _ai_answer(message, payload.history, event_context)
    if ai_response:
        response = ai_response
    elif "trending" in lowered or "popular" in lowered:
        response = "Here are the most popular upcoming events. Select one to see details and book tickets."
    elif is_weekend:
        response = "Here are matching events this weekend. Select one to see details and book tickets."
    elif location:
        response = f"Here are upcoming events in or near {location}. Select one to see details and book tickets."
    elif category:
        response = f"Here are upcoming {category} events. Select one to see details and book tickets."
    else:
        response = "Here are some popular upcoming events. Select one to see details and book tickets."
    return {"response": response, "events": events}