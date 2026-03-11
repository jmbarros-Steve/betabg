import { useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="text-center">
        <h1 className="mb-4 text-6xl font-bold text-slate-900">404</h1>
        <p className="mb-4 text-xl text-slate-500">Oops! Página no encontrada</p>
        <a href="/" className="text-blue-600 underline hover:text-blue-700">
          Volver al inicio
        </a>
      </div>
    </div>
  );
};

export default NotFound;
