import React, { useCallback, useEffect, useState } from 'react';
import api from '../api/axios';

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadNotifications = useCallback(async () => {
    try {
      const response = await api.get('/notifications');
      setNotifications(response.data);
      setError('');
    } catch {
      setError('Unable to load your notifications. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadNotifications(); }, [loadNotifications]);

  const markAsRead = async (notification) => {
    if (notification.is_read) return;
    try {
      await api.put(`/notifications/${notification.id}/read`);
      setNotifications((current) => current.map((item) => (
        item.id === notification.id ? { ...item, is_read: true } : item
      )));
    } catch {
      setError('Unable to mark this notification as read.');
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.put('/notifications/read-all');
      setNotifications((current) => current.map((notification) => ({ ...notification, is_read: true })));
    } catch {
      setError('Unable to mark notifications as read.');
    }
  };

  return (
    <section className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Notifications</h1>
        <div className="flex gap-4">
          {notifications.some((notification) => !notification.is_read) && <button type="button" onClick={markAllAsRead} className="text-sm font-semibold text-slate-600 hover:underline">Mark all read</button>}
          <button type="button" onClick={loadNotifications} className="text-sm font-semibold text-blue-600 hover:underline">Refresh</button>
        </div>
      </div>
      {error && <p role="alert" className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {loading ? (
        <p className="py-12 text-center text-slate-500">Loading notifications...</p>
      ) : notifications.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">You have no notifications.</div>
      ) : (
        <ul className="space-y-3">
          {notifications.map((notification) => (
            <li key={notification.id}>
              <button
                type="button"
                onClick={() => markAsRead(notification)}
                className={`w-full rounded-xl border p-4 text-left transition hover:border-blue-300 ${notification.is_read ? 'border-slate-200 bg-white' : 'border-blue-200 bg-blue-50/70'}`}
              >
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-slate-900">{notification.title}</span>
                  <span className="text-xs uppercase tracking-wide text-slate-500">{notification.type}</span>
                </span>
                <span className="mt-2 block text-sm text-slate-600">{notification.message}</span>
                <span className="mt-3 block text-xs text-slate-400">
                  {new Date(notification.created_at).toLocaleString()}
                  {notification.is_read ? ' · Read' : ' · Click to mark as read'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}