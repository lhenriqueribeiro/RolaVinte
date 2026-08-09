import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { RotaProtegida } from './rota-protegida';
import { PaginaLogin } from '@/features/auth/PaginaLogin';
import { PaginaRegistro } from '@/features/auth/PaginaRegistro';
import { PaginaDashboard } from '@/features/mesas/PaginaDashboard';
import { PaginaConvite } from '@/features/mesas/PaginaConvite';
import { PaginaMesa } from '@/features/jogo/PaginaMesa';

export function Router() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<PaginaLogin />} />
        <Route path="/registro" element={<PaginaRegistro />} />
        <Route path="/convites/:token" element={<PaginaConvite />} />
        <Route element={<RotaProtegida />}>
          <Route path="/" element={<PaginaDashboard />} />
          <Route path="/mesas/:mesaId" element={<PaginaMesa />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
