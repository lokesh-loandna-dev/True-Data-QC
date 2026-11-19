import React, { useEffect, useState } from 'react';

/**
 * ValidationProgressModal
 * Displays modal progress loader with stepper indicators for asynchronous package validation.
 * Stepper tokens: active is --primary, completed is --success, pending is --border-strong.
 */
export const ValidationProgressModal = ({
  isOpen,
  progress = 0,
  status = 'Validating records against data dictionary...',
  fileName = '',
  fileSize = null,
  error = null,
  isCompleted = false,
  onClose,
  onCancel,
  steps = null,
  title = null
}) => {
  const [currentPercent, setCurrentPercent] = useState(0);

  useEffect(() => {
    setCurrentPercent(progress);
  }, [progress]);

  if (!isOpen) return null;

  const defaultSteps = [
    { label: 'File Parsing & Extraction', target: 20 },
    { label: 'Dictionary Matching', target: 50 },
    { label: 'Data Type & Rules Validation', target: 80 },
    { label: 'Preparing Validation Summary', target: 100 }
  ];

  const activeSteps = steps || defaultSteps;

  const getTitleText = () => {
    if (error) return title ? `${title} Failed` : 'Validation Failed';
    if (isCompleted) return title ? `${title} Completed!` : 'Validation Completed!';
    return title || 'Validating Loan Package';
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    const kb = bytes / 1024;
    return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.round(kb)} KB`;
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-[var(--bg-surface)] text-[var(--text-primary)] rounded-3xl shadow-2xl border border-[var(--border)] w-full max-w-md p-6 sm:p-8 relative overflow-hidden flex flex-col items-center text-center">
        {/* Top Decorative Graphic with soft status background */}
        <div className="mb-5 relative">
          {error ? (
            <div className="w-16 h-16 rounded-2xl bg-[var(--error-bg)] border border-[var(--error)]/40 flex items-center justify-center text-[var(--error)] shadow-xs">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
          ) : isCompleted ? (
            <div className="w-16 h-16 rounded-2xl bg-[var(--success-bg)] border border-[var(--success)]/40 flex items-center justify-center text-[var(--success)] shadow-sm animate-scale-in">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          ) : (
            <div className="relative w-16 h-16 rounded-2xl bg-[var(--primary-soft)] border border-[var(--primary)]/30 flex items-center justify-center text-[var(--primary)]">
              <svg className="w-8 h-8 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <div className="absolute -inset-1 rounded-2xl border-2 border-[var(--primary)]/40 border-t-[var(--primary)] animate-spin" />
            </div>
          )}
        </div>

        {/* Modal Title */}
        <h3 className="text-xl font-extrabold text-[var(--text-primary)] tracking-tight mb-1">
          {getTitleText()}
        </h3>

        {/* File Name & Details */}
        <p className="text-xs font-medium text-[var(--text-secondary)] mb-6 truncate max-w-full px-2">
          <span className="font-semibold text-[var(--text-primary)]">{fileName || 'Loan_Package.xlsx'}</span>
          {fileSize ? <span className="ml-1 text-[var(--text-disabled)]">({formatFileSize(fileSize)})</span> : null}
        </p>

        {/* Progress Loader Bar Section */}
        <div className="w-full space-y-2 mb-6">
          <div className="flex justify-between items-center text-xs font-bold">
            <span className="text-[var(--text-secondary)] truncate max-w-[240px] text-left">
              {error ? 'Error encountered' : status}
            </span>
            <span className={`font-extrabold font-mono text-sm ${error ? 'text-[var(--error)]' : isCompleted ? 'text-[var(--success)]' : 'text-[var(--primary)]'}`}>
              {currentPercent}%
            </span>
          </div>

          {/* 100% Loader Bar Track */}
          <div className="w-full h-3.5 bg-[var(--bg-elevated)] rounded-full overflow-hidden p-0.5 border border-[var(--border)] shadow-inner">
            <div
              className={`h-full rounded-full transition-all duration-300 ease-out relative overflow-hidden ${
                error
                  ? 'bg-[var(--error)]'
                  : isCompleted
                  ? 'bg-[var(--success)]'
                  : 'bg-gradient-to-r from-[var(--primary)] via-[var(--info)] to-[var(--success)]'
              }`}
              style={{ width: `${currentPercent}%` }}
            >
              {!error && !isCompleted && (
                <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.4)_50%,transparent_100%)] animate-[shimmer_1.5s_infinite] bg-[length:200%_100%]" />
              )}
            </div>
          </div>
        </div>

        {/* Validation Steps Indicators (Stepper: active --primary, completed --success, pending --border-strong) */}
        {!error && (
          <div className="w-full bg-[var(--bg-elevated)] rounded-2xl p-3.5 border border-[var(--border)] space-y-2 text-left mb-2">
            {activeSteps.map((step, index) => {
              const stepDone = currentPercent >= step.target;
              const stepActive = !stepDone && (index === 0 || currentPercent >= activeSteps[index - 1].target);
              return (
                <div key={index} className="flex items-center gap-2.5 text-xs">
                  <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold ${
                    stepDone
                      ? 'bg-[var(--success)] text-white'
                      : stepActive
                      ? 'bg-[var(--primary)] text-white animate-pulse'
                      : 'border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-disabled)]'
                  }`}>
                    {stepDone ? '✓' : index + 1}
                  </div>
                  <span className={`font-semibold ${
                    stepDone
                      ? 'text-[var(--text-primary)]'
                      : stepActive
                      ? 'text-[var(--primary)] font-bold'
                      : 'text-[var(--text-disabled)]'
                  }`}>
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* In-Flight Cancel Button */}
        {!error && !isCompleted && onCancel && (
          <div className="w-full pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-1.5 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)] rounded-lg transition-colors cursor-pointer"
            >
              Cancel Validation
            </button>
          </div>
        )}

        {/* Error Details or Close Action */}
        {error && (
          <div className="w-full space-y-3 mt-2">
            <p className="text-xs text-[var(--error)] bg-[var(--error-bg)] p-3 rounded-xl border border-[var(--error)]/40 text-left font-mono break-words">
              {error}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white rounded-xl font-semibold text-xs transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ValidationProgressModal;
