import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Header from '../layout/Header';
import { DataTable } from '../components/DataTable';
import { loanService } from '../services/loanService';
import { ModalSkeleton } from '../components/SkeletonLoader';
import { exportToExcel } from '../utils/excelExport';
import { notify } from '../utils/toast';
import { ManageColumnsModal } from '../components/ManageColumnsModal';
import Tooltip from '../components/Tooltip';
import { extractLoanId, isExcludedAuditColumn } from '../utils/loanUtils';
import { userPreferencesService } from '../services/userPreferencesService';
import { decodePackageId } from '../utils/routeCipher';

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

const PackageAuditPage = () => {
  const { encryptedId } = useParams();
  const navigate = useNavigate();

  // Decode package ID safely
  const packageId = useMemo(() => {
    try {
      return decodePackageId(encryptedId);
    } catch (e) {
      console.error('Failed to decode package ID:', e);
      return null;
    }
  }, [encryptedId]);

  const [packageDetails, setPackageDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(true);
  const [detailsError, setDetailsError] = useState('');

  const [activeSheet, setActiveSheet] = useState('results'); // 'results' or 'summary'
  const [showAll, setShowAll] = useState(false);

  const [updateLoading, setUpdateLoading] = useState(false);
  const [updateMessage, setUpdateMessage] = useState('');
  const [updateError, setUpdateError] = useState('');

  const [localRecords, setLocalRecords] = useState([]);
  const [showManageColumnsModal, setShowManageColumnsModal] = useState(false);

  const [selectedColumnKeys, setSelectedColumnKeys] = useState(() => {
    try {
      const savedV3 = localStorage.getItem('package_audit_selected_columns_v3');
      if (savedV3) return JSON.parse(savedV3);
      const savedV2 = localStorage.getItem('package_audit_selected_columns_v2');
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
          return updated;
        }
      }
      return DEFAULT_SELECTED_COLUMNS;
    } catch {
      return DEFAULT_SELECTED_COLUMNS;
    }
  });

  // Sync columns preference from DB
  useEffect(() => {
    userPreferencesService.getColumnPreferences('package_audit').then((cols) => {
      if (cols && Array.isArray(cols) && cols.length > 0) {
        let updated = [...cols];
        if (!updated.includes('condition_text') && !localStorage.getItem('package_audit_selected_columns_v3')) {
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

  useEffect(() => {
    if (selectedColumnKeys && selectedColumnKeys.length > 0) {
      localStorage.setItem('package_audit_selected_columns_v3', JSON.stringify(selectedColumnKeys));
      localStorage.setItem('package_audit_selected_columns_v2', JSON.stringify(selectedColumnKeys));
    }
  }, [selectedColumnKeys]);

  // Fetch package details
  const fetchDetails = useCallback(async () => {
    if (!packageId) {
      setDetailsError('Invalid or malformed package URL.');
      setDetailsLoading(false);
      return;
    }

    setDetailsLoading(true);
    setDetailsError('');
    try {
      const response = await loanService.getPackageDetails(packageId);
      if (response && response.status === 'success') {
        setPackageDetails(response);
        if (response.records) {
          setLocalRecords(
            response.records.map((r, i) => ({
              ...r,
              _id: r.id || `audit_rec_${i}`,
              action: r.action || '',
              remark: r.remark || ''
            }))
          );
        }
      } else {
        setDetailsError('Failed to fetch package details.');
      }
    } catch (err) {
      setDetailsError(err.message || 'An error occurred while loading package details.');
    } finally {
      setDetailsLoading(false);
    }
  }, [packageId]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  const packageUsername = packageDetails?.package?.uploaded_by || packageDetails?.uploaded_by || '';
  const packageEmail = packageDetails?.package?.uploaded_email || packageDetails?.uploaded_email || '';

  const loanId = useMemo(() => {
    return extractLoanId(
      localRecords && localRecords.length > 0 ? localRecords : packageDetails?.records || [],
      packageDetails?.package?.loan_id || packageDetails?.loan_id
    );
  }, [localRecords, packageDetails]);

  const handleRecordChange = (recordToUpdate, field, value) => {
    setLocalRecords((prev) =>
      prev.map((rec) =>
        rec === recordToUpdate || (rec._id && rec._id === recordToUpdate._id)
          ? { ...rec, [field]: value }
          : rec
      )
    );
  };

  const handleDiscard = () => {
    if (packageDetails?.records) {
      setLocalRecords(
        packageDetails.records.map((r, i) => ({
          ...r,
          _id: r.id || `audit_rec_${i}`,
          action: r.action || '',
          remark: r.remark || ''
        }))
      );
    }
    setUpdateMessage('Changes discarded. Restored previous record data.');
    setUpdateError('');
    setTimeout(() => setUpdateMessage(''), 4000);
  };

  const handleUpdate = async () => {
    if (!packageId) return;
    setUpdateLoading(true);
    setUpdateMessage('');
    setUpdateError('');

    try {
      await loanService.updatePackageRecords(packageId, localRecords);
      setUpdateMessage('Package records successfully updated in database!');
      if (packageDetails) {
        packageDetails.records = localRecords.map((r) => ({ ...r }));
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
    return localRecords.filter(
      (r) =>
        (r.final_result && (r.final_result.startsWith('Invalid') || r.final_result.includes('Review Required'))) ||
        (r.result && r.result.startsWith('Invalid'))
    );
  }, [localRecords, showAll]);

  const condSummary = useMemo(() => {
    if (!packageDetails) return null;
    const s = packageDetails.summary || {};
    const recs = packageDetails.records || [];
    const getCondVal = (rec) => {
      return (
        rec.condition_validation ||
        rec['Condition Validation'] ||
        rec['Condition Check'] ||
        (rec.raw_data && (rec.raw_data['Condition Validation'] || rec.raw_data['condition_validation'])) ||
        ''
      );
    };
    const condValid = s['Cond Valid'] ?? recs.filter((r) => getCondVal(r) === 'Valid').length;
    const condValidPartial = s['Cond Valid - Partial'] ?? recs.filter((r) => getCondVal(r) === 'Valid - partial').length;
    const condInvalid = s['Cond Invalid'] ?? recs.filter((r) => getCondVal(r) === 'Invalid').length;
    const condNotAutomated = s['Cond Not Automated'] ?? recs.filter((r) => getCondVal(r) === 'Not Automated').length;
    const condNoRule = s['Cond N/A - No Rule'] ?? recs.filter((r) => getCondVal(r) === 'N/A - no condition rule').length;
    const condNotMet = s['Cond N/A - Condition Not Met'] ?? recs.filter((r) => getCondVal(r) === 'N/A - condition not met').length;
    const condBlank = s['Cond N/A - Blank Value'] ?? recs.filter((r) => getCondVal(r) === 'N/A - blank value').length;
    const condInfo = s['Cond N/A - Informational'] ?? recs.filter((r) => getCondVal(r) === 'N/A - informational').length;
    const condRulesApplied = s['Cond Rules Applied'] ?? (condValid + condValidPartial + condInvalid + condNotAutomated);
    const condTotal = s['Cond Total (reconciles)'] ?? (s['Total Fields'] || recs.length);
    const condKnown = condValid + condValidPartial + condInvalid + condNotAutomated + condNoRule + condNotMet + condBlank + condInfo;
    const condUnclassified = s['Cond Unclassified'] ?? (condTotal - condKnown > 0 ? condTotal - condKnown : 0);

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

  const getStatusBadge = (status, wrap = false) => {
    if (!status) return <span className="text-slate-400 dark:text-[var(--text-disabled)] whitespace-nowrap">-</span>;
    const s = String(status);
    const textStyle = wrap
      ? 'whitespace-normal break-words max-w-xs inline-block text-left leading-normal font-semibold text-xs'
      : 'whitespace-nowrap inline-flex items-center font-semibold text-xs';

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
  };

  const allAvailableAuditColumns = useMemo(() => {
    if (!localRecords || localRecords.length === 0) {
      return [];
    }

    const firstRec = localRecords[0];
    const hasLoanId = localRecords.some(
      (r) =>
        (r.loan_id != null && String(r.loan_id).trim() !== '') ||
        (r.raw_data && ('Loan ID' in r.raw_data || 'loan_id' in r.raw_data))
    );
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
      data_field: {
        header: 'Data Field',
        accessor: 'data_field',
        sortable: true,
        headerClassName: 'sticky top-0 left-0 z-40 bg-[#24a1dd] border-r border-[#1b8ec5] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)] text-white',
        cellClassName: 'sticky left-0 z-10 bg-white dark:bg-[var(--bg-surface)] group-hover:bg-slate-50 dark:group-hover:bg-[var(--bg-elevated)] border-r border-slate-200 dark:border-[var(--border)] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]',
        render: (r) => <span className="font-semibold text-slate-900 dark:text-[var(--text-primary)]">{r.data_field}</span>,
        category: 'Excel Column'
      },
      loan_id: {
        header: 'Loan ID',
        accessor: 'loan_id',
        sortable: true,
        filterable: false,
        render: (r) => <span className="whitespace-nowrap font-medium text-slate-600 dark:text-[var(--text-secondary)]">{r.loan_id || '-'}</span>,
        category: 'Excel Column'
      },
      data_label: {
        header: 'Data Label',
        accessor: 'data_label',
        sortable: true,
        render: (r) => <span className="font-mono text-slate-600 dark:text-[var(--text-secondary)]">{r.data_label}</span>,
        category: 'Excel Column'
      },
      true_data: {
        header: 'True Data',
        accessor: 'true_data',
        sortable: true,
        render: (r) => <span className="font-medium text-slate-900 dark:text-[var(--text-primary)] break-words whitespace-pre-wrap max-w-xs block leading-snug">{r.true_data || ''}</span>,
        category: 'Excel Column'
      }
    };

    const cols = [];

    excelCols.forEach((colName) => {
      if (isExcludedAuditColumn(colName)) return;

      let accKey = colName;
      if (colName === 'Data Field') accKey = 'data_field';
      else if (colName === 'Loan ID') accKey = 'loan_id';
      else if (colName === 'Data Label') accKey = 'data_label';
      else if (colName === 'True Data') accKey = 'true_data';

      if (baseColumnsMap[accKey]) {
        if (!cols.some((c) => c.accessor === accKey)) {
          cols.push(baseColumnsMap[accKey]);
        }
      } else {
        if (!cols.some((c) => c.accessor === colName)) {
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
    mandatoryFields.forEach((k) => {
      if (!cols.some((c) => c.accessor === k)) {
        cols.unshift(baseColumnsMap[k]);
      }
    });

    cols.push(
      {
        header: 'Loan Id',
        accessor: 'pkg_loan_id',
        sortable: false,
        filterable: false,
        render: () => (
          <span className="font-mono text-xs font-semibold text-slate-700 dark:text-[var(--text-primary)] whitespace-nowrap">
            {loanId || '-'}
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
            {packageUsername || '-'}
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
            {packageEmail || '-'}
          </span>
        ),
        category: 'Package Info'
      }
    );

    cols.push(
      {
        header: 'Condition Text',
        accessor: 'condition_text',
        sortable: true,
        headerClassName: 'whitespace-nowrap min-w-[240px]',
        filterType: 'text',
        filterValue: (r) => {
          const val = r.condition_text ?? r['Condition Text'] ?? r.raw_data?.['Condition Text'] ?? '';
          return val !== null && val !== undefined && String(val).trim() !== '' ? String(val).trim() : '(Blank)';
        },
        sortValue: (r) => r.condition_text ?? r['Condition Text'] ?? r.raw_data?.['Condition Text'] ?? '',
        render: (r) => (
          <span className="text-slate-600 dark:text-[var(--text-secondary)] break-words whitespace-pre-wrap max-w-sm block leading-relaxed text-xs">
            {r.condition_text ?? r['Condition Text'] ?? r.raw_data?.['Condition Text'] ?? ''}
          </span>
        ),
        category: 'Validation'
      },
      {
        header: 'Condition Outcome',
        accessor: 'condition_outcome',
        sortable: true,
        headerClassName: 'whitespace-nowrap min-w-[220px]',
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
            <div className="text-xs break-words whitespace-pre-wrap max-w-sm leading-relaxed space-y-1">
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
        headerClassName: 'whitespace-nowrap font-bold text-white',
        render: (r) => <span className="break-words whitespace-pre-wrap max-w-xs block leading-snug font-bold">{getStatusBadge(r.final_result || r.result, true)}</span>,
        category: 'Validation'
      },
      {
        header: 'Final Remarks',
        accessor: 'final_remarks',
        sortable: true,
        render: (r) => <span className="text-slate-700 dark:text-[var(--text-primary)] break-words whitespace-pre-wrap max-w-sm block leading-snug font-medium">{r.final_remarks || ''}</span>,
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
            className={`w-full bg-white dark:bg-[var(--bg-elevated)] border border-slate-300 dark:border-[var(--border-strong)] rounded-lg px-2.5 py-1 text-xs font-semibold focus:ring-2 focus:ring-[var(--focus-ring)] focus:outline-none transition-colors cursor-pointer ${
              r.action === 'Corrected'
                ? 'text-emerald-700 dark:text-[var(--success)]'
                : r.action === 'Incorrect Status'
                ? 'text-rose-700 dark:text-[var(--error)]'
                : r.action === 'Not Applicable'
                ? 'text-slate-600 dark:text-[var(--text-secondary)]'
                : r.action === 'Need Review'
                ? 'text-amber-700 dark:text-[var(--warning)]'
                : r.action === 'Review completed' || r.action === 'Review Completed'
                ? 'text-teal-700 dark:text-[#2DD4BF]'
                : r.action === 'Out of Scope'
                ? 'text-purple-700 dark:text-[#C084FC]'
                : r.action === 'Others'
                ? 'text-blue-700 dark:text-[var(--info)]'
                : 'text-slate-700 dark:text-[var(--text-primary)]'
            }`}
          >
            <option value="" className="bg-white dark:bg-[var(--bg-surface)] text-slate-700 dark:text-[var(--text-primary)]">-- Select --</option>
            <option value="Corrected" className="bg-white dark:bg-[var(--bg-surface)] text-emerald-700 dark:text-[var(--success)]">Corrected</option>
            <option value="Incorrect Status" className="bg-white dark:bg-[var(--bg-surface)] text-rose-700 dark:text-[var(--error)]">Incorrect Status</option>
            <option value="Not Applicable" className="bg-white dark:bg-[var(--bg-surface)] text-slate-600 dark:text-[var(--text-secondary)]">Not Applicable</option>
            <option value="Need Review" className="bg-white dark:bg-[var(--bg-surface)] text-amber-700 dark:text-[var(--warning)]">Need Review</option>
            <option value="Review completed" className="bg-white dark:bg-[var(--bg-surface)] text-teal-700 dark:text-[#2DD4BF]">Review completed</option>
            {r.action === 'Review Completed' && <option value="Review Completed" className="bg-white dark:bg-[var(--bg-surface)] text-teal-700 dark:text-[#2DD4BF]">Review Completed</option>}
            <option value="Out of Scope" className="bg-white dark:bg-[var(--bg-surface)] text-purple-700 dark:text-[#C084FC]">Out of Scope</option>
            <option value="Others" className="bg-white dark:bg-[var(--bg-surface)] text-blue-700 dark:text-[var(--info)]">Others</option>
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
            className="w-full bg-white dark:bg-[var(--bg-elevated)] border border-slate-300 dark:border-[var(--border-strong)] rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-[var(--text-primary)] placeholder-slate-400 dark:placeholder-[var(--text-disabled)] focus:ring-2 focus:ring-[var(--focus-ring)] focus:border-[var(--focus-ring)] focus:outline-none transition-all resize-y min-h-[42px]"
          />
        ),
        category: 'Audit'
      }
    );

    return cols.filter(
      (c) =>
        c.header !== 'condition_text' &&
        c.header !== 'condition_outcome' &&
        !(c.category === 'Excel Column' && (c.accessor === 'Condition Text' || c.accessor === 'Condition Outcome'))
    );
  }, [localRecords, packageUsername, packageEmail, loanId]);

  const visibleAuditColumns = useMemo(() => {
    if (!allAvailableAuditColumns || allAvailableAuditColumns.length === 0) return [];
    const activeKeys = selectedColumnKeys && selectedColumnKeys.length > 0 ? selectedColumnKeys : DEFAULT_SELECTED_COLUMNS;
    const colMap = new Map(allAvailableAuditColumns.map((c) => [c.accessor, c]));
    return activeKeys.map((k) => colMap.get(k)).filter(Boolean);
  }, [allAvailableAuditColumns, selectedColumnKeys]);

  const handleColumnOrderChange = async (newOrderedKeys) => {
    setSelectedColumnKeys(newOrderedKeys);
    try {
      await userPreferencesService.saveColumnPreferences('package_audit', newOrderedKeys);
      notify.success('Column order updated');
    } catch (e) {
      console.error('Failed to save reordered columns:', e);
    }
  };

  const customHeaderControls = (
    <div className="flex items-center gap-3">
      <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-semibold text-[var(--text-primary)] bg-[var(--bg-elevated)] border border-[var(--border)] px-3.5 py-1.5 rounded-xl hover:bg-[var(--bg-muted)] transition-all select-none shadow-2xs">
        <input
          type="checkbox"
          className="rounded border-[var(--border-strong)] text-[var(--primary)] focus:ring-[var(--focus-ring)] h-4 w-4 cursor-pointer accent-[var(--primary)]"
          checked={showAll}
          onChange={(e) => setShowAll(e.target.checked)}
        />
        <span>Show All</span>
      </label>
      <Tooltip text="Manage Columns" position="bottom">
        <button
          type="button"
          onClick={() => setShowManageColumnsModal(true)}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-primary)] text-xs font-semibold rounded-xl hover:bg-[var(--bg-muted)] transition-all shadow-2xs cursor-pointer select-none"
          aria-label="Manage Columns"
        >
          <svg className="w-4 h-4 text-[var(--text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2m0 10V7m6 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
          </svg>
          <span className="px-1.5 py-0.5 text-[10px] font-bold bg-[var(--primary-soft)] text-[var(--primary)] rounded-full border border-[var(--primary)]/30">
            {visibleAuditColumns.length}/{allAvailableAuditColumns.length}
          </span>
        </button>
      </Tooltip>
    </div>
  );

  return (
    <div className="h-screen flex flex-col bg-[var(--bg-app)] text-[var(--text-primary)] overflow-hidden pt-[60px] transition-colors duration-200">
      <Header />

      {/* Main Page Container */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Top Control Bar */}
        <div className="px-4 sm:px-6 py-2.5 border-b border-[var(--border)] bg-[var(--bg-header)] flex items-center justify-between flex-shrink-0 shadow-2xs z-10">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="p-1.5 rounded-lg border border-[var(--border)] hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer shrink-0"
              title="Back to Dashboard"
              aria-label="Back to Dashboard"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>

            <div className="w-8 h-8 rounded-lg bg-[var(--success-bg)] border border-[var(--success)]/30 text-[var(--success)] flex items-center justify-center shadow-2xs shrink-0">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>

            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-bold text-[var(--text-primary)] flex items-center flex-wrap gap-2 truncate">
                <span>Package Audit:</span>
                <span className="font-semibold text-[var(--text-primary)] truncate">{packageDetails?.package?.filename || (detailsLoading ? 'Loading...' : 'Package')}</span>
                {loanId && (
                  <span className="font-semibold text-[var(--text-secondary)] text-xs sm:text-sm">
                    (Loan Id - {loanId})
                  </span>
                )}
              </h1>
              {localRecords.length > 0 && (
                <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)] mt-0.5">
                  <span>Total: <strong>{localRecords.length}</strong> fields</span>
                  <span>•</span>
                  <span className="text-[var(--text-secondary)] font-medium">
                    Showing {modalRecordsFiltered.length} {showAll ? '(All)' : '(Invalid only)'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            <Tooltip text="Download Excel Report" position="bottom">
              <button
                type="button"
                onClick={handleDownloadExcel}
                disabled={detailsLoading || !packageDetails}
                className="inline-flex items-center justify-center p-2 sm:p-2 border border-[var(--border)] bg-[var(--bg-surface)] hover:bg-[var(--success-bg)] hover:border-[var(--success)]/40 text-[var(--success)] disabled:opacity-50 font-semibold rounded-xl text-xs sm:text-sm transition-all shadow-2xs hover:shadow-xs cursor-pointer select-none"
                aria-label="Download Excel Report"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </button>
            </Tooltip>
            <button
              type="button"
              onClick={handleDiscard}
              disabled={updateLoading || detailsLoading}
              className="px-3 py-1.5 border border-[var(--border-strong)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-muted)] disabled:opacity-50 text-[var(--text-primary)] font-semibold rounded-xl text-xs sm:text-sm transition-all cursor-pointer"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={handleUpdate}
              disabled={updateLoading || detailsLoading}
              className="px-4 py-1.5 bg-[var(--primary)] hover:bg-[var(--primary-hover)] disabled:opacity-60 text-white font-semibold rounded-xl text-xs sm:text-sm shadow-sm hover:shadow-md flex items-center gap-2 transition-all cursor-pointer"
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
              onClick={() => navigate('/dashboard')}
              disabled={updateLoading}
              className="px-3.5 py-1.5 border border-[var(--border)] bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-semibold rounded-xl text-xs sm:text-sm transition-all cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>

        {/* Feedback Banners */}
        {updateMessage && (
          <div className="px-5 py-2 bg-[var(--success-bg)] border-b border-[var(--success)]/40 text-xs sm:text-sm text-[var(--success)] font-semibold flex items-center justify-between">
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4 text-[var(--success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {updateMessage}
            </span>
            <button onClick={() => setUpdateMessage('')} className="text-[var(--success)] hover:opacity-80 text-xs font-bold cursor-pointer">✕</button>
          </div>
        )}
        {updateError && (
          <div className="px-5 py-2 bg-[var(--error-bg)] border-b border-[var(--error)]/40 text-xs sm:text-sm text-[var(--error)] font-semibold flex items-center justify-between">
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4 text-[var(--error)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {updateError}
            </span>
            <button onClick={() => setUpdateError('')} className="text-[var(--error)] hover:opacity-80 text-xs font-bold cursor-pointer">✕</button>
          </div>
        )}

        {/* Content Body Area */}
        <div className="flex-1 bg-[var(--bg-app)] flex flex-col min-h-0 overflow-hidden">
          {detailsLoading ? (
            <ModalSkeleton />
          ) : detailsError ? (
            <div className="flex-1 flex items-center justify-center p-8 bg-[var(--bg-surface)] text-[var(--error)]">
              <div className="text-center max-w-md">
                <p className="font-bold text-base mb-2">Error Retrieving Package Details</p>
                <p className="text-sm text-[var(--error)] mb-4">{detailsError}</p>
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={fetchDetails}
                    className="px-4 py-2 bg-[var(--error-bg)] hover:opacity-90 text-[var(--error)] font-semibold rounded-xl text-xs transition-colors cursor-pointer"
                  >
                    Retry
                  </button>
                  <button
                    onClick={() => navigate('/dashboard')}
                    className="px-4 py-2 bg-[var(--bg-elevated)] hover:bg-[var(--bg-muted)] text-[var(--text-primary)] font-semibold rounded-xl text-xs transition-colors cursor-pointer"
                  >
                    Back to Dashboard
                  </button>
                </div>
              </div>
            </div>
          ) : packageDetails ? (
            activeSheet === 'results' ? (
              /* TAB 1: RESULT SHEET DATATABLE */
              <div className="flex-1 flex flex-col bg-[var(--bg-surface)] overflow-hidden p-3 pb-2 min-h-0">
                <DataTable
                  data={modalRecordsFiltered}
                  columns={visibleAuditColumns}
                  searchable={true}
                  pagination={true}
                  itemsPerPageOptions={[10, 25, 50, 100]}
                  defaultItemsPerPage={25}
                  emptyMessage="No matching records found."
                  customHeader={customHeaderControls}
                  density="compact"
                  maxHeight="100%"
                  className="flex flex-col min-h-0 h-full flex-1"
                  onColumnOrderChange={handleColumnOrderChange}
                />
              </div>
            ) : (
              /* TAB 2: SUMMARY SHEET */
              <div className="flex-1 bg-[var(--bg-app)] p-6 sm:p-8 overflow-y-auto smooth-scroll custom-scrollbar">
                <div className="max-w-5xl mx-auto space-y-8">
                  {/* General Summary Card */}
                  <div className="bg-[var(--bg-surface)] rounded-3xl border border-[var(--border)] shadow-sm p-6">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-6">General Statistics</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                      <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-2xl p-4 text-center">
                        <div className="text-3xl font-extrabold text-[var(--text-primary)]">{packageDetails.summary?.["Total Fields"] ?? 0}</div>
                        <div className="text-xs text-[var(--text-secondary)] mt-1 font-semibold">Total Fields</div>
                      </div>
                      <div className="bg-[var(--success-bg)] border border-[var(--success)]/30 rounded-2xl p-4 text-center">
                        <div className="text-3xl font-extrabold text-[var(--success)]">{packageDetails.summary?.["Final Valid"] ?? 0}</div>
                        <div className="text-xs text-[var(--success)] mt-1 font-semibold">Final Valid</div>
                      </div>
                      <div className="bg-[var(--error-bg)] border border-[var(--error)]/30 rounded-2xl p-4 text-center">
                        <div className="text-3xl font-extrabold text-[var(--error)]">{packageDetails.summary?.["Final Invalid"] ?? 0}</div>
                        <div className="text-xs text-[var(--error)] mt-1 font-semibold">Final Invalid</div>
                      </div>
                      <div className="bg-[var(--warning-bg)] border border-[var(--warning)]/30 rounded-2xl p-4 text-center">
                        <div className="text-3xl font-extrabold text-[var(--warning)]">{packageDetails.summary?.["Review Required"] ?? 0}</div>
                        <div className="text-xs text-[var(--warning)] mt-1 font-semibold">Review Required</div>
                      </div>
                    </div>
                  </div>

                  {/* Detailed Analysis Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* Dictionary Matches */}
                    <div className="bg-[var(--bg-surface)] rounded-3xl border border-[var(--border)] shadow-sm p-6 space-y-4">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] border-b border-[var(--border)] pb-2">
                        Dictionary Match Checks ({packageDetails.summary?.["Total Fields"] ?? 0} Total)
                      </h4>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-[var(--text-secondary)] font-semibold">Matched Fields</span>
                          <span className="font-bold text-[var(--success)]">{packageDetails.summary?.["Matched"] ?? 0}</span>
                        </div>
                        <div className="w-full bg-[var(--bg-elevated)] rounded-full h-2">
                          <div
                            className="bg-[var(--success)] h-2 rounded-full transition-all duration-500"
                            style={{
                              width: `${
                                packageDetails.summary?.["Total Fields"]
                                  ? (packageDetails.summary["Matched"] / packageDetails.summary["Total Fields"]) * 100
                                  : 0
                              }%`
                            }}
                          />
                        </div>
                        <div className="flex justify-between items-center text-sm pt-2">
                          <span className="text-[var(--text-secondary)] font-semibold">Unmatched Fields</span>
                          <span className="font-bold text-[var(--error)]">{packageDetails.summary?.["Unmatched"] ?? 0}</span>
                        </div>
                      </div>
                    </div>

                    {/* Data Type Checks */}
                    <div className="bg-[var(--bg-surface)] rounded-3xl border border-[var(--border)] shadow-sm p-6 space-y-4">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] border-b border-[var(--border)] pb-2">
                        Data Type Validation ({((packageDetails.summary?.["Type Pass"] ?? 0) + (packageDetails.summary?.["Type Fail"] ?? 0) + (packageDetails.summary?.["Blank Values"] ?? 0))} Total)
                      </h4>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-[var(--text-secondary)] font-semibold">Type Check Pass</span>
                          <span className="font-bold text-[var(--success)]">{packageDetails.summary?.["Type Pass"] ?? 0}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-[var(--text-secondary)] font-semibold">Type Check Fail</span>
                          <span className="font-bold text-[var(--error)]">{packageDetails.summary?.["Type Fail"] ?? 0}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-[var(--text-secondary)] font-semibold">Blank Values (N/A)</span>
                          <span className="font-bold text-[var(--text-disabled)]">{packageDetails.summary?.["Blank Values"] ?? 0}</span>
                        </div>
                      </div>
                    </div>

                    {/* Enum Checks */}
                    <div className="bg-[var(--bg-surface)] rounded-3xl border border-[var(--border)] shadow-sm p-6 space-y-4">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] border-b border-[var(--border)] pb-2">
                        Enumeration Checks ({packageDetails.summary?.["Total Enum"] ?? 0} Total)
                      </h4>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-[var(--text-secondary)] font-semibold">Enum Valid</span>
                          <span className="font-bold text-[var(--success)]">{packageDetails.summary?.["Enum Pass"] ?? 0}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-[var(--text-secondary)] font-semibold">Format Variance (Warnings)</span>
                          <span className="font-bold text-[var(--warning)]">{packageDetails.summary?.["Enum Format Variance"] ?? 0}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-[var(--text-secondary)] font-semibold">Enum Fail</span>
                          <span className="font-bold text-[var(--error)]">{packageDetails.summary?.["Enum Fail"] ?? 0}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-[var(--text-secondary)] font-semibold">Enum No List</span>
                          <span className="font-bold text-[var(--text-disabled)]">{packageDetails.summary?.["Enum No List"] ?? 0}</span>
                        </div>
                      </div>
                    </div>

                    {/* Condition Validation */}
                    {condSummary && (
                      <div className="bg-[var(--bg-surface)] rounded-3xl border border-[var(--border)] shadow-sm p-6 space-y-4 md:col-span-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-2">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                            Condition Validation ({condSummary.condRulesApplied} Rules Applied)
                          </h4>
                          <span className="text-xs font-medium text-[var(--text-secondary)]">
                            {condSummary.condTotal} Total Fields Evaluated
                          </span>
                        </div>

                        {condSummary.condRulesApplied > 0 && (
                          <div className="space-y-1.5">
                            <div className="flex justify-between text-xs font-semibold text-[var(--text-primary)]">
                              <span>Applied Rules Outcome</span>
                              <span>{condSummary.condValid + condSummary.condValidPartial} / {condSummary.condRulesApplied} Passing</span>
                            </div>
                            <div className="w-full bg-[var(--bg-elevated)] rounded-full h-2.5 overflow-hidden flex shadow-inner">
                              <div
                                className="bg-[var(--success)] h-full transition-all duration-500"
                                style={{ width: `${(condSummary.condValid / condSummary.condRulesApplied) * 100}%` }}
                                title={`Valid: ${condSummary.condValid}`}
                              />
                              <div
                                className="bg-[#2DD4BF] h-full transition-all duration-500"
                                style={{ width: `${(condSummary.condValidPartial / condSummary.condRulesApplied) * 100}%` }}
                                title={`Valid - Partial: ${condSummary.condValidPartial}`}
                              />
                              <div
                                className="bg-[var(--error)] h-full transition-all duration-500"
                                style={{ width: `${(condSummary.condInvalid / condSummary.condRulesApplied) * 100}%` }}
                                title={`Invalid: ${condSummary.condInvalid}`}
                              />
                              <div
                                className="bg-[var(--warning)] h-full transition-all duration-500"
                                style={{ width: `${(condSummary.condNotAutomated / condSummary.condRulesApplied) * 100}%` }}
                                title={`Not Automated: ${condSummary.condNotAutomated}`}
                              />
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
                          <div className="bg-[var(--success-bg)] border border-[var(--success)]/30 rounded-xl p-3">
                            <div className="text-xs text-[var(--success)] font-semibold">Valid</div>
                            <div className="text-xl font-bold text-[var(--success)] mt-0.5">{condSummary.condValid}</div>
                          </div>
                          <div className="bg-[#2DD4BF]/12 border border-[#2DD4BF]/30 rounded-xl p-3">
                            <div className="text-xs text-[#2DD4BF] font-semibold">Valid - Partial</div>
                            <div className="text-xl font-bold text-[#2DD4BF] mt-0.5">{condSummary.condValidPartial}</div>
                          </div>
                          <div className="bg-[var(--error-bg)] border border-[var(--error)]/30 rounded-xl p-3">
                            <div className="text-xs text-[var(--error)] font-semibold">Invalid</div>
                            <div className="text-xl font-bold text-[var(--error)] mt-0.5">{condSummary.condInvalid}</div>
                          </div>
                          <div className="bg-[var(--warning-bg)] border border-[var(--warning)]/30 rounded-xl p-3">
                            <div className="text-xs text-[var(--warning)] font-semibold">Not Automated</div>
                            <div className="text-xl font-bold text-[var(--warning)] mt-0.5">{condSummary.condNotAutomated}</div>
                          </div>
                          <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl p-3">
                            <div className="text-xs text-[var(--text-secondary)] font-semibold">Condition Not Met</div>
                            <div className="text-xl font-bold text-[var(--text-primary)] mt-0.5">{condSummary.condNotMet}</div>
                          </div>
                          <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl p-3">
                            <div className="text-xs text-[var(--text-secondary)] font-semibold">No Rule</div>
                            <div className="text-xl font-bold text-[var(--text-primary)] mt-0.5">{condSummary.condNoRule}</div>
                          </div>
                          <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl p-3">
                            <div className="text-xs text-[var(--text-secondary)] font-semibold">Blank Value</div>
                            <div className="text-xl font-bold text-[var(--text-primary)] mt-0.5">{condSummary.condBlank}</div>
                          </div>
                          <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl p-3">
                            <div className="text-xs text-[var(--text-secondary)] font-semibold">Informational</div>
                            <div className="text-xl font-bold text-[var(--text-primary)] mt-0.5">{condSummary.condInfo}</div>
                          </div>
                          {condSummary.condUnclassified > 0 && (
                            <div className="bg-[#C084FC]/12 border border-[#C084FC]/30 rounded-xl p-3">
                              <div className="text-xs text-[#C084FC] font-semibold">Unclassified</div>
                              <div className="text-xl font-bold text-[#C084FC] mt-0.5">{condSummary.condUnclassified}</div>
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

        {/* Bottom Worksheet Tab Selector */}
        {!detailsLoading && !detailsError && packageDetails && (
          <div className="h-10 bg-[var(--bg-header)] border-t border-[var(--border)] flex items-center px-4 flex-shrink-0 select-none">
            <div className="flex items-center h-full gap-1">
              <button
                type="button"
                onClick={() => setActiveSheet('results')}
                className={`px-5 h-[34px] flex items-center gap-2 text-xs font-bold transition-all rounded-t-lg cursor-pointer ${
                  activeSheet === 'results'
                    ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] border-t-2 border-t-[var(--primary)] border-x border-[var(--border)] shadow-xs'
                    : 'bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'
                }`}
              >
                <svg className="w-3.5 h-3.5 text-[var(--primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Result Sheet
              </button>

              <button
                type="button"
                onClick={() => setActiveSheet('summary')}
                className={`px-5 h-[34px] flex items-center gap-2 text-xs font-bold transition-all rounded-t-lg cursor-pointer ${
                  activeSheet === 'summary'
                    ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] border-t-2 border-t-[var(--primary)] border-x border-[var(--border)] shadow-xs'
                    : 'bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'
                }`}
              >
                <svg className="w-3.5 h-3.5 text-[var(--primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
        selectedColumnKeys={selectedColumnKeys && selectedColumnKeys.length > 0 ? selectedColumnKeys : DEFAULT_SELECTED_COLUMNS}
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

export default PackageAuditPage;

