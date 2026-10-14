import { useEffect, useState, useMemo, useCallback } from 'react';
import { useUserStore } from '../store/useUserStore';
import { DataTable } from '../../../components/DataTable';
import Tooltip from '../../../components/Tooltip';
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
        <Tooltip text={isFiltered ? `Export ${count} filtered user(s) to Excel` : 'Export users to Excel'} position="bottom">
          <button
            type="button"
            onClick={() => handleExport(exportData)}
            disabled={loading || count === 0}
            className="inline-flex items-center justify-center p-2 sm:p-2.5 border border-slate-200 bg-white hover:bg-emerald-50 hover:border-emerald-300 text-emerald-600 hover:text-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold rounded-xl text-xs sm:text-sm transition-all shadow-2xs hover:shadow-xs cursor-pointer select-none"
            aria-label="Export to Excel"
          >
            <svg className="w-4 h-4 sm:w-4.5 sm:h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {isFiltered && (
              <span className="ml-1.5 px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md text-[11px] font-bold">
                {count}
              </span>
            )}
          </button>
        </Tooltip>
        <Tooltip text="Refresh Users" position="bottom">
          <button
            type="button"
            onClick={fetchUsers}
            disabled={loading}
            className="inline-flex items-center justify-center p-2 sm:p-2.5 border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 text-slate-600 hover:text-slate-900 font-semibold rounded-xl text-xs sm:text-sm transition-all shadow-2xs hover:shadow-xs cursor-pointer select-none"
            aria-label="Refresh Users"
          >
            <svg className={`w-4 h-4 sm:w-4.5 sm:h-4.5 text-current ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
          </button>
        </Tooltip>
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
            <div className="flex justify-end gap-1.5">
              <Tooltip text="Save Role" position="top">
                <button
                  type="button"
                  onClick={() => handleSave(u.id)}
                  className="inline-flex items-center justify-center p-1.5 border border-slate-200 bg-white hover:bg-emerald-50 hover:border-emerald-300 text-emerald-600 hover:text-emerald-700 rounded-lg text-xs shadow-2xs hover:shadow-xs transition-all cursor-pointer"
                  aria-label="Save Role"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </button>
              </Tooltip>
              <Tooltip text="Cancel" position="top">
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="inline-flex items-center justify-center p-1.5 border border-slate-200 bg-white hover:bg-rose-50 hover:border-rose-200 text-rose-600 hover:text-rose-700 rounded-lg text-xs shadow-2xs hover:shadow-xs transition-all cursor-pointer"
                  aria-label="Cancel"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </Tooltip>
            </div>
          );
        }
        return (
          <Tooltip text="Edit Role" position="top">
            <button
              type="button"
              onClick={() => handleEditClick(u)}
              className="inline-flex items-center justify-center p-1.5 border border-slate-200 bg-white hover:bg-sky-50 hover:border-[#24A1DD]/30 text-[#24A1DD] hover:text-[#1e88bb] rounded-lg text-xs shadow-2xs hover:shadow-xs transition-all cursor-pointer"
              aria-label="Edit Role"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
          </Tooltip>
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
