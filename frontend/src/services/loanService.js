import { api } from './api';

export const loanService = {
  validateFile: async (file, mode = null) => {
    const formData = new FormData();
    formData.append('file', file);
    if (mode) {
      formData.append('mode', mode);
    }
    return api.upload('/api/loans/validate', formData);
  },

  fetchAndValidateLoan: async (loanId, sellerName, mode = null) => {
    return api.post('/api/loans/fetch-and-validate', {
      loan_id: loanId,
      seller_name: sellerName,
      mode: mode,
    });
  },

  savePackage: async (filename, summary, records, loanId = null, ingestionMode = null) => {
    return api.post('/api/loans/save', {
      filename,
      summary,
      records,
      loan_id: loanId,
      ingestion_mode: ingestionMode,
    });
  },

  updatePackageRecords: async (packageId, records) => {
    return api.put(`/api/loans/${packageId}/records`, { records });
  },

  getPackages: async () => {
    return api.get('/api/loans/');
  },

  getPackageDetails: async (packageId) => {
    return api.get(`/api/loans/${packageId}`);
  },

  deletePackage: async (packageId) => {
    return api.delete(`/api/loans/${packageId}`);
  },

  clearAllPackages: async () => {
    return api.delete('/api/loans/clear-all');
  },

  bulkDeletePackages: async (packageIds) => {
    return api.post('/api/loans/bulk-delete', { package_ids: packageIds });
  },

  exportBulkPackagesExcel: async (packageIds, onProgress = null) => {
    return api.downloadBlob(
      '/api/loans/bulk-export',
      {
        method: 'POST',
        body: { package_ids: packageIds }
      },
      onProgress
    );
  },
};
