from datetime import datetime, timezone
from typing import Optional, List, Literal
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator
from app.models import (
    BookingStatus,
    DiscountType,
    EventStatus,
    NotificationType,
    PaymentStatus,
    UserRole,
)

class UserBase(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    email: EmailStr

class UserCreate(UserBase):
    password: str = Field(min_length=8, max_length=72)
    role: Literal["USER", "ORGANIZER"] = "USER"

class UserResponse(UserBase):
    id: int
    role: UserRole
    location: Optional[str] = None
    profile_picture_url: Optional[str] = None
    created_at: datetime
    class Config:
        from_attributes = True

class UserProfileUpdate(BaseModel):
    username: Optional[str] = Field(default=None, min_length=3, max_length=50)
    email: Optional[EmailStr] = None
    location: Optional[str] = Field(default=None, max_length=150)

class BookingSummary(BaseModel):
    booking_count: int
    confirmed_bookings: int
    tickets_booked: int
    total_spent: float

class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

class TokenData(BaseModel):
    user_id: Optional[int] = None
    role: Optional[UserRole] = None

class EventBase(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    title: str = Field(min_length=1, max_length=150)
    description: str = Field(min_length=1)
    category: Literal["Music", "Tech", "Sports", "Business", "Food & Drink"]
    location: Literal[
        "Mumbai", "Chennai", "Hyderabad", "Pune", "Goa", "Kolkata",
        "Delhi", "Ahmedabad", "Bengaluru", "Gurugram", "Jaipur", "Kochi",
    ]
    venue: str = Field(min_length=1, max_length=150)
    event_date: datetime
    event_end_date: Optional[datetime] = None
    ticket_price: float = Field(ge=0)
    total_tickets: int = Field(gt=0)
    banner_image: Optional[str] = Field(default=None, max_length=2048)

    @field_validator("event_date", "event_end_date")
    @classmethod
    def normalize_datetime(cls, value):
        if value is not None and value.tzinfo is not None:
            return value.astimezone(timezone.utc).replace(tzinfo=None)
        return value

    @field_validator("location", "venue")
    @classmethod
    def require_event_place(cls, value):
        if not value:
            raise ValueError("City and venue are required")
        return value

    @model_validator(mode="after")
    def validate_dates(self):
        start = self.event_date
        end = self.event_end_date
        if end is not None and start is not None and end <= start:
            raise ValueError("Event end date must be after the start date")
        return self

class EventCreate(EventBase):
    pass

class EventUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    title: Optional[str] = Field(default=None, min_length=1, max_length=150)
    description: Optional[str] = Field(default=None, min_length=1)
    category: Optional[Literal["Music", "Tech", "Sports", "Business", "Food & Drink"]] = None
    location: Optional[Literal[
        "Mumbai", "Chennai", "Hyderabad", "Pune", "Goa", "Kolkata",
        "Delhi", "Ahmedabad", "Bengaluru", "Gurugram", "Jaipur", "Kochi",
    ]] = None
    venue: Optional[str] = Field(default=None, min_length=1, max_length=150)
    event_date: Optional[datetime] = None
    event_end_date: Optional[datetime] = None
    ticket_price: Optional[float] = Field(default=None, ge=0)
    total_tickets: Optional[int] = Field(default=None, gt=0)
    banner_image: Optional[str] = Field(default=None, max_length=2048)

    @field_validator("event_date", "event_end_date")
    @classmethod
    def normalize_datetime(cls, value):
        if value is not None and value.tzinfo is not None:
            return value.astimezone(timezone.utc).replace(tzinfo=None)
        return value

    @field_validator("location", "venue", mode="before")
    @classmethod
    def require_event_place(cls, value):
        if value is None or (isinstance(value, str) and not value.strip()):
            raise ValueError("City and venue cannot be empty")
        return value

class EventResponse(EventBase):
    id: int
    available_tickets: int
    organizer_id: Optional[int] = None
    event_status: EventStatus
    created_at: datetime
    average_rating: Optional[float] = None
    review_count: int = 0
    class Config:
        from_attributes = True

class EventAnnouncementCreate(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    is_important: bool = False

class EventAnnouncementResponse(BaseModel):
    id: int
    event_id: int
    message: str
    is_important: bool
    created_at: datetime
    class Config:
        from_attributes = True

class WishlistResponse(BaseModel):
    id: int
    event_id: int
    created_at: datetime
    event: EventResponse
    class Config:
        from_attributes = True

class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=1500)

class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=1000)
    history: List[ChatMessage] = Field(default_factory=list, max_length=12)

class ChatResponse(BaseModel):
    response: str
    events: List[EventResponse] = Field(default_factory=list)

class UserRoleUpdate(BaseModel):
    role: UserRole

class EventAnalytics(BaseModel):
    event_id: int
    event_title: str
    total_tickets: int
    tickets_sold: int
    remaining_tickets: int
    revenue: float
    booking_count: int
    tickets_booked: int
    confirmed_bookings: int
    cancelled_bookings: int
    pending_bookings: int
    confirmed_tickets: int
    cancelled_tickets: int
    pending_tickets: int

class BookingCreate(BaseModel):
    event_id: int
    ticket_quantity: int = Field(gt=0, le=10)
    coupon_code: Optional[str] = Field(default=None, min_length=1, max_length=50)

    @field_validator("coupon_code")
    @classmethod
    def normalize_coupon_code(cls, value):
        return value.strip().upper() if value else value

class TicketResponse(BaseModel):
    id: int
    booking_id: int
    ticket_code: str
    qr_code_url: str
    created_at: datetime
    event: Optional[EventResponse] = None
    class Config:
        from_attributes = True

class BookingResponse(BaseModel):
    id: int
    user_id: int
    event_id: int
    ticket_quantity: int
    total_price: float
    coupon_id: Optional[int] = None
    discount_amount: float = 0
    final_amount: float = 0
    booking_status: BookingStatus
    created_at: datetime
    event: EventResponse
    tickets: List[TicketResponse] = Field(default_factory=list)
    payments: List["PaymentResponse"] = Field(default_factory=list)
    class Config:
        from_attributes = True

class OrganizerBookingResponse(BookingResponse):
    user: UserResponse

class NotificationResponse(BaseModel):
    id: int
    title: str
    message: str
    type: NotificationType
    is_read: bool
    created_at: datetime
    class Config:
        from_attributes = True

class CouponCreate(BaseModel):
    coupon_code: str = Field(min_length=2, max_length=50)
    event_id: Optional[int] = None
    discount_type: DiscountType
    discount_value: float = Field(gt=0)
    minimum_booking_amount: float = Field(default=0, ge=0)
    expiry_date: datetime
    usage_limit: Optional[int] = Field(default=None, gt=0)
    is_active: bool = True

    @field_validator("coupon_code")
    @classmethod
    def normalize_coupon_code(cls, value):
        normalized = value.strip().upper()
        if len(normalized) < 2:
            raise ValueError("Coupon code must contain at least 2 characters")
        return normalized

    @field_validator("expiry_date")
    @classmethod
    def normalize_expiry_date(cls, value):
        if value.tzinfo is not None:
            return value.astimezone(timezone.utc).replace(tzinfo=None)
        return value

    @model_validator(mode="after")
    def validate_coupon(self):
        if self.expiry_date <= datetime.now(timezone.utc).replace(tzinfo=None):
            raise ValueError("Coupon expiry date must be in the future")
        if self.discount_type == DiscountType.PERCENTAGE and self.discount_value > 100:
            raise ValueError("Percentage discounts cannot exceed 100")
        return self

class CouponResponse(BaseModel):
    id: int
    coupon_code: str
    organizer_id: Optional[int] = None
    event_id: Optional[int] = None
    discount_type: DiscountType
    discount_value: float
    minimum_booking_amount: float
    expiry_date: datetime
    usage_limit: Optional[int]
    used_count: int
    is_active: bool
    created_at: datetime
    class Config:
        from_attributes = True

class CouponValidate(BaseModel):
    coupon_code: str = Field(min_length=1, max_length=50)
    event_id: int
    ticket_quantity: int = Field(gt=0, le=10)

    @field_validator("coupon_code")
    @classmethod
    def normalize_coupon_code(cls, value):
        return value.strip().upper()

class CouponQuote(BaseModel):
    coupon_id: int
    coupon_code: str
    subtotal: float
    discount_amount: float
    final_amount: float

class PaymentCreate(BaseModel):
    payment_method: Literal["CARD", "UPI", "NET_BANKING"] = "CARD"
    simulate_failure: bool = False

class PaymentResponse(BaseModel):
    id: int
    booking_id: int
    payment_method: str
    payment_status: PaymentStatus
    transaction_id: Optional[str] = None
    failure_reason: Optional[str] = None
    amount: float
    created_at: datetime
    class Config:
        from_attributes = True

class PaymentResult(BaseModel):
    payment: PaymentResponse
    booking: BookingResponse

class PaymentConfig(BaseModel):
    stripe_enabled: bool

class StripeCheckoutResponse(BaseModel):
    checkout_url: Optional[str] = None
    session_id: str

class StripeCheckoutConfirm(BaseModel):
    session_id: str = Field(min_length=1, max_length=255)

class ReviewCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    review_text: str = Field(default="", max_length=2000)

class ReviewResponse(BaseModel):
    id: int
    user_id: int
    event_id: int
    rating: int
    review_text: str
    created_at: datetime
    username: str

    @classmethod
    def from_review(cls, review):
        return cls(
            id=review.id,
            user_id=review.user_id,
            event_id=review.event_id,
            rating=review.rating,
            review_text=review.review_text,
            created_at=review.created_at,
            username=review.user.username,
        )

class EventReviewsResponse(BaseModel):
    average_rating: Optional[float]
    review_count: int
    reviews: List[ReviewResponse]

BookingResponse.model_rebuild()

class AdminBookingResponse(BookingResponse):
    user: UserResponse

    class Config:
        from_attributes = True