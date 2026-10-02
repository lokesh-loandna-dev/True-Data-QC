import { api } from './api';

export const dataDictionaryService = {
  uploadFile: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.upload('/api/data-dictionary/upload', formData);
  },

  getDataDictionary: async (params = {}) => {
    const query = new URLSearchParams();
    if (params.page) query.append('page', params.page);
    if (params.limit) query.append('limit', params.limit);
    if (params.search) query.append('search', params.search);
    if (params.sortBy) query.append('sort_by', params.sortBy);
    if (params.sortOrder) query.append('sort_order', params.sortOrder);
    if (params.filters && Object.keys(params.filters).length > 0) {
      query.append('filters', JSON.stringify(params.filters));
    }

    const queryString = query.toString();
    const endpoint = `/api/data-dictionary/${queryString ? `?${queryString}` : ''}`;
    return api.get(endpoint);
  },

  deleteAllDataDictionary: async () => {
    return api.delete('/api/data-dictionary/clear-all');
  },

  saveColumnPreferences: async (columns) => {
    return api.post('/api/users/preferences/columns', {
      table_key: 'data_dictionary',
      selected_columns: columns,
    });
  },
};


