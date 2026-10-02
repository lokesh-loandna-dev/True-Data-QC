import React from 'react';

/**
 * ValidationProgressModal
 * Displays a 100% progress loader bar in a modal overlay while validating loan package files.
 */
export const ValidationProgressModal = ({
  isOpen,
  fileName,
  fileSize,
  progress = 0,
  status = 'Validating loan package...',
  error = '',
  onClose,
  title,
  steps
}) => {
  if (!isOpen) return null;

  const currentPercent = Math.min(100, Math.max(0, Math.round(progress)));
  const isCompleted = currentPercent === 100 && !error;

  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const defaultSteps = [
    { label: 'Reading loan package file & headers', target: 25 },
    { label: 'Checking field data types & enum rules', target: 60 },
    { label: 'Running macro business validation & saving', target: 100 },
  ];

  const activeSteps = steps || defaultSteps;

  const getTitleText = () => {
    if (error) return title ? `${title} Failed` : 'Validation Failed';
    if (isCompleted) return title ? `${title} Completed!` : 'Validation Completed!';
    return title || 'Validating Loan Package';
  };

  return (
    <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md p-6 sm:p-8 relative overflow-hidden flex flex-col items-center text-center">
        {/* Top Decorative Graphic */}
        <div className="mb-5 relative">
          {error ? (
            <div className="w-16 h-16 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center text-red-600 shadow-xs">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
          ) : isCompleted ? (
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shadow-sm animate-scale-in">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          ) : (
            <div className="relative w-16 h-16 rounded-2xl bg-[#24A1DD]/10 border border-[#24A1DD]/30 flex items-center justify-center text-[#24A1DD]">
              <svg className="w-8 h-8 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <div className="absolute -inset-1 rounded-2xl border-2 border-[#24A1DD]/40 border-t-[#24A1DD] animate-spin" />
            </div>
          )}
        </div>

        {/* Modal Title */}
        <h3 className="text-xl font-extrabold text-slate-900 tracking-tight mb-1">
          {getTitleText()}
        </h3>

        {/* File Name & Details */}
        <p className="text-xs font-medium text-slate-500 mb-6 truncate max-w-full px-2">
          <span className="font-semibold text-slate-700">{fileName || 'Loan_Package.xlsx'}</span>
          {fileSize ? <span className="ml-1 text-slate-400">({formatFileSize(fileSize)})</span> : null}
        </p>

        {/* Progress Loader Bar Section */}
        <div className="w-full space-y-2 mb-6">
          <div className="flex justify-between items-center text-xs font-bold">
            <span className="text-slate-700 truncate max-w-[240px] text-left">
              {error ? 'Error encountered' : status}
            </span>
            <span className={`font-extrabold font-mono text-sm ${error ? 'text-red-600' : isCompleted ? 'text-emerald-600' : 'text-[#24A1DD]'}`}>
              {currentPercent}%
            </span>
          </div>

          {/* 100% Loader Bar Track */}
          <div className="w-full h-3.5 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200 shadow-inner">
            <div
              className={`h-full rounded-full transition-all duration-300 ease-out relative overflow-hidden ${
                error
                  ? 'bg-red-500'
                  : isCompleted
                  ? 'bg-emerald-500'
                  : 'bg-gradient-to-r from-[#24A1DD] via-blue-500 to-emerald-500'
              }`}
              style={{ width: `${currentPercent}%` }}
            >
              {!error && !isCompleted && (
                <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.4)_50%,transparent_100%)] animate-[shimmer_1.5s_infinite] bg-[length:200%_100%]" />
              )}
            </div>
          </div>
        </div>

        {/* Validation Steps Indicators */}
        {!error && (
          <div className="w-full bg-slate-50 rounded-2xl p-3.5 border border-slate-150 space-y-2 text-left mb-2">
            {activeSteps.map((step, index) => {
              const stepDone = currentPercent >= step.target;
              const stepActive = !stepDone && (index === 0 || currentPercent >= activeSteps[index - 1].target);
              return (
                <div key={index} className="flex items-center gap-2.5 text-xs">
                  <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold ${
                    stepDone
                      ? 'bg-emerald-500 text-white'
                      : stepActive
                      ? 'bg-[#24A1DD] text-white animate-pulse'
                      : 'bg-slate-200 text-slate-400'
                  }`}>
                    {stepDone ? '✓' : index + 1}
                  </div>
                  <span className={`font-semibold ${
                    stepDone
                      ? 'text-slate-800'
                      : stepActive
                      ? 'text-[#24A1DD] font-bold'
                      : 'text-slate-400'
                  }`}>
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Error Details or Close Action */}
        {error && (
          <div className="w-full space-y-3 mt-2">
            <p className="text-xs text-red-600 bg-red-50 p-3 rounded-xl border border-red-100 text-left font-mono break-words">
              {error}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-semibold text-xs transition-colors"
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
