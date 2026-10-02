import React from 'react';

/**
 * Base atomic Skeleton block with smooth shimmer effect
 */
export const Skeleton = ({
  className = '',
  width = 'w-full',
  height = 'h-4',
  rounded = 'rounded-md',
  style = {}
}) => {
  return (
    <div
      className={`skeleton-shimmer ${width} ${height} ${rounded} ${className}`}
      style={style}
    />
  );
};

/**
 * TableSkeleton renders table rows with realistic cell width variations
 */
export const TableSkeleton = ({
  rows = 5,
  cols = 5,
  density = 'normal',
  showBorders = true
}) => {
  const rowArray = Array.from({ length: rows });
  const colArray = Array.from({ length: cols });

  // Preset cell widths for a natural realistic look
  const widthPresets = ['w-3/4', 'w-1/2', 'w-4/5', 'w-2/3', 'w-1/3', 'w-3/5'];

  return (
    <>
      {rowArray.map((_, rIdx) => (
        <tr key={`skel-row-${rIdx}`} className="border-b border-slate-100 bg-white">
          {colArray.map((_, cIdx) => {
            const widthClass = widthPresets[(rIdx + cIdx) % widthPresets.length];
            return (
              <td
                key={`skel-cell-${rIdx}-${cIdx}`}
                className={`${
                  density === 'compact' ? 'px-3 py-3' : 'px-6 py-4'
                } ${
                  showBorders ? 'border-r border-slate-200/60 last:border-r-0' : ''
                }`}
              >
                <div className="flex items-center gap-2">
                  {cIdx === 0 && (
                    <Skeleton width="w-5" height="h-4" rounded="rounded" />
                  )}
                  <Skeleton
                    width={widthClass}
                    height={density === 'compact' ? 'h-3.5' : 'h-4'}
                    rounded="rounded-md"
                  />
                </div>
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
};

/**
 * CardSkeleton renders grid of statistical summary cards
 */
export const CardSkeleton = ({ count = 4 }) => {
  const cards = Array.from({ length: count });
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 w-full">
      {cards.map((_, idx) => (
        <div
          key={`skel-card-${idx}`}
          className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-3"
        >
          <div className="flex items-center justify-between">
            <Skeleton width="w-24" height="h-3" />
            <Skeleton width="w-6" height="h-6" rounded="rounded-full" />
          </div>
          <Skeleton width="w-16" height="h-7" rounded="rounded-lg" />
          <Skeleton width="w-full" height="h-1.5" rounded="rounded-full" />
        </div>
      ))}
    </div>
  );
};

/**
 * ModalSkeleton renders loading state inside detail modals
 */
export const ModalSkeleton = () => {
  return (
    <div className="p-6 bg-slate-50 space-y-6 animate-fade-in flex-1 flex flex-col min-h-0">
      {/* Header bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton width="w-48" height="h-5" />
          <Skeleton width="w-32" height="h-3" />
        </div>
        <div className="flex gap-2">
          <Skeleton width="w-20" height="h-8" rounded="rounded-xl" />
          <Skeleton width="w-24" height="h-8" rounded="rounded-xl" />
        </div>
      </div>

      {/* Tabs bar */}
      <div className="flex gap-3 border-b border-slate-200 pb-2">
        <Skeleton width="w-28" height="h-7" rounded="rounded-lg" />
        <Skeleton width="w-28" height="h-7" rounded="rounded-lg" />
      </div>

      {/* Content cards / table */}
      <CardSkeleton count={4} />

      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3 flex-1">
        <div className="flex justify-between items-center mb-4">
          <Skeleton width="w-36" height="h-4" />
          <Skeleton width="w-44" height="h-8" rounded="rounded-lg" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={`modal-skel-line-${i}`} width="w-full" height="h-8" rounded="rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
};

/**
 * UploadSkeleton renders loading feedback during file parsing/upload
 */
export const UploadSkeleton = () => {
  return (
    <div className="bg-white rounded-3xl border-2 border-dashed border-[#24A1DD]/30 p-8 flex flex-col items-center justify-center space-y-4 text-center">
      <Skeleton width="w-16" height="h-16" rounded="rounded-full" />
      <Skeleton width="w-56" height="h-5" />
      <Skeleton width="w-80" height="h-3.5" />
      <div className="w-full max-w-md space-y-2 pt-2">
        <Skeleton width="w-full" height="h-2" rounded="rounded-full" />
        <div className="flex justify-between">
          <Skeleton width="w-20" height="h-3" />
          <Skeleton width="w-12" height="h-3" />
        </div>
      </div>
    </div>
  );
};

/**
 * PageSkeleton renders full page loading layout when initializing session or auth state
 */
export const PageSkeleton = () => {
  return (
    <div className="h-screen flex flex-col bg-slate-50 overflow-hidden pt-[60px]">
      {/* Header skeleton */}
      <div className="w-full h-[60px] bg-white border-b border-[#e8e8e8] shadow-sm flex items-center px-6 justify-between fixed top-0 left-0 z-50">
        <div className="flex items-center space-x-8">
          <Skeleton width="w-32" height="h-7" rounded="rounded-lg" />
          <div className="hidden md:flex space-x-6">
            <Skeleton width="w-24" height="h-5" />
            <Skeleton width="w-28" height="h-5" />
            <Skeleton width="w-24" height="h-5" />
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <Skeleton width="w-8" height="h-8" rounded="rounded-full" />
          <Skeleton width="w-20" height="h-4" />
        </div>
      </div>

      {/* Main content skeleton */}
      <main className="flex-1 flex flex-col min-h-0 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
        <div className="flex justify-between items-center flex-shrink-0">
          <Skeleton width="w-44" height="h-8" rounded="rounded-xl" />
          <div className="flex gap-2">
            <Skeleton width="w-24" height="h-9" rounded="rounded-xl" />
            <Skeleton width="w-24" height="h-9" rounded="rounded-xl" />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-4 flex-1 flex flex-col min-h-0">
          <div className="flex justify-between items-center pb-2 border-b border-slate-100">
            <Skeleton width="w-64" height="h-8" rounded="rounded-xl" />
            <Skeleton width="w-32" height="h-8" rounded="rounded-xl" />
          </div>
          <div className="flex-1 space-y-3 pt-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={`page-skel-${i}`} width="w-full" height="h-10" rounded="rounded-lg" />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Skeleton;
