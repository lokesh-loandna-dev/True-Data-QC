import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useIdleTimer } from '../hooks/useIdleTimer';
import SessionTimeoutModal from './SessionTimeoutModal';

/**
 * Top-level session inactivity manager rendered inside Router and AuthProvider.
 * Monitors idle state when authenticated, displays the warning modal, and executes timeout logout.
 */
const SessionTimeoutManager = () => {
  const { isAuthenticated, user, logout, refreshSession } = useAuth();
  const navigate = useNavigate();

  const handleTimeout = useCallback(() => {
    logout('inactivity');
    navigate('/login', { replace: true });
  }, [logout, navigate]);

  const handleSignOut = useCallback(() => {
    logout();
    navigate('/login', { replace: true });
  }, [logout, navigate]);

  const { isWarningOpen, secondsRemaining, stayLoggedIn, warningMinutes } = useIdleTimer({
    enabled: isAuthenticated,
    onTimeout: handleTimeout,
    onExtendSession: refreshSession,
  });

  if (!isAuthenticated) {
    return null;
  }

  return (
    <SessionTimeoutModal
      isOpen={isWarningOpen}
      secondsRemaining={secondsRemaining}
      totalWarningSeconds={warningMinutes ? warningMinutes * 60 : 120}
      user={user}
      onStayLoggedIn={stayLoggedIn}
      onSignOut={handleSignOut}
    />
  );
};

export default SessionTimeoutManager;

