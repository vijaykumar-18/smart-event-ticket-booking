import asyncio
import re
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
from datetime import datetime, timedelta

from sqlalchemy import inspect, text
from app.database import Base, engine, SessionLocal
from app import models
from app.routers import (
    admin,
    auth,
    bookings,
    chatbot,
    coupons,
    event_updates,
    events,
    notifications,
    organizer,
    payments,
    reviews,
    tickets,
    wishlist,
)
from app.config import ALLOWED_ORIGINS, INITIAL_ADMIN_EMAIL
from app.event_lifecycle import sync_event_statuses

Base.metadata.create_all(bind=engine)

LEGACY_USD_TO_INR_RATE = 83.0

def migrate_existing_schema():
    inspector = inspect(engine)
    with engine.begin() as connection:
        user_columns = {column["name"] for column in inspector.get_columns("users")}
        event_columns = {column["name"] for column in inspector.get_columns("events")}
        booking_columns = {column["name"] for column in inspector.get_columns("bookings")}
        coupon_columns = {column["name"] for column in inspector.get_columns("coupons")}
        payment_columns = {column["name"] for column in inspector.get_columns("payments")}
        legacy_usd_prices = "venue" not in event_columns
        if "role" not in user_columns:
            connection.execute(text(
                "ALTER TABLE users ADD COLUMN role VARCHAR(16) NOT NULL DEFAULT 'USER'"
            ))
        if "location" not in user_columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN location VARCHAR(150)"))
        if "profile_picture_url" not in user_columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN profile_picture_url VARCHAR(500)"))
        if "organizer_id" not in event_columns:
            connection.execute(text(
                "ALTER TABLE events ADD COLUMN organizer_id INTEGER REFERENCES users(id)"
            ))
        if "event_end_date" not in event_columns:
            connection.execute(text(
                "ALTER TABLE events ADD COLUMN event_end_date TIMESTAMP"
            ))
        if "event_status" not in event_columns:
            connection.execute(text(
                "ALTER TABLE events ADD COLUMN event_status VARCHAR(16) NOT NULL DEFAULT 'UPCOMING'"
            ))
        if legacy_usd_prices:
            connection.execute(text(
                "ALTER TABLE events ADD COLUMN venue VARCHAR(150) NOT NULL DEFAULT 'Main venue'"
            ))
            connection.execute(text(
                "UPDATE events SET ticket_price = ROUND(ticket_price * :rate, 2)"
            ), {"rate": LEGACY_USD_TO_INR_RATE})
            connection.execute(text(
                "UPDATE bookings SET total_price = ROUND(total_price * :rate, 2)"
            ), {"rate": LEGACY_USD_TO_INR_RATE})
        if "coupon_id" not in booking_columns:
            connection.execute(text(
                "ALTER TABLE bookings ADD COLUMN coupon_id INTEGER REFERENCES coupons(id)"
            ))
        if "discount_amount" not in booking_columns:
            connection.execute(text(
                "ALTER TABLE bookings ADD COLUMN discount_amount FLOAT NOT NULL DEFAULT 0"
            ))
        if "final_amount" not in booking_columns:
            connection.execute(text(
                "ALTER TABLE bookings ADD COLUMN final_amount FLOAT NOT NULL DEFAULT 0"
            ))
            connection.execute(text(
                "UPDATE bookings SET final_amount = total_price"
            ))
        if "organizer_id" not in coupon_columns:
            connection.execute(text(
                "ALTER TABLE coupons ADD COLUMN organizer_id INTEGER REFERENCES users(id)"
            ))
        if "event_id" not in coupon_columns:
            connection.execute(text(
                "ALTER TABLE coupons ADD COLUMN event_id INTEGER REFERENCES events(id)"
            ))
        if "stripe_checkout_session_id" not in payment_columns:
            connection.execute(text(
                "ALTER TABLE payments ADD COLUMN stripe_checkout_session_id VARCHAR(255)"
            ))
            connection.execute(text(
                "CREATE UNIQUE INDEX IF NOT EXISTS "
                "ix_payments_stripe_checkout_session_id "
                "ON payments (stripe_checkout_session_id)"
            ))
        if "coupon_usage_reserved" not in payment_columns:
            connection.execute(text(
                "ALTER TABLE payments ADD COLUMN coupon_usage_reserved BOOLEAN "
                "NOT NULL DEFAULT 0"
            ))

