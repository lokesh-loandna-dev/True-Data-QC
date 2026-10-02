import React, { useState, useEffect, useMemo } from 'react';

export const ManageColumnsModal = ({
  isOpen,
  onClose,
  allColumns = [],
  selectedColumnKeys = [],
  onApply,
  defaultColumnKeys = [],
}) => {
  const [stagedKeys, setStagedKeys] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Sync staged keys when modal opens or selected keys change
  useEffect(() => {
    if (isOpen) {
      setStagedKeys([...selectedColumnKeys]);
      setSearchQuery('');
    }
  }, [isOpen, selectedColumnKeys]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const filteredColumns = useMemo(() => {
    if (!searchQuery.trim()) return allColumns;
    const q = searchQuery.toLowerCase().trim();
    return allColumns.filter(
      (col) =>
        (col.header && String(col.header).toLowerCase().includes(q)) ||
        (col.accessor && String(col.accessor).toLowerCase().includes(q))
    );
  }, [allColumns, searchQuery]);

  const toggleColumnKey = (key) => {
    setStagedKeys((prev) => {
      if (prev.includes(key)) {
        if (prev.length <= 1) {
          return prev; // Maintain at least 1 column
        }
        return prev.filter((k) => k !== key);
      } else {
        return [...prev, key];
      }
    });
  };

  const handleSelectAll = () => {
    setStagedKeys(allColumns.map((c) => c.accessor));
  };

  const handleDeselectAll = () => {
    if (allColumns.length > 0) {
      setStagedKeys([allColumns[0].accessor]);
    } else {
      setStagedKeys([]);
    }
  };

  const handleResetToDefault = () => {
    if (defaultColumnKeys && defaultColumnKeys.length > 0) {
      const allAccessors = new Set(allColumns.map((c) => c.accessor));
      const validDefaults = defaultColumnKeys.filter((k) => allAccessors.has(k));
      setStagedKeys(validDefaults.length > 0 ? validDefaults : [...defaultColumnKeys]);
    } else {
      setStagedKeys(allColumns.map((c) => c.accessor));
    }
  };

  const handleApply = () => {
    onApply(stagedKeys);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col border border-slate-200 max-h-[85vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <svg className="w-5 h-5 text-[#24A1DD]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2m0 10V7m6 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
              </svg>
              Manage Columns
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Select columns to show or hide in the table ({stagedKeys.length} of {allColumns.length} selected)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/60 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search & Actions Bar */}
        <div className="p-4 border-b border-slate-100 bg-white space-y-3 flex-shrink-0">
          <div className="relative">
            <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search column header..."
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#24A1DD] transition-all"
            />
          </div>

          <div className="flex items-center justify-between text-xs text-slate-600 pt-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-[#24A1DD] hover:underline font-medium cursor-pointer"
              >
                Select All
              </button>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                onClick={handleDeselectAll}
                className="text-slate-500 hover:text-slate-700 hover:underline cursor-pointer"
              >
                Clear
              </button>
            </div>
            <button
              type="button"
              onClick={handleResetToDefault}
              className="text-slate-500 hover:text-slate-800 hover:underline font-medium cursor-pointer"
            >
              Reset Default
            </button>
          </div>
        </div>

        {/* Column Checkboxes List */}
        <div className="p-4 flex-1 overflow-y-auto max-h-[360px] space-y-1">
          {filteredColumns.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs">
              No matching columns found
            </div>
          ) : (
            filteredColumns.map((col) => {
              const isChecked = stagedKeys.includes(col.accessor);
              return (
                <label
                  key={col.accessor}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium cursor-pointer transition-colors border ${
                    isChecked
                      ? 'bg-sky-50/60 border-sky-200/80 text-slate-900'
                      : 'bg-white border-transparent hover:bg-slate-50 text-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleColumnKey(col.accessor)}
                      className="rounded border-slate-300 text-[#24A1DD] focus:ring-[#24A1DD] h-4 w-4 cursor-pointer"
                    />
                    <span>{col.header || col.accessor}</span>
                  </div>
                  {col.category && (
                    <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                      {col.category}
                    </span>
                  )}
                </label>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-medium text-xs rounded-xl transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="px-4 py-2 bg-[#24A1DD] hover:bg-[#1e88bb] text-white font-medium text-xs rounded-xl shadow-sm transition-all cursor-pointer"
          >
            Apply Changes
          </button>
        </div>
      </div>
    </div>
  );
};
