# 🎟️ SmartEvent – Event Discovery & Ticket Booking System

A full-stack web application for discovering live events, purchasing tickets, and managing digital QR entry passes in real time. 

Built with **FastAPI** for high-performance backend workflows and **React (Vite)** for a responsive, modern frontend interface.

---

## ✨ Features

- **User Authentication**: Secure signup and login using **JWT (JSON Web Tokens)** and **bcrypt** password hashing.
- **Event Discovery**: Search events by title and filter across categories (Tech, Music, Sports, Business).
- **Inventory & Reservation Engine**: Concurrency-safe ticket quantity decrementing, price calculation, and sold-out prevention.
- **Digital QR Passes**: Automatically generates scannable QR verification passes for each booked ticket.
- **Booking Management**: View past orders, ticket details, and download digital passes directly from the dashboard.
- **Notification Center**: Automated booking confirmations and alert badges with read/unread status updates.
- **Multi-role access**: USER, ORGANIZER, and ADMIN permissions enforced by role-bearing JWTs.
- **Organizer tools**: Create and manage owned events, view attendee contact details and booking updates, and track confirmed/cancelled ticket counts and confirmed INR revenue.
- **Organizer coupons**: Create event-specific discounts, set expiry and usage limits, and activate or deactivate coupons from the organizer dashboard.
- **Admin dashboard and analytics**: KPI summaries for users, events, tickets, bookings, and confirmed platform revenue; daily ticket sales, monthly booking trends, popular events, and top revenue-generating events.
- **Admin controls**: Review all users, events, and bookings, and manage user roles.
- **Event lifecycle**: Upcoming, ongoing, completed, and cancelled states with attendee notifications on updates/cancellations.
- **Live inventory and announcements**: Event pages receive ticket counts and organizer announcements over WebSockets; reservation changes remain protected by an atomic database update.
- **Personal discovery**: Trending events, viewed/booked-category recommendations, city preference, and price-range filtering.
- **Wishlist and account profile**: Save events, edit profile details, upload a validated profile image, and review booking totals.
- **Chat assistant**: Event discovery, booking lookup, and ticket FAQs, with optional OpenAI-compatible responses configured only on the backend.
- **India-ready listings**: INR pricing, required venue and Indian city fields, and Indian event sample listings.

---

## 🛠️ Tech Stack

### Backend
- **FastAPI** – High-performance asynchronous REST API framework
- **SQLAlchemy** – ORM for database relationships and operations
- **SQLite / PostgreSQL** – Relational database storage
- **Pydantic v2** – Data validation and serialization
- **python-jose & passlib** – JWT generation, token verification, and password encryption
- **qrcode & Pillow** – Dynamic digital QR pass generation

### Frontend
- **React 18 (Vite)** – Fast single-page application bundling and rendering
- **Tailwind CSS** – Utility-first responsive styling
- **Axios** – HTTP client with token request interceptors
- **Lucide React** – Clean iconography

---

## 🗄️ Database Schema

- `users`: User identity credentials and access role (`id`, `username`, `email`, `hashed_password`, `role`, `created_at`)
- `events`: Event catalog, ownership, and lifecycle (`id`, `organizer_id`, `title`, `category`, `venue`, Indian-city `location`, `event_date`, `event_end_date`, `event_status`, INR `ticket_price`, `available_tickets`, `banner_image`)
- `bookings`: Reservations and pricing breakdown (`id`, `user_id`, `event_id`, `ticket_quantity`, `total_price`, `coupon_id`, `discount_amount`, `final_amount`, `booking_status`)
- `tickets`: Unique QR passes tied to bookings (`id`, `booking_id`, `ticket_code`, `qr_code_url`)
- `payments`: Payment attempts and transaction references (`id`, `booking_id`, `payment_method`, `payment_status`, `transaction_id`, `amount`, `created_at`)
- `coupons`: Promotional offers, expiry and usage limits, optionally scoped to an event and its organizer
- `reviews`: One rating per attendee and event, with a 1–5 star rating
- `notifications`: User activity notifications (`id`, `user_id`, `title`, `message`, `type`, `is_read`); types include EVENT, BOOKING, PAYMENT, and SYSTEM
- `wishlist`: Saved user/event pairs with a unique constraint per user and event
- `event_views`: Per-user event view counts and last-viewed timestamps for recommendations
- `event_updates`: Organizer/admin announcements, including an important flag

---

## 🚀 Getting Started

### Prerequisites
- Python 3.10+
- Node.js 18+ & npm

