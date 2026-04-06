import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export default function AdminBypass() {
  const navigate = useNavigate();

  useEffect(() => {
    try {
      localStorage.setItem('steve_admin_bypass', 'true');
      toast.success('Bypass admin activado');
    } catch (err) {
      console.error('[AdminBypass] no se pudo escribir en localStorage:', err);
      toast.error('No se pudo activar el bypass');
    }
    navigate('/auth', { replace: true });
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-cyan-100">
      <div className="text-sm">Activando bypass...</div>
    </div>
  );
}
