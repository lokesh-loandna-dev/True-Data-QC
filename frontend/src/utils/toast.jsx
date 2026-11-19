import toast from 'react-hot-toast';

// Custom SVG Icons with vibrant, modern design with soft status background
const WarningIcon = () => (
  <div className="p-1 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--warning-bg)', color: 'var(--warning)' }}>
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  </div>
);

const InfoIcon = () => (
  <div className="p-1 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--info-bg)', color: 'var(--info)' }}>
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  </div>
);

const ErrorIcon = () => (
  <div className="p-1 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--error-bg)', color: 'var(--error)' }}>
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  </div>
);

const SuccessIcon = () => (
  <div className="p-1 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--success-bg)', color: 'var(--success)' }}>
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  </div>
);

// Helper methods for Warning, Info, Error, and Success toasts
export const showWarning = (message, options = {}) => {
  return toast(message, {
    icon: <WarningIcon />,
    duration: options.duration || 4000,
    style: {
      border: '1px solid var(--border)',
      padding: '12px 16px',
      color: 'var(--text-primary)',
      backgroundColor: 'var(--bg-surface)',
      borderRadius: '12px',
      fontSize: '14px',
      fontWeight: '500',
      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.2), 0 4px 6px -2px rgba(0, 0, 0, 0.08)',
      maxWidth: '450px',
      ...options.style,
    },
    ...options,
  });
};

export const showInfo = (message, options = {}) => {
  return toast(message, {
    icon: <InfoIcon />,
    duration: options.duration || 4000,
    style: {
      border: '1px solid var(--border)',
      padding: '12px 16px',
      color: 'var(--text-primary)',
      backgroundColor: 'var(--bg-surface)',
      borderRadius: '12px',
      fontSize: '14px',
      fontWeight: '500',
      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.2), 0 4px 6px -2px rgba(0, 0, 0, 0.08)',
      maxWidth: '450px',
      ...options.style,
    },
    ...options,
  });
};

export const showError = (message, options = {}) => {
  return toast.error(message, {
    icon: <ErrorIcon />,
    duration: options.duration || 5000,
    style: {
      border: '1px solid var(--border)',
      padding: '12px 16px',
      color: 'var(--text-primary)',
      backgroundColor: 'var(--bg-surface)',
      borderRadius: '12px',
      fontSize: '14px',
      fontWeight: '500',
      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.2), 0 4px 6px -2px rgba(0, 0, 0, 0.08)',
      maxWidth: '450px',
      ...options.style,
    },
    ...options,
  });
};

export const showSuccess = (message, options = {}) => {
  return toast.success(message, {
    icon: <SuccessIcon />,
    duration: options.duration || 4000,
    style: {
      border: '1px solid var(--border)',
      padding: '12px 16px',
      color: 'var(--text-primary)',
      backgroundColor: 'var(--bg-surface)',
      borderRadius: '12px',
      fontSize: '14px',
      fontWeight: '500',
      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.2), 0 4px 6px -2px rgba(0, 0, 0, 0.08)',
      maxWidth: '450px',
      ...options.style,
    },
    ...options,
  });
};

export const showLoading = (message, options = {}) => {
  return toast.loading(message, {
    duration: options.duration || Infinity,
    style: {
      border: '1px solid var(--border)',
      padding: '12px 16px',
      color: 'var(--text-primary)',
      backgroundColor: 'var(--bg-surface)',
      borderRadius: '12px',
      fontSize: '14px',
      fontWeight: '500',
      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.2), 0 4px 6px -2px rgba(0, 0, 0, 0.08)',
      maxWidth: '450px',
      ...options.style,
    },
    ...options,
  });
};

export const dismissToast = (toastId) => {
  toast.dismiss(toastId);
};

// Convenient notify object API wrapper
export const notify = {
  warning: showWarning,
  info: showInfo,
  error: showError,
  success: showSuccess,
  loading: showLoading,
  dismiss: dismissToast,
  promise: toast.promise,
  raw: toast,
};

export default notify;
