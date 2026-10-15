from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app import auth, models, schemas
from app.database import get_db


router = APIRouter(prefix="/api/wishlist", tags=["Wishlist"])


@router.get("", response_model=List[schemas.WishlistResponse])
def get_wishlist(
    current_user: models.User = Depends(auth.require_roles(models.UserRole.USER)),
    db: Session = Depends(get_db),
):
    return (
        db.query(models.Wishlist)
        .options(joinedload(models.Wishlist.event))
        .filter(models.Wishlist.user_id == current_user.id)
        .order_by(models.Wishlist.created_at.desc())
        .all()
    )


@router.post("/{event_id}", response_model=schemas.WishlistResponse, status_code=status.HTTP_201_CREATED)
def add_to_wishlist(
    event_id: int,
    current_user: models.User = Depends(auth.require_roles(models.UserRole.USER)),
    db: Session = Depends(get_db),
):
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found.")
    entry = db.query(models.Wishlist).filter(
        models.Wishlist.user_id == current_user.id,
        models.Wishlist.event_id == event_id,
    ).first()
    if entry:
        return entry
    entry = models.Wishlist(user_id=current_user.id, event_id=event_id)
    db.add(entry)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        entry = db.query(models.Wishlist).filter(
            models.Wishlist.user_id == current_user.id,
            models.Wishlist.event_id == event_id,
        ).first()
        if entry:
            return entry
        raise
    db.refresh(entry)
    return entry


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_from_wishlist(
    event_id: int,
    current_user: models.User = Depends(auth.require_roles(models.UserRole.USER)),
    db: Session = Depends(get_db),
):
    entry = db.query(models.Wishlist).filter(
        models.Wishlist.user_id == current_user.id,
        models.Wishlist.event_id == event_id,
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Wishlist entry not found.")
    db.delete(entry)
    db.commit()