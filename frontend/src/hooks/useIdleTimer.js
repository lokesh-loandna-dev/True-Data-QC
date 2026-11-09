import { useState, useEffect, useCallback, useRef } from 'react';
import { getSessionTimeoutConfig } from '../utils/sessionConfig';

const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
const THROTTLE_MS = 1000;
const STORAGE_KEY = 'ops_qc_last_activity';

/**
 * Custom hook to monitor user inactivity / idle time.
 *
 * @param {Object} options
 * @param {boolean} options.enabled - Whether idle tracking is currently active (e.g. user is logged in).
 * @param {Function} options.onTimeout - Callback invoked when the inactivity period reaches timeout.
 * @param {Function} [options.onExtendSession] - Optional callback (e.g. refreshing backend token).
 */
export const useIdleTimer = ({ enabled = true, onTimeout, onExtendSession }) => {
  const { timeoutMinutes, warningMinutes, timeoutMs, warningMs } = getSessionTimeoutConfig();

  const [isWarningOpen, setIsWarningOpen] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(warningMinutes * 60);

  const lastActivityRef = useRef(Date.now());
  const lastThrottleRef = useRef(0);
  const isWarningOpenRef = useRef(false);

  // Keep ref synchronized with state to prevent stale closures
  useEffect(() => {
    isWarningOpenRef.current = isWarningOpen;
  }, [isWarningOpen]);

  // Update activity timestamp in local memory and localStorage for cross-tab sharing
  const recordActivity = useCallback(() => {
    // If the warning dialog is currently active, do not dismiss automatically on slight mouse movements.
    // The user must explicitly click "Stay Signed In".
    if (isWarningOpenRef.current) {
      return;
    }

    const now = Date.now();
    if (now - lastThrottleRef.current < THROTTLE_MS) {
      return;
    }

    lastThrottleRef.current = now;
    lastActivityRef.current = now;

    try {
      localStorage.setItem(STORAGE_KEY, now.toString());
    } catch (_) {
      // LocalStorage access may fail in private browsing mode
    }
  }, []);

  // Explicit user action to extend session (e.g., clicking "Stay Signed In")
  const stayLoggedIn = useCallback(async () => {
    const now = Date.now();
    lastThrottleRef.current = now;
    lastActivityRef.current = now;

    try {
      localStorage.setItem(STORAGE_KEY, now.toString());
    } catch (_) {}

    setIsWarningOpen(false);
    setSecondsRemaining(warningMinutes * 60);

    if (onExtendSession) {
      try {
        await onExtendSession();
      } catch (err) {
        console.warn('Failed to extend session with backend:', err);
      }
    }
  }, [onExtendSession, warningMinutes]);

  // Set up event listeners and background timer
  useEffect(() => {
    if (!enabled) {
      setIsWarningOpen(false);
      return;
    }

    // Initialize or load current activity timestamp
    let storedActivity = Date.now();
    try {
      const rawStored = localStorage.getItem(STORAGE_KEY);
      if (rawStored) {
        const parsed = parseInt(rawStored, 10);
        if (!isNaN(parsed) && parsed > 0) {
          storedActivity = parsed;
        }
      } else {
        localStorage.setItem(STORAGE_KEY, storedActivity.toString());
      }
    } catch (_) {}

    lastActivityRef.current = storedActivity;

    // Cross-tab synchronization
    const handleStorageEvent = (event) => {
      if (event.key === STORAGE_KEY && event.newValue) {
        const updatedTime = parseInt(event.newValue, 10);
        if (!isNaN(updatedTime)) {
          lastActivityRef.current = updatedTime;
          // If another tab performed activity, close warning dialog in this tab
          if (isWarningOpenRef.current) {
            setIsWarningOpen(false);
          }
        }
      }
    };

    // Attach user activity listeners
    ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, recordActivity, { passive: true });
    });
    window.addEventListener('storage', handleStorageEvent);

    // Periodic check interval (runs every 1 second)
    const checkInterval = setInterval(() => {
      let currentActivity = lastActivityRef.current;
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = parseInt(raw, 10);
          if (!isNaN(parsed) && parsed > currentActivity) {
            currentActivity = parsed;
            lastActivityRef.current = parsed;
          }
        }
      } catch (_) {}

      const now = Date.now();
      const elapsed = now - currentActivity;
      const remaining = timeoutMs - elapsed;

      if (remaining <= 0) {
        // Inactivity timeout triggered!
        setIsWarningOpen(false);
        if (onTimeout) {
          onTimeout();
        }
      } else if (remaining <= warningMs) {
        // Within warning window
        setIsWarningOpen(true);
        const secsLeft = Math.max(0, Math.ceil(remaining / 1000));
        setSecondsRemaining(secsLeft);
      } else {
        // Outside warning window (user became active elsewhere)
        if (isWarningOpenRef.current) {
          setIsWarningOpen(false);
        }
      }
    }, 1000);

    return () => {
      clearInterval(checkInterval);
      ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, recordActivity);
      });
      window.removeEventListener('storage', handleStorageEvent);
    };
  }, [enabled, timeoutMs, warningMs, recordActivity, onTimeout]);

  return {
    isWarningOpen,
    secondsRemaining,
    stayLoggedIn,
    timeoutMinutes,
    warningMinutes,
  };
};