def migrate_indian_event_listings():
    with engine.begin() as connection:
        connection.execute(text(
            "CREATE TABLE IF NOT EXISTS app_migrations ("
            "name VARCHAR(100) PRIMARY KEY, "
            "applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)"
        ))
        migrated = connection.execute(
            text("SELECT 1 FROM app_migrations WHERE name = :name"),
            {"name": "indian_event_listings_v4"},
        ).first()
        if migrated:
            return

        connection.execute(text(
            "UPDATE events SET "
            "location = CASE category "
            "WHEN 'Music' THEN 'Mumbai' "
            "WHEN 'Sports' THEN 'Ahmedabad' "
            "WHEN 'Tech' THEN 'Bengaluru' "
            "WHEN 'Business' THEN 'Hyderabad' "
            "WHEN 'Food & Drink' THEN 'Delhi' "
            "ELSE 'Mumbai' END, "
            "venue = CASE category "
            "WHEN 'Music' THEN 'Mahalaxmi Racecourse' "
            "WHEN 'Sports' THEN 'Narendra Modi Stadium' "
            "WHEN 'Tech' THEN 'Bangalore International Exhibition Centre' "
            "WHEN 'Business' THEN 'HITEX Exhibition Centre' "
            "WHEN 'Food & Drink' THEN 'Dilli Haat' "
            "ELSE 'Jio World Convention Centre' END, "
            "banner_image = CASE category "
            "WHEN 'Music' THEN 'https://images.unsplash.com/photo-1506157786151-b8491531f063?w=1200&auto=format&fit=crop&q=80' "
            "WHEN 'Sports' THEN 'https://images.unsplash.com/photo-1531415074968-036ba1b575da?w=1200&auto=format&fit=crop&q=80' "
            "WHEN 'Tech' THEN 'https://images.unsplash.com/photo-1521737711867-e3b97375f902?w=1200&auto=format&fit=crop&q=80' "
            "WHEN 'Food & Drink' THEN 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=1200&auto=format&fit=crop&q=80' "
            "ELSE 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=1200&auto=format&fit=crop&q=80' END "
            "WHERE location NOT IN ("
            "'Mumbai', 'Chennai', 'Hyderabad', 'Pune', 'Goa', 'Kolkata', "
            "'Delhi', 'Ahmedabad', 'Bengaluru', 'Gurugram', 'Jaipur', 'Kochi'"
            ") OR venue IS NULL OR TRIM(venue) = '' OR venue = 'Main venue' "
            "OR (organizer_id IS NULL AND ("
            "(category = 'Music' AND (location != 'Mumbai' OR venue != 'Mahalaxmi Racecourse')) "
            "OR (category = 'Sports' AND (location != 'Ahmedabad' OR venue != 'Narendra Modi Stadium')) "
            "OR (category = 'Tech' AND (location != 'Bengaluru' OR venue != 'Bangalore International Exhibition Centre')) "
            "OR (category = 'Business' AND (location != 'Hyderabad' OR venue != 'HITEX Exhibition Centre')) "
            "OR (category = 'Food & Drink' AND (location != 'Delhi' OR venue != 'Dilli Haat'))"
            "))"
        ))
        connection.execute(
            text("INSERT INTO app_migrations (name) VALUES (:name)"),
            {"name": "indian_event_listings_v4"},
        )

def migrate_legacy_notification_currency():
    with engine.begin() as connection:
        migrated = connection.execute(
            text("SELECT 1 FROM app_migrations WHERE name = :name"),
            {"name": "notification_currency_inr_v1"},
        ).first()
        if migrated:
            return

        old_currency_notifications = connection.execute(text(
            "SELECT id, message FROM notifications WHERE message LIKE '%$%'"
        )).all()
        for notification_id, message in old_currency_notifications:
            message = re.sub(
                r"\$([0-9,]+(?:\.[0-9]{1,2})?)",
                lambda match: (
                    f"₹{float(match.group(1).replace(',', '')) * LEGACY_USD_TO_INR_RATE:,.2f}"
                ),
                message,
            ).replace("$", "₹")
            connection.execute(
                text("UPDATE notifications SET message = :message WHERE id = :id"),
                {"message": message, "id": notification_id},
            )
        connection.execute(
            text("INSERT INTO app_migrations (name) VALUES (:name)"),
            {"name": "notification_currency_inr_v1"},
        )

migrate_existing_schema()
migrate_indian_event_listings()
migrate_legacy_notification_currency()

