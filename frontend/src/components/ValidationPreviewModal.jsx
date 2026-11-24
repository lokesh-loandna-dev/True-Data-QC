import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { DataTable } from './DataTable';
import { ManageColumnsModal } from './ManageColumnsModal';
import Tooltip from './Tooltip';
import { ValidationSummaryCards } from './ValidationSummaryCards';
import { extractLoanId, normalizeAction, isExcludedAuditColumn } from '../utils/loanUtils';
import { userPreferencesService } from '../services/userPreferencesService';
import { notify } from '../utils/toast';

// Default columns shown in table
const DEFAULT_SELECTED_COLUMNS = [
  'data_field',
  'data_label',
  'true_data',
  'condition_text',
  'condition_outcome',
  'final_result',
  'final_remarks',
  'action',
  'remark'
];

const ACTION_OPTIONS = [
  'Corrected',
  'Incorrect Status',
  'Not Applicable',
  'Need Review',
  'Review Completed',
  'Out of Scope',
  'Others'
];

// Isolated debounced Remark textarea to prevent full-modal render thrashing on keystrokes
const RemarkCell = memo(({ value: initialValue, onChange }) => {
  const [localVal, setLocalVal] = useState(initialValue || '');
  const [prevVal, setPrevVal] = useState(initialValue);

  if (initialValue !== prevVal) {
    setPrevVal(initialValue);
    setLocalVal(initialValue || '');
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      if (localVal !== (initialValue || '')) {
        onChange(localVal);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [localVal, initialValue, onChange]);

  const handleBlur = () => {
    if (localVal !== (initialValue || '')) {
      onChange(localVal);
    }
  };

  return (
    <textarea
      rows={1}
      value={localVal}
      onChange={(e) => setLocalVal(e.target.value)}
      onBlur={handleBlur}
      placeholder="Enter remark..."
      className="w-full bg-white dark:bg-[var(--bg-elevated)] border border-black/20 dark:border-[var(--border-strong)] rounded-md px-2 py-1 text-xs text-slate-800 dark:text-[var(--text-primary)] placeholder-slate-400 dark:placeholder-[var(--text-disabled)] focus:ring-1 focus:ring-[var(--focus-ring)] focus:border-[var(--focus-ring)] focus:outline-none transition-all resize-y min-h-[30px] leading-tight"
    />
  );
});
RemarkCell.displayName = 'RemarkCell';

// Isolated Action select component
const ActionCell = memo(({ value, onChange }) => {
  const normalized = normalizeAction(value);

  const getActionColor = (val) => {
    switch (val) {
      case 'Corrected': return 'text-emerald-700 dark:text-[var(--success)]';
      case 'Incorrect Status': return 'text-rose-700 dark:text-[var(--error)]';
      case 'Not Applicable': return 'text-slate-600 dark:text-[var(--text-secondary)]';
      case 'Need Review': return 'text-amber-700 dark:text-[var(--warning)]';
      case 'Review Completed': return 'text-teal-700 dark:text-[#2DD4BF]';
      case 'Out of Scope': return 'text-purple-700 dark:text-[#C084FC]';
      case 'Others': return 'text-blue-700 dark:text-[var(--info)]';
      default: return 'text-slate-700 dark:text-[var(--text-primary)]';
    }
  };

  return (
    <select
      value={normalized}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full bg-white dark:bg-[var(--bg-elevated)] border border-black/20 dark:border-[var(--border-strong)] rounded-md px-2 py-1 h-[30px] text-xs font-semibold focus:ring-1 focus:ring-[var(--focus-ring)] focus:outline-none transition-colors cursor-pointer ${getActionColor(normalized)}`}
    >
      <option value="" className="bg-white dark:bg-[var(--bg-surface)] text-slate-700 dark:text-[var(--text-primary)]">-- Select --</option>
      {ACTION_OPTIONS.map((opt) => (
        <option key={opt} value={opt} className="bg-white dark:bg-[var(--bg-surface)] text-slate-700 dark:text-[var(--text-primary)]">
          {opt}
        </option>
      ))}
    </select>
  );
});
ActionCell.displayName = 'ActionCell';

export const ValidationPreviewModal = ({
  isOpen,
  validationData,
  onClose,
  onSave,
  onRecordChange,
  saveLoading,
  isDirty,
  user,
  onDownloadExcel
}) => {
  const [activeSheet, setActiveSheet] = useState('results'); // 'results' or 'summary'
  const [showAll, setShowAll] = useState(false);
  const [showManageColumnsModal, setShowManageColumnsModal] = useState(false);

  // Single-key LocalStorage management for Issue 5 (no dual-write to _v2)
  const [selectedColumnKeys, setSelectedColumnKeys] = useState(() => {
    try {
      const savedV3 = localStorage.getItem('validation_preview_selected_columns_v3');
      if (savedV3) return JSON.parse(savedV3);
      const savedV2 = localStorage.getItem('validation_preview_selected_columns_v2');
      if (savedV2) {
        const parsed = JSON.parse(savedV2);
        if (Array.isArray(parsed)) {
          const updated = [...parsed];
          if (!updated.includes('condition_text')) {
            const insertIdx = updated.indexOf('final_result');
            if (insertIdx !== -1) {
              updated.splice(insertIdx, 0, 'condition_text', 'condition_outcome');
            } else {
              updated.push('condition_text', 'condition_outcome');
            }
          }
          // Migrate immediately to v3
          localStorage.setItem('validation_preview_selected_columns_v3', JSON.stringify(updated));
          return updated;
        }
      }
      return DEFAULT_SELECTED_COLUMNS;
    } catch {
      return DEFAULT_SELECTED_COLUMNS;
    }
  });

  // Load column preferences from database on mount
  useEffect(() => {
    userPreferencesService.getColumnPreferences('validation_preview').then((cols) => {
      if (cols && Array.isArray(cols) && cols.length > 0) {
        let updated = [...cols];
        if (!updated.includes('condition_text') && !localStorage.getItem('validation_preview_selected_columns_v3')) {
          const insertIdx = updated.indexOf('final_result');
          if (insertIdx !== -1) {
            updated.splice(insertIdx, 0, 'condition_text', 'condition_outcome');
          } else {
            updated.push('condition_text', 'condition_outcome');
          }
        }
        setSelectedColumnKeys(updated);
      }
    });
  }, []);

  // Save only to _v3 client-side cache
  useEffect(() => {
    if (selectedColumnKeys && selectedColumnKeys.length > 0) {
      localStorage.setItem('validation_preview_selected_columns_v3', JSON.stringify(selectedColumnKeys));
    }
  }, [selectedColumnKeys]);

  const modalLoanId = useMemo(() => {
    if (!validationData) return '';
    return extractLoanId(validationData.records, validationData.loan_id);
  }, [validationData]);

  // Helper: Status Badge
  const getStatusBadge = useCallback((status, wrap = false) => {
    if (!status) return <span className="text-slate-400 dark:text-[var(--text-disabled)] whitespace-nowrap">-</span>;
    const s = String(status);
    const textStyle = wrap
      ? "whitespace-normal break-words max-w-xs inline-block text-left leading-normal font-semibold text-xs"
      : "whitespace-nowrap inline-flex items-center font-semibold text-xs";

    if (s === 'TRUE' || s === 'Matched' || s === 'Valid' || s.startsWith('OK')) {
      return <span className={`text-emerald-700 dark:text-[var(--success)] ${textStyle}`}>{s}</span>;
    }
    if (s === 'FALSE' || s === 'Unmatched' || s.startsWith('Invalid') || s.startsWith('FLAGGED')) {
      return <span className={`text-rose-700 dark:text-[var(--error)] ${textStyle}`}>{s}</span>;
    }
    if (s.startsWith('TRUE -') || s.includes('variance') || s.includes('coerced') || s.includes('Review Required') || s.includes('partial')) {
      return <span className={`text-amber-700 dark:text-[var(--warning)] ${textStyle}`}>{s}</span>;
    }
    if (s.includes('Not Automated')) {
      return <span className={`text-purple-700 dark:text-[#C084FC] ${textStyle}`}>{s}</span>;
    }
    return <span className={`text-slate-600 dark:text-[var(--text-secondary)] ${textStyle}`}>{s}</span>;
  }, []);

  const handleActionChange = useCallback((record, val) => {
    onRecordChange(record, 'action', val);
  }, [onRecordChange]);

  const handleRemarkChange = useCallback((record, val) => {
    onRecordChange(record, 'remark', val);
  }, [onRecordChange]);

  // Dynamic columns generation based on ingested Excel headers and validation output
  const allAvailableColumns = useMemo(() => {
    if (!validationData?.records || validationData.records.length === 0) {
      return [];
    }

    const firstRec = validationData.records[0];
    const hasLoanId = (Array.isArray(validationData.headers) && (validationData.headers.includes('Loan ID') || validationData.headers.includes('loan_id'))) ||
      validationData.records.some(r => (r.loan_id != null && String(r.loan_id).trim() !== '') || (r.raw_data && ('Loan ID' in r.raw_data || 'loan_id' in r.raw_data)));
    let excelCols;

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
        draggable: false,
        headerClassName: 'sticky top-0 left-0 z-40 bg-[#24a1dd] border-r border-black/20 shadow-[2px_0_4px_-1px_rgba(0,0,0,0.08)] text-white whitespace-nowrap min-w-[120px] sm:min-w-[140px]',
        cellClassName: 'sticky left-0 z-10 bg-white dark:bg-[var(--bg-surface)] group-hover:bg-slate-50 dark:group-hover:bg-[var(--bg-muted)] border-r border-black/20 dark:border-white/20 shadow-[2px_0_4px_-1px_rgba(0,0,0,0.08)] whitespace-nowrap min-w-[120px] sm:min-w-[140px]',
        render: (r) => <span className="font-semibold text-slate-900 dark:text-[var(--text-primary)]">{r.data_field}</span>,
        category: 'Excel Column'
      },
      'loan_id': {
        header: 'Loan ID',
        accessor: 'loan_id',
        sortable: true,
        filterable: false,
        render: (r) => <span className="whitespace-nowrap font-medium text-slate-600 dark:text-[var(--text-secondary)]">{r.loan_id || '-'}</span>,
        category: 'Excel Column'
      },
      'data_label': {
        header: 'Data Label',
        accessor: 'data_label',
        sortable: true,
        render: (r) => <span className="font-mono text-slate-600 dark:text-[var(--text-secondary)]">{r.data_label}</span>,
        category: 'Excel Column'
      },
      'true_data': {
        header: 'True Data',
        accessor: 'true_data',
        sortable: true,
        render: (r) => <span className="font-medium text-slate-900 dark:text-[var(--text-primary)] break-words whitespace-pre-wrap max-w-xs block leading-snug">{r.true_data || ''}</span>,
        category: 'Excel Column'
      }
    };

    const cols = [];

    // 1. Ingested Excel Columns
    excelCols.forEach((colName) => {
      if (isExcludedAuditColumn(colName)) return;

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
          const isConstantField = ['loanid', 'loan_id', 'username', 'email'].includes(
            String(colName).toLowerCase().replace(/[\s_-]/g, '')
          );
          cols.push({
            header: colName,
            accessor: colName,
            sortable: true,
            filterable: !isConstantField,
            render: (r) => (
              <span className="text-slate-700 dark:text-[var(--text-primary)] break-words whitespace-pre-wrap max-w-xs block leading-snug">
                {r.raw_data?.[colName] ?? r[colName] ?? ''}
              </span>
            ),
            category: 'Excel Column'
          });
        }
      }
    });

    const mandatoryFields = ['data_field', 'data_label', 'true_data'];
    if (hasLoanId) {
      mandatoryFields.splice(1, 0, 'loan_id');
    }
    mandatoryFields.forEach(k => {
      if (!cols.some(c => c.accessor === k)) {
        cols.unshift(baseColumnsMap[k]);
      }
    });

    // 2. Package-level info columns
    cols.push(
      {
        header: 'Loan Id',
        accessor: 'pkg_loan_id',
        sortable: false,
        filterable: false,
        render: () => (
          <span className="font-mono text-xs font-semibold text-slate-700 dark:text-[var(--text-primary)] whitespace-nowrap">
            {modalLoanId || '-'}
          </span>
        ),
        category: 'Package Info'
      },
      {
        header: 'Username',
        accessor: 'pkg_username',
        sortable: false,
        filterable: false,
        render: () => (
          <span className="text-xs font-semibold text-slate-700 dark:text-[var(--text-primary)] whitespace-nowrap">
            {user?.username || '-'}
          </span>
        ),
        category: 'Package Info'
      },
      {
        header: 'Email',
        accessor: 'pkg_email',
        sortable: false,
        filterable: false,
        render: () => (
          <span className="text-xs text-slate-600 dark:text-[var(--text-secondary)] whitespace-nowrap">
            {user?.email || '-'}
          </span>
        ),
        category: 'Package Info'
      }
    );

    // 3. Validation Process Results Columns
    cols.push(
      {
        header: 'Condition Text',
        accessor: 'condition_text',
        sortable: true,
        headerClassName: 'whitespace-nowrap min-w-[180px] max-w-[280px]',
        filterType: 'text',
        filterValue: (r) => {
          const val = r.condition_text ?? r['Condition Text'] ?? r.raw_data?.['Condition Text'] ?? '';
          return val !== null && val !== undefined && String(val).trim() !== '' ? String(val).trim() : '(Blank)';
        },
        sortValue: (r) => r.condition_text ?? r['Condition Text'] ?? r.raw_data?.['Condition Text'] ?? '',
        render: (r) => (
          <span className="text-slate-600 dark:text-[var(--text-secondary)] break-words whitespace-pre-wrap max-w-sm block leading-snug text-xs">
            {r.condition_text ?? r['Condition Text'] ?? r.raw_data?.['Condition Text'] ?? ''}
          </span>
        ),
        category: 'Validation'
      },
      {
        header: 'Condition Outcome',
        accessor: 'condition_outcome',
        sortable: true,
        headerClassName: 'whitespace-nowrap min-w-[160px] max-w-[240px]',
        filterType: 'text',
        filterValue: (r) => {
          const val = r.condition_outcome ?? r['Condition Outcome'] ?? r.raw_data?.['Condition Outcome'] ?? '';
          return val !== null && val !== undefined && String(val).trim() !== '' ? String(val).trim() : '(Blank)';
        },
        sortValue: (r) => r.condition_outcome ?? r['Condition Outcome'] ?? r.raw_data?.['Condition Outcome'] ?? '',
        render: (r) => {
          const val = r.condition_outcome ?? r['Condition Outcome'] ?? r.raw_data?.['Condition Outcome'] ?? '';
          if (!val) return null;
          return (
            <div className="text-xs break-words whitespace-pre-wrap max-w-sm leading-snug space-y-0.5">
              {String(val).split('\n').map((line, i) => {
                let badgeClass = 'text-slate-600 dark:text-[var(--text-secondary)]';
                if (line.includes('PASS')) badgeClass = 'text-emerald-700 dark:text-[var(--success)] font-medium';
                else if (line.includes('FAIL')) badgeClass = 'text-rose-700 dark:text-[var(--error)] font-medium';
                else if (line.includes('NOT CHECKED')) badgeClass = 'text-amber-700 dark:text-[var(--warning)] font-medium';
                return <div key={i} className={badgeClass}>{line}</div>;
              })}
            </div>
          );
        },
        category: 'Validation'
      },
      {
        header: 'Final Result',
        accessor: 'final_result',
        sortable: true,
        headerClassName: 'whitespace-nowrap font-bold text-white min-w-[100px]',
        render: (r) => <span className="break-words whitespace-pre-wrap max-w-xs block leading-snug font-bold">{getStatusBadge(r.final_result || r.result, true)}</span>,
        category: 'Validation'
      },
      {
        header: 'Final Remarks',
        accessor: 'final_remarks',
        sortable: true,
        headerClassName: 'whitespace-nowrap min-w-[140px] max-w-[240px]',
        render: (r) => <span className="text-slate-700 dark:text-[var(--text-primary)] break-words whitespace-pre-wrap max-w-sm block leading-snug font-medium text-xs">{r.final_remarks || ''}</span>,
        category: 'Validation'
      },
      {
        header: 'Action',
        accessor: 'action',
        sortable: true,
        draggable: false,
        filterable: true,
        filterValue: (r) => normalizeAction(r.action) || '(Blank)',
        sortValue: (r) => normalizeAction(r.action) || '',
        filterOptions: [
          'Corrected',
          'Incorrect Status',
          'Not Applicable',
          'Need Review',
          'Review Completed',
          'Out of Scope',
          'Others',
          '(Blank)'
        ],
        headerClassName: 'whitespace-nowrap min-w-[140px]',
        render: (r) => (
          <ActionCell
            value={r.action}
            onChange={(val) => handleActionChange(r, val)}
          />
        ),
        category: 'Audit'
      },
      {
        header: 'User Remark',
        accessor: 'remark',
        sortable: true,
        draggable: false,
        headerClassName: 'whitespace-nowrap min-w-[200px]',
        render: (r) => (
          <RemarkCell
            value={r.remark}
            onChange={(val) => handleRemarkChange(r, val)}
          />
        ),
        category: 'Audit'
      }
    );

    return cols.filter(c =>
      c.header !== 'condition_text' &&
      c.header !== 'condition_outcome' &&
      !(c.category === 'Excel Column' && (c.accessor === 'Condition Text' || c.accessor === 'Condition Outcome'))
    );
  }, [validationData, modalLoanId, user, getStatusBadge, handleActionChange, handleRemarkChange]);

  const visibleValidationColumns = useMemo(() => {
    if (!allAvailableColumns || allAvailableColumns.length === 0) return [];
    const activeKeys = (selectedColumnKeys && selectedColumnKeys.length > 0)
      ? selectedColumnKeys
      : DEFAULT_SELECTED_COLUMNS;
    const colMap = new Map(allAvailableColumns.map((c) => [c.accessor, c]));

    // Middle/non-fixed columns in current configured order (excluding 'action' and 'remark')
    const nonFixedCols = activeKeys
      .filter((k) => k !== 'action' && k !== 'remark')
      .map((k) => colMap.get(k))
      .filter(Boolean);

    const isActionVisible = activeKeys.includes('action');
    const isRemarkVisible = activeKeys.includes('remark');

    const fixedEndCols = [];
    if (isActionVisible && colMap.has('action')) {
      const baseActionCol = colMap.get('action');
      const rightOffset = isRemarkVisible ? 200 : 0;
      fixedEndCols.push({
        ...baseActionCol,
        draggable: false,
        headerClassName: `sticky top-0 z-30 bg-[#24a1dd] text-white border-l border-black/20 shadow-[-2px_0_4px_-1px_rgba(0,0,0,0.08)] whitespace-nowrap min-w-[140px] w-[140px] max-w-[140px] ${baseActionCol.headerClassName || ''}`,
        cellClassName: `sticky z-10 bg-white dark:bg-[var(--bg-surface)] group-hover:bg-slate-50 dark:group-hover:bg-[var(--bg-muted)] border-l border-black/20 dark:border-white/20 shadow-[-2px_0_4px_-1px_rgba(0,0,0,0.08)] min-w-[140px] w-[140px] max-w-[140px] ${baseActionCol.cellClassName || ''}`,
        style: { right: `${rightOffset}px`, width: '140px', minWidth: '140px', maxWidth: '140px' },
        cellStyle: { right: `${rightOffset}px`, width: '140px', minWidth: '140px', maxWidth: '140px' }
      });
    }

    if (isRemarkVisible && colMap.has('remark')) {
      const baseRemarkCol = colMap.get('remark');
      fixedEndCols.push({
        ...baseRemarkCol,
        draggable: false,
        headerClassName: `sticky top-0 right-0 z-30 bg-[#24a1dd] text-white border-l border-black/20 shadow-[-2px_0_4px_-1px_rgba(0,0,0,0.08)] whitespace-nowrap min-w-[200px] w-[200px] max-w-[200px] ${baseRemarkCol.headerClassName || ''}`,
        cellClassName: `sticky right-0 z-10 bg-white dark:bg-[var(--bg-surface)] group-hover:bg-slate-50 dark:group-hover:bg-[var(--bg-muted)] border-l border-black/20 dark:border-white/20 shadow-[-2px_0_4px_-1px_rgba(0,0,0,0.08)] min-w-[200px] w-[200px] max-w-[200px] ${baseRemarkCol.cellClassName || ''}`,
        style: { right: '0px', width: '200px', minWidth: '200px', maxWidth: '200px' },
        cellStyle: { right: '0px', width: '200px', minWidth: '200px', maxWidth: '200px' }
      });
    }

    return [...nonFixedCols, ...fixedEndCols];
  }, [allAvailableColumns, selectedColumnKeys]);

  const handleColumnOrderChange = async (newOrderedKeys) => {
    const nonFixed = newOrderedKeys.filter((k) => k !== 'action' && k !== 'remark');
    const finalKeys = [...nonFixed];
    if (newOrderedKeys.includes('action')) finalKeys.push('action');
    if (newOrderedKeys.includes('remark')) finalKeys.push('remark');
    setSelectedColumnKeys(finalKeys);
    try {
      await userPreferencesService.saveColumnPreferences('validation_preview', finalKeys);
      notify.success('Column order updated');
    } catch (e) {
      console.error('Failed to save reordered columns:', e);
    }
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
  }, [validationData, showAll]);

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

  const customModalHeader = (
    <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
      <label className="inline-flex items-center gap-1.5 sm:gap-2 cursor-pointer text-xs font-semibold text-slate-700 dark:text-[var(--text-primary)] bg-white dark:bg-[var(--bg-elevated)] border border-slate-200 dark:border-[var(--border)] px-2.5 sm:px-3.5 py-1.5 rounded-xl hover:bg-slate-50 dark:hover:bg-[var(--bg-muted)] transition-all select-none shadow-2xs">
        <input
          type="checkbox"
          className="rounded border-slate-300 dark:border-[var(--border-strong)] text-[var(--primary)] focus:ring-[var(--focus-ring)] h-3.5 w-3.5 sm:h-4 sm:w-4 cursor-pointer accent-[var(--primary)]"
          checked={showAll}
          onChange={(e) => setShowAll(e.target.checked)}
        />
        <span>Show All</span>
      </label>
      <Tooltip text="Manage Columns" position="bottom">
        <button
          type="button"
          onClick={() => setShowManageColumnsModal(true)}
          className="inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-white dark:bg-[var(--bg-elevated)] border border-slate-200 dark:border-[var(--border)] text-slate-700 dark:text-[var(--text-primary)] text-xs font-semibold rounded-xl hover:bg-slate-50 dark:hover:bg-[var(--bg-muted)] hover:border-slate-300 dark:hover:border-[var(--border-strong)] transition-all shadow-2xs cursor-pointer select-none"
          aria-label="Manage Columns"
        >
          <svg className="w-4 h-4 text-slate-500 dark:text-[var(--text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2m0 10V7m6 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
          </svg>
          <span className="hidden sm:inline">Columns</span>
          <span className="px-1.5 py-0.5 text-[10px] font-bold bg-[var(--primary)]/10 text-[var(--primary)] rounded-full border border-[var(--primary)]/20">
            {visibleValidationColumns.length}/{allAvailableColumns.length}
          </span>
        </button>
      </Tooltip>
    </div>
  );

  if (!isOpen || !validationData) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-0 sm:p-3">
      <div className="bg-[var(--bg-surface)] text-[var(--text-primary)] rounded-none sm:rounded-2xl shadow-2xl w-full sm:w-[98vw] max-w-full sm:max-w-[98vw] h-[100dvh] sm:h-[94vh] flex flex-col overflow-hidden animate-fade-in border-0 sm:border sm:border-[var(--border)]">
        {/* Modal Header */}
        <div className="px-3 sm:px-5 py-2 sm:py-3 border-b border-[var(--border)] bg-[var(--bg-elevated)] flex flex-col sm:flex-row sm:items-center sm:justify-between flex-shrink-0 gap-2 sm:gap-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-emerald-50 dark:bg-[var(--success-bg)] border border-emerald-200 dark:border-[var(--success)]/30 text-emerald-600 dark:text-[var(--success)] flex items-center justify-center shadow-2xs shrink-0">
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-xs sm:text-base font-bold text-[var(--text-primary)] flex items-center flex-wrap gap-1 sm:gap-2 leading-tight">
                <span className="hidden xs:inline">Validation Preview:</span>
                <span className="font-semibold text-[var(--text-primary)] truncate max-w-[130px] xs:max-w-[180px] sm:max-w-[260px] md:max-w-none" title={validationData.filename}>
                  {validationData.filename}
                </span>
                {modalLoanId && (
                  <span className="font-semibold text-[var(--text-secondary)] text-[11px] sm:text-sm whitespace-nowrap">
                    (ID: {modalLoanId})
                  </span>
                )}
              </h2>
              {validationData.records && (
                <div className="flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs text-[var(--text-secondary)] mt-0.5">
                  <span>Total: <strong>{validationData.records.length}</strong> fields</span>
                  <span>•</span>
                  <span className="text-[var(--text-secondary)] font-medium">
                    Showing {validationRecordsFiltered.length} {showAll ? '(All)' : '(Invalid only)'}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-1.5 sm:gap-3 shrink-0 w-full sm:w-auto pt-1 sm:pt-0 border-t border-[var(--border)]/50 sm:border-t-0">
            <Tooltip text="Download Excel Report" position="bottom">
              <button
                type="button"
                onClick={onDownloadExcel}
                disabled={saveLoading || !validationData}
                className="inline-flex items-center justify-center p-2 border border-[var(--border)] bg-[var(--bg-surface)] hover:bg-[var(--success-bg)] hover:border-[var(--success)]/40 text-[var(--success)] disabled:opacity-50 font-semibold rounded-xl text-xs transition-all shadow-2xs hover:shadow-xs cursor-pointer select-none"
                aria-label="Download Excel Report"
              >
                <svg className="w-4 h-4 sm:w-4.5 sm:h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </button>
            </Tooltip>
            <button
              type="button"
              onClick={onClose}
              disabled={saveLoading}
              className="px-3 sm:px-3.5 py-1.5 border border-[var(--border)] bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-semibold rounded-xl text-xs sm:text-sm transition-all cursor-pointer"
            >
              Close
            </button>
            {isDirty && (
              <button
                type="button"
                onClick={onSave}
                disabled={saveLoading}
                className="px-3.5 sm:px-4 py-1.5 bg-[var(--success)] hover:bg-emerald-600 disabled:opacity-60 text-white font-semibold rounded-xl text-xs sm:text-sm shadow-sm hover:shadow-md flex items-center justify-center gap-1.5 transition-all animate-fade-in cursor-pointer"
              >
                {saveLoading && (
                  <svg className="animate-spin -ml-1 mr-1 h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4}></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                )}
                <span>{saveLoading ? 'Saving...' : 'Save'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 bg-slate-100 dark:bg-[var(--bg-app)] flex flex-col min-h-0 overflow-hidden">
          {activeSheet === 'results' ? (
            /* SHEET 1: RESULTS TABLE */
            <div className="flex-1 flex flex-col bg-white dark:bg-[var(--bg-surface)] overflow-hidden p-3 pb-2 min-h-0">
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
                onColumnOrderChange={handleColumnOrderChange}
              />
            </div>
          ) : (
            /* SHEET 2: SUMMARY CARDS */
            <div className="flex-1 bg-slate-50 dark:bg-[var(--bg-app)] p-6 sm:p-8 overflow-y-auto smooth-scroll custom-scrollbar">
              <ValidationSummaryCards
                summary={validationData.summary}
                condSummary={condSummary}
              />
            </div>
          )}
        </div>

        {/* Bottom-docked Excel Worksheet Tab Selector */}
        <div className="h-10 bg-[var(--bg-header)] border-t border-[var(--border)] flex items-center px-2 sm:px-4 flex-shrink-0 select-none">
          <div className="flex items-center h-full gap-1 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setActiveSheet('results')}
              className={`flex-1 sm:flex-none px-3 sm:px-5 h-[34px] flex items-center justify-center gap-1.5 sm:gap-2 text-xs font-bold transition-all rounded-t-lg cursor-pointer ${
                activeSheet === 'results'
                  ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] border-t-2 border-t-[var(--primary)] border-x border-[var(--border)] shadow-xs'
                  : 'bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'
              }`}
            >
              <svg className="w-3.5 h-3.5 text-[var(--primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <span>Result Sheet</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSheet('summary')}
              className={`flex-1 sm:flex-none px-3 sm:px-5 h-[34px] flex items-center justify-center gap-1.5 sm:gap-2 text-xs font-bold transition-all rounded-t-lg cursor-pointer ${
                activeSheet === 'summary'
                  ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] border-t-2 border-t-[var(--primary)] border-x border-[var(--border)] shadow-xs'
                  : 'bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'
              }`}
            >
              <svg className="w-3.5 h-3.5 text-[var(--primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <span>Summary Sheet</span>
            </button>
          </div>
        </div>
      </div>

      {/* Manage Columns Modal */}
      <ManageColumnsModal
        isOpen={showManageColumnsModal}
        onClose={() => setShowManageColumnsModal(false)}
        allColumns={allAvailableColumns}
        selectedColumnKeys={(selectedColumnKeys && selectedColumnKeys.length > 0) ? selectedColumnKeys : DEFAULT_SELECTED_COLUMNS}
        onApply={async (newKeys) => {
          const nonFixed = newKeys.filter((k) => k !== 'action' && k !== 'remark');
          const finalKeys = [...nonFixed];
          if (newKeys.includes('action')) finalKeys.push('action');
          if (newKeys.includes('remark')) finalKeys.push('remark');
          setSelectedColumnKeys(finalKeys);
          const res = await userPreferencesService.saveColumnPreferences('validation_preview', finalKeys);
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

export default ValidationPreviewModal;
