import { api } from './api';

export const userPreferencesService = {
  getColumnPreferences: async (tableKey) => {
    try {
      const res = await api.get(`/api/users/preferences/columns/${tableKey}`);
      return res?.selected_columns || null;
    } catch (err) {
      console.warn(`Failed to fetch column preferences for ${tableKey} from DB:`, err);
      try {
        const local = localStorage.getItem(`user_cols_${tableKey}`);
        return local ? JSON.parse(local) : null;
      } catch (e) {
        return null;
      }
    }
  },

  saveColumnPreferences: async (tableKey, selectedColumns) => {
    // Save locally as immediate fallback/cache
    try {
      localStorage.setItem(`user_cols_${tableKey}`, JSON.stringify(selectedColumns));
    } catch (e) {
      // Ignore localStorage errors
    }

    // Persist to database for user account
    try {
      return await api.post('/api/users/preferences/columns', {
        table_key: tableKey,
        selected_columns: selectedColumns,
      });
    } catch (err) {
      console.error(`Failed to save column preferences for ${tableKey} to DB:`, err);
      return null;
    }
  },

  resetColumnPreferences: async (tableKey) => {
    try {
      localStorage.removeItem(`user_cols_${tableKey}`);
      return await api.delete(`/api/users/preferences/columns/${tableKey}`);
    } catch (err) {
      console.error(`Failed to reset column preferences for ${tableKey}:`, err);
      return null;
    }
  },
};
