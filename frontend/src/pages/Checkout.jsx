import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, BadgePercent, Calendar, MapPin } from 'lucide-react';
import api from '../api/axios';
import { formatINR } from '../utils/currency';

export default function Checkout() {
  const { eventId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const quantity = Math.max(1, Number(searchParams.get('quantity')) || 1);
  const [event, setEvent] = useState(null);
  const [couponCode, setCouponCode] = useState('');
  const [quote, setQuote] = useState(null);
  const [couponMessage, setCouponMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/events/${eventId}`)
      .then((response) => setEvent(response.data))
      .catch(() => setError('Unable to load this event. Please try again.'))
      .finally(() => setLoading(false));
  }, [eventId]);

  const subtotal = event ? event.ticket_price * quantity : 0;

  const applyCoupon = async (eventObject) => {
    eventObject?.preventDefault();
    if (!couponCode.trim()) {
      setQuote(null);
      setCouponMessage('Enter a coupon code to apply it.');
      return;
    }
    try {
      const response = await api.post('/coupons/validate', {
        coupon_code: couponCode.trim(),
        event_id: Number(eventId),
        ticket_quantity: quantity,
      });
      setQuote(response.data);
      setCouponMessage(`${response.data.coupon_code} applied successfully.`);
    } catch (requestError) {
      setQuote(null);
      setCouponMessage(requestError.response?.data?.detail || 'This coupon could not be applied.');
    }
  };

  const continueToPayment = async () => {
    if (couponCode.trim() && !quote) {
      setError('Apply the coupon or clear the code before continuing.');
      return;
    }
    if (quantity > 10 || quantity > event.available_tickets) {
      setError('The selected ticket quantity is no longer available.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const response = await api.post('/bookings', {
        event_id: Number(eventId),
        ticket_quantity: quantity,
        coupon_code: quote?.coupon_code || undefined,
      });
      navigate(`/payment/${response.data.id}`);
    } catch (requestError) {
      const detail = requestError.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Unable to reserve tickets. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="mx-auto max-w-3xl px-4 py-16"><div className="h-64 animate-pulse rounded-2xl bg-slate-200" /></div>;
  if (!event) return <p role="alert" className="mx-auto max-w-3xl px-4 py-16 text-rose-700">{error || 'Event not found.'}</p>;

  return (
    <section className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-600">Secure checkout</p>
        <h1 className="mt-2 text-3xl font-extrabold text-slate-900">Review your booking</h1>
        <p className="mt-2 text-slate-600">Check the event details and apply a coupon before continuing to payment.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <img src={event.banner_image} alt="" className="h-56 w-full object-cover" />
          <div className="space-y-3 p-6">
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold uppercase text-blue-700">{event.category}</span>
            <h2 className="text-2xl font-bold text-slate-900">{event.title}</h2>
            <p className="flex items-center gap-2 text-sm text-slate-600"><Calendar className="h-4 w-4 text-blue-600" />{new Date(event.event_date).toLocaleString()}</p>
            <p className="flex items-center gap-2 text-sm text-slate-600"><MapPin className="h-4 w-4 text-blue-600" />{event.venue}, {event.location}</p>
            <p className="border-t border-slate-100 pt-4 text-sm text-slate-600">{quantity} {quantity === 1 ? 'ticket' : 'tickets'} · {formatINR(event.ticket_price)} each</p>
          </div>
        </article>

        <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">Order summary</h2>
          <form onSubmit={applyCoupon} className="mt-5">
            <label htmlFor="coupon-code" className="mb-2 block text-sm font-semibold text-slate-700">Promo code</label>
            <div className="flex gap-2">
              <input id="coupon-code" value={couponCode} onChange={(eventObject) => { setCouponCode(eventObject.target.value.toUpperCase()); setQuote(null); setCouponMessage(''); setError(''); }} placeholder="Enter code" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100" />
              <button type="submit" disabled={quantity > 10 || quantity > event.available_tickets} className="rounded-lg border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50">Apply</button>
            </div>
            {couponMessage && <p role="status" className={`mt-2 text-xs ${quote ? 'text-emerald-700' : 'text-rose-600'}`}>{couponMessage}</p>}
          </form>
          <div className="mt-6 space-y-3 border-t border-slate-100 pt-5 text-sm">
            <div className="flex justify-between text-slate-600"><span>Subtotal</span><span>{formatINR(subtotal)}</span></div>
            {quote && <div className="flex justify-between text-emerald-700"><span className="flex items-center gap-1"><BadgePercent className="h-4 w-4" />Discount</span><span>−{formatINR(quote.discount_amount)}</span></div>}
            <div className="flex justify-between border-t border-slate-100 pt-3 text-base font-bold text-slate-900"><span>Total</span><span>{formatINR(quote?.final_amount ?? subtotal)}</span></div>
          </div>
          {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
          {(quantity > 10 || quantity > event.available_tickets) && <p role="alert" className="mt-4 text-sm text-rose-700">The selected quantity exceeds the available ticket limit.</p>}
          <button type="button" onClick={continueToPayment} disabled={submitting || quantity > 10 || quantity > event.available_tickets} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
            {submitting ? 'Reserving tickets…' : 'Continue to payment'} {!submitting && <ArrowRight className="h-4 w-4" />}
          </button>
          <p className="mt-3 text-center text-xs text-slate-500">Your tickets are confirmed only after successful payment.</p>
        </aside>
      </div>
    </section>
  );
}
