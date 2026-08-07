import AppRoutes, { type PublicPageComponents } from './AppRoutes';
import Home from './pages/Home';
import Resources from './pages/Resources';
import ResourceDetail from './pages/ResourceDetail';
import Waitlist from './pages/Waitlist';
import WaitlistDetail from './pages/WaitlistDetail';
import Mission from './pages/Mission';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import Help from './pages/Help';
import Accessibility from './pages/Accessibility';
import NotFound from './pages/NotFound';

const publicPages: PublicPageComponents = {
  Home,
  Resources,
  ResourceDetail,
  Waitlist,
  WaitlistDetail,
  Mission,
  Privacy,
  Terms,
  Help,
  Accessibility,
  NotFound,
};

export default function AppServer() {
  return <AppRoutes publicPages={publicPages} />;
}
