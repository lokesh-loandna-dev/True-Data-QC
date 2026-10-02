import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { useAuth } from '../hooks/useAuth';
import Header from '../layout/Header';
import { loanService } from '../services/loanService';
import { DataTable } from '../components/DataTable';
import { notify } from '../utils/toast';

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

  const isAdmin = user?.role === 'admin';

  const fetchPackages = async () => {
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
  };

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

  const handleViewDetails = async (packageId) => {
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
  };

  const handleCloseModal = () => {
    setSelectedPackageId(null);
    setPackageDetails(null);
    setDetailsError('');
  };

  const handleDeletePackage = async (packageId, filename) => {
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
  };

  const handleDeleteAll = async () => {
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
  };

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
            <button
              type="button"
              onClick={() => handleViewDetails(pkg.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#24A1DD] hover:bg-[#1e88bb] text-white font-semibold rounded-xl text-xs shadow-md shadow-[#24A1DD]/10 transition-colors cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              Audit details
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={() => handleDeletePackage(pkg.id, pkg.filename)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold rounded-xl text-xs transition-colors shadow-sm cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete
              </button>
            )}
          </div>
        ),
      }
    );

    return cols;
  }, [isAdmin]);

  const packageHeaderActions = (
    <div className="flex items-center gap-3">
      {isAdmin && packages.length > 0 && (
        <button
          type="button"
          onClick={handleDeleteAll}
          className="inline-flex items-center gap-2 px-4 py-2 border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold rounded-xl text-xs transition-colors shadow-sm cursor-pointer"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Delete All
        </button>
      )}
      <button
        type="button"
        onClick={fetchPackages}
        className="inline-flex items-center gap-2 px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold rounded-xl text-xs transition-colors shadow-sm cursor-pointer"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18" />
        </svg>
        Refresh
      </button>
    </div>
  );

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



