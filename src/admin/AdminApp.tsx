import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import RouteLoading from '../components/RouteLoading';
import { AdminAuthProvider } from './AdminAuthContext';
import AdminLayout from './AdminLayout';
import RequireAdmin from './RequireAdmin';

const AdminLogin = lazy(() => import('./pages/AdminLogin'));
const AdminResourcesList = lazy(() => import('./pages/AdminResourcesList'));
const AdminResourceNew = lazy(() => import('./pages/AdminResourceNew'));
const AdminResourceEdit = lazy(() => import('./pages/AdminResourceEdit'));
const AdminWaitlistsList = lazy(() => import('./pages/AdminWaitlistsList'));
const AdminWaitlistNew = lazy(() => import('./pages/AdminWaitlistNew'));
const AdminWaitlistEdit = lazy(() => import('./pages/AdminWaitlistEdit'));
const AdminAffordablePropertiesList = lazy(() => import('./pages/AdminAffordablePropertiesList'));
const AdminAffordablePropertyNew = lazy(() => import('./pages/AdminAffordablePropertyNew'));
const AdminAffordablePropertyEdit = lazy(() => import('./pages/AdminAffordablePropertyEdit'));
const AdminAlertsLog = lazy(() => import('./pages/AdminAlertsLog'));
const AdminReviewQueue = lazy(() => import('./pages/AdminReviewQueue'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const AdminUsers = lazy(() => import('./pages/AdminUsers'));

function ProtectedAdminRoute({ children }: { children: ReactNode }) {
  return <RequireAdmin>{children}</RequireAdmin>;
}

export default function AdminApp() {
  return (
    <AdminAuthProvider>
      <Suspense fallback={<RouteLoading />}>
        <Routes>
          <Route element={<AdminLayout />}>
            <Route index element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="login" element={<AdminLogin />} />
            <Route
              path="dashboard"
              element={
                <ProtectedAdminRoute>
                  <AdminDashboard />
                </ProtectedAdminRoute>
              }
            />
            <Route
              path="resources"
              element={
                <ProtectedAdminRoute>
                  <AdminResourcesList />
                </ProtectedAdminRoute>
              }
            />
            <Route
              path="resources/new"
              element={
                <ProtectedAdminRoute>
                  <AdminResourceNew />
                </ProtectedAdminRoute>
              }
            />
            <Route
              path="resources/:id/edit"
              element={
                <ProtectedAdminRoute>
                  <AdminResourceEdit />
                </ProtectedAdminRoute>
              }
            />
            <Route
              path="properties"
              element={
                <ProtectedAdminRoute>
                  <AdminAffordablePropertiesList />
                </ProtectedAdminRoute>
              }
            />
            <Route
              path="properties/new"
              element={
                <ProtectedAdminRoute>
                  <AdminAffordablePropertyNew />
                </ProtectedAdminRoute>
              }
            />
            <Route
              path="properties/:id/edit"
              element={
                <ProtectedAdminRoute>
                  <AdminAffordablePropertyEdit />
                </ProtectedAdminRoute>
              }
            />
            <Route
              path="waitlists"
              element={
                <ProtectedAdminRoute>
                  <AdminWaitlistsList />
                </ProtectedAdminRoute>
              }
            />
            <Route
              path="waitlists/new"
              element={
                <ProtectedAdminRoute>
                  <AdminWaitlistNew />
                </ProtectedAdminRoute>
              }
            />
            <Route
              path="waitlists/:id/edit"
              element={
                <ProtectedAdminRoute>
                  <AdminWaitlistEdit />
                </ProtectedAdminRoute>
              }
            />
            <Route
              path="alerts"
              element={
                <ProtectedAdminRoute>
                  <AdminAlertsLog />
                </ProtectedAdminRoute>
              }
            />
            <Route
              path="review"
              element={
                <ProtectedAdminRoute>
                  <AdminReviewQueue />
                </ProtectedAdminRoute>
              }
            />
            <Route
              path="users"
              element={
                <ProtectedAdminRoute>
                  <AdminUsers />
                </ProtectedAdminRoute>
              }
            />
            <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </AdminAuthProvider>
  );
}
