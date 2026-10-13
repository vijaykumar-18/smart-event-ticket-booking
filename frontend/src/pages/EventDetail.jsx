import React, { useState, useEffect, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Calendar, MapPin } from 'lucide-react';
import api from '../api/axios';
import { AuthContext } from '../context/AuthContext';
import { formatINR } from '../utils/currency';

export default function EventDetail() {
  const { id } = useParams();
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();

  const [event, setEvent] = useState(null);
  const [qty, setQty] = useState(1);
  const [eventLoading, setEventLoading] = useState(true);
  const [eventError, setEventError] = useState('');
  const [error, setError] = useState('');
  const [reviews, setReviews] = useState([]);
  const [averageRating, setAverageRating] = useState(null);
  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState('');
  const [reviewMessage, setReviewMessage] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [reviewLoadError, setReviewLoadError] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const canBook = !user || user.role === 'USER';
  const ownReview = reviews.find((review) => review.user_id === user?.id);

  useEffect(() => {
    api.get(`/events/${id}`)
      .then(res => setEvent(res.data))
      .catch(() => setEventError('Unable to load this event. It may have been removed.'))
      .finally(() => setEventLoading(false));
  }, [id]);

  useEffect(() => {
    api.get(`/events/${id}/reviews`)
      .then((response) => {
        setReviews(response.data.reviews);
        setAverageRating(response.data.average_rating);
      })
      .catch(() => setReviewLoadError('Unable to load attendee reviews.'));
  }, [id]);

  useEffect(() => {
    if (ownReview) {
      setRating(ownReview.rating);
      setReviewText(ownReview.review_text);
    }
  }, [ownReview?.id, ownReview?.rating, ownReview?.review_text]);

  const handleBooking = async () => {
    if (!user) {
      navigate('/login');
      return;
    }
    if (qty < 1 || qty > event.available_tickets || qty > 10) {
      setError('Choose a quantity within the available ticket limit (maximum 10).');
      return;
    }
    setError('');
    navigate(`/checkout/${id}?quantity=${qty}`);
  };

  const submitReview = async (reviewEvent) => {
    reviewEvent.preventDefault();
    setReviewSubmitting(true);
    setReviewError('');
    setReviewMessage('');
    try {
      const response = ownReview
        ? await api.put(`/reviews/${ownReview.id}`, { rating, review_text: reviewText })
        : await api.post(`/events/${id}/reviews`, { rating, review_text: reviewText });
      setReviews((current) => ownReview
        ? current.map((review) => review.id === ownReview.id ? response.data : review)
        : [response.data, ...current]);
      const nextAverage = reviews
        .filter((review) => review.id !== ownReview?.id)
        .reduce((sum, review) => sum + review.rating, rating);
      const nextCount = reviews.length + (ownReview ? 0 : 1);
      setAverageRating(nextCount ? nextAverage / nextCount : null);
      setReviewMessage(ownReview ? 'Your review has been updated.' : 'Thanks for sharing your feedback!');
    } catch (requestError) {
      setReviewError(requestError.response?.data?.detail || 'Unable to save your review.');
    } finally {
      setReviewSubmitting(false);
    }
  };

  const deleteReview = async () => {
    if (!ownReview || !window.confirm('Delete your review for this event?')) return;
    setReviewError('');
    try {
      await api.delete(`/reviews/${ownReview.id}`);
      const remaining = reviews.filter((review) => review.id !== ownReview.id);
      setReviews(remaining);
      setAverageRating(remaining.length
        ? remaining.reduce((sum, review) => sum + review.rating, 0) / remaining.length
        : null);
      setReviewText('');
      setRating(5);
      setReviewMessage('Your review has been deleted.');
    } catch (requestError) {
      setReviewError(requestError.response?.data?.detail || 'Unable to delete your review.');
    }
  };

  if (eventLoading) return <div className="py-20 text-center">Loading event details...</div>;
  if (eventError || !event) return <div role="alert" className="mx-auto max-w-2xl px-4 py-20 text-center text-rose-700">{eventError || 'Event not found.'}</div>;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <img
          src={event.banner_image || 'https://images.unsplash.com/photo-1506157786151-b8491531f063?w=1200&auto=format&fit=crop&q=80'}
          alt={event.title}
          className="w-full h-80 object-cover"
        />

        <div className="p-6 sm:p-8 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-2 space-y-4">
            <span className="text-xs uppercase font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
              {event.category}
            </span>
            <h1 className="text-3xl font-bold text-slate-900">{event.title}</h1>
            <p className="text-sm font-medium text-amber-600">
              {averageRating ? `★ ${averageRating.toFixed(1)} · ${reviews.length} ${reviews.length === 1 ? 'review' : 'reviews'}` : 'No reviews yet'}
            </p>
            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
              event.event_status === 'CANCELLED'
                ? 'bg-rose-100 text-rose-700'
                : event.event_status === 'COMPLETED'
                  ? 'bg-slate-100 text-slate-700'
                  : event.event_status === 'ONGOING'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-blue-100 text-blue-700'
            }`}>{event.event_status}</span>
            {event.event_status === 'CANCELLED' && (
              <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                This event has been cancelled. Ticket booking is unavailable.
              </p>
            )}
            
            <div className="flex flex-wrap gap-4 text-sm text-slate-600">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-blue-600" />
                <span>{new Date(event.event_date).toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-blue-600" />
                <span>{event.location}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-blue-600" />
                <span>{event.venue}</span>
              </div>
            </div>

            <hr className="border-slate-100" />
            <div>
              <h2 className="text-lg font-semibold text-slate-800 mb-2">About this event</h2>
              <p className="text-slate-600 text-sm leading-relaxed whitespace-pre-line">{event.description}</p>
            </div>
          </div>

          {/* Booking Card */}
          <div className="bg-slate-50 border border-slate-200 p-6 rounded-xl flex flex-col justify-between h-fit">
            <div>
              <div className="flex justify-between items-baseline mb-4">
                <span className="text-sm text-slate-500">Price per ticket</span>
                <span className="text-2xl font-black text-slate-900">{formatINR(event.ticket_price)}</span>
              </div>

              {canBook && event.event_status === 'UPCOMING' && <div className="mb-4">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Select Quantity</label>
                <input
                  type="number"
                  min="1"
                  max={Math.min(event.available_tickets, 10)}
                  value={qty}
                  onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full border border-slate-300 rounded-lg p-2 text-sm bg-white"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Available tickets: {event.available_tickets}
                </span>
              </div>}

              {canBook && event.event_status === 'UPCOMING' && <div className="border-t border-slate-200 pt-3 mb-6">
                <div className="flex justify-between font-bold text-slate-800 text-sm">
                  <span>Total Amount</span>
                  <span>{formatINR(event.ticket_price * qty)}</span>
                </div>
              </div>}

              {error && <p className="text-xs text-rose-600 mb-4">{error}</p>}
            </div>

            {canBook && event.event_status === 'UPCOMING' ? <button
              onClick={handleBooking}
              disabled={event.available_tickets <= 0}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-sm transition disabled:opacity-50"
            >
              {event.available_tickets <= 0 ? 'Sold Out' : 'Continue to checkout'}
            </button> : <p className="text-center text-sm font-semibold text-slate-600">
              {user && user.role !== 'USER'
                ? 'Ticket booking is available to user accounts.'
                : event.event_status === 'CANCELLED'
                  ? 'This event has been cancelled.'
                  : 'Ticket booking is closed for this event.'}
            </p>}
          </div>
        </div>
      </div>

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">Community</p>
            <h2 className="mt-1 text-2xl font-bold text-slate-900">Attendee reviews</h2>
          </div>
          <p className="text-sm text-slate-500">{averageRating ? `Average ${averageRating.toFixed(1)} / 5` : 'Be the first to review'}</p>
        </div>
        {reviewLoadError && <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{reviewLoadError}</p>}

        {event.event_status === 'COMPLETED' && user?.role === 'USER' && (
          <form onSubmit={submitReview} className="mt-6 rounded-xl bg-slate-50 p-5">
            <h3 className="font-semibold text-slate-900">{ownReview ? 'Edit your review' : 'Rate your experience'}</h3>
            <div className="mt-3 flex gap-1" aria-label="Choose a rating from one to five stars">
              {[1, 2, 3, 4, 5].map((star) => (
                <button key={star} type="button" onClick={() => setRating(star)} aria-label={`${star} star${star === 1 ? '' : 's'}`} className={`text-3xl transition hover:scale-110 ${star <= rating ? 'text-amber-400' : 'text-slate-300'}`}>★</button>
              ))}
            </div>
            <label htmlFor="review-text" className="mt-3 block text-sm font-medium text-slate-700">Your review</label>
            <textarea id="review-text" value={reviewText} onChange={(reviewEvent) => setReviewText(reviewEvent.target.value)} maxLength={2000} rows={3} className="mt-2 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100" placeholder="What did you think of the event?" />
            {reviewError && <p role="alert" className="mt-2 text-sm text-rose-600">{reviewError}</p>}
            {reviewMessage && <p role="status" className="mt-2 text-sm text-emerald-700">{reviewMessage}</p>}
            <div className="mt-3 flex flex-wrap gap-3">
              <button type="submit" disabled={reviewSubmitting} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{reviewSubmitting ? 'Saving…' : ownReview ? 'Update review' : 'Submit review'}</button>
              {ownReview && <button type="button" onClick={deleteReview} className="rounded-lg border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50">Delete review</button>}
            </div>
          </form>
        )}

        {reviews.length === 0 ? (
          <p className="mt-6 rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">Reviews from event attendees will appear here.</p>
        ) : (
          <ul className="mt-6 divide-y divide-slate-100">
            {reviews.map((review) => (
              <li key={review.id} className="py-5 first:pt-0">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-slate-900">{review.username}</p>
                  <time className="text-xs text-slate-400">{new Date(review.created_at).toLocaleDateString()}</time>
                </div>
                <p className="mt-1 text-sm tracking-wide text-amber-500" aria-label={`${review.rating} out of 5 stars`}>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</p>
                {review.review_text && <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{review.review_text}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}