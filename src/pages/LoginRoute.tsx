import { AdminAuthProvider } from '../admin/AdminAuthContext';
import Login from './Login';

/**
 * Public sign-in checks admin membership only on this route so admin auth code
 * and its session subscription stay out of the public browsing path.
 */
export default function LoginRoute() {
  return (
    <AdminAuthProvider>
      <Login />
    </AdminAuthProvider>
  );
}
