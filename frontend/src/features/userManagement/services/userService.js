import { api } from '../../../services/api';

export const userService = {
  getAllUsers: () => api.get('/api/users/'),
  updateUserRole: (userId, role) => api.put(`/api/users/${userId}/role`, { role }),
  updateUserStatus: (userId, status, role) =>
    api.put(`/api/users/${userId}/status`, role ? { status, role } : { status }),
};
