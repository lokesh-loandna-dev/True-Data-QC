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
    <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 animate-fade-in">
      <div className="bg-[var(--bg-surface)] rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col border border-[var(--border)] max-h-[88vh]">
        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b border-[var(--border)] bg-[var(--bg-elevated)] flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
              <svg className="w-5 h-5 text-[var(--primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              Show / Hide Columns
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Select columns to display in the table ({stagedKeys.length} of {allColumns.length} visible)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1.5 rounded-lg hover:bg-[var(--bg-muted)] transition-colors cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search & Actions Bar */}
        <div className="p-4 border-b border-[var(--border)] bg-[var(--bg-surface)] space-y-3 flex-shrink-0">
          <div className="relative">
            <svg className="w-4 h-4 text-[var(--text-disabled)] absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search column header or key..."
              className="w-full pl-9 pr-8 py-1.5 bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-xl text-xs text-[var(--text-primary)] placeholder-[var(--text-disabled)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full hover:bg-[var(--bg-surface)] cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] pt-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-[var(--primary)] hover:underline font-medium cursor-pointer"
              >
                Select All
              </button>
              <span className="text-[var(--border)]">|</span>
              <button
                type="button"
                onClick={handleDeselectAll}
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:underline cursor-pointer"
              >
                Clear All
              </button>
              <span className="text-[var(--border)]">|</span>
              <button
                type="button"
                onClick={handleResetToDefault}
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:underline cursor-pointer"
              >
                Reset Default
              </button>
            </div>
            <span className="text-[var(--text-disabled)] text-[11px]">
              {stagedKeys.length} of {allColumns.length} selected
            </span>
          </div>
        </div>

        {/* Column Checkboxes List */}
        <div className="p-4 flex-1 overflow-y-auto max-h-[380px] space-y-1 custom-scrollbar">
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
                      ? 'bg-[var(--primary-soft)] border-[var(--primary)]/40 text-[var(--text-primary)]'
                      : 'bg-[var(--bg-surface)] border-transparent hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleColumnKey(col.accessor)}
                      className="rounded border-slate-300 text-[#24A1DD] focus:ring-[#24A1DD] h-4 w-4 cursor-pointer accent-[#24A1DD]"
                    />
                    <span>{col.header || col.accessor}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {col.category && (
                      <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-700 text-slate-500 dark:text-[#8b949e]">
                        {col.category}
                      </span>
                    )}
                  </div>
                </label>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[var(--border)] bg-[var(--bg-elevated)] flex items-center justify-between gap-3 flex-shrink-0">
          <div className="text-xs text-[var(--text-secondary)] font-medium">
            {stagedKeys.length} columns will be displayed
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-[var(--bg-surface)] hover:bg-[var(--bg-muted)] text-[var(--text-primary)] border border-[var(--border-strong)] font-medium text-xs rounded-xl transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="px-4 py-2 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white font-medium text-xs rounded-xl shadow-xs transition-all cursor-pointer"
            >
              Apply Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
