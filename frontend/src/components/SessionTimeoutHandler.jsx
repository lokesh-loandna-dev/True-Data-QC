import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { authApi } from '../services/api';

/**
 * SessionTimeoutHandler
 * Replicates the exact session timeout and inactivity handling from APEX.
 * Features:
 * - Activity-based inactivity timeout with 5s throttling
 * - Session timeout configuration fetched from /api/auth/session-timeout
 * - 60s warning countdown modal with "Keep me logged in" and "Log Out"
 * - Inactivity expired modal with pulsing alert icon and "Log Out" action
 * - session_expired_flag persistence across page reloads
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

  // Fetch session timeout configuration on mount / when authenticated
  useEffect(() => {
    if (!isAuthenticated) return;

    const fetchTimeout = async () => {
      try {
        const response = await authApi.getSessionTimeout();
        if (response && response.session_timeout) {
          setTimeoutMinutes(response.session_timeout);
        }
      } catch (error) {
        console.error('Failed to fetch session timeout config:', error);
        setTimeoutMinutes(30);
      }
    };

    fetchTimeout();
  }, [isAuthenticated]);

  // Track session timer
  useEffect(() => {
    if (!isAuthenticated) {
      if (timerRef.current) clearInterval(timerRef.current);
      setTimeout(() => {
        setIsWarningOpen(false);
        setIsExpired(false);
      }, 0);
      return;
    }

    if (isExpired) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    // Initialize session_start_time if not already set
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

      // Warning threshold is 60 seconds (or half of total timeout if timeout is less than 60 seconds)
      const warningThresholdSec = timeoutMinutes * 60 <= 60 ? Math.floor((timeoutMinutes * 60) / 2) : 60;

      if (remainingSec <= 0) {
        // Session expired!
        if (!isExpired) {
          setIsExpired(true);
          setIsWarningOpen(true);
          sessionStorage.setItem('session_expired_flag', 'true');
          sessionStorage.removeItem('session_start_time');
          if (timerRef.current) clearInterval(timerRef.current);
        }
        setCountdown(0);
      } else if (remainingSec <= warningThresholdSec) {
        // Show warning modal
        setIsWarningOpen(true);
        setCountdown(remainingSec);
      } else {
        // If the user extended session elsewhere or timer is reset
        if (isWarningOpen && !isExpired) {
          setIsWarningOpen(false);
        }
      }
    };

    // Run check immediately on mount/update
    checkSession();

    // Run check every second
    timerRef.current = setInterval(checkSession, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isAuthenticated, timeoutMinutes, logout, isExpired, isWarningOpen]);

  // Listen to user activity to extend session automatically (activity timeout)
  useEffect(() => {
    if (!isAuthenticated || isExpired || isWarningOpen) return;

    const handleActivity = () => {
      const now = Date.now();
      const lastActiveStr = sessionStorage.getItem('session_start_time');
      if (lastActiveStr) {
        const lastActive = parseInt(lastActiveStr, 10);
        // Throttle: only update sessionStorage if it's been more than 5 seconds since the last update
        if (now - lastActive > 5000) {
          sessionStorage.setItem('session_start_time', now.toString());
          try {
            localStorage.setItem('ops_qc_last_activity', now.toString());
          } catch (_) {}
        }
      } else {
        sessionStorage.setItem('session_start_time', now.toString());
        try {
          localStorage.setItem('ops_qc_last_activity', now.toString());
        } catch (_) {}
      }
    };

    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];
    events.forEach((event) => window.addEventListener(event, handleActivity, { passive: true }));

    return () => {
      events.forEach((event) => window.removeEventListener(event, handleActivity));
    };
  }, [isAuthenticated, isExpired, isWarningOpen]);

  const handleExtendSession = async () => {
    sessionStorage.setItem('session_start_time', Date.now().toString());
    try {
      localStorage.setItem('ops_qc_last_activity', Date.now().toString());
    } catch (_) {}
    setIsWarningOpen(false);
    setCountdown(60);

    if (refreshSession) {
      try {
        await refreshSession();
      } catch (err) {
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

  if (!isWarningOpen) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
    >
      <div className="bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden relative w-full max-w-[420px] transition-all transform scale-100">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 mt-1">
              {isExpired ? (
                <div className="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center animate-pulse">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                </div>
              ) : (
                <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
              )}
            </div>
            <div className="flex-1">
              <h3 id="session-dialog-title" className="text-lg font-semibold text-gray-900 mb-2">
                {isExpired ? 'Session Expired' : 'Session Expiring Soon'}
              </h3>
              <p className="text-sm text-gray-600 mb-1">
                {isExpired
                  ? 'Your session has timed out due to inactivity.'
                  : `You will be logged out in ${countdown} seconds due to inactivity.`}
              </p>
              {!isExpired && (
                <p className="text-xs text-gray-500 mt-2">
                  Would you like to extend your session?
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="bg-gray-50 px-6 py-4 flex items-center justify-end gap-3 border-t border-gray-100">
          {!isExpired ? (
            <>
              <div className="w-24">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors shadow-xs"
                >
                  Log Out
                </button>
              </div>
              <div className="w-auto min-w-[150px]">
                <button
                  type="button"
                  onClick={handleExtendSession}
                  className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 rounded-lg transition-colors shadow-xs"
                >
                  Keep me logged in
                </button>
              </div>
            </>
          ) : (
            <div className="w-32">
              <button
                type="button"
                onClick={handleLogout}
                className="w-full px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 rounded-lg transition-colors shadow-xs"
              >
                Log Out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SessionTimeoutHandler;

