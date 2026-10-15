import React, { useState, useEffect, useContext } from 'react';
import { Search } from 'lucide-react';
import api from '../api/axios';
import EventCard from '../components/EventCard';
import { AuthContext } from '../context/AuthContext';
import { formatINR } from '../utils/currency';

const CATEGORIES = ['All', 'Music', 'Tech', 'Sports', 'Business', 'Food & Drink'];

export default function Home() {
  const { user } = useContext(AuthContext);
  const [events, setEvents] = useState([]);
  const [recommended, setRecommended] = useState([]);
  const [trending, setTrending] = useState([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [location, setLocation] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [minPrice, setMinPrice] = useState('0');
  const [maxPrice, setMaxPrice] = useState('50000');
  const [sort, setSort] = useState('date');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const res = await api.get('/events', {
        params: {
          search: search || undefined,
          category: category !== 'All' ? category : undefined,
          location: location || undefined,
          start_date: startDate || undefined,
          end_date: endDate || undefined,
          min_price: minPrice ? Number(minPrice) : undefined,
          max_price: maxPrice ? Number(maxPrice) : undefined,
          sort,
        },
      });
      setEvents(res.data);
      setError('');
    } catch {
      setError('Unable to load events. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [category]);

  useEffect(() => {
    let active = true;
    api.get('/events/trending')
      .then((response) => { if (active) setTrending(response.data); })
      .catch(() => { if (active) setTrending([]); });
    if (user?.role === 'USER') {
      api.get('/events/recommendations')
        .then((response) => { if (active) setRecommended(response.data); })
        .catch(() => { if (active) setRecommended([]); });
    } else {
      setRecommended([]);
    }
    return () => { active = false; };
  }, [user?.id, user?.role]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Hero Header */}
      <div className="relative isolate mb-8 overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-800 px-6 py-12 text-white shadow-xl sm:px-10 sm:py-16">
        <div className="pointer-events-none absolute -right-10 -top-20 h-64 w-64 rounded-full bg-blue-400/20 blur-3xl" />
        <div className="relative max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-200">Make your next memory</p>
          <h1 className="mt-3 text-4xl font-extrabold leading-tight sm:text-5xl">Find your people.<br />Feel the moment.</h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-blue-100 sm:text-base">Discover standout concerts, conferences, food festivals and live sports near you.</p>
          <a href="#event-results" className="mt-6 inline-flex rounded-lg bg-white px-5 py-3 text-sm font-bold text-blue-900 transition hover:bg-blue-50">Explore events</a>
        </div>
      </div>

      {/* Search and Filter Section */}
      <form
        onSubmit={(e) => { e.preventDefault(); fetchEvents(); }}
        className="mb-5 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-6"
      >
        <div className="relative sm:col-span-2 lg:col-span-2">
          <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search event title..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select aria-label="Filter by city" value={location} onChange={(e) => setLocation(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
          <option value="">All locations</option>
          {['Mumbai', 'Chennai', 'Hyderabad', 'Pune', 'Goa', 'Kolkata', 'Delhi', 'Ahmedabad', 'Bengaluru', 'Gurugram', 'Jaipur', 'Kochi'].map((city) => <option key={city} value={city}>{city}</option>)}
        </select>
        <label className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-500">
          From <input aria-label="Start date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="min-w-0 flex-1 text-sm text-slate-700 outline-none" />
        </label>
        <label className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-500">
          To <input aria-label="End date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="min-w-0 flex-1 text-sm text-slate-700 outline-none" />
        </label>
        <select aria-label="Sort events" value={sort} onChange={(e) => setSort(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
          <option value="date">Sort: Date</option>
          <option value="popularity">Sort: Popularity</option>
          <option value="price">Sort: Price</option>
        </select>
        <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 sm:col-span-2 lg:col-span-6">Search events</button>
      </form>
      <div className="mb-5 grid gap-4 border-b border-slate-200 pb-5 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-slate-600">
          Minimum price <span className="float-right text-slate-900">{formatINR(Number(minPrice) || 0)}</span>
          <input type="range" min="0" max={Math.max(50000, Number(maxPrice) || 0)} step="500" value={minPrice} onChange={(event) => setMinPrice(String(Math.min(Number(event.target.value), Number(maxPrice) || 50000)))} className="mt-2 w-full accent-blue-700" />
        </label>
        <label className="block text-xs font-semibold text-slate-600">
          Maximum price <span className="float-right text-slate-900">{formatINR(Number(maxPrice) || 0)}</span>
          <input type="range" min={Number(minPrice) || 0} max="100000" step="500" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} className="mt-2 w-full accent-blue-700" />
        </label>
      </div>
      <div className="mb-8 flex gap-2 overflow-x-auto pb-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition ${
                category === cat ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
      </div>

      {user?.role === 'USER' && recommended.length > 0 && <section className="mb-9">
        <div className="mb-4"><p className="text-sm font-semibold uppercase tracking-wide text-blue-600">Based on your activity</p><h2 className="mt-1 text-xl font-bold text-slate-900">Recommended for you</h2></div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">{recommended.slice(0, 4).map((event) => <EventCard key={`recommended-${event.id}`} event={event} />)}</div>
      </section>}

      {trending.length > 0 && <section className="mb-9">
        <div className="mb-4"><p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Most booked</p><h2 className="mt-1 text-xl font-bold text-slate-900">Trending events</h2></div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">{trending.slice(0, 4).map((event) => <EventCard key={`trending-${event.id}`} event={event} />)}</div>
      </section>}

      {/* Grid */}
      <div id="event-results" className="mb-4 flex items-end justify-between">
        <div><p className="text-sm font-semibold uppercase tracking-wide text-blue-600">Curated for you</p><h2 className="mt-1 text-2xl font-bold text-slate-900">Upcoming events</h2></div>
        {!loading && !error && <span className="text-sm text-slate-500">{events.length} {events.length === 1 ? 'event' : 'events'}</span>}
      </div>
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-72 bg-slate-100 animate-pulse rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-center text-rose-700">
          {error}
          <button type="button" onClick={fetchEvents} className="ml-2 font-semibold underline">Retry</button>
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-16 text-slate-500">No events found matching your search.</div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {events.map((evt) => (
            <EventCard key={evt.id} event={evt} />
          ))}
        </div>
      )}
    </div>
  );
}