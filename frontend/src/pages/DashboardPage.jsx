import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { useAuth } from '../hooks/useAuth';
import Header from '../layout/Header';
import { loanService } from '../services/loanService';
import { DataTable } from '../components/DataTable';
import Tooltip from '../components/Tooltip';
import { notify } from '../utils/toast';
import { exportPackagesToExcel, exportToExcel } from '../utils/excelExport';

const PackageAuditModal = lazy(() => import('../components/PackageAuditModal'));

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
  onViewDetails,
  onExport,
  isExporting,
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
        {/* Top Bar: Identity & Actions */}
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

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onViewDetails(pkg.id);
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white hover:bg-sky-50 text-[#24A1DD] hover:text-[#1e88bb] border border-slate-200 hover:border-[#24A1DD]/30 rounded-lg text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <span>Audit Details</span>
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onExport(pkg);
              }}
              disabled={isExporting}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white hover:bg-emerald-50 text-emerald-600 hover:text-emerald-700 border border-slate-200 hover:border-emerald-300 disabled:opacity-50 rounded-lg text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
            >
              {isExporting ? (
                <svg className="animate-spin w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4}></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              )}
              <span>Export</span>
            </button>

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

        {/* Unified Single Strip: Validation (4 items) + Divider + Action Breakdown (7 items) */}
        <div className="bg-white rounded-lg border border-slate-200/90 shadow-2xs p-1.5 flex flex-col md:flex-row items-stretch gap-1.5">
          {/* Validation Metrics Group (4 items - 36%) */}
          <div className="w-full md:w-[36%] grid grid-cols-4 gap-1.5 text-center">
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
              <span className="block text-[10px] text-amber-700 font-medium leading-tight">Final Blank</span>
              <span className="font-mono text-xs font-bold text-amber-600">{pkg.final_blank ?? 0}</span>
            </div>
          </div>

          {/* Divider */}
          <div className="hidden md:block w-px bg-slate-200 self-stretch my-0.5"></div>

          {/* Action Status Breakdown Group (7 items - 64%) */}
          <div className="w-full md:w-[64%] grid grid-cols-4 sm:grid-cols-7 gap-1.5 text-center">
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
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Detailed Modal State
  const [selectedPackageId, setSelectedPackageId] = useState(null);
  const [packageDetails, setPackageDetails] = useState(null); // { package, summary, records }
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState('');
  const [rowExportLoadingId, setRowExportLoadingId] = useState(null);

  // Expandable Row State
  const [expandedRowKeys, setExpandedRowKeys] = useState([]);

  // Date-based filter state
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedPreset, setSelectedPreset] = useState('');

  const isAdmin = user?.role === 'admin';

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

  const handleViewDetails = useCallback(async (packageId) => {
    setSelectedPackageId(packageId);
    setDetailsLoading(true);
    setDetailsError('');
    setPackageDetails(null);
    try {
      const response = await loanService.getPackageDetails(packageId);
      if (response.status === 'success') {
        setPackageDetails(response);
      } else {
        setDetailsError('Failed to fetch package details.');
      }
    } catch (err) {
      setDetailsError(err.message || 'An error occurred while loading package details.');
    } finally {
      setDetailsLoading(false);
    }
  }, []);

  const handleCloseModal = () => {
    setSelectedPackageId(null);
    setPackageDetails(null);
    setDetailsError('');
    fetchPackages();
  };

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

  const handleDeleteAll = useCallback(async () => {
    if (!window.confirm('Are you sure you want to delete all saved loan packages? This action cannot be undone.')) {
      return;
    }
    try {
      setLoading(true);
      await loanService.clearAllPackages();
      notify.success('All saved loan packages cleared successfully');
      await fetchPackages();
    } catch (err) {
      const errMsg = err.message || 'Failed to delete all packages.';
      setError(errMsg);
      notify.error(errMsg);
    } finally {
      setLoading(false);
    }
  }, [fetchPackages]);

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

  // Main Dashboard Saved Packages Table Columns
  const packageColumns = useMemo(() => {
    const cols = [
      {
        header: 'S.No.',
        accessor: 'sno',
        sortable: false,
        headerClassName: 'sticky top-0 left-0 z-40 bg-slate-50 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]',
        cellClassName: 'sticky left-0 z-10 bg-white group-hover:bg-slate-50 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]',
        render: (_, index, globalIndexOffset = 0, isExpanded = false) => (
          <div className="flex items-center gap-2">
            <span
              className={`p-1 rounded-md text-slate-400 group-hover:text-[#24A1DD] transition-all duration-200 ${
                isExpanded ? 'rotate-90 text-[#24A1DD] bg-[#24A1DD]/10' : ''
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
        sortable: true,
        align: 'center',
        render: (pkg) => (
          <span className="font-mono font-semibold text-rose-600">
            {pkg.final_invalid ?? 0}
          </span>
        ),
      },
      {
        header: 'Final Blank',
        accessor: 'final_blank',
        sortable: true,
        align: 'center',
        render: (pkg) => (
          <span className="font-mono font-semibold text-amber-600">
            {pkg.final_blank ?? 0}
          </span>
        ),
      },
      {
        header: 'Corrected',
        accessor: 'action_corrected',
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
                  handleViewDetails(pkg.id);
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
  }, [isAdmin, rowExportLoadingId, handleViewDetails, handleExportRowPackage, handleDeletePackage]);

  const packageHeaderActions = useCallback(({ filteredData }) => {
    const exportData = filteredData !== undefined ? filteredData : dateFilteredPackages;
    const isFiltered = Boolean(fromDate || toDate) || (exportData && exportData.length !== packages.length);
    const count = exportData?.length || 0;

    return (
      <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
        {/* From Date Field */}
        <div className="flex items-center gap-1.5">
          <label htmlFor="dashboard-from-date" className="text-xs font-medium text-slate-600 select-none">
            From:
          </label>
          <input
            id="dashboard-from-date"
            type="date"
            value={fromDate}
            onChange={handleFromDateChange}
            max={toDate || undefined}
            className="h-[38px] px-2.5 text-xs font-creato text-slate-700 bg-white border border-slate-200 hover:border-slate-300 focus:border-[#24A1DD] focus:ring-2 focus:ring-[#24A1DD]/20 rounded-xl shadow-2xs transition-all cursor-pointer outline-none"
            title="From Date"
          />
        </div>

        {/* To Date Field */}
        <div className="flex items-center gap-1.5">
          <label htmlFor="dashboard-to-date" className="text-xs font-medium text-slate-600 select-none">
            To:
          </label>
          <input
            id="dashboard-to-date"
            type="date"
            value={toDate}
            onChange={handleToDateChange}
            min={fromDate || undefined}
            className="h-[38px] px-2.5 text-xs font-creato text-slate-700 bg-white border border-slate-200 hover:border-slate-300 focus:border-[#24A1DD] focus:ring-2 focus:ring-[#24A1DD]/20 rounded-xl shadow-2xs transition-all cursor-pointer outline-none"
            title="To Date"
          />
        </div>

        {/* Quick Presets Dropdown */}
        <select
          value={selectedPreset}
          onChange={(e) => handlePresetSelect(e.target.value)}
          className="h-[38px] px-2.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 hover:border-slate-300 focus:border-[#24A1DD] focus:ring-2 focus:ring-[#24A1DD]/20 rounded-xl shadow-2xs transition-all cursor-pointer outline-none"
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
              className="h-[38px] px-2.5 inline-flex items-center gap-1 border border-rose-200 bg-rose-50/60 hover:bg-rose-50 text-rose-600 hover:text-rose-700 font-semibold rounded-xl text-xs transition-all shadow-2xs hover:shadow-xs cursor-pointer select-none"
              aria-label="Clear date filter"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span>Clear</span>
            </button>
          </Tooltip>
        )}

        {/* Divider */}
        <div className="h-5 w-px bg-slate-200 hidden sm:block"></div>

        {/* Export Button */}
        <Tooltip text={isFiltered ? `Export ${count} filtered package(s) to Excel` : 'Export packages to Excel'} position="bottom">
          <button
            type="button"
            onClick={() => handleExportPackages(exportData)}
            disabled={loading || count === 0}
            className="inline-flex items-center justify-center p-2 sm:p-2.5 border border-slate-200 bg-white hover:bg-emerald-50 hover:border-emerald-300 text-emerald-600 hover:text-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold rounded-xl text-xs sm:text-sm transition-all shadow-2xs hover:shadow-xs cursor-pointer select-none"
            aria-label="Export to Excel"
          >
            <svg className="w-4 h-4 sm:w-4.5 sm:h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {isFiltered && (
              <span className="ml-1.5 px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md text-[11px] font-bold">
                {count}
              </span>
            )}
          </button>
        </Tooltip>

        {isAdmin && packages.length > 0 && (
          <Tooltip text="Delete All Packages" position="bottom">
            <button
              type="button"
              onClick={handleDeleteAll}
              disabled={loading}
              className="inline-flex items-center justify-center p-2 sm:p-2.5 border border-slate-200 bg-white hover:bg-rose-50 hover:border-rose-200 text-rose-600 hover:text-rose-700 disabled:opacity-50 font-semibold rounded-xl text-xs sm:text-sm transition-all shadow-2xs hover:shadow-xs cursor-pointer select-none"
              aria-label="Delete All Packages"
            >
              <svg className="w-4 h-4 sm:w-4.5 sm:h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </Tooltip>
        )}
        <Tooltip text="Refresh Packages" position="bottom">
          <button
            type="button"
            onClick={fetchPackages}
            disabled={loading}
            className="inline-flex items-center justify-center p-2 sm:p-2.5 border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 text-slate-600 hover:text-slate-900 font-semibold rounded-xl text-xs sm:text-sm transition-all shadow-2xs hover:shadow-xs cursor-pointer select-none"
            aria-label="Refresh Packages"
          >
            <svg className={`w-4 h-4 sm:w-4.5 sm:h-4.5 text-current ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
          </button>
        </Tooltip>
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
                onViewDetails={handleViewDetails}
                onExport={handleExportRowPackage}
                isExporting={rowExportLoadingId === pkg.id}
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

      <Suspense fallback={null}>
        <PackageAuditModal
          selectedPackageId={selectedPackageId}
          selectedPackage={packages.find(p => p.id === selectedPackageId)}
          packageDetails={packageDetails}
          detailsLoading={detailsLoading}
          detailsError={detailsError}
          onClose={handleCloseModal}
          onRetry={() => handleViewDetails(selectedPackageId)}
          onSaveSuccess={fetchPackages}
        />
      </Suspense>
    </div>
  );
};

export default DashboardPage;



