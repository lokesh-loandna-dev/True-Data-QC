import { api } from './api';

export const loanService = {
  validateFile: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.upload('/api/loans/validate', formData);
  },

  savePackage: async (filename, summary, records, loanId = null) => {
    return api.post('/api/loans/save', {
      filename,
      summary,
      records,
      loan_id: loanId,
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
};

