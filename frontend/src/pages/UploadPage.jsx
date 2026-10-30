import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import Header from '../layout/Header';
import { loanService } from '../services/loanService';
import { notify } from '../utils/toast';
import { UploadSkeleton } from '../components/SkeletonLoader';
import { exportToExcel } from '../utils/excelExport';
import { ValidationProgressModal } from '../components/ValidationProgressModal';
import { ApiIngestionCard } from '../components/ApiIngestionCard';
import { ValidationPreviewModal } from '../components/ValidationPreviewModal';
import { SuperAdminModeModal } from '../components/SuperAdminModeModal';
import { extractLoanId, normalizeAction } from '../utils/loanUtils';
import { useAuth } from '../hooks/useAuth';

const UploadPage = () => {
  const { user } = useAuth();
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Validation Progress Modal State
  const [isProgressModalOpen, setIsProgressModalOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [progressStatus, setProgressStatus] = useState('');
  const [progressError, setProgressError] = useState('');

  // Super Admin Ingestion Mode Selection State
  const [pendingFile, setPendingFile] = useState(null);
  const [isModeModalOpen, setIsModeModalOpen] = useState(false);
  const [selectedSuperAdminMode, setSelectedSuperAdminMode] = useState('pre-underwrite');

  // Ingestion Source Tab: 'file' | 'api'
  const [ingestionTab, setIngestionTab] = useState('file');

  // API Ingestion Form State
  const [apiLoanId, setApiLoanId] = useState('');
  const [apiSellerName, setApiSellerName] = useState('');
  const [apiMode, setApiMode] = useState('pre-underwrite');
  const [apiLoading, setApiLoading] = useState(false);
  const [apiError, setApiError] = useState('');

  // Validation Results State
  const [validationData, setValidationData] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // Timers and In-Flight Request Refs (Issue 1 & Issue 3)
  const progressTimerRef = useRef(null);
  const abortControllerRef = useRef(null);
  const fileInputRef = useRef(null);

  const clearProgressTimer = useCallback(() => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  }, []);

  const cancelInFlightRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    clearProgressTimer();
  }, [clearProgressTimer]);

  // Clean up timers and in-flight requests on unmount
  useEffect(() => {
    return () => {
      clearProgressTimer();
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [clearProgressTimer]);

  const isSuperAdmin = useMemo(() => {
    const r = (user?.role || '').trim().toLowerCase();
    return r === 'super admin' || r === 'super_admin' || r === 'admin';
  }, [user]);

  const defaultRoleMode = useMemo(() => {
    const r = (user?.role || '').trim().toLowerCase();
    if (r.includes('junior')) return 'junior-underwrite';
    return 'pre-underwrite';
  }, [user]);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const isValidFile = (selectedFile) => {
    const ext = selectedFile.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'xlsm'].includes(ext)) {
      const errMsg = 'Only Excel files (.xlsx, .xls, .xlsm) are supported.';
      setError(errMsg);
      notify.error(errMsg);
      return false;
    }
    setError('');
    return true;
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (isValidFile(droppedFile)) {
        if (isSuperAdmin) {
          setPendingFile(droppedFile);
          setSelectedSuperAdminMode('pre-underwrite');
          setIsModeModalOpen(true);
        } else {
          handleUpload(droppedFile, defaultRoleMode);
        }
      }
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (isValidFile(selectedFile)) {
        if (isSuperAdmin) {
          setPendingFile(selectedFile);
          setSelectedSuperAdminMode('pre-underwrite');
          setIsModeModalOpen(true);
        } else {
          handleUpload(selectedFile, defaultRoleMode);
        }
      }
    }
  };

  const handleConfirmModeSelection = () => {
    if (!pendingFile) return;
    const fileToProcess = pendingFile;
    const modeToProcess = selectedSuperAdminMode;
    setIsModeModalOpen(false);
    setPendingFile(null);
    handleUpload(fileToProcess, modeToProcess);
  };

  const handleCancelModeSelection = () => {
    setIsModeModalOpen(false);
    setPendingFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCancelValidation = useCallback(() => {
    cancelInFlightRequest();
    setIsProgressModalOpen(false);
    setProgressError('');
    setUploadProgress(0);
    setProgressStatus('');
    setLoading(false);
    setApiLoading(false);
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    notify.info('Validation cancelled.');
  }, [cancelInFlightRequest]);

  const handleUpload = async (uploadFile, ingestionMode = null) => {
    // Abort any prior request and clear timers
    cancelInFlightRequest();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const { signal } = controller;

    setFile(uploadFile);
    setLoading(true);
    setError('');
    setSuccess('');
    setValidationData(null);
    setIsDirty(false);

    // Open Progress Modal
    setIsProgressModalOpen(true);
    setUploadProgress(5);
    setProgressStatus('Reading loan package file & headers...');
    setProgressError('');

    let progressVal = 5;
    progressTimerRef.current = setInterval(() => {
      progressVal += Math.floor(Math.random() * 8) + 4;
      if (progressVal >= 92) {
        progressVal = 92;
        clearProgressTimer();
      }
      setUploadProgress(progressVal);

      if (progressVal < 25) {
        setProgressStatus('Reading loan package file & headers...');
      } else if (progressVal < 60) {
        setProgressStatus('Checking field data types & enum rules...');
      } else {
        setProgressStatus('Running macro business validation & saving package...');
      }
    }, 150);

    try {
      const activeMode = ingestionMode || defaultRoleMode;
      const data = await loanService.validateFile(uploadFile, activeMode, { signal });
      if (signal.aborted) return;

      const recordsWithIds = (data.records || []).map((rec, idx) => ({
        ...rec,
        _id: rec.id || `rec_${idx}`,
        action: normalizeAction(rec.action),
        remark: rec.remark || ''
      }));

      const packageLoanId = data.loan_id || extractLoanId(recordsWithIds);

      // Immediately save loan package to database upon upload
      const saveRes = await loanService.savePackage(
        data.filename,
        data.summary,
        recordsWithIds,
        packageLoanId,
        data.ingestion_mode || activeMode,
        { signal }
      );
      if (signal.aborted) return;

      const packageId = saveRes.package_id;
      const savedRecords = (saveRes.records && saveRes.records.length > 0)
        ? saveRes.records.map((rec, idx) => ({
          ...rec,
          _id: rec.id || `rec_${idx}`,
          action: normalizeAction(rec.action),
          remark: rec.remark || ''
        }))
        : recordsWithIds;

      clearProgressTimer();
      setUploadProgress(100);
      setProgressStatus('Validation Completed!');

      setValidationData({ ...data, loan_id: packageLoanId, records: savedRecords, packageId });

      setTimeout(() => {
        if (!signal.aborted) {
          setIsProgressModalOpen(false);
          setIsModalOpen(true);
          const msg = `Successfully validated and saved loan package "${data.filename}" to database.`;
          setSuccess(msg);
          notify.success(msg);
        }
      }, 600);
    } catch (err) {
      clearProgressTimer();
      if (err.name === 'AbortError' || signal.aborted) {
        return;
      }
      const errMsg = err.message || 'An error occurred during file validation or saving.';
      setProgressError(errMsg);
      setError(errMsg);
      notify.error(errMsg);
      setFile(null);
    } finally {
      setLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleApiFetch = async (e) => {
    if (e) e.preventDefault();
    const cleanLoanId = (apiLoanId || '').trim();
    const cleanSellerName = (apiSellerName || '').trim();

    if (!cleanLoanId) {
      const errMsg = 'Please enter a valid Loan ID.';
      setApiError(errMsg);
      notify.error(errMsg);
      return;
    }
    if (!cleanSellerName) {
      const errMsg = 'Please enter a valid Seller Name.';
      setApiError(errMsg);
      notify.error(errMsg);
      return;
    }

    // Abort prior request and clear timers
    cancelInFlightRequest();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const { signal } = controller;

    setApiError('');
    setError('');
    setSuccess('');
    setApiLoading(true);
    setValidationData(null);
    setIsDirty(false);

    const activeMode = isSuperAdmin ? apiMode : defaultRoleMode;

    // Progress Modal
    setIsProgressModalOpen(true);
    setUploadProgress(10);
    setProgressStatus('Authenticating with API...');
    setProgressError('');

    let progressVal = 10;
    progressTimerRef.current = setInterval(() => {
      progressVal += Math.floor(Math.random() * 6) + 3;
      if (progressVal >= 90) {
        progressVal = 90;
        clearProgressTimer();
      }
      setUploadProgress(progressVal);

      if (progressVal < 30) {
        setProgressStatus('Authenticating & requesting True Data via API...');
      } else if (progressVal < 65) {
        setProgressStatus('Super matching True Data against Data Dictionary...');
      } else {
        setProgressStatus('Evaluating Condition rules and macro checks...');
      }
    }, 150);

    try {
      const data = await loanService.fetchAndValidateLoan(cleanLoanId, cleanSellerName, activeMode, { signal });
      if (signal.aborted) return;

      const recordsWithIds = (data.records || []).map((rec, idx) => ({
        ...rec,
        _id: rec.id || `rec_${idx}`,
        action: normalizeAction(rec.action),
        remark: rec.remark || ''
      }));

      const packageLoanId = data.loan_id || cleanLoanId;

      const saveRes = await loanService.savePackage(
        data.filename,
        data.summary,
        recordsWithIds,
        packageLoanId,
        data.ingestion_mode || activeMode,
        { signal }
      );
      if (signal.aborted) return;

      const packageId = saveRes.package_id;
      const savedRecords = (saveRes.records && saveRes.records.length > 0)
        ? saveRes.records.map((rec, idx) => ({
          ...rec,
          _id: rec.id || `rec_${idx}`,
          action: normalizeAction(rec.action),
          remark: rec.remark || ''
        }))
        : recordsWithIds;

      clearProgressTimer();
      setUploadProgress(100);
      setProgressStatus('API Validation Completed!');

      setValidationData({ ...data, loan_id: packageLoanId, records: savedRecords, packageId });

      setTimeout(() => {
        if (!signal.aborted) {
          setIsProgressModalOpen(false);
          setIsModalOpen(true);
          const msg = `Successfully fetched, validated and saved API package "${data.filename}" to database.`;
          setSuccess(msg);
          notify.success(msg);
        }
      }, 600);
    } catch (err) {
      clearProgressTimer();
      if (err.name === 'AbortError' || signal.aborted) {
        return;
      }
      setIsProgressModalOpen(false);
      setProgressError('');
      setUploadProgress(0);
      setProgressStatus('');
      const errMsg = err.message || 'Failed to fetch and validate loan via API Ingestion.';
      setApiError(errMsg);
      setError(errMsg);
      notify.error(errMsg);
    } finally {
      setApiLoading(false);
    }
  };

  const handleRecordChange = useCallback((recordToUpdate, field, value) => {
    setValidationData((prev) => {
      if (!prev?.records) return prev;
      const updatedRecords = prev.records.map((rec) => {
        if (rec === recordToUpdate || (rec._id && rec._id === recordToUpdate._id)) {
          return { ...rec, [field]: value };
        }
        return rec;
      });
      return { ...prev, records: updatedRecords };
    });
    setIsDirty(true);
  }, []);

  const handleSave = async () => {
    if (!validationData || !validationData.packageId) return;
    setSaveLoading(true);

    try {
      await loanService.updatePackageRecords(
        validationData.packageId,
        validationData.records
      );
      const msg = 'Action and remark updates saved successfully!';
      notify.success(msg);
      setIsDirty(false);
    } catch (err) {
      const errMsg = err.message || 'Failed to save changes to package records.';
      notify.error(errMsg);
    } finally {
      setSaveLoading(false);
    }
  };

  const handleDiscard = () => {
    setIsModalOpen(false);
    setValidationData(null);
    setFile(null);
    setIsDirty(false);
  };

  const handleDownloadExcel = () => {
    try {
      const fn = validationData?.filename || file?.name || 'Validation_Report';
      const modalLoanId = extractLoanId(validationData?.records, validationData?.loan_id);
      exportToExcel({
        filename: fn,
        records: validationData?.records || [],
        summary: validationData?.summary || {},
        reportSuffix: '_Validation_Report',
        loanId: modalLoanId,
        username: user?.username,
        email: user?.email
      });
      notify.success('Excel validation report downloaded successfully!');
    } catch (err) {
      console.error('Failed to download excel:', err);
      notify.error('Failed to export Excel validation report.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col pt-[60px]">
      <Header />

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-200">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Ingest Loan Packages
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Upload loan packages via spreadsheet or fetch directly via API Ingestion for rule validation.
            </p>
          </div>
        </div>

        {/* Global Feedback Banners */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-3">
            <svg className="w-5 h-5 text-red-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1 font-medium">{error}</div>
            <button
              type="button"
              onClick={() => setError('')}
              className="text-red-500 hover:text-red-700 cursor-pointer"
              aria-label="Dismiss error"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-3">
            <svg className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <div className="flex-1 font-medium">{success}</div>
            <button
              type="button"
              onClick={() => setSuccess('')}
              className="text-emerald-500 hover:text-emerald-700 cursor-pointer"
              aria-label="Dismiss success message"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Ingestion Source Switcher Tabs */}
        <div className="flex items-center gap-2 mb-6">
          <div className="inline-flex p-1 bg-slate-100 rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => {
                setIngestionTab('file');
                setApiError('');
                setError('');
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs sm:text-sm font-medium transition-all cursor-pointer ${
                ingestionTab === 'file'
                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <span>Direct File Upload</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIngestionTab('api');
                setApiError('');
                setError('');
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs sm:text-sm font-medium transition-all cursor-pointer ${
                ingestionTab === 'api'
                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span>Truedata via API</span>
            </button>
          </div>
        </div>

        {/* Option 1: File Upload Dropzone (Issue 6 resolved: non-nested interactive control) */}
        {ingestionTab === 'file' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 sm:p-8">
            <div
              role="button"
              tabIndex={0}
              aria-label="Upload loan package Excel file"
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              className={`relative border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#24A1DD] ${
                dragActive
                  ? 'border-[#24A1DD] bg-[#24A1DD]/5'
                  : 'border-slate-200 hover:border-slate-300 bg-slate-50/50 hover:bg-slate-50'
              }`}
            >
              <input
                type="file"
                accept=".xlsx, .xls, .xlsm"
                className="hidden"
                ref={fileInputRef}
                onChange={handleFileSelect}
                disabled={loading}
              />

              <div className="max-w-md mx-auto flex flex-col items-center justify-center space-y-4">
                {loading ? (
                  <UploadSkeleton />
                ) : (
                  <>
                    <div className="w-12 h-12 bg-white border border-slate-200 rounded-lg flex items-center justify-center text-slate-500 shadow-2xs">
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>

                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-slate-800">
                        {file ? file.name : 'Choose an Excel package or drag and drop'}
                      </p>
                      <p className="text-xs text-slate-500">
                        Supports Microsoft Excel workbooks (.xlsx, .xls, .xlsm)
                      </p>
                    </div>

                    <span className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg shadow-2xs transition-all pointer-events-none inline-block select-none">
                      Browse File
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Option 2: Third-Party API Call (Decomposed component) */}
        {ingestionTab === 'api' && (
          <ApiIngestionCard
            apiLoanId={apiLoanId}
            setApiLoanId={setApiLoanId}
            apiSellerName={apiSellerName}
            setApiSellerName={setApiSellerName}
            apiMode={apiMode}
            setApiMode={setApiMode}
            isSuperAdmin={isSuperAdmin}
            apiLoading={apiLoading}
            loading={loading}
            apiError={apiError}
            setApiError={setApiError}
            onSubmit={handleApiFetch}
          />
        )}
      </main>

      {/* Validation Results Full-Screen Modal (Decomposed component) */}
      <ValidationPreviewModal
        isOpen={isModalOpen}
        validationData={validationData}
        onClose={handleDiscard}
        onSave={handleSave}
        onRecordChange={handleRecordChange}
        saveLoading={saveLoading}
        isDirty={isDirty}
        user={user}
        onDownloadExcel={handleDownloadExcel}
      />

      {/* 100% Validation Progress Loader Modal */}
      <ValidationProgressModal
        isOpen={isProgressModalOpen}
        fileName={ingestionTab === 'api' ? (apiLoanId ? `Loan ID: ${apiLoanId}` : 'API Ingestion') : file?.name}
        fileSize={ingestionTab === 'api' ? null : file?.size}
        title={ingestionTab === 'api' ? 'API Ingestion Validation' : undefined}
        progress={uploadProgress}
        status={progressStatus}
        error={progressError}
        onClose={handleCancelValidation}
        onCancel={handleCancelValidation}
      />

      {/* Super Admin Ingestion Mode Selection Modal (Decomposed component) */}
      <SuperAdminModeModal
        isOpen={isModeModalOpen}
        pendingFile={pendingFile}
        selectedMode={selectedSuperAdminMode}
        setSelectedMode={setSelectedSuperAdminMode}
        onConfirm={handleConfirmModeSelection}
        onCancel={handleCancelModeSelection}
      />
    </div>
  );
};

export default UploadPage;