---

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Copy `.env.example` to `.env` and set `SECRET_KEY` to a random value with at least 32 characters. For Stripe test payments, set `STRIPE_SECRET_KEY` to a rotated test-mode secret key in this backend `.env` file; never put the secret in the frontend or commit `.env`. Set `FRONTEND_URL` to the address serving the React app. To enable AI-generated assistant answers, set `CHATBOT_API_KEY` on the backend; `CHATBOT_BASE_URL` and `CHATBOT_MODEL` can select an OpenAI-compatible provider. Without a chatbot key, event search, booking lookup, and FAQ responses use the local assistant. Registration supports attendee (USER) and event organizer (ORGANIZER) accounts; ADMIN access is assigned separately. To bootstrap an administrator, register an account with the desired email and set `INITIAL_ADMIN_EMAIL` to that email before starting the backend.
3. Install dependencies and start the API:
   ```bash
   pip install -r requirements.txt
   uvicorn app.main:app --reload
   ```
   Existing databases are upgraded on startup with default USER roles and event lifecycle fields.
   Older USD event prices, booking totals, and notification amounts are converted to INR at a fixed migration rate of ₹83 per USD during one-time data migrations.

### Frontend Setup

1. In a separate terminal, navigate to the frontend directory and install dependencies:
   ```bash
   cd frontend
   npm install
   ```
2. Start the development server:
   ```bash
   npm run dev
   ```

Set `INITIAL_ADMIN_EMAIL` in `backend/.env` after registering the administrator account, then restart the backend to grant the initial ADMIN role.

## Payments, Coupons, Reviews, and Discovery

Ticket booking reserves inventory as a `PENDING` booking and creates a pending payment record. When `STRIPE_SECRET_KEY` is configured, checkout redirects to Stripe Checkout in the configured Stripe account's mode and confirms the payment server-side before issuing QR tickets. Configure a Stripe webhook endpoint at `/api/payments/stripe-webhook` and set `STRIPE_WEBHOOK_SECRET` so successful payments and expired checkout sessions are also processed if the attendee does not return to the site. Without a Stripe secret configured, the local payment simulation remains available; it does not collect card or bank credentials and includes an optional declined-payment test path. The Stripe secret is backend-only and must not use the exposed secret from chat; revoke that key in Stripe and configure a new test key.

Administrators can create and list coupons through `POST /api/coupons` and `GET /api/coupons`. Organizers can use the same endpoints to manage coupons for their own upcoming events; their coupon creation requests must include `event_id`, and they can only list or change coupons they own. Coupon creation accepts `coupon_code`, `event_id` (required for organizers), `discount_type` (`PERCENTAGE` or `FIXED`), `discount_value`, `minimum_booking_amount`, `expiry_date`, and optional `usage_limit`; coupons can be deactivated with `PATCH /api/coupons/{coupon_id}/active?is_active=false`. Authenticated attendees can validate a coupon at `POST /api/coupons/validate`; event-specific coupons cannot be used for another event.

Reviews are public to read at `GET /api/events/{event_id}/reviews`. A signed-in attendee can create a review at `POST /api/events/{event_id}/reviews`, and edit or delete their own review at `/api/reviews/{review_id}`. A review is allowed only after a confirmed booking for an event that has ended.

Event discovery accepts `search`, `category`, `location`, `start_date`, `end_date`, `min_price`, `max_price`, and `sort` (`date`, `popularity`, or `price`) on `GET /api/events`. `GET /api/events/trending` returns popular events; authenticated attendees can fetch `GET /api/events/recommendations`. Event detail clients may connect to `/api/events/{event_id}/availability` over WebSocket for inventory and announcement updates.

Attendees can manage `/api/wishlist/{event_id}` and list `/api/wishlist`. Organizers can publish announcements at `/api/events/{event_id}/updates`; updates are public to read. Authenticated profile routes support `GET`/`PUT /api/auth/profile`, `GET /api/auth/profile/summary`, and `POST /api/auth/profile/picture`. The assistant accepts `POST /api/chat` with a message and optional bounded conversation history. Notifications include payment outcomes and can be marked individually or in bulk as read.

## 🛡️ Administrator Dashboard

Sign in with an account assigned the `ADMIN` role and open `/admin`. The dashboard includes:

- **Overview**: Platform KPI cards and summaries of daily ticket sales, monthly booking trends, event popularity, and event revenue.
- **Analytics**: The same platform metrics with optional `From` and `To` date filters.
- **Users**: User list with role management.
- **Events**: Event list with venue, city, organizer, date, and status.
- **Bookings**: Booking list with customer, event, ticket quantity, total, status, and date; filter bookings by date.

All administrator API endpoints require an authenticated administrator account:

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/admin/analytics` | Platform totals and event/sales analytics. Accepts optional `start_date` and `end_date` query parameters. |
| `GET` | `/api/admin/users` | List registered users. |
| `PUT` | `/api/admin/users/{user_id}/role` | Change a user's role. |
| `GET` | `/api/admin/events` | List events. |
| `GET` | `/api/admin/bookings` | List bookings. Accepts optional `start_date` and `end_date` query parameters. |

The analytics endpoint reports total registered users and events, confirmed-booking ticket and revenue totals, booking counts, daily ticket quantities, monthly confirmed-booking counts, and the most popular and highest-revenue events.
#   s m a r t - e v e n t - t i c k e t - b o o k i n g 
 
 