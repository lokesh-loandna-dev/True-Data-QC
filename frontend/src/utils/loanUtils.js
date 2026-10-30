/**
 * Utility to extract Loan ID from records or package data.
 * Priority:
 * 1. Filter record where Data Field is 'Loan ID' / 'Loan Id' / 'loan id' (case-insensitive) -> read True Data value.
 * 2. Filter record where Data Label is 'LoanID' / 'Loan ID' -> read True Data value.
 * 3. Any record with r.loan_id or r.raw_data['Loan ID'].
 * 4. Fallback to package.loan_id or direct loan_id property.
 */
export const extractLoanId = (records = [], fallbackLoanId = null) => {
  if (Array.isArray(records) && records.length > 0) {
    // 1. Check Data Field == 'Loan ID' / 'Loan Id'
    const matchField = records.find(r => {
      const f = String(r?.data_field || r?.['Data Field'] || '').trim().toLowerCase();
      return f === 'loan id' || f === 'loan_id' || f === 'loanid';
    });
    if (matchField) {
      const val = matchField.true_data ?? matchField['True Data'] ?? matchField.value;
      if (val != null && String(val).trim() !== '') {
        return String(val).trim();
      }
    }

    // 2. Check Data Label == 'LoanID' / 'Loan ID'
    const matchLabel = records.find(r => {
      const l = String(r?.data_label || r?.['Data Label'] || '').trim().toLowerCase();
      return l === 'loan id' || l === 'loan_id' || l === 'loanid';
    });
    if (matchLabel) {
      const val = matchLabel.true_data ?? matchLabel['True Data'] ?? matchLabel.value;
      if (val != null && String(val).trim() !== '') {
        return String(val).trim();
      }
    }

    // 3. Fallback: check if any record has r.loan_id or r.raw_data['Loan ID']
    for (const r of records) {
      if (r?.loan_id != null && String(r.loan_id).trim() !== '') {
        return String(r.loan_id).trim();
      }
      if (r?.raw_data && typeof r.raw_data === 'object') {
        const rawVal = r.raw_data['Loan ID'] ?? r.raw_data['loan_id'] ?? r.raw_data['Loan Id'];
        if (rawVal != null && String(rawVal).trim() !== '') {
          return String(rawVal).trim();
        }
      }
    }
  }

  if (fallbackLoanId != null && String(fallbackLoanId).trim() !== '') {
    return String(fallbackLoanId).trim();
  }

  return '';
};

/**
 * Normalizes action string casing to prevent duplicates in dropdowns and database.
 */
export const normalizeAction = (action) => {
  if (!action) return '';
  const trimmed = String(action).trim();
  if (trimmed.toLowerCase() === 'review completed') return 'Review Completed';
  return trimmed;
};

