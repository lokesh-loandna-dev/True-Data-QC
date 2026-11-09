/**
 * Retrieves session timeout configuration from environment variables.
 * Checks runtime environment (window._env_) first, followed by Vite build environment (import.meta.env).
 * Defaults:
 * - Session Timeout: 30 minutes
 * - Warning Window: 2 minutes
 */
export const getSessionTimeoutConfig = () => {
  const envTimeout =
    (typeof window !== 'undefined' && window._env_?.VITE_SESSION_TIMEOUT_MINUTES) ||
    import.meta.env?.VITE_SESSION_TIMEOUT_MINUTES;

  const envWarning =
    (typeof window !== 'undefined' && window._env_?.VITE_SESSION_WARNING_MINUTES) ||
    import.meta.env?.VITE_SESSION_WARNING_MINUTES;

  const parsedTimeout = parseInt(envTimeout, 10);
  const parsedWarning = parseInt(envWarning, 10);

  const timeoutMinutes = !isNaN(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : 30;
  const warningMinutes =
    !isNaN(parsedWarning) && parsedWarning > 0 && parsedWarning < timeoutMinutes ? parsedWarning : 2;

  return {
    timeoutMinutes,
    warningMinutes,
    timeoutMs: timeoutMinutes * 60 * 1000,
    warningMs: warningMinutes * 60 * 1000,
  };
};

