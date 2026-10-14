import * as XLSX from 'xlsx';

/**
 * Utility to export Package Audit / Validation records and summary to an Excel file with two sheets:
 * 1. Result Sheet (Row-level validation details)
 * 2. Summary Sheet (Aggregated summary metrics)
 *
 * @param {Object} params
 * @param {string} params.filename - Original file or package name
 * @param {Array} params.records - List of validation record objects
 * @param {Object} params.summary - Aggregated summary object
 * @param {string} [params.reportSuffix='_Audit_Report'] - Suffix added to generated file
 */
export const exportToExcel = ({
  filename = 'Loan_Package',
  records = [],
  summary = {},
  reportSuffix = '_Audit_Report'
}) => {
  const safeRecords = Array.isArray(records) ? records : [];
  const safeSummary = summary || {};

  const hasLoanId = safeRecords.some(r => (r.loan_id != null && String(r.loan_id).trim() !== '') || (r.raw_data && ('Loan ID' in r.raw_data || 'loan_id' in r.raw_data)));

  // 1. Map records to Excel row objects for "Result Sheet"
  const resultRows = safeRecords.map(r => {
    const rowObj = {};
    if (r.raw_data && typeof r.raw_data === 'object') {
      Object.entries(r.raw_data).forEach(([k, v]) => {
        rowObj[k] = v ?? '';
      });
    }

    // Ensure standard columns are populated
    if (!('Data Field' in rowObj)) rowObj['Data Field'] = r.data_field || '';
    if (hasLoanId && !('Loan ID' in rowObj)) rowObj['Loan ID'] = r.loan_id || '';
    if (!('Data Label' in rowObj)) rowObj['Data Label'] = r.data_label || '';
    if (!('True Data' in rowObj)) rowObj['True Data'] = r.true_data || '';

    // Add validation and audit outcome columns
    rowObj['Dict Match'] = r.dictionary_match_status || '';
    rowObj['Type Check'] = r.data_type_validation || '';
    rowObj['Type Remarks'] = r.data_type_remarks || '';
    rowObj['Numeric Format'] = r.numeric_format_flag || '';
    rowObj['Enum Check'] = r.enum_validation || '';
    rowObj['Enum Remarks'] = r.enum_remarks || '';
    rowObj['Macro Check'] = r.macro_validation_result || '';
    rowObj['Combined Result'] = r.result || '';
    rowObj['Condition Check'] = r.condition_validation || '';
    rowObj['Condition Remarks'] = r.condition_remarks || '';
    rowObj['Final Result'] = r.final_result || r.result || '';
    rowObj['Final Remarks'] = r.final_remarks || '';
    rowObj['Action'] = r.action || '';
    rowObj['User Remark'] = r.remark || '';

    return rowObj;
  });

  // Extract or derive condition validation counts
  const getCondVal = (rec) => {
    return rec.condition_validation ||
      rec['Condition Validation'] ||
      rec['Condition Check'] ||
      (rec.raw_data && (rec.raw_data['Condition Validation'] || rec.raw_data['condition_validation'])) ||
      '';
  };

  const condValid = safeSummary['Cond Valid'] ?? safeRecords.filter(r => getCondVal(r) === 'Valid').length;
  const condValidPartial = safeSummary['Cond Valid - Partial'] ?? safeRecords.filter(r => getCondVal(r) === 'Valid - partial').length;
  const condInvalid = safeSummary['Cond Invalid'] ?? safeRecords.filter(r => getCondVal(r) === 'Invalid').length;
  const condNotAutomated = safeSummary['Cond Not Automated'] ?? safeRecords.filter(r => getCondVal(r) === 'Not Automated').length;
  const condNoRule = safeSummary['Cond N/A - No Rule'] ?? safeRecords.filter(r => getCondVal(r) === 'N/A - no condition rule').length;
  const condNotMet = safeSummary['Cond N/A - Condition Not Met'] ?? safeRecords.filter(r => getCondVal(r) === 'N/A - condition not met').length;
  const condBlank = safeSummary['Cond N/A - Blank Value'] ?? safeRecords.filter(r => getCondVal(r) === 'N/A - blank value').length;
  const condInfo = safeSummary['Cond N/A - Informational'] ?? safeRecords.filter(r => getCondVal(r) === 'N/A - informational').length;

  const condRulesApplied = safeSummary['Cond Rules Applied'] ?? (condValid + condValidPartial + condInvalid + condNotAutomated);
  const condTotal = safeSummary['Cond Total (reconciles)'] ?? (safeSummary['Total Fields'] || safeRecords.length);
  const condKnown = condValid + condValidPartial + condInvalid + condNotAutomated + condNoRule + condNotMet + condBlank + condInfo;
  const condUnclassified = safeSummary['Cond Unclassified'] ?? (condTotal - condKnown > 0 ? condTotal - condKnown : 0);

  // 2. Map summary metrics for "Summary Sheet"
  const summaryRows = [
    { Section: 'General Statistics', Metric: 'Total Fields', Value: safeSummary['Total Fields'] ?? 0 },
    { Section: 'General Statistics', Metric: 'Final Valid', Value: safeSummary['Final Valid'] ?? 0 },
    { Section: 'General Statistics', Metric: 'Final Invalid', Value: safeSummary['Final Invalid'] ?? 0 },
    { Section: 'General Statistics', Metric: 'Final Blank', Value: safeSummary['Final Blank'] ?? 0 },

    { Section: 'Dictionary Match Checks', Metric: 'Total Fields', Value: safeSummary['Total Fields'] ?? 0 },
    { Section: 'Dictionary Match Checks', Metric: 'Matched Fields', Value: safeSummary['Matched'] ?? 0 },
    { Section: 'Dictionary Match Checks', Metric: 'Unmatched Fields', Value: safeSummary['Unmatched'] ?? 0 },

    { Section: 'Data Type Validation', Metric: 'Total Type Evaluated', Value: ((safeSummary['Type Pass'] ?? 0) + (safeSummary['Type Fail'] ?? 0) + (safeSummary['Blank Values'] ?? 0)) },
    { Section: 'Data Type Validation', Metric: 'Type Check Pass', Value: safeSummary['Type Pass'] ?? 0 },
    { Section: 'Data Type Validation', Metric: 'Type Check Fail', Value: safeSummary['Type Fail'] ?? 0 },
    { Section: 'Data Type Validation', Metric: 'Blank Values (N/A)', Value: safeSummary['Blank Values'] ?? 0 },

    { Section: 'Enumeration Checks', Metric: 'Total Enum Evaluated', Value: safeSummary['Total Enum'] ?? 0 },
    { Section: 'Enumeration Checks', Metric: 'Enum Valid', Value: safeSummary['Enum Pass'] ?? 0 },
    { Section: 'Enumeration Checks', Metric: 'Format Variance (Warnings)', Value: safeSummary['Enum Format Variance'] ?? 0 },
    { Section: 'Enumeration Checks', Metric: 'Enum Fail', Value: safeSummary['Enum Fail'] ?? 0 },
    { Section: 'Enumeration Checks', Metric: 'Enum No List', Value: safeSummary['Enum No List'] ?? 0 },

    { Section: 'Business Rule Modules', Metric: 'Total Macro Evaluated', Value: safeSummary['Total Macro'] ?? 0 },
    { Section: 'Business Rule Modules', Metric: 'Macro Valid', Value: safeSummary['Macro Valid'] ?? 0 },
    { Section: 'Business Rule Modules', Metric: 'Macro Fail', Value: safeSummary['Macro Invalid'] ?? 0 },

    { Section: 'Condition Validation', Metric: 'Total Fields Evaluated', Value: condTotal },
    { Section: 'Condition Validation', Metric: 'Rules Applied', Value: condRulesApplied },
    { Section: 'Condition Validation', Metric: 'Condition Valid', Value: condValid },
    { Section: 'Condition Validation', Metric: 'Condition Valid - Partial', Value: condValidPartial },
    { Section: 'Condition Validation', Metric: 'Condition Invalid', Value: condInvalid },
    { Section: 'Condition Validation', Metric: 'Condition Not Automated', Value: condNotAutomated },
    { Section: 'Condition Validation', Metric: 'N/A - Condition Not Met', Value: condNotMet },
    { Section: 'Condition Validation', Metric: 'N/A - No Rule', Value: condNoRule },
    { Section: 'Condition Validation', Metric: 'N/A - Blank Value', Value: condBlank },
    { Section: 'Condition Validation', Metric: 'N/A - Informational', Value: condInfo },
    ...(condUnclassified > 0 ? [{ Section: 'Condition Validation', Metric: 'Condition Unclassified', Value: condUnclassified }] : []),

    { Section: 'Overall Consolidated Verdict', Metric: 'Overall Valid', Value: safeSummary['Overall Valid'] ?? safeRecords.filter(r => (r.final_result || r['Final Result'] || '') === 'Valid').length },
    { Section: 'Overall Consolidated Verdict', Metric: 'Overall Invalid', Value: safeSummary['Overall Invalid'] ?? safeRecords.filter(r => (r.final_result || r['Final Result'] || '') === 'Invalid').length },
    { Section: 'Overall Consolidated Verdict', Metric: 'Overall Review Required', Value: safeSummary['Overall Review Required'] ?? safeRecords.filter(r => (r.final_result || r['Final Result'] || '') === 'Review Required').length },
    { Section: 'Overall Consolidated Verdict', Metric: 'Overall Not Validated', Value: safeSummary['Overall Not Validated'] ?? safeRecords.filter(r => (r.final_result || r['Final Result'] || '') === 'Not Validated').length },
  ];

  // Create empty workbook
  const workbook = XLSX.utils.book_new();

  // Create worksheets
  const wsResults = XLSX.utils.json_to_sheet(
    resultRows.length > 0 ? resultRows : [{ 'Data Field': 'No records available' }]
  );
  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);

  // Helper for column auto-sizing
  const autoFitCols = (ws, data) => {
    if (!data || data.length === 0) return;
    const cols = Object.keys(data[0]).map(key => {
      const maxLen = Math.max(
        key.length,
        ...data.map(row => String(row[key] ?? '').length)
      );
      return { wch: Math.min(Math.max(maxLen + 3, 12), 60) };
    });
    ws['!cols'] = cols;
  };

  autoFitCols(wsResults, resultRows);
  autoFitCols(wsSummary, summaryRows);

  // Append worksheets to workbook
  XLSX.utils.book_append_sheet(workbook, wsResults, 'Result Sheet');
  XLSX.utils.book_append_sheet(workbook, wsSummary, 'Summary Sheet');

  // Generate output filename
  const cleanName = filename ? String(filename).replace(/\.[^/.]+$/, '') : 'Loan_Package';
  const finalFilename = `${cleanName}${reportSuffix}.xlsx`;

  // Trigger browser file download
  XLSX.writeFile(workbook, finalFilename);
};

