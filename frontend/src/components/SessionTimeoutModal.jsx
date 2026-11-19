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
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="session-warning-title"
      aria-describedby="session-warning-desc"
    >
      <div
        ref={dialogRef}
        className="relative w-full max-w-md bg-[var(--bg-surface)] text-[var(--text-primary)] rounded-xl border border-[var(--border)] shadow-xl overflow-hidden font-creato"
      >
        {/* Real-time Elapsed Progress Line */}
        <div className="h-1 w-full bg-[var(--bg-elevated)]">
          <div
            className={`h-full transition-[width,background-color] duration-500 ease-out ${
              isUrgent ? 'bg-[var(--warning)]' : 'bg-[var(--primary)]'
            }`}
            style={{ width: `${progressRatio}%` }}
          />
        </div>

        <div className="p-6 sm:p-7">
          {/* Header Row: Shield emblem & Alert Badge */}
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] flex items-center justify-center text-[var(--text-primary)]">
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
                  ? 'bg-[var(--warning-bg)] border-[var(--warning)]/40 text-[var(--warning)]'
                  : 'bg-[var(--bg-elevated)] border-[var(--border)] text-[var(--text-secondary)]'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isUrgent ? 'bg-[var(--warning)]' : 'bg-[var(--primary)]'
                }`}
                aria-hidden="true"
              />
              <span>Inactivity Notice</span>
            </div>
          </div>

          {/* Title & Identity Subtitle */}
          <div>
            <h2 id="session-warning-title" className="text-lg font-bold text-[var(--text-primary)] tracking-tight">
              Session Expiring Soon
            </h2>
            {userIdentifier ? (
              <p className="mt-0.5 text-xs text-[var(--text-secondary)] truncate">
                Active user: <span className="font-medium text-[var(--text-primary)]">{userIdentifier}</span>
              </p>
            ) : null}
          </div>

          {/* Description */}
          <p id="session-warning-desc" className="mt-2.5 text-sm text-[var(--text-secondary)] leading-relaxed">
            You have been inactive for an extended period. For data security, your session will be
            signed out unless you choose to stay logged in.
          </p>

          {/* Countdown Block with Tabular Typography */}
          <div
            className="mt-4 p-4 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] flex items-center justify-between"
            aria-live="polite"
          >
            <div>
              <span className="block text-xs font-medium text-[var(--text-secondary)]">
                Time Remaining
              </span>
              <span className="block text-[11px] text-[var(--text-disabled)] mt-0.5">
                Unsaved edits will be discarded
              </span>
            </div>

            <div className="flex items-center gap-2">
              <svg
                className={`w-4 h-4 ${isUrgent ? 'text-[var(--warning)]' : 'text-[var(--text-secondary)]'}`}
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
                  isUrgent ? 'text-[var(--warning)]' : 'text-[var(--text-primary)]'
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
              className="w-full sm:w-auto px-4 py-2.5 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] text-sm font-semibold hover:bg-[var(--bg-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]/25 cursor-pointer transition-[background-color,border-color]"
            >
              Sign Out
            </button>
            <button
              ref={primaryBtnRef}
              type="button"
              onClick={onStayLoggedIn}
              className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]/25 cursor-pointer transition-[background-color]"
            >
              Stay Signed In
            </button>
          </div>

          {/* Keyboard Navigation Tip */}
          <div className="mt-3.5 flex items-center justify-center sm:justify-start gap-1 text-[11px] text-[var(--text-disabled)]">
            <span>Press</span>
            <kbd className="px-1.5 py-0.5 text-[10px] font-medium bg-[var(--bg-elevated)] border border-[var(--border)] rounded text-[var(--text-secondary)]">
              Enter
            </kbd>
            <span>or</span>
            <kbd className="px-1.5 py-0.5 text-[10px] font-medium bg-[var(--bg-elevated)] border border-[var(--border)] rounded text-[var(--text-secondary)]">
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
