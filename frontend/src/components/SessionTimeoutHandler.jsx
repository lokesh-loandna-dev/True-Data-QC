import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { authApi } from '../services/api';

/**
 * SessionTimeoutHandler
 * Activity-based inactivity timeout with session-expiry modal.
 * - Fetches SESSION_TIMEOUT_MINUTES from /api/auth/session-timeout
 * - Shows a warning modal 60 s before expiry with live countdown ring
 * - Shows an expired state if the countdown reaches zero without action
 * - Renders a full-screen inert backdrop that blocks the header and all app chrome
 */
const SessionTimeoutHandler = () => {
  const navigate = useNavigate();
  const { isAuthenticated, user, logout, refreshSession } = useAuth();

  const [timeoutMinutes, setTimeoutMinutes] = useState(30);
  const [isWarningOpen, setIsWarningOpen] = useState(
    typeof window !== 'undefined' && sessionStorage.getItem('session_expired_flag') === 'true'
  );
  const [countdown, setCountdown] = useState(
    typeof window !== 'undefined' && sessionStorage.getItem('session_expired_flag') === 'true' ? 0 : 60
  );
  const [isExpired, setIsExpired] = useState(
    typeof window !== 'undefined' && sessionStorage.getItem('session_expired_flag') === 'true'
  );

  const timerRef = useRef(null);
  const primaryBtnRef = useRef(null);

  // ─── Fetch session timeout config ───────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) return;
    const fetchTimeout = async () => {
      try {
        const response = await authApi.getSessionTimeout();
        if (response?.session_timeout) setTimeoutMinutes(response.session_timeout);
      } catch {
        setTimeoutMinutes(30);
      }
    };
    fetchTimeout();
  }, [isAuthenticated]);

  // ─── Session tick ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) {
      if (timerRef.current) clearInterval(timerRef.current);
      setTimeout(() => { setIsWarningOpen(false); setIsExpired(false); }, 0);
      return;
    }
    if (isExpired) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    if (!sessionStorage.getItem('session_start_time')) {
      sessionStorage.setItem('session_start_time', Date.now().toString());
    }

    const checkSession = () => {
      const startTimeStr = sessionStorage.getItem('session_start_time');
      if (!startTimeStr) return;

      const startTime = parseInt(startTimeStr, 10);
      const totalTimeoutMs = timeoutMinutes * 60 * 1000;
      const elapsedMs = Date.now() - startTime;
      const remainingMs = totalTimeoutMs - elapsedMs;
      const remainingSec = Math.ceil(remainingMs / 1000);
      const warningThresholdSec = timeoutMinutes * 60 <= 60
        ? Math.floor((timeoutMinutes * 60) / 2)
        : 60;

      if (remainingSec <= 0) {
        if (!isExpired) {
          setIsExpired(true);
          setIsWarningOpen(true);
          sessionStorage.setItem('session_expired_flag', 'true');
          sessionStorage.removeItem('session_start_time');
          if (timerRef.current) clearInterval(timerRef.current);
        }
        setCountdown(0);
      } else if (remainingSec <= warningThresholdSec) {
        setIsWarningOpen(true);
        setCountdown(remainingSec);
      } else {
        if (isWarningOpen && !isExpired) setIsWarningOpen(false);
      }
    };

    checkSession();
    timerRef.current = setInterval(checkSession, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isAuthenticated, timeoutMinutes, isExpired, isWarningOpen]);

  // ─── Activity listener ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated || isExpired || isWarningOpen) return;

    const handleActivity = () => {
      const now = Date.now();
      const lastActiveStr = sessionStorage.getItem('session_start_time');
      if (lastActiveStr) {
        const lastActive = parseInt(lastActiveStr, 10);
        if (now - lastActive > 5000) {
          sessionStorage.setItem('session_start_time', now.toString());
          try { localStorage.setItem('ops_qc_last_activity', now.toString()); } catch (_) {}
        }
      } else {
        sessionStorage.setItem('session_start_time', now.toString());
        try { localStorage.setItem('ops_qc_last_activity', now.toString()); } catch (_) {}
      }
    };

    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, handleActivity, { passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, handleActivity));
  }, [isAuthenticated, isExpired, isWarningOpen]);

  // ─── Auto-focus primary button when modal opens ──────────────────────────────
  useEffect(() => {
    if (isWarningOpen && !isExpired) {
      const t = setTimeout(() => primaryBtnRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [isWarningOpen, isExpired]);

  // ─── Keyboard handler (Esc / Enter → stay logged in) ────────────────────────
  useEffect(() => {
    if (!isWarningOpen) return;

    const handleKey = (e) => {
      if (isExpired) return;
      if (e.key === 'Escape' || (e.key === 'Enter' && e.target?.tagName !== 'BUTTON')) {
        e.preventDefault();
        handleExtendSession();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isWarningOpen, isExpired]);

  // ─── Handlers ────────────────────────────────────────────────────────────────
  const handleExtendSession = async () => {
    sessionStorage.setItem('session_start_time', Date.now().toString());
    try { localStorage.setItem('ops_qc_last_activity', Date.now().toString()); } catch (_) {}
    setIsWarningOpen(false);
    setCountdown(60);
    if (refreshSession) {
      try { await refreshSession(); } catch (err) {
        console.warn('Failed to refresh session on extend:', err);
      }
    }
  };

  const handleLogout = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setIsWarningOpen(false);
    setIsExpired(false);
    sessionStorage.removeItem('session_expired_flag');
    sessionStorage.removeItem('session_start_time');
    logout('inactivity');
    navigate('/login', { replace: true });
  };

  // ─── Set data-modal-open on <html> to freeze header & page chrome ────────────
  useEffect(() => {
    const root = document.documentElement;
    if (isWarningOpen) {
      root.setAttribute('data-modal-open', 'true');
    } else {
      root.removeAttribute('data-modal-open');
    }
    return () => root.removeAttribute('data-modal-open');
  }, [isWarningOpen]);

  if (!isWarningOpen) return null;

  // ─── Countdown ring maths ────────────────────────────────────────────────────
  const TOTAL_WARNING_SEC = 60;
  const RADIUS = 20;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const progress = isExpired ? 0 : Math.max(0, countdown / TOTAL_WARNING_SEC);
  const dashOffset = CIRCUMFERENCE * (1 - progress);
  const isUrgent = !isExpired && countdown <= 20;

  // username for identity line
  const userLabel = user?.username || user?.email || null;

  return (
    // ── Backdrop ─ z-[9999] ensures it sits above the fixed header (z-50) ──────
    // `inert` on the backdrop children + pointer-events on the backdrop itself
    // block all interaction with the header and page content underneath.
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sto-title"
      aria-describedby="sto-desc"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.55)' }}
    >
      {/* ── Card ─────────────────────────────────────────────────────────────── */}
      <div
        data-modal-layer="true"
        className="relative w-full max-w-[400px] bg-white overflow-hidden"
        style={{ borderRadius: '12px' }}
      >

        {/* ── Top accent bar ──────────────────────────────────────────────────── */}
        <div
          className="h-[3px] w-full"
          style={{ background: isExpired ? '#ef4444' : (isUrgent ? '#f59e0b' : '#1e9bd8') }}
        />

        {/* ── Body ────────────────────────────────────────────────────────────── */}
        <div className="px-7 pt-6 pb-5">

          {/* ── Header row: ring + title ────────────────────────────────────── */}
          <div className="flex items-start gap-4 mb-5">

            {/* SVG countdown ring */}
            <div className="flex-shrink-0 mt-0.5">
              {isExpired ? (
                /* Expired — static red ring with ✕ */
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center"
                  style={{ background: '#fef2f2', border: '2px solid #fca5a5' }}
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path d="M6 6l8 8M14 6l-8 8" stroke="#ef4444" strokeWidth="2.2" strokeLinecap="round"/>
                  </svg>
                </div>
              ) : (
                /* Warning — live countdown ring */
                <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden="true">
                  {/* Track */}
                  <circle
                    cx="24" cy="24" r={RADIUS}
                    fill="none"
                    stroke={isUrgent ? '#fef3c7' : '#e0f2fe'}
                    strokeWidth="4"
                  />
                  {/* Progress arc */}
                  <circle
                    cx="24" cy="24" r={RADIUS}
                    fill="none"
                    stroke={isUrgent ? '#f59e0b' : '#1e9bd8'}
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeDasharray={CIRCUMFERENCE}
                    strokeDashoffset={dashOffset}
                    transform="rotate(-90 24 24)"
                    style={{ transition: 'stroke-dashoffset 0.9s linear, stroke 0.4s' }}
                  />
                  {/* Countdown number */}
                  <text
                    x="24" y="24"
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={isUrgent ? '#d97706' : '#1e9bd8'}
                    fontSize="13"
                    fontWeight="700"
                    fontFamily="inherit"
                  >
                    {countdown}
                  </text>
                </svg>
              )}
            </div>

            {/* Title + sub */}
            <div className="flex-1 min-w-0">
              <h2
                id="sto-title"
                className="text-[17px] font-bold text-gray-900 leading-snug"
                style={{ letterSpacing: '-0.01em' }}
              >
                {isExpired ? 'Session Expired' : 'Session Expiring Soon'}
              </h2>
              {userLabel && (
                <p className="text-[12px] text-gray-400 mt-0.5 truncate">
                  Signed in as <span className="text-gray-600 font-medium">{userLabel}</span>
                </p>
              )}
            </div>
          </div>

          {/* ── Description ─────────────────────────────────────────────────── */}
          <p
            id="sto-desc"
            className="text-[14px] text-gray-600 leading-relaxed mb-5"
            style={{ maxWidth: '31ch' }}
          >
            {isExpired
              ? 'Your session ended due to inactivity. Please sign in again to continue.'
              : 'You\'ve been inactive for a while. For security, your session will end automatically.'}
          </p>

          {/* ── Remaining time block (warning only) ─────────────────────────── */}
          {!isExpired && (
            <div
              className="flex items-center justify-between px-4 py-3 mb-5"
              style={{
                background: isUrgent ? '#fffbeb' : '#f0f9ff',
                borderRadius: '8px',
              }}
              aria-live="polite"
              aria-atomic="true"
            >
              <span className="text-[13px] text-gray-500 font-medium">Time remaining</span>
              <span
                className="text-[22px] font-bold tabular-nums"
                style={{ color: isUrgent ? '#d97706' : '#1e9bd8', letterSpacing: '-0.03em' }}
              >
                {String(Math.floor(countdown / 60)).padStart(2, '0')}:
                {String(countdown % 60).padStart(2, '0')}
              </span>
            </div>
          )}

          {/* ── Action buttons ───────────────────────────────────────────────── */}
          <div className="flex items-center gap-2.5">
            {/* Secondary: Sign Out */}
            <button
              type="button"
              onClick={handleLogout}
              className="flex-1 py-2.5 text-[14px] font-semibold text-gray-700 bg-white transition-colors cursor-pointer"
              style={{
                border: '1.5px solid #d1d5db',
                borderRadius: '8px',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#f9fafb'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; }}
            >
              Sign out
            </button>

            {/* Primary: Keep working / only shown when not yet expired */}
            {!isExpired && (
              <button
                ref={primaryBtnRef}
                type="button"
                onClick={handleExtendSession}
                className="flex-1 py-2.5 text-[14px] font-semibold text-white transition-colors cursor-pointer"
                style={{
                  background: '#1e9bd8',
                  borderRadius: '8px',
                  border: '1.5px solid #1e9bd8',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#1480b8'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#1e9bd8'; }}
              >
                Keep working
              </button>
            )}
          </div>

          {/* ── Keyboard hint (warning state only) ──────────────────────────── */}
          {!isExpired && (
            <p className="text-center text-[11px] text-gray-400 mt-3">
              Press{' '}
              <kbd
                className="text-[10px] text-gray-500 bg-gray-100 px-1 py-0.5 font-medium"
                style={{ borderRadius: '4px', border: '1px solid #e5e7eb' }}
              >
                Esc
              </kbd>
              {' '}or{' '}
              <kbd
                className="text-[10px] text-gray-500 bg-gray-100 px-1 py-0.5 font-medium"
                style={{ borderRadius: '4px', border: '1px solid #e5e7eb' }}
              >
                Enter
              </kbd>
              {' '}to stay signed in
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default SessionTimeoutHandler;