/**
 * Utility to export Prohance Report tabs to an Excel file with multiple sheets:
 * 1. Package Time Summary
 * 2. Unmapped Review
 * 3. Unverified Review
 * 4. Overall Activity
 * 5. Overall by User
 *
 * @param {Object} params
 * @param {string} params.filename - Original file or report name
 * @param {Object} params.tabs - Object with tabs data array for each tab ID
 * @param {string} [params.reportSuffix='_Prohance_Report'] - Suffix added to generated file
 */
export const exportProhanceToExcel = ({
  filename = 'Prohance_Report',
  tabs = {},
  reportSuffix = '_Prohance_Report'
}) => {
  const workbook = XLSX.utils.book_new();

  const tabSheetMap = [
    { key: 'package_time_summary', title: 'Package Time Summary' },
    { key: 'unmapped_requires_review', title: 'Unmapped Review' },
    { key: 'unverified_requires_review', title: 'Unverified Review' },
    { key: 'overall_activity_summary', title: 'Overall Activity' },
    { key: 'overall_by_user', title: 'Overall by User' },
  ];

  const autoFitCols = (ws, data) => {
    if (!data || data.length === 0) return;
    const cols = Object.keys(data[0]).map(key => {
      const maxLen = Math.max(
        key.length,
        ...data.map(row => String(row[key] ?? '').length)
      );
      return { wch: Math.min(Math.max(maxLen + 3, 12), 60) };
    });
    ws['!cols'] = cols;
  };

  tabSheetMap.forEach(({ key, title }) => {
    const rawRows = Array.isArray(tabs[key]) ? tabs[key] : [];
    const rows = rawRows.map(r => {
      const cleanRow = { ...r };
      delete cleanRow._id;
      delete cleanRow._sno;
      return cleanRow;
    });

    const ws = XLSX.utils.json_to_sheet(
      rows.length > 0 ? rows : [{ 'Status': 'No records available' }]
    );
    if (rows.length > 0) {
      autoFitCols(ws, rows);
    }
    XLSX.utils.book_append_sheet(workbook, ws, title);
  });

  const cleanName = filename ? String(filename).replace(/\.[^/.]+$/, '') : 'Prohance_Report';
  const finalFilename = `${cleanName}${reportSuffix}.xlsx`;

  XLSX.writeFile(workbook, finalFilename);
};

