import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { encodePackageId } from '../utils/routeCipher';
import { useAuth } from '../hooks/useAuth';
import Header from '../layout/Header';
import { loanService } from '../services/loanService';
import { DataTable } from '../components/DataTable';
import Tooltip from '../components/Tooltip';
import { notify } from '../utils/toast';
import { exportPackagesToExcel, exportToExcel } from '../utils/excelExport';


/** Safely parse dates, ensuring UTC timestamps without a timezone suffix are treated as UTC */
const parseUtcDate = (dateVal) => {
  if (!dateVal) return null;
  if (typeof dateVal === 'string' && !dateVal.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(dateVal)) {
    return new Date(dateVal + 'Z');
  }
  return new Date(dateVal);
};

/**
 * Compact, unified single-strip detailed row view showing package metrics and actions.
 * Automatically fits 100% of the visible container width ("first view size").
 */
const PackageDetailedRowView = ({
  pkg,
  onCollapse,
  containerWidth
}) => {
  const parsedDate = parseUtcDate(pkg.uploaded_at);
  const formattedDate = parsedDate && !isNaN(parsedDate.getTime())
    ? parsedDate.toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
    : '-';

  return (
    <div className="bg-slate-50/95 border-y border-slate-200/90 transition-all overflow-hidden">
      {/* Sticky container stays anchored left and matches exact visible table width */}
      <div
        className="sticky left-0 px-3.5 py-2 sm:px-4 sm:py-2.5 space-y-2 box-border"
        style={containerWidth ? { width: `${containerWidth}px` } : { width: '100%' }}
      >
        {/* Top Bar: Identity & Close */}
        <div className="flex items-center justify-between gap-3 pb-1.5 border-b border-slate-200/80">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <span className="text-xs font-bold text-slate-900 truncate max-w-sm sm:max-w-md" title={pkg.filename}>
              {pkg.filename}
            </span>
            {pkg.loan_id && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-200/70 text-slate-700 font-mono text-[11px] font-semibold">
                Loan ID: {pkg.loan_id}
              </span>
            )}
            <span className="text-[11px] text-slate-500 hidden sm:inline">
              Uploaded by <strong className="text-slate-700 font-medium">{pkg.uploaded_by || 'System'}</strong>
              {pkg.uploaded_email && ` (${pkg.uploaded_email})`} • {formattedDate}
            </span>
          </div>

          <div className="flex items-center flex-shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCollapse();
              }}
              className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-md transition-colors cursor-pointer"
              title="Close details"
              aria-label="Close details"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Unified Single Strip: Validation & Pending (5 items) + Divider + Action Breakdown (7 items) */}
        <div className="bg-white rounded-lg border border-slate-200/90 shadow-2xs p-1.5 flex flex-col md:flex-row items-stretch gap-1.5">
          {/* Validation & Pending Group (5 items - 42%) */}
          <div className="w-full md:w-[42%] grid grid-cols-5 gap-1.5 text-center">
            <div className="bg-slate-50 py-1 px-1 rounded border border-slate-100 flex flex-col justify-between min-h-[46px]">
              <span className="block text-[10px] text-slate-600 font-medium leading-tight">Total Fields</span>
              <span className="font-mono text-xs font-bold text-slate-800">{pkg.total_fields ?? 0}</span>
            </div>
            <div className="bg-emerald-50/50 py-1 px-1 rounded border border-emerald-100/70 flex flex-col justify-between min-h-[46px]">
              <span className="block text-[10px] text-emerald-700 font-medium leading-tight">Final Valid</span>
              <span className="font-mono text-xs font-bold text-emerald-600">{pkg.final_valid ?? 0}</span>
            </div>
            <div className="bg-rose-50/50 py-1 px-1 rounded border border-rose-100/70 flex flex-col justify-between min-h-[46px]">
              <span className="block text-[10px] text-rose-700 font-medium leading-tight">Final Invalid</span>
              <span className="font-mono text-xs font-bold text-rose-600">{pkg.final_invalid ?? 0}</span>
            </div>
            <div className="bg-amber-50/50 py-1 px-1 rounded border border-amber-100/70 flex flex-col justify-between min-h-[46px]">
              <span className="block text-[10px] text-amber-700 font-medium leading-tight">Review Required</span>
              <span className="font-mono text-xs font-bold text-amber-600">{pkg.review_required ?? 0}</span>
            </div>
            <div className="bg-amber-50 py-1 px-0.5 rounded border border-amber-200/80 flex flex-col justify-between min-h-[46px]">
              <div className="flex items-center justify-center gap-0.5">
                <span className="block text-[10px] text-amber-800 font-semibold leading-tight">Pending Action</span>
                <Tooltip text="Calculates only Invalid and Review Required" position="top">
                  <span className="text-amber-600/70 hover:text-amber-800 cursor-help inline-flex items-center">
                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </span>
                </Tooltip>
              </div>
              <span className={`font-mono text-xs font-bold ${(pkg.yet_to_take_action ?? 0) > 0 ? 'text-amber-700' : 'text-slate-400'}`}>
                {pkg.yet_to_take_action ?? 0}
              </span>
            </div>
          </div>

          {/* Divider */}
          <div className="hidden md:block w-px bg-slate-200 self-stretch my-0.5"></div>

          {/* Action Status Breakdown Group (7 items - 58%) */}
          <div className="w-full md:w-[58%] grid grid-cols-4 sm:grid-cols-7 gap-1.5 text-center">
            <div className="bg-slate-50/70 py-1 px-0.5 rounded border border-slate-100 flex flex-col justify-between min-h-[46px]">
              <span className="block text-[10px] text-slate-600 font-medium leading-tight">Corrected</span>
              <span className={`font-mono text-xs font-bold ${(pkg.action_corrected ?? 0) > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                {pkg.action_corrected ?? 0}
              </span>
            </div>
            <div className="bg-slate-50/70 py-1 px-0.5 rounded border border-slate-100 flex flex-col justify-between min-h-[46px]">
              <span className="block text-[10px] text-slate-600 font-medium leading-tight">Incorrect Status</span>
              <span className={`font-mono text-xs font-bold ${(pkg.action_incorrect_status ?? 0) > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                {pkg.action_incorrect_status ?? 0}
              </span>
            </div>
            <div className="bg-slate-50/70 py-1 px-0.5 rounded border border-slate-100 flex flex-col justify-between min-h-[46px]">
              <span className="block text-[10px] text-slate-600 font-medium leading-tight">Not Applicable</span>
              <span className={`font-mono text-xs font-bold ${(pkg.action_not_applicable ?? 0) > 0 ? 'text-slate-700' : 'text-slate-400'}`}>
                {pkg.action_not_applicable ?? 0}
              </span>
            </div>
            <div className="bg-slate-50/70 py-1 px-0.5 rounded border border-slate-100 flex flex-col justify-between min-h-[46px]">
              <span className="block text-[10px] text-slate-600 font-medium leading-tight">Need Review</span>
              <span className={`font-mono text-xs font-bold ${(pkg.action_need_review ?? 0) > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                {pkg.action_need_review ?? 0}
              </span>
            </div>
            <div className="bg-slate-50/70 py-1 px-0.5 rounded border border-slate-100 flex flex-col justify-between min-h-[46px]">
              <span className="block text-[10px] text-slate-600 font-medium leading-tight">Review Completed</span>
              <span className={`font-mono text-xs font-bold ${(pkg.action_review_completed ?? 0) > 0 ? 'text-teal-600' : 'text-slate-400'}`}>
                {pkg.action_review_completed ?? 0}
              </span>
            </div>
            <div className="bg-slate-50/70 py-1 px-0.5 rounded border border-slate-100 flex flex-col justify-between min-h-[46px]">
              <span className="block text-[10px] text-slate-600 font-medium leading-tight">Out of Scope</span>
              <span className={`font-mono text-xs font-bold ${(pkg.action_out_of_scope ?? 0) > 0 ? 'text-purple-600' : 'text-slate-400'}`}>
                {pkg.action_out_of_scope ?? 0}
              </span>
            </div>
            <div className="bg-slate-50/70 py-1 px-0.5 rounded border border-slate-100 flex flex-col justify-between min-h-[46px]">
              <span className="block text-[10px] text-slate-600 font-medium leading-tight">Others</span>
              <span className={`font-mono text-xs font-bold ${(pkg.action_others ?? 0) > 0 ? 'text-blue-600' : 'text-slate-400'}`}>
                {pkg.action_others ?? 0}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const DashboardPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rowExportLoadingId, setRowExportLoadingId] = useState(null);

  // Package Selection State for Bulk Download
  const [selectedPackageIds, setSelectedPackageIds] = useState(new Set());
  const [bulkDownloadLoading, setBulkDownloadLoading] = useState(false);
  const [bulkDownloadProgress, setBulkDownloadProgress] = useState(0);
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [deleteAllLoading, setDeleteAllLoading] = useState(false);
  const [showDeleteSelectedModal, setShowDeleteSelectedModal] = useState(false);
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);

  // Expandable Row State
  const [expandedRowKeys, setExpandedRowKeys] = useState([]);

  // Date-based filter state
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedPreset, setSelectedPreset] = useState('');

  const isSuperAdmin = useMemo(() => {
    const r = (user?.role || '').trim().toLowerCase();
    return r === 'super admin' || r === 'super_admin' || r === 'admin';
  }, [user]);

  const isAnyAdmin = useMemo(() => {
    const r = (user?.role || '').trim().toLowerCase();
    return isSuperAdmin || r.includes('admin');
  }, [user, isSuperAdmin]);

  const isAdmin = isAnyAdmin;

  const handleToggleExpand = useCallback((key) => {
    setExpandedRowKeys((prev) => (prev.includes(key) ? [] : [key]));
  }, []);

  const fetchPackages = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await loanService.getPackages();
      if (response.status === 'success') {
        setPackages(response.packages || []);
      } else {
        setError('Failed to fetch saved packages.');
      }
    } catch (err) {
      setError(err.message || 'An error occurred while fetching packages.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    loanService.getPackages()
      .then(response => {
        if (active) {
          if (response.status === 'success') {
            setPackages(response.packages || []);
          } else {
            setError('Failed to fetch saved packages.');
          }
        }
      })
      .catch(err => {
        if (active) {
          setError(err.message || 'An error occurred while fetching packages.');
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const handleDeletePackage = useCallback(async (packageId, filename) => {
    if (!window.confirm(`Are you sure you want to delete "${filename}"? This action cannot be undone.`)) {
      return;
    }
    try {
      setLoading(true);
      await loanService.deletePackage(packageId);
      notify.success(`Package "${filename}" deleted successfully`);
      await fetchPackages();
    } catch (err) {
      const errMsg = err.message || 'Failed to delete the package.';
      setError(errMsg);
      notify.error(errMsg);
    } finally {
      setLoading(false);
    }
  }, [fetchPackages]);

  const handleConfirmDeleteAll = useCallback(async () => {
    try {
      setDeleteAllLoading(true);
      await loanService.clearAllPackages();
      notify.success('All saved loan packages cleared successfully');
      setSelectedPackageIds(new Set());
      setShowDeleteAllModal(false);
      await fetchPackages();
    } catch (err) {
      const errMsg = err.message || 'Failed to delete all packages.';
      setError(errMsg);
      notify.error(errMsg);
    } finally {
      setDeleteAllLoading(false);
    }
  }, [fetchPackages]);

  const handleConfirmDeleteSelected = useCallback(async () => {
    const ids = Array.from(selectedPackageIds);
    if (ids.length === 0) return;
    try {
      setBulkDeleteLoading(true);
      if (loanService.bulkDeletePackages) {
        await loanService.bulkDeletePackages(ids);
      } else {
        await Promise.all(ids.map((id) => loanService.deletePackage(id)));
      }
      notify.success(`${ids.length} package(s) deleted successfully`);
      setSelectedPackageIds(new Set());
      setShowDeleteSelectedModal(false);
      await fetchPackages();
    } catch (err) {
      const errMsg = err.message || 'Failed to delete selected packages.';
      setError(errMsg);
      notify.error(errMsg);
    } finally {
      setBulkDeleteLoading(false);
    }
  }, [selectedPackageIds, fetchPackages]);

  const handleDeleteAll = useCallback(() => {
    setShowDeleteAllModal(true);
  }, []);

  // Quick export of individual package audit details from row
  const handleExportRowPackage = useCallback(async (pkg) => {
    setRowExportLoadingId(pkg.id);
    try {
      const response = await loanService.getPackageDetails(pkg.id);
      if (response.status === 'success' && response.records) {
        exportToExcel({
          filename: response.package?.filename || pkg.filename || 'Package_Audit',
          records: response.records,
          summary: response.summary || {},
          reportSuffix: '_Audit_Report',
          loanId: response.loan_id || response.package?.loan_id || pkg.loan_id,
          username: response.package?.uploaded_by || pkg.uploaded_by,
          email: response.package?.uploaded_email || pkg.uploaded_email
        });
        notify.success(`Exported "${pkg.filename}" audit report successfully!`);
      } else {
        notify.error('Failed to load package details for export.');
      }
    } catch (err) {
      console.error('Failed to export package audit report:', err);
      notify.error(err.message || 'Failed to export package audit report.');
    } finally {
      setRowExportLoadingId(null);
    }
  }, []);

  // Filter packages based on fromDate and toDate
  const dateFilteredPackages = useMemo(() => {
    if (!fromDate && !toDate) return packages;

    let startTimestamp = null;
    if (fromDate) {
      const [y, m, d] = fromDate.split('-').map(Number);
      startTimestamp = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
    }

    let endTimestamp = null;
    if (toDate) {
      const [y, m, d] = toDate.split('-').map(Number);
      endTimestamp = new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
    }

    return packages.filter((pkg) => {
      if (!pkg.uploaded_at) return false;
      const parsed = parseUtcDate(pkg.uploaded_at);
      const pkgTime = parsed ? parsed.getTime() : NaN;
      if (isNaN(pkgTime)) return false;

      if (startTimestamp !== null && pkgTime < startTimestamp) return false;
      if (endTimestamp !== null && pkgTime > endTimestamp) return false;
      return true;
    });
  }, [packages, fromDate, toDate]);

  const handlePresetSelect = useCallback((preset) => {
    if (!preset || preset === 'clear' || preset === 'all') {
      setSelectedPreset('');
      setFromDate('');
      setToDate('');
      return;
    }
    setSelectedPreset(preset);

    const now = new Date();
    const formatYMD = (d) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const todayStr = formatYMD(now);

    if (preset === 'today') {
      setFromDate(todayStr);
      setToDate(todayStr);
    } else if (preset === 'yesterday') {
      const yest = new Date(now);
      yest.setDate(yest.getDate() - 1);
      const yestStr = formatYMD(yest);
      setFromDate(yestStr);
      setToDate(yestStr);
    } else if (preset === 'last7') {
      const past = new Date(now);
      past.setDate(past.getDate() - 6);
      setFromDate(formatYMD(past));
      setToDate(todayStr);
    } else if (preset === 'last30') {
      const past = new Date(now);
      past.setDate(past.getDate() - 29);
      setFromDate(formatYMD(past));
      setToDate(todayStr);
    } else if (preset === 'thisMonth') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      setFromDate(formatYMD(startOfMonth));
      setToDate(todayStr);
    }
  }, []);

  const handleFromDateChange = useCallback((e) => {
    const val = e.target.value;
    setFromDate(val);
    if (!val && !toDate) {
      setSelectedPreset('');
    } else {
      setSelectedPreset('custom');
    }
    if (toDate && val && val > toDate) {
      setToDate(val);
    }
  }, [toDate]);

  const handleToDateChange = useCallback((e) => {
    const val = e.target.value;
    setToDate(val);
    if (!val && !fromDate) {
      setSelectedPreset('');
    } else {
      setSelectedPreset('custom');
    }
    if (fromDate && val && val < fromDate) {
      setFromDate(val);
    }
  }, [fromDate]);

  const handleClearDateFilter = useCallback(() => {
    setFromDate('');
    setToDate('');
    setSelectedPreset('');
  }, []);

  // Export full or filtered dashboard packages list to Excel
  const handleExportPackages = useCallback((dataToExport) => {
    try {
      const records = dataToExport !== undefined ? dataToExport : (fromDate || toDate ? dateFilteredPackages : packages);
      if (!records || records.length === 0) {
        notify.warning('No package data to export for the selected filter');
        return;
      }
      const dateStr = new Date().toISOString().split('T')[0];
      const filenameSuffix = (fromDate || toDate)
        ? `_${fromDate || 'start'}_to_${toDate || 'end'}`
        : '';
      exportPackagesToExcel({
        packages: records,
        filename: `Loan_Packages_${dateStr}${filenameSuffix}`
      });
      notify.success(`Exported ${records.length} package${records.length === 1 ? '' : 's'} to Excel successfully!`);
    } catch (err) {
      console.error('Failed to export loan packages to Excel:', err);
      notify.error('Failed to export packages to Excel');
    }
  }, [packages, dateFilteredPackages, fromDate, toDate]);

  // Selected packages from current dateFilteredPackages
  const selectedPackages = useMemo(() => {
    return dateFilteredPackages.filter(pkg => selectedPackageIds.has(pkg.id));
  }, [dateFilteredPackages, selectedPackageIds]);

  // Total rows of selected packages
  const selectedTotalRows = useMemo(() => {
    return selectedPackages.reduce((sum, pkg) => sum + (Number(pkg.total_fields) || 0), 0);
  }, [selectedPackages]);

  // Toggle selection for visible / filtered packages
  const handleToggleSelectFiltered = useCallback((visibleList) => {
    if (!visibleList || visibleList.length === 0) return;
    setSelectedPackageIds(prev => {
      const allSelected = visibleList.every(pkg => prev.has(pkg.id));
      const next = new Set(prev);
      if (allSelected) {
        visibleList.forEach(pkg => next.delete(pkg.id));
      } else {
        visibleList.forEach(pkg => next.add(pkg.id));
      }
      return next;
    });
  }, []);

  const handleToggleSelectRow = useCallback((pkgId) => {
    setSelectedPackageIds(prev => {
      const next = new Set(prev);
      if (next.has(pkgId)) {
        next.delete(pkgId);
      } else {
        next.add(pkgId);
      }
      return next;
    });
  }, []);

  // Perform bulk download via high-speed server-side streaming Excel export with inline percentage loader
  const handleBulkDownload = useCallback(async () => {
    if (selectedPackages.length <= 1) {
      notify.warning('Please select more than one package for bulk download.');
      return;
    }

    setBulkDownloadLoading(true);
    setBulkDownloadProgress(5);
    const toastId = notify.loading?.(`Generating Excel for ${selectedPackages.length} packages (${selectedTotalRows.toLocaleString()} rows)...`);

    let currentPercent = 5;
    const progressTimer = setInterval(() => {
      if (currentPercent < 35) {
        currentPercent += 5;
        setBulkDownloadProgress(currentPercent);
      } else if (currentPercent < 70) {
        currentPercent += 3;
        setBulkDownloadProgress(currentPercent);
      } else if (currentPercent < 88) {
        currentPercent += 1;
        setBulkDownloadProgress(currentPercent);
      }
    }, 120);

    try {
      const packageIds = selectedPackages.map(p => p.id);
      const blob = await loanService.exportBulkPackagesExcel(packageIds, (downloadPercent) => {
        clearInterval(progressTimer);
        const streamedPercent = Math.min(98, 88 + Math.round((downloadPercent / 100) * 10));
        setBulkDownloadProgress(streamedPercent);
      });

      clearInterval(progressTimer);
      setBulkDownloadProgress(100);

      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `Bulk_Audit_Export_${selectedPackages.length}_Packages_${dateStr}.xlsx`;

      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);

      notify.success(`Exported ${selectedTotalRows.toLocaleString()} records across ${selectedPackages.length} packages successfully!`);
    } catch (err) {
      clearInterval(progressTimer);
      console.error('Failed to perform bulk download:', err);
      notify.error(err.message || 'Failed to download selected packages in bulk.');
    } finally {
      clearInterval(progressTimer);
      if (toastId && notify.dismiss) {
        notify.dismiss(toastId);
      }
      setBulkDownloadLoading(false);
      setBulkDownloadProgress(0);
    }
  }, [selectedPackages, selectedTotalRows]);

  // Bulk download action rendered next to Search All Columns input
  const bulkDownloadAction = useMemo(() => {
    if (selectedPackages.length <= 1) return null;

    return (
      <div className="relative inline-flex items-center h-9 bg-white border border-slate-200 hover:border-slate-300 rounded-lg shadow-2xs transition-all duration-200 animate-in fade-in zoom-in-95 pl-1.5 pr-1 gap-1.5 select-none shrink-0 overflow-hidden">
        {/* Subtle inline progress line along the bottom border */}
        {bulkDownloadLoading && (
          <div
            className="absolute bottom-0 left-0 h-0.5 bg-emerald-500 transition-all duration-150 ease-out z-10"
            style={{ width: `${bulkDownloadProgress}%` }}
          />
        )}

        {/* Main Action Button */}
        <button
          type="button"
          onClick={handleBulkDownload}
          disabled={bulkDownloadLoading}
          className="inline-flex items-center gap-2 px-2 h-7 rounded-md text-xs font-semibold text-slate-800 hover:text-emerald-700 hover:bg-emerald-50 active:bg-emerald-100/70 disabled:opacity-85 disabled:pointer-events-none transition-all cursor-pointer whitespace-nowrap group"
          title={`Download combined Result Sheet for ${selectedPackages.length} packages (${selectedTotalRows.toLocaleString()} total rows)`}
        >
          {bulkDownloadLoading ? (
            <svg className="animate-spin w-3.5 h-3.5 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4}></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5 text-emerald-600 group-hover:scale-110 transition-transform duration-150 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          )}
          <span>{bulkDownloadLoading ? `Downloading` : 'Bulk Download'}</span>

          {/* Inline Data / Percent Badge */}
          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200/60 font-mono text-[11px] font-bold tracking-tight">
            {bulkDownloadLoading ? `${bulkDownloadProgress}%` : `${selectedPackages.length} pkgs · ${selectedTotalRows.toLocaleString()} rows`}
          </span>
        </button>

        {isAnyAdmin && (
          <>
            {/* Vertical Divider */}
            <div className="h-4 w-px bg-slate-200"></div>

            {/* Delete Selected Button */}
            <Tooltip text={`Delete ${selectedPackages.length} selected package(s)`} position="top">
              <button
                type="button"
                onClick={() => setShowDeleteSelectedModal(true)}
                disabled={bulkDownloadLoading || bulkDeleteLoading}
                className="inline-flex items-center gap-1.5 px-2 h-7 rounded-md text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 active:bg-rose-100/70 disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer whitespace-nowrap"
                aria-label="Delete selected packages"
              >
                {bulkDeleteLoading ? (
                  <svg className="animate-spin w-3.5 h-3.5 text-rose-600 shrink-0" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4}></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5 text-rose-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                )}
                <span>Delete Selected</span>
              </button>
            </Tooltip>
          </>
        )}

        {/* Vertical Divider */}
        <div className="h-4 w-px bg-slate-200"></div>

        {/* Clear Selection Icon Button */}
        <Tooltip text="Clear selection" position="top">
          <button
            type="button"
            onClick={() => setSelectedPackageIds(new Set())}
            disabled={bulkDownloadLoading}
            className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
            aria-label="Clear package selection"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </Tooltip>
      </div>
    );
  }, [selectedPackages, selectedTotalRows, bulkDownloadLoading, bulkDownloadProgress, handleBulkDownload, bulkDeleteLoading, isAnyAdmin]);

  // Main Dashboard Saved Packages Table Columns
  const packageColumns = useMemo(() => {
    const cols = [
      {
        header: ({ filteredData } = {}) => {
          const visibleList = filteredData !== undefined ? filteredData : dateFilteredPackages;
          const isAllSelected = visibleList.length > 0 && visibleList.every(pkg => selectedPackageIds.has(pkg.id));
          const isSomeSelected = !isAllSelected && visibleList.some(pkg => selectedPackageIds.has(pkg.id));

          return (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                ref={(el) => {
                  if (el) el.indeterminate = isSomeSelected;
                }}
                checked={isAllSelected}
                onChange={() => handleToggleSelectFiltered(visibleList)}
                className="w-4 h-4 rounded border-slate-300 text-[#24A1DD] focus:ring-[#24A1DD]/30 cursor-pointer accent-[#24A1DD]"
                title={isAllSelected ? "Deselect all visible packages" : "Select all visible packages"}
              />
              <span className="font-semibold text-slate-700 select-none">S.No.</span>
            </div>
          );
        },
        accessor: 'sno',
        sortable: false,
        headerClassName: 'sticky top-0 left-0 z-40 bg-slate-50 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)] min-w-[105px]',
        cellClassName: 'sticky left-0 z-10 bg-white group-hover:bg-slate-50 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)] min-w-[105px]',
        render: (pkg, index, globalIndexOffset = 0, isExpanded = false) => (
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={selectedPackageIds.has(pkg.id)}
              onChange={() => handleToggleSelectRow(pkg.id)}
              onClick={(e) => e.stopPropagation()}
              className="w-4 h-4 rounded border-slate-300 text-[#24A1DD] focus:ring-[#24A1DD]/30 cursor-pointer accent-[#24A1DD]"
              title={`Select ${pkg.filename} (${pkg.total_fields || 0} rows)`}
            />
            <span
              className={`p-1 rounded-md text-slate-400 group-hover:text-[#24A1DD] transition-all duration-200 ${isExpanded ? 'rotate-90 text-[#24A1DD] bg-[#24A1DD]/10' : ''
                }`}
              title={isExpanded ? 'Click to collapse row details' : 'Click to view row details'}
            >
              <svg className="w-3.5 h-3.5 transform transition-transform duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </span>
            <span className="font-mono text-xs font-semibold text-slate-500">
              {globalIndexOffset + index + 1}
            </span>
          </div>
        ),
      },
      {
        header: 'File Name',
        accessor: 'filename',
        sortable: true,
        render: (pkg) => (
          <span className="font-semibold text-slate-900 max-w-xs truncate block" title={pkg.filename}>
            {pkg.filename}
          </span>
        ),
      },
      {
        header: 'Loan ID',
        accessor: 'loan_id',
        sortable: true,
        render: (pkg) => (
          <span className="font-mono text-xs font-semibold text-slate-700">
            {pkg.loan_id || '-'}
          </span>
        ),
      },
    ];

    if (isAdmin) {
      cols.push({
        header: 'Uploaded By',
        accessor: 'uploaded_by',
        sortable: true,
        render: (pkg) => (
          <span className="font-semibold text-xs text-slate-700">
            {pkg.uploaded_by || 'System'}
          </span>
        ),
      });
    }

    cols.push(
      {
        header: 'Date Uploaded',
        accessor: 'uploaded_at',
        sortable: true,
        render: (pkg) => {
          const parsed = parseUtcDate(pkg.uploaded_at);
          return (
            <span className="text-slate-500 text-xs">
              {parsed && !isNaN(parsed.getTime()) ? parsed.toLocaleString() : '-'}
            </span>
          );
        },
        sortValue: (pkg) => {
          const parsed = parseUtcDate(pkg.uploaded_at);
          return parsed && !isNaN(parsed.getTime()) ? parsed.getTime() : 0;
        },
      },
      {
        header: 'Total Fields',
        accessor: 'total_fields',
        filterType: 'number',
        sortable: true,
        align: 'center',
        render: (pkg) => (
          <span className="font-mono font-semibold text-slate-700">
            {pkg.total_fields ?? 0}
          </span>
        ),
      },
      {
        header: 'Final Valid',
        accessor: 'final_valid',
        filterType: 'number',
        sortable: true,
        align: 'center',
        render: (pkg) => (
          <span className="font-mono font-semibold text-emerald-600">
            {pkg.final_valid ?? 0}
          </span>
        ),
      },
      {
        header: 'Final Invalid',
        accessor: 'final_invalid',
        filterType: 'number',
        sortable: true,
        align: 'center',
        render: (pkg) => (
          <span className="font-mono font-semibold text-rose-600">
            {pkg.final_invalid ?? 0}
          </span>
        ),
      },
      {
        header: 'Review Required',
        accessor: 'review_required',
        filterType: 'number',
        sortable: true,
        align: 'center',
        headerClassName: 'whitespace-nowrap min-w-[120px]',
        render: (pkg) => (
          <span className="font-mono font-semibold text-amber-600">
            {pkg.review_required ?? 0}
          </span>
        ),
      },
      {
        header: 'Yet to Take Action',
        accessor: 'yet_to_take_action',
        filterType: 'number',
        headerTooltip: 'Calculates only Invalid and Review Required',
        sortable: true,
        align: 'center',
        headerClassName: 'whitespace-nowrap min-w-[160px]',
        render: (pkg) => {
          const val = pkg.yet_to_take_action ?? 0;
          return (
            <span className={`font-mono font-semibold ${val > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
              {val}
            </span>
          );
        },
      },
      {
        header: 'Corrected',
        accessor: 'action_corrected',
        filterType: 'number',
        sortable: true,
        align: 'center',
        headerClassName: 'whitespace-nowrap min-w-[100px]',
        render: (pkg) => {
          const val = pkg.action_corrected ?? 0;
          return (
            <span className={`font-mono font-semibold ${val > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
              {val}
            </span>
          );
        },
      },
      {
        header: 'Incorrect Status',
        accessor: 'action_incorrect_status',
        filterType: 'number',
        sortable: true,
        align: 'center',
        headerClassName: 'whitespace-nowrap min-w-[125px]',
        render: (pkg) => {
          const val = pkg.action_incorrect_status ?? 0;
          return (
            <span className={`font-mono font-semibold ${val > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
              {val}
            </span>
          );
        },
      },
      {
        header: 'Not Applicable',
        accessor: 'action_not_applicable',
        filterType: 'number',
        sortable: true,
        align: 'center',
        headerClassName: 'whitespace-nowrap min-w-[120px]',
        render: (pkg) => {
          const val = pkg.action_not_applicable ?? 0;
          return (
            <span className={`font-mono font-semibold ${val > 0 ? 'text-slate-700' : 'text-slate-400'}`}>
              {val}
            </span>
          );
        },
      },
      {
        header: 'Need Review',
        accessor: 'action_need_review',
        filterType: 'number',
        sortable: true,
        align: 'center',
        headerClassName: 'whitespace-nowrap min-w-[110px]',
        render: (pkg) => {
          const val = pkg.action_need_review ?? 0;
          return (
            <span className={`font-mono font-semibold ${val > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
              {val}
            </span>
          );
        },
      },
      {
        header: 'Review Completed',
        accessor: 'action_review_completed',
        filterType: 'number',
        sortable: true,
        align: 'center',
        headerClassName: 'whitespace-nowrap min-w-[140px]',
        render: (pkg) => {
          const val = pkg.action_review_completed ?? 0;
          return (
            <span className={`font-mono font-semibold ${val > 0 ? 'text-teal-600' : 'text-slate-400'}`}>
              {val}
            </span>
          );
        },
      },
      {
        header: 'Out of Scope',
        accessor: 'action_out_of_scope',
        filterType: 'number',
        sortable: true,
        align: 'center',
        headerClassName: 'whitespace-nowrap min-w-[110px]',
        render: (pkg) => {
          const val = pkg.action_out_of_scope ?? 0;
          return (
            <span className={`font-mono font-semibold ${val > 0 ? 'text-purple-600' : 'text-slate-400'}`}>
              {val}
            </span>
          );
        },
      },
      {
        header: 'Others',
        accessor: 'action_others',
        filterType: 'number',
        sortable: true,
        align: 'center',
        headerClassName: 'whitespace-nowrap min-w-[90px]',
        render: (pkg) => {
          const val = pkg.action_others ?? 0;
          return (
            <span className={`font-mono font-semibold ${val > 0 ? 'text-blue-600' : 'text-slate-400'}`}>
              {val}
            </span>
          );
        },
      },
      {
        header: 'Action',
        accessor: 'actions',
        align: 'right',
        sortable: false,
        headerClassName: 'sticky top-0 right-0 z-40 bg-slate-50 border-l border-slate-200 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.06)]',
        cellClassName: 'sticky right-0 z-10 bg-white group-hover:bg-slate-50 border-l border-slate-200 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.06)]',
        render: (pkg) => (
          <div className="flex justify-end gap-1.5 whitespace-nowrap">
            <Tooltip text="Audit Details" position="top">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/dashboard/package/${encodePackageId(pkg.id)}`);
                }}
                className="inline-flex items-center justify-center p-2 border border-slate-200 bg-white hover:bg-sky-50 hover:border-[#24A1DD]/30 text-[#24A1DD] hover:text-[#1e88bb] rounded-xl text-xs shadow-2xs hover:shadow-xs transition-all cursor-pointer"
                aria-label="Audit Details"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </button>
            </Tooltip>
            <Tooltip text={`Export ${pkg.filename} to Excel`} position="top">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleExportRowPackage(pkg);
                }}
                disabled={rowExportLoadingId === pkg.id}
                className="inline-flex items-center justify-center p-2 border border-slate-200 bg-white hover:bg-emerald-50 hover:border-emerald-300 disabled:opacity-50 text-emerald-600 hover:text-emerald-700 rounded-xl text-xs shadow-2xs hover:shadow-xs transition-all cursor-pointer"
                aria-label="Export to Excel"
              >
                {rowExportLoadingId === pkg.id ? (
                  <svg className="animate-spin w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4}></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                )}
              </button>
            </Tooltip>
            {isAdmin && (
              <Tooltip text={`Delete ${pkg.filename}`} position="top">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeletePackage(pkg.id, pkg.filename);
                  }}
                  className="inline-flex items-center justify-center p-2 border border-slate-200 bg-white hover:bg-rose-50 hover:border-rose-200 text-rose-600 hover:text-rose-700 rounded-xl text-xs shadow-2xs hover:shadow-xs transition-all cursor-pointer"
                  aria-label="Delete Package"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </Tooltip>
            )}
          </div>
        ),
      }
    );

    return cols;
  }, [
    isAdmin,
    rowExportLoadingId,
    handleExportRowPackage,
    handleDeletePackage,
    selectedPackageIds,
    dateFilteredPackages,
    handleToggleSelectFiltered,
    handleToggleSelectRow
  ]);

  const packageHeaderActions = useCallback(({ filteredData }) => {
    const exportData = filteredData !== undefined ? filteredData : dateFilteredPackages;
    const isFiltered = Boolean(fromDate || toDate) || (exportData && exportData.length !== packages.length);
    const count = exportData?.length || 0;

    return (
      <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap sm:flex-nowrap">
        {/* Date Range Picker Container */}
        <div className="inline-flex items-center bg-white border border-slate-200 hover:border-slate-300 rounded-lg shadow-2xs h-9 px-2 gap-1.5 transition-colors shrink-0">
          <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <div className="flex items-center text-xs text-slate-700">
            <input
              id="dashboard-from-date"
              type="date"
              value={fromDate}
              onChange={handleFromDateChange}
              max={toDate || undefined}
              className="bg-transparent border-0 p-0 text-xs font-mono text-slate-700 focus:outline-none focus:ring-0 cursor-pointer w-[118px]"
              title="From Date"
            />
            <span className="text-slate-300 mx-1 select-none font-medium">→</span>
            <input
              id="dashboard-to-date"
              type="date"
              value={toDate}
              onChange={handleToDateChange}
              min={fromDate || undefined}
              className="bg-transparent border-0 p-0 text-xs font-mono text-slate-700 focus:outline-none focus:ring-0 cursor-pointer w-[118px]"
              title="To Date"
            />
          </div>

          <div className="h-4 w-px bg-slate-200 mx-0.5"></div>

          {/* Quick Presets Dropdown */}
          <select
            value={selectedPreset}
            onChange={(e) => handlePresetSelect(e.target.value)}
            className="bg-transparent border-0 py-0 pl-1 pr-5 text-xs font-medium text-slate-600 focus:outline-none focus:ring-0 cursor-pointer"
            aria-label="Date range quick presets"
          >
            <option value="">All</option>
            {selectedPreset === 'custom' && <option value="custom" disabled hidden>Custom</option>}
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="last7">Last 7 Days</option>
            <option value="last30">Last 30 Days</option>
            <option value="thisMonth">This Month</option>
          </select>

          {/* Clear Filter Button */}
          {(fromDate || toDate) && (
            <Tooltip text="Clear date filter" position="bottom">
              <button
                type="button"
                onClick={handleClearDateFilter}
                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                aria-label="Clear date filter"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </Tooltip>
          )}
        </div>

        {/* Action Utilities Group */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Export Button */}
          <Tooltip text={isFiltered ? `Export ${count} filtered package(s) to Excel` : 'Export packages to Excel'} position="bottom">
            <button
              type="button"
              onClick={() => handleExportPackages(exportData)}
              disabled={loading || count === 0}
              className="h-9 px-2.5 inline-flex items-center justify-center gap-1.5 border border-slate-200 bg-white hover:bg-emerald-50 hover:border-emerald-300 text-emerald-600 hover:text-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium rounded-lg text-xs transition-all shadow-2xs hover:shadow-xs cursor-pointer select-none whitespace-nowrap"
              aria-label="Export to Excel"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {isFiltered && (
                <span className="px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200/60 font-mono text-[10px] font-bold">
                  {count}
                </span>
              )}
            </button>
          </Tooltip>

          {isAnyAdmin && (
            <Tooltip text="Delete All Packages" position="bottom">
              <button
                type="button"
                onClick={() => setShowDeleteAllModal(true)}
                disabled={loading || packages.length === 0}
                className="h-9 px-2.5 inline-flex items-center justify-center gap-1.5 border border-slate-200 bg-white hover:bg-rose-50 hover:border-rose-200 text-rose-600 hover:text-rose-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium rounded-lg text-xs transition-all shadow-2xs hover:shadow-xs cursor-pointer select-none whitespace-nowrap"
                aria-label="Delete All Packages"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                <span>Delete All</span>
              </button>
            </Tooltip>
          )}

          <Tooltip text="Refresh Packages" position="bottom">
            <button
              type="button"
              onClick={fetchPackages}
              disabled={loading}
              className="w-9 h-9 inline-flex items-center justify-center border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 text-slate-600 hover:text-slate-900 font-medium rounded-lg transition-all shadow-2xs hover:shadow-xs cursor-pointer select-none"
              aria-label="Refresh Packages"
            >
              <svg className={`w-3.5 h-3.5 text-current ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            </button>
          </Tooltip>
        </div>
      </div>
    );
  }, [
    dateFilteredPackages,
    fromDate,
    toDate,
    selectedPreset,
    packages,
    isAdmin,
    loading,
    handleFromDateChange,
    handleToDateChange,
    handleClearDateFilter,
    handlePresetSelect,
    handleExportPackages,
    handleDeleteAll,
    fetchPackages
  ]);

  return (
    <div className="h-screen flex flex-col bg-slate-50 text-slate-900 overflow-hidden pt-[60px]">
      <Header />

      <main className="flex-1 flex flex-col min-h-0 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
        {/* Dashboard Main Area / Saved Packages DataTable */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="mb-4 flex-shrink-0 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Dashboard</h1>
              {(fromDate || toDate) && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#24A1DD]/10 text-[#24A1DD] border border-[#24A1DD]/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#24A1DD]"></span>
                  Date Filter Active
                </span>
              )}
            </div>
          </div>

          <DataTable
            data={dateFilteredPackages}
            columns={packageColumns}
            loading={loading}
            error={error}
            searchable={true}
            searchActions={bulkDownloadAction}
            pagination={true}
            itemsPerPageOptions={[5, 10, 25, 50]}
            defaultItemsPerPage={10}
            emptyMessage={
              (fromDate || toDate) ? (
                <div className="flex flex-col items-center justify-center gap-2 py-4">
                  <span className="text-slate-600 font-medium">
                    No packages found for the selected date range ({fromDate || 'Start'} to {toDate || 'End'}).
                  </span>
                  <button
                    type="button"
                    onClick={handleClearDateFilter}
                    className="px-3 py-1.5 bg-[#24A1DD] hover:bg-[#1e88bb] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    Clear Date Filter
                  </button>
                </div>
              ) : (
                'No Results Found'
              )
            }
            renderExpandedRow={(pkg, _, collapse, containerWidth) => (
              <PackageDetailedRowView
                pkg={pkg}
                onCollapse={collapse}
                containerWidth={containerWidth}
              />
            )}
            expandedRowKeys={expandedRowKeys}
            onToggleExpand={handleToggleExpand}
            expandOnRowClick={true}
            rowKey={(pkg) => pkg.id}
            onClearFilters={handleClearDateFilter}
            customHeader={packageHeaderActions}
            className="flex flex-col min-h-0"
          />
        </div>
      </main>

      {/* Delete All Confirmation Modal */}
      {showDeleteAllModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-100 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Delete All Loan Packages</h3>
                <p className="text-xs text-slate-500">This action cannot be undone.</p>
              </div>
            </div>
            <p className="text-sm text-slate-600">
              Are you sure you want to delete all saved loan packages? All validation results, audited records, and package files will be permanently removed.
            </p>
            <div className="flex items-center justify-end gap-3 mt-2">
              <button
                type="button"
                onClick={() => setShowDeleteAllModal(false)}
                disabled={deleteAllLoading}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer select-none"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteAll}
                disabled={deleteAllLoading}
                className="px-4 py-2 text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 rounded-xl transition-colors inline-flex items-center gap-2 shadow-xs cursor-pointer select-none"
              >
                {deleteAllLoading && (
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4}></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                )}
                {deleteAllLoading ? 'Deleting...' : 'Confirm Delete All'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Selected Packages Confirmation Modal */}
      {showDeleteSelectedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-100 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Delete Selected Packages</h3>
                <p className="text-xs text-slate-500">This action cannot be undone.</p>
              </div>
            </div>
            <p className="text-sm text-slate-600">
              Are you sure you want to delete <span className="font-semibold text-slate-800">{selectedPackageIds.size}</span> selected loan package(s)? All corresponding validation records will be permanently removed.
            </p>
            <div className="flex items-center justify-end gap-3 mt-2">
              <button
                type="button"
                onClick={() => setShowDeleteSelectedModal(false)}
                disabled={bulkDeleteLoading}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer select-none"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteSelected}
                disabled={bulkDeleteLoading}
                className="px-4 py-2 text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 rounded-xl transition-colors inline-flex items-center gap-2 shadow-xs cursor-pointer select-none"
              >
                {bulkDeleteLoading && (
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4}></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                )}
                {bulkDeleteLoading ? 'Deleting...' : `Confirm Delete (${selectedPackageIds.size})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardPage;



