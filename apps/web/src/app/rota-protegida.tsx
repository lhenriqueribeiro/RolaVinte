import { Navigate, Outlet, useLocation } from 'react-router';
import { useSessao } from '@/features/auth/store-sessao';

export function RotaProtegida() {
  const token = useSessao((s) => s.token);
  const location = useLocation();

  if (!token) {
    return <Navigate to="/login" state={{ de: location.pathname }} replace />;
  }
  return <Outlet />;
}
