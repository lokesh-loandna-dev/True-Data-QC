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
      const modalWidth = isNumericCol ? 280 : 256;
      let left = isLastColumn ? rect.right - modalWidth : rect.left;
      
      if (left + modalWidth > window.innerWidth - 12) {
        left = window.innerWidth - modalWidth - 12;
      }
      if (left < 12) {
        left = 12;
      }

      setCoords({
        top: rect.bottom + 6,
        left: left,
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
      className={`${isNumericCol ? 'w-72' : 'w-64'} bg-white rounded-2xl shadow-2xl border border-slate-200 text-slate-700 animate-in fade-in slide-in-from-top-1 duration-150 font-normal overflow-hidden`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Modal Header */}
      <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-[#24A1DD]/10 text-[#24A1DD] flex items-center justify-center">
            {isNumericCol ? (
              <span className="font-mono text-xs font-bold leading-none">#</span>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
            )}
          </div>
          <span className="font-semibold text-slate-800 text-xs truncate max-w-[150px]" title={`Filter ${headerText}`}>
            Filter {headerText}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-5 h-5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 flex items-center justify-center transition-colors cursor-pointer text-xs font-bold"
        >
          ✕
        </button>
      </div>

      {/* Tabs if column is numeric */}
      {isNumericCol && (
        <div className="flex border-b border-slate-200 bg-slate-100/70 p-1 gap-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setFilterMode('condition')}
            className={`flex-1 py-1 px-2 rounded-md transition-all text-center flex items-center justify-center gap-1.5 cursor-pointer ${
              filterMode === 'condition'
                ? 'bg-white text-[#24A1DD] shadow-2xs font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            <span className="font-mono text-xs font-bold">≥</span>
            <span>Condition</span>
            {isNumericActive && (
              <span className="w-1.5 h-1.5 rounded-full bg-[#24A1DD]" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('values')}
            className={`flex-1 py-1 px-2 rounded-md transition-all text-center flex items-center justify-center gap-1.5 cursor-pointer ${
              filterMode === 'values'
                ? 'bg-white text-[#24A1DD] shadow-2xs font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            <svg className="w-3 h-3 text-current" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h7" />
            </svg>
            <span>Values</span>
            {selectedValues.length > 0 && (
              <span className="bg-[#24A1DD] text-white text-[10px] px-1 rounded-full font-bold leading-none">
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
              className="w-full text-xs font-semibold bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#24A1DD]/20 focus:border-[#24A1DD] transition-all cursor-pointer"
            >
              {NUMERIC_OPERATORS.map((op) => (
                <option key={op.value} value={op.value}>
                  {op.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
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
                  className="w-full text-xs font-mono border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#24A1DD]/20 focus:border-[#24A1DD]"
                  autoFocus
                />
                <input
                  type="number"
                  value={numValue2}
                  onChange={(e) => setNumValue2(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleApplyNumeric()}
                  placeholder="Max"
                  className="w-full text-xs font-mono border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#24A1DD]/20 focus:border-[#24A1DD]"
                />
              </div>
            ) : (
              <input
                type="number"
                value={numValue}
                onChange={(e) => setNumValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleApplyNumeric()}
                placeholder="Enter number..."
                className="w-full text-xs font-mono border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#24A1DD]/20 focus:border-[#24A1DD]"
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
                className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 hover:bg-[#24A1DD]/10 hover:text-[#24A1DD] text-slate-600 transition-colors border border-slate-200 cursor-pointer"
              >
                &gt; 0
              </button>
              <button
                type="button"
                onClick={() => handleQuickPreset('=', 0)}
                className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 hover:bg-[#24A1DD]/10 hover:text-[#24A1DD] text-slate-600 transition-colors border border-slate-200 cursor-pointer"
              >
                = 0
              </button>
              <button
                type="button"
                onClick={() => handleQuickPreset('>=', 1)}
                className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 hover:bg-[#24A1DD]/10 hover:text-[#24A1DD] text-slate-600 transition-colors border border-slate-200 cursor-pointer"
              >
                ≥ 1
              </button>
              <button
                type="button"
                onClick={() => handleQuickPreset('>=', 5)}
                className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 hover:bg-[#24A1DD]/10 hover:text-[#24A1DD] text-slate-600 transition-colors border border-slate-200 cursor-pointer"
              >
                ≥ 5
              </button>
            </div>
          </div>

          {/* Footer for condition mode */}
          <div className="pt-2 border-t border-slate-200 flex items-center justify-between gap-2">
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
                className="px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
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
          <div className="p-2.5 bg-slate-50/50 border-b border-slate-100">
            <div className="relative flex items-center">
              <input
                type="text"
                value={modalSearch}
                onChange={(e) => setModalSearch(e.target.value)}
                placeholder={`Search ${headerText}...`}
                className="w-full pl-8 pr-7 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#24A1DD]/20 focus:border-[#24A1DD] bg-white text-slate-800 transition-all"
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
                  className="absolute right-2 text-slate-400 hover:text-slate-600 text-[10px] font-bold p-0.5"
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
              <label className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-100/70 rounded-lg cursor-pointer text-xs font-semibold text-slate-800 border-b border-slate-100 transition-colors">
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
                    className={`flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 rounded-lg cursor-pointer text-xs transition-colors ${
                      isChecked ? 'bg-[#24A1DD]/5 font-medium text-[#24A1DD]' : 'text-slate-600'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleToggleOption(optString)}
                      className="w-3.5 h-3.5 rounded border-slate-300 text-[#24A1DD] focus:ring-[#24A1DD]/30 cursor-pointer accent-[#24A1DD]"
                    />
                    <span className="truncate">{optString}</span>
                  </label>
                );
              })
            )}
          </div>

          {/* Footer Info */}
          <div className="px-3 py-2 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
            <span>
              {selectedValues.length > 0 ? (
                <strong className="text-[#24A1DD] font-semibold">{selectedValues.length} selected</strong>
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
                  className={`w-full pl-9 pr-8 ${density === 'compact' ? 'h-8 text-xs' : 'h-9 text-xs'} bg-white border border-slate-200 hover:border-slate-300 rounded-lg shadow-2xs focus:outline-none focus:border-[#24A1DD] focus:ring-2 focus:ring-[#24A1DD]/20 transition-all`}
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
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold p-0.5 cursor-pointer"
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
                className={`inline-flex items-center gap-1.5 ${density === 'compact' ? 'h-8 px-2 text-xs' : 'h-9 px-2.5 text-xs'} text-rose-600 hover:text-rose-700 bg-rose-50/70 hover:bg-rose-50 rounded-lg transition-colors font-medium cursor-pointer border border-rose-200/80 shadow-2xs whitespace-nowrap shrink-0`}
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
        className={`bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col min-h-0 overflow-hidden ${
          maxHeight === '100%' ? 'flex-1 h-full' : 'h-auto'
        }`}
        style={maxHeight && maxHeight !== '100%' && maxHeight !== 'none' ? { maxHeight: typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight } : {}}
      >
        {error && (
          <div className="p-4 bg-red-50 border-b border-red-100 text-red-600 text-sm flex-shrink-0">
            {error}
          </div>
        )}
        <div ref={tableContainerRef} className="overflow-auto flex-1 min-h-0 smooth-scroll custom-scrollbar scroll-smooth overscroll-contain">
          <table className="w-full text-left border-collapse min-w-[600px]">
            <thead className="sticky top-0 z-20 bg-slate-50 shadow-xs">
              <tr className="bg-slate-50 text-slate-500 text-sm border-b border-slate-200">
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

                  return (
                    <th 
                      key={index} 
                      className={`sticky top-0 ${activeModalKey === key ? 'z-[999]' : 'z-20'} ${density === 'compact' ? 'px-3 py-2 text-xs' : 'px-6 py-3.5 text-sm'} font-medium transition-colors bg-slate-50 ${showColumnBorders ? 'border-r border-slate-200 last:border-r-0' : ''} ${col.headerClassName || ''}`}
                      style={{ width: col.width || 'auto', ...(activeModalKey === key ? { zIndex: 999 } : {}) }}
                    >
                      <div className={`flex items-center justify-between gap-1.5 ${col.align === 'right' ? 'justify-end' : col.align === 'center' ? 'justify-center' : 'justify-start'}`}>
                        <div 
                          className={`flex items-center gap-1 truncate ${col.sortable ? 'cursor-pointer select-none hover:text-slate-800' : ''}`}
                          onClick={() => col.sortable && col.accessor ? handleSort(col.accessor) : null}
                        >
                          <span className="truncate">
                            {typeof col.header === 'function' ? col.header() : col.header}
                          </span>
                          {(col.headerTooltip || col.tooltip) && (
                            <Tooltip text={col.headerTooltip || col.tooltip} position="top">
                              <span
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center justify-center text-slate-400 hover:text-[#24A1DD] transition-colors cursor-help p-0.5"
                                aria-label="Information"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              </span>
                            </Tooltip>
                          )}
                          {col.sortable && (
                            <div className="flex flex-col text-[10px] leading-none opacity-50 ml-0.5 flex-shrink-0">
                              <span className={sortConfig.key === col.accessor && sortConfig.direction === 'asc' ? 'text-[#24A1DD] opacity-100 font-bold' : ''}>▲</span>
                              <span className={sortConfig.key === col.accessor && sortConfig.direction === 'desc' ? 'text-[#24A1DD] opacity-100 font-bold' : ''}>▼</span>
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
                                  ? 'bg-[#24A1DD] text-white shadow-xs hover:bg-[#1e88bb]'
                                  : 'text-slate-400 hover:text-slate-600 hover:bg-slate-200/60'
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
                                <span className="text-[10px] font-bold bg-white text-[#24A1DD] px-1 rounded-full leading-none min-w-[14px] text-center font-mono">
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
            <tbody className="divide-y divide-slate-100 bg-white">
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
                        className={`group transition-colors duration-150 ${
                          isExpanded ? 'bg-sky-50/40 border-b-0' : 'hover:bg-[#24A1DD]/[0.03]'
                        } ${(expandOnRowClick || onRowClick) ? 'cursor-pointer' : ''}`}
                      >
                        {columns.map((col, colIndex) => (
                          <td
                            key={colIndex}
                            className={`${density === 'compact' ? 'px-3 py-2 text-xs' : 'px-6 py-3.5 text-sm'} align-middle break-words ${showColumnBorders ? 'border-r border-slate-200/60 last:border-r-0' : ''} ${col.cellClassName || 'text-slate-600'} ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}
                          >
                            {col.render ? col.render(row, rowIndex, (currentPage - 1) * itemsPerPage, isExpanded) : row[col.accessor]}
                          </td>
                        ))}
                      </tr>
                      {isExpanded && renderExpandedRow && (
                        <tr key={`${currentKey}-expanded`} className="bg-slate-50/70 border-b border-slate-200">
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
                  <td colSpan={columns.length} className="px-6 py-8 text-center text-slate-500 text-sm">
                    {totalActiveFilters > 0 ? (
                      <div className="flex flex-col items-center justify-center gap-2 py-4">
                        <span className="text-slate-600 font-medium">No records match the current filters.</span>
                        <button
                          type="button"
                          onClick={handleClearAllFilters}
                          className="px-3 py-1.5 bg-[#24A1DD] hover:bg-[#1e88bb] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
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
          <div className={`px-4 sm:px-6 ${density === 'compact' ? 'py-2 text-xs' : 'py-3 text-sm'} border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between bg-slate-50 gap-3 flex-shrink-0`}>
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <span>Show</span>
              <select
                value={itemsPerPage}
                onChange={(e) => handleItemsPerPageChange(Number(e.target.value))}
                className="border border-slate-300 rounded px-2 py-1 focus:outline-none focus:border-[#24A1DD] bg-white text-sm cursor-pointer"
              >
                {itemsPerPageOptions.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
              <span>entries</span>
            </div>
            
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <span className="text-sm text-slate-600">
                Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, totalEntries)} of {totalEntries} entries
              </span>
              <div className="flex items-center gap-1.5">
                <Tooltip text="Previous page" position="top">
                  <button
                    type="button"
                    onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="p-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center justify-center"
                    aria-label="Previous page"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                </Tooltip>
                <div className="flex items-center justify-center min-w-[32px] h-8 px-2 rounded-lg bg-[#24A1DD] text-white text-xs sm:text-sm font-semibold shadow-xs">
                  {currentPage}
                </div>
                <Tooltip text="Next page" position="top">
                  <button
                    type="button"
                    onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage >= totalPages}
                    className="p-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center justify-center"
                    aria-label="Next page"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
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



