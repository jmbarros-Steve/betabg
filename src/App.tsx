import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Steve from "./pages/Steve";
import Dashboard from "./pages/Dashboard";
import ClientPortal from "./pages/ClientPortal";
import OAuthMetaCallback from "./pages/OAuthMetaCallback";
import OAuthShopifyCallback from "./pages/OAuthShopifyCallback";
import OAuthGoogleAdsCallback from "./pages/OAuthGoogleAdsCallback";
import Blog from "./pages/Blog";
import CentroEstudios from "./pages/CentroEstudios";
import ServiciosCorporativos from "./pages/ServiciosCorporativos";
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
            <Route path="/steve" element={<Steve />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/portal" element={<ClientPortal />} />
            <Route path="/portal/:clientId" element={<ClientPortal />} />
            <Route path="/oauth/meta/callback" element={<OAuthMetaCallback />} />
            <Route path="/oauth/shopify/callback" element={<OAuthShopifyCallback />} />
            <Route path="/oauth/google-ads/callback" element={<OAuthGoogleAdsCallback />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/centro-estudios" element={<CentroEstudios />} />
            <Route path="/servicios-corporativos" element={<ServiciosCorporativos />} />
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
