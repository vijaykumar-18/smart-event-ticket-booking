from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app import models


def sync_event_statuses(db: Session) -> None:
    now = datetime.utcnow()
    events = db.query(models.Event).filter(
        models.Event.event_status != models.EventStatus.CANCELLED
    ).all()
    changed = False
    for event in events:
        end_date = event.event_end_date or event.event_date + timedelta(hours=4)
        if now < event.event_date:
            status = models.EventStatus.UPCOMING
        elif now < end_date:
            status = models.EventStatus.ONGOING
        else:
            status = models.EventStatus.COMPLETED
        if event.event_status != status:
            event.event_status = status
            changed = True
    if changed:
        db.commit()


def notify_event_bookers(db: Session, event: models.Event, title: str, message: str) -> None:
    user_ids = (
        db.query(models.Booking.user_id)
        .filter(
            models.Booking.event_id == event.id,
            models.Booking.booking_status.in_(
                [models.BookingStatus.CONFIRMED, models.BookingStatus.PENDING]
            ),
        )
        .distinct()
        .all()
    )
    db.add_all(
        models.Notification(
            user_id=user_id,
            title=title,
            message=message,
            type=models.NotificationType.EVENT,
        )
        for (user_id,) in user_ids
    )
