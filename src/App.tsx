import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import ClientPortal from "./pages/ClientPortal";
import OAuthMetaCallback from "./pages/OAuthMetaCallback";
import Blog from "./pages/Blog";
import CentroEstudios from "./pages/CentroEstudios";
import TermsOfService from "./pages/TermsOfService";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import DataDeletion from "./pages/DataDeletion";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/portal" element={<ClientPortal />} />
            <Route path="/oauth/meta/callback" element={<OAuthMetaCallback />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/centro-estudios" element={<CentroEstudios />} />
            <Route path="/terminos" element={<TermsOfService />} />
            <Route path="/privacidad" element={<PrivacyPolicy />} />
            <Route path="/eliminacion-datos" element={<DataDeletion />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
