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
import FAQ from "./pages/FAQ";
import Changelog from "./pages/Changelog";
import Tutorial from "./pages/Tutorial";
import AppDocumentation from "./pages/AppDocumentation";
import SteveAppInfo from "./pages/SteveAppInfo";
import ShopifyApp from "./pages/ShopifyApp";
import ConnectShopify from "./pages/ConnectShopify";
import GoogleAdsDesignDoc from "./pages/GoogleAdsDesignDoc";
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
            <Route path="/" element={<Steve />} />
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
            <Route path="/terms" element={<TermsOfService />} />
            <Route path="/privacidad" element={<PrivacyPolicy />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/eliminacion-datos" element={<DataDeletion />} />
            <Route path="/data-deletion" element={<DataDeletion />} />
            <Route path="/faq" element={<FAQ />} />
            <Route path="/changelog" element={<Changelog />} />
            <Route path="/tutorial" element={<Tutorial />} />
            <Route path="/documentacion" element={<AppDocumentation />} />
            <Route path="/steve-info" element={<SteveAppInfo />} />
            <Route path="/shopify-app" element={<ShopifyApp />} />
            <Route path="/shopify" element={<ShopifyApp />} />
            <Route path="/connect-shopify" element={<ConnectShopify />} />
            <Route path="/google-ads-design-doc" element={<GoogleAdsDesignDoc />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
