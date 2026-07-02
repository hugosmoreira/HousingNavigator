import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Resources from './pages/Resources';
import Waitlist from './pages/Waitlist';
import Mission from './pages/Mission';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import Help from './pages/Help';
import Accessibility from './pages/Accessibility';
import NotFound from './pages/NotFound';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import { AdminAuthProvider } from './admin/AdminAuthContext';
import { PublicAuthProvider } from './auth/PublicAuthContext';
import { AuthPromptProvider } from './auth/AuthPromptContext';
import { UserDataProvider } from './auth/UserDataContext';
import RequireAuth from './auth/RequireAuth';
import AdminLayout from './admin/AdminLayout';
import RequireAdmin from './admin/RequireAdmin';
import AdminLogin from './admin/pages/AdminLogin';
import AdminResourcesList from './admin/pages/AdminResourcesList';
import AdminResourceNew from './admin/pages/AdminResourceNew';
import AdminResourceEdit from './admin/pages/AdminResourceEdit';
import AdminWaitlistsList from './admin/pages/AdminWaitlistsList';
import AdminWaitlistNew from './admin/pages/AdminWaitlistNew';
import AdminWaitlistEdit from './admin/pages/AdminWaitlistEdit';
import AdminAlertsLog from './admin/pages/AdminAlertsLog';

export default function App() {
  return (
    <AdminAuthProvider>
      <PublicAuthProvider>
        <AuthPromptProvider>
          <UserDataProvider>
            <Routes>
        {/* Admin CMS — its own chrome, gated by Supabase auth + admin_users */}
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="/admin/resources" replace />} />
          <Route path="login" element={<AdminLogin />} />
          <Route
            path="resources"
            element={
              <RequireAdmin>
                <AdminResourcesList />
              </RequireAdmin>
            }
          />
          <Route
            path="resources/new"
            element={
              <RequireAdmin>
                <AdminResourceNew />
              </RequireAdmin>
            }
          />
          <Route
            path="resources/:id/edit"
            element={
              <RequireAdmin>
                <AdminResourceEdit />
              </RequireAdmin>
            }
          />
          <Route
            path="waitlists"
            element={
              <RequireAdmin>
                <AdminWaitlistsList />
              </RequireAdmin>
            }
          />
          <Route
            path="waitlists/new"
            element={
              <RequireAdmin>
                <AdminWaitlistNew />
              </RequireAdmin>
            }
          />
          <Route
            path="waitlists/:id/edit"
            element={
              <RequireAdmin>
                <AdminWaitlistEdit />
              </RequireAdmin>
            }
          />
          <Route
            path="alerts"
            element={
              <RequireAdmin>
                <AdminAlertsLog />
              </RequireAdmin>
            }
          />
        </Route>

        {/* Routes within the main marketing layout */}
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="resources" element={<Resources />} />
          <Route path="waitlist" element={<Waitlist />} />
          <Route path="mission" element={<Mission />} />
          <Route path="privacy" element={<Privacy />} />
          <Route path="terms" element={<Terms />} />
          <Route path="help" element={<Help />} />
          <Route path="accessibility" element={<Accessibility />} />
          <Route path="login" element={<Login />} />
          <Route path="signup" element={<Signup />} />
          <Route path="forgot-password" element={<ForgotPassword />} />
          <Route path="reset-password" element={<ResetPassword />} />
          <Route
            path="dashboard"
            element={
              <RequireAuth>
                <Dashboard />
              </RequireAuth>
            }
          />
          {/* Catch-all: keep unknown URLs inside the app chrome instead of a blank page. */}
          <Route path="*" element={<NotFound />} />
        </Route>
            </Routes>
          </UserDataProvider>
        </AuthPromptProvider>
      </PublicAuthProvider>
    </AdminAuthProvider>
  );
}
