import { useEffect, useRef } from 'react';

/**
 * Formats remaining seconds into a zero-padded mm:ss string.
 */
const formatTime = (totalSeconds) => {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds || 0));
  const mins = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
  const minsStr = mins < 10 ? `0${mins}` : `${mins}`;
  const secsStr = secs < 10 ? `0${secs}` : `${secs}`;
  return `${minsStr}:${secsStr}`;
};

/**
 * Production-grade Session Timeout Warning Modal
 *
 * Implements WCAG 2.1 alertdialog standards with focus trap, auto-focus,
 * tabular numerical alignment (no monospace), enterprise identity context,
 * and clear keyboard dismissal (Enter / Escape -> stay signed in).
 */
const SessionTimeoutModal = ({
  isOpen,
  secondsRemaining,
  totalWarningSeconds = 120,
  user,
  onStayLoggedIn,
  onSignOut,
}) => {
  const dialogRef = useRef(null);
  const primaryBtnRef = useRef(null);
  const prevActiveElementRef = useRef(null);

  // Derive display username or email if provided
  const userIdentifier =
    user?.username ||
    user?.email ||
    user?.full_name ||
    (typeof user === 'string' ? user : null);

  // Calculate percentage of remaining warning time
  const baselineTotal = Math.max(totalWarningSeconds, 1);
  const progressRatio = Math.min(100, Math.max(0, (secondsRemaining / baselineTotal) * 100));
  const isUrgent = secondsRemaining <= 30;

  // Manage focus and keyboard interactions
  useEffect(() => {
    if (!isOpen) return;

    // Save previous active element to restore upon dismissal
    prevActiveElementRef.current = document.activeElement;

    // Auto-focus primary safe action ("Stay Signed In")
    const focusTimeout = setTimeout(() => {
      primaryBtnRef.current?.focus();
    }, 50);

    const handleKeyDown = (e) => {
      // Escape or Enter automatically extends session (safest non-destructive action)
      if (e.key === 'Escape') {
        e.preventDefault();
        onStayLoggedIn?.();
        return;
      }

      if (e.key === 'Enter' && e.target?.tagName !== 'BUTTON') {
        e.preventDefault();
        onStayLoggedIn?.();
        return;
      }

      // Tab trap inside modal dialog
      if (e.key === 'Tab' && dialogRef.current) {
        const focusableElements = dialogRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(focusTimeout);
      window.removeEventListener('keydown', handleKeyDown);
      if (prevActiveElementRef.current && typeof prevActiveElementRef.current.focus === 'function') {
        prevActiveElementRef.current.focus();
      }
    };
  }, [isOpen, onStayLoggedIn]);

  if (!isOpen) return null;

  return (
    <div
      data-ui="modal"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/50"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="session-warning-title"
      aria-describedby="session-warning-desc"
    >
      <div
        ref={dialogRef}
        className="relative w-full max-w-md bg-white rounded-xl border border-slate-200/90 shadow-xl overflow-hidden font-creato"
      >
        {/* Real-time Elapsed Progress Line */}
        <div className="h-1 w-full bg-slate-100">
          <div
            className={`h-full transition-[width,background-color] duration-500 ease-out ${
              isUrgent ? 'bg-amber-500' : 'bg-[#24A1DD]'
            }`}
            style={{ width: `${progressRatio}%` }}
          />
        </div>

        <div className="p-6 sm:p-7">
          {/* Header Row: Shield emblem & Alert Badge */}
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200/80 flex items-center justify-center text-slate-700">
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.8}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m0-10.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.75h-.002A11.959 11.959 0 0112 2.714zm0 13.036h.008v.008H12v-.008z"
                />
              </svg>
            </div>

            <div
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${
                isUrgent
                  ? 'bg-amber-50 border-amber-200 text-amber-800'
                  : 'bg-slate-100 border-slate-200 text-slate-700'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isUrgent ? 'bg-amber-500' : 'bg-[#24A1DD]'
                }`}
                aria-hidden="true"
              />
              <span>Inactivity Notice</span>
            </div>
          </div>

          {/* Title & Identity Subtitle */}
          <div>
            <h2 id="session-warning-title" className="text-lg font-bold text-slate-900 tracking-tight">
              Session Expiring Soon
            </h2>
            {userIdentifier ? (
              <p className="mt-0.5 text-xs text-slate-500 truncate">
                Active user: <span className="font-medium text-slate-700">{userIdentifier}</span>
              </p>
            ) : null}
          </div>

          {/* Description */}
          <p id="session-warning-desc" className="mt-2.5 text-sm text-slate-600 leading-relaxed">
            You have been inactive for an extended period. For data security, your session will be
            signed out unless you choose to stay logged in.
          </p>

          {/* Countdown Block with Tabular Typography */}
          <div
            className="mt-4 p-4 rounded-lg bg-slate-50 border border-slate-200/80 flex items-center justify-between"
            aria-live="polite"
          >
            <div>
              <span className="block text-xs font-medium text-slate-500">
                Time Remaining
              </span>
              <span className="block text-[11px] text-slate-400 mt-0.5">
                Unsaved edits will be discarded
              </span>
            </div>

            <div className="flex items-center gap-2">
              <svg
                className={`w-4 h-4 ${isUrgent ? 'text-amber-600' : 'text-slate-400'}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span
                className={`text-2xl font-bold tracking-tight tabular-nums ${
                  isUrgent ? 'text-amber-700' : 'text-slate-900'
                }`}
              >
                {formatTime(secondsRemaining)}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-6 flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onSignOut}
              className="w-full sm:w-auto px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50 active:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 cursor-pointer transition-[background-color,border-color]"
            >
              Sign Out
            </button>
            <button
              ref={primaryBtnRef}
              type="button"
              onClick={onStayLoggedIn}
              className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-[#24A1DD] hover:bg-[#1b8ec5] active:bg-[#1678a7] text-white text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#24A1DD] cursor-pointer transition-[background-color]"
            >
              Stay Signed In
            </button>
          </div>

          {/* Keyboard Navigation Tip */}
          <div className="mt-3.5 flex items-center justify-center sm:justify-start gap-1 text-[11px] text-slate-400">
            <span>Press</span>
            <kbd className="px-1.5 py-0.5 text-[10px] font-medium bg-slate-100 border border-slate-200 rounded text-slate-600">
              Enter
            </kbd>
            <span>or</span>
            <kbd className="px-1.5 py-0.5 text-[10px] font-medium bg-slate-100 border border-slate-200 rounded text-slate-600">
              Esc
            </kbd>
            <span>to keep working</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SessionTimeoutModal;
