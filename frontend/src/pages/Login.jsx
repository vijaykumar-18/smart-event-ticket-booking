import React, { useState, useContext } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { Calendar, CheckCircle2, Eye, EyeOff, LogIn } from 'lucide-react';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useContext(AuthContext);
  const location = useLocation();
  const navigate = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await login(username, password);
      const destination = result.user.role === 'ADMIN'
        ? '/admin'
        : result.user.role === 'ORGANIZER'
          ? '/organizer'
          : '/';
      navigate(destination, { replace: true });
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Invalid username or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative isolate min-h-[calc(100vh-4rem)] overflow-hidden flex items-center justify-center bg-gradient-to-br from-slate-100 via-white to-blue-100 p-4 sm:p-6 lg:p-8">
      <div aria-hidden="true" className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-indigo-300/30 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-cyan-300/30 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.16] [background-image:radial-gradient(#64748b_0.7px,transparent_0.7px)] [background-size:22px_22px]" />
      <div className="relative w-full max-w-4xl bg-white/90 backdrop-blur-xl rounded-3xl shadow-xl border border-white/80 overflow-hidden grid grid-cols-1 md:grid-cols-2">
        <div className="bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-950 p-8 sm:p-10 text-white flex flex-col justify-between">
          <div>
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-full text-xs font-semibold mb-6">
              <Calendar className="w-4 h-4 text-blue-300" />
              <span>SmartEvent portal</span>
            </div>

            <h2 className="text-3xl font-extrabold tracking-tight leading-snug">
              Welcome back to your event journey.
            </h2>
            <p className="mt-3 text-sm text-slate-300 leading-relaxed">
              Sign in to find your bookings and digital passes, or pick up where you left off managing your events.
            </p>

            <div className="mt-8 space-y-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-blue-300 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold">Your tickets, ready to go</p>
                  <p className="text-xs text-slate-300">Open your bookings and access your QR passes.</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-blue-300 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold">Your events, all in one place</p>
                  <p className="text-xs text-slate-300">Organizers can manage events and monitor ticket sales.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-white/10 text-xs text-slate-400">
            Secure sign-in to SmartEvent
          </div>
        </div>

        <div className="p-8 sm:p-10 flex flex-col justify-center">
          <div className="mb-6">
            <h3 className="text-2xl font-bold text-slate-900">Sign in</h3>
            <p className="text-xs text-slate-500 mt-1">Enter your credentials to access your account</p>
          </div>

          {location.state?.registered && (
            <div role="status" className="p-3 mb-4 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl">
              Account created. Sign in to continue.
            </div>
          )}

          {error && (
            <div role="alert" className="p-3 mb-4 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-xl">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="login-username" className="block text-xs font-semibold text-slate-700 mb-1">Username or email</label>
              <input
                id="login-username"
                type="text"
                required
                autoComplete="username"
                placeholder="username or email"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
              />
            </div>

            <div>
              <label htmlFor="login-password" className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((visible) => !visible)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 hover:text-blue-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 mt-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm transition shadow-md shadow-blue-500/20 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              <LogIn className="w-4 h-4" />
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <p className="text-center text-xs text-slate-500 mt-6">
            Don’t have an account yet?{' '}
            <Link to="/register" className="text-blue-600 font-semibold hover:underline">Create an account</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
