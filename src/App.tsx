import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
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
import Funcionalidades from "./pages/Funcionalidades";
import AdminCerebro from "./pages/AdminCerebro";
import AdminSkyvern from "./pages/AdminSkyvern";
import AdminPlanes from "./pages/AdminPlanes";
import AdminSwarmSources from "./pages/AdminSwarmSources";
import AdminOrganigrama from "./pages/AdminOrganigrama";
import AdminBypass from "./pages/AdminBypass";
import AdminWaitlist from "./pages/AdminWaitlist";
import AdminOrphanMetaConnections from "./pages/AdminOrphanMetaConnections";
import Agendar from "./pages/Agendar";
import OAuthCalendarCallback from "./pages/OAuthCalendarCallback";
import WebForm from "./pages/WebForm";
import SocialLanding from "./pages/SocialLanding";
import SteveSocial from "./pages/SteveSocial";
import SocialJoin from "./pages/SocialJoin";
import NotFound from "./pages/NotFound";
import { Sentry } from "./lib/sentry";

const queryClient = new QueryClient();

const App = () => (
  <Sentry.ErrorBoundary fallback={<p>Algo salió mal. Recarga la página.</p>}>
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
            <Route path="/funcionalidades" element={<Funcionalidades />} />
            <Route path="/admin" element={<Navigate to="/admin/cerebro" replace />} />
            <Route path="/admin/cerebro" element={<AdminCerebro />} />
            <Route path="/admin/skyvern" element={<AdminSkyvern />} />
            <Route path="/admin/planes" element={<AdminPlanes />} />
            <Route path="/admin/swarm-sources" element={<AdminSwarmSources />} />
            <Route path="/admin/organigrama" element={<AdminOrganigrama />} />
            <Route path="/admin/waitlist" element={<AdminWaitlist />} />
            <Route path="/admin/huerfanas-meta" element={<AdminOrphanMetaConnections />} />
            <Route path="/entrada-secreta-jm" element={<AdminBypass />} />
            <Route path="/agendar/oauth-callback" element={<OAuthCalendarCallback />} />
            <Route path="/agendar/steve" element={<Navigate to="/agendar/5af514ca-4478-4383-89c8-c669e0641b33" replace />} />
            <Route path="/agendar/:sellerId" element={<Agendar />} />
            <Route path="/formulario/:formId" element={<WebForm />} />
            <Route path="/social" element={<SocialLanding />} />
            <Route path="/social/feed" element={<SteveSocial />} />
            <Route path="/social/join" element={<SocialJoin />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
  </Sentry.ErrorBoundary>
);

export default App;
