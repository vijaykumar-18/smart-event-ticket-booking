import os
import uuid
from datetime import datetime

import qrcode
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app import models
from app.config import BASE_URL


def calculate_coupon_quote(
    db: Session,
    coupon_code: str,
    event: models.Event,
    ticket_quantity: int,
) -> dict:
    coupon = (
        db.query(models.Coupon)
        .filter(models.Coupon.coupon_code == coupon_code.strip().upper())
        .first()
    )
    if not coupon or not coupon.is_active:
        raise HTTPException(status_code=400, detail="This coupon code is invalid or inactive.")
    if coupon.event_id is not None and coupon.event_id != event.id:
        raise HTTPException(status_code=400, detail="This coupon is not valid for this event.")
    if coupon.expiry_date <= datetime.utcnow():
        raise HTTPException(status_code=400, detail="This coupon has expired.")
    if coupon.usage_limit is not None and coupon.used_count >= coupon.usage_limit:
        raise HTTPException(status_code=400, detail="This coupon has reached its usage limit.")

    subtotal = round(event.ticket_price * ticket_quantity, 2)
    if subtotal < coupon.minimum_booking_amount:
        raise HTTPException(
            status_code=400,
            detail=f"Minimum booking amount is ₹{coupon.minimum_booking_amount:,.2f}.",
        )

    if coupon.discount_type == models.DiscountType.PERCENTAGE:
        discount_amount = round(subtotal * coupon.discount_value / 100, 2)
    else:
        discount_amount = min(subtotal, coupon.discount_value)
    return {
        "coupon_id": coupon.id,
        "coupon_code": coupon.coupon_code,
        "subtotal": subtotal,
        "discount_amount": discount_amount,
        "final_amount": round(subtotal - discount_amount, 2),
    }


def create_ticket_passes(db: Session, booking: models.Booking) -> None:
    qr_folder = os.path.join("static", "qrcodes")
    os.makedirs(qr_folder, exist_ok=True)
    for _ in range(booking.ticket_quantity):
        ticket_code = f"TICK-{uuid.uuid4().hex[:10].upper()}"
        qr_filename = f"{ticket_code}.png"
        qr = qrcode.QRCode(version=1, box_size=8, border=2)
        qr.add_data(f"{BASE_URL.rstrip('/')}/api/tickets/verify/{ticket_code}")
        qr.make(fit=True)
        qr.make_image(fill_color="black", back_color="white").save(
            os.path.join(qr_folder, qr_filename)
        )
        db.add(models.Ticket(
            booking_id=booking.id,
            ticket_code=ticket_code,
            qr_code_url=f"/static/qrcodes/{qr_filename}",
        ))
