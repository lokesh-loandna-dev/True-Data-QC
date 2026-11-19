import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { AntdThemeBridge } from './utils/antdTheme';
import ProtectedRoute from './components/ProtectedRoute';
import { PageSkeleton } from './components/SkeletonLoader';
import SessionTimeoutHandler from './components/SessionTimeoutHandler';

// Dynamic lazy imports for route-based code splitting
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const UserManagementPage = lazy(() => import('./pages/UserManagementPage'));
const DataDictionaryPage = lazy(() => import('./pages/DataDictionaryPage'));
const UploadPage = lazy(() => import('./pages/UploadPage'));
const ProhancePage = lazy(() => import('./pages/ProhancePage'));
const PackageAuditPage = lazy(() => import('./pages/PackageAuditPage'));

const AppRoutes = () => {
  const { isDark } = useTheme();

  return (
    <AntdThemeBridge isDark={isDark}>
      <Toaster
        position="bottom-right"
        reverseOrder={false}
        gutter={8}
        toastOptions={{
          duration: 4000,
          style: {
            fontFamily: 'inherit',
            backgroundColor: 'var(--bg-surface)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.2), 0 4px 6px -2px rgba(0, 0, 0, 0.1)',
          },
        }}
      />
      <Router>
        <SessionTimeoutHandler />
        <Suspense fallback={<PageSkeleton />}>
          <Routes>
            {/* Public authentication routes */}
            <Route path="/" element={<LoginPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />

            {/* Protected dashboard / landing route */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />

            {/* Package audit preview — encrypted ID in URL */}
            <Route
              path="/dashboard/package/:encryptedId"
              element={
                <ProtectedRoute>
                  <PackageAuditPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/users"
              element={
                <ProtectedRoute>
                  <UserManagementPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/data-dictionary"
              element={
                <ProtectedRoute>
                  <DataDictionaryPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/upload"
              element={
                <ProtectedRoute>
                  <UploadPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/prohance"
              element={
                <ProtectedRoute>
                  <ProhancePage />
                </ProtectedRoute>
              }
            />

            {/* Catch all route - redirects to home page */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </Router>
    </AntdThemeBridge>
  );
};

const App = () => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;
