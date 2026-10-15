import React, { createContext, useState, useEffect } from 'react';
import api from '../api/axios';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [wishlistIds, setWishlistIds] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const res = await api.get('/auth/profile');
          setUser(res.data);
        } catch (error) {
          localStorage.removeItem('token');
          setUser(null);
          if (error.response && error.response.status !== 401) {
            console.error('Unable to load the current user profile.', error);
          }
        }
      }
      setLoading(false);
    };
    fetchUser();
  }, []);

  useEffect(() => {
    let active = true;
    if (user?.role !== 'USER') {
      setWishlistIds([]);
      return () => { active = false; };
    }
    api.get('/wishlist')
      .then((response) => {
        if (active) setWishlistIds(response.data.map((item) => item.event_id));
      })
      .catch(() => {
        if (active) setWishlistIds([]);
      });
    return () => { active = false; };
  }, [user?.id, user?.role]);

  const login = async (username, password) => {
    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);

    const res = await api.post('/auth/login', formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    localStorage.setItem('token', res.data.access_token);
    setUser(res.data.user);
    return res.data;
  };

  const register = async (username, email, password, role = 'USER') => {
    return await api.post('/auth/register', { username, email, password, role });
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  const toggleWishlist = async (eventId) => {
    if (!user || user.role !== 'USER') throw new Error('Sign in as an attendee to save events.');
    if (wishlistIds.includes(eventId)) {
      await api.delete(`/wishlist/${eventId}`);
      setWishlistIds((current) => current.filter((id) => id !== eventId));
      return false;
    }
    await api.post(`/wishlist/${eventId}`);
    setWishlistIds((current) => current.includes(eventId) ? current : [...current, eventId]);
    return true;
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, loading, wishlistIds, toggleWishlist, setUser }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};