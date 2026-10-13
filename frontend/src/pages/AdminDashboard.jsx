import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import api from '../api/axios';
import { formatINR } from '../utils/currency';

const sections = [
  ['/admin', 'Overview'],
  ['/admin/analytics', 'Analytics'],
  ['/admin/users', 'Users'],
  ['/admin/events', 'Events'],
  ['/admin/bookings', 'Bookings'],
];
const panelClass = 'rounded-xl border border-slate-200 bg-white p-5 shadow-sm';

function AdminError({ children }) {
  return children ? <p role="alert" className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{children}</p> : null;
}

function BarList({ items, labelKey, valueKey, formatValue = (value) => value }) {
  const max = Math.max(1, ...items.map((item) => Number(item[valueKey])));
  if (!items.length) return <p className="py-6 text-sm text-slate-500">No data for this period.</p>;
  return <div className="space-y-4">{items.map((item) => (
    <div key={item[labelKey]}>
      <div className="mb-1 flex justify-between gap-3 text-sm"><span className="truncate">{item[labelKey]}</span><span className="font-semibold">{formatValue(item[valueKey])}</span></div>
      <div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-blue-600" style={{ width: `${Math.max(2, Number(item[valueKey]) / max * 100)}%` }} /></div>
    </div>
  ))}</div>;
}

export default function AdminDashboard() {
  const { pathname } = useLocation();
  const section = sections.find(([path]) => path === pathname)?.[1] || 'Overview';
  const [analytics, setAnalytics] = useState(null);
  const [users, setUsers] = useState([]);
  const [events, setEvents] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      if (section === 'Overview' || section === 'Analytics') {
        const { data } = await api.get('/admin/analytics', {
          params: { start_date: from || undefined, end_date: to || undefined },
        });
        setAnalytics(data);
      } else if (section === 'Users') {
        const { data } = await api.get('/admin/users');
        setUsers(data);
      } else if (section === 'Events') {
        const { data } = await api.get('/admin/events');
        setEvents(data);
      } else {
        const { data } = await api.get('/admin/bookings', {
          params: { start_date: from || undefined, end_date: to || undefined },
        });
        setBookings(data);
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Unable to load administrator data.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [section, from, to]);

  const changeRole = async (userId, role) => {
    try {
      await api.put(`/admin/users/${userId}/role`, { role });
      setUsers((current) => current.map((user) => user.id === userId ? { ...user, role } : user));
    } catch (err) {
      setError(err.response?.data?.detail || 'Unable to update this user role.');
      load();
    }
  };

  return (
    <section className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6"><h1 className="text-3xl font-bold text-slate-900">Admin dashboard</h1><p className="mt-1 text-slate-600">Platform activity, users, events, and bookings.</p></div>
      <nav className="mb-6 flex flex-wrap gap-2">{sections.map(([path, label]) => (
        <Link key={path} to={path} className={`rounded-lg px-4 py-2 text-sm font-semibold ${section === label ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:text-blue-600'}`}>{label}</Link>
      ))}</nav>
      {(section === 'Analytics' || section === 'Bookings') && (
        <div className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <label className="text-sm font-medium text-slate-700">From<input className="mt-1 block rounded-lg border border-slate-300 p-2 text-sm" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="text-sm font-medium text-slate-700">To<input className="mt-1 block rounded-lg border border-slate-300 p-2 text-sm" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <button onClick={() => { setFrom(''); setTo(''); }} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600">Clear</button>
        </div>
      )}
      <AdminError>{error}</AdminError>
      {loading && <p className="py-10 text-center text-slate-500">Loading dashboard...</p>}

      {!loading && analytics && (section === 'Overview' || section === 'Analytics') && (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {[
              ['Registered users', analytics.total_users],
              ['Events', analytics.total_events],
              ['Tickets sold', analytics.total_tickets_sold],
              ['Bookings', analytics.total_bookings],
              ['Platform revenue', formatINR(analytics.platform_revenue)],
            ].map(([label, value]) => <div className={panelClass} key={label}><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-slate-900">{value}</p></div>)}
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <div className={panelClass}><h2 className="mb-4 font-bold text-slate-900">Daily ticket sales</h2><BarList items={analytics.daily_ticket_sales} labelKey="date" valueKey="tickets_sold" /></div>
            <div className={panelClass}><h2 className="mb-4 font-bold text-slate-900">Monthly booking trends</h2><BarList items={analytics.monthly_booking_trends} labelKey="month" valueKey="bookings" /></div>
            <div className={panelClass}><h2 className="mb-4 font-bold text-slate-900">Most popular events</h2><BarList items={analytics.popular_events} labelKey="title" valueKey="tickets_sold" /></div>
            <div className={panelClass}><h2 className="mb-4 font-bold text-slate-900">Top revenue events</h2><BarList items={analytics.top_revenue_events} labelKey="title" valueKey="revenue" formatValue={formatINR} /></div>
          </div>
        </>
      )}

      {!loading && section === 'Users' && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-4">User</th><th className="p-4">Email</th><th className="p-4">Joined</th><th className="p-4">Role</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{users.map((user) => <tr key={user.id}><td className="p-4 font-semibold">{user.username}</td><td className="p-4">{user.email}</td><td className="p-4">{new Date(user.created_at).toLocaleDateString()}</td><td className="p-4"><select aria-label={`Role for ${user.username}`} className="rounded-lg border border-slate-300 p-2" value={user.role} onChange={(e) => changeRole(user.id, e.target.value)}>{['USER', 'ORGANIZER', 'ADMIN'].map((role) => <option key={role}>{role}</option>)}</select></td></tr>)}</tbody>
          </table>
        </div>
      )}

      {!loading && section === 'Events' && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[800px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-4">Event</th><th className="p-4">Venue</th><th className="p-4">City</th><th className="p-4">Organizer</th><th className="p-4">Date</th><th className="p-4">Status</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{events.map((event) => <tr key={event.id}><td className="p-4 font-semibold">{event.title}</td><td className="p-4">{event.venue}</td><td className="p-4">{event.location}</td><td className="p-4">{event.organizer_id ?? 'Platform'}</td><td className="p-4">{new Date(event.event_date).toLocaleString()}</td><td className="p-4">{event.event_status}</td></tr>)}</tbody>
          </table>
        </div>
      )}

      {!loading && section === 'Bookings' && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[800px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-4">Booking</th><th className="p-4">Customer</th><th className="p-4">Event</th><th className="p-4">Tickets</th><th className="p-4">Total</th><th className="p-4">Status</th><th className="p-4">Date</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{bookings.map((booking) => <tr key={booking.id}><td className="p-4">#{booking.id}</td><td className="p-4">{booking.user.username}</td><td className="p-4">{booking.event.title}</td><td className="p-4">{booking.ticket_quantity}</td><td className="p-4">{formatINR(booking.final_amount ?? booking.total_price)}</td><td className="p-4">{booking.booking_status}</td><td className="p-4">{new Date(booking.created_at).toLocaleString()}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}
