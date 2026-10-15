import React, { useContext, useEffect, useState } from 'react';
import { Camera, Ticket } from 'lucide-react';
import api, { assetBaseUrl } from '../api/axios';
import { AuthContext } from '../context/AuthContext';
import { formatINR } from '../utils/currency';

export default function Profile() {
  const { user, setUser } = useContext(AuthContext);
  const [form, setForm] = useState({ username: user?.username || '', email: user?.email || '', location: user?.location || '' });
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api.get('/auth/profile/summary')
      .then((response) => { if (active) setSummary(response.data); })
      .catch(() => { if (active) setError('Unable to load your booking summary.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const updateField = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  const saveProfile = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await api.put('/auth/profile', {
        username: form.username,
        email: form.email,
        location: form.location,
      });
      setUser(response.data);
      setMessage('Profile updated.');
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Unable to update your profile.');
    } finally {
      setSaving(false);
    }
  };

  const uploadPicture = async (event) => {
    const picture = event.target.files?.[0];
    if (!picture) return;
    const data = new FormData();
    data.append('picture', picture);
    setError('');
    setMessage('');
    try {
      const response = await api.post('/auth/profile/picture', data);
      setUser(response.data);
      setMessage('Profile picture updated.');
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Unable to upload the profile picture.');
    } finally {
      event.target.value = '';
    }
  };

  const pictureUrl = user?.profile_picture_url
    ? `${assetBaseUrl}${user.profile_picture_url}`
    : '';

  return (
    <section className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">Account</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">Your profile</h1>
      </div>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <form onSubmit={saveProfile} className="space-y-5 border-y border-slate-200 py-6">
          <div className="flex items-center gap-4">
            {pictureUrl ? <img src={pictureUrl} alt="Profile" className="h-16 w-16 rounded-full object-cover" /> : <div className="grid h-16 w-16 place-items-center rounded-full bg-slate-100 text-slate-500"><Camera className="h-6 w-6" /></div>}
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Camera className="h-4 w-4" /> Upload photo
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadPicture} className="sr-only" />
            </label>
          </div>
          <div>
            <label htmlFor="profile-username" className="mb-1 block text-sm font-semibold text-slate-700">Username</label>
            <input id="profile-username" required minLength={3} maxLength={50} value={form.username} onChange={updateField('username')} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100" />
          </div>
          <div>
            <label htmlFor="profile-email" className="mb-1 block text-sm font-semibold text-slate-700">Email</label>
            <input id="profile-email" type="email" required value={form.email} onChange={updateField('email')} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100" />
          </div>
          <div>
            <label htmlFor="profile-location" className="mb-1 block text-sm font-semibold text-slate-700">City</label>
            <input id="profile-location" maxLength={150} value={form.location} onChange={updateField('location')} placeholder="For nearby recommendations" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100" />
          </div>
          {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
          {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
          <button type="submit" disabled={saving} className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60">{saving ? 'Saving...' : 'Save profile'}</button>
        </form>

        <aside className="h-fit border-y border-slate-200 py-6">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><Ticket className="h-5 w-5 text-blue-700" /> Booking summary</h2>
          {loading ? <p className="mt-4 text-sm text-slate-500">Loading summary...</p> : summary ? (
            <dl className="mt-5 space-y-4 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Bookings</dt><dd className="font-semibold text-slate-900">{summary.booking_count}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Confirmed</dt><dd className="font-semibold text-slate-900">{summary.confirmed_bookings}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Tickets</dt><dd className="font-semibold text-slate-900">{summary.tickets_booked}</dd></div>
              <div className="flex justify-between gap-3 border-t border-slate-200 pt-4"><dt className="text-slate-500">Total spent</dt><dd className="font-bold text-slate-900">{formatINR(summary.total_spent)}</dd></div>
            </dl>
          ) : <p className="mt-4 text-sm text-slate-500">Summary is unavailable.</p>}
        </aside>
      </div>
    </section>
  );
}