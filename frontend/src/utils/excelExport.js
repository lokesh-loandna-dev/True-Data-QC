import * as XLSX from 'xlsx';
import { extractLoanId } from './loanUtils';

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
 * @param {string} [params.loanId] - Loan ID string (e.g. 26070036249)
 * @param {string} [params.username] - Uploader username
 * @param {string} [params.email] - Uploader email
 */
export const exportToExcel = ({
  filename = 'Loan_Package',
  records = [],
  summary = {},
  reportSuffix = '_Audit_Report',
  loanId = '',
  username = '',
  email = ''
}) => {
  const safeRecords = Array.isArray(records) ? records : [];
  const safeSummary = summary || {};

  // Resolve package-level metadata fallbacks if not explicitly provided
  let effectiveLoanId = loanId || '';
  if (!effectiveLoanId && safeRecords.length > 0) {
    effectiveLoanId = extractLoanId(safeRecords, null) || '';
  }
  if (!effectiveLoanId && filename) {
    const m = String(filename).match(/(?:loan\s*id|loanid)[^\d]*(\d+)/i) || String(filename).match(/\b(\d{7,12})\b/);
    if (m) effectiveLoanId = m[1];
  }

  let effectiveUsername = username || '';
  if (!effectiveUsername && safeRecords.length > 0) {
    const foundUser = safeRecords.find(r => r.pkg_username || r.username || r.uploaded_by);
    if (foundUser) {
      effectiveUsername = foundUser.pkg_username || foundUser.username || foundUser.uploaded_by || '';
    }
  }

  let effectiveEmail = email || '';
  if (!effectiveEmail && safeRecords.length > 0) {
    const foundEmail = safeRecords.find(r => r.pkg_email || r.email || r.uploaded_email);
    if (foundEmail) {
      effectiveEmail = foundEmail.pkg_email || foundEmail.email || foundEmail.uploaded_email || '';
    }
  }

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
    if (!('Data Label' in rowObj)) rowObj['Data Label'] = r.data_label || '';
    if (!('True Data' in rowObj)) rowObj['True Data'] = r.true_data || '';

    // Remove legacy or duplicate raw loan id keys if present to avoid duplicate columns
    delete rowObj['Loan ID'];
    delete rowObj['loan_id'];

    // Add newly added Package Info columns (Loan Id, Username, Email) matching preview table
    const rowLoanId = r.pkg_loan_id ?? (r.loan_id != null && String(r.loan_id).trim() !== '' ? String(r.loan_id).trim() : null) ?? (r.raw_data && (r.raw_data['Loan ID'] || r.raw_data['loan_id'] || r.raw_data['Loan Id'])) ?? effectiveLoanId ?? '';
    const rowUsername = r.pkg_username ?? r.uploaded_by ?? r.username ?? effectiveUsername ?? '';
    const rowEmail = r.pkg_email ?? r.uploaded_email ?? r.email ?? effectiveEmail ?? '';

    rowObj['Loan Id'] = rowLoanId;
    rowObj['Username'] = rowUsername;
    rowObj['Email'] = rowEmail;

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

  const getFinalResultVal = (r) => {
    return String(r.final_result ?? r['Final Result'] ?? r.result ?? r['Result'] ?? '').trim();
  };

  const finalValidCount = safeSummary['Final Valid'] ?? safeRecords.filter(r => getFinalResultVal(r) === 'Valid').length;
  const finalInvalidCount = safeSummary['Final Invalid'] ?? safeRecords.filter(r => getFinalResultVal(r) === 'Invalid').length;
  const reviewRequiredCount = safeSummary['Review Required'] ?? safeRecords.filter(r => getFinalResultVal(r) === 'Review Required').length;
  const finalBlankCount = safeSummary['Final Blank'] ?? safeRecords.filter(r => String(r.data_type_validation ?? r['Data Type Validation'] ?? '').startsWith('N/A - blank')).length;
  const totalFieldsCount = safeSummary['Total Fields'] ?? safeRecords.length;

  // 2. Map summary metrics for "Summary Sheet"
  const summaryRows = [
    { Section: 'General Statistics', Metric: 'Total Fields', Value: totalFieldsCount },
    { Section: 'General Statistics', Metric: 'Final Valid', Value: finalValidCount },
    { Section: 'General Statistics', Metric: 'Final Invalid', Value: finalInvalidCount },
    { Section: 'General Statistics', Metric: 'Review Required', Value: reviewRequiredCount },

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
      'Role': !u.role
        ? ''
        : u.role === '--selected--'
        ? '--selected--'
        : u.role
            .split(' ')
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' '),
      'Status': u.status === 'active' ? 'Active' : u.status === 'rejected' ? 'Rejected' : 'Pending Approval'
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

/**
 * Utility to export Dashboard Loan Packages records to an Excel file (.xlsx)
 *
 * @param {Object} params
 * @param {Array} params.packages - List of package objects
 * @param {string} [params.filename='Loan_Packages'] - Base name for the generated file
 */
export const exportPackagesToExcel = ({
  packages = [],
  filename = 'Loan_Packages'
}) => {
  const safePackages = Array.isArray(packages) ? packages : [];

  const rows = safePackages.map((pkg, idx) => {
    const row = {
      'S.No': idx + 1,
      'File Name': pkg.filename ?? '',
      'Loan ID': pkg.loan_id ?? '',
    };
    if (pkg.uploaded_by !== undefined) {
      row['Uploaded By'] = pkg.uploaded_by || 'System';
    }
    const parsedDate = pkg.uploaded_at
      ? (typeof pkg.uploaded_at === 'string' && !pkg.uploaded_at.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(pkg.uploaded_at)
          ? new Date(pkg.uploaded_at + 'Z')
          : new Date(pkg.uploaded_at))
      : null;
    row['Date Uploaded'] = parsedDate && !isNaN(parsedDate.getTime())
      ? parsedDate.toLocaleString()
      : '';
    row['Total Fields'] = pkg.total_fields ?? 0;
    row['Final Valid'] = pkg.final_valid ?? 0;
    row['Final Invalid'] = pkg.final_invalid ?? 0;
    row['Review Required'] = pkg.review_required ?? 0;
    row['Yet to Take Action'] = pkg.yet_to_take_action ?? 0;
    row['Corrected'] = pkg.action_corrected ?? 0;
    row['Incorrect Status'] = pkg.action_incorrect_status ?? 0;
    row['Not Applicable'] = pkg.action_not_applicable ?? 0;
    row['Need Review'] = pkg.action_need_review ?? 0;
    row['Review Completed'] = pkg.action_review_completed ?? 0;
    row['Out of Scope'] = pkg.action_out_of_scope ?? 0;
    row['Others'] = pkg.action_others ?? 0;

    return row;
  });

  const workbook = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(
    rows.length > 0
      ? rows
      : [{
          'S.No': '',
          'File Name': 'No loan packages found',
          'Loan ID': '',
          'Uploaded By': '',
          'Date Uploaded': '',
          'Total Fields': '',
          'Final Valid': '',
          'Final Invalid': '',
          'Review Required': '',
          'Yet to Take Action': '',
          'Corrected': '',
          'Incorrect Status': '',
          'Not Applicable': '',
          'Need Review': '',
          'Review Completed': '',
          'Out of Scope': '',
          'Others': ''
        }]
  );

  if (rows.length > 0) {
    const cols = Object.keys(rows[0]).map(key => {
      const maxLen = Math.max(
        key.length,
        ...rows.map(row => String(row[key] ?? '').length)
      );
      return { wch: Math.min(Math.max(maxLen + 4, 12), 45) };
    });
    ws['!cols'] = cols;
  }

  XLSX.utils.book_append_sheet(workbook, ws, 'Loan Packages');

  const cleanName = filename ? String(filename).replace(/\.[^/.]+$/, '') : 'Loan_Packages';
  const finalFilename = `${cleanName}.xlsx`;

  XLSX.writeFile(workbook, finalFilename);
};

export const exportDashboardPackagesToExcel = exportPackagesToExcel;

/**
 * Utility to export combined Result Sheet for multiple packages appended sequentially.
 * Only generates 'Result Sheet' (no Summary Sheet).
 *
 * @param {Object} params
 * @param {Array} params.packagesData - Array of { pkg, records } objects
 * @param {string} [params.filename] - Base name for the exported file
 */
export const exportBulkPackagesResultToExcel = ({
  packagesData = [],
  filename = 'Bulk_Loan_Packages_Audit_Report'
}) => {
  const safeData = Array.isArray(packagesData) ? packagesData : [];
  const combinedResultRows = [];

  safeData.forEach(({ pkg, records }) => {
    const pkgFilename = pkg?.filename || 'Unknown';
    const safeRecords = Array.isArray(records) ? records : [];

    let effectiveLoanId = pkg?.loan_id || '';
    if (!effectiveLoanId && safeRecords.length > 0) {
      effectiveLoanId = extractLoanId(safeRecords, null) || '';
    }
    if (!effectiveLoanId && pkgFilename) {
      const m = String(pkgFilename).match(/(?:loan\s*id|loanid)[^\d]*(\d+)/i) || String(pkgFilename).match(/\b(\d{7,12})\b/);
      if (m) effectiveLoanId = m[1];
    }

    const effectiveUsername = pkg?.uploaded_by || '';
    const effectiveEmail = pkg?.uploaded_email || '';

    safeRecords.forEach(r => {
      const rowObj = {};
      rowObj['File Name'] = pkgFilename;

      if (r.raw_data && typeof r.raw_data === 'object') {
        Object.entries(r.raw_data).forEach(([k, v]) => {
          rowObj[k] = v ?? '';
        });
      }

      // Ensure standard columns are populated
      if (!('Data Field' in rowObj)) rowObj['Data Field'] = r.data_field || '';
      if (!('Data Label' in rowObj)) rowObj['Data Label'] = r.data_label || '';
      if (!('True Data' in rowObj)) rowObj['True Data'] = r.true_data || '';

      // Remove duplicate raw loan id keys
      delete rowObj['Loan ID'];
      delete rowObj['loan_id'];

      const rowLoanId = r.pkg_loan_id ?? (r.loan_id != null && String(r.loan_id).trim() !== '' ? String(r.loan_id).trim() : null) ?? (r.raw_data && (r.raw_data['Loan ID'] || r.raw_data['loan_id'] || r.raw_data['Loan Id'])) ?? effectiveLoanId ?? '';
      const rowUsername = r.pkg_username ?? r.uploaded_by ?? r.username ?? effectiveUsername ?? '';
      const rowEmail = r.pkg_email ?? r.uploaded_email ?? r.email ?? effectiveEmail ?? '';

      rowObj['Loan Id'] = rowLoanId;
      rowObj['Username'] = rowUsername;
      rowObj['Email'] = rowEmail;

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

      combinedResultRows.push(rowObj);
    });
  });

  const workbook = XLSX.utils.book_new();
  const wsResults = XLSX.utils.json_to_sheet(
    combinedResultRows.length > 0 ? combinedResultRows : [{ 'File Name': 'No records available' }]
  );

  if (combinedResultRows.length > 0) {
    const cols = Object.keys(combinedResultRows[0]).map(key => {
      const maxLen = Math.max(
        key.length,
        ...combinedResultRows.slice(0, 1000).map(row => String(row[key] ?? '').length)
      );
      return { wch: Math.min(Math.max(maxLen + 3, 12), 60) };
    });
    wsResults['!cols'] = cols;
  }

  XLSX.utils.book_append_sheet(workbook, wsResults, 'Result Sheet');

  const cleanName = filename ? String(filename).replace(/\.[^/.]+$/, '') : 'Bulk_Loan_Packages_Audit_Report';
  const finalFilename = `${cleanName}.xlsx`;

  XLSX.writeFile(workbook, finalFilename);
};

export default exportToExcel;


