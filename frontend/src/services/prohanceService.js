import { api } from './api';

export const prohanceService = {
  uploadReport: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.upload('/api/prohance/reports', formData);
  },

  getReports: async () => {
    return api.get('/api/prohance/reports');
  },

  getReportById: async (reportId) => {
    return api.get(`/api/prohance/reports/${reportId}`);
  },

  deleteReport: async (reportId) => {
    return api.delete(`/api/prohance/reports/${reportId}`);
  },

  deleteAllReports: async () => {
    return api.delete('/api/prohance/reports');
  },
};
