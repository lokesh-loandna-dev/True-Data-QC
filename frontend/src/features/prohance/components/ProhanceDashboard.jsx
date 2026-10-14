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

const REPORT_TABS = [
  { id: 'package_time_summary', label: 'Package Time Summary', badgeColor: 'bg-blue-100 text-blue-800' },
  { id: 'unmapped_requires_review', label: 'Unmapped - Requires Review', badgeColor: 'bg-amber-100 text-amber-800' },
  { id: 'unverified_requires_review', label: 'Unverified - Requires Review', badgeColor: 'bg-purple-100 text-purple-800' },
  { id: 'overall_activity_summary', label: 'Overall Activity Summary', badgeColor: 'bg-emerald-100 text-emerald-800' },
  { id: 'overall_by_user', label: 'Overall by User', badgeColor: 'bg-slate-100 text-slate-800' },
];

const INITIAL_MOCK_REPORT = {
  report_id: 1,
  original_filename: 'All_Activities_By_User_Details_Report.csv',
  uploaded_at: new Date().toISOString(),
  user_name: 'Admin User',
  stats: {
    rows_processed: 140630,
    pdf_rows: 45037,
    lauramac_rows: 46242,
    packages_found: 1194,
    rows_unmapped: 1276,
    rows_unverified: 2889,
    report_period: '12 Aug 2026',
  },
  tabs: {
    package_time_summary: [
      {
        'File #': 'LN-9082341',
        'User Name': 'John Doe',
        'Session Date': '12 Aug 2026',
        'PDF Time': '00:15:30',
        'Lauramac Time': '00:45:10',
        'Total Time': '01:00:40',
        'Users on File': 2,
        'File Total': '02:15:00',
      },
      {
        'File #': 'LN-9082342',
        'User Name': 'Jane Smith',
        'Session Date': '12 Aug 2026',
        'PDF Time': '00:22:15',
        'Lauramac Time': '00:30:00',
        'Total Time': '00:52:15',
        'Users on File': 1,
        'File Total': '00:52:15',
      },
    ],
    unmapped_requires_review: [
      {
        'User Name': 'John Doe',
        'Session Date': '12 Aug 2026',
        'Row Type': 'PDF',
        'Category Name': 'Document Review',
        'Activity Name': 'AcroRd32',
        'Activity Text': 'Scan_Unlabeled_Package_001.pdf',
        'Process Name': 'Acrobat',
        'Start Time': '10:00 AM',
        'End Time': '10:08 AM',
        Duration: '00:08:00',
        Reason: 'No digit sequence matched',
      },
    ],
    unverified_requires_review: [
      {
        'User Name': 'Jane Smith',
        'Session Date': '12 Aug 2026',
        'File #': 'LN-8832109',
        'Activity Text': 'LN-8832109_Closing_Docs.pdf',
        'Start Time': '02:15 PM',
        'End Time': '02:30 PM',
        Duration: '00:15:00',
        Reason: 'No Lauramac visit cross-checked',
      },
    ],
    overall_activity_summary: [
      {
        'Activity Name': 'AcroRd32',
        'Activity Text': 'Loan Package Verification',
        'File #': 'LN-9082341',
        Occurrences: 45,
        'Total Duration': '04:12:00',
        'Users on File': 3,
        'File Total': '12:45:00',
      },
    ],
    overall_by_user: [
      {
        'User Name': 'Admin User',
        'Activity Name': 'Lauramac Portal',
        'Activity Text': 'Dashboard & Package Audit',
        'File #': 'LN-9082341',
        'Total Duration': '03:30:00',
        'Users on File': 2,
        'File Total': '08:15:00',
      },
    ],
  },
};

