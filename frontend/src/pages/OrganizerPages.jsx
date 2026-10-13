import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../api/axios';
import { formatINR } from '../utils/currency';

const cardClass = 'rounded-xl border border-slate-200 bg-white p-5 shadow-sm';
const inputClass = 'w-full rounded-lg border border-slate-300 p-2.5 text-sm';

function ErrorMessage({ children }) {
  return children ? <p role="alert" className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{children}</p> : null;
}

function apiErrorMessage(error, fallback) {
  const detail = error.response?.data?.detail;
  return typeof detail === 'string' ? detail : fallback;
}

function StatusBadge({ status }) {
  const colors = {
    UPCOMING: 'bg-blue-100 text-blue-700',
    ONGOING: 'bg-emerald-100 text-emerald-700',
    COMPLETED: 'bg-slate-100 text-slate-700',
    CANCELLED: 'bg-rose-100 text-rose-700',
  };
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${colors[status] || colors.UPCOMING}`}>{status}</span>;
}

export function OrganizerDashboard() {
  const [analytics, setAnalytics] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    const loadDashboard = () => Promise.all([
      api.get('/organizer/analytics'),
      api.get('/organizer/bookings'),
    ])
      .then(([analyticsResponse, bookingsResponse]) => {
        setAnalytics(analyticsResponse.data);
        setBookings(bookingsResponse.data);
        setError('');
      })
      .catch((err) => setError(err.response?.data?.detail || 'Unable to load organizer dashboard.'));

    loadDashboard();
    const refresh = window.setInterval(loadDashboard, 30000);
    return () => window.clearInterval(refresh);
  }, []);
  const totals = analytics.reduce((sum, event) => ({
    bookedTickets: sum.bookedTickets + event.tickets_booked,
    revenue: sum.revenue + event.revenue,
    confirmedBookings: sum.confirmedBookings + event.confirmed_bookings,
    cancelledBookings: sum.cancelledBookings + event.cancelled_bookings,
    pendingBookings: sum.pendingBookings + event.pending_bookings,
  }), {
    bookedTickets: 0,
    revenue: 0,
    confirmedBookings: 0,
    cancelledBookings: 0,
    pendingBookings: 0,
  });

  return (
    <section className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div><h1 className="text-3xl font-bold text-slate-900">Organizer dashboard</h1><p className="mt-1 text-slate-600">Track event performance and ticket sales.</p></div>
        <div className="flex gap-3">
          <Link to="/organizer/coupons" className="rounded-lg border border-blue-600 px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-50">Manage coupons</Link>
          <Link to="/organizer/events/new" className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">Create event</Link>
        </div>
      </div>
      <ErrorMessage>{error}</ErrorMessage>
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className={cardClass}><p className="text-sm text-slate-500">Tickets booked</p><p className="mt-2 text-3xl font-bold">{totals.bookedTickets}</p></div>
        <div className={cardClass}><p className="text-sm text-slate-500">Confirmed bookings</p><p className="mt-2 text-3xl font-bold">{totals.confirmedBookings}</p></div>
        <div className={cardClass}><p className="text-sm text-slate-500">Cancelled bookings</p><p className="mt-2 text-3xl font-bold">{totals.cancelledBookings}</p></div>
        <div className={cardClass}><p className="text-sm text-slate-500">Pending bookings</p><p className="mt-2 text-3xl font-bold">{totals.pendingBookings}</p></div>
        <div className={cardClass}><p className="text-sm text-slate-500">Total revenue (confirmed)</p><p className="mt-2 text-3xl font-bold">{formatINR(totals.revenue)}</p></div>
      </div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900">Event performance</h2>
        <Link to="/organizer/events" className="text-sm font-semibold text-blue-600 hover:underline">Manage events</Link>
      </div>
      <div className="space-y-4">
        {analytics.map((event) => (
          <div className={cardClass} key={event.event_id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-slate-900">{event.event_title}</h3>
              <span className="text-sm text-slate-500">{event.confirmed_bookings} confirmed · {event.cancelled_bookings} cancelled · {formatINR(event.revenue)} confirmed revenue</span>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {event.tickets_booked} tickets booked · {event.confirmed_tickets} confirmed · {event.cancelled_tickets} cancelled · {event.pending_tickets} pending
            </p>
            <div className="mt-4 flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.min(100, event.tickets_sold / Math.max(1, event.total_tickets) * 100)}%` }} />
              </div>
              <span className="whitespace-nowrap text-xs text-slate-600">{event.tickets_sold} sold · {event.remaining_tickets} left</span>
            </div>
          </div>
        ))}
        {analytics.length === 0 && !error && <p className="py-10 text-center text-slate-500">No events yet. Create your first event to see performance.</p>}
      </div>
      <div className="mb-4 mt-10 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Recent ticket bookings</h2>
          <p className="mt-1 text-sm text-slate-500">Latest bookings across your events.</p>
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[750px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr><th className="p-4">Booking</th><th className="p-4">Attendee</th><th className="p-4">Event</th><th className="p-4">Tickets</th><th className="p-4">Amount</th><th className="p-4">Status</th><th className="p-4">Booked at</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {bookings.slice(0, 10).map((booking) => (
              <tr key={booking.id}>
                <td className="p-4">#{booking.id}</td>
                <td className="p-4">
                  <p className="font-medium text-slate-800">{booking.user.username}</p>
                  <a className="text-blue-600 hover:underline" href={`mailto:${booking.user.email}`}>{booking.user.email}</a>
                </td>
                <td className="p-4">{booking.event.title}</td>
                <td className="p-4">{booking.ticket_quantity}</td>
                <td className="p-4">{formatINR(booking.final_amount ?? booking.total_price)}</td>
                <td className="p-4">{booking.booking_status}</td>
                <td className="p-4">{new Date(booking.created_at).toLocaleString()}</td>
              </tr>
            ))}
            {bookings.length === 0 && !error && (
              <tr><td colSpan="7" className="p-8 text-center text-slate-500">No ticket bookings yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function OrganizerEvents() {
  const [events, setEvents] = useState([]);
  const [error, setError] = useState('');
  const loadEvents = () => api.get('/organizer/events')
    .then(({ data }) => { setEvents(data); setError(''); })
    .catch((err) => setError(err.response?.data?.detail || 'Unable to load your events.'));
  useEffect(() => { loadEvents(); }, []);
  const cancelEvent = async (eventId) => {
    if (!window.confirm('Cancel this event? Booked attendees will be notified.')) return;
    try {
      await api.post(`/organizer/events/${eventId}/cancel`);
      loadEvents();
    } catch (err) {
      setError(err.response?.data?.detail || 'Unable to cancel this event.');
    }
  };
  return (
    <section className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-3xl font-bold text-slate-900">Manage events</h1>
        <Link to="/organizer/events/new" className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white">Create event</Link>
      </div>
      <ErrorMessage>{error}</ErrorMessage>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-4">Event</th><th className="p-4">Date</th><th className="p-4">Tickets</th><th className="p-4">Status</th><th className="p-4">Actions</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {events.map((event) => <tr key={event.id}>
              <td className="p-4 font-semibold">{event.title}</td>
              <td className="p-4">{new Date(event.event_date).toLocaleString()}</td>
              <td className="p-4">{event.available_tickets} / {event.total_tickets} available</td>
              <td className="p-4"><StatusBadge status={event.event_status} /></td>
              <td className="p-4"><div className="flex flex-wrap gap-3">
                <Link className="font-semibold text-blue-600 hover:underline" to={`/organizer/events/${event.id}/edit`}>Edit</Link>
                <Link className="font-semibold text-blue-600 hover:underline" to={`/organizer/events/${event.id}/bookings`}>Bookings</Link>
                {event.event_status !== 'CANCELLED' && <button className="font-semibold text-rose-600 hover:underline" onClick={() => cancelEvent(event.id)}>Cancel</button>}
              </div></td>
            </tr>)}
            {events.length === 0 && <tr><td colSpan="5" className="p-8 text-center text-slate-500">No events created yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function OrganizerCoupons() {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    event_id: '',
    coupon_code: '',
    discount_type: 'PERCENTAGE',
    discount_value: '',
    minimum_booking_amount: '0',
    expiry_date: '',
    usage_limit: '',
  });
  const upcomingEvents = events.filter((event) => event.event_status === 'UPCOMING');

  const loadData = () => Promise.all([
    api.get('/organizer/events'),
    api.get('/coupons'),
  ]).then(([eventsResponse, couponsResponse]) => {
    setEvents(eventsResponse.data);
    setCoupons(couponsResponse.data);
    setError('');
  }).catch((err) => setError(apiErrorMessage(err, 'Unable to load coupon management.')));

  useEffect(() => { loadData(); }, []);

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    const payload = {
      ...form,
      event_id: Number(form.event_id),
      coupon_code: form.coupon_code.trim().toUpperCase(),
      discount_value: Number(form.discount_value),
      minimum_booking_amount: Number(form.minimum_booking_amount),
      expiry_date: new Date(form.expiry_date).toISOString(),
      usage_limit: form.usage_limit ? Number(form.usage_limit) : null,
    };
    try {
      await api.post('/coupons', payload);
      setForm({
        event_id: '',
        coupon_code: '',
        discount_type: 'PERCENTAGE',
        discount_value: '',
        minimum_booking_amount: '0',
        expiry_date: '',
        usage_limit: '',
      });
      await loadData();
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to create this coupon.'));
    } finally {
      setSaving(false);
    }
  };

  const toggleCoupon = async (coupon) => {
    setError('');
    try {
      await api.patch(`/coupons/${coupon.id}/active`, null, {
        params: { is_active: !coupon.is_active },
      });
      await loadData();
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to update this coupon.'));
    }
  };

  return (
    <section className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Manage coupons</h1>
          <p className="mt-1 text-slate-600">Create event-specific discounts for your attendees.</p>
        </div>
        <button type="button" onClick={() => navigate('/organizer')} className="text-sm font-semibold text-blue-600 hover:underline">Back to dashboard</button>
      </div>
      <ErrorMessage>{error}</ErrorMessage>
      <form onSubmit={submit} className={`${cardClass} mb-8 grid gap-4 sm:grid-cols-2`}>
        <label className="text-sm font-semibold text-slate-700 sm:col-span-2">
          Event
          <select className={`${inputClass} mt-1`} required value={form.event_id} onChange={(e) => setForm({ ...form, event_id: e.target.value })}>
            <option value="">Choose one of your upcoming events</option>
            {upcomingEvents.map((event) => (
              <option key={event.id} value={event.id}>{event.title}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Coupon code
          <input className={`${inputClass} mt-1 uppercase`} required minLength="2" maxLength="50" value={form.coupon_code} onChange={(e) => setForm({ ...form, coupon_code: e.target.value })} placeholder="EARLYBIRD" />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Discount type
          <select className={`${inputClass} mt-1`} value={form.discount_type} onChange={(e) => setForm({ ...form, discount_type: e.target.value })}>
            <option value="PERCENTAGE">Percentage</option>
            <option value="FIXED">Fixed amount (INR)</option>
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Discount value{form.discount_type === 'PERCENTAGE' ? ' (%)' : ' (₹)'}
          <input className={`${inputClass} mt-1`} required type="number" min="0.01" max={form.discount_type === 'PERCENTAGE' ? '100' : undefined} step="0.01" value={form.discount_value} onChange={(e) => setForm({ ...form, discount_value: e.target.value })} />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Minimum booking amount (₹)
          <input className={`${inputClass} mt-1`} required type="number" min="0" step="0.01" value={form.minimum_booking_amount} onChange={(e) => setForm({ ...form, minimum_booking_amount: e.target.value })} />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Expires at
          <input className={`${inputClass} mt-1`} required type="datetime-local" min={toDateInput(new Date(Date.now() + 60000).toISOString())} value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Usage limit (optional)
          <input className={`${inputClass} mt-1`} type="number" min="1" step="1" value={form.usage_limit} onChange={(e) => setForm({ ...form, usage_limit: e.target.value })} placeholder="Unlimited" />
        </label>
        <div className="sm:col-span-2">
          <button type="submit" disabled={saving || upcomingEvents.length === 0} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
            {saving ? 'Creating coupon…' : 'Create coupon'}
          </button>
          {upcomingEvents.length === 0 && <p className="mt-2 text-sm text-slate-500">Create an upcoming event before adding a coupon.</p>}
        </div>
      </form>

      <h2 className="mb-3 text-xl font-bold text-slate-900">Your coupons</h2>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr><th className="p-4">Code</th><th className="p-4">Event</th><th className="p-4">Discount</th><th className="p-4">Usage</th><th className="p-4">Expires</th><th className="p-4">Status</th><th className="p-4">Action</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {coupons.map((coupon) => (
              <tr key={coupon.id}>
                <td className="p-4 font-bold">{coupon.coupon_code}</td>
                <td className="p-4">{events.find((event) => event.id === coupon.event_id)?.title || 'Event unavailable'}</td>
                <td className="p-4">{coupon.discount_type === 'PERCENTAGE' ? `${coupon.discount_value}%` : formatINR(coupon.discount_value)}</td>
                <td className="p-4">{coupon.used_count}{coupon.usage_limit ? ` / ${coupon.usage_limit}` : ' / unlimited'}</td>
                <td className="p-4">{new Date(coupon.expiry_date).toLocaleString()}</td>
                <td className="p-4">{coupon.is_active ? 'Active' : 'Inactive'}</td>
                <td className="p-4"><button type="button" onClick={() => toggleCoupon(coupon)} className="font-semibold text-blue-600 hover:underline">{coupon.is_active ? 'Deactivate' : 'Activate'}</button></td>
              </tr>
            ))}
            {coupons.length === 0 && <tr><td colSpan="7" className="p-8 text-center text-slate-500">No coupons created yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const emptyEvent = {
  title: '', description: '', category: 'Tech', location: 'Bengaluru', venue: '', event_date: '',
  event_end_date: '', ticket_price: '0', total_tickets: '100', banner_image: '',
};

const citiesByCategory = {
  Music: ['Mumbai', 'Chennai', 'Hyderabad', 'Pune', 'Goa', 'Kolkata', 'Delhi'],
  Sports: ['Ahmedabad', 'Mumbai', 'Bengaluru', 'Kolkata', 'Chennai', 'Hyderabad', 'Delhi'],
  Tech: ['Bengaluru', 'Hyderabad', 'Pune', 'Delhi', 'Gurugram', 'Chennai', 'Mumbai'],
  Business: ['Hyderabad', 'Mumbai', 'Bengaluru', 'Delhi', 'Pune', 'Gurugram'],
  'Food & Drink': ['Delhi', 'Mumbai', 'Jaipur', 'Kochi', 'Kolkata', 'Chennai'],
};

const defaultCityByCategory = {
  Music: 'Mumbai',
  Sports: 'Ahmedabad',
  Tech: 'Bengaluru',
  Business: 'Hyderabad',
  'Food & Drink': 'Delhi',
};

function toDateInput(value) {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function OrganizerEventForm() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyEvent);
  const [loading, setLoading] = useState(Boolean(eventId));
  const [error, setError] = useState('');
  useEffect(() => {
    if (!eventId) return;
    api.get('/organizer/events').then(({ data }) => {
      const event = data.find((item) => item.id === Number(eventId));
      if (!event) throw new Error('Event not found');
      setForm({
        ...event,
        event_date: toDateInput(event.event_date),
        event_end_date: toDateInput(event.event_end_date),
      });
    }).catch((err) => setError(err.response?.data?.detail || err.message || 'Unable to load the event.'))
      .finally(() => setLoading(false));
  }, [eventId]);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    const payload = {
      ...form,
      event_date: new Date(form.event_date).toISOString(),
      event_end_date: form.event_end_date ? new Date(form.event_end_date).toISOString() : null,
      ticket_price: Number(form.ticket_price),
      total_tickets: Number(form.total_tickets),
    };
    try {
      if (eventId) await api.put(`/organizer/events/${eventId}`, payload);
      else await api.post('/organizer/events', payload);
      navigate('/organizer/events');
    } catch (err) {
      setError(err.response?.data?.detail || 'Unable to save the event.');
    }
  };

  if (loading) return <div className="py-20 text-center text-slate-500">Loading event...</div>;
  return (
    <section className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-3xl font-bold text-slate-900">{eventId ? 'Edit event' : 'Create event'}</h1>
      <ErrorMessage>{error}</ErrorMessage>
      <form onSubmit={submit} className="grid gap-4 rounded-xl border border-slate-200 bg-white p-6 sm:grid-cols-2">
        <label className="text-sm font-semibold text-slate-700 sm:col-span-2">Event title<input className={`${inputClass} mt-1`} required maxLength="150" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
        <label className="text-sm font-semibold text-slate-700 sm:col-span-2">Description<textarea className={`${inputClass} mt-1`} required rows="4" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        <label className="text-sm font-semibold text-slate-700">Category<select className={`${inputClass} mt-1`} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value, location: defaultCityByCategory[e.target.value] })}>{['Music', 'Tech', 'Sports', 'Business', 'Food & Drink'].map((category) => <option key={category}>{category}</option>)}</select></label>
        <label className="text-sm font-semibold text-slate-700">Indian city<select className={`${inputClass} mt-1`} required value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}>{citiesByCategory[form.category].map((city) => <option key={city}>{city}</option>)}</select></label>
        <label className="text-sm font-semibold text-slate-700 sm:col-span-2">Venue name<input className={`${inputClass} mt-1`} required minLength="1" maxLength="150" value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} placeholder="e.g. Mahalaxmi Racecourse" /></label>
        <label className="text-sm font-semibold text-slate-700">Starts<input className={`${inputClass} mt-1`} required type="datetime-local" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} /></label>
        <label className="text-sm font-semibold text-slate-700">Ends (optional)<input className={`${inputClass} mt-1`} type="datetime-local" value={form.event_end_date || ''} onChange={(e) => setForm({ ...form, event_end_date: e.target.value })} /></label>
        <label className="text-sm font-semibold text-slate-700">Ticket price (INR ₹)<input className={`${inputClass} mt-1`} required type="number" min="0" step="0.01" value={form.ticket_price} onChange={(e) => setForm({ ...form, ticket_price: e.target.value })} /></label>
        <label className="text-sm font-semibold text-slate-700">Total tickets<input className={`${inputClass} mt-1`} required type="number" min="1" value={form.total_tickets} onChange={(e) => setForm({ ...form, total_tickets: e.target.value })} /></label>
        <label className="text-sm font-semibold text-slate-700 sm:col-span-2">Banner image URL<input className={`${inputClass} mt-1`} type="url" maxLength="2048" value={form.banner_image || ''} onChange={(e) => setForm({ ...form, banner_image: e.target.value })} /></label>
        <div className="flex gap-3 sm:col-span-2">
          <button className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white" type="submit">Save event</button>
          <Link to="/organizer/events" className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700">Cancel</Link>
        </div>
      </form>
    </section>
  );
}

