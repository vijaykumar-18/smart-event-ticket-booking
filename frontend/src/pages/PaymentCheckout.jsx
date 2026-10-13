import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CreditCard, LockKeyhole } from 'lucide-react';
import api from '../api/axios';
import { formatINR } from '../utils/currency';

export default function PaymentCheckout() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const cancelled = searchParams.get('cancelled');
  const [booking, setBooking] = useState(null);
  const [stripeEnabled, setStripeEnabled] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('CARD');
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const loadCheckout = async () => {
      try {
        const [bookingResponse, configResponse] = await Promise.all([
          api.get(`/bookings/${bookingId}`),
          api.get('/payments/config'),
        ]);
        if (!active) return;
        setBooking(bookingResponse.data);
        setStripeEnabled(configResponse.data.stripe_enabled);
        if (sessionId) {
          const confirmation = await api.post(`/payments/bookings/${bookingId}/stripe-confirm`, {
            session_id: sessionId,
          });
          if (active) {
            navigate(`/confirmation/${bookingId}`, {
              replace: true,
              state: { booking: confirmation.data.booking, payment: confirmation.data.payment },
            });
          }
          return;
        }
        if (cancelled) setError('Stripe checkout was cancelled. You can retry payment below.');
      } catch (requestError) {
        if (active) setError(requestError.response?.data?.detail || 'Unable to load or verify this payment.');
      } finally {
        if (active) setLoading(false);
      }
    };
    loadCheckout();
    return () => { active = false; };
  }, [bookingId, cancelled, navigate, sessionId]);

  const completePayment = async (event) => {
    event.preventDefault();
    setPaying(true);
    setError('');
    try {
      if (stripeEnabled && Number(booking.final_amount ?? booking.total_price) > 0) {
        const response = await api.post(`/payments/bookings/${bookingId}/stripe-checkout`);
        if (response.data.checkout_url) {
          window.location.assign(response.data.checkout_url);
          return;
        }
        const confirmation = await api.post(`/payments/bookings/${bookingId}/stripe-confirm`, {
          session_id: response.data.session_id,
        });
        navigate(`/confirmation/${bookingId}`, {
          replace: true,
          state: { booking: confirmation.data.booking, payment: confirmation.data.payment },
        });
        return;
      }
      const response = await api.post(`/payments/bookings/${bookingId}/checkout`, {
        payment_method: paymentMethod,
        simulate_failure: simulateFailure,
      });
      navigate(`/confirmation/${bookingId}`, {
        replace: true,
        state: { booking: response.data.booking, payment: response.data.payment },
      });
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Payment could not be processed. Please try again.');
    } finally {
      setPaying(false);
    }
  };

  if (loading) return <div className="mx-auto max-w-3xl px-4 py-16"><div className="h-64 animate-pulse rounded-2xl bg-slate-200" /></div>;
  if (!booking) return <p role="alert" className="mx-auto max-w-3xl px-4 py-16 text-rose-700">{error}</p>;

  const alreadyPaid = booking.booking_status === 'CONFIRMED';
  return (
    <section className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-600">Payment</p>
        <h1 className="mt-2 text-3xl font-extrabold text-slate-900">Complete your booking</h1>
        <p className="mt-2 text-slate-600">Booking reference #{booking.id}</p>
      </div>
      <div className="grid gap-6 md:grid-cols-[1fr_0.8fr]">
        <form onSubmit={completePayment} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-3 border-b border-slate-100 pb-5">
            <span className="rounded-xl bg-blue-50 p-3 text-blue-700"><CreditCard className="h-5 w-5" /></span>
            <div><h2 className="font-bold text-slate-900">{stripeEnabled && booking.final_amount > 0 ? 'Secure payment' : 'Choose a payment method'}</h2><p className="mt-1 text-sm text-slate-500">{stripeEnabled && booking.final_amount > 0 ? 'You will complete payment on Stripe’s secure hosted checkout.' : 'This checkout uses a server-side payment simulation.'}</p></div>
          </div>
          {!(stripeEnabled && booking.final_amount > 0) && (
            <>
              <div className="mt-5 space-y-3">
                {[
                  ['CARD', 'Credit or debit card'],
                  ['UPI', 'UPI'],
                  ['NET_BANKING', 'Net banking'],
                ].map(([value, label]) => (
                  <label key={value} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition ${paymentMethod === value ? 'border-blue-500 bg-blue-50/50' : 'border-slate-200 hover:border-slate-300'}`}>
                    <input type="radio" name="payment-method" value={value} checked={paymentMethod === value} onChange={() => setPaymentMethod(value)} />
                    <span className="text-sm font-semibold text-slate-800">{label}</span>
                  </label>
                ))}
              </div>
              <label className="mt-5 flex items-start gap-3 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">
                <input type="checkbox" checked={simulateFailure} onChange={(event) => setSimulateFailure(event.target.checked)} className="mt-0.5" />
                <span><span className="font-semibold text-slate-800">Test a declined payment</span><span className="mt-1 block text-xs text-slate-500">Optional demo mode: records a failed attempt so you can retry.</span></span>
              </label>
            </>
          )}
          {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
          {alreadyPaid ? (
            <Link to={`/confirmation/${booking.id}`} state={{ booking, payment: booking.payments?.at(-1) }} className="mt-6 block rounded-xl bg-emerald-600 px-4 py-3 text-center font-semibold text-white hover:bg-emerald-700">View payment confirmation</Link>
          ) : (
            <button type="submit" disabled={paying || booking.booking_status !== 'PENDING'} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
              <LockKeyhole className="h-4 w-4" />{paying ? 'Processing payment…' : `${stripeEnabled && booking.final_amount > 0 ? 'Continue to Stripe' : 'Pay'} ${formatINR(booking.final_amount ?? booking.total_price)}`}
            </button>
          )}
          <Link to="/bookings" className="mt-4 block text-center text-sm font-semibold text-slate-500 hover:text-blue-600">Cancel checkout</Link>
        </form>

        <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="font-bold text-slate-900">Booking summary</h2>
          <p className="mt-4 text-lg font-bold text-slate-900">{booking.event.title}</p>
          <p className="mt-1 text-sm text-slate-500">{new Date(booking.event.event_date).toLocaleString()}</p>
          <p className="mt-4 text-sm text-slate-600">{booking.ticket_quantity} {booking.ticket_quantity === 1 ? 'ticket' : 'tickets'}</p>
          <div className="mt-5 space-y-3 border-t border-slate-100 pt-4 text-sm">
            <div className="flex justify-between text-slate-600"><span>Subtotal</span><span>{formatINR(booking.total_price)}</span></div>
            {booking.discount_amount > 0 && <div className="flex justify-between text-emerald-700"><span>Coupon discount</span><span>−{formatINR(booking.discount_amount)}</span></div>}
            <div className="flex justify-between border-t border-slate-100 pt-3 font-bold text-slate-900"><span>Total due</span><span>{formatINR(booking.final_amount ?? booking.total_price)}</span></div>
          </div>
          <p className="mt-5 text-xs leading-5 text-slate-500">Payment details are processed by this demo simulation; no card number or banking credentials are collected.</p>
        </aside>
      </div>
    </section>
  );
}
