import React, { useState, useRef, useMemo, useEffect } from 'react';
import Header from '../layout/Header';
import { loanService } from '../services/loanService';
import { DataTable } from '../components/DataTable';
import { notify } from '../utils/toast';
import { UploadSkeleton } from '../components/SkeletonLoader';
import { exportToExcel } from '../utils/excelExport';
import { ValidationProgressModal } from '../components/ValidationProgressModal';
import { ManageColumnsModal } from '../components/ManageColumnsModal';
import Tooltip from '../components/Tooltip';
import { extractLoanId } from '../utils/loanUtils';
import { userPreferencesService } from '../services/userPreferencesService';

const UploadPage = () => {

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

  // Validation Results State
  const [validationData, setValidationData] = useState(null); // { filename, summary, records, packageId }
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeSheet, setActiveSheet] = useState('results'); // 'results' or 'summary'
  const [saveLoading, setSaveLoading] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const modalLoanId = useMemo(() => {
    if (!validationData) return '';
    return extractLoanId(validationData.records, validationData.loan_id);
  }, [validationData]);
  const [modalSuccess, setModalSuccess] = useState('');
  const [modalError, setModalError] = useState('');

  // Table filter
  const [showAll, setShowAll] = useState(false);

  // Default columns shown in table
  const DEFAULT_SELECTED_COLUMNS = [
    'data_field',
    'data_label',
    'true_data',
    'final_result',
    'final_remarks',
    'action',
    'remark'
  ];

  // Manage Columns Modal State
  const [showManageColumnsModal, setShowManageColumnsModal] = useState(false);
  const [selectedColumnKeys, setSelectedColumnKeys] = useState(() => {
    try {
      const saved = localStorage.getItem('validation_preview_selected_columns_v2');
      return saved ? JSON.parse(saved) : DEFAULT_SELECTED_COLUMNS;
    } catch (e) {
      return DEFAULT_SELECTED_COLUMNS;
    }
  });

  // Load column preferences from database on mount
  useEffect(() => {
    userPreferencesService.getColumnPreferences('validation_preview').then((cols) => {
      if (cols && Array.isArray(cols) && cols.length > 0) {
        setSelectedColumnKeys(cols);
      }
    });
  }, []);

  useEffect(() => {
    if (selectedColumnKeys && selectedColumnKeys.length > 0) {
      localStorage.setItem('validation_preview_selected_columns_v2', JSON.stringify(selectedColumnKeys));
    }
  }, [selectedColumnKeys]);


  const fileInputRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (isValidFile(droppedFile)) {
        handleUpload(droppedFile);
      }
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (isValidFile(selectedFile)) {
        handleUpload(selectedFile);
      }
    }
  };

  const isValidFile = (file) => {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'xlsm'].includes(ext)) {
      const errMsg = 'Only Excel files (.xlsx, .xls, .xlsm) are supported.';
      setError(errMsg);
      notify.error(errMsg);
      return false;
    }
    setError('');
    return true;
  };

  const handleUpload = async (uploadFile) => {
    setFile(uploadFile);
    setLoading(true);
    setError('');
    setSuccess('');
    setValidationData(null);
    setIsDirty(false);
    setModalSuccess('');
    setModalError('');

    // Open 100% Progress Modal
    setIsProgressModalOpen(true);
    setUploadProgress(5);
    setProgressStatus('Reading loan package file & headers...');
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
        setProgressStatus('Reading loan package file & headers...');
      } else if (progressVal < 60) {
        setProgressStatus('Checking field data types & enum rules...');
      } else {
        setProgressStatus('Running macro business validation & saving package...');
      }
    }, 150);

    try {
      const data = await loanService.validateFile(uploadFile);
      const recordsWithIds = (data.records || []).map((rec, idx) => ({
        ...rec,
        _id: rec.id || `rec_${idx}`,
        action: rec.action || '',
        remark: rec.remark || ''
      }));

      const packageLoanId = data.loan_id || extractLoanId(recordsWithIds);

      // Immediately save loan package to database upon upload
      const saveRes = await loanService.savePackage(
        data.filename,
        data.summary,
        recordsWithIds,
        packageLoanId
      );

      const packageId = saveRes.package_id;
      const savedRecords = (saveRes.records && saveRes.records.length > 0)
        ? saveRes.records.map((rec, idx) => ({
          ...rec,
          _id: rec.id || `rec_${idx}`,
          action: rec.action || '',
          remark: rec.remark || ''
        }))
        : recordsWithIds;

      clearInterval(progressTimer);
      setUploadProgress(100);
      setProgressStatus('Validation Completed!');

      setValidationData({ ...data, loan_id: packageLoanId, records: savedRecords, packageId });

      // Allow user to visually see 100% completed status bar before transitioning to preview modal
      setTimeout(() => {
        setIsProgressModalOpen(false);
        setIsModalOpen(true);
        setActiveSheet('results'); // Reset to first tab
        setShowAll(false);
        const msg = `Successfully validated and saved loan package "${data.filename}" to database.`;
        setSuccess(msg);
        notify.success(msg);
      }, 600);
    } catch (err) {
      clearInterval(progressTimer);
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

  const handleSave = async () => {
    if (!validationData || !validationData.packageId) return;
    setSaveLoading(true);
    setModalError('');
    setModalSuccess('');

    try {
      await loanService.updatePackageRecords(
        validationData.packageId,
        validationData.records
      );
      const msg = 'Action and remark updates saved successfully!';
      setModalSuccess(msg);
      notify.success(msg);
      setIsDirty(false);
      setTimeout(() => setModalSuccess(''), 4000);
    } catch (err) {
      const errMsg = err.message || 'Failed to save changes to package records.';
      setModalError(errMsg);
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
    setModalSuccess('');
    setModalError('');
  };

  const handleDownloadExcel = () => {
    try {
      const fn = validationData?.filename || 'Validation_Report';
      exportToExcel({
        filename: fn,
        records: validationData?.records || [],
        summary: validationData?.summary || {},
        reportSuffix: '_Validation_Report'
      });
      notify.success('Excel validation report downloaded successfully!');
    } catch (err) {
      console.error('Failed to download excel:', err);
      notify.error('Failed to export Excel validation report.');
    }
  };

  // Helper: Status Badge
  const getStatusBadge = (status, wrap = false) => {
    if (!status) return <span className="text-slate-400 whitespace-nowrap">-</span>;
    const s = String(status);
    const textStyle = wrap
      ? "whitespace-normal break-words max-w-xs inline-block text-left leading-normal font-semibold text-xs"
      : "whitespace-nowrap inline-flex items-center font-semibold text-xs";

    if (s === 'TRUE' || s === 'Matched' || s === 'Valid' || s.startsWith('OK')) {
      return <span className={`text-green-700 ${textStyle}`}>{s}</span>;
    }
    if (s === 'FALSE' || s === 'Unmatched' || s.startsWith('Invalid') || s.startsWith('FLAGGED')) {
      return <span className={`text-red-700 ${textStyle}`}>{s}</span>;
    }
    if (s.startsWith('TRUE -') || s.includes('variance') || s.includes('coerced') || s.includes('Review Required') || s.includes('partial')) {
      return <span className={`text-amber-700 ${textStyle}`}>{s}</span>;
    }
    if (s.includes('Not Automated')) {
      return <span className={`text-purple-700 ${textStyle}`}>{s}</span>;
    }
    return <span className={`text-slate-600 ${textStyle}`}>{s}</span>;
  };

  const handleRecordChange = (recordToUpdate, field, value) => {
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
  };

  const validationRecordsFiltered = useMemo(() => {
    if (!validationData?.records) return [];
    if (showAll) {
      return validationData.records;
    }
    return validationData.records.filter(r => 
      (r.final_result && (r.final_result.startsWith('Invalid') || r.final_result.includes('Review Required'))) ||
      (r.result && r.result.startsWith('Invalid'))
    );
  }, [validationData?.records, showAll]);

  // Dynamic columns generation based on ingested Excel headers and validation output
  const allAvailableColumns = useMemo(() => {
    if (!validationData?.records || validationData.records.length === 0) {
      return [];
    }

    const firstRec = validationData.records[0];
    const hasLoanId = (Array.isArray(validationData.headers) && (validationData.headers.includes('Loan ID') || validationData.headers.includes('loan_id'))) ||
      validationData.records.some(r => (r.loan_id != null && String(r.loan_id).trim() !== '') || (r.raw_data && ('Loan ID' in r.raw_data || 'loan_id' in r.raw_data)));
    let excelCols = [];

    if (Array.isArray(validationData.headers) && validationData.headers.length > 0) {
      excelCols = [...validationData.headers];
    } else if (firstRec.raw_data && typeof firstRec.raw_data === 'object') {
      excelCols = Object.keys(firstRec.raw_data);
    } else {
      excelCols = ['data_field', 'data_label', 'true_data'];
      if (hasLoanId) {
        excelCols.splice(1, 0, 'loan_id');
      }
    }

    const baseColumnsMap = {
      'data_field': {
        header: 'Data Field',
        accessor: 'data_field',
        sortable: true,
        headerClassName: 'sticky top-0 left-0 z-40 bg-slate-50 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]',
        cellClassName: 'sticky left-0 z-10 bg-white group-hover:bg-slate-50 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]',
        render: (r) => <span className="font-semibold text-slate-900">{r.data_field}</span>,
        category: 'Excel Column'
      },
      'loan_id': {
        header: 'Loan ID',
        accessor: 'loan_id',
        sortable: true,
        render: (r) => <span className="whitespace-nowrap font-medium text-slate-600">{r.loan_id || '-'}</span>,
        category: 'Excel Column'
      },
      'data_label': {
        header: 'Data Label',
        accessor: 'data_label',
        sortable: true,
        render: (r) => <span className="font-mono text-slate-500">{r.data_label}</span>,
        category: 'Excel Column'
      },
      'true_data': {
        header: 'True Data',
        accessor: 'true_data',
        sortable: true,
        render: (r) => <span className="font-medium text-slate-900 break-words whitespace-pre-wrap max-w-xs block leading-snug">{r.true_data || ''}</span>,
        category: 'Excel Column'
      }
    };

    const cols = [];

    // 1. Ingested Excel Columns
    excelCols.forEach((colName) => {
      let accKey = colName;
      if (colName === 'Data Field') accKey = 'data_field';
      else if (colName === 'Loan ID') accKey = 'loan_id';
      else if (colName === 'Data Label') accKey = 'data_label';
      else if (colName === 'True Data') accKey = 'true_data';

      if (baseColumnsMap[accKey]) {
        if (!cols.some(c => c.accessor === accKey)) {
          cols.push(baseColumnsMap[accKey]);
        }
      } else {
        if (!cols.some(c => c.accessor === colName)) {
          cols.push({
            header: colName,
            accessor: colName,
            sortable: true,
            render: (r) => (
              <span className="text-slate-700 break-words whitespace-pre-wrap max-w-xs block leading-snug">
                {r.raw_data?.[colName] ?? r[colName] ?? ''}
              </span>
            ),
            category: 'Excel Column'
          });
        }
      }
    });

    // Make sure core standard fields are present if missing
    const mandatoryFields = ['data_field', 'data_label', 'true_data'];
    if (hasLoanId) {
      mandatoryFields.splice(1, 0, 'loan_id');
    }
    mandatoryFields.forEach(k => {
      if (!cols.some(c => c.accessor === k)) {
        cols.unshift(baseColumnsMap[k]);
      }
    });

    // 2. Validation Process Results Columns (lm_helper)
    cols.push(
      {
        header: 'Dict Match',
        accessor: 'dictionary_match_status',
        sortable: true,
        render: (r) => getStatusBadge(r.dictionary_match_status),
        category: 'Validation'
      },
      {
        header: 'Type Check',
        accessor: 'data_type_validation',
        sortable: true,
        render: (r) => getStatusBadge(r.data_type_validation),
        category: 'Validation'
      },
      {
        header: 'Type Remarks',
        accessor: 'data_type_remarks',
        sortable: true,
        render: (r) => <span className="text-slate-500 break-words whitespace-pre-wrap max-w-xs block leading-snug">{r.data_type_remarks || ''}</span>,
        category: 'Validation'
      },
      {
        header: 'Numeric Format',
        accessor: 'numeric_format_flag',
        sortable: true,
        render: (r) => getStatusBadge(r.numeric_format_flag),
        category: 'Validation'
      },
      {
        header: 'Enum Check',
        accessor: 'enum_validation',
        sortable: true,
        headerClassName: 'whitespace-nowrap',
        cellClassName: 'whitespace-nowrap',
        render: (r) => <span className="whitespace-nowrap">{getStatusBadge(r.enum_validation)}</span>,
        category: 'Validation'
      },
      {
        header: 'Enum Remarks',
        accessor: 'enum_remarks',
        sortable: true,
        render: (r) => <span className="text-slate-500 break-words whitespace-pre-wrap max-w-xs block leading-snug">{r.enum_remarks || ''}</span>,
        category: 'Validation'
      },
      {
        header: 'Macro Check',
        accessor: 'macro_validation_result',
        sortable: true,
        render: (r) => getStatusBadge(r.macro_validation_result),
        category: 'Validation'
      },
      {
        header: 'Combined Result',
        accessor: 'result',
        sortable: true,
        render: (r) => <span className="break-words whitespace-pre-wrap max-w-xs block leading-snug">{getStatusBadge(r.result, true)}</span>,
        category: 'Validation'
      },
      {
        header: 'Condition Check',
        accessor: 'condition_validation',
        sortable: true,
        render: (r) => getStatusBadge(r.condition_validation),
        category: 'Validation'
      },
      {
        header: 'Condition Remarks',
        accessor: 'condition_remarks',
        sortable: true,
        render: (r) => <span className="text-slate-500 break-words whitespace-pre-wrap max-w-xs block leading-snug">{r.condition_remarks || ''}</span>,
        category: 'Validation'
      },
      {
        header: 'Final Result',
        accessor: 'final_result',
        sortable: true,
        headerClassName: 'whitespace-nowrap font-bold text-slate-800',
        render: (r) => <span className="break-words whitespace-pre-wrap max-w-xs block leading-snug font-bold">{getStatusBadge(r.final_result || r.result, true)}</span>,
        category: 'Validation'
      },
      {
        header: 'Final Remarks',
        accessor: 'final_remarks',
        sortable: true,
        render: (r) => <span className="text-slate-700 break-words whitespace-pre-wrap max-w-sm block leading-snug font-medium">{r.final_remarks || ''}</span>,
        category: 'Validation'
      },
      {
        header: 'Action',
        accessor: 'action',
        sortable: true,
        headerClassName: 'whitespace-nowrap min-w-[140px]',
        render: (r) => (
          <select
            value={r.action || ''}
            onChange={(e) => handleRecordChange(r, 'action', e.target.value)}
            className={`w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-semibold focus:ring-2 focus:ring-[#24A1DD] focus:outline-none transition-colors cursor-pointer ${r.action === 'Corrected' ? 'text-emerald-700' :
              r.action === 'Incorrect Status' ? 'text-rose-700' :
                r.action === 'Not Applicable' ? 'text-slate-600' :
                  r.action === 'Need Review' ? 'text-amber-700' :
                    (r.action === 'Review completed' || r.action === 'Review Completed') ? 'text-teal-700' :
                      r.action === 'Out of Scope' ? 'text-purple-700' :
                        r.action === 'Others' ? 'text-blue-700' :
                          'text-slate-700'
              }`}
          >
            <option value="">-- Select --</option>
            <option value="Corrected">Corrected</option>
            <option value="Incorrect Status">Incorrect Status</option>
            <option value="Not Applicable">Not Applicable</option>
            <option value="Need Review">Need Review</option>
            <option value="Review completed">Review completed</option>
            {r.action === 'Review Completed' && <option value="Review Completed">Review Completed</option>}
            <option value="Out of Scope">Out of Scope</option>
            <option value="Others">Others</option>
          </select>
        ),
        category: 'Audit'
      },
      {
        header: 'User Remark',
        accessor: 'remark',
        sortable: true,
        headerClassName: 'whitespace-nowrap min-w-[220px]',
        render: (r) => (
          <textarea
            rows={2}
            value={r.remark || ''}
            onChange={(e) => handleRecordChange(r, 'remark', e.target.value)}
            placeholder="Enter remark..."
            className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-[#24A1DD] focus:border-[#24A1DD] focus:outline-none transition-all resize-y min-h-[42px]"
          />
        ),
        category: 'Audit'
      }
    );

    return cols;
  }, [validationData]);

  const visibleValidationColumns = useMemo(() => {
    if (!allAvailableColumns || allAvailableColumns.length === 0) return [];
    const activeKeys = (selectedColumnKeys && selectedColumnKeys.length > 0)
      ? selectedColumnKeys
      : DEFAULT_SELECTED_COLUMNS;
    return allAvailableColumns.filter(c => activeKeys.includes(c.accessor));
  }, [allAvailableColumns, selectedColumnKeys]);

  const customModalHeader = (
    <div className="flex items-center gap-3">
      <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 bg-white border border-slate-200 px-3.5 py-1.5 rounded-xl hover:bg-slate-50 transition-all select-none shadow-2xs">
        <input
          type="checkbox"
          className="rounded border-slate-300 text-[#24A1DD] focus:ring-[#24A1DD] h-4 w-4 cursor-pointer accent-[#24A1DD]"
          checked={showAll}
          onChange={(e) => setShowAll(e.target.checked)}
        />
        <span>Show All</span>
      </label>
      <Tooltip text="Manage Columns" position="bottom">
        <button
          type="button"
          onClick={() => setShowManageColumnsModal(true)}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all shadow-2xs cursor-pointer select-none"
          aria-label="Manage Columns"
        >
          <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2m0 10V7m6 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
          </svg>
          <span className="px-1.5 py-0.5 text-[10px] font-bold bg-[#24A1DD]/10 text-[#24A1DD] rounded-full border border-[#24A1DD]/20">
            {visibleValidationColumns.length}/{allAvailableColumns.length}
          </span>
        </button>
      </Tooltip>
    </div>
  );

  const condSummary = useMemo(() => {
    if (!validationData) return null;
    const s = validationData.summary || {};
    const recs = validationData.records || [];
    const getCondVal = (rec) => {
      return rec.condition_validation ||
        rec['Condition Validation'] ||
        rec['Condition Check'] ||
        (rec.raw_data && (rec.raw_data['Condition Validation'] || rec.raw_data['condition_validation'])) ||
        '';
    };
    const condValid = s["Cond Valid"] ?? recs.filter(r => getCondVal(r) === 'Valid').length;
    const condValidPartial = s["Cond Valid - Partial"] ?? recs.filter(r => getCondVal(r) === 'Valid - partial').length;
    const condInvalid = s["Cond Invalid"] ?? recs.filter(r => getCondVal(r) === 'Invalid').length;
    const condNotAutomated = s["Cond Not Automated"] ?? recs.filter(r => getCondVal(r) === 'Not Automated').length;
    const condNoRule = s["Cond N/A - No Rule"] ?? recs.filter(r => getCondVal(r) === 'N/A - no condition rule').length;
    const condNotMet = s["Cond N/A - Condition Not Met"] ?? recs.filter(r => getCondVal(r) === 'N/A - condition not met').length;
    const condBlank = s["Cond N/A - Blank Value"] ?? recs.filter(r => getCondVal(r) === 'N/A - blank value').length;
    const condInfo = s["Cond N/A - Informational"] ?? recs.filter(r => getCondVal(r) === 'N/A - informational').length;
    const condRulesApplied = s["Cond Rules Applied"] ?? (condValid + condValidPartial + condInvalid + condNotAutomated);
    const condTotal = s["Cond Total (reconciles)"] ?? (s["Total Fields"] || recs.length);
    const condKnown = condValid + condValidPartial + condInvalid + condNotAutomated + condNoRule + condNotMet + condBlank + condInfo;
    const condUnclassified = s["Cond Unclassified"] ?? (condTotal - condKnown > 0 ? condTotal - condKnown : 0);

    return {
      condValid,
      condValidPartial,
      condInvalid,
      condNotAutomated,
      condNoRule,
      condNotMet,
      condBlank,
      condInfo,
      condRulesApplied,
      condTotal,
      condUnclassified
    };
  }, [validationData]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col pt-[60px]">
      <Header />

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-12">
        {/* Header Section */}
        <div className="text-center space-y-4 mb-10">
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            Validate Loan Packages
          </h1>
          <p className="max-w-2xl mx-auto text-slate-500 text-sm">
            Upload your loan package Excel workbook. The system will perform detailed field-level type checking, enum verification, and cross-field macro business rules against the data dictionary.
          </p>
        </div>

        {/* Drag & Drop Area */}
        <div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-3xl p-12 text-center cursor-pointer transition-all duration-300 ${dragActive
            ? 'border-[#24A1DD] bg-[#24A1DD]/5 scale-[1.01]'
            : 'border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-50/50'
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

          <div className="max-w-md mx-auto flex flex-col items-center justify-center space-y-6">
            {loading ? (
              <UploadSkeleton />
            ) : (
              <>
                <div className="w-20 h-20 bg-[#24A1DD]/10 border border-[#24A1DD]/30 rounded-2xl flex items-center justify-center text-[#24A1DD] shadow-inner transition-transform duration-300 group-hover:scale-105">
                  <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>

                <div className="space-y-2">
                  <h3 className="text-lg font-bold text-slate-800">
                    {file ? file.name : 'Select or drag your loan package'}
                  </h3>
                  <p className="text-sm text-slate-500">
                    Supports Microsoft Excel formats (.xlsx, .xls, .xlsm)
                  </p>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                  className="px-6 py-3 bg-[#24A1DD] hover:bg-[#1e88bb] text-white font-semibold rounded-2xl shadow-lg shadow-[#24A1DD]/20 transition-all active:scale-95"
                >
                  Browse File
                </button>
              </>
            )}
          </div>
        </div>
      </main>

      {/* Validation Results Full-Screen Modal */}
      {isModalOpen && validationData && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-3">
          <div className="bg-white rounded-2xl shadow-2xl w-[98vw] max-w-[98vw] h-[94vh] flex flex-col overflow-hidden animate-fade-in border border-slate-200">
            {/* Modal Header */}
            <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center shadow-2xs">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center flex-wrap gap-2">
                    Validation Preview: <span className="font-semibold text-slate-700">{validationData.filename}</span>
                    {modalLoanId && (
                      <span className="font-semibold text-slate-600">
                        (Loan Id - {modalLoanId})
                      </span>
                    )}
                  </h2>
                  {validationData.records && (
                    <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                      <span>Total: <strong>{validationData.records.length}</strong> fields</span>
                      <span>•</span>
                      <span className="text-slate-600 font-medium">
                        Showing {validationRecordsFiltered.length} {showAll ? '(All)' : '(Invalid only)'}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 sm:gap-3">
                <Tooltip text="Download Excel Report" position="bottom">
                  <button
                    type="button"
                    onClick={handleDownloadExcel}
                    disabled={saveLoading || !validationData}
                    className="inline-flex items-center justify-center p-2 sm:p-2.5 border border-slate-200 bg-white hover:bg-emerald-50 hover:border-emerald-300 text-emerald-600 hover:text-emerald-700 disabled:opacity-50 font-semibold rounded-xl text-xs sm:text-sm transition-all shadow-2xs hover:shadow-xs cursor-pointer select-none"
                    aria-label="Download Excel Report"
                  >
                    <svg className="w-4 h-4 sm:w-4.5 sm:h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </button>
                </Tooltip>
                <button
                  type="button"
                  onClick={handleDiscard}
                  disabled={saveLoading}
                  className="px-3.5 py-1.5 border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold rounded-xl text-xs sm:text-sm transition-all cursor-pointer"
                >
                  Close
                </button>
                {isDirty && (
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saveLoading}
                    className="px-4 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-green-500/70 text-white font-semibold rounded-xl text-xs sm:text-sm shadow-sm hover:shadow-md flex items-center gap-2 transition-all animate-fade-in cursor-pointer"
                  >
                    {saveLoading && (
                      <svg className="animate-spin -ml-1 mr-1 h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    )}
                    {saveLoading ? 'Saving...' : 'Save'}
                  </button>
                )}
              </div>
            </div>

            {/* Modal Body (Scrollable Sheet Content) */}
            <div className="flex-1 bg-slate-100 flex flex-col min-h-0 overflow-hidden">
              {activeSheet === 'results' ? (
                /* SHEET 1: RESULTS TABLE */
                <div className="flex-1 flex flex-col bg-white overflow-hidden p-3 pb-2 min-h-0">
                  <DataTable
                    data={validationRecordsFiltered}
                    columns={visibleValidationColumns}
                    searchable={true}
                    pagination={true}
                    itemsPerPageOptions={[10, 25, 50, 100]}
                    defaultItemsPerPage={25}
                    emptyMessage="No matching fields found."
                    customHeader={customModalHeader}
                    density="compact"
                    maxHeight="100%"
                    className="flex flex-col min-h-0 h-full flex-1"
                  />
                </div>
              ) : (
                /* SHEET 2: SUMMARY CARDS */
                <div className="flex-1 bg-slate-50 p-6 sm:p-8 overflow-y-auto smooth-scroll custom-scrollbar">
                  <div className="max-w-5xl mx-auto space-y-8 animate-fade-in">
                    {/* General Summary Card */}
                    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
                      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-6">General Statistics</h3>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-center">
                          <div className="text-3xl font-extrabold text-slate-900">{validationData.summary["Total Fields"]}</div>
                          <div className="text-xs text-slate-500 mt-1 font-semibold">Total Fields</div>
                        </div>
                        <div className="bg-green-50/50 border border-green-100 rounded-2xl p-4 text-center">
                          <div className="text-3xl font-extrabold text-green-700">{validationData.summary["Final Valid"]}</div>
                          <div className="text-xs text-green-600 mt-1 font-semibold">Final Valid</div>
                        </div>
                        <div className="bg-red-50/50 border border-red-100 rounded-2xl p-4 text-center">
                          <div className="text-3xl font-extrabold text-red-700">{validationData.summary["Final Invalid"]}</div>
                          <div className="text-xs text-red-600 mt-1 font-semibold">Final Invalid</div>
                        </div>
                        <div className="bg-slate-100/70 border border-slate-200/50 rounded-2xl p-4 text-center">
                          <div className="text-3xl font-extrabold text-slate-500">{validationData.summary["Final Blank"]}</div>
                          <div className="text-xs text-slate-500 mt-1 font-semibold">Final Blank</div>
                        </div>
                      </div>
                    </div>

                    {/* Detailed Analysis Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      {/* Dictionary Matches */}
                      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-150 pb-2">Dictionary Match Checks ({validationData.summary["Total Fields"] ?? 0} Total)</h4>
                        <div className="space-y-3">
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-slate-600 font-semibold">Matched Fields</span>
                            <span className="font-bold text-green-600">{validationData.summary["Matched"]}</span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-2">
                            <div className="bg-green-500 h-2 rounded-full transition-all duration-500" style={{ width: `${(validationData.summary["Matched"] / validationData.summary["Total Fields"]) * 100}%` }}></div>
                          </div>
                          <div className="flex justify-between items-center text-sm pt-2">
                            <span className="text-slate-600 font-semibold">Unmatched Fields</span>
                            <span className="font-bold text-red-600">{validationData.summary["Unmatched"]}</span>
                          </div>
                        </div>
                      </div>

                      {/* Data Type Checks */}
                      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-150 pb-2">Data Type Validation ({((validationData.summary["Type Pass"] ?? 0) + (validationData.summary["Type Fail"] ?? 0) + (validationData.summary["Blank Values"] ?? 0))} Total)</h4>
                        <div className="space-y-3">
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-slate-600 font-semibold">Type Check Pass</span>
                            <span className="font-bold text-green-600">{validationData.summary["Type Pass"]}</span>
                          </div>
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-slate-600 font-semibold">Type Check Fail</span>
                            <span className="font-bold text-red-600">{validationData.summary["Type Fail"]}</span>
                          </div>
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-slate-600 font-semibold">Blank Values (N/A)</span>
                            <span className="font-bold text-slate-500">{validationData.summary["Blank Values"]}</span>
                          </div>
                        </div>
                      </div>

                      {/* Enum Checks */}
                      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-150 pb-2">Enumeration Checks ({validationData.summary["Total Enum"]} Total)</h4>
                        <div className="space-y-2">
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-slate-600 font-semibold">Enum Valid</span>
                            <span className="font-bold text-green-600">{validationData.summary["Enum Pass"]}</span>
                          </div>
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-slate-600 font-semibold">Format Variance (Warnings)</span>
                            <span className="font-bold text-amber-600">{validationData.summary["Enum Format Variance"]}</span>
                          </div>
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-slate-600 font-semibold">Enum Fail</span>
                            <span className="font-bold text-red-600">{validationData.summary["Enum Fail"]}</span>
                          </div>
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-slate-600 font-semibold">Enum No List</span>
                            <span className="font-bold text-slate-500">{validationData.summary["Enum No List"] ?? 0}</span>
                          </div>
                        </div>
                      </div>

                      {/* Business Rules (Macro Rules) */}
                      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-150 pb-2">Business Rule Modules ({validationData.summary["Total Macro"]} Evaluated)</h4>
                        <div className="space-y-3">
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-slate-600 font-semibold">Macro Valid</span>
                            <span className="font-bold text-green-600">{validationData.summary["Macro Valid"]}</span>
                          </div>
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-slate-600 font-semibold">Macro Fail (Invalid Date / Ranges)</span>
                            <span className="font-bold text-red-600">{validationData.summary["Macro Invalid"]}</span>
                          </div>
                        </div>
                      </div>

                      {/* Condition Validation */}
                      {condSummary && (
                        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4 md:col-span-2">
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-150 pb-2">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                              Condition Validation ({condSummary.condRulesApplied} Rules Applied)
                            </h4>
                            <span className="text-xs font-medium text-slate-500">
                              {condSummary.condTotal} Total Fields Evaluated
                            </span>
                          </div>

                          {condSummary.condRulesApplied > 0 && (
                            <div className="space-y-1.5">
                              <div className="flex justify-between text-xs font-semibold text-slate-600">
                                <span>Applied Rules Outcome</span>
                                <span>{condSummary.condValid + condSummary.condValidPartial} / {condSummary.condRulesApplied} Passing</span>
                              </div>
                              <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden flex shadow-inner">
                                <div
                                  className="bg-emerald-500 h-full transition-all duration-500"
                                  style={{ width: `${(condSummary.condValid / condSummary.condRulesApplied) * 100}%` }}
                                  title={`Valid: ${condSummary.condValid}`}
                                />
                                <div
                                  className="bg-teal-500 h-full transition-all duration-500"
                                  style={{ width: `${(condSummary.condValidPartial / condSummary.condRulesApplied) * 100}%` }}
                                  title={`Valid - Partial: ${condSummary.condValidPartial}`}
                                />
                                <div
                                  className="bg-red-500 h-full transition-all duration-500"
                                  style={{ width: `${(condSummary.condInvalid / condSummary.condRulesApplied) * 100}%` }}
                                  title={`Invalid: ${condSummary.condInvalid}`}
                                />
                                <div
                                  className="bg-amber-400 h-full transition-all duration-500"
                                  style={{ width: `${(condSummary.condNotAutomated / condSummary.condRulesApplied) * 100}%` }}
                                  title={`Not Automated: ${condSummary.condNotAutomated}`}
                                />
                              </div>
                            </div>
                          )}

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
                            <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl p-3">
                              <div className="text-xs text-emerald-800 font-semibold">Valid</div>
                              <div className="text-xl font-bold text-emerald-600 mt-0.5">{condSummary.condValid}</div>
                            </div>
                            <div className="bg-teal-50/60 border border-teal-100 rounded-xl p-3">
                              <div className="text-xs text-teal-800 font-semibold">Valid - Partial</div>
                              <div className="text-xl font-bold text-teal-600 mt-0.5">{condSummary.condValidPartial}</div>
                            </div>
                            <div className="bg-red-50/60 border border-red-100 rounded-xl p-3">
                              <div className="text-xs text-red-800 font-semibold">Invalid</div>
                              <div className="text-xl font-bold text-red-600 mt-0.5">{condSummary.condInvalid}</div>
                            </div>
                            <div className="bg-amber-50/60 border border-amber-100 rounded-xl p-3">
                              <div className="text-xs text-amber-800 font-semibold">Not Automated</div>
                              <div className="text-xl font-bold text-amber-600 mt-0.5">{condSummary.condNotAutomated}</div>
                            </div>
                            <div className="bg-slate-50 border border-slate-150 rounded-xl p-3">
                              <div className="text-xs text-slate-600 font-semibold">Condition Not Met</div>
                              <div className="text-xl font-bold text-slate-700 mt-0.5">{condSummary.condNotMet}</div>
                            </div>
                            <div className="bg-slate-50 border border-slate-150 rounded-xl p-3">
                              <div className="text-xs text-slate-600 font-semibold">No Rule</div>
                              <div className="text-xl font-bold text-slate-700 mt-0.5">{condSummary.condNoRule}</div>
                            </div>
                            <div className="bg-slate-50 border border-slate-150 rounded-xl p-3">
                              <div className="text-xs text-slate-600 font-semibold">Blank Value</div>
                              <div className="text-xl font-bold text-slate-700 mt-0.5">{condSummary.condBlank}</div>
                            </div>
                            <div className="bg-slate-50 border border-slate-150 rounded-xl p-3">
                              <div className="text-xs text-slate-600 font-semibold">Informational</div>
                              <div className="text-xl font-bold text-slate-700 mt-0.5">{condSummary.condInfo}</div>
                            </div>
                            {condSummary.condUnclassified > 0 && (
                              <div className="bg-purple-50/60 border border-purple-100 rounded-xl p-3">
                                <div className="text-xs text-purple-800 font-semibold">Unclassified</div>
                                <div className="text-xl font-bold text-purple-600 mt-0.5">{condSummary.condUnclassified}</div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom-docked Excel Worksheet Tab Selector */}
            <div className="h-10 bg-slate-200/90 border-t border-slate-300 flex items-center px-4 flex-shrink-0 select-none backdrop-blur-xs">
              <div className="flex items-center h-full gap-1">
                {/* Excel Result Sheet Tab */}
                <button
                  type="button"
                  onClick={() => setActiveSheet('results')}
                  className={`px-5 h-[34px] flex items-center gap-2 text-xs font-bold transition-all rounded-t-lg cursor-pointer ${activeSheet === 'results'
                    ? 'bg-white text-slate-900 border-t-2 border-t-emerald-600 border-x border-slate-300 shadow-xs'
                    : 'bg-slate-100/70 hover:bg-slate-50 text-slate-600 hover:text-slate-900'
                    }`}
                >
                  <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Result Sheet
                </button>

                {/* Excel Summary Sheet Tab */}
                <button
                  type="button"
                  onClick={() => setActiveSheet('summary')}
                  className={`px-5 h-[34px] flex items-center gap-2 text-xs font-bold transition-all rounded-t-lg cursor-pointer ${activeSheet === 'summary'
                    ? 'bg-white text-slate-900 border-t-2 border-t-emerald-600 border-x border-slate-300 shadow-xs'
                    : 'bg-slate-100/70 hover:bg-slate-50 text-slate-600 hover:text-slate-900'
                    }`}
                >
                  <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  Summary Sheet
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 100% Validation Progress Loader Modal */}
      <ValidationProgressModal
        isOpen={isProgressModalOpen}
        fileName={file?.name}
        fileSize={file?.size}
        progress={uploadProgress}
        status={progressStatus}
        error={progressError}
        onClose={() => setIsProgressModalOpen(false)}
      />

      {/* Manage Columns Modal */}
      <ManageColumnsModal
        isOpen={showManageColumnsModal}
        onClose={() => setShowManageColumnsModal(false)}
        allColumns={allAvailableColumns}
        selectedColumnKeys={(selectedColumnKeys && selectedColumnKeys.length > 0) ? selectedColumnKeys : DEFAULT_SELECTED_COLUMNS}
        onApply={async (newKeys) => {
          setSelectedColumnKeys(newKeys);
          const res = await userPreferencesService.saveColumnPreferences('validation_preview', newKeys);
          if (res) {
            notify.success('Column preferences saved to database successfully!');
          } else {
            notify.warning('Column preferences applied locally, but failed to sync to database.');
          }
        }}
        defaultColumnKeys={DEFAULT_SELECTED_COLUMNS}
      />


    </div>
  );
};

export default UploadPage;
