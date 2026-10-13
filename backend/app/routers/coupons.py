from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import auth, models, schemas
from app.booking_utils import calculate_coupon_quote
from app.database import get_db

router = APIRouter(prefix="/api/coupons", tags=["Coupons"])
COUPON_MANAGERS = (models.UserRole.ADMIN, models.UserRole.ORGANIZER)


@router.post(
    "/validate",
    response_model=schemas.CouponQuote,
    dependencies=[Depends(auth.require_roles(models.UserRole.USER))],
)
def validate_coupon(
    payload: schemas.CouponValidate,
    db: Session = Depends(get_db),
):
    event = db.query(models.Event).filter(models.Event.id == payload.event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if event.event_status != models.EventStatus.UPCOMING:
        raise HTTPException(status_code=400, detail="Coupons can only be used for upcoming events.")
    if payload.ticket_quantity > event.available_tickets:
        raise HTTPException(status_code=400, detail="Not enough tickets are available.")
    return calculate_coupon_quote(
        db, payload.coupon_code, event, payload.ticket_quantity
    )


@router.get("", response_model=list[schemas.CouponResponse])
def list_coupons(
    current_user: models.User = Depends(auth.require_roles(*COUPON_MANAGERS)),
    db: Session = Depends(get_db),
):
    query = db.query(models.Coupon)
    if current_user.role == models.UserRole.ORGANIZER:
        query = query.filter(models.Coupon.organizer_id == current_user.id)
    return query.order_by(models.Coupon.created_at.desc()).all()


@router.post("", response_model=schemas.CouponResponse, status_code=201)
def create_coupon(
    payload: schemas.CouponCreate,
    current_user: models.User = Depends(auth.require_roles(*COUPON_MANAGERS)),
    db: Session = Depends(get_db),
):
    coupon_data = payload.model_dump()
    if current_user.role == models.UserRole.ORGANIZER:
        if payload.event_id is None:
            raise HTTPException(status_code=400, detail="Choose an event for this coupon.")
        event = db.query(models.Event).filter(
            models.Event.id == payload.event_id,
            models.Event.organizer_id == current_user.id,
        ).first()
        if not event:
            raise HTTPException(status_code=404, detail="Event not found.")
        if event.event_status != models.EventStatus.UPCOMING:
            raise HTTPException(status_code=400, detail="Coupons can only be created for upcoming events.")
        coupon_data["organizer_id"] = current_user.id
    elif payload.event_id is not None and not db.query(models.Event.id).filter(
        models.Event.id == payload.event_id
    ).first():
        raise HTTPException(status_code=404, detail="Event not found.")
    if db.query(models.Coupon.id).filter(
        models.Coupon.coupon_code == payload.coupon_code
    ).first():
        raise HTTPException(status_code=409, detail="A coupon with this code already exists.")
    coupon = models.Coupon(**coupon_data)
    db.add(coupon)
    db.commit()
    db.refresh(coupon)
    return coupon


@router.patch("/{coupon_id}/active", response_model=schemas.CouponResponse)
def set_coupon_active(
    coupon_id: int,
    is_active: bool,
    current_user: models.User = Depends(auth.require_roles(*COUPON_MANAGERS)),
    db: Session = Depends(get_db),
):
    query = db.query(models.Coupon).filter(models.Coupon.id == coupon_id)
    if current_user.role == models.UserRole.ORGANIZER:
        query = query.filter(models.Coupon.organizer_id == current_user.id)
    coupon = query.first()
    if not coupon:
        raise HTTPException(status_code=404, detail="Coupon not found.")
    coupon.is_active = is_active
    db.commit()
    db.refresh(coupon)
    return coupon
