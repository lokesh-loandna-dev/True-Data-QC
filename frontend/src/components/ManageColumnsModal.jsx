import React, { useState, useEffect, useMemo } from 'react';

export const ManageColumnsModal = ({
  isOpen,
  onClose,
  allColumns = [],
  selectedColumnKeys = [],
  onApply,
  defaultColumnKeys = [],
}) => {
  const [activeTab, setActiveTab] = useState('order'); // 'order' | 'visibility'
  const [stagedKeys, setStagedKeys] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [draggedIdx, setDraggedIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);

  // Sync staged keys when modal opens or selected keys change
  useEffect(() => {
    if (isOpen) {
      setStagedKeys([...selectedColumnKeys]);
      setSearchQuery('');
      setActiveTab('order');
      setDraggedIdx(null);
      setDragOverIdx(null);
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

  const columnMap = useMemo(() => {
    const map = new Map();
    allColumns.forEach((col) => {
      map.set(col.accessor, col);
    });
    return map;
  }, [allColumns]);

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

  // Reordering handlers for Drag & Drop
  const handleDragStart = (e, index) => {
    setDraggedIdx(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === index) return;
    setDragOverIdx(index);
  };

  const handleDragLeave = () => {
    setDragOverIdx(null);
  };

  const handleDrop = (e, targetIdx) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === targetIdx) {
      setDraggedIdx(null);
      setDragOverIdx(null);
      return;
    }
    setStagedKeys((prev) => {
      const next = [...prev];
      const [moved] = next.splice(draggedIdx, 1);
      next.splice(targetIdx, 0, moved);
      return next;
    });
    setDraggedIdx(null);
    setDragOverIdx(null);
  };

  const handleDragEnd = () => {
    setDraggedIdx(null);
    setDragOverIdx(null);
  };

  // Move Up / Move Down handlers
  const moveUp = (index) => {
    if (index <= 0) return;
    setStagedKeys((prev) => {
      const next = [...prev];
      const temp = next[index - 1];
      next[index - 1] = next[index];
      next[index] = temp;
      return next;
    });
  };

  const moveDown = (index) => {
    if (index >= stagedKeys.length - 1) return;
    setStagedKeys((prev) => {
      const next = [...prev];
      const temp = next[index + 1];
      next[index + 1] = next[index];
      next[index] = temp;
      return next;
    });
  };

  const removeColumn = (key) => {
    if (stagedKeys.length <= 1) return;
    setStagedKeys((prev) => prev.filter((k) => k !== key));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col border border-slate-200 max-h-[88vh]">
        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <svg className="w-5 h-5 text-[#24A1DD]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2m0 10V7m6 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
              </svg>
              Manage & Reorder Columns
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Customize column order and visibility ({stagedKeys.length} of {allColumns.length} visible)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab Selection */}
        <div className="px-5 pt-3 pb-0 bg-white border-b border-slate-200 flex items-center justify-between flex-shrink-0">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('order')}
              className={`pb-2.5 px-3 text-xs font-semibold border-b-2 flex items-center gap-1.5 cursor-pointer transition-colors ${
                activeTab === 'order'
                  ? 'border-[#24A1DD] text-[#24A1DD]'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              Column Order
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeTab === 'order' ? 'bg-[#24A1DD]/10 text-[#24A1DD]' : 'bg-slate-100 text-slate-600'
              }`}>
                {stagedKeys.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('visibility')}
              className={`pb-2.5 px-3 text-xs font-semibold border-b-2 flex items-center gap-1.5 cursor-pointer transition-colors ${
                activeTab === 'visibility'
                  ? 'border-[#24A1DD] text-[#24A1DD]'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              Show / Hide Columns
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeTab === 'visibility' ? 'bg-[#24A1DD]/10 text-[#24A1DD]' : 'bg-slate-100 text-slate-600'
              }`}>
                {allColumns.length}
              </span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleResetToDefault}
            className="text-xs text-slate-500 hover:text-slate-800 pb-2.5 font-medium hover:underline cursor-pointer"
          >
            Reset Default
          </button>
        </div>

        {/* Tab 1: Column Order View */}
        {activeTab === 'order' && (
          <div className="flex-1 flex flex-col min-h-0 bg-slate-50/50">
            <div className="px-4 py-2.5 bg-sky-50/60 border-b border-sky-100 text-xs text-sky-800 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <svg className="w-4 h-4 text-[#24A1DD]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
                Drag items or use the arrows to set column order (left-to-right in table)
              </span>
            </div>

            <div className="p-4 flex-1 overflow-y-auto max-h-[380px] space-y-1.5 custom-scrollbar">
              {stagedKeys.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs">
                  No columns selected. Switch to "Show / Hide" tab to select columns.
                </div>
              ) : (
                stagedKeys.map((key, index) => {
                  const col = columnMap.get(key) || { header: key, accessor: key };
                  const isDragging = draggedIdx === index;
                  const isOver = dragOverIdx === index;

                  return (
                    <div
                      key={key}
                      draggable
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, index)}
                      onDragEnd={handleDragEnd}
                      className={`flex items-center justify-between px-3 py-2 bg-white rounded-xl border text-xs transition-all select-none ${
                        isDragging
                          ? 'opacity-40 border-dashed border-[#24A1DD] bg-sky-50/40'
                          : isOver
                          ? 'border-[#24A1DD] ring-2 ring-[#24A1DD]/20 bg-sky-50/50 shadow-sm'
                          : 'border-slate-200 hover:border-slate-300 hover:shadow-xs'
                      }`}
                    >
                      {/* Left: Drag grip, Position Number, Header Title */}
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 p-0.5 -ml-1"
                          title="Drag to reorder"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M7 2a2 2 0 100 4 2 2 0 000-4zm0 6a2 2 0 100 4 2 2 0 000-4zm0 6a2 2 0 100 4 2 2 0 000-4zm6-12a2 2 0 100 4 2 2 0 000-4zm0 6a2 2 0 100 4 2 2 0 000-4zm0 6a2 2 0 100 4 2 2 0 000-4z" />
                          </svg>
                        </span>
                        <span className="font-mono text-[11px] font-bold text-slate-400 w-5 text-right">
                          #{index + 1}
                        </span>
                        <span className="font-semibold text-slate-800 truncate" title={col.header || col.accessor}>
                          {col.header || col.accessor}
                        </span>
                        {col.category && (
                          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
                            {col.category}
                          </span>
                        )}
                      </div>

                      {/* Right: Up / Down arrows & Remove button */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => moveUp(index)}
                          disabled={index === 0}
                          title="Move column up (left in table)"
                          className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors cursor-pointer"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => moveDown(index)}
                          disabled={index === stagedKeys.length - 1}
                          title="Move column down (right in table)"
                          className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors cursor-pointer"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {stagedKeys.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeColumn(key)}
                            title="Hide column"
                            className="p-1 rounded text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors cursor-pointer ml-1"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Show / Hide Columns View */}
        {activeTab === 'visibility' && (
          <div className="flex-1 flex flex-col min-h-0">
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
                  placeholder="Search column header or key..."
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
                    Clear All
                  </button>
                </div>
                <span className="text-slate-400 text-[11px]">
                  {stagedKeys.length} of {allColumns.length} selected
                </span>
              </div>
            </div>

            {/* Column Checkboxes List */}
            <div className="p-4 flex-1 overflow-y-auto max-h-[360px] space-y-1 custom-scrollbar">
              {filteredColumns.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs">
                  No matching columns found
                </div>
              ) : (
                filteredColumns.map((col) => {
                  const isChecked = stagedKeys.includes(col.accessor);
                  const orderIndex = isChecked ? stagedKeys.indexOf(col.accessor) + 1 : null;

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
                          className="rounded border-slate-300 text-[#24A1DD] focus:ring-[#24A1DD] h-4 w-4 cursor-pointer accent-[#24A1DD]"
                        />
                        <span>{col.header || col.accessor}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {isChecked && (
                          <span className="font-mono text-[10px] font-semibold text-[#24A1DD] bg-[#24A1DD]/10 px-1.5 py-0.5 rounded-full">
                            Pos #{orderIndex}
                          </span>
                        )}
                        {col.category && (
                          <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                            {col.category}
                          </span>
                        )}
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3 flex-shrink-0">
          <div className="text-xs text-slate-500 font-medium">
            {stagedKeys.length} columns will be displayed
          </div>
          <div className="flex items-center gap-2.5">
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
              className="px-4 py-2 bg-[#24A1DD] hover:bg-[#1e88bb] text-white font-medium text-xs rounded-xl shadow-xs transition-all cursor-pointer"
            >
              Apply Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
