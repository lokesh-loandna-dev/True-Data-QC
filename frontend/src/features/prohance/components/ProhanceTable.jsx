import React, { useState, useEffect, useMemo, useRef } from 'react';
import { DataTable } from '../../../components/DataTable';
import Tooltip from '../../../components/Tooltip';
import { useAuth } from '../../../hooks/useAuth';
import { notify } from '../../../utils/toast';
import { prohanceService } from '../../../services/prohanceService';
import { ProhanceReportViewModal } from './ProhanceReportViewModal';
import { ValidationProgressModal } from '../../../components/ValidationProgressModal';

const PROHANCE_PROGRESS_STEPS = [
  { label: 'Reading Prohance CSV report & headers', target: 25 },
  { label: 'Parsing activity logs & mapping loan numbers', target: 60 },
  { label: 'Generating 5 audit reports & saving to database', target: 100 },
];

export const ProhanceTable = ({ registerFileInputRef }) => {
  const { user } = useAuth();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);

  // Upload Progress Modal State
  const [selectedFile, setSelectedFile] = useState(null);
  const [isProgressModalOpen, setIsProgressModalOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [progressStatus, setProgressStatus] = useState('');
  const [progressError, setProgressError] = useState('');

  // View modal state
  const [selectedReportDetail, setSelectedReportDetail] = useState(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [loadingModal, setLoadingModal] = useState(false);

  // Delete modal state
  const [reportToDelete, setReportToDelete] = useState(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Delete all modal state
  const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

  if (registerFileInputRef) {
    registerFileInputRef(fileInputRef);
  }

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const reports = await prohanceService.getReports();
      if (Array.isArray(reports)) {
        const formatted = reports.map((r) => ({
          id: r.report_id,
          fileName: r.original_filename,
          uploadDate: new Date(r.uploaded_at).toISOString().split('T')[0],
          time: new Date(r.uploaded_at).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          }),
          userName: r.user_name || user?.username || 'Admin User',
        }));
        setData(formatted);
        return formatted;
      }
    } catch (err) {
      console.error('Failed to load reports from backend:', err);
      setData([]);
    } finally {
      setLoading(false);
    }
    return [];
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv')) {
      notify.error('Please upload a .csv file exported from Prohance');
      return;
    }

    setSelectedFile(file);
    setIsProgressModalOpen(true);
    setUploadProgress(5);
    setProgressStatus('Reading Prohance CSV report & headers...');
    setProgressError('');

    let progressVal = 5;
    const progressTimer = setInterval(() => {
      progressVal += Math.floor(Math.random() * 8) + 4;
      if (progressVal >= 92) {
        progressVal = 92;
        clearInterval(progressTimer);
      }
      setUploadProgress(progressVal);

      if (progressVal < 25) {
        setProgressStatus('Reading Prohance CSV report & headers...');
      } else if (progressVal < 60) {
        setProgressStatus('Parsing activity logs & mapping loan numbers...');
      } else {
        setProgressStatus('Generating 5 audit reports & saving to database...');
      }
    }, 150);

    try {
      const res = await prohanceService.uploadReport(file);
      clearInterval(progressTimer);
      setUploadProgress(100);
      setProgressStatus('Processing Completed!');

      setTimeout(async () => {
        setIsProgressModalOpen(false);
        notify.success(`File "${file.name}" uploaded and processed successfully!`);
        const reportsList = await fetchReports();

        // Automatically open the report preview modal for the newly uploaded file
        const targetReportId = res?.report_id || res?.id || (reportsList && reportsList[0]?.id);
        if (targetReportId) {
          handleViewReport(targetReportId);
        } else if (res && res.tabs) {
          setSelectedReportDetail(res);
          setIsViewModalOpen(true);
        }
      }, 600);
    } catch (err) {
      clearInterval(progressTimer);
      const errMsg = err.message || 'Server error';
      setProgressError(errMsg);
      notify.error(`Upload failed: ${errMsg}`);
    } finally {
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  const handleViewReport = async (reportId) => {
    setIsViewModalOpen(true);
    setLoadingModal(true);
    try {
      const detail = await prohanceService.getReportById(reportId);
      setSelectedReportDetail(detail);
    } catch (err) {
      console.error(`Failed to fetch report ${reportId}:`, err);
      notify.error('Failed to load report details.');
      setIsViewModalOpen(false);
    } finally {
      setLoadingModal(false);
    }
  };

  const handleDeleteClick = (row) => {
    setReportToDelete(row);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!reportToDelete) return;
    setDeleting(true);
    try {
      await prohanceService.deleteReport(reportToDelete.id);
      notify.success(`Report "${reportToDelete.fileName}" deleted successfully`);
      setIsDeleteModalOpen(false);
      setReportToDelete(null);
      await fetchReports();
    } catch (err) {
      console.error('Failed to delete report:', err);
      notify.error(`Failed to delete report: ${err.message || 'Server error'}`);
    } finally {
      setDeleting(false);
    }
  };

  const handleConfirmDeleteAll = async () => {
    setDeletingAll(true);
    try {
      await prohanceService.deleteAllReports();
      notify.success('All Prohance reports deleted successfully');
      setIsDeleteAllModalOpen(false);
      await fetchReports();
    } catch (err) {
      console.error('Failed to delete all reports:', err);
      notify.error(`Failed to delete all reports: ${err.message || 'Server error'}`);
    } finally {
      setDeletingAll(false);
    }
  };

  const columns = useMemo(
    () => [
      {
        header: 'S.No',
        accessor: 'id',
        sortable: false,
        render: (_, index, globalIndexOffset = 0) => (
          <span className="text-slate-500 font-medium">
            {globalIndexOffset + index + 1}
          </span>
        ),
      },
      {
        header: 'File Name',
        accessor: 'fileName',
        sortable: true,
        cellClassName: 'font-medium text-slate-900',
        render: (row) => (
          <div className="flex items-center gap-2">
            <svg
              className="w-4 h-4 text-[#24A1DD] flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <span className="truncate">{row.fileName}</span>
          </div>
        ),
      },
      {
        header: 'Upload Date',
        accessor: 'uploadDate',
        sortable: true,
      },
      {
        header: 'Time',
        accessor: 'time',
        sortable: true,
      },
      {
        header: 'User Name',
        accessor: 'userName',
        sortable: true,
        render: (row) => (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-[#1e9bd8]">
            {row.userName}
          </span>
        ),
      },
      {
        header: 'Actions',
        accessor: 'actions',
        align: 'right',
        sortable: false,
        render: (row) => (
          <div className="flex items-center justify-end gap-2">
            <Tooltip text="View Report" position="top">
              <button
                type="button"
                onClick={() => handleViewReport(row.id)}
                className="inline-flex items-center justify-center p-2 bg-[#24A1DD] hover:bg-[#1e88bb] text-white font-semibold rounded-lg text-xs shadow-xs transition-colors cursor-pointer"
                aria-label="View Report"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </button>
            </Tooltip>
            <Tooltip text="Delete Report" position="top">
              <button
                type="button"
                onClick={() => handleDeleteClick(row)}
                className="inline-flex items-center justify-center p-2 border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold rounded-lg text-xs transition-colors shadow-xs cursor-pointer"
                aria-label="Delete Report"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </Tooltip>
          </div>
        ),
      },
    ],
    []
  );

  return (
    <div className="w-full">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept=".csv"
      />

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
          Prohance Dashboard
        </h2>

        <div className="flex items-center gap-2 sm:gap-3">
          <Tooltip text="Upload Prohance Report" position="bottom">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center justify-center p-2 sm:p-2.5 bg-[#24A1DD] hover:bg-[#1e88bb] text-white text-sm font-medium rounded-xl shadow-sm transition-colors cursor-pointer"
              aria-label="Upload Prohance Report"
            >
              <svg className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </button>
          </Tooltip>

          {data.length > 0 && (
            <Tooltip text="Delete All Reports" position="bottom">
              <button
                type="button"
                onClick={() => setIsDeleteAllModalOpen(true)}
                className="inline-flex items-center justify-center p-2 sm:p-2.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-sm font-medium rounded-xl transition-colors shadow-sm cursor-pointer"
                aria-label="Delete All Reports"
              >
                <svg className="w-4 h-4 sm:w-4.5 sm:h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </Tooltip>
          )}
        </div>
      </div>

      <DataTable
        data={data}
        columns={columns}
        loading={loading}
        searchable={true}
        pagination={true}
        itemsPerPageOptions={[5, 10, 25, 50]}
        defaultItemsPerPage={10}
        emptyMessage="No dashboard files uploaded yet."
        maxHeight="calc(100vh - 200px)"
        className="w-full"
      />

      {/* Report View Modal */}
      <ProhanceReportViewModal
        isOpen={isViewModalOpen}
        onClose={() => setIsViewModalOpen(false)}
        report={selectedReportDetail}
        loading={loadingModal}
      />

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-4 text-rose-600 mb-4">
              <div className="p-3 bg-rose-50 rounded-xl border border-rose-100">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Delete Report</h3>
                <p className="text-xs text-slate-500">This action cannot be undone</p>
              </div>
            </div>

            <p className="text-sm text-slate-600 mb-6 leading-relaxed">
              Are you sure you want to delete report <strong className="text-slate-900">"{reportToDelete?.fileName}"</strong>? All processed data and associated summaries will be permanently deleted.
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                disabled={deleting}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="inline-flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-xl transition-colors shadow-sm cursor-pointer disabled:opacity-50"
              >
                {deleting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Delete Report</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete All Confirmation Modal */}
      {isDeleteAllModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-4 text-rose-600 mb-4">
              <div className="p-3 bg-rose-50 rounded-xl border border-rose-100">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Delete All Reports</h3>
                <p className="text-xs text-slate-500">This action cannot be undone</p>
              </div>
            </div>

            <p className="text-sm text-slate-600 mb-6 leading-relaxed">
              Are you sure you want to delete <strong className="text-slate-900">ALL ({data.length}) Prohance reports</strong>? All processed audit logs and summaries will be permanently deleted.
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsDeleteAllModalOpen(false)}
                disabled={deletingAll}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteAll}
                disabled={deletingAll}
                className="inline-flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-xl transition-colors shadow-sm cursor-pointer disabled:opacity-50"
              >
                {deletingAll ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Deleting All...</span>
                  </>
                ) : (
                  <span>Delete All Reports</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Progress Modal */}
      <ValidationProgressModal
        isOpen={isProgressModalOpen}
        fileName={selectedFile?.name}
        fileSize={selectedFile?.size}
        progress={uploadProgress}
        status={progressStatus}
        error={progressError}
        title="Ingesting Prohance Data"
        steps={PROHANCE_PROGRESS_STEPS}
        onClose={() => setIsProgressModalOpen(false)}
      />
    </div>
  );
};

export default ProhanceTable;
