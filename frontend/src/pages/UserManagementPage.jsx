import React from 'react';
import { UserManagementTable } from '../features/userManagement/components/UserManagementTable';
import { useAuth } from '../hooks/useAuth';
import { Navigate } from 'react-router-dom';
import Header from '../layout/Header';

const UserManagementPage = () => {
  const { user } = useAuth();

  const isSuperAdmin = (role) => {
    const lower = (role || '').toLowerCase();
    return lower === 'super admin' || lower === 'super_admin' || lower === 'admin';
  };

  // Extra layer of protection on frontend - Super Admin only
  if (!isSuperAdmin(user?.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50 overflow-hidden pt-[60px]">
      <Header />
      <main className="flex-1 flex flex-col min-h-0 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-4 flex-shrink-0">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">User Management</h1>
        </div>

        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <UserManagementTable />
        </div>
      </main>
    </div>
  );
};

export default UserManagementPage;

