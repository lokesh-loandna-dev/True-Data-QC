import { create } from 'zustand';
import { userService } from '../services/userService';

export const useUserStore = create((set, get) => ({
  users: [],
  loading: false,
  error: null,

  fetchUsers: async () => {
    set({ loading: true, error: null });
    try {
      const response = await userService.getAllUsers();
      set({ users: response.users, loading: false });
    } catch (error) {
      set({ error: error.message || 'Failed to fetch users', loading: false });
    }
  },

  updateRole: async (userId, newRole) => {
    set({ error: null });
    try {
      await userService.updateUserRole(userId, newRole);
      // Update the local state
      set((state) => ({
        users: state.users.map((user) =>
          user.id === userId ? { ...user, role: newRole } : user
        ),
      }));
    } catch (error) {
      set({ error: error.message || 'Failed to update user role' });
      // We might want to re-fetch if there's an error to ensure UI sync
      throw error;
    }
  },

  updateStatus: async (userId, newStatus, role) => {
    set({ error: null });
    try {
      const response = await userService.updateUserStatus(userId, newStatus, role);
      const assignedRole = response?.role || role;
      set((state) => ({
        users: state.users.map((user) =>
          user.id === userId
            ? {
                ...user,
                status: newStatus,
                ...(assignedRole ? { role: assignedRole } : {}),
              }
            : user
        ),
      }));
    } catch (error) {
      set({ error: error.message || 'Failed to update user status' });
      throw error;
    }
  },
}));
