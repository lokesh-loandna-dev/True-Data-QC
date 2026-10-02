import React, { useState } from 'react';
import { notify } from '../utils/toast';

export const ToastDemo = () => {
  const [customMsg, setCustomMsg] = useState('');

  const triggerWarning = () => {
    notify.warning(customMsg || 'Warning: Please review the highlighted fields before submitting!');
  };

  const triggerInfo = () => {
    notify.info(customMsg || 'Info: System maintenance is scheduled for midnight GMT.');
  };

  const triggerError = () => {
    notify.error(customMsg || 'Error: Connection failed! Unable to process request.');
  };

  const triggerSuccess = () => {
    notify.success(customMsg || 'Success: Data package uploaded and audited successfully!');
  };

  const triggerPromise = () => {
    const examplePromise = new Promise((resolve, reject) => {
      setTimeout(() => {
        Math.random() > 0.5 ? resolve('Operation completed!') : reject('Operation failed!');
      }, 2000);
    });

    notify.promise(
      examplePromise,
      {
        loading: 'Processing request...',
        success: (data) => `Success: ${data}`,
        error: (err) => `Error: ${err}`,
      },
      {
        style: {
          borderRadius: '12px',
          padding: '12px 16px',
        },
      }
    );
  };

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/80 mb-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">React Hot Toast Notifications</h2>
          <p className="text-xs text-slate-500">Test Warning, Info, Error, and Success toast alerts</p>
        </div>
      </div>

      <div className="mb-4">
        <input
          type="text"
          placeholder="Custom message (optional)..."
          value={customMsg}
          onChange={(e) => setCustomMsg(e.target.value)}
          className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400"
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
        <button
          type="button"
          onClick={triggerWarning}
          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200/80 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
        >
          <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          Warning
        </button>

        <button
          type="button"
          onClick={triggerInfo}
          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200/80 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
        >
          <svg className="w-4 h-4 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Info
        </button>

        <button
          type="button"
          onClick={triggerError}
          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200/80 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
        >
          <svg className="w-4 h-4 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Error
        </button>

        <button
          type="button"
          onClick={triggerSuccess}
          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/80 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
        >
          <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Success
        </button>

        <button
          type="button"
          onClick={triggerPromise}
          className="col-span-2 sm:col-span-1 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300/80 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
        >
          <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Async Promise
        </button>
      </div>
    </div>
  );
};

export default ToastDemo;