export function OrganizerEventBookings() {
  const { eventId } = useParams();
  const [bookings, setBookings] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    api.get(`/organizer/events/${eventId}/bookings`)
      .then(({ data }) => setBookings(data))
      .catch((err) => setError(err.response?.data?.detail || 'Unable to load event bookings.'));
  }, [eventId]);
  return (
    <section className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between"><h1 className="text-3xl font-bold text-slate-900">Event bookings</h1><Link to="/organizer/events" className="text-sm font-semibold text-blue-600">Back to events</Link></div>
      <ErrorMessage>{error}</ErrorMessage>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[650px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-4">Booking</th><th className="p-4">Attendee / contact</th><th className="p-4">Event</th><th className="p-4">Tickets</th><th className="p-4">Total</th><th className="p-4">Status</th><th className="p-4">Booked at</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {bookings.map((booking) => {
              const subject = encodeURIComponent(`SmartEvent booking #${booking.id}: ${booking.event.title}`);
              const body = encodeURIComponent(`Hello ${booking.user.username},\n\nI am contacting you about booking #${booking.id} for ${booking.event.title}.`);
              return <tr key={booking.id}>
                <td className="p-4">#{booking.id}</td>
                <td className="p-4">
                  <p className="font-medium text-slate-800">{booking.user.username}</p>
                  <a className="text-blue-600 hover:underline" href={`mailto:${booking.user.email}?subject=${subject}&body=${body}`}>{booking.user.email}</a>
                </td>
                <td className="p-4">{booking.event.title}</td>
                <td className="p-4">{booking.ticket_quantity}</td>
                <td className="p-4">{formatINR(booking.final_amount ?? booking.total_price)}</td>
                <td className="p-4">{booking.booking_status}</td>
                <td className="p-4">{new Date(booking.created_at).toLocaleString()}</td>
              </tr>;
            })}
            {bookings.length === 0 && !error && <tr><td colSpan="7" className="p-8 text-center text-slate-500">No bookings for this event yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
