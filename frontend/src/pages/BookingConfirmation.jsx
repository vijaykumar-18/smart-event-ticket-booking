import React, { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, CheckCircle } from 'lucide-react';
import api, { assetBaseUrl } from '../api/axios';
import { formatINR } from '../utils/currency';

export default function BookingConfirmation() {
  const { bookingId } = useParams();
  const { state } = useLocation();
  const [booking, setBooking] = useState(state?.booking || null);
  const [payment, setPayment] = useState(state?.payment || null);
  const [loading, setLoading] = useState(!state?.booking && Boolean(bookingId));
  const [error, setError] = useState('');

  useEffect(() => {
    if (!bookingId || state?.booking) return;
    api.get(`/bookings/${bookingId}`)
      .then((response) => {
        setBooking(response.data);
        setPayment(response.data.payments?.at(-1) || null);
      })
      .catch(() => setError('Unable to load this booking confirmation.'))
      .finally(() => setLoading(false));
  }, [bookingId, state]);

  if (loading) return <p className="py-20 text-center text-slate-500">Loading your confirmation…</p>;
  if (!booking && !error) return <Navigate to="/" replace />;
  if (error) return <p role="alert" className="mx-auto max-w-2xl px-4 py-20 text-center text-rose-700">{error}</p>;

  const successful = payment?.payment_status === 'SUCCESS' || booking.booking_status === 'CONFIRMED';
  const tickets = booking.tickets || [];
  return (
    <section className="mx-auto max-w-2xl px-4 py-12">
      <div className="text-center">
        {successful
          ? <CheckCircle className="mx-auto mb-4 h-16 w-16 text-emerald-500" />
          : <AlertCircle className="mx-auto mb-4 h-16 w-16 text-rose-500" />}
        <p className={`text-sm font-semibold uppercase tracking-[0.16em] ${successful ? 'text-emerald-700' : 'text-rose-700'}`}>{successful ? 'Payment successful' : 'Payment unsuccessful'}</p>
        <h1 className="mt-2 text-3xl font-extrabold text-slate-900">{successful ? 'Booking confirmed!' : 'Your payment did not go through'}</h1>
        <p className="mt-2 text-sm text-slate-600">Booking reference #{booking.id}{payment?.transaction_id ? ` · Transaction ${payment.transaction_id}` : ''}</p>
      </div>

      <div className={`mt-7 rounded-2xl border p-5 ${successful ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}>
        <p className={`font-semibold ${successful ? 'text-emerald-800' : 'text-rose-800'}`}>{booking.event?.title}</p>
        <p className="mt-1 text-sm text-slate-600">{booking.ticket_quantity} {booking.ticket_quantity === 1 ? 'ticket' : 'tickets'} · {new Date(booking.event.event_date).toLocaleString()}</p>
        <p className="mt-3 text-sm text-slate-700">Amount {successful ? 'paid' : 'due'}: <strong>{formatINR(booking.final_amount ?? booking.total_price)}</strong></p>
        {!successful && payment?.failure_reason && <p className="mt-2 text-sm text-rose-700">{payment.failure_reason}</p>}
        {!successful && <p className="mt-2 text-xs text-rose-700">No ticket has been issued. You can retry payment for this booking.</p>}
      </div>

      {successful && tickets.length > 0 && (
        <div className="mt-6 space-y-3">
          {tickets.map((ticket) => (
            <div key={ticket.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div>
                <span className="text-xs font-mono text-slate-400">TICKET PASS</span>
                <p className="font-bold text-slate-800">{ticket.ticket_code}</p>
              </div>
              <img src={`${assetBaseUrl}${ticket.qr_code_url}`} alt={`QR pass ${ticket.ticket_code}`} className="h-20 w-20 rounded-lg border border-slate-200 p-1" />
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {successful ? (
          <Link to="/bookings" className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">Go to booking history</Link>
        ) : (
          <Link to={`/payment/${booking.id}`} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">Retry payment</Link>
        )}
        <Link to="/" className="flex items-center gap-2 rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><ArrowLeft className="h-4 w-4" /> Browse events</Link>
      </div>
    </section>
  );
}