app = FastAPI(title="SmartEvent API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("static/qrcodes", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

app.include_router(auth.router)
app.include_router(events.router)
app.include_router(bookings.router)
app.include_router(tickets.router)
app.include_router(notifications.router)
app.include_router(organizer.router)
app.include_router(admin.router)
app.include_router(coupons.router)
app.include_router(payments.router)
app.include_router(reviews.router)
app.include_router(event_updates.router)
app.include_router(wishlist.router)
app.include_router(chatbot.router)

def promote_initial_admin():
    if not INITIAL_ADMIN_EMAIL:
        return
    db = SessionLocal()
    try:
        user = db.query(models.User).filter(
            models.User.email == INITIAL_ADMIN_EMAIL
        ).first()
        if user and user.role != models.UserRole.ADMIN:
            user.role = models.UserRole.ADMIN
            db.commit()
    finally:
        db.close()

def create_due_event_reminders():
    now = datetime.utcnow()
    reminder_deadline = now + timedelta(hours=24)
    db = SessionLocal()
    try:
        upcoming_events = (
            db.query(models.Event)
            .filter(
                models.Event.event_date > now,
                models.Event.event_date <= reminder_deadline,
                models.Event.event_status != models.EventStatus.CANCELLED,
            )
            .all()
        )
        for event in upcoming_events:
            bookings = (
                db.query(models.Booking)
                .filter(
                    models.Booking.event_id == event.id,
                    models.Booking.booking_status == models.BookingStatus.CONFIRMED,
                )
                .all()
            )
            reminder_title = f"Reminder: {event.title}"
            reminder_message = f"Your event '{event.title}' (event #{event.id}) starts within 24 hours."
            for booking in bookings:
                reminder_exists = (
                    db.query(models.Notification.id)
                    .filter(
                        models.Notification.user_id == booking.user_id,
                        models.Notification.title == reminder_title,
                        models.Notification.message == reminder_message,
                    )
                    .first()
                )
                if not reminder_exists:
                    db.add(models.Notification(
                        user_id=booking.user_id,
                        title=reminder_title,
                        message=reminder_message,
                        type=models.NotificationType.EVENT,
                    ))
        db.commit()
    finally:
        db.close()

async def event_reminder_loop():
    while True:
        await asyncio.to_thread(create_due_event_reminders)
        def refresh_event_statuses():
            db = SessionLocal()
            try:
                sync_event_statuses(db)
            finally:
                db.close()
        await asyncio.to_thread(refresh_event_statuses)
        await asyncio.sleep(300)

@app.on_event("startup")
async def start_event_reminders():
    await asyncio.to_thread(promote_initial_admin)
    with SessionLocal() as db:
        sync_event_statuses(db)
    app.state.reminder_task = asyncio.create_task(event_reminder_loop())

@app.on_event("shutdown")
async def stop_event_reminders():
    reminder_task = getattr(app.state, "reminder_task", None)
    if reminder_task:
        reminder_task.cancel()
        try:
            await reminder_task
        except asyncio.CancelledError:
            pass

@app.on_event("startup")
def seed_initial_events():
    db = SessionLocal()
    if db.query(models.Event).count() == 0:
        sample_events = [
            models.Event(
                title="Bengaluru Tech & Innovation Summit 2026",
                description="Meet India's technology leaders for talks on AI, cloud computing, and the future of Bengaluru's startup ecosystem.",
                category="Tech",
                location="Bengaluru",
                venue="Bangalore International Exhibition Centre",
                event_date=datetime.utcnow() + timedelta(days=20),
                ticket_price=1499,
                total_tickets=250,
                available_tickets=250,
                banner_image="https://images.unsplash.com/photo-1521737711867-e3b97375f902?w=1200&auto=format&fit=crop&q=80"
            ),
            models.Event(
                title="Mumbai Music Festival",
                description="A live celebration of Indian music, featuring popular artists, energetic performances, and an unforgettable festival atmosphere.",
                category="Music",
                location="Mumbai",
                venue="Mahalaxmi Racecourse",
                event_date=datetime.utcnow() + timedelta(days=14),
                ticket_price=999,
                total_tickets=500,
                available_tickets=480,
                banner_image="https://images.unsplash.com/photo-1506157786151-b8491531f063?w=1200&auto=format&fit=crop&q=80"
            ),
            models.Event(
                title="Ahmedabad Cricket Finals",
                description="Experience the excitement of live cricket at one of India's largest stadiums, with match-day energy and local fan celebrations.",
                category="Sports",
                location="Ahmedabad",
                venue="Narendra Modi Stadium",
                event_date=datetime.utcnow() + timedelta(days=18),
                ticket_price=1299,
                total_tickets=300,
                available_tickets=300,
                banner_image="https://images.unsplash.com/photo-1531415074968-036ba1b575da?w=1200&auto=format&fit=crop&q=80"
            ),
              models.Event(
                title="Delhi Indian Food Festival",
                description="Discover regional Indian cuisine, local favourites, and food experiences from chefs across the country.",
                category="Food & Drink",
                location="Delhi",
                venue="Major Dhyan Chand National Stadium",
                event_date=datetime.utcnow() + timedelta(days=28),
                ticket_price=799,
                total_tickets=150,
                available_tickets=150,
                banner_image="https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=1200&auto=format&fit=crop&q=80"
            ),
            models.Event(
                title="Hyderabad Startup Founders Forum",
                description="Connect with Indian founders and investors through practical discussions, networking, and startup-growth sessions.",
                category="Business",
                location="Hyderabad",
                venue="HITEX Exhibition Centre",
                event_date=datetime.utcnow() + timedelta(days=35),
                ticket_price=1299,
                total_tickets=80,
                available_tickets=80,
                banner_image="https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=1200&auto=format&fit=crop&q=80"
            )
        ]
        db.add_all(sample_events)
        db.commit()
    db.close()

@app.get("/")
def health_check():
    return {"status": "ok", "app": "SmartEvent API"}