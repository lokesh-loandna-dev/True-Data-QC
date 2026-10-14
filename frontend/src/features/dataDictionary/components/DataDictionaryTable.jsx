import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { dataDictionaryService } from '../../../services/dataDictionaryService';
import { DataTable } from '../../../components/DataTable';
import Tooltip from '../../../components/Tooltip';
import { notify } from '../../../utils/toast';

const DataDictionaryTable = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [data, setData] = useState([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [columnsList, setColumnsList] = useState([]);
  const [serverFilterOptions, setServerFilterOptions] = useState({});
  const [loading, setLoading] = useState(false);
  const [columnsLoading, setColumnsLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showManageColumnsModal, setShowManageColumnsModal] = useState(false);
  const [columnSearch, setColumnSearch] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('id');
  const [sortOrder, setSortOrder] = useState('asc');
  const [filters, setFilters] = useState({});

  const DEFAULT_COLUMNS = useMemo(() => [
    {
      header: 'ID',
      accessor: 'id',
      sortable: true,
      cellClassName: 'whitespace-nowrap',
      render: (row) => <span className="text-slate-500 font-mono text-xs">#{row.id}</span>,
    },
    {
      header: 'Field Name',
      accessor: 'field_name',
      sortable: true,
      cellClassName: 'font-medium text-slate-900 break-words whitespace-normal max-w-xs min-w-[150px]',
      render: (row) => (
        <div className="whitespace-normal break-words max-w-xs font-medium text-slate-900 leading-normal">
          {row.field_name || '-'}
        </div>
      ),
    },
    {
      header: 'Field Label',
      accessor: 'field_label',
      sortable: true,
      cellClassName: 'text-slate-700 break-words whitespace-normal max-w-xs min-w-[150px]',
      render: (row) => (
        <div className="whitespace-normal break-words max-w-xs text-slate-700 leading-normal">
          {row.field_label || '-'}
        </div>
      ),
    },
    {
      header: 'Data Type',
      accessor: 'data_type',
      sortable: true,
      cellClassName: 'whitespace-nowrap',
      render: (row) => (
        <span className="text-xs font-semibold text-slate-700 inline-block">
          {row.data_type}
        </span>
      ),
    },
    {
      header: 'Field Enumerations',
      accessor: 'field_enumerations',
      sortable: true,
      cellClassName: 'text-slate-600 break-words whitespace-normal min-w-[200px]',
      render: (row) => (
        <div className="whitespace-normal break-words max-w-lg text-slate-600 leading-normal">
          {row.field_enumerations || '-'}
        </div>
      ),
    },
  ], []);

  const DEFAULT_KEY_SET = useMemo(
    () => ['id', 'field_name', 'field_label', 'data_type', 'field_enumerations'],
    []
  );

  const [selectedColumnKeys, setSelectedColumnKeys] = useState(() => {
    const saved = localStorage.getItem('dd_selected_columns');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const filtered = parsed.filter((k) => k !== 'created_at');
          if (filtered.length > 0) return filtered;
        }
      } catch (e) {
        // Fall back to default columns
      }
    }
    return ['id', 'field_name', 'field_label', 'data_type', 'field_enumerations'];
  });

  const [stagedColumnKeys, setStagedColumnKeys] = useState([]);

  useEffect(() => {
    if (selectedColumnKeys && selectedColumnKeys.length > 0) {
      localStorage.setItem('dd_selected_columns', JSON.stringify(selectedColumnKeys));
    }
  }, [selectedColumnKeys]);

  const fileInputRef = useRef(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await dataDictionaryService.getDataDictionary({
        page,
        limit,
        search,
        sortBy,
        sortOrder,
        filters,
      });
      setData(response.data || []);
      setTotalRecords(response.total || 0);
      setColumnsList(response.columns || []);
      setServerFilterOptions(response.filter_options || {});

      // Synchronize column selection from DB preferences
      if (response.user_selected_columns && Array.isArray(response.user_selected_columns) && response.user_selected_columns.length > 0) {
        setSelectedColumnKeys(response.user_selected_columns);
      } else if (response.columns && response.columns.length > 0) {
        // Default to all columns if no preference configured
        const allCols = response.columns.filter((c) => c !== 'created_at');
        setSelectedColumnKeys(allCols);
      }
    } catch (err) {
      const errMsg = err.message || 'Failed to fetch data dictionary records';
      setError(errMsg);
    } finally {
      setLoading(false);
      setColumnsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [page, limit, search, sortBy, sortOrder, filters]);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      setColumnsLoading(true);
      setError('');
      setSuccess('');
      const res = await dataDictionaryService.uploadFile(file);
      const msg = res.message || 'Upload successful';
      setSuccess(msg);
      notify.success(msg);

      // Immediately activate all newly uploaded columns
      if (res.user_selected_columns && res.user_selected_columns.length > 0) {
        setSelectedColumnKeys(res.user_selected_columns);
      }
      if (res.columns && res.columns.length > 0) {
        setColumnsList(res.columns);
      }

      fetchData();
    } catch (err) {
      const errMsg = err.message || 'Failed to upload file';
      setError(errMsg);
      notify.error(errMsg);
      setColumnsLoading(false);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDeleteAll = async () => {
    try {
      setDeleting(true);
      setError('');
      setSuccess('');
      const res = await dataDictionaryService.deleteAllDataDictionary();
      const msg = res.message || 'All records deleted successfully';
      setSuccess(msg);
      notify.success(msg);
      setShowConfirmModal(false);
      setData([]);
      setTotalRecords(0);
      setColumnsList([]);
      setSelectedColumnKeys(DEFAULT_KEY_SET);
      setColumnsLoading(false);
      fetchData();
    } catch (err) {
      const errMsg = err.message || 'Failed to delete data dictionary records';
      setError(errMsg);
      notify.error(errMsg);
      setShowConfirmModal(false);
    } finally {
      setDeleting(false);
    }
  };

  // Build full list of available columns including dynamic keys from data if any
  const allAvailableColumns = useMemo(() => {
    const knownKeys = new Set([...DEFAULT_COLUMNS.map((c) => c.accessor), 'created_at']);
    const dynamicCols = [];

    const keysToUse = new Set();
    if (columnsList && columnsList.length > 0) {
      columnsList.forEach(k => keysToUse.add(k));
    } else if (data && data.length > 0) {
      data.forEach((row) => {
        if (row && typeof row === 'object') {
          Object.keys(row).forEach((k) => keysToUse.add(k));
        }
      });
    }

    keysToUse.forEach((key) => {
      if (!knownKeys.has(key)) {
        dynamicCols.push({
          header: key
            .replace(/_/g, ' ')
            .replace(/\b\w/g, (l) => l.toUpperCase()),
          accessor: key,
          sortable: true,
          cellClassName: 'text-slate-600 break-words whitespace-normal min-w-[140px]',
          render: (row) => (
            <div className="whitespace-normal break-words text-slate-600 leading-normal">
              {row[key] !== null && row[key] !== undefined && row[key] !== '' ? String(row[key]) : '-'}
            </div>
          ),
        });
      }
    });

    return [...DEFAULT_COLUMNS, ...dynamicCols];
  }, [DEFAULT_COLUMNS, data, columnsList]);

  // Active columns visible in table
  const visibleColumns = useMemo(() => {
    const active = allAvailableColumns.filter((col) =>
      selectedColumnKeys.includes(col.accessor)
    );
    // If none selected, fallback to default columns
    return active.length > 0 ? active : DEFAULT_COLUMNS;
  }, [allAvailableColumns, selectedColumnKeys, DEFAULT_COLUMNS]);

  // Handle ESC key press to close sidebar
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && showManageColumnsModal) {
        setShowManageColumnsModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showManageColumnsModal]);

  const handleOpenManageColumns = () => {
    setStagedColumnKeys([...selectedColumnKeys]);
    setColumnSearch('');
    setShowManageColumnsModal(true);
  };

  const toggleStagedColumnKey = (key) => {
    setStagedColumnKeys((prev) => {
      if (prev.includes(key)) {
        if (prev.length <= 1) {
          notify.warning('At least one column must be visible');
          return prev;
        }
        return prev.filter((k) => k !== key);
      } else {
        return [...prev, key];
      }
    });
  };

  const selectAllStagedColumns = () => {
    const allKeys = allAvailableColumns.map((c) => c.accessor).filter((k) => k !== 'created_at');
    setStagedColumnKeys(allKeys);
  };

  const resetStagedColumnsToDefault = () => {
    const availableKeySet = new Set(allAvailableColumns.map((c) => c.accessor));
    const validDefaultKeys = DEFAULT_KEY_SET.filter((k) => availableKeySet.has(k));
    setStagedColumnKeys(validDefaultKeys.length > 0 ? validDefaultKeys : DEFAULT_KEY_SET);
  };

  const handleApplyColumns = async () => {
    if (stagedColumnKeys.length === 0) {
      notify.warning('At least one column must be visible');
      return;
    }
    setSelectedColumnKeys(stagedColumnKeys);
    setShowManageColumnsModal(false);

    // Persist to DB for this user account and save locally
    try {
      localStorage.setItem('dd_selected_columns', JSON.stringify(stagedColumnKeys));
      await dataDictionaryService.saveColumnPreferences(stagedColumnKeys);
      notify.success('Column preferences saved successfully');
    } catch (err) {
      console.error('Failed to save column preferences to DB:', err);
    }
  };


  const filteredModalColumns = useMemo(() => {
    if (!columnSearch.trim()) return allAvailableColumns;
    const query = columnSearch.toLowerCase().trim();
    return allAvailableColumns.filter(
      (col) =>
        col.header.toLowerCase().includes(query) ||
        col.accessor.toLowerCase().includes(query)
    );
  }, [allAvailableColumns, columnSearch]);

  const customHeader = (
    <div className="flex items-center gap-2 sm:gap-3">
      <Tooltip text="Manage Columns" position="bottom">
        <button
          type="button"
          onClick={handleOpenManageColumns}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-sm font-medium rounded-xl transition-all shadow-xs cursor-pointer"
          aria-label="Manage Columns"
        >
          <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2m0 10V7m6 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
          </svg>
          <span className="px-1.5 py-0.5 text-xs font-bold bg-[#24A1DD]/10 text-[#24A1DD] rounded-full inline-flex items-center justify-center min-w-[32px] h-5">
            {columnsLoading ? (
              <svg
                className="animate-spin h-3 w-3 text-[#24A1DD]"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            ) : (
              `${selectedColumnKeys.length}/${allAvailableColumns.length}`
            )}
          </span>
        </button>
      </Tooltip>
      {isAdmin && (
        <>
          <input
            type="file"
            accept=".xlsx, .xls"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileChange}
          />
          <Tooltip text="Upload Excel" position="bottom">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || deleting}
              className="inline-flex items-center justify-center p-2 sm:p-2.5 border border-slate-200 bg-white hover:bg-sky-50 hover:border-[#24A1DD]/30 text-[#24A1DD] hover:text-[#1e88bb] font-semibold rounded-xl text-xs sm:text-sm transition-all shadow-2xs hover:shadow-xs disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer select-none"
              aria-label="Upload Excel"
            >
              {uploading ? (
                <svg className="animate-spin h-4 w-4 text-[#24A1DD]" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4}></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <svg className="w-4 h-4 sm:w-4.5 sm:h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              )}
            </button>
          </Tooltip>
          <Tooltip text="Delete All" position="bottom">
            <button
              type="button"
              onClick={() => setShowConfirmModal(true)}
              disabled={loading || uploading || deleting || data.length === 0}
              className="inline-flex items-center justify-center p-2 sm:p-2.5 border border-slate-200 bg-white hover:bg-rose-50 hover:border-rose-200 text-rose-600 hover:text-rose-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold rounded-xl text-xs sm:text-sm transition-all shadow-2xs hover:shadow-xs cursor-pointer select-none"
              aria-label="Delete All"
            >
              <svg className="w-4 h-4 sm:w-4.5 sm:h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </Tooltip>
        </>
      )}
    </div>
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 h-full overflow-hidden">
      <DataTable
        data={data}
        columns={visibleColumns}
        loading={loading}
        error={error}
        searchable={true}
        pagination={true}
        itemsPerPageOptions={[10, 25, 50, 100, 500, 1000]}
        defaultItemsPerPage={limit}
        emptyMessage="No Results Found"
        customHeader={customHeader}
        className="flex flex-col min-h-0"
        serverSide={true}
        totalCount={totalRecords}
        serverFilterOptions={serverFilterOptions}
        onPageChange={(newPage) => setPage(newPage)}
        onItemsPerPageChange={(newLimit) => {
          setLimit(newLimit);
          setPage(1);
        }}
        onSearchChange={(newSearch) => {
          setSearch(newSearch);
          setPage(1);
        }}
        onSortChange={({ key, direction }) => {
          setSortBy(key);
          setSortOrder(direction);
          setPage(1);
        }}
        onFilterChange={(newFilters) => {
          setFilters(newFilters);
          setPage(1);
        }}
      />

      {/* Manage Columns Sidebar (Right Drawer) */}
      <div
        className={`fixed inset-0 z-50 transition-opacity duration-300 ${
          showManageColumnsModal ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Overlay Backdrop */}
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity duration-300"
          onClick={() => setShowManageColumnsModal(false)}
        />

        {/* Slide-over Right Panel */}
        <div
          className={`fixed top-0 right-0 bottom-0 z-50 w-full max-w-sm sm:max-w-md bg-white shadow-2xl transition-transform duration-300 ease-in-out transform flex flex-col ${
            showManageColumnsModal ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          {/* Sidebar Header */}
          <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#24A1DD]/10 text-[#24A1DD] flex items-center justify-center shadow-xs">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 01-2-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2m0 10V7m6 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Manage Columns</h3>
                <p className="text-xs text-slate-500">Configure table column visibility</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowManageColumnsModal(false)}
              className="text-slate-400 hover:text-slate-600 w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-200/60 transition-colors cursor-pointer"
              title="Close sidebar"
            >
              ✕
            </button>
          </div>

          {/* Sidebar Controls (Search & Quick Actions) */}
          <div className="p-5 pb-3 border-b border-slate-100 space-y-3 bg-white">
            <div className="relative">
              <input
                type="text"
                placeholder="Search columns by name or key..."
                value={columnSearch}
                onChange={(e) => setColumnSearch(e.target.value)}
                className="w-full pl-9 pr-8 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#24A1DD] focus:border-transparent transition-all bg-slate-50/50 focus:bg-white text-slate-800"
              />
              <svg
                className="w-4 h-4 text-slate-400 absolute left-3 top-2.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {columnSearch && (
                <button
                  type="button"
                  onClick={() => setColumnSearch('')}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full hover:bg-slate-100"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={selectAllStagedColumns}
                  className="text-[#24A1DD] hover:underline font-semibold cursor-pointer"
                >
                  Select All
                </button>
                <span>•</span>
                <button
                  type="button"
                  onClick={resetStagedColumnsToDefault}
                  className="text-slate-600 hover:underline font-medium cursor-pointer"
                >
                  Reset Default
                </button>
              </div>
              <span className="font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px] inline-flex items-center justify-center min-w-[42px] h-5">
                {columnsLoading ? (
                  <svg
                    className="animate-spin h-3 w-3 text-slate-500"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                ) : (
                  `${stagedColumnKeys.length} of ${allAvailableColumns.length}`
                )}
              </span>
            </div>
          </div>

          {/* Sidebar Scrollable Column Items */}
          <div className="flex-1 overflow-y-auto p-5 space-y-2 bg-slate-50/30">
            {filteredModalColumns.map((col) => {
              const isSelected = stagedColumnKeys.includes(col.accessor);
              return (
                <label
                  key={col.accessor}
                  className={`flex items-center justify-between px-3.5 py-3 rounded-xl cursor-pointer transition-all border ${
                    isSelected
                      ? 'bg-white border-[#24A1DD]/40 text-slate-900 shadow-xs ring-1 ring-[#24A1DD]/20'
                      : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 pr-2">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleStagedColumnKey(col.accessor)}
                      className="w-4 h-4 rounded border-slate-300 text-[#24A1DD] focus:ring-[#24A1DD]/30 cursor-pointer accent-[#24A1DD]"
                    />
                    <span className="text-xs font-semibold text-slate-800 truncate">{col.header}</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
                    {col.accessor}
                  </span>
                </label>
              );
            })}
            {filteredModalColumns.length === 0 && (
              <div className="py-12 text-center text-xs text-slate-400 space-y-2">
                <svg className="w-8 h-8 mx-auto text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <p>No columns match your search</p>
              </div>
            )}
          </div>

          {/* Sidebar Footer */}
          <div className="flex items-center justify-between p-4 border-t border-slate-100 bg-white">
            <button
              type="button"
              onClick={() => setShowManageColumnsModal(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApplyColumns}
              className="px-5 py-2 text-xs font-semibold text-white bg-[#24A1DD] hover:bg-[#1e88bb] rounded-xl transition-all shadow-sm shadow-[#24A1DD]/20 cursor-pointer flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Apply Changes
            </button>
          </div>
        </div>
      </div>

      {/* Delete All Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-100 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Delete All Data Dictionary Records</h3>
                <p className="text-xs text-slate-500 mt-0.5">This action cannot be undone.</p>
              </div>
            </div>
            <p className="text-sm text-slate-600">
              Are you sure you want to delete all data dictionary entries? All saved rules and field mappings will be permanently removed.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAll}
                disabled={deleting}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-all shadow-sm shadow-rose-600/20 disabled:opacity-70 cursor-pointer"
              >
                {deleting ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Deleting...
                  </>
                ) : (
                  'Confirm Delete All'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataDictionaryTable;
