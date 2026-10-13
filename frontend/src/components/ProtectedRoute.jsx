import React, { useContext } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

export default function ProtectedRoute({ roles }) {
  const { user, loading } = useContext(AuthContext);
  if (loading) return <div className="py-20 text-center text-slate-500">Loading your account...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return roles && !roles.includes(user.role)
    ? <Navigate to="/" replace />
    : <Outlet />;
}