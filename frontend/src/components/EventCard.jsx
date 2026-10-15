import React, { useContext, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, Calendar, MapPin } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { formatINR } from '../utils/currency';

export default function EventCard({ event }) {
  const { user, wishlistIds, toggleWishlist } = useContext(AuthContext);
  const [saving, setSaving] = useState(false);
  const [wishlistError, setWishlistError] = useState('');
  const saved = wishlistIds.includes(event.id);

  const handleWishlist = async () => {
    if (!user || user.role !== 'USER' || saving) return;
    setSaving(true);
    setWishlistError('');
    try {
      await toggleWishlist(event.id);
    } catch {
      setWishlistError('Unable to update wishlist.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="group bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col transition duration-300 hover:-translate-y-1 hover:border-blue-200 hover:shadow-xl">
     <img
  src={event.banner_image || 'https://images.unsplash.com/photo-1506157786151-b8491531f063?w=800&auto=format&fit=crop&q=60'}
  alt={event.title}
  onError={(e) => {
    e.target.onerror = null;
    e.target.src = 'https://images.unsplash.com/photo-1531415074968-036ba1b575da?w=800&auto=format&fit=crop&q=60';
  }}
  className="w-full h-44 object-cover transition duration-500 group-hover:scale-105"
/>
      <div className="p-4 flex-1 flex flex-col">
        {wishlistError && <p role="alert" className="mb-2 text-xs text-rose-700">{wishlistError}</p>}
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="text-xs uppercase font-bold text-blue-600">{event.category}</span>
          <div className="flex items-center gap-2">
            {event.average_rating ? <span className="text-xs font-semibold text-amber-600">★ {event.average_rating.toFixed(1)} ({event.review_count})</span> : null}
            {user?.role === 'USER' && <button type="button" onClick={handleWishlist} disabled={saving} aria-label={saved ? 'Remove event from wishlist' : 'Save event to wishlist'} aria-pressed={saved} title={saved ? 'Remove from wishlist' : 'Save to wishlist'} className={`rounded p-1.5 transition ${saved ? 'text-blue-700' : 'text-slate-400 hover:text-blue-700'} disabled:opacity-50`}>
              <Bookmark className="h-4 w-4" fill={saved ? 'currentColor' : 'none'} />
            </button>}
          </div>
        </div>
        <h3 className="font-semibold text-slate-900 text-lg line-clamp-1 mb-2">{event.title}</h3>
        
        <div className="space-y-1 text-xs text-slate-500 mb-4 flex-1">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" />
            <span>{new Date(event.event_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5" />
            <span className="line-clamp-1">{event.venue}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5" />
            <span className="line-clamp-1">{event.location}</span>
          </div>
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
          <div>
            <span className="text-xs text-slate-400 block">Price</span>
            <span className="font-bold text-slate-900">{formatINR(event.ticket_price)}</span>
          </div>
          <Link
            to={`/events/${event.id}`}
            className="px-3 py-1.5 text-xs font-semibold text-blue-600 border border-blue-600 hover:bg-blue-50 rounded-lg transition"
          >
            View Details
          </Link>
        </div>
      </div>
    </div>
  );
}