from typing import List

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import auth, models, schemas
from app.database import get_db
from app.event_lifecycle import notify_event_bookers
from app.realtime import availability_connections


router = APIRouter(prefix="/api/events", tags=["Event Updates"])


@router.get("/{event_id}/updates", response_model=List[schemas.EventAnnouncementResponse])
def get_event_updates(event_id: int, db: Session = Depends(get_db)):
    event = db.query(models.Event.id).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found.")
    return (
        db.query(models.EventUpdate)
        .filter(models.EventUpdate.event_id == event_id)
        .order_by(models.EventUpdate.created_at.desc())
        .all()
    )


@router.post(
    "/{event_id}/updates",
    response_model=schemas.EventAnnouncementResponse,
    status_code=status.HTTP_201_CREATED,
)
def post_event_update(
    event_id: int,
    payload: schemas.EventAnnouncementCreate,
    background_tasks: BackgroundTasks,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found.")
    if current_user.role == models.UserRole.ORGANIZER and event.organizer_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only update your own events.")
    if current_user.role not in (models.UserRole.ORGANIZER, models.UserRole.ADMIN):
        raise HTTPException(status_code=403, detail="Only organizers and admins can post event updates.")

    update = models.EventUpdate(
        event_id=event.id,
        message=payload.message.strip(),
        is_important=payload.is_important,
    )
    db.add(update)
    notify_event_bookers(db, event, "Live event update", f"{event.title}: {payload.message.strip()}")
    db.commit()
    db.refresh(update)
    background_tasks.add_task(
        availability_connections.broadcast_announcement,
        event.id,
        schemas.EventAnnouncementResponse.model_validate(update).model_dump(mode="json"),
    )
    return update