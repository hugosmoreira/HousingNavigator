import { lazy } from 'react';
import AppRoutes, { type PublicPageComponents } from './AppRoutes';

// Keep public page modules out of the browser's initial hydration bundle. The
// server entry supplies eager components to the same route table so every
// indexable URL still renders complete HTML during prerendering.
const publicPages: PublicPageComponents = {
  Home: lazy(() => import('./pages/Home')),
  Resources: lazy(() => import('./pages/Resources')),
  LocalHousingLanding: lazy(() => import('./pages/LocalHousingLanding')),
  ResourceDetail: lazy(() => import('./pages/ResourceDetail')),
  Waitlist: lazy(() => import('./pages/Waitlist')),
  WaitlistDetail: lazy(() => import('./pages/WaitlistDetail')),
  Mission: lazy(() => import('./pages/Mission')),
  Privacy: lazy(() => import('./pages/Privacy')),
  Terms: lazy(() => import('./pages/Terms')),
  Help: lazy(() => import('./pages/Help')),
  Accessibility: lazy(() => import('./pages/Accessibility')),
  NotFound: lazy(() => import('./pages/NotFound')),
};

export default function App() {
  return <AppRoutes publicPages={publicPages} />;
}
