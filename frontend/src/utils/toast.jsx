import React from 'react';
import toast from 'react-hot-toast';

// Custom SVG Icons with vibrant, modern design
const WarningIcon = () => (
  <svg className="w-5 h-5 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
);

const InfoIcon = () => (
  <svg className="w-5 h-5 text-sky-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const ErrorIcon = () => (
  <svg className="w-5 h-5 text-rose-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const SuccessIcon = () => (
  <svg className="w-5 h-5 text-emerald-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

// Helper methods for Warning, Info, Error, and Success toasts
export const showWarning = (message, options = {}) => {
  return toast(message, {
    icon: <WarningIcon />,
    duration: options.duration || 4000,
    style: {
      border: '1px solid #fde68a',
      padding: '12px 16px',
      color: '#92400e',
      backgroundColor: '#fffbeb',
      borderRadius: '12px',
      fontSize: '14px',
      fontWeight: '500',
      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -2px rgba(0, 0, 0, 0.04)',
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
      border: '1px solid #bae6fd',
      padding: '12px 16px',
      color: '#075985',
      backgroundColor: '#f0f9ff',
      borderRadius: '12px',
      fontSize: '14px',
      fontWeight: '500',
      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -2px rgba(0, 0, 0, 0.04)',
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
      border: '1px solid #fecdd3',
      padding: '12px 16px',
      color: '#9f1239',
      backgroundColor: '#fff1f2',
      borderRadius: '12px',
      fontSize: '14px',
      fontWeight: '500',
      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -2px rgba(0, 0, 0, 0.04)',
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
      border: '1px solid #a7f3d0',
      padding: '12px 16px',
      color: '#065f46',
      backgroundColor: '#ecfdf5',
      borderRadius: '12px',
      fontSize: '14px',
      fontWeight: '500',
      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -2px rgba(0, 0, 0, 0.04)',
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
      border: '1px solid #e2e8f0',
      padding: '12px 16px',
      color: '#334155',
      backgroundColor: '#ffffff',
      borderRadius: '12px',
      fontSize: '14px',
      fontWeight: '500',
      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -2px rgba(0, 0, 0, 0.04)',
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