export const ProhanceDashboard = ({ registerFileInputRef }) => {
  const { user } = useAuth();
  const [reportsList, setReportsList] = useState([]);
  const [selectedReport, setSelectedReport] = useState(INITIAL_MOCK_REPORT);
  const [activeSubTab, setActiveSubTab] = useState('package_time_summary');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  // Upload Progress Modal State
  const [selectedFile, setSelectedFile] = useState(null);
  const [isProgressModalOpen, setIsProgressModalOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [progressStatus, setProgressStatus] = useState('');
  const [progressError, setProgressError] = useState('');

  // View modal state
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [modalReportDetail, setModalReportDetail] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);

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

  // Fetch reports on mount
  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const data = await prohanceService.getReports();
      if (Array.isArray(data) && data.length > 0) {
        // Formatted list for history table
        const formattedList = data.map((item) => ({
          id: item.report_id,
          fileName: item.original_filename,
          uploadDate: new Date(item.uploaded_at).toISOString().split('T')[0],
          time: new Date(item.uploaded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          userName: item.user_name || user?.username || 'Admin User',
          reportPeriod: item.report_period,
          packagesFound: item.packages_found,
          raw: item,
        }));
        setReportsList(formattedList);

        // Auto-fetch full detail of latest report
        fetchReportDetail(data[0].report_id);
      } else {
        // Fallback mock history if DB is empty
        setReportsList([
          {
            id: INITIAL_MOCK_REPORT.report_id,
            fileName: INITIAL_MOCK_REPORT.original_filename,
            uploadDate: new Date(INITIAL_MOCK_REPORT.uploaded_at).toISOString().split('T')[0],
            time: new Date(INITIAL_MOCK_REPORT.uploaded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            userName: INITIAL_MOCK_REPORT.user_name,
            reportPeriod: INITIAL_MOCK_REPORT.stats.report_period,
            packagesFound: INITIAL_MOCK_REPORT.stats.packages_found,
          },
        ]);
      }
    } catch (err) {
      console.warn('Backend API connection issue, using initial display data:', err);
      setReportsList([
        {
          id: INITIAL_MOCK_REPORT.report_id,
          fileName: INITIAL_MOCK_REPORT.original_filename,
          uploadDate: new Date(INITIAL_MOCK_REPORT.uploaded_at).toISOString().split('T')[0],
          time: new Date(INITIAL_MOCK_REPORT.uploaded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          userName: INITIAL_MOCK_REPORT.user_name,
          reportPeriod: INITIAL_MOCK_REPORT.stats.report_period,
          packagesFound: INITIAL_MOCK_REPORT.stats.packages_found,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const fetchReportDetail = async (reportId) => {
    try {
      const detail = await prohanceService.getReportById(reportId);
      if (detail && detail.tabs) {
        setSelectedReport(detail);
      }
      return detail;
    } catch (err) {
      console.warn(`Failed to fetch report ${reportId} from backend:`, err);
      return null;
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv')) {
      notify.error('Please upload a .csv export file from Prohance.');
      return;
    }

    setUploading(true);
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
      const response = await prohanceService.uploadReport(file);
      clearInterval(progressTimer);
      setUploadProgress(100);
      setProgressStatus('Processing Completed!');

      setTimeout(async () => {
        setIsProgressModalOpen(false);
        notify.success(`5 reports generated and saved to DB for "${file.name}"!`);
        if (response && response.tabs) {
          setSelectedReport(response);
          setModalReportDetail(response);
          setIsViewModalOpen(true);
        } else if (response && (response.report_id || response.id)) {
          handleViewClick(response.report_id || response.id);
        }
        fetchReports();
      }, 600);
    } catch (err) {
      clearInterval(progressTimer);
      const errMsg = err.message || 'Failed to process file';
      setProgressError(errMsg);
      notify.error(`Upload error: ${errMsg}`);
    } finally {
      setUploading(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleViewClick = async (reportId) => {
    setIsViewModalOpen(true);
    setModalLoading(true);
    const detail = await fetchReportDetail(reportId);
    setModalReportDetail(detail || selectedReport);
    setModalLoading(false);
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
      setSelectedReport(null);
      await fetchReports();
    } catch (err) {
      console.error('Failed to delete all reports:', err);
      notify.error(`Failed to delete all reports: ${err.message || 'Server error'}`);
    } finally {
      setDeletingAll(false);
    }
  };

  // Columns for main dashboard history table
  const historyColumns = useMemo(
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
          <div
            onClick={() => fetchReportDetail(row.id)}
            className="flex items-center gap-2 cursor-pointer hover:text-[#24A1DD] transition-colors"
          >
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
            <span className="truncate font-semibold">{row.fileName}</span>
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
            {row.userName || user?.username || 'Admin User'}
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
                onClick={() => handleViewClick(row.id)}
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
    [user]
  );

  // Generate dynamic columns for selected subtab data
  const subTabRows = useMemo(() => {
    if (!selectedReport || !selectedReport.tabs) return [];
    return selectedReport.tabs[activeSubTab] || [];
  }, [selectedReport, activeSubTab]);

  const subTabColumns = useMemo(() => {
    if (!subTabRows || subTabRows.length === 0) return [];
    const sample = subTabRows[0];
    const keys = Object.keys(sample).filter(k => k !== '_id' && k !== 'action' && k !== 'remark');

    return [
      {
        header: 'S.No',
        accessor: '_sno',
        sortable: false,
        headerClassName: 'sticky top-0 left-0 z-40 bg-slate-50 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]',
        cellClassName: 'sticky left-0 z-10 bg-white group-hover:bg-slate-50 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]',
        render: (_, index, globalIndexOffset = 0) => (
          <span className="text-slate-500 font-semibold">{globalIndexOffset + index + 1}</span>
        ),
      },
      ...keys.map((key) => ({
        header: key,
        accessor: key,
        sortable: true,
        cellClassName: key.toLowerCase().includes('file') ? 'font-semibold text-slate-900' : 'text-slate-700',
        render: (row) => {
          const val = row[key];
          if (val === null || val === undefined) return <span className="text-slate-300">-</span>;
          if (key === 'User Name') {
            return (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800">
                {val}
              </span>
            );
          }
          if (key === 'Reason') {
            return (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
                {val}
              </span>
            );
          }
          return <span>{String(val)}</span>;
        },
      })),
    ];
  }, [subTabRows]);

  return (
    <div className="flex-1 flex flex-col min-h-0 w-full gap-4">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        className="hidden"
        accept=".csv"
      />

      {/* Top Section: Dashboard Table showing S.No, File Name, Upload Date, Time, User Name, Actions */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-col flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Prohance Dashboard
          </h2>

          <div className="flex items-center gap-3">
            {selectedReport && (
              <div className="text-xs text-slate-500 hidden md:flex items-center gap-4 mr-2">
                <span>
                  Active: <strong className="text-slate-800">{selectedReport.original_filename}</strong>
                </span>
                {selectedReport.stats?.packages_found !== undefined && (
                  <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded font-medium">
                    {selectedReport.stats.packages_found} Loan Packages Identified
                  </span>
                )}
              </div>
            )}

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

            {reportsList.length > 0 && (
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
          data={reportsList}
          columns={historyColumns}
          loading={loading || uploading}
          searchable={false}
          pagination={false}
          defaultItemsPerPage={5}
          emptyMessage="No Prohance CSV files uploaded yet."
          maxHeight="calc(40vh)"
        />
      </div>

      {/* Bottom Section: 5 Generated Report Tabs/Sheets */}
      <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col min-h-0 overflow-hidden">
        {/* Tab Content Display using DataTable */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden p-4">
          <DataTable
            data={subTabRows}
            columns={subTabColumns}
            loading={loading}
            searchable={true}
            pagination={true}
            itemsPerPageOptions={[10, 25, 50, 100]}
            defaultItemsPerPage={10}
            density="compact"
            emptyMessage={`No records in ${REPORT_TABS.find((t) => t.id === activeSubTab)?.label || 'this tab'}.`}
            maxHeight="calc(100vh - 360px)"
            className="w-full"
          />
        </div>

        {/* Bottom-docked Excel Worksheet Tab Selector */}
        <div className="h-10 bg-slate-200 border-t border-slate-300 flex items-center px-4 flex-shrink-0 select-none overflow-x-auto custom-scrollbar">
          <div className="flex items-center h-full gap-[1px]">
            {REPORT_TABS.map((tab) => {
              const isActive = activeSubTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveSubTab(tab.id)}
                  className={`px-5 h-full flex items-center gap-2 text-xs font-semibold border-r border-slate-300 transition-all rounded-t-sm whitespace-nowrap cursor-pointer ${isActive
                    ? 'bg-white text-slate-900 border-t-2 border-t-[#24A1DD] border-x border-x-slate-300 shadow-xs'
                    : 'bg-slate-100/70 hover:bg-slate-50 text-slate-600 hover:text-slate-800'
                    }`}
                >
                  <svg className="w-3.5 h-3.5 text-[#24A1DD]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* View Modal */}
      <ProhanceReportViewModal
        isOpen={isViewModalOpen}
        onClose={() => setIsViewModalOpen(false)}
        report={modalReportDetail}
        loading={modalLoading}
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
                    Are you sure you want to delete <strong className="text-slate-900">ALL ({reportsList.length}) Prohance reports</strong>? All processed audit logs, summaries, and associated report data across all 5 tabs will be permanently deleted.
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

          export default ProhanceDashboard;
