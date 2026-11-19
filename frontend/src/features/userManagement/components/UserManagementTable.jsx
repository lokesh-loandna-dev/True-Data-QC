import { useEffect, useState, useMemo, useCallback } from 'react';
import { useUserStore } from '../store/useUserStore';
import { useAuth } from '../../../hooks/useAuth';
import { DataTable } from '../../../components/DataTable';
import Tooltip from '../../../components/Tooltip';
import { notify } from '../../../utils/toast';
import { exportUsersToExcel } from '../../../utils/excelExport';

const ROLES = [
  { value: 'Super Admin', label: 'Super Admin' },
  { value: 'Admin with Pre-Underwriter', label: 'Admin with Pre-Underwriter' },
  { value: 'Admin with Junior-Underwriter', label: 'Admin with Junior-Underwriter' },
  { value: 'Pre Underwriter', label: 'Pre Underwriter' },
  { value: 'Junior underwriter', label: 'Junior Underwriter' },
];
const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Pending Approval' },
  { value: 'rejected', label: 'Rejected' },
];

export const UserManagementTable = () => {
  const { users, loading, error, fetchUsers, updateRole, updateStatus } = useUserStore();
  const { user: currentUser } = useAuth();
  const [editingId, setEditingId] = useState(null);
  const [selectedRole, setSelectedRole] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [statusUpdatingId, setStatusUpdatingId] = useState(null);
  const [statusUpdatingAction, setStatusUpdatingAction] = useState('');
  const [updateError, setUpdateError] = useState('');

  // Approval Modal State
  const [approvingUser, setApprovingUser] = useState(null);
  const [approvingRole, setApprovingRole] = useState('');

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleEditClick = useCallback((user) => {
    setEditingId(user.id);
    setSelectedRole(user.role);
    setSelectedStatus(user.status || 'inactive');
    setUpdateError('');
  }, []);

  const handleInitiateApprove = useCallback((user) => {
    setApprovingUser(user);
    const hasValidRole = user.role && user.role !== '--selected--';
    setApprovingRole(hasValidRole ? user.role : '');
    setUpdateError('');
  }, []);

  const handleConfirmApprove = useCallback(async () => {
    if (!approvingUser) return;
    if (!approvingRole || approvingRole === '--selected--') {
      notify.warning('Please select a valid role to approve this user.');
      return;
    }

    setStatusUpdatingId(approvingUser.id);
    setStatusUpdatingAction('active');
    setUpdateError('');
    try {
      await updateStatus(approvingUser.id, 'active', approvingRole);
      const roleLabel = ROLES.find((r) => r.value === approvingRole)?.label || approvingRole;
      notify.success(`User "${approvingUser.username}" approved as ${roleLabel} successfully.`);
      setApprovingUser(null);
      setApprovingRole('');
    } catch (err) {
      const errMsg = err.message || 'Failed to approve user';
      setUpdateError(errMsg);
      notify.error(errMsg);
    } finally {
      setStatusUpdatingId(null);
      setStatusUpdatingAction('');
    }
  }, [approvingUser, approvingRole, updateStatus]);

  const handleSave = useCallback(async (userId) => {
    try {
      const user = users.find((u) => u.id === userId);
      let roleUpdated = false;
      let statusUpdated = false;

      if (selectedStatus === 'active' && (!selectedRole || selectedRole === '--selected--')) {
        notify.warning('Please select a valid role before activating this account.');
        return;
      }

      if (user && user.role !== selectedRole) {
        await updateRole(userId, selectedRole);
        roleUpdated = true;
      }

      if (user && user.status !== selectedStatus) {
        if (currentUser?.id === userId && selectedStatus !== 'active') {
          notify.warning('You cannot deactivate or reject your own administrative account.');
          return;
        }
        await updateStatus(userId, selectedStatus);
        statusUpdated = true;
      }

      setEditingId(null);
      if (roleUpdated && statusUpdated) {
        notify.success('User role and status updated successfully');
      } else if (roleUpdated) {
        notify.success('User role updated successfully');
      } else if (statusUpdated) {
        notify.success('User status updated successfully');
      }
    } catch (err) {
      const errMsg = err.message || 'Failed to update user';
      setUpdateError(errMsg);
      notify.error(errMsg);
    }
  }, [users, updateRole, updateStatus, selectedRole, selectedStatus, currentUser]);

  const handleStatusChange = useCallback(async (targetUser, nextStatus) => {
    if (currentUser?.id === targetUser.id && nextStatus !== 'active') {
      notify.warning('You cannot deactivate or reject your own administrative account.');
      return;
    }

    setStatusUpdatingId(targetUser.id);
    setStatusUpdatingAction(nextStatus);
    setUpdateError('');
    try {
      await updateStatus(targetUser.id, nextStatus);
      if (nextStatus === 'active') {
        notify.success(`User "${targetUser.username}" approved and activated successfully.`);
      } else if (nextStatus === 'rejected') {
        notify.success(`User "${targetUser.username}" registration rejected.`);
      } else {
        notify.success(`User "${targetUser.username}" deactivated.`);
      }
    } catch (err) {
      const errMsg = err.message || `Failed to update status for user`;
      setUpdateError(errMsg);
      notify.error(errMsg);
    } finally {
      setStatusUpdatingId(null);
      setStatusUpdatingAction('');
    }
  }, [currentUser, updateStatus]);

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
            className="inline-flex items-center justify-center p-2 sm:p-2.5 border border-[var(--border-strong)] bg-[var(--bg-surface)] hover:bg-[var(--success-bg)] hover:border-[var(--success)] text-[var(--success)] disabled:opacity-50 disabled:cursor-not-allowed font-semibold rounded-xl text-xs sm:text-sm transition-all shadow-2xs hover:shadow-xs cursor-pointer select-none"
            aria-label="Export to Excel"
          >
            <svg className="w-4 h-4 sm:w-4.5 sm:h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {isFiltered && (
              <span className="ml-1.5 px-1.5 py-0.5 bg-[var(--success-bg)] text-[var(--success)] border border-[var(--success)]/40 rounded-md text-[11px] font-bold">
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
            className="inline-flex items-center justify-center p-2 sm:p-2.5 border border-[var(--border-strong)] bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] disabled:opacity-50 text-[var(--text-primary)] font-semibold rounded-xl text-xs sm:text-sm transition-all shadow-2xs hover:shadow-xs cursor-pointer select-none"
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
          const isCurrentSelected = selectedRole === '--selected--' || !selectedRole;
          return (
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="w-44 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]/25 focus:border-[var(--focus-ring)] transition-all"
            >
              {isCurrentSelected && (
                <option value="--selected--" disabled>
                  -- Select Role --
                </option>
              )}
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          );
        }

        const getRoleBadge = (role) => {
          const r = (role || '').toLowerCase();
          // Role badges: Admin #4ADE80, Coder #2DD4BF, Approver #C084FC, Scanner #60A5FA (12% opacity bg)
          if (r.includes('super admin') || r.includes('super_admin') || r === 'admin') {
            return {
              style: 'role-badge role-badge-admin',
              label: 'Super Admin',
            };
          }
          if (r.includes('approver')) {
            return {
              style: 'role-badge role-badge-approver',
              label: 'Approver',
            };
          }
          if (r.includes('coder')) {
            return {
              style: 'role-badge role-badge-coder',
              label: 'Coder',
            };
          }
          if (r.includes('scanner')) {
            return {
              style: 'role-badge role-badge-scanner',
              label: 'Scanner',
            };
          }
          if (r.includes('admin') && r.includes('pre')) {
            return {
              style: 'role-badge role-badge-coder',
              label: 'Admin (Pre-UW)',
            };
          }
          if (r.includes('admin') && r.includes('junior')) {
            return {
              style: 'role-badge role-badge-scanner',
              label: 'Admin (Junior-UW)',
            };
          }
          if (r.includes('junior')) {
            return {
              style: 'role-badge role-badge-scanner',
              label: 'Junior Underwriter',
            };
          }
          if (r.includes('pre')) {
            return {
              style: 'role-badge role-badge-coder',
              label: 'Pre Underwriter',
            };
          }
          if (r === '--selected--' || !r) {
            return {
              style: 'status-pill status-pill-warning italic',
              label: '--selected--',
            };
          }
          return {
            style: 'role-badge role-badge-admin',
            label: role,
          };
        };

        const badge = getRoleBadge(u.role);
        return (
          <span className={badge.style}>
            {badge.label}
          </span>
        );
      }
    },
    {
      header: 'Status',
      accessor: 'status',
      sortable: true,
      render: (u) => {
        if (editingId === u.id) {
          return (
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              disabled={currentUser?.id === u.id}
              className="w-36 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]/25 focus:border-[var(--focus-ring)] transition-all"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          );
        }

        const isUserActive = u.status === 'active';
        const isUserRejected = u.status === 'rejected';

        // Status pills: soft status background, status-colored text, and a 1px border at 40% opacity
        let pillClass = 'status-pill status-pill-warning';
        let dotStyle = 'bg-[var(--warning)] animate-pulse';
        let label = 'Pending Approval';

        if (isUserActive) {
          pillClass = 'status-pill status-pill-success';
          dotStyle = 'bg-[var(--success)]';
          label = 'Active';
        } else if (isUserRejected) {
          pillClass = 'status-pill status-pill-error';
          dotStyle = 'bg-[var(--error)]';
          label = 'Rejected';
        }

        return (
          <span className={pillClass}>
            <span className={`w-1.5 h-1.5 rounded-full ${dotStyle}`} />
            {label}
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
              <Tooltip text="Save Changes" position="top">
                <button
                  type="button"
                  onClick={() => handleSave(u.id)}
                  className="inline-flex items-center justify-center p-1.5 border border-[var(--border)] bg-[var(--bg-surface)] hover:bg-[var(--success-bg)] hover:border-[var(--success)] text-[var(--success)] rounded-lg text-xs shadow-2xs hover:shadow-xs transition-all cursor-pointer"
                  aria-label="Save Changes"
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
                  className="inline-flex items-center justify-center p-1.5 border border-[var(--border)] bg-[var(--bg-surface)] hover:bg-[var(--error-bg)] hover:border-[var(--error)] text-[var(--error)] rounded-lg text-xs shadow-2xs hover:shadow-xs transition-all cursor-pointer"
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

        const isUserActive = u.status === 'active';
        const isUserRejected = u.status === 'rejected';
        const isPending = !isUserActive && !isUserRejected;
        const isSelf = currentUser?.id === u.id;
        const isUpdating = statusUpdatingId === u.id;

        return (
          <div className="flex items-center justify-end gap-1.5">
            {isPending && (
              <>
                <Tooltip text="Approve & Activate Account" position="top">
                  <button
                    type="button"
                    onClick={() => handleInitiateApprove(u)}
                    disabled={isUpdating}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[var(--success-bg)] hover:opacity-90 text-[var(--success)] border border-[var(--success)]/30 font-semibold rounded-lg text-xs transition-all shadow-2xs hover:shadow-xs cursor-pointer select-none disabled:opacity-50"
                    aria-label="Approve User"
                  >
                    {isUpdating && statusUpdatingAction === 'active' ? (
                      <svg className="w-3.5 h-3.5 animate-spin text-emerald-600" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    <span>Approve</span>
                  </button>
                </Tooltip>

                <Tooltip text="Reject Registration" position="top">
                  <button
                    type="button"
                    onClick={() => handleStatusChange(u, 'rejected')}
                    disabled={isUpdating}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[var(--error-bg)] hover:opacity-90 text-[var(--error)] border border-[var(--error)]/30 font-semibold rounded-lg text-xs transition-all shadow-2xs hover:shadow-xs cursor-pointer select-none disabled:opacity-50"
                    aria-label="Reject User"
                  >
                    {isUpdating && statusUpdatingAction === 'rejected' ? (
                      <svg className="w-3.5 h-3.5 animate-spin text-rose-600" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                    <span>Reject</span>
                  </button>
                </Tooltip>
              </>
            )}

            {isUserRejected && (
              <Tooltip text="Approve & Activate Account" position="top">
                <button
                  type="button"
                  onClick={() => handleInitiateApprove(u)}
                  disabled={isUpdating}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[var(--success-bg)] hover:opacity-90 text-[var(--success)] border border-[var(--success)]/30 font-semibold rounded-lg text-xs transition-all shadow-2xs hover:shadow-xs cursor-pointer select-none disabled:opacity-50"
                  aria-label="Approve User"
                >
                  {isUpdating && statusUpdatingAction === 'active' ? (
                    <svg className="w-3.5 h-3.5 animate-spin text-[var(--success)]" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  <span>Approve</span>
                </button>
              </Tooltip>
            )}

            {isUserActive && !isSelf && (
              <>
                <Tooltip text="Reject Account" position="top">
                  <button
                    type="button"
                    onClick={() => handleStatusChange(u, 'rejected')}
                    disabled={isUpdating}
                    className="inline-flex items-center justify-center p-1.5 border border-[var(--border)] bg-[var(--bg-surface)] hover:bg-[var(--error-bg)] hover:border-[var(--error)] text-[var(--text-secondary)] hover:text-[var(--error)] rounded-lg text-xs shadow-2xs hover:shadow-xs transition-all cursor-pointer disabled:opacity-50"
                    aria-label="Reject User"
                  >
                    {isUpdating && statusUpdatingAction === 'rejected' ? (
                      <svg className="w-3.5 h-3.5 animate-spin text-[var(--error)]" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                    )}
                  </button>
                </Tooltip>

                <Tooltip text="Deactivate Account" position="top">
                  <button
                    type="button"
                    onClick={() => handleStatusChange(u, 'inactive')}
                    disabled={isUpdating}
                    className="inline-flex items-center justify-center p-1.5 border border-[var(--border)] bg-[var(--bg-surface)] hover:bg-[var(--warning-bg)] hover:border-[var(--warning)] text-[var(--text-secondary)] hover:text-[var(--warning)] rounded-lg text-xs shadow-2xs hover:shadow-xs transition-all cursor-pointer disabled:opacity-50"
                    aria-label="Deactivate User"
                  >
                    {isUpdating && statusUpdatingAction === 'inactive' ? (
                      <svg className="w-3.5 h-3.5 animate-spin text-[var(--warning)]" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                  </button>
                </Tooltip>
              </>
            )}

            <Tooltip text="Edit Role & Status" position="top">
              <button
                type="button"
                onClick={() => handleEditClick(u)}
                className="inline-flex items-center justify-center p-1.5 border border-[var(--border)] bg-[var(--bg-surface)] hover:bg-[var(--primary-soft)] hover:border-[var(--primary)] text-[var(--primary)] rounded-lg text-xs shadow-2xs hover:shadow-xs transition-all cursor-pointer"
                aria-label="Edit User"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
            </Tooltip>
          </div>
        );
      }
    }
  ], [editingId, selectedRole, selectedStatus, statusUpdatingId, statusUpdatingAction, currentUser, handleEditClick, handleSave, handleStatusChange, handleInitiateApprove]);

  return (
    <div className="flex-1 flex flex-col min-h-0 h-full overflow-hidden">
      {updateError && (
        <div className="mb-4 p-4 bg-[var(--error-bg)] border border-[var(--error)]/30 rounded-xl text-[var(--error)] text-sm flex-shrink-0">
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

      {/* Approve & Assign Role Modal */}
      {approvingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div 
            className="bg-[var(--bg-surface)] rounded-2xl shadow-xl border border-[var(--border)] max-w-md w-full overflow-hidden transition-all transform animate-in zoom-in-95 duration-150"
            role="dialog"
            aria-modal="true"
            aria-labelledby="approval-modal-title"
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-[var(--border)] bg-[var(--bg-elevated)] flex items-center justify-between">
              <div>
                <h3 id="approval-modal-title" className="text-sm font-bold text-[var(--text-primary)] tracking-tight">
                  Approve User Account
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  Select an operational role to activate this user account.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (statusUpdatingId) return;
                  setApprovingUser(null);
                  setApprovingRole('');
                }}
                className="p-1 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)] transition-colors cursor-pointer"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4">
              {/* User Summary Card */}
              <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl p-3.5 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-secondary)] font-medium">Username</span>
                  <span className="font-semibold text-[var(--text-primary)]">{approvingUser.username}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-secondary)] font-medium">Email</span>
                  <span className="font-mono text-[var(--text-primary)]">{approvingUser.email}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-secondary)] font-medium">Current Role</span>
                  <span className="text-[var(--warning)] font-semibold italic bg-[var(--warning-bg)] px-2 py-0.5 rounded-full border border-[var(--warning)]/40 text-[11px]">
                    {approvingUser.role || '--selected--'}
                  </span>
                </div>
              </div>

              {/* Role Selection Dropdown */}
              <div className="space-y-1.5">
                <label htmlFor="approval-role-select" className="block text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                  Assign Role <span className="text-[var(--error)]">*</span>
                </label>
                <select
                  id="approval-role-select"
                  value={approvingRole}
                  onChange={(e) => setApprovingRole(e.target.value)}
                  disabled={statusUpdatingId === approvingUser.id}
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3.5 py-2.5 text-xs font-medium text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]/25 focus:border-[var(--focus-ring)] transition-all cursor-pointer"
                >
                  <option value="" disabled>-- Select Role --</option>
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-[var(--text-secondary)]">
                  Select one of the 5 roles to approve this user.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3.5 bg-[var(--bg-elevated)] border-t border-[var(--border)] flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  if (statusUpdatingId) return;
                  setApprovingUser(null);
                  setApprovingRole('');
                }}
                disabled={statusUpdatingId === approvingUser.id}
                className="px-3.5 py-1.5 text-xs font-semibold text-[var(--text-primary)] bg-[var(--bg-surface)] border border-[var(--border-strong)] hover:bg-[var(--bg-muted)] rounded-lg transition-all cursor-pointer select-none"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmApprove}
                disabled={!approvingRole || approvingRole === '--selected--' || statusUpdatingId === approvingUser.id}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-[var(--success)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-2xs transition-all cursor-pointer select-none inline-flex items-center gap-1.5"
              >
                {statusUpdatingId === approvingUser.id ? (
                  <>
                    <svg className="w-3.5 h-3.5 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    <span>Approving...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Approve & Activate</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
