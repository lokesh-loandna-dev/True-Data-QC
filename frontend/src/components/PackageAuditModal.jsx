import React, { useState, useEffect, useMemo } from 'react';
import { DataTable } from './DataTable';
import { loanService } from '../services/loanService';
import { ModalSkeleton } from './SkeletonLoader';
import { exportToExcel } from '../utils/excelExport';
import { notify } from '../utils/toast';
import { ManageColumnsModal } from './ManageColumnsModal';
import Tooltip from './Tooltip';
import { extractLoanId } from '../utils/loanUtils';
import { userPreferencesService } from '../services/userPreferencesService';

export const PackageAuditModal = ({
  selectedPackageId,
  selectedPackage,
  packageDetails,
  detailsLoading,
  detailsError,
  onClose,
  onRetry,
  onSaveSuccess,
}) => {
  const packageUsername = packageDetails?.package?.uploaded_by ||
    packageDetails?.uploaded_by ||
    selectedPackage?.uploaded_by ||
    '';

  const packageEmail = packageDetails?.package?.uploaded_email ||
    packageDetails?.uploaded_email ||
    selectedPackage?.uploaded_email ||
    '';

  const [activeSheet, setActiveSheet] = useState('results'); // 'results' or 'summary'
  const [showAll, setShowAll] = useState(false);

  const [updateLoading, setUpdateLoading] = useState(false);
  const [updateMessage, setUpdateMessage] = useState('');
  const [updateError, setUpdateError] = useState('');

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

  // Manage Columns State
  const [showManageColumnsModal, setShowManageColumnsModal] = useState(false);
  const [selectedColumnKeys, setSelectedColumnKeys] = useState(() => {
    try {
      const saved = localStorage.getItem('package_audit_selected_columns_v2');
      return saved ? JSON.parse(saved) : DEFAULT_SELECTED_COLUMNS;
    } catch (e) {
      return DEFAULT_SELECTED_COLUMNS;
    }
  });

  // Load preferences from DB on mount
  useEffect(() => {
    userPreferencesService.getColumnPreferences('package_audit').then((cols) => {
      if (cols && Array.isArray(cols) && cols.length > 0) {
        setSelectedColumnKeys(cols);
      }
    });
  }, []);

  useEffect(() => {
    if (selectedColumnKeys && selectedColumnKeys.length > 0) {
      localStorage.setItem('package_audit_selected_columns_v2', JSON.stringify(selectedColumnKeys));
    }
  }, [selectedColumnKeys]);


  // Reset tab and filters when a new package is selected or details change
  useEffect(() => {
    if (selectedPackageId) {
      setActiveSheet('results');
      setShowAll(false);
      setUpdateMessage('');
      setUpdateError('');
    }
  }, [selectedPackageId, packageDetails]);

  const condSummary = useMemo(() => {
    if (!packageDetails) return null;
    const s = packageDetails.summary || {};
    const recs = packageDetails.records || [];
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
  }, [packageDetails]);

  // Helper: Status Badge
  const getStatusBadge = (status, wrap = false) => {
    if (!status) return <span className="text-slate-400 whitespace-nowrap">-</span>;
    const s = String(status);
    const textStyle = wrap
      ? "whitespace-normal break-words max-w-xs inline-block text-left leading-normal font-semibold text-xs"
      : "whitespace-nowrap inline-flex items-center font-semibold text-xs";

    if (s === 'TRUE' || s === 'Matched' || s === 'Valid' || s.startsWith('OK')) {
      return (
        <span className={`text-green-700 ${textStyle}`}>
          {s}
        </span>
      );
    }
    if (s === 'FALSE' || s === 'Unmatched' || s.startsWith('Invalid') || s.startsWith('FLAGGED')) {
      return (
        <span className={`text-red-700 ${textStyle}`}>
          {s}
        </span>
      );
    }
    if (s.startsWith('TRUE -') || s.includes('variance') || s.includes('coerced') || s.includes('Review Required') || s.includes('partial')) {
      return (
        <span className={`text-amber-700 ${textStyle}`}>
          {s}
        </span>
      );
    }
    if (s.includes('Not Automated')) {
      return (
        <span className={`text-purple-700 ${textStyle}`}>
          {s}
        </span>
      );
    }
    return (
      <span className={`text-slate-600 ${textStyle}`}>
        {s}
      </span>
    );
  };

  // Modal Audit Preview Table Records and Columns (Hooks must be called before early return)
  const [localRecords, setLocalRecords] = useState([]);

  useEffect(() => {
    if (packageDetails?.records) {
      setLocalRecords(packageDetails.records.map((r, i) => ({
        ...r,
        _id: r.id || `audit_rec_${i}`,
        action: r.action || '',
        remark: r.remark || ''
      })));
    }
  }, [packageDetails?.records]);

  const loanId = useMemo(() => {
    return extractLoanId(
      (localRecords && localRecords.length > 0) ? localRecords : (packageDetails?.records || []),
      packageDetails?.package?.loan_id || packageDetails?.loan_id
    );
  }, [localRecords, packageDetails]);

  const handleRecordChange = (recordToUpdate, field, value) => {
    setLocalRecords(prev =>
      prev.map(rec => (rec === recordToUpdate || (rec._id && rec._id === recordToUpdate._id)) ? { ...rec, [field]: value } : rec)
    );
  };

  const handleDiscard = () => {
    if (packageDetails?.records) {
      setLocalRecords(packageDetails.records.map((r, i) => ({
        ...r,
        _id: r.id || `audit_rec_${i}`,
        action: r.action || '',
        remark: r.remark || ''
      })));
    }
    setUpdateMessage('Changes discarded. Restored previous record data.');
    setUpdateError('');
    setTimeout(() => setUpdateMessage(''), 4000);
  };

  const handleUpdate = async () => {
    if (!selectedPackageId) return;
    setUpdateLoading(true);
    setUpdateMessage('');
    setUpdateError('');

    try {
      await loanService.updatePackageRecords(selectedPackageId, localRecords);
      setUpdateMessage('Package records successfully updated in database!');
      if (packageDetails) {
        packageDetails.records = localRecords.map(r => ({ ...r }));
      }
      if (typeof onSaveSuccess === 'function') {
        onSaveSuccess();
      }
      setTimeout(() => setUpdateMessage(''), 5000);
    } catch (err) {
      setUpdateError(err.message || 'Failed to update package records.');
    } finally {
      setUpdateLoading(false);
    }
  };

  const handleDownloadExcel = () => {
    try {
      const fn = packageDetails?.package?.filename || 'Package_Audit';
      exportToExcel({
        filename: fn,
        records: localRecords,
        summary: packageDetails?.summary || {},
        reportSuffix: '_Audit_Report',
        loanId: loanId,
        username: packageUsername,
        email: packageEmail
      });
      notify.success('Excel report downloaded successfully!');
    } catch (err) {
      console.error('Failed to download excel:', err);
      notify.error('Failed to export Excel report.');
    }
  };

  const modalRecordsFiltered = useMemo(() => {
    if (!localRecords) return [];
    if (showAll) {
      return localRecords;
    }
    return localRecords.filter(r => 
      (r.final_result && (r.final_result.startsWith('Invalid') || r.final_result.includes('Review Required'))) ||
      (r.result && r.result.startsWith('Invalid'))
    );
  }, [localRecords, showAll]);

  // Dynamic audit columns generation based on package details records
  const allAvailableAuditColumns = useMemo(() => {
    if (!localRecords || localRecords.length === 0) {
      return [];
    }

    const firstRec = localRecords[0];
    const hasLoanId = localRecords.some(r => (r.loan_id != null && String(r.loan_id).trim() !== '') || (r.raw_data && ('Loan ID' in r.raw_data || 'loan_id' in r.raw_data)));
    let excelCols = [];

    if (firstRec.raw_data && typeof firstRec.raw_data === 'object') {
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

    // Make sure standard mandatory fields exist
    const mandatoryFields = ['data_field', 'data_label', 'true_data'];
    if (hasLoanId) {
      mandatoryFields.splice(1, 0, 'loan_id');
    }
    mandatoryFields.forEach(k => {
      if (!cols.some(c => c.accessor === k)) {
        cols.unshift(baseColumnsMap[k]);
      }
    });

    // 2. Package-level info columns (same value for every row in this package)
    cols.push(
      {
        header: 'Loan Id',
        accessor: 'pkg_loan_id',
        sortable: false,
        render: () => (
          <span className="font-mono text-xs font-semibold text-slate-700 whitespace-nowrap">
            {loanId || '-'}
          </span>
        ),
        category: 'Package Info'
      },
      {
        header: 'Username',
        accessor: 'pkg_username',
        sortable: false,
        render: () => (
          <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">
            {packageUsername || '-'}
          </span>
        ),
        category: 'Package Info'
      },
      {
        header: 'Email',
        accessor: 'pkg_email',
        sortable: false,
        render: () => (
          <span className="text-xs text-slate-600 whitespace-nowrap">
            {packageEmail || '-'}
          </span>
        ),
        category: 'Package Info'
      }
    );

    // 3. Validation Results Columns
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
        filterable: true,
        filterValue: (r) => r.action || '(Blank)',
        sortValue: (r) => r.action || '',
        filterOptions: [
          'Corrected',
          'Incorrect Status',
          'Not Applicable',
          'Need Review',
          'Review completed',
          'Review Completed',
          'Out of Scope',
          'Others',
          '(Blank)'
        ],
        headerClassName: 'whitespace-nowrap min-w-[150px]',
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
  }, [localRecords, packageDetails, selectedPackage, loanId, packageUsername, packageEmail]);

  const visibleAuditColumns = useMemo(() => {
    if (!allAvailableAuditColumns || allAvailableAuditColumns.length === 0) return [];
    const activeKeys = (selectedColumnKeys && selectedColumnKeys.length > 0)
      ? selectedColumnKeys
      : DEFAULT_SELECTED_COLUMNS;
    return allAvailableAuditColumns.filter(c => activeKeys.includes(c.accessor));
  }, [allAvailableAuditColumns, selectedColumnKeys]);

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
            {visibleAuditColumns.length}/{allAvailableAuditColumns.length}
          </span>
        </button>
      </Tooltip>
    </div>
  );

  // Early return after all hook declarations
  if (!selectedPackageId) return null;

  return (
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
                Package Audit Preview: <span className="font-semibold text-slate-700">{packageDetails?.package?.filename || 'Loading...'}</span>
                {loanId && (
                  <span className="font-semibold text-slate-600">
                    (Loan Id - {loanId})
                  </span>
                )}
              </h2>
              {localRecords.length > 0 && (
                <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                  <span>Total: <strong>{localRecords.length}</strong> fields</span>
                  <span>•</span>
                  <span className="text-slate-600 font-medium">
                    Showing {modalRecordsFiltered.length} {showAll ? '(All)' : '(Invalid only)'}
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
                disabled={detailsLoading || !packageDetails}
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
              disabled={updateLoading || detailsLoading}
              className="px-3.5 py-1.5 border border-slate-300 hover:bg-slate-100 disabled:opacity-50 text-slate-700 font-semibold rounded-xl text-xs sm:text-sm transition-all cursor-pointer"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={handleUpdate}
              disabled={updateLoading || detailsLoading}
              className="px-4 py-1.5 bg-[#24A1DD] hover:bg-[#1e88bb] disabled:bg-[#24A1DD]/60 text-white font-semibold rounded-xl text-xs sm:text-sm shadow-sm hover:shadow-md flex items-center gap-2 transition-all cursor-pointer"
            >
              {updateLoading && (
                <svg className="animate-spin -ml-1 mr-1 h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              )}
              {updateLoading ? 'Updating...' : 'Update'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={updateLoading}
              className="px-3.5 py-1.5 border border-slate-200 hover:bg-slate-100 text-slate-600 font-semibold rounded-xl text-xs sm:text-sm transition-all cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>

        {/* Feedback Banners */}
        {updateMessage && (
          <div className="px-5 py-2 bg-green-50 border-b border-green-200 text-xs sm:text-sm text-green-800 font-semibold flex items-center justify-between animate-fade-in">
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {updateMessage}
            </span>
            <button onClick={() => setUpdateMessage('')} className="text-green-600 hover:text-green-800 text-xs font-bold">✕</button>
          </div>
        )}
        {updateError && (
          <div className="px-5 py-2 bg-red-50 border-b border-red-200 text-xs sm:text-sm text-red-800 font-semibold flex items-center justify-between animate-fade-in">
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {updateError}
            </span>
            <button onClick={() => setUpdateError('')} className="text-red-600 hover:text-red-800 text-xs font-bold">✕</button>
          </div>
        )}

        {/* Modal Content area */}
        <div className="flex-1 bg-slate-100 flex flex-col min-h-0 overflow-hidden">
          {detailsLoading ? (
            <ModalSkeleton />
          ) : detailsError ? (
            <div className="flex-1 flex items-center justify-center p-8 bg-white text-red-800">
              <div className="text-center max-w-md">
                <p className="font-bold mb-2">Error Retrieving Details</p>
                <p className="text-sm text-red-650 mb-4">{detailsError}</p>
                <button
                  onClick={onRetry}
                  className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-800 font-semibold rounded-xl text-xs transition-colors"
                >
                  Retry
                </button>
              </div>
            </div>
          ) : packageDetails ? (
            /* Main spreadsheets display */
            activeSheet === 'results' ? (
              /* TAB 1: RESULT SHEET DATATABLE */
              <div className="flex-1 flex flex-col bg-white overflow-hidden p-3 pb-2 min-h-0">
                <DataTable
                  data={modalRecordsFiltered}
                  columns={visibleAuditColumns}
                  searchable={true}
                  pagination={true}
                  itemsPerPageOptions={[10, 25, 50, 100]}
                  defaultItemsPerPage={25}
                  emptyMessage="No matching records found."
                  customHeader={customModalHeader}
                  density="compact"
                  maxHeight="100%"
                  className="flex flex-col min-h-0 h-full flex-1"
                />
              </div>
            ) : (
              /* TAB 2: SUMMARY SHEET */
              <div className="flex-1 bg-slate-50 p-6 sm:p-8 overflow-y-auto smooth-scroll custom-scrollbar">
                <div className="max-w-5xl mx-auto space-y-8 animate-fade-in">
                  {/* General Summary Card */}
                  <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-6">General Statistics</h3>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                      <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-center">
                        <div className="text-3xl font-extrabold text-slate-900">{packageDetails.summary["Total Fields"]}</div>
                        <div className="text-xs text-slate-500 mt-1 font-semibold">Total Fields</div>
                      </div>
                      <div className="bg-green-50/50 border border-green-100 rounded-2xl p-4 text-center">
                        <div className="text-3xl font-extrabold text-green-700">{packageDetails.summary["Final Valid"]}</div>
                        <div className="text-xs text-green-600 mt-1 font-semibold">Final Valid</div>
                      </div>
                      <div className="bg-red-50/50 border border-red-100 rounded-2xl p-4 text-center">
                        <div className="text-3xl font-extrabold text-red-700">{packageDetails.summary["Final Invalid"]}</div>
                        <div className="text-xs text-red-600 mt-1 font-semibold">Final Invalid</div>
                      </div>
                      <div className="bg-slate-100/70 border border-slate-200/50 rounded-2xl p-4 text-center">
                        <div className="text-3xl font-extrabold text-slate-500">{packageDetails.summary["Final Blank"]}</div>
                        <div className="text-xs text-slate-500 mt-1 font-semibold">Final Blank</div>
                      </div>
                    </div>
                  </div>

                  {/* Detailed Analysis Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Dictionary Matches */}
                    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-150 pb-2">Dictionary Match Checks ({packageDetails.summary["Total Fields"] ?? 0} Total)</h4>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-slate-600 font-semibold">Matched Fields</span>
                          <span className="font-bold text-green-600">{packageDetails.summary["Matched"]}</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2">
                          <div className="bg-green-500 h-2 rounded-full transition-all duration-500" style={{ width: `${(packageDetails.summary["Matched"] / packageDetails.summary["Total Fields"]) * 100}%` }}></div>
                        </div>
                        <div className="flex justify-between items-center text-sm pt-2">
                          <span className="text-slate-600 font-semibold">Unmatched Fields</span>
                          <span className="font-bold text-red-600">{packageDetails.summary["Unmatched"]}</span>
                        </div>
                      </div>
                    </div>

                    {/* Data Type Checks */}
                    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-150 pb-2">Data Type Validation ({((packageDetails.summary["Type Pass"] ?? 0) + (packageDetails.summary["Type Fail"] ?? 0) + (packageDetails.summary["Blank Values"] ?? 0))} Total)</h4>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-slate-600 font-semibold">Type Check Pass</span>
                          <span className="font-bold text-green-600">{packageDetails.summary["Type Pass"]}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-slate-600 font-semibold">Type Check Fail</span>
                          <span className="font-bold text-red-600">{packageDetails.summary["Type Fail"]}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-slate-600 font-semibold">Blank Values (N/A)</span>
                          <span className="font-bold text-slate-500">{packageDetails.summary["Blank Values"]}</span>
                        </div>
                      </div>
                    </div>

                    {/* Enum Checks */}
                    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-150 pb-2">Enumeration Checks ({packageDetails.summary["Total Enum"]} Total)</h4>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-slate-600 font-semibold">Enum Valid</span>
                          <span className="font-bold text-green-600">{packageDetails.summary["Enum Pass"]}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-slate-600 font-semibold">Format Variance (Warnings)</span>
                          <span className="font-bold text-amber-600">{packageDetails.summary["Enum Format Variance"]}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-slate-600 font-semibold">Enum Fail</span>
                          <span className="font-bold text-red-600">{packageDetails.summary["Enum Fail"]}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-slate-600 font-semibold">Enum No List</span>
                          <span className="font-bold text-slate-500">{packageDetails.summary["Enum No List"] ?? 0}</span>
                        </div>
                      </div>
                    </div>

                    {/* Business Rules (Macro Rules) */}
                    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-150 pb-2">Business Rule Modules ({packageDetails.summary["Total Macro"]} Evaluated)</h4>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-slate-600 font-semibold">Macro Valid</span>
                          <span className="font-bold text-green-600">{packageDetails.summary["Macro Valid"]}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-slate-600 font-semibold">Macro Fail (Invalid Date / Ranges)</span>
                          <span className="font-bold text-red-600">{packageDetails.summary["Macro Invalid"]}</span>
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
            )
          ) : null}
        </div>

        {/* Bottom-docked Excel Worksheet Tab Selector */}
        {!detailsLoading && !detailsError && packageDetails && (
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
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Summary Sheet
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Manage Columns Modal */}
      <ManageColumnsModal
        isOpen={showManageColumnsModal}
        onClose={() => setShowManageColumnsModal(false)}
        allColumns={allAvailableAuditColumns}
        selectedColumnKeys={(selectedColumnKeys && selectedColumnKeys.length > 0) ? selectedColumnKeys : DEFAULT_SELECTED_COLUMNS}
        onApply={async (newKeys) => {
          setSelectedColumnKeys(newKeys);
          const res = await userPreferencesService.saveColumnPreferences('package_audit', newKeys);
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

export default PackageAuditModal;
