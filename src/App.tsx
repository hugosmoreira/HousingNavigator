import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Resources from './pages/Resources';
import Waitlist from './pages/Waitlist';
import Mission from './pages/Mission';
import Assessment from './pages/Assessment';
import Results from './pages/Results';
import Staff from './pages/Staff';
import { AdminAuthProvider } from './admin/AdminAuthContext';
import AdminLayout from './admin/AdminLayout';
import RequireAdmin from './admin/RequireAdmin';
import AdminLogin from './admin/pages/AdminLogin';
import AdminResourcesList from './admin/pages/AdminResourcesList';
import AdminResourceNew from './admin/pages/AdminResourceNew';
import AdminResourceEdit from './admin/pages/AdminResourceEdit';
import AdminWaitlistsList from './admin/pages/AdminWaitlistsList';
import AdminWaitlistNew from './admin/pages/AdminWaitlistNew';
import AdminWaitlistEdit from './admin/pages/AdminWaitlistEdit';

export default function App() {
  return (
    <AdminAuthProvider>
      <Routes>
        {/* Standalone Route for Assessment as it has a different layout */}
        <Route path="/assessment" element={<Assessment />} />
        <Route path="/staff" element={<Layout />}>
          <Route index element={<Staff />} />
        </Route>

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
        </Route>

        {/* Routes within the main marketing layout */}
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="resources" element={<Resources />} />
          <Route path="waitlist" element={<Waitlist />} />
          <Route path="mission" element={<Mission />} />
          <Route path="results" element={<Results />} />
        </Route>
      </Routes>
    </AdminAuthProvider>
  );
}
