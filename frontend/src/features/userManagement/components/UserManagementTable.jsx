import React, { useEffect, useState, useMemo } from 'react';
import { useUserStore } from '../store/useUserStore';
import { DataTable } from '../../../components/DataTable';
import { notify } from '../../../utils/toast';

const ROLES = ['admin', 'user'];

export const UserManagementTable = () => {
  const { users, loading, error, fetchUsers, updateRole } = useUserStore();
  const [editingId, setEditingId] = useState(null);
  const [selectedRole, setSelectedRole] = useState('');
  const [updateError, setUpdateError] = useState('');

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleEditClick = (user) => {
    setEditingId(user.id);
    setSelectedRole(user.role);
    setUpdateError('');
  };

  const handleSave = async (userId) => {
    try {
      await updateRole(userId, selectedRole);
      setEditingId(null);
      notify.success('User role updated successfully');
    } catch (err) {
      const errMsg = err.message || 'Failed to update role';
      setUpdateError(errMsg);
      notify.error(errMsg);
    }
  };

  const columns = useMemo(() => [
    {
      header: 'S.No',
      accessor: 'id',
      sortable: false,
      render: (_, index, globalIndexOffset = 0) => (
        <span className="text-slate-500">{globalIndexOffset + index + 1}</span>
      ),
    },
    {
      header: 'Username',
      accessor: 'username',
      sortable: true,
      cellClassName: 'font-medium text-slate-900',
    },
    {
      header: 'Email',
      accessor: 'email',
      sortable: true,
    },
    {
      header: 'Role',
      accessor: 'role',
      sortable: true,
      render: (u) => {
        if (editingId === u.id) {
          return (
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="w-32 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#24A1DD] focus:border-transparent transition-all"
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          );
        }
        
        const roleColors = {
          admin: 'text-purple-800 font-semibold',
          manager: 'text-blue-800 font-semibold',
          viewer: 'text-amber-800 font-semibold',
          default: 'text-green-800 font-semibold'
        };
        const colorClass = roleColors[u.role] || roleColors.default;

        return (
          <span className={`inline-flex items-center text-xs ${colorClass}`}>
            {u.role}
          </span>
        );
      }
    },
    {
      header: 'Actions',
      accessor: 'actions',
      align: 'right',
      render: (u) => {
        if (editingId === u.id) {
          return (
            <div className="flex justify-end gap-2">
              <button
                onClick={() => handleSave(u.id)}
                className="text-white bg-[#24A1DD] hover:bg-[#1e88bb] px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              >
                Save
              </button>
              <button
                onClick={() => setEditingId(null)}
                className="text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          );
        }
        return (
          <button
            onClick={() => handleEditClick(u)}
            className="text-[#24A1DD] hover:text-[#1e88bb] font-medium transition-colors"
          >
            Edit Role
          </button>
        );
      }
    }
  ], [editingId, selectedRole]);

  return (
    <div className="flex-1 flex flex-col min-h-0 h-full overflow-hidden">
      {updateError && (
        <div className="mb-4 p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm flex-shrink-0">
          {updateError}
        </div>
      )}
      <DataTable 
        data={users}
        columns={columns}
        loading={loading}
        error={error}
        searchable={true}
        pagination={true}
        itemsPerPageOptions={[5, 10, 25, 50]}
        defaultItemsPerPage={10}
        emptyMessage="No users found."
        className="flex flex-col min-h-0"
      />
    </div>
  );
};