/**
 * Utility to export User Management records to an Excel file (.xlsx)
 *
 * @param {Object} params
 * @param {Array} params.users - List of user objects
 * @param {string} [params.filename='User_Management'] - Base name for the generated file
 */
export const exportUsersToExcel = ({
  users = [],
  filename = 'User_Management'
}) => {
  const safeUsers = Array.isArray(users) ? users : [];

  const rows = safeUsers.map((u, idx) => {
    const row = {
      'S.No': idx + 1,
      'Username': u.username ?? '',
      'Email': u.email ?? '',
      'Role': u.role ? (u.role.charAt(0).toUpperCase() + u.role.slice(1)) : ''
    };
    if (u.created_at) {
      row['Created At'] = u.created_at;
    }
    return row;
  });

  const workbook = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(
    rows.length > 0 ? rows : [{ 'S.No': '', 'Username': '', 'Email': '', 'Role': 'No users found' }]
  );

  if (rows.length > 0) {
    const cols = Object.keys(rows[0]).map(key => {
      const maxLen = Math.max(
        key.length,
        ...rows.map(row => String(row[key] ?? '').length)
      );
      return { wch: Math.min(Math.max(maxLen + 4, 12), 40) };
    });
    ws['!cols'] = cols;
  }

  XLSX.utils.book_append_sheet(workbook, ws, 'Users');

  const cleanName = filename ? String(filename).replace(/\.[^/.]+$/, '') : 'User_Management';
  const finalFilename = `${cleanName}.xlsx`;

  XLSX.writeFile(workbook, finalFilename);
};

export default exportToExcel;

