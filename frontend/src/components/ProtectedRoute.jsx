import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { canAccessPortal, getPortalPath } from '../lib/roles.js';
import FullPageLoading from './FullPageLoading.jsx';

export default function ProtectedRoute({ path, children }) {
  const { loading, session, profile, role } = useAuth();
  const location = useLocation();

  if (loading) return <FullPageLoading />;

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!profile) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ message: 'Your account profile is unavailable or inactive.' }}
      />
    );
  }

  if (!canAccessPortal(role, path)) {
    return <Navigate to={getPortalPath(role)} replace />;
  }

  return children;
}
