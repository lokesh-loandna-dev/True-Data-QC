import React, { useState, useMemo, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { TableSkeleton } from './SkeletonLoader';
import Tooltip from './Tooltip';

const NUMERIC_OPERATORS = [
  { value: '=', label: '= (Equals)' },
  { value: '!=', label: '≠ (Not Equal)' },
  { value: '>', label: '> (Greater Than)' },
  { value: '>=', label: '≥ (Greater or Equal)' },
  { value: '<', label: '< (Less Than)' },
  { value: '<=', label: '≤ (Less or Equal)' },
  { value: 'between', label: '⇄ (Between Min & Max)' },
];

export const isNumericFilterActive = (val) => {
  return Boolean(
    val &&
    typeof val === 'object' &&
    !Array.isArray(val) &&
    val.type === 'number' &&
    val.value !== '' &&
    val.value !== undefined &&
    val.value !== null
  );
};

// Small modal popover for column filtering (supports both condition-based numeric filtering and multi-select values)
const ColumnFilterModal = ({
  col,
  columnKey,
  currentValue,
  options = [],
  onChange,
  onClear,
  isOpen,
  onClose,
  isLastColumn,
  triggerRef
}) => {
  const [modalSearch, setModalSearch] = useState('');
  const modalRef = useRef(null);
  const [coords, setCoords] = useState(null);

  // Determine if column is numeric
  const isExplicitNumeric = col.filterType === 'number' || col.dataType === 'number' || col.isNumeric === true;
  const isDetectedNumeric = useMemo(() => {
    if (isExplicitNumeric) return true;
    if (col.filterType === 'text') return false;
    if (!options || options.length === 0) return false;
    return options.every(opt => {
      if (opt === '' || opt === null || opt === undefined) return true;
      const s = String(opt).trim();
      if (s === '') return true;
      return !isNaN(Number(s));
    });
  }, [isExplicitNumeric, col.filterType, options]);

  const isNumericCol = isExplicitNumeric || isDetectedNumeric;

  // Mode: 'condition' or 'values'
  const [filterMode, setFilterMode] = useState(() => {
    if (isNumericFilterActive(currentValue)) return 'condition';
    if (Array.isArray(currentValue) && currentValue.length > 0) return 'values';
    return isExplicitNumeric ? 'condition' : 'values';
  });

  // Numeric condition local state
  const [numOperator, setNumOperator] = useState('>=');
  const [numValue, setNumValue] = useState('');
  const [numValue2, setNumValue2] = useState('');

  // Normalize currentValue to array for 'values' mode
  const selectedValues = useMemo(() => {
    if (Array.isArray(currentValue)) return currentValue;
    if (typeof currentValue === 'string' && currentValue.trim() !== '') return [currentValue];
    return [];
  }, [currentValue]);

  // Sync state whenever modal opens or currentValue changes
  useEffect(() => {
    if (isOpen) {
      if (isNumericFilterActive(currentValue)) {
        setFilterMode('condition');
        setNumOperator(currentValue.operator || '>=');
        setNumValue(currentValue.value !== undefined && currentValue.value !== null ? String(currentValue.value) : '');
        setNumValue2(currentValue.value2 !== undefined && currentValue.value2 !== null ? String(currentValue.value2) : '');
      } else if (Array.isArray(currentValue) && currentValue.length > 0) {
        setFilterMode('values');
        setNumOperator('>=');
        setNumValue('');
        setNumValue2('');
      } else {
        if (isExplicitNumeric) {
          setFilterMode('condition');
        }
        setNumOperator('>=');
        setNumValue('');
        setNumValue2('');
      }
      setModalSearch('');
    }
  }, [isOpen, currentValue, isExplicitNumeric]);

  // Calculate and update fixed position synchronously before browser paint
  useLayoutEffect(() => {
    if (!isOpen || !triggerRef?.current) {
      setCoords(null);
      return;
    }

    const updatePosition = () => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      const modalWidth = Math.min(isNumericCol ? 280 : 256, window.innerWidth - 24);
      let left = isLastColumn ? rect.right - modalWidth : rect.left;
      
      if (left + modalWidth > window.innerWidth - 12) {
        left = window.innerWidth - modalWidth - 12;
      }
      if (left < 12) {
        left = 12;
      }

      let top = rect.bottom + 6;
      const modalEstHeight = 350;
      if (top + modalEstHeight > window.innerHeight - 12) {
        top = Math.max(12, rect.top - modalEstHeight - 6);
      }

      setCoords({
        top: Math.max(12, top),
        left: Math.max(12, left),
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, triggerRef, isLastColumn, isNumericCol]);

  // Handle click outside to close popover modal
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e) => {
      if (
        modalRef.current && 
        !modalRef.current.contains(e.target) &&
        triggerRef?.current &&
        !triggerRef.current.contains(e.target)
      ) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose, triggerRef]);

  const filteredOptions = useMemo(() => {
    if (!modalSearch.trim()) return options;
    const query = modalSearch.toLowerCase().trim();
    return options.filter(opt => String(opt).toLowerCase().includes(query));
  }, [options, modalSearch]);

  if (!isOpen || !coords) return null;

  const headerText = typeof col.header === 'string' ? col.header : 'Field';

  // Apply numeric condition
  const handleApplyNumeric = (op = numOperator, val1 = numValue, val2 = numValue2) => {
    if (val1 === '' || val1 === null || val1 === undefined) {
      onClear();
      onClose();
      return;
    }
    onChange({
      type: 'number',
      operator: op,
      value: String(val1).trim(),
      value2: op === 'between' && val2 !== '' && val2 !== null ? String(val2).trim() : null,
    });
    onClose();
  };

  const handleQuickPreset = (op, val) => {
    setNumOperator(op);
    setNumValue(String(val));
    setNumValue2('');
    handleApplyNumeric(op, String(val), '');
  };

  // Toggle single option checkbox
  const handleToggleOption = (optString) => {
    const isSelected = selectedValues.some(v => String(v) === optString);
    let next;
    if (isSelected) {
      next = selectedValues.filter(v => String(v) !== optString);
    } else {
      next = [...selectedValues, optString];
    }
    onChange(next);
  };

  // Check if all filtered options are currently selected
  const isAllFilteredSelected = filteredOptions.length > 0 && filteredOptions.every(opt => 
    selectedValues.some(v => String(v) === String(opt))
  );

  // Toggle Select All filtered options
  const handleToggleSelectAll = () => {
    if (isAllFilteredSelected) {
      const filteredStrings = new Set(filteredOptions.map(opt => String(opt)));
      const next = selectedValues.filter(v => !filteredStrings.has(String(v)));
      onChange(next);
    } else {
      const filteredStrings = filteredOptions.map(opt => String(opt));
      const union = Array.from(new Set([...selectedValues.map(v => String(v)), ...filteredStrings]));
      onChange(union);
    }
  };

  const handleClearAll = () => {
    onClear();
    setNumValue('');
    setNumValue2('');
    setModalSearch('');
    onClose();
  };

  const isNumericActive = isNumericFilterActive(currentValue);

  return createPortal(
    <div
      ref={modalRef}
      style={{
        position: 'fixed',
        top: `${coords.top}px`,
        left: `${coords.left}px`,
        zIndex: 99999,
      }}
      className={`${isNumericCol ? 'w-72 max-w-[calc(100vw-24px)]' : 'w-64 max-w-[calc(100vw-24px)]'} bg-[var(--bg-surface)] rounded-2xl shadow-2xl border border-[var(--border)] text-[var(--text-primary)] animate-in fade-in slide-in-from-top-1 duration-150 font-normal overflow-hidden`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Modal Header */}
      <div className="px-3.5 py-2.5 bg-[var(--bg-elevated)] border-b border-[var(--border)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-[var(--primary)]/10 text-[var(--primary)] flex items-center justify-center">
            {isNumericCol ? (
              <span className="font-mono text-xs font-bold leading-none">#</span>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
            )}
          </div>
          <span className="font-semibold text-[var(--text-primary)] text-xs truncate max-w-[150px]" title={`Filter ${headerText}`}>
            Filter {headerText}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-5 h-5 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)] flex items-center justify-center transition-colors cursor-pointer text-xs font-bold"
        >
          ✕
        </button>
      </div>

      {/* Tabs if column is numeric */}
      {isNumericCol && (
        <div className="flex border-b border-[var(--border)] bg-[var(--bg-elevated)] p-1 gap-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setFilterMode('condition')}
            className={`flex-1 py-1 px-2 rounded-md transition-all text-center flex items-center justify-center gap-1.5 cursor-pointer ${
              filterMode === 'condition'
                ? 'bg-[var(--bg-surface)] text-[var(--primary)] shadow-2xs font-bold border border-[var(--border)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)]'
            }`}
          >
            <span className="font-mono text-xs font-bold">≥</span>
            <span>Condition</span>
            {isNumericActive && (
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)]" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('values')}
            className={`flex-1 py-1 px-2 rounded-md transition-all text-center flex items-center justify-center gap-1.5 cursor-pointer ${
              filterMode === 'values'
                ? 'bg-[var(--bg-surface)] text-[var(--primary)] shadow-2xs font-bold border border-[var(--border)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)]'
            }`}
          >
            <svg className="w-3 h-3 text-current" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h7" />
            </svg>
            <span>Values</span>
            {selectedValues.length > 0 && (
              <span className="bg-[var(--primary)] text-white text-[10px] px-1 rounded-full font-bold leading-none">
                {selectedValues.length}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Mode 1: Numeric Condition */}
      {isNumericCol && filterMode === 'condition' ? (
        <div className="p-3 space-y-2.5">
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Comparison Operator
            </label>
            <select
              value={numOperator}
              onChange={(e) => setNumOperator(e.target.value)}
              className="w-full text-xs font-semibold bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-lg px-2.5 py-1.5 text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]/20 focus:border-[var(--focus-ring)] transition-all cursor-pointer"
            >
              {NUMERIC_OPERATORS.map((op) => (
                <option key={op.value} value={op.value} className="bg-[var(--bg-elevated)] text-[var(--text-primary)]">
                  {op.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1">
              {numOperator === 'between' ? 'Range Values' : 'Target Value'}
            </label>
            {numOperator === 'between' ? (
              <div className="grid grid-cols-2 gap-1.5 items-center">
                <input
                  type="number"
                  value={numValue}
                  onChange={(e) => setNumValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleApplyNumeric()}
                  placeholder="Min"
                  className="w-full text-xs font-mono border border-[var(--border-strong)] rounded-lg px-2.5 py-1.5 bg-[var(--bg-elevated)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]/20 focus:border-[var(--focus-ring)]"
                  autoFocus
                />
                <input
                  type="number"
                  value={numValue2}
                  onChange={(e) => setNumValue2(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleApplyNumeric()}
                  placeholder="Max"
                  className="w-full text-xs font-mono border border-[var(--border-strong)] rounded-lg px-2.5 py-1.5 bg-[var(--bg-elevated)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]/20 focus:border-[var(--focus-ring)]"
                />
              </div>
            ) : (
              <input
                type="number"
                value={numValue}
                onChange={(e) => setNumValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleApplyNumeric()}
                placeholder="Enter number..."
                className="w-full text-xs font-mono border border-[var(--border-strong)] rounded-lg px-2.5 py-1.5 bg-[var(--bg-elevated)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]/20 focus:border-[var(--focus-ring)]"
                autoFocus
              />
            )}
          </div>

          {/* Quick Shortcuts */}
          <div>
            <span className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Quick Shortcuts
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => handleQuickPreset('>', 0)}
                className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 dark:bg-[#161b22] hover:bg-[#24A1DD]/10 hover:text-[#24A1DD] text-slate-600 dark:text-[#c9d1d9] transition-colors border border-slate-200 dark:border-[#30363d] cursor-pointer"
              >
                &gt; 0
              </button>
              <button
                type="button"
                onClick={() => handleQuickPreset('=', 0)}
                className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 dark:bg-[#161b22] hover:bg-[#24A1DD]/10 hover:text-[#24A1DD] text-slate-600 dark:text-[#c9d1d9] transition-colors border border-slate-200 dark:border-[#30363d] cursor-pointer"
              >
                = 0
              </button>
              <button
                type="button"
                onClick={() => handleQuickPreset('>=', 1)}
                className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 dark:bg-[#161b22] hover:bg-[#24A1DD]/10 hover:text-[#24A1DD] text-slate-600 dark:text-[#c9d1d9] transition-colors border border-slate-200 dark:border-[#30363d] cursor-pointer"
              >
                ≥ 1
              </button>
              <button
                type="button"
                onClick={() => handleQuickPreset('>=', 5)}
                className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 dark:bg-[#161b22] hover:bg-[#24A1DD]/10 hover:text-[#24A1DD] text-slate-600 dark:text-[#c9d1d9] transition-colors border border-slate-200 dark:border-[#30363d] cursor-pointer"
              >
                ≥ 5
              </button>
            </div>
          </div>

          {/* Footer for condition mode */}
          <div className="pt-2 border-t border-slate-200 dark:border-[#30363d] flex items-center justify-between gap-2">
            {isNumericActive ? (
              <button
                type="button"
                onClick={handleClearAll}
                className="text-xs text-rose-600 hover:text-rose-700 font-semibold cursor-pointer py-1"
              >
                Clear
              </button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onClose}
                className="px-2.5 py-1 text-xs font-semibold text-slate-600 dark:text-[#c9d1d9] hover:bg-slate-100 dark:hover:bg-[#21262d] rounded-lg cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleApplyNumeric()}
                disabled={numValue === ''}
                className="px-3 py-1 bg-[#24A1DD] hover:bg-[#1e88bb] disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Mode 2: Values Multi-select List */
        <>
          {/* Search Input Box */}
          <div className="p-2.5 bg-slate-50/50 dark:bg-[#0d1117]/30 border-b border-slate-100 dark:border-[#21262d]">
            <div className="relative flex items-center">
              <input
                type="text"
                value={modalSearch}
                onChange={(e) => setModalSearch(e.target.value)}
                placeholder={`Search ${headerText}...`}
                className="w-full pl-8 pr-7 py-1.5 text-xs border border-[var(--border-strong)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]/20 focus:border-[var(--focus-ring)] bg-[var(--bg-elevated)] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] transition-all"
                autoFocus
              />
              <svg
                className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {modalSearch && (
                <button
                  type="button"
                  onClick={() => setModalSearch('')}
                  className="absolute right-2 text-slate-400 hover:text-slate-600 dark:hover:text-[#f0f6fc] text-[10px] font-bold p-0.5"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Options List */}
          <div className="max-h-52 overflow-y-auto p-1.5 space-y-0.5 custom-scrollbar">
            {/* Select All Row */}
            {filteredOptions.length > 0 && (
              <label className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-100/70 dark:hover:bg-[#21262d]/70 rounded-lg cursor-pointer text-xs font-semibold text-slate-800 dark:text-[#c9d1d9] border-b border-slate-100 dark:border-[#21262d] transition-colors">
                <input
                  type="checkbox"
                  checked={isAllFilteredSelected}
                  onChange={handleToggleSelectAll}
                  className="w-3.5 h-3.5 rounded border-slate-300 text-[#24A1DD] focus:ring-[#24A1DD]/30 cursor-pointer accent-[#24A1DD]"
                />
                <span className="truncate">Select All ({filteredOptions.length})</span>
              </label>
            )}

            {filteredOptions.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-slate-400">
                No matching options
              </div>
            ) : (
              filteredOptions.map((opt, idx) => {
                const optString = String(opt);
                const isChecked = selectedValues.some(v => String(v) === optString);
                return (
                  <label
                    key={idx}
                    className={`flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-[#21262d] rounded-lg cursor-pointer text-xs transition-colors ${
                      isChecked ? 'bg-[#24A1DD]/5 dark:bg-[#24A1DD]/10 font-medium text-[#24A1DD] dark:text-[#58a6ff]' : 'text-slate-600 dark:text-[#c9d1d9]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleToggleOption(optString)}
                      className="w-3.5 h-3.5 rounded border-slate-300 text-[#24A1DD] focus:ring-[#24A1DD]/30 cursor-pointer accent-[#24A1DD]"
                    />
                    <span className="truncate" title={optString}>{optString}</span>
                  </label>
                );
              })
            )}
          </div>

          {/* Footer Info */}
          <div className="px-3 py-2 bg-slate-50 dark:bg-[#161b22] border-t border-slate-200 dark:border-[#30363d] flex items-center justify-between text-[11px] text-slate-500 dark:text-[#8b949e]">
            <span>
              {selectedValues.length > 0 ? (
                <strong className="text-[#24A1DD] dark:text-[#58a6ff] font-semibold">{selectedValues.length} selected</strong>
              ) : (
                `${filteredOptions.length} of ${options.length} options`
              )}
            </span>
            {(selectedValues.length > 0 || isNumericActive) && (
              <button
                type="button"
                onClick={handleClearAll}
                className="text-rose-600 hover:text-rose-700 font-semibold cursor-pointer"
              >
                Clear Filter
              </button>
            )}
          </div>
        </>
      )}
    </div>,
    document.body
  );
};

export const DataTable = ({
  data = [],
  columns = [],
  searchable = true,
  columnFiltersEnabled = true,
  initialColumnFilters = {},
  pagination = true,
  itemsPerPageOptions = [5, 10, 25, 50],
  defaultItemsPerPage = 10,
  emptyMessage = "No records found.",
  loading = false,
  error = null,
  customHeader = null,
  searchActions = null,
  className = "",
  density = "normal",
  maxHeight = "calc(100vh - 220px)",
  showColumnBorders = true,
  // Column reordering props
  enableColumnReorder = true,
  onColumnOrderChange = null,
  // Server-side props
  serverSide = false,
  totalCount,
  onPageChange,
  onItemsPerPageChange,
  onSearchChange,
  onSortChange,
  onFilterChange,
  serverFilterOptions = {},
  onClearFilters = null,
  // Expandable row props
  renderExpandedRow = null,
  rowKey = null,
  expandedRowKeys = null,
  onToggleExpand = null,
  expandOnRowClick = false,
  onRowClick = null,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [columnFilters, setColumnFilters] = useState(initialColumnFilters);
  const [activeModalKey, setActiveModalKey] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(defaultItemsPerPage);
  const [internalExpandedKeys, setInternalExpandedKeys] = useState(new Set());
  const filterBtnRefs = useRef({});
  const tableContainerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(null);

  // Column reorder drag & drop state
  const [draggedHeaderIdx, setDraggedHeaderIdx] = useState(null);
  const [dragOverHeaderIdx, setDragOverHeaderIdx] = useState(null);
  const [dragOverSide, setDragOverSide] = useState(null); // 'left' | 'right'

  const handleHeaderDragStart = (e, index) => {
    if (e.target.closest('button, input, select, textarea, [data-no-drag="true"]')) {
      e.preventDefault();
      return;
    }
    setDraggedHeaderIdx(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleHeaderDragOver = (e, index, col) => {
    if (draggedHeaderIdx === null || draggedHeaderIdx === index) return;
    if (col.draggable === false || col.accessor === 'sno' || col.accessor === 'selection') return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const rect = e.currentTarget.getBoundingClientRect();
    const isRightHalf = e.clientX > rect.left + rect.width / 2;
    const side = isRightHalf ? 'right' : 'left';

    setDragOverHeaderIdx(index);
    setDragOverSide(side);
  };

  const handleHeaderDragLeave = (e) => {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setDragOverHeaderIdx(null);
    setDragOverSide(null);
  };

  const handleHeaderDrop = (e, targetIndex) => {
    e.preventDefault();
    if (draggedHeaderIdx === null || draggedHeaderIdx === targetIndex) {
      setDraggedHeaderIdx(null);
      setDragOverHeaderIdx(null);
      setDragOverSide(null);
      return;
    }

    const targetCol = columns[targetIndex];
    const sourceCol = columns[draggedHeaderIdx];
    if (targetCol?.draggable === false || sourceCol?.draggable === false || targetCol?.accessor === 'sno' || targetCol?.accessor === 'selection') {
      setDraggedHeaderIdx(null);
      setDragOverHeaderIdx(null);
      setDragOverSide(null);
      return;
    }

    const fromIndex = draggedHeaderIdx;
    let toIndex = targetIndex;
    if (dragOverSide === 'left') {
      toIndex = fromIndex < targetIndex ? targetIndex - 1 : targetIndex;
    } else {
      toIndex = fromIndex < targetIndex ? targetIndex : targetIndex + 1;
    }
    toIndex = Math.max(0, Math.min(columns.length - 1, toIndex));

    setDraggedHeaderIdx(null);
    setDragOverHeaderIdx(null);
    setDragOverSide(null);

    if (fromIndex !== toIndex && onColumnOrderChange) {
      const nextCols = [...columns];
      const [removed] = nextCols.splice(fromIndex, 1);
      nextCols.splice(toIndex, 0, removed);
      const newKeys = nextCols.map((c, i) => c.accessor || c.id || c.key || `col_${i}`);
      onColumnOrderChange(newKeys, nextCols);
    }
  };

  const handleHeaderDragEnd = () => {
    setDraggedHeaderIdx(null);
    setDragOverHeaderIdx(null);
    setDragOverSide(null);
  };

  useLayoutEffect(() => {
    if (!tableContainerRef.current) return;
    const updateWidth = () => {
      if (tableContainerRef.current) {
        setContainerWidth(tableContainerRef.current.clientWidth);
      }
    };
    updateWidth();
    const ro = new ResizeObserver(updateWidth);
    ro.observe(tableContainerRef.current);
    return () => ro.disconnect();
  }, []);

  const currentExpandedKeys = useMemo(() => {
    if (expandedRowKeys !== null && expandedRowKeys !== undefined) {
      if (expandedRowKeys instanceof Set) return expandedRowKeys;
      if (Array.isArray(expandedRowKeys)) return new Set(expandedRowKeys);
      return new Set([expandedRowKeys]);
    }
    return internalExpandedKeys;
  }, [expandedRowKeys, internalExpandedKeys]);

  const getRowKey = useCallback((row, rowIndex) => {
    if (rowKey) {
      if (typeof rowKey === 'function') return rowKey(row, rowIndex);
      if (typeof rowKey === 'string' && row[rowKey] !== undefined) return row[rowKey];
    }
    if (row && row.id !== undefined && row.id !== null) return row.id;
    return rowIndex;
  }, [rowKey]);

  const handleRowExpandToggle = useCallback((key, row, rowIndex) => {
    if (onToggleExpand) {
      onToggleExpand(key, row, rowIndex);
    } else {
      setInternalExpandedKeys(prev => {
        const next = new Set(prev);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }
        return next;
      });
    }
  }, [onToggleExpand]);

  const handleRowClick = useCallback((row, rowIndex, e) => {
    const isInteractive = e.target.closest('button, a, input, select, textarea, [data-no-row-click="true"]');
    if (isInteractive) return;

    if (onRowClick) {
      onRowClick(row, rowIndex, e);
    }

    if (renderExpandedRow && expandOnRowClick) {
      const key = getRowKey(row, rowIndex);
      handleRowExpandToggle(key, row, rowIndex);
    }
  }, [onRowClick, renderExpandedRow, expandOnRowClick, getRowKey, handleRowExpandToggle]);

  // Debounce server side search
  useEffect(() => {
    if (!serverSide) return;
    const timer = setTimeout(() => {
      if (onSearchChange) {
        onSearchChange(searchTerm);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [searchTerm, serverSide]);

  const getColumnKey = (col, index) => col.accessor || col.id || col.key || `col_${index}`;

  const getColumnValue = (item, col) => {
    if (col.filterValue) return col.filterValue(item);
    if (col.searchableValue) return col.searchableValue(item);
    if (col.accessor && col.accessor !== 'actions') return item[col.accessor];
    return null;
  };

  const isColumnFilterable = (col) => {
    if (col.filterable === false) return false;
    if (col.accessor === 'actions') return false;
    if (!col.accessor && !col.filterValue && !col.searchableValue) return false;
    return true;
  };

  // Helper to check if a data item matches all active filters (optionally excluding a specific column key)
  const checkItemMatchesFilters = (item, excludeKey = null) => {
    // Global search match
    if (searchTerm) {
      const lowercasedSearch = searchTerm.toLowerCase();
      const matchesGlobal = columns.some(col => {
        if (col.searchable === false) return false;
        const val = getColumnValue(item, col);
        return val !== null && val !== undefined && String(val).toLowerCase().includes(lowercasedSearch);
      });
      if (!matchesGlobal) return false;
    }

    // Per-column filters match
    for (let index = 0; index < columns.length; index++) {
      const col = columns[index];
      if (!isColumnFilterable(col)) continue;
      
      const key = getColumnKey(col, index);
      if (excludeKey && key === excludeKey) continue;

      const filterVal = columnFilters[key];
      if (!filterVal) continue;

      // Numeric condition filter check
      if (isNumericFilterActive(filterVal)) {
        const val = getColumnValue(item, col);
        if (val === null || val === undefined || val === '') return false;

        const numVal = typeof val === 'number' ? val : Number(String(val).replace(/,/g, '').trim());
        if (isNaN(numVal)) return false;

        const targetVal = Number(filterVal.value);
        if (isNaN(targetVal)) return false;

        const op = filterVal.operator || '=';
        if (op === '=') {
          if (numVal !== targetVal) return false;
        } else if (op === '!=') {
          if (numVal === targetVal) return false;
        } else if (op === '>') {
          if (numVal <= targetVal) return false;
        } else if (op === '>=') {
          if (numVal < targetVal) return false;
        } else if (op === '<') {
          if (numVal >= targetVal) return false;
        } else if (op === '<=') {
          if (numVal > targetVal) return false;
        } else if (op === 'between') {
          const targetVal2 = filterVal.value2 !== '' && filterVal.value2 !== null && filterVal.value2 !== undefined
            ? Number(filterVal.value2)
            : null;
          if (targetVal2 !== null && !isNaN(targetVal2)) {
            const min = Math.min(targetVal, targetVal2);
            const max = Math.max(targetVal, targetVal2);
            if (numVal < min || numVal > max) return false;
          } else {
            if (numVal < targetVal) return false;
          }
        }
        continue;
      }

      if (Array.isArray(filterVal)) {
        if (filterVal.length === 0) continue;
        const val = getColumnValue(item, col);
        if (val === null || val === undefined) return false;
        const strVal = String(val).trim();

        const matches = filterVal.some(selectedOpt => 
          String(selectedOpt).toLowerCase().trim() === strVal.toLowerCase()
        );
        if (!matches) return false;
      } else {
        if (String(filterVal).trim() === '') continue;
        const val = getColumnValue(item, col);
        if (val === null || val === undefined) return false;

        const strVal = String(val).toLowerCase();
        const targetVal = String(filterVal).toLowerCase().trim();

        if (!strVal.includes(targetVal)) {
          return false;
        }
      }
    }

    return true;
  };

  // Build map of unique record values for each filterable column based on remaining filtered data (dependent/cascading filter options)
  const uniqueValuesMap = useMemo(() => {
    const map = {};

    if (serverSide) {
      columns.forEach((col, index) => {
        if (!isColumnFilterable(col)) return;
        const key = getColumnKey(col, index);
        let opts = serverFilterOptions[key] || [];
        if (col.filterOptions) {
          opts = col.filterOptions;
        }
        map[key] = opts;
      });
      return map;
    }

    if (!data || data.length === 0) return map;

    columns.forEach((col, index) => {
      if (!isColumnFilterable(col)) return;
      const key = getColumnKey(col, index);
      
      // Filter dataset by all active filters EXCEPT the current column key
      const relevantData = data.filter(item => checkItemMatchesFilters(item, key));

      const set = new Set();
      
      // Keep currently selected values in the list so user can see and toggle them
      const currentValue = columnFilters[key];
      if (Array.isArray(currentValue)) {
        currentValue.forEach(v => {
          if (v !== null && v !== undefined && String(v).trim() !== '') {
            set.add(String(v).trim());
          }
        });
      } else if (currentValue && !isNumericFilterActive(currentValue) && String(currentValue).trim() !== '') {
        set.add(String(currentValue).trim());
      }

      relevantData.forEach(item => {
        const val = getColumnValue(item, col);
        if (val !== null && val !== undefined) {
          const strVal = String(val).trim();
          if (strVal !== '') {
            set.add(strVal);
          }
        }
      });

      let optionsList = Array.from(set);

      if (col.filterOptions) {
        optionsList = col.filterOptions.filter(opt => set.has(String(opt).trim()));
        if (optionsList.length === 0 && col.filterOptions.length > 0) {
          optionsList = col.filterOptions;
        }
      } else {
        optionsList.sort((a, b) =>
          a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
        );
      }

      map[key] = optionsList;
    });
    return map;
  }, [serverSide, serverFilterOptions, data, columns, columnFilters, searchTerm]);

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
    if (serverSide && onSortChange) {
      onSortChange({ key, direction });
    }
  };

  const handleColumnFilterChange = (key, value) => {
    const nextFilters = {
      ...columnFilters,
      [key]: value
    };
    setColumnFilters(nextFilters);
    if (serverSide && onFilterChange) {
      onFilterChange(nextFilters);
    }
  };

  const handleClearColumnFilter = (key) => {
    const copy = { ...columnFilters };
    delete copy[key];
    setColumnFilters(copy);
    if (serverSide && onFilterChange) {
      onFilterChange(copy);
    }
  };

  const handleClearAllFilters = () => {
    setSearchTerm('');
    setColumnFilters({});
    if (onClearFilters) {
      onClearFilters();
    }
    if (serverSide) {
      if (onSearchChange) onSearchChange('');
      if (onFilterChange) onFilterChange({});
    }
  };

  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
    if (serverSide && onPageChange) {
      onPageChange(newPage);
    }
  };

  const handleItemsPerPageChange = (newLimit) => {
    setItemsPerPage(newLimit);
    setCurrentPage(1);
    if (serverSide && onItemsPerPageChange) {
      onItemsPerPageChange(newLimit);
    }
  };

  const activeColumnCount = useMemo(() => {
    return Object.values(columnFilters).filter(val => {
      if (!val) return false;
      if (Array.isArray(val)) return val.length > 0;
      if (isNumericFilterActive(val)) return true;
      return String(val).trim() !== '';
    }).length;
  }, [columnFilters]);

  const totalActiveFilters = activeColumnCount + (searchTerm ? 1 : 0);

  const filteredData = useMemo(() => {
    if (serverSide) return data;
    if (!data || data.length === 0) return [];
    return data.filter(item => checkItemMatchesFilters(item, null));
  }, [serverSide, data, searchTerm, columnFilters, columns]);

  const sortedData = useMemo(() => {
    if (serverSide) return data;
    if (!sortConfig.key) return filteredData;
    
    const sorted = [...filteredData].sort((a, b) => {
      const colConfig = columns.find(c => c.accessor === sortConfig.key);
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];

      if (colConfig && colConfig.sortValue) {
        aVal = colConfig.sortValue(a);
        bVal = colConfig.sortValue(b);
      }
      
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [serverSide, filteredData, sortConfig, columns, data]);

  const paginatedData = useMemo(() => {
    if (serverSide) return data;
    if (!pagination) return sortedData;
    const startIndex = (currentPage - 1) * itemsPerPage;
    return sortedData.slice(startIndex, startIndex + itemsPerPage);
  }, [serverSide, data, sortedData, pagination, currentPage, itemsPerPage]);

  const totalEntries = serverSide ? (totalCount !== undefined ? totalCount : data.length) : sortedData.length;
  const totalPages = Math.ceil(totalEntries / itemsPerPage) || 1;

  // Reset to page 1 if search or filters change (client-side mode)
  useEffect(() => {
    if (!serverSide) {
      setCurrentPage(1);
    }
  }, [serverSide, searchTerm, columnFilters, itemsPerPage]);

  // Mobile Card View Column Categorizations
  const snoCol = useMemo(() => {
    return columns.find(c => 
      c.accessor === 'sno' || 
      c.accessor === 'selection' || 
      (c.accessor === 'id' && (c.header === 'S.No' || c.header === 'S.No.'))
    );
  }, [columns]);

  const actionCol = useMemo(() => {
    return columns.find(c => c.accessor === 'actions' || c.accessor === 'action');
  }, [columns]);

  const primaryCol = useMemo(() => {
    return columns.find(c => 
      c.accessor !== 'sno' && 
      c.accessor !== 'selection' && 
      !(c.accessor === 'id' && (c.header === 'S.No' || c.header === 'S.No.')) && 
      c.accessor !== 'actions' && 
      c.accessor !== 'action'
    ) || columns[0];
  }, [columns]);

  const statusCol = useMemo(() => {
    return columns.find(c => 
      c !== primaryCol &&
      c !== snoCol &&
      c !== actionCol &&
      (c.accessor === 'status' || 
       c.accessor === 'final_result' || 
       c.accessor === 'result' ||
       c.accessor === 'role' ||
       c.accessor === 'ingestion_mode')
    );
  }, [columns, primaryCol, snoCol, actionCol]);

  const cardBodyCols = useMemo(() => {
    return columns.filter(c => 
      c !== snoCol && 
      c !== actionCol && 
      c !== primaryCol &&
      c !== statusCol &&
      c.accessor !== 'selection'
    );
  }, [columns, snoCol, actionCol, primaryCol, statusCol]);

  const sortableCols = useMemo(() => {
    return columns.filter(c => c.sortable && c.accessor && c.accessor !== 'sno' && c.accessor !== 'actions');
  }, [columns]);

  return (
    <div className={`w-full flex flex-col min-h-0 ${className}`}>
      {/* Search, Filter Controls & Header Row */}
      {(searchable || columnFiltersEnabled || customHeader || searchActions) && (
        <div className={`flex flex-col xl:flex-row justify-between items-stretch xl:items-center gap-3 ${density === 'compact' ? 'mb-2.5' : 'mb-4'} flex-shrink-0`}>
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            {searchable && (
              <div className="relative w-full sm:w-60 md:w-64 shrink-0">
                <input
                  type="text"
                  placeholder="Search all columns..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={`w-full pl-9 pr-8 ${density === 'compact' ? 'h-8 text-xs' : 'h-9 text-xs'} bg-[var(--bg-elevated)] border border-[var(--border)] hover:border-[var(--border-strong)] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] rounded-lg shadow-2xs focus:outline-none focus:border-[var(--focus-ring)] focus:ring-2 focus:ring-[var(--focus-ring)]/20 transition-all`}
                />
                <svg
                  className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-[#f0f6fc] text-xs font-bold p-0.5 cursor-pointer"
                    title="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>
            )}

            {searchActions}

            {totalActiveFilters > 0 && (
              <button
                type="button"
                onClick={handleClearAllFilters}
                className={`inline-flex items-center gap-1.5 ${density === 'compact' ? 'h-8 px-2 text-xs' : 'h-9 px-2.5 text-xs'} text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 bg-rose-50/70 dark:bg-rose-950/40 hover:bg-rose-50 dark:hover:bg-rose-900/50 rounded-lg transition-colors font-medium cursor-pointer border border-rose-200/80 dark:border-rose-800/80 shadow-2xs whitespace-nowrap shrink-0`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span>Clear Filters ({totalActiveFilters})</span>
              </button>
            )}
          </div>

          {customHeader && (
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap justify-start xl:justify-end shrink-0">
              {typeof customHeader === 'function'
                ? customHeader({ data, filteredData, sortedData })
                : customHeader}
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div
        className={`bg-[var(--bg-surface)] rounded-xl shadow-sm border border-[var(--border)] flex flex-col min-h-0 overflow-hidden ${
          maxHeight === '100%' ? 'flex-1 h-full' : 'h-auto'
        }`}
        style={maxHeight && maxHeight !== '100%' && maxHeight !== 'none' ? { maxHeight: typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight } : {}}
      >
        {error && (
          <div className="p-4 bg-[var(--error-bg)] border-b border-[var(--error)]/20 text-[var(--error)] text-sm flex-shrink-0">
            {error}
          </div>
        )}
        <div
          ref={tableContainerRef}
          className="overflow-x-auto overflow-y-auto flex-1 min-h-0 smooth-scroll custom-scrollbar scroll-smooth overscroll-contain"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {/* ═══════════════════════════════════════════════════════════
              MOBILE CARD VIEW (< md breakpoints)
             ═══════════════════════════════════════════════════════════ */}
          <div className="md:hidden flex flex-col">
            {/* Mobile Header / Quick Sort & Select-All Bar */}
            <div className="flex items-center justify-between px-3.5 py-2.5 bg-[var(--bg-elevated)]/60 border-b border-[var(--border)] text-xs flex-wrap gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {typeof snoCol?.header === 'function' && (
                  <div className="flex items-center">
                    {snoCol.header({ filteredData: sortedData })}
                  </div>
                )}
                <span className="text-xs text-[var(--text-secondary)] font-medium">
                  {totalEntries} {totalEntries === 1 ? 'record' : 'records'}
                </span>
              </div>

              {sortableCols.length > 0 && (
                <div className="flex items-center gap-1.5 ml-auto">
                  <label htmlFor="mobile-sort-select" className="text-[11px] text-[var(--text-disabled)] font-medium">Sort:</label>
                  <select
                    id="mobile-sort-select"
                    value={sortConfig.key ? `${sortConfig.key}-${sortConfig.direction}` : ''}
                    onChange={(e) => {
                      if (!e.target.value) {
                        setSortConfig({ key: null, direction: 'asc' });
                      } else {
                        const [k, d] = e.target.value.split('-');
                        setSortConfig({ key: k, direction: d });
                      }
                    }}
                    className="bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border)] rounded-lg px-2 py-1 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-[var(--focus-ring)] cursor-pointer"
                    aria-label="Sort records on mobile"
                  >
                    <option value="">Default</option>
                    {sortableCols.map((c) => {
                      const name = typeof c.header === 'string' ? c.header : (c.headerTitle || c.accessor);
                      return (
                        <React.Fragment key={c.accessor}>
                          <option value={`${c.accessor}-asc`}>{name} (Asc)</option>
                          <option value={`${c.accessor}-desc`}>{name} (Desc)</option>
                        </React.Fragment>
                      );
                    })}
                  </select>
                </div>
              )}
            </div>

            {/* Mobile Cards Container */}
            <div className="p-3 flex flex-col gap-3">
              {loading && data.length === 0 ? (
                /* Mobile Card Skeleton */
                Array.from({ length: Math.min(defaultItemsPerPage || 5, 5) }).map((_, idx) => (
                  <div key={`skel-card-${idx}`} className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-3.5 space-y-3 animate-pulse">
                    <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded bg-slate-200 dark:bg-[var(--border)]" />
                        <div className="w-32 h-4 rounded bg-slate-200 dark:bg-[var(--border)]" />
                      </div>
                      <div className="w-16 h-5 rounded-full bg-slate-200 dark:bg-[var(--border)]" />
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="space-y-1">
                        <div className="w-14 h-2.5 rounded bg-slate-200 dark:bg-[var(--border)]" />
                        <div className="w-20 h-3.5 rounded bg-slate-200 dark:bg-[var(--border)]" />
                      </div>
                      <div className="space-y-1">
                        <div className="w-14 h-2.5 rounded bg-slate-200 dark:bg-[var(--border)]" />
                        <div className="w-20 h-3.5 rounded bg-slate-200 dark:bg-[var(--border)]" />
                      </div>
                      <div className="space-y-1">
                        <div className="w-14 h-2.5 rounded bg-slate-200 dark:bg-[var(--border)]" />
                        <div className="w-24 h-3.5 rounded bg-slate-200 dark:bg-[var(--border)]" />
                      </div>
                      <div className="space-y-1">
                        <div className="w-14 h-2.5 rounded bg-slate-200 dark:bg-[var(--border)]" />
                        <div className="w-16 h-3.5 rounded bg-slate-200 dark:bg-[var(--border)]" />
                      </div>
                    </div>
                  </div>
                ))
              ) : paginatedData.length > 0 ? (
                paginatedData.map((row, rowIndex) => {
                  const currentKey = getRowKey(row, rowIndex);
                  const isExpanded = Boolean(renderExpandedRow && currentExpandedKeys.has(currentKey));
                  const globalIndex = (currentPage - 1) * itemsPerPage + rowIndex;

                  return (
                    <div
                      key={currentKey}
                      onClick={(e) => handleRowClick(row, rowIndex, e)}
                      className={`bg-[var(--bg-surface)] border rounded-xl p-3.5 shadow-2xs transition-all flex flex-col gap-2.5 ${
                        isExpanded
                          ? 'border-[var(--primary)]/60 bg-sky-50/20 dark:bg-[var(--primary-soft)]/20 ring-1 ring-[var(--primary)]/20'
                          : 'border-[var(--border)] hover:border-[var(--border-strong)]'
                      } ${(expandOnRowClick || onRowClick) ? 'cursor-pointer active:scale-[0.99]' : ''}`}
                    >
                      {/* Top Bar: Primary / Title, S.No, Status Badge, Expand Toggle */}
                      <div className="flex items-start justify-between gap-2.5 pb-2 border-b border-[var(--border)]/70">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {snoCol && (
                            <div className="shrink-0 flex items-center">
                              {snoCol.render
                                ? snoCol.render(row, rowIndex, (currentPage - 1) * itemsPerPage, isExpanded)
                                : <span className="font-mono text-xs font-semibold text-[var(--text-secondary)]">#{globalIndex + 1}</span>}
                            </div>
                          )}
                          {primaryCol && (
                            <div className="min-w-0 flex-1 font-semibold text-sm text-[var(--text-primary)]">
                              {primaryCol.render
                                ? primaryCol.render(row, rowIndex, (currentPage - 1) * itemsPerPage, isExpanded)
                                : (row[primaryCol.accessor] ?? '-')}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {statusCol && (
                            <div className="shrink-0">
                              {statusCol.render
                                ? statusCol.render(row, rowIndex, (currentPage - 1) * itemsPerPage, isExpanded)
                                : <span className="text-xs font-semibold">{row[statusCol.accessor] ?? ''}</span>}
                            </div>
                          )}
                          {renderExpandedRow && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRowExpandToggle(currentKey, row, rowIndex);
                              }}
                              className={`p-1 rounded-md text-[var(--text-secondary)] hover:text-[var(--primary)] hover:bg-[var(--bg-elevated)] transition-transform duration-200 ${
                                isExpanded ? 'rotate-90 text-[var(--primary)] bg-[var(--primary-soft)]' : ''
                              }`}
                              aria-label={isExpanded ? "Collapse details" : "Expand details"}
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Card Content Grid */}
                      {cardBodyCols.length > 0 && (
                        <div className="grid grid-cols-2 gap-2.5 text-xs py-0.5">
                          {cardBodyCols.map((col, cIdx) => {
                            const headerLabel = typeof col.header === 'string'
                              ? col.header
                              : (col.headerTitle || col.accessor || '');
                            if (!headerLabel) return null;

                            const isWide =
                              col.accessor === 'condition_text' ||
                              col.accessor === 'condition_outcome' ||
                              col.accessor === 'final_remarks' ||
                              col.accessor === 'true_data' ||
                              col.accessor === 'uploaded_at' ||
                              col.accessor === 'email' ||
                              col.accessor === 'action' ||
                              col.accessor === 'remark';

                            return (
                              <div
                                key={col.accessor || cIdx}
                                className={`flex flex-col gap-1 ${isWide ? 'col-span-2' : 'col-span-1'}`}
                                onClick={(e) => {
                                  // Don't trigger card row click when interacting with form controls
                                  if (col.accessor === 'action' || col.accessor === 'remark') {
                                    e.stopPropagation();
                                  }
                                }}
                              >
                                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                                  {headerLabel}
                                </span>
                                <div className="text-xs font-medium text-[var(--text-primary)]">
                                  {col.render
                                    ? col.render(row, rowIndex, (currentPage - 1) * itemsPerPage, isExpanded)
                                    : (row[col.accessor] ?? '-')}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Card Footer Actions */}
                      {actionCol && (
                        <div
                          className="pt-2 border-t border-[var(--border)]/70 flex items-center justify-end gap-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {actionCol.render
                            ? actionCol.render(row, rowIndex, (currentPage - 1) * itemsPerPage, isExpanded)
                            : row[actionCol.accessor]}
                        </div>
                      )}

                      {/* Expanded View Inside Card */}
                      {isExpanded && renderExpandedRow && (
                        <div className="pt-2.5 border-t border-[var(--border)] animate-in fade-in slide-in-from-top-1 duration-150">
                          {renderExpandedRow(row, rowIndex, () => handleRowExpandToggle(currentKey, row, rowIndex), containerWidth)}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                /* Mobile Empty State Card */
                <div className="p-8 text-center text-slate-500 dark:text-[var(--text-secondary)] text-sm bg-[var(--bg-surface)] rounded-xl border border-[var(--border)]">
                  {totalActiveFilters > 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-4">
                      <span className="text-slate-600 dark:text-[var(--text-primary)] font-medium">No records match the current filters.</span>
                      <button
                        type="button"
                        onClick={handleClearAllFilters}
                        className="px-3 py-1.5 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                      >
                        Clear All Filters
                      </button>
                    </div>
                  ) : (
                    emptyMessage
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════
              DESKTOP & LAPTOP TABLE VIEW (>= md breakpoints)
             ═══════════════════════════════════════════════════════════ */}
          <table className="hidden md:table w-full text-left border-collapse border-b border-black/15 dark:border-white/15 min-w-[720px] sm:min-w-[850px] lg:min-w-[950px]">
            <thead className="sticky top-0 z-20 bg-[#24a1dd] shadow-xs">
              <tr className="bg-[#24a1dd] text-white text-xs sm:text-sm border-b border-[#1b8ec5]">
                {columns.map((col, index) => {
                  const key = getColumnKey(col, index);
                  const filterable = isColumnFilterable(col);
                  const currentValue = columnFilters[key] || [];
                  const options = uniqueValuesMap[key] || [];

                  const isNumericFilter = isNumericFilterActive(currentValue);
                  const hasFilter = Array.isArray(currentValue)
                    ? currentValue.length > 0
                    : isNumericFilter
                      ? true
                      : Boolean(currentValue && String(currentValue).trim() !== '');

                  const getFilterBadge = () => {
                    if (Array.isArray(currentValue)) {
                      return currentValue.length > 0 ? currentValue.length : null;
                    }
                    if (isNumericFilter) {
                      const op = currentValue.operator || '=';
                      const symMap = { '=': '=', '!=': '≠', '>': '>', '>=': '≥', '<': '<', '<=': '≤' };
                      const sym = symMap[op] || op;
                      if (op === 'between' && currentValue.value2) {
                        return `${currentValue.value}-${currentValue.value2}`;
                      }
                      return `${sym}${currentValue.value}`;
                    }
                    if (currentValue && String(currentValue).trim() !== '') {
                      return 1;
                    }
                    return null;
                  };

                  const badgeContent = getFilterBadge();
                  const isColReorderable = Boolean(onColumnOrderChange && enableColumnReorder && col.draggable !== false && col.accessor !== 'sno' && col.accessor !== 'selection');
                  const isDraggingThis = draggedHeaderIdx === index;
                  const isOverThis = dragOverHeaderIdx === index;

                  return (
                    <th 
                      key={key} 
                      draggable={isColReorderable}
                      onDragStart={(e) => isColReorderable && handleHeaderDragStart(e, index)}
                      onDragOver={(e) => isColReorderable && handleHeaderDragOver(e, index, col)}
                      onDragLeave={handleHeaderDragLeave}
                      onDrop={(e) => isColReorderable && handleHeaderDrop(e, index)}
                      onDragEnd={handleHeaderDragEnd}
                      className={`group/th sticky top-0 ${activeModalKey === key ? 'z-[999]' : 'z-20'} ${density === 'compact' ? 'px-2.5 py-1.5 text-[11px] sm:text-xs' : 'px-3 py-2 text-xs sm:text-sm'} font-semibold transition-colors bg-[#24a1dd] text-white hover:bg-[#1e8ec5] ${showColumnBorders ? 'border-r border-[#167cae] last:border-r-0' : ''} ${isDraggingThis ? 'opacity-40 bg-[#1b8ec5]' : ''} ${isOverThis && dragOverSide === 'left' ? 'border-l-4 border-l-white bg-[#1e8ec5]' : ''} ${isOverThis && dragOverSide === 'right' ? 'border-r-4 border-r-white bg-[#1e8ec5]' : ''} ${col.headerClassName || ''}`}
                      style={{ width: col.width || 'auto', ...(col.style || {}), ...(activeModalKey === key ? { zIndex: 999 } : {}) }}
                    >
                      <div className={`flex items-center justify-between gap-1.5 ${col.align === 'right' ? 'justify-end' : col.align === 'center' ? 'justify-center' : 'justify-start'}`}>
                        <div 
                          className={`flex items-center gap-1 truncate ${col.sortable ? 'cursor-pointer select-none hover:text-white/80' : ''}`}
                          onClick={() => col.sortable && col.accessor ? handleSort(col.accessor) : null}
                        >
                          {isColReorderable && (
                            <span
                              className="text-white/60 hover:text-white opacity-0 group-hover/th:opacity-100 transition-opacity cursor-grab active:cursor-grabbing p-0.5 -ml-1 flex-shrink-0"
                              title="Drag column to change order"
                              data-no-drag="false"
                            >
                              <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M7 2a2 2 0 100 4 2 2 0 000-4zm0 6a2 2 0 100 4 2 2 0 000-4zm0 6a2 2 0 100 4 2 2 0 000-4zm6-12a2 2 0 100 4 2 2 0 000-4zm0 6a2 2 0 100 4 2 2 0 000-4zm0 6a2 2 0 100 4 2 2 0 000-4z" />
                              </svg>
                            </span>
                          )}
                          <span className="truncate">
                            {typeof col.header === 'function'
                              ? col.header({ data, filteredData, sortedData, paginatedData })
                              : col.header}
                          </span>
                          {(col.headerTooltip || col.tooltip) && (
                            <Tooltip text={col.headerTooltip || col.tooltip} position="top">
                              <span
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center justify-center text-white/70 hover:text-white transition-colors cursor-help p-0.5"
                                aria-label="Information"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              </span>
                            </Tooltip>
                          )}
                          {col.sortable && (
                            <div className="flex flex-col text-[10px] leading-none opacity-70 ml-0.5 flex-shrink-0">
                              <span className={sortConfig.key === col.accessor && sortConfig.direction === 'asc' ? 'text-white opacity-100 font-bold' : 'text-white/50'}>▲</span>
                              <span className={sortConfig.key === col.accessor && sortConfig.direction === 'desc' ? 'text-white opacity-100 font-bold' : 'text-white/50'}>▼</span>
                            </div>
                          )}
                        </div>

                        {/* Filter Icon Button */}
                        {columnFiltersEnabled && filterable && (
                          <div className="flex-shrink-0">
                            <button
                              ref={(el) => (filterBtnRefs.current[key] = el)}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveModalKey(activeModalKey === key ? null : key);
                              }}
                              className={`p-1 rounded-md transition-all cursor-pointer flex items-center justify-center gap-1 ${
                                hasFilter
                                  ? 'bg-white text-[#24a1dd] shadow-xs hover:bg-white/90'
                                  : 'text-white/80 hover:text-white hover:bg-white/20'
                              }`}
                              title={
                                hasFilter
                                  ? isNumericFilter
                                    ? `Filtered by ${typeof col.header === 'string' ? col.header : 'column'} (${currentValue.operator} ${currentValue.value}${currentValue.operator === 'between' ? ` to ${currentValue.value2}` : ''})`
                                    : Array.isArray(currentValue)
                                      ? `Filtered (${currentValue.length} selected)`
                                      : `Filtered by "${currentValue}"`
                                  : `Filter by ${typeof col.header === 'string' ? col.header : (col.headerTitle || col.accessor || 'column')}`
                              }
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                              </svg>
                              {hasFilter && badgeContent !== null && (
                                <span className="text-[10px] font-bold bg-[#24a1dd] text-white px-1 rounded-full leading-none min-w-[14px] text-center font-mono">
                                  {badgeContent}
                                </span>
                              )}
                            </button>

                            {/* Filter Modal Popover */}
                            <ColumnFilterModal
                              col={col}
                              columnKey={key}
                              currentValue={currentValue}
                              options={options}
                              onChange={(val) => handleColumnFilterChange(key, val)}
                              onClear={() => handleClearColumnFilter(key)}
                              isOpen={activeModalKey === key}
                              onClose={() => setActiveModalKey(null)}
                              isLastColumn={index >= columns.length - 2}
                              triggerRef={{ current: filterBtnRefs.current[key] }}
                            />
                          </div>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] bg-[var(--bg-surface)]">
              {loading && data.length === 0 ? (
                <TableSkeleton
                  rows={Math.min(defaultItemsPerPage || 5, 8)}
                  cols={columns.length}
                  density={density}
                  showBorders={showColumnBorders}
                />
              ) : paginatedData.length > 0 ? (
                paginatedData.map((row, rowIndex) => {
                  const currentKey = getRowKey(row, rowIndex);
                  const isExpanded = Boolean(renderExpandedRow && currentExpandedKeys.has(currentKey));

                  return (
                    <React.Fragment key={currentKey}>
                      <tr
                        onClick={(e) => handleRowClick(row, rowIndex, e)}
                        className={`group transition-colors duration-150 border-b border-black/10 dark:border-white/10 ${
                          rowIndex % 2 === 1 ? 'dark:bg-[var(--bg-muted)]' : 'dark:bg-[var(--bg-surface)]'
                        } ${
                          isExpanded
                            ? 'bg-sky-50/40 dark:bg-[var(--primary-soft)] border-b-0'
                            : 'hover:bg-[#24A1DD]/[0.03] dark:hover:bg-[rgba(255,255,255,0.04)]'
                        } ${(expandOnRowClick || onRowClick) ? 'cursor-pointer' : ''}`}
                      >
                        {columns.map((col, colIndex) => (
                          <td
                            key={colIndex}
                            className={`${density === 'compact' ? 'px-2.5 py-1.5 text-[11px] sm:text-xs' : 'px-3 py-2 text-xs sm:text-sm'} align-middle break-words text-slate-700 dark:text-[var(--text-primary)] leading-normal ${showColumnBorders ? 'border-r border-black/15 dark:border-white/15 last:border-r-0' : ''} ${col.cellClassName || ''} ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}
                            style={col.cellStyle || col.style || undefined}
                          >
                            {col.render ? col.render(row, rowIndex, (currentPage - 1) * itemsPerPage, isExpanded) : row[col.accessor]}
                          </td>
                        ))}
                      </tr>
                      {isExpanded && renderExpandedRow && (
                        <tr key={`${currentKey}-expanded`} className="bg-slate-50/70 dark:bg-[var(--bg-muted)] border-b border-slate-200 dark:border-[var(--border)]">
                          <td colSpan={columns.length} className="p-0">
                            {renderExpandedRow(row, rowIndex, () => handleRowExpandToggle(currentKey, row, rowIndex), containerWidth)}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={columns.length} className="px-6 py-8 text-center text-slate-500 dark:text-[var(--text-secondary)] text-sm">
                    {totalActiveFilters > 0 ? (
                      <div className="flex flex-col items-center justify-center gap-2 py-4">
                        <span className="text-slate-600 dark:text-[var(--text-primary)] font-medium">No records match the current filters.</span>
                        <button
                          type="button"
                          onClick={handleClearAllFilters}
                          className="px-3 py-1.5 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                        >
                          Clear All Filters
                        </button>
                      </div>
                    ) : (
                      emptyMessage
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination && totalEntries > 0 && (
          <div className={`px-3 sm:px-6 ${density === 'compact' ? 'py-2 sm:py-2.5 text-xs' : 'py-2.5 sm:py-3 text-xs sm:text-sm'} border-t border-slate-200 dark:border-[var(--border)] flex flex-col sm:flex-row items-center justify-between bg-slate-50 dark:bg-[var(--bg-elevated)] gap-2.5 sm:gap-3 flex-shrink-0 text-slate-600 dark:text-[var(--text-primary)]`}>
            {/* Mobile-optimized Pagination Bar: Top Row on mobile (entries per page + range info) */}
            <div className="w-full sm:w-auto flex items-center justify-between sm:justify-start gap-2 text-xs sm:text-sm text-slate-600 dark:text-[var(--text-secondary)]">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="text-[11px] sm:text-xs">Show</span>
                <select
                  value={itemsPerPage}
                  onChange={(e) => handleItemsPerPageChange(Number(e.target.value))}
                  className="border border-[var(--border-strong)] rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[var(--focus-ring)] bg-[var(--bg-surface)] text-[var(--text-primary)] text-xs font-medium cursor-pointer"
                  aria-label="Rows per page"
                >
                  {itemsPerPageOptions.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
                <span className="text-[11px] sm:text-xs">/ page</span>
              </div>

              {/* Range badge visible on mobile */}
              <span className="sm:hidden text-[11px] font-semibold text-[var(--text-secondary)] bg-[var(--bg-surface)] px-2 py-1 rounded-md border border-[var(--border)]">
                {((currentPage - 1) * itemsPerPage) + 1}–{Math.min(currentPage * itemsPerPage, totalEntries)} of {totalEntries}
              </span>
            </div>
            
            {/* Bottom Row on mobile: Desktop range info + Navigation Buttons */}
            <div className="w-full sm:w-auto flex items-center justify-between sm:justify-end gap-2 sm:gap-4">
              <span className="hidden sm:inline text-xs sm:text-sm text-slate-600 dark:text-[var(--text-secondary)]">
                Showing <strong>{((currentPage - 1) * itemsPerPage) + 1}</strong> to <strong>{Math.min(currentPage * itemsPerPage, totalEntries)}</strong> of <strong>{totalEntries}</strong> entries
              </span>

              {/* Navigation controls: touch-friendly Previous / Page Status / Next */}
              <div className="w-full sm:w-auto flex items-center justify-between sm:justify-end gap-1.5">
                <Tooltip text="First page" position="top">
                  <button
                    type="button"
                    onClick={() => handlePageChange(1)}
                    disabled={currentPage === 1}
                    className="h-8 px-2 rounded-lg border border-slate-300 dark:border-[var(--border-strong)] text-slate-600 dark:text-[var(--text-primary)] bg-[var(--bg-surface)] hover:bg-slate-100 dark:hover:bg-[var(--bg-muted)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center justify-center text-xs font-medium"
                    aria-label="First page"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                    </svg>
                  </button>
                </Tooltip>

                <Tooltip text="Previous page" position="top">
                  <button
                    type="button"
                    onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="h-8 px-2.5 sm:px-3 rounded-lg border border-slate-300 dark:border-[var(--border-strong)] text-slate-600 dark:text-[var(--text-primary)] bg-[var(--bg-surface)] hover:bg-slate-100 dark:hover:bg-[var(--bg-muted)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center justify-center gap-1 text-xs font-semibold"
                    aria-label="Previous page"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                    <span className="hidden xs:inline">Prev</span>
                  </button>
                </Tooltip>

                {/* Page indicator pill */}
                <div className="flex items-center justify-center min-w-[70px] sm:min-w-[80px] h-8 px-2.5 rounded-lg bg-[var(--primary)] text-white text-xs sm:text-sm font-bold shadow-2xs select-none">
                  <span>Page {currentPage} of {totalPages || 1}</span>
                </div>

                <Tooltip text="Next page" position="top">
                  <button
                    type="button"
                    onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage >= totalPages}
                    className="h-8 px-2.5 sm:px-3 rounded-lg border border-slate-300 dark:border-[var(--border-strong)] text-slate-600 dark:text-[var(--text-primary)] bg-[var(--bg-surface)] hover:bg-slate-100 dark:hover:bg-[var(--bg-muted)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center justify-center gap-1 text-xs font-semibold"
                    aria-label="Next page"
                  >
                    <span className="hidden xs:inline">Next</span>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </Tooltip>

                <Tooltip text="Last page" position="top">
                  <button
                    type="button"
                    onClick={() => handlePageChange(totalPages)}
                    disabled={currentPage >= totalPages}
                    className="h-8 px-2 rounded-lg border border-slate-300 dark:border-[var(--border-strong)] text-slate-600 dark:text-[var(--text-primary)] bg-[var(--bg-surface)] hover:bg-slate-100 dark:hover:bg-[var(--bg-muted)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center justify-center text-xs font-medium"
                    aria-label="Last page"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                    </svg>
                  </button>
                </Tooltip>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};



