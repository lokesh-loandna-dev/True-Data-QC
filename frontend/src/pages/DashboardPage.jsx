import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { useAuth } from '../hooks/useAuth';
import Header from '../layout/Header';
import { loanService } from '../services/loanService';
import { DataTable } from '../components/DataTable';
import Tooltip from '../components/Tooltip';
import { notify } from '../utils/toast';
import { exportPackagesToExcel, exportToExcel } from '../utils/excelExport';

const PackageAuditModal = lazy(() => import('../components/PackageAuditModal'));


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

  const isAdmin = user?.role === 'admin';

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
          reportSuffix: '_Audit_Report'
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

  // Export full or filtered dashboard packages list to Excel
  const handleExportPackages = useCallback((dataToExport) => {
    try {
      const records = dataToExport && dataToExport.length > 0 ? dataToExport : packages;
      if (!records || records.length === 0) {
        notify.warning('No package data to export');
        return;
      }
      const dateStr = new Date().toISOString().split('T')[0];
      exportPackagesToExcel({
        packages: records,
        filename: `Loan_Packages_${dateStr}`
      });
      notify.success(`Exported ${records.length} package${records.length === 1 ? '' : 's'} to Excel successfully!`);
    } catch (err) {
      console.error('Failed to export loan packages to Excel:', err);
      notify.error('Failed to export packages to Excel');
    }
  }, [packages]);

  // Main Dashboard Saved Packages Table Columns
  const packageColumns = useMemo(() => {
    const cols = [
      {
        header: 'S.No.',
        accessor: 'sno',
        sortable: false,
        headerClassName: 'sticky top-0 left-0 z-40 bg-slate-50 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]',
        cellClassName: 'sticky left-0 z-10 bg-white group-hover:bg-slate-50 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]',
        render: (_, index, globalIndexOffset = 0) => (
          <span className="font-mono text-xs font-semibold text-slate-500">
            {globalIndexOffset + index + 1}
          </span>
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
        render: (pkg) => (
          <span className="text-slate-500 text-xs">
            {pkg.uploaded_at ? new Date(pkg.uploaded_at).toLocaleString() : '-'}
          </span>
        ),
        sortValue: (pkg) => (pkg.uploaded_at ? new Date(pkg.uploaded_at).getTime() : 0),
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
        header: 'Action',
        accessor: 'actions',
        align: 'right',
        sortable: false,
        headerClassName: 'sticky top-0 right-0 z-40 bg-slate-50 border-l border-slate-200 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.06)]',
        cellClassName: 'sticky right-0 z-10 bg-white group-hover:bg-slate-50 border-l border-slate-200 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.06)]',
        render: (pkg) => (
          <div className="flex justify-end gap-2 whitespace-nowrap">
            <Tooltip text="Audit Details" position="top">
              <button
                type="button"
                onClick={() => handleViewDetails(pkg.id)}
                className="inline-flex items-center justify-center p-2 bg-[#24A1DD] hover:bg-[#1e88bb] text-white font-semibold rounded-xl text-xs shadow-md shadow-[#24A1DD]/10 transition-colors cursor-pointer"
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
                onClick={() => handleExportRowPackage(pkg)}
                disabled={rowExportLoadingId === pkg.id}
                className="inline-flex items-center justify-center p-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold rounded-xl text-xs shadow-md shadow-emerald-600/10 transition-colors cursor-pointer"
                aria-label="Export to Excel"
              >
                {rowExportLoadingId === pkg.id ? (
                  <svg className="animate-spin w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4}></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                )}
              </button>
            </Tooltip>
            {isAdmin && (
              <Tooltip text={`Delete ${pkg.filename}`} position="top">
                <button
                  type="button"
                  onClick={() => handleDeletePackage(pkg.id, pkg.filename)}
                  className="inline-flex items-center justify-center p-2 border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold rounded-xl text-xs transition-colors shadow-sm cursor-pointer"
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
    const exportData = filteredData !== undefined ? filteredData : packages;
    const isFiltered = filteredData && filteredData.length !== packages.length;
    const count = exportData?.length || 0;

    return (
      <div className="flex items-center gap-2 sm:gap-3">
        <Tooltip text={isFiltered ? `Export ${count} filtered package(s) to Excel` : 'Export packages to Excel'} position="bottom">
          <button
            type="button"
            onClick={() => handleExportPackages(exportData)}
            disabled={loading || count === 0}
            className="inline-flex items-center justify-center p-2 sm:p-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl text-xs sm:text-sm transition-all shadow-sm hover:shadow cursor-pointer select-none"
            aria-label="Export to Excel"
          >
            <svg className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {isFiltered && (
              <span className="ml-1.5 px-1.5 py-0.5 bg-emerald-700/80 rounded-md text-[11px] font-bold">
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
              className="inline-flex items-center justify-center p-2 sm:p-2.5 border border-rose-200 bg-rose-50 hover:bg-rose-100 disabled:opacity-50 text-rose-700 font-semibold rounded-xl text-xs sm:text-sm transition-colors shadow-2xs cursor-pointer select-none"
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
            className="inline-flex items-center justify-center p-2 sm:p-2.5 border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-700 font-semibold rounded-xl text-xs sm:text-sm transition-colors shadow-2xs cursor-pointer select-none"
            aria-label="Refresh Packages"
          >
            <svg className={`w-4 h-4 sm:w-4.5 sm:h-4.5 text-slate-500 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18" />
            </svg>
          </button>
        </Tooltip>
      </div>
    );
  }, [packages, isAdmin, loading, handleExportPackages, handleDeleteAll, fetchPackages]);

  return (
    <div className="h-screen flex flex-col bg-slate-50 text-slate-900 overflow-hidden pt-[60px]">
      <Header />

      <main className="flex-1 flex flex-col min-h-0 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
        {/* Dashboard Main Area / Saved Packages DataTable */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="mb-4 flex-shrink-0">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Dashboard</h1>
          </div>

          <DataTable
            data={packages}
            columns={packageColumns}
            loading={loading}
            error={error}
            searchable={true}
            pagination={true}
            itemsPerPageOptions={[5, 10, 25, 50]}
            defaultItemsPerPage={10}
            emptyMessage="No Results Found"
            customHeader={packageHeaderActions}
            className="flex flex-col min-h-0"
          />
        </div>
      </main>

      <Suspense fallback={null}>
        <PackageAuditModal
          selectedPackageId={selectedPackageId}
          packageDetails={packageDetails}
          detailsLoading={detailsLoading}
          detailsError={detailsError}
          onClose={handleCloseModal}
          onRetry={() => handleViewDetails(selectedPackageId)}
        />
      </Suspense>
    </div>
  );
};

export default DashboardPage;



