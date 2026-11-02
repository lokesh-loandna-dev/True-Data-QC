import React, { useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Navigate } from 'react-router-dom';
import Header from '../layout/Header';
import { ProhanceTable } from '../features/prohance/components/ProhanceTable';

const ProhancePage = () => {
  const { user } = useAuth();
  const fileInputRef = useRef(null);

  const isAnyAdmin = (role) => {
    const lower = (role || '').trim().toLowerCase();
    return (
      lower === 'super admin' ||
      lower === 'super_admin' ||
      lower === 'admin' ||
      (lower.includes('admin') && lower.includes('pre')) ||
      (lower.includes('admin') && lower.includes('junior')) ||
      lower.includes('admin')
    );
  };

  // Extra layer of protection on frontend - Super Admin and Admins
  if (!isAnyAdmin(user?.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleUploadClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 pt-[60px] pb-6">
      <Header />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-4">


        {/* Main Content: Dashboard table with S.No, File Name, Upload Date, Time, User Name */}
        <div className="w-full">
          <ProhanceTable
            registerFileInputRef={(ref) => {
              fileInputRef.current = ref.current;
            }}
          />
        </div>
      </main>
    </div>
  );
};

export default ProhancePage;
