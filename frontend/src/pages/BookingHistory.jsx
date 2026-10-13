import React, { useState, useEffect } from 'react';
import api, { assetBaseUrl } from '../api/axios';
import { Link } from 'react-router-dom';
import { formatINR } from '../utils/currency';

export default function BookingHistory() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cancellingId, setCancellingId] = useState(null);

  useEffect(() => {
    api.get('/bookings/my-bookings')
      .then(res => setBookings(res.data))
      .catch(() => setError('Unable to load your bookings. Please try again.'))
      .finally(() => setLoading(false));
  }, []);

  const cancelBooking = async (bookingId) => {
    if (!window.confirm('Cancel this booking? Its tickets will become available again.')) return;
    setCancellingId(bookingId);
    setError('');
    try {
      const response = await api.post(`/bookings/${bookingId}/cancel`);
      setBookings((current) => current.map((booking) => (
        booking.id === bookingId ? response.data : booking
      )));
    } catch (err) {
      setError(err.response?.data?.detail || 'Unable to cancel this booking.');
    } finally {
      setCancellingId(null);
    }
  };

  if (loading) return <div className="py-20 text-center text-slate-500">Loading your bookings...</div>;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Your Bookings & Digital Tickets</h1>

      {error ? (
        <div role="alert" className="bg-rose-50 border border-rose-200 text-rose-700 p-4 rounded-xl">{error}</div>
      ) : bookings.length === 0 ? (
        <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-500">
          No bookings yet. <Link to="/" className="text-blue-600 font-semibold hover:underline">Explore events</Link> to grab your first ticket.
        </div>
      ) : (
        <div className="space-y-6">
          {bookings.map((b) => (
            <div key={b.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-4 border-b border-slate-100 gap-2">
                <div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${b.booking_status === 'CONFIRMED' ? 'bg-emerald-50 text-emerald-700' : b.booking_status === 'PENDING' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                    {b.booking_status}
                  </span>
                  <h3 className="font-bold text-lg text-slate-800 mt-1">{b.event.title}</h3>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-400 block">Total</span>
                  <span className="font-bold text-slate-900">{formatINR(b.final_amount ?? b.total_price)}</span>
                  {b.discount_amount > 0 && <span className="block text-xs text-emerald-700">Saved {formatINR(b.discount_amount)}</span>}
                  {b.booking_status === 'PENDING' && (
                    <Link to={`/payment/${b.id}`} className="mt-2 block text-xs font-semibold text-blue-600 hover:underline">Complete payment</Link>
                  )}
                  {(b.booking_status === 'PENDING' || (b.booking_status === 'CONFIRMED' && new Date(b.event.event_date) > new Date())) && (
                    <button
                      type="button"
                      onClick={() => cancelBooking(b.id)}
                      disabled={cancellingId === b.id}
                      className="mt-2 block text-xs font-semibold text-rose-600 hover:underline disabled:opacity-50"
                    >
                      {cancellingId === b.id ? 'Cancelling...' : 'Cancel booking'}
                    </button>
                  )}
                </div>
              </div>

              <p className="mt-3 text-sm text-slate-500">
                {b.event.venue}, {b.event.location} · {new Date(b.event.event_date).toLocaleString()}
              </p>
              {b.booking_status === 'CANCELLED' ? (
                <p className="mt-4 text-sm text-slate-500">This booking was cancelled; its tickets are no longer valid.</p>
              ) : (
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {b.tickets.map((t) => (
                  <div key={t.id} className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <img
                      src={`${assetBaseUrl}${t.qr_code_url}`}
                      alt={t.ticket_code}
                      className="w-16 h-16 bg-white border border-slate-200 p-1 rounded"
                    />
                    <div>
                      <span className="text-[10px] text-slate-400 font-mono">CODE</span>
                      <p className="font-mono font-bold text-xs text-slate-800">{t.ticket_code}</p>
                      <a
                        href={`${assetBaseUrl}${t.qr_code_url}`}
                        download
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-blue-600 hover:underline inline-block mt-1 font-semibold"
                      >
                        Download QR Pass
                      </a>
                    </div>
                  </div>
                ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}