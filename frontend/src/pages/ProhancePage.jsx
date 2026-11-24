import { useAuth } from '../hooks/useAuth';
import { Navigate } from 'react-router-dom';
import Header from '../layout/Header';
import { ProhanceTable } from '../features/prohance/components/ProhanceTable';

const ProhancePage = () => {
  const { user } = useAuth();

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

  return (
    <div className="min-h-[100dvh] flex flex-col bg-[var(--bg-app)] text-[var(--text-primary)] pt-[60px] pb-6 transition-colors duration-200">
      <Header />
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-3.5 sm:py-4">
        {/* Main Content: Dashboard table with S.No, File Name, Upload Date, Time, User Name */}
        <div className="w-full">
          <ProhanceTable />
        </div>
      </main>
    </div>
  );
};

export default ProhancePage;
