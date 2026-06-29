import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ForcedPasswordChange } from './ForcedPasswordChange';
import { LoadingPage } from './ui/Spinner';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <LoadingPage />;
  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  if (user?.mustChangePassword) {
    return <ForcedPasswordChange />;
  }
  return <>{children}</>;
}
