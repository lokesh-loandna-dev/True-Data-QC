import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import { PageSkeleton } from './components/SkeletonLoader';

// Dynamic lazy imports for route-based code splitting
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const UserManagementPage = lazy(() => import('./pages/UserManagementPage'));
const DataDictionaryPage = lazy(() => import('./pages/DataDictionaryPage'));
const UploadPage = lazy(() => import('./pages/UploadPage'));
const ProhancePage = lazy(() => import('./pages/ProhancePage'));

const App = () => {
  return (
    <AuthProvider>
      <Toaster
        position="bottom-right"
        reverseOrder={false}
        gutter={8}
        toastOptions={{
          duration: 4000,
          style: {
            fontFamily: 'inherit',
          },
        }}
      />
      <Router>
        <Suspense fallback={<PageSkeleton />}>
          <Routes>
            {/* Public authentication routes */}
            <Route path="/" element={<LoginPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            {/* Protected dashboard / landing route */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardPage />
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
    </AuthProvider>
  );
};


export default App;