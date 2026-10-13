from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app import auth, models, schemas
from app.database import get_db

router = APIRouter(tags=["Reviews"])


@router.get(
    "/api/events/{event_id}/reviews",
    response_model=schemas.EventReviewsResponse,
)
def get_event_reviews(event_id: int, db: Session = Depends(get_db)):
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    reviews = (
        db.query(models.Review)
        .options(joinedload(models.Review.user))
        .filter(models.Review.event_id == event_id)
        .order_by(models.Review.created_at.desc())
        .all()
    )
    average = db.query(func.avg(models.Review.rating)).filter(
        models.Review.event_id == event_id
    ).scalar()
    return {
        "average_rating": round(average, 2) if average is not None else None,
        "review_count": len(reviews),
        "reviews": [schemas.ReviewResponse.from_review(review) for review in reviews],
    }


def require_attended_event(
    db: Session,
    user_id: int,
    event_id: int,
) -> models.Event:
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    attended_until = event.event_end_date or event.event_date
    if (
        event.event_status == models.EventStatus.CANCELLED
        or attended_until > datetime.utcnow()
        or not db.query(models.Booking.id).filter(
            models.Booking.user_id == user_id,
            models.Booking.event_id == event_id,
            models.Booking.booking_status == models.BookingStatus.CONFIRMED,
        ).first()
    ):
        raise HTTPException(
            status_code=403,
            detail="Only users with a confirmed booking for a completed event can review it.",
        )
    return event


@router.post(
    "/api/events/{event_id}/reviews",
    response_model=schemas.ReviewResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_review(
    event_id: int,
    payload: schemas.ReviewCreate,
    current_user: models.User = Depends(auth.require_roles(models.UserRole.USER)),
    db: Session = Depends(get_db),
):
    require_attended_event(db, current_user.id, event_id)
    if db.query(models.Review.id).filter(
        models.Review.user_id == current_user.id,
        models.Review.event_id == event_id,
    ).first():
        raise HTTPException(status_code=409, detail="You have already reviewed this event.")
    review = models.Review(
        user_id=current_user.id,
        event_id=event_id,
        rating=payload.rating,
        review_text=payload.review_text.strip(),
    )
    db.add(review)
    db.commit()
    db.refresh(review)
    review.user = current_user
    return schemas.ReviewResponse.from_review(review)


@router.put("/api/reviews/{review_id}", response_model=schemas.ReviewResponse)
def update_review(
    review_id: int,
    payload: schemas.ReviewCreate,
    current_user: models.User = Depends(auth.require_roles(models.UserRole.USER)),
    db: Session = Depends(get_db),
):
    review = db.query(models.Review).filter(
        models.Review.id == review_id,
        models.Review.user_id == current_user.id,
    ).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    require_attended_event(db, current_user.id, review.event_id)
    review.rating = payload.rating
    review.review_text = payload.review_text.strip()
    db.commit()
    db.refresh(review)
    review.user = current_user
    return schemas.ReviewResponse.from_review(review)


@router.delete("/api/reviews/{review_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_review(
    review_id: int,
    current_user: models.User = Depends(auth.require_roles(models.UserRole.USER)),
    db: Session = Depends(get_db),
):
    review = db.query(models.Review).filter(
        models.Review.id == review_id,
        models.Review.user_id == current_user.id,
    ).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    db.delete(review)
    db.commit()
