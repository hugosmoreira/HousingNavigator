import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { Outlet, Route, Routes } from 'react-router-dom';
import { PublicAuthProvider } from './auth/PublicAuthContext';
import { AuthPromptProvider } from './auth/AuthPromptContext';
import { UserDataProvider } from './auth/UserDataContext';
import RequireAuth from './auth/RequireAuth';
import Layout from './components/Layout';
import RouteLoading from './components/RouteLoading';

export interface PublicPageComponents {
  Home: ComponentType;
  Resources: ComponentType;
  LocalHousingLanding: ComponentType;
  ResourceDetail: ComponentType;
  Waitlist: ComponentType;
  WaitlistDetail: ComponentType;
  Mission: ComponentType;
  Privacy: ComponentType;
  Terms: ComponentType;
  Help: ComponentType;
  Accessibility: ComponentType;
  NotFound: ComponentType;
}

// Account and admin surfaces are always client-only deferred routes.
const LoginRoute = lazy(() => import('./pages/LoginRoute'));
const Signup = lazy(() => import('./pages/Signup'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const AdminApp = lazy(() => import('./admin/AdminApp'));

function PublicProviders() {
  return (
    <PublicAuthProvider>
      <AuthPromptProvider>
        <UserDataProvider>
          <Outlet />
        </UserDataProvider>
      </AuthPromptProvider>
    </PublicAuthProvider>
  );
}

function DeferredRoute({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteLoading />}>{children}</Suspense>;
}

export default function AppRoutes({
  publicPages,
}: {
  publicPages: PublicPageComponents;
}) {
  const {
    Home,
    Resources,
    LocalHousingLanding,
    ResourceDetail,
    Waitlist,
    WaitlistDetail,
    Mission,
    Privacy,
    Terms,
    Help,
    Accessibility,
    NotFound,
  } = publicPages;

  return (
    <Routes>
      <Route
        path="/admin/*"
        element={
          <DeferredRoute>
            <AdminApp />
          </DeferredRoute>
        }
      />

      <Route element={<PublicProviders />}>
        <Route path="/" element={<Layout />}>
          <Route index element={<DeferredRoute><Home /></DeferredRoute>} />
          <Route path="resources" element={<DeferredRoute><Resources /></DeferredRoute>} />
          <Route path="resources/:slug" element={<DeferredRoute><ResourceDetail /></DeferredRoute>} />
          <Route path="housing-help/:countySlug" element={<DeferredRoute><LocalHousingLanding /></DeferredRoute>} />
          <Route path="housing-help/:countySlug/:serviceSlug" element={<DeferredRoute><LocalHousingLanding /></DeferredRoute>} />
          <Route path="waitlist" element={<DeferredRoute><Waitlist /></DeferredRoute>} />
          <Route path="waitlist/:slug" element={<DeferredRoute><WaitlistDetail /></DeferredRoute>} />
          <Route path="mission" element={<DeferredRoute><Mission /></DeferredRoute>} />
          <Route path="privacy" element={<DeferredRoute><Privacy /></DeferredRoute>} />
          <Route path="terms" element={<DeferredRoute><Terms /></DeferredRoute>} />
          <Route path="help" element={<DeferredRoute><Help /></DeferredRoute>} />
          <Route path="accessibility" element={<DeferredRoute><Accessibility /></DeferredRoute>} />
          <Route path="login" element={<DeferredRoute><LoginRoute /></DeferredRoute>} />
          <Route path="signup" element={<DeferredRoute><Signup /></DeferredRoute>} />
          <Route
            path="forgot-password"
            element={<DeferredRoute><ForgotPassword /></DeferredRoute>}
          />
          <Route
            path="reset-password"
            element={<DeferredRoute><ResetPassword /></DeferredRoute>}
          />
          <Route
            path="dashboard"
            element={
              <RequireAuth>
                <DeferredRoute><Dashboard /></DeferredRoute>
              </RequireAuth>
            }
          />
          {/* Catch-all: keep unknown URLs inside the app chrome instead of a blank page. */}
          <Route path="*" element={<DeferredRoute><NotFound /></DeferredRoute>} />
        </Route>
      </Route>
    </Routes>
  );
}
