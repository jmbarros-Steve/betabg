import { useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    // 404: user attempted to access non-existent route
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="text-center">
        <h1 className="mb-4 text-6xl font-bold text-slate-900">404</h1>
        <p className="mb-4 text-xl text-slate-500">Oops! Página no encontrada</p>
        <a href="/" className="text-[#1E3A7B] underline hover:text-[#162D5F]">
          Volver al inicio
        </a>
      </div>
    </div>
  );
};

export default NotFound;
