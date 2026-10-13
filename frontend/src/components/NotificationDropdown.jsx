import React, { useContext, useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import { AuthContext } from '../context/AuthContext';

export default function NotificationDropdown() {
  const { user } = useContext(AuthContext);
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const rootRef = useRef(null);
  const unreadCount = notifications.filter((notification) => !notification.is_read).length;

  const loadNotifications = async () => {
    try {
      const response = await api.get('/notifications');
      setNotifications(response.data);
      setError('');
    } catch {
      setError('Notifications could not be loaded.');
    }
  };

  useEffect(() => {
    if (user) loadNotifications();
  }, [user]);

  useEffect(() => {
    const closeOnOutsideClick = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, []);

  const markAsRead = async (notification) => {
    if (notification.is_read) return;
    try {
      await api.put(`/notifications/${notification.id}/read`);
      setNotifications((current) => current.map((item) => (
        item.id === notification.id ? { ...item, is_read: true } : item
      )));
    } catch {
      setError('This notification could not be marked as read.');
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.put('/notifications/read-all');
      setNotifications((current) => current.map((item) => ({ ...item, is_read: true })));
    } catch {
      setError('Notifications could not be marked as read.');
    }
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={open}
        onClick={() => { setOpen((value) => !value); if (!open) loadNotifications(); }}
        className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100 hover:text-blue-600"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="font-semibold text-slate-900">Notifications</h2>
            <div className="flex items-center gap-3">
              {unreadCount > 0 && <button type="button" onClick={markAllAsRead} className="text-xs font-semibold text-slate-500 hover:text-blue-600">Mark all read</button>}
              <Link to="/notifications" onClick={() => setOpen(false)} className="text-xs font-semibold text-blue-600 hover:underline">View all</Link>
            </div>
          </div>
          {error ? (
            <p role="alert" className="p-4 text-sm text-rose-600">{error}</p>
          ) : notifications.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">You’re all caught up.</p>
          ) : (
            <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
              {notifications.slice(0, 6).map((notification) => (
                <li key={notification.id}>
                  <button
                    type="button"
                    onClick={() => markAsRead(notification)}
                    className={`w-full px-4 py-3 text-left hover:bg-slate-50 ${notification.is_read ? '' : 'bg-blue-50/60'}`}
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-800">{notification.title}</span>
                      {!notification.is_read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-600" />}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-slate-600">{notification.message}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}