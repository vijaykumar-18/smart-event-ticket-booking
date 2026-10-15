import React, { useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import EventCard from '../components/EventCard';
import api from '../api/axios';

export default function Wishlist() {
  const { wishlistIds } = useContext(AuthContext);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api.get('/wishlist')
      .then((response) => { if (active) setItems(response.data); })
      .catch(() => { if (active) setError('Unable to load your saved events.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [wishlistIds]);

  const events = items.filter((item) => wishlistIds.includes(item.event_id)).map((item) => item.event);

  return (
    <section className="mx-auto max-w-7xl px-4 py-10">
      <div className="mb-7 flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">Saved events</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">Your wishlist</h1>
        </div>
        <Link to="/" className="text-sm font-semibold text-blue-700 hover:text-blue-900">Discover events</Link>
      </div>
      {loading ? <p className="py-12 text-center text-slate-500">Loading saved events...</p> : error ? (
        <p role="alert" className="rounded-lg bg-rose-50 p-4 text-rose-700">{error}</p>
      ) : events.length ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {events.map((event) => <EventCard key={event.id} event={event} />)}
        </div>
      ) : (
        <div className="border-y border-slate-200 py-16 text-center">
          <p className="text-slate-600">No saved events yet.</p>
          <Link to="/" className="mt-3 inline-block font-semibold text-blue-700 hover:text-blue-900">Browse events</Link>
        </div>
      )}
    </section>
  );
}