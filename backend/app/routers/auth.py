from io import BytesIO
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.security import OAuth2PasswordRequestForm
from PIL import Image, UnidentifiedImageError
from sqlalchemy import case, func
from sqlalchemy.orm import Session
from app.database import get_db
from app import models, schemas, auth

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

@router.post("/register", response_model=schemas.UserResponse, status_code=status.HTTP_201_CREATED)
def register_user(user_in: schemas.UserCreate, db: Session = Depends(get_db)):
    if db.query(models.User).filter(models.User.email == user_in.email).first():
        raise HTTPException(status_code=400, detail="Email is already registered")
    if db.query(models.User).filter(models.User.username == user_in.username).first():
        raise HTTPException(status_code=400, detail="Username is already taken")
    
    new_user = models.User(
        username=user_in.username,
        email=user_in.email,
        hashed_password=auth.get_password_hash(user_in.password),
        role=models.UserRole(user_in.role),
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@router.post("/login", response_model=schemas.Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(
        (models.User.username == form_data.username) | (models.User.email == form_data.username)
    ).first()
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Incorrect credentials")

    access_token = auth.create_access_token(
        data={"sub": str(user.id), "role": user.role.value}
    )
    return {"access_token": access_token, "token_type": "bearer", "user": user}

@router.get("/profile", response_model=schemas.UserResponse)
def get_user_profile(current_user: models.User = Depends(auth.get_current_user)):
    return current_user

@router.put("/profile", response_model=schemas.UserResponse)
def update_user_profile(
    payload: schemas.UserProfileUpdate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    changes = payload.model_dump(exclude_unset=True)
    if "username" in changes:
        username = (changes["username"] or "").strip()
        if not username:
            raise HTTPException(status_code=422, detail="Username cannot be empty.")
        if db.query(models.User.id).filter(
            models.User.username == username,
            models.User.id != current_user.id,
        ).first():
            raise HTTPException(status_code=409, detail="Username is already taken.")
        current_user.username = username
    if "email" in changes:
        if changes["email"] is None:
            raise HTTPException(status_code=422, detail="Email cannot be empty.")
        if db.query(models.User.id).filter(
            models.User.email == changes["email"],
            models.User.id != current_user.id,
        ).first():
            raise HTTPException(status_code=409, detail="Email is already registered.")
        current_user.email = changes["email"]
    if "location" in changes:
        current_user.location = changes["location"].strip() or None if changes["location"] else None
    db.commit()
    db.refresh(current_user)
    return current_user

@router.get("/profile/summary", response_model=schemas.BookingSummary)
def get_profile_summary(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    confirmed = models.Booking.booking_status == models.BookingStatus.CONFIRMED
    totals = db.query(
        func.count(models.Booking.id),
        func.coalesce(func.sum(case((confirmed, 1), else_=0)), 0),
        func.coalesce(func.sum(case((confirmed, models.Booking.ticket_quantity), else_=0)), 0),
        func.coalesce(func.sum(case((confirmed, models.Booking.final_amount), else_=0.0)), 0.0),
    ).filter(models.Booking.user_id == current_user.id).one()
    return {
        "booking_count": int(totals[0]),
        "confirmed_bookings": int(totals[1]),
        "tickets_booked": int(totals[2]),
        "total_spent": round(float(totals[3]), 2),
    }

@router.post("/profile/picture", response_model=schemas.UserResponse)
async def upload_profile_picture(
    picture: UploadFile = File(...),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    content = await picture.read(5 * 1024 * 1024 + 1)
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Profile images must be 5 MB or smaller.")
    try:
        image = Image.open(BytesIO(content))
        image.load()
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as exc:
        raise HTTPException(status_code=400, detail="Upload a valid PNG, JPEG, or WebP image.") from exc
    image_format = (image.format or "").upper()
    output_format = {"JPEG": "JPEG", "PNG": "PNG", "WEBP": "WEBP"}.get(image_format)
    if not output_format:
        raise HTTPException(status_code=400, detail="Upload a valid PNG, JPEG, or WebP image.")
    if image.width * image.height > 20_000_000:
        raise HTTPException(status_code=400, detail="Image dimensions are too large.")

    extension = {"JPEG": "jpg", "PNG": "png", "WEBP": "webp"}[output_format]
    filename = f"{uuid4().hex}.{extension}"
    profile_dir = Path(__file__).resolve().parents[2] / "static" / "profiles"
    profile_dir.mkdir(parents=True, exist_ok=True)
    normalized = image.convert("RGB") if output_format == "JPEG" else image
    normalized.save(profile_dir / filename, format=output_format)
    current_user.profile_picture_url = f"/static/profiles/{filename}"
    db.commit()
    db.refresh(current_user)
    return current_user