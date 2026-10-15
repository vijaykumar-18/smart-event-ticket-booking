import React, { useContext } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Calendar, Ticket, User, LogOut, Menu, X, Bookmark } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import NotificationDropdown from './NotificationDropdown';

export default function Navbar() {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = React.useState(false);

  return (
    <nav className="bg-white border-b border-slate-200 sticky top-0 z-40">
      <div className="relative mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        <Link to="/" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 font-bold text-xl text-blue-600">
          <Calendar className="w-6 h-6" />
          <span>SmartEvent</span>
        </Link>

        <button type="button" aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden">
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        <div className={`${menuOpen ? 'absolute left-0 right-0 top-16 flex flex-col items-stretch border-b border-slate-200 bg-white p-4 shadow-lg' : 'hidden'} z-50 gap-4 md:static md:flex md:flex-row md:items-center md:border-0 md:bg-transparent md:p-0 md:shadow-none`}>
          <Link to="/" onClick={() => setMenuOpen(false)} className="text-sm font-medium text-slate-600 hover:text-blue-600">Discover</Link>
          {user ? (
            <>
              {user.role === 'USER' && (
                <>
                  <Link to="/wishlist" onClick={() => setMenuOpen(false)} className="text-sm font-medium text-slate-600 hover:text-blue-600 flex items-center gap-1">
                    <Bookmark className="w-4 h-4" /> Wishlist
                  </Link>
                  <Link to="/bookings" onClick={() => setMenuOpen(false)} className="text-sm font-medium text-slate-600 hover:text-blue-600 flex items-center gap-1">
                    <Ticket className="w-4 h-4" /> Bookings
                  </Link>
                  <Link to="/tickets" onClick={() => setMenuOpen(false)} className="text-sm font-medium text-slate-600 hover:text-blue-600">Tickets</Link>
                </>
              )}
              <Link to="/profile" onClick={() => setMenuOpen(false)} className="text-sm font-medium text-slate-600 hover:text-blue-600">Profile</Link>
              {user.role === 'ORGANIZER' && (
                <>
                  <Link to="/organizer" onClick={() => setMenuOpen(false)} className="text-sm font-medium text-slate-600 hover:text-blue-600">Organizer</Link>
                  <Link to="/organizer/coupons" onClick={() => setMenuOpen(false)} className="text-sm font-medium text-slate-600 hover:text-blue-600">Coupons</Link>
                </>
              )}
              {user.role === 'ADMIN' && (
                <Link to="/admin" onClick={() => setMenuOpen(false)} className="text-sm font-medium text-slate-600 hover:text-blue-600">Admin dashboard</Link>
              )}
              <div className="hidden md:block"><NotificationDropdown /></div>
              <Link to="/notifications" onClick={() => setMenuOpen(false)} className="text-sm font-medium text-slate-600 hover:text-blue-600 md:hidden">Notifications</Link>
              <div className="flex items-center gap-3 pl-2 border-l border-slate-200">
                <span className="text-sm font-semibold text-slate-700 flex items-center gap-1">
                  <User className="w-4 h-4" /> {user.username}
                </span>
                <button
                  onClick={() => { logout(); setMenuOpen(false); navigate('/login'); }}
                  className="p-2 text-slate-500 hover:text-rose-600"
                  title="Logout"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Link to="/login" onClick={() => setMenuOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-blue-600">Sign In</Link>
              <Link to="/register" onClick={() => setMenuOpen(false)} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg">Register</Link>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}