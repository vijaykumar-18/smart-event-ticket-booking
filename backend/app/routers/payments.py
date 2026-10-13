import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

import stripe
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app import auth, models, schemas
from app.booking_utils import create_ticket_passes
from app.config import FRONTEND_URL, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
from app.database import get_db

router = APIRouter(prefix="/api/payments", tags=["Payments"])
logger = logging.getLogger(__name__)


def payment_result(payment: models.Payment, booking: models.Booking):
    return {"payment": payment, "booking": booking}


def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _reserve_coupon_usage(db: Session, payment: models.Payment, booking: models.Booking) -> None:
    if not booking.coupon_id or payment.coupon_usage_reserved:
        return
    now = utc_now()
    reservation = db.query(models.Coupon).filter(
        models.Coupon.id == booking.coupon_id,
        models.Coupon.is_active.is_(True),
        models.Coupon.expiry_date > now,
        or_(
            models.Coupon.usage_limit.is_(None),
            models.Coupon.used_count < models.Coupon.usage_limit,
        ),
    ).update(
        {models.Coupon.used_count: models.Coupon.used_count + 1},
        synchronize_session=False,
    )
    if reservation != 1:
        raise HTTPException(
            status_code=400,
            detail="This coupon is no longer available. Please create a new booking.",
        )
    payment.coupon_usage_reserved = True


def _release_coupon_reservation(db: Session, payment: models.Payment) -> None:
    if not payment.coupon_usage_reserved or not payment.booking.coupon_id:
        return
    db.query(models.Coupon).filter(
        models.Coupon.id == payment.booking.coupon_id,
        models.Coupon.used_count > 0,
    ).update(
        {models.Coupon.used_count: models.Coupon.used_count - 1},
        synchronize_session=False,
    )
    payment.coupon_usage_reserved = False


def _complete_payment(
    db: Session,
    payment: models.Payment,
    booking: models.Booking,
    transaction_id: str,
) -> None:
    if payment.payment_status == models.PaymentStatus.SUCCESS:
        return
    if booking.booking_status == models.BookingStatus.CANCELLED:
        raise HTTPException(status_code=409, detail="This booking has been cancelled.")

    if booking.coupon_id and not payment.coupon_usage_reserved:
        now = utc_now()
        coupon_usage = db.query(models.Coupon).filter(
            models.Coupon.id == booking.coupon_id,
            models.Coupon.is_active.is_(True),
            models.Coupon.expiry_date > now,
            or_(
                models.Coupon.usage_limit.is_(None),
                models.Coupon.used_count < models.Coupon.usage_limit,
            ),
        ).update(
            {models.Coupon.used_count: models.Coupon.used_count + 1},
            synchronize_session=False,
        )
        if coupon_usage != 1:
            raise HTTPException(
                status_code=409,
                detail="This coupon is no longer available. Contact support about the completed payment.",
            )

    payment.coupon_usage_reserved = False
    payment.payment_status = models.PaymentStatus.SUCCESS
    payment.transaction_id = transaction_id
    payment.failure_reason = None
    booking.booking_status = models.BookingStatus.CONFIRMED
    create_ticket_passes(db, booking)
    db.add(models.Notification(
        user_id=booking.user_id,
        title="Payment successful",
        message=(
            f"Payment of ₹{booking.final_amount:,.2f} for '{booking.event.title}' "
            f"succeeded (transaction {payment.transaction_id})."
        ),
        type=models.NotificationType.PAYMENT,
    ))
    db.add(models.Notification(
        user_id=booking.user_id,
        title="Booking Confirmed!",
        message=(
            f"You booked {booking.ticket_quantity} tickets for '{booking.event.title}'. "
            f"Total paid: ₹{booking.final_amount:,.2f}"
        ),
        type=models.NotificationType.BOOKING,
    ))
    if booking.event.organizer_id is not None:
        db.add(models.Notification(
            user_id=booking.event.organizer_id,
            title="New ticket booking",
            message=(
                f"{booking.user.username} booked {booking.ticket_quantity} ticket(s) "
                f"for '{booking.event.title}' (booking #{booking.id}). "
                f"Confirmed revenue: ₹{booking.final_amount:,.2f}."
            ),
            type=models.NotificationType.BOOKING,
        ))


def _stripe_session_for_id(session_id: str):
    try:
        return stripe.checkout.Session.retrieve(session_id, api_key=STRIPE_SECRET_KEY)
    except stripe.StripeError as exc:
        logger.warning("Stripe Checkout session lookup failed: %s", type(exc).__name__)
        raise HTTPException(
            status_code=502,
            detail="Unable to verify the Stripe checkout session. Please try again.",
        ) from exc


def _complete_stripe_session(
    db: Session,
    session,
    booking: models.Booking,
    payment: models.Payment,
) -> None:
    if session.payment_status != "paid":
        raise HTTPException(status_code=409, detail="Stripe has not confirmed this payment yet.")
    expected_amount = round(float(payment.amount) * 100)
    if session.currency != "inr" or session.amount_total != expected_amount:
        raise HTTPException(status_code=400, detail="Stripe payment amount does not match this booking.")
    payment_intent = session.payment_intent
    transaction_id = f"STRIPE-{payment_intent or session.id}"
    _complete_payment(db, payment, booking, transaction_id)
    db.commit()
    db.refresh(payment)
    db.refresh(booking)


@router.get("/config", response_model=schemas.PaymentConfig)
def payment_config():
    return {"stripe_enabled": bool(STRIPE_SECRET_KEY)}


@router.post("/bookings/{booking_id}/checkout", response_model=schemas.PaymentResult)
def checkout(
    booking_id: int,
    payload: schemas.PaymentCreate,
    current_user: models.User = Depends(auth.require_roles(models.UserRole.USER)),
    db: Session = Depends(get_db),
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
    if booking.booking_status == models.BookingStatus.CANCELLED:
        raise HTTPException(status_code=400, detail="This booking has been cancelled.")
    if STRIPE_SECRET_KEY and booking.final_amount > 0:
        raise HTTPException(
            status_code=400,
            detail="Use Stripe Checkout to complete this payment.",
        )

    latest_payment = (
        db.query(models.Payment)
        .filter(models.Payment.booking_id == booking.id)
        .order_by(models.Payment.created_at.desc(), models.Payment.id.desc())
        .first()
    )
    if latest_payment and latest_payment.payment_status == models.PaymentStatus.SUCCESS:
        return payment_result(latest_payment, booking)

    if latest_payment and latest_payment.payment_status == models.PaymentStatus.PENDING:
        payment = latest_payment
        payment.payment_method = payload.payment_method
        payment.amount = booking.final_amount
    else:
        payment = models.Payment(
            booking_id=booking.id,
            payment_method=payload.payment_method,
            payment_status=models.PaymentStatus.PENDING,
            amount=booking.final_amount,
        )
        db.add(payment)
        db.flush()

    failure_reason = None
    if payload.simulate_failure:
        failure_reason = "The simulated payment was declined."
    elif (
        booking.event.event_status != models.EventStatus.UPCOMING
        or booking.event.event_date <= utc_now()
    ):
        failure_reason = "This event is no longer available for booking."
    elif booking.coupon_id:
        now = utc_now()
        coupon_available = db.query(models.Coupon.id).filter(
            models.Coupon.id == booking.coupon_id,
            models.Coupon.is_active.is_(True),
            models.Coupon.expiry_date > now,
            or_(
                models.Coupon.usage_limit.is_(None),
                models.Coupon.used_count < models.Coupon.usage_limit,
            ),
        ).first()
        if not coupon_available:
            failure_reason = "This coupon is no longer available. Please create a new booking."

    if failure_reason:
        payment.payment_status = models.PaymentStatus.FAILED
        payment.failure_reason = failure_reason
        db.add(models.Notification(
            user_id=current_user.id,
            title="Payment failed",
            message=f"Payment for booking #{booking.id} failed: {failure_reason}",
            type=models.NotificationType.PAYMENT,
        ))
        db.commit()
        db.refresh(payment)
        db.refresh(booking)
        return payment_result(payment, booking)

    _complete_payment(
        db,
        payment,
        booking,
        f"SMT-{uuid.uuid4().hex.upper()}",
    )
    db.commit()
    db.refresh(payment)
    db.refresh(booking)
    return payment_result(payment, booking)


@router.post(
    "/bookings/{booking_id}/stripe-checkout",
    response_model=schemas.StripeCheckoutResponse,
)
def create_stripe_checkout(
    booking_id: int,
    current_user: models.User = Depends(auth.require_roles(models.UserRole.USER)),
    db: Session = Depends(get_db),
):
    if not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=503, detail="Stripe payments are not configured.")
    booking = db.query(models.Booking).filter(
        models.Booking.id == booking_id,
        models.Booking.user_id == current_user.id,
    ).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found.")
    if booking.booking_status != models.BookingStatus.PENDING:
        raise HTTPException(status_code=400, detail="This booking is not awaiting payment.")
    if (
        booking.event.event_status != models.EventStatus.UPCOMING
        or booking.event.event_date <= utc_now()
    ):
        raise HTTPException(status_code=400, detail="This event is no longer available for booking.")
    if booking.final_amount <= 0:
        raise HTTPException(status_code=400, detail="No Stripe payment is required for this booking.")

    payment = (
        db.query(models.Payment)
        .filter(models.Payment.booking_id == booking.id)
        .order_by(models.Payment.created_at.desc(), models.Payment.id.desc())
        .first()
    )
    if payment and payment.payment_status == models.PaymentStatus.SUCCESS:
        raise HTTPException(status_code=400, detail="This booking has already been paid.")
    if payment and payment.payment_status == models.PaymentStatus.PENDING and payment.stripe_checkout_session_id:
        existing_session = _stripe_session_for_id(payment.stripe_checkout_session_id)
        if existing_session.status == "open" and existing_session.url:
            return {
                "checkout_url": existing_session.url,
                "session_id": existing_session.id,
            }
        if existing_session.status == "complete":
            _complete_stripe_session(db, existing_session, booking, payment)
            return {"checkout_url": None, "session_id": existing_session.id}
        _release_coupon_reservation(db, payment)
        payment.payment_status = models.PaymentStatus.FAILED
        payment.failure_reason = "The Stripe checkout session expired."

    if not payment or payment.payment_status != models.PaymentStatus.PENDING:
        payment = models.Payment(
            booking_id=booking.id,
            payment_method="STRIPE",
            payment_status=models.PaymentStatus.PENDING,
            amount=booking.final_amount,
        )
        db.add(payment)
        db.flush()
    else:
        payment.payment_method = "STRIPE"
        payment.amount = booking.final_amount

    try:
        _reserve_coupon_usage(db, payment, booking)
        session = stripe.checkout.Session.create(
            mode="payment",
            customer_email=current_user.email,
            line_items=[{
                "price_data": {
                    "currency": "inr",
                    "unit_amount": round(float(booking.final_amount) * 100),
                    "product_data": {
                        "name": booking.event.title,
                        "description": f"{booking.ticket_quantity} event ticket(s)",
                    },
                },
                "quantity": 1,
            }],
            metadata={
                "booking_id": str(booking.id),
                "payment_id": str(payment.id),
            },
            success_url=(
                f"{FRONTEND_URL}/payment/{booking.id}"
                "?session_id={CHECKOUT_SESSION_ID}"
            ),
            cancel_url=f"{FRONTEND_URL}/payment/{booking.id}?cancelled=1",
            api_key=STRIPE_SECRET_KEY,
        )
    except stripe.StripeError as exc:
        db.rollback()
        logger.warning("Stripe Checkout session creation failed: %s", type(exc).__name__)
        raise HTTPException(
            status_code=502,
            detail="Unable to start Stripe checkout. Please try again.",
        ) from exc
    except HTTPException:
        db.rollback()
        raise

    payment.stripe_checkout_session_id = session.id
    db.commit()
    return {"checkout_url": session.url, "session_id": session.id}


@router.post(
    "/bookings/{booking_id}/stripe-confirm",
    response_model=schemas.PaymentResult,
)
def confirm_stripe_checkout(
    booking_id: int,
    payload: schemas.StripeCheckoutConfirm,
    current_user: models.User = Depends(auth.require_roles(models.UserRole.USER)),
    db: Session = Depends(get_db),
):
    booking = db.query(models.Booking).filter(
        models.Booking.id == booking_id,
        models.Booking.user_id == current_user.id,
    ).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found.")
    payment = db.query(models.Payment).filter(
        models.Payment.booking_id == booking.id,
        models.Payment.stripe_checkout_session_id == payload.session_id,
    ).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Stripe checkout session not found.")
    session = _stripe_session_for_id(payload.session_id)
    if session.metadata.get("booking_id") != str(booking.id):
        raise HTTPException(status_code=400, detail="Stripe session does not match this booking.")
    _complete_stripe_session(db, session, booking, payment)
    return payment_result(payment, booking)


@router.post("/stripe-webhook")
async def stripe_webhook(
    request: Request,
    stripe_signature: Optional[str] = Header(default=None, alias="Stripe-Signature"),
    db: Session = Depends(get_db),
):
    if not STRIPE_WEBHOOK_SECRET:
        raise HTTPException(status_code=503, detail="Stripe webhooks are not configured.")
    if not stripe_signature:
        raise HTTPException(status_code=400, detail="Missing Stripe signature.")
    try:
        event = stripe.Webhook.construct_event(
            await request.body(),
            stripe_signature,
            STRIPE_WEBHOOK_SECRET,
        )
    except (ValueError, stripe.SignatureVerificationError) as exc:
        raise HTTPException(status_code=400, detail="Invalid Stripe webhook signature.") from exc

    session = event.data.object
    payment = db.query(models.Payment).filter(
        models.Payment.stripe_checkout_session_id == session.id
    ).first()
    if not payment:
        return {"received": True}
    booking = db.query(models.Booking).filter(
        models.Booking.id == payment.booking_id
    ).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking for Stripe session not found.")

    if event.type in ("checkout.session.completed", "checkout.session.async_payment_succeeded"):
        if session.payment_status == "paid":
            _complete_stripe_session(db, session, booking, payment)
    elif event.type in ("checkout.session.expired", "checkout.session.async_payment_failed"):
        _release_coupon_reservation(db, payment)
        if payment.payment_status == models.PaymentStatus.PENDING:
            payment.payment_status = models.PaymentStatus.FAILED
            payment.failure_reason = "The Stripe checkout session expired or payment failed."
        db.commit()
    return {"received": True}
