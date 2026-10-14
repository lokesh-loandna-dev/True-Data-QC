import { useEffect, useState, useMemo, useCallback } from 'react';
import { useUserStore } from '../store/useUserStore';
import { DataTable } from '../../../components/DataTable';
import { notify } from '../../../utils/toast';
import { exportUsersToExcel } from '../../../utils/excelExport';

const ROLES = ['admin', 'user'];

export const UserManagementTable = () => {
  const { users, loading, error, fetchUsers, updateRole } = useUserStore();
  const [editingId, setEditingId] = useState(null);
  const [selectedRole, setSelectedRole] = useState('');
  const [updateError, setUpdateError] = useState('');

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleEditClick = useCallback((user) => {
    setEditingId(user.id);
    setSelectedRole(user.role);
    setUpdateError('');
  }, []);

  const handleSave = useCallback(async (userId) => {
    try {
      await updateRole(userId, selectedRole);
      setEditingId(null);
      notify.success('User role updated successfully');
    } catch (err) {
      const errMsg = err.message || 'Failed to update role';
      setUpdateError(errMsg);
      notify.error(errMsg);
    }
  }, [updateRole, selectedRole]);

  const handleExport = useCallback((dataToExport) => {
    try {
      const records = dataToExport && dataToExport.length > 0 ? dataToExport : users;
      if (!records || records.length === 0) {
        notify.warning('No user data to export');
        return;
      }
      const dateStr = new Date().toISOString().split('T')[0];
      exportUsersToExcel({
        users: records,
        filename: `Users_${dateStr}`
      });
      notify.success(`Exported ${records.length} user${records.length === 1 ? '' : 's'} to Excel successfully!`);
    } catch (err) {
      console.error('Failed to export users to Excel:', err);
      notify.error('Failed to export users to Excel');
    }
  }, [users]);

  const customHeader = useCallback(({ filteredData }) => {
    const exportData = filteredData && filteredData.length > 0 ? filteredData : users;
    const isFiltered = filteredData && filteredData.length < users.length;
    const count = exportData?.length || 0;

    return (
      <div className="flex items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={() => handleExport(exportData)}
          disabled={loading || count === 0}
          className="inline-flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl text-xs sm:text-sm transition-all shadow-sm hover:shadow cursor-pointer select-none"
          title={isFiltered ? `Export ${count} filtered user(s) to Excel` : 'Export users to Excel'}
        >
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span>Export to Excel</span>
          {isFiltered && (
            <span className="ml-0.5 px-1.5 py-0.5 bg-emerald-700/80 rounded-md text-[11px] font-bold">
              {count}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={fetchUsers}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-700 font-semibold rounded-xl text-xs sm:text-sm transition-colors shadow-2xs cursor-pointer select-none"
          title="Refresh Users"
        >
          <svg className={`w-3.5 h-3.5 text-slate-500 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18" />
          </svg>
          <span>Refresh</span>
        </button>
      </div>
    );
  }, [users, loading, fetchUsers, handleExport]);

  const columns = useMemo(() => [
    {
      header: 'S.No',
      accessor: 'id',
      sortable: false,
      filterable: false,
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
  ], [editingId, selectedRole, handleEditClick, handleSave]);

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
        customHeader={customHeader}
        className="flex flex-col min-h-0"
      />
    </div>
  );
};
