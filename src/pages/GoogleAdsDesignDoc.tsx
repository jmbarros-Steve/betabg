import { useEffect } from 'react';
import { jsPDF } from 'jspdf';

export default function GoogleAdsDesignDoc() {
  useEffect(() => {
    const doc = new jsPDF();
    const margin = 20;
    const pageWidth = doc.internal.pageSize.getWidth();
    const maxWidth = pageWidth - margin * 2;
    let y = 20;

    const addTitle = (text: string, size = 16) => {
      if (y > 260) { doc.addPage(); y = 20; }
      doc.setFontSize(size);
      doc.setFont('helvetica', 'bold');
      doc.text(text, margin, y);
      y += size * 0.6;
    };

    const addSubtitle = (text: string) => {
      if (y > 260) { doc.addPage(); y = 20; }
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(text, margin, y);
      y += 7;
    };

    const addBody = (text: string) => {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      const lines = doc.splitTextToSize(text, maxWidth);
      for (const line of lines) {
        if (y > 280) { doc.addPage(); y = 20; }
        doc.text(line, margin, y);
        y += 5;
      }
      y += 3;
    };

    const addBullet = (text: string) => {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      const lines = doc.splitTextToSize(text, maxWidth - 8);
      for (let i = 0; i < lines.length; i++) {
        if (y > 280) { doc.addPage(); y = 20; }
        doc.text(i === 0 ? `•  ${lines[i]}` : `   ${lines[i]}`, margin, y);
        y += 5;
      }
    };

    const addSpace = (s = 5) => { y += s; };

    // === COVER ===
    addTitle('Steve — AI Marketing Copilot', 20);
    addSpace(5);
    addTitle('Google Ads API Integration', 16);
    addTitle('Design Documentation', 14);
    addSpace(10);
    addBody('Company: BG Consult');
    addBody('Product: Steve — AI Marketing Copilot');
    addBody('Website: https://betabg.lovable.app');
    addBody('Date: February 2026');
    addBody('Version: 1.0');
    addSpace(10);

    // === 1. PRODUCT OVERVIEW ===
    addTitle('1. Product Overview');
    addBody('Steve is an AI-powered marketing copilot designed for e-commerce merchants using Shopify. It connects to advertising platforms (Meta Ads, Google Ads) and analytics tools (Shopify, Klaviyo) to provide unified performance dashboards, AI-driven campaign recommendations, automated ad copy generation, and programmatic campaign management.');
    addSpace();
    addBody('The Google Ads integration enables merchants and agency clients to:');
    addBullet('Connect their Google Ads accounts securely via OAuth 2.0');
    addBullet('View campaign performance metrics in a unified dashboard');
    addBullet('Receive AI-powered optimization recommendations');
    addBullet('Create, modify, and manage campaigns programmatically');
    addBullet('Adjust budgets and bidding strategies based on AI analysis');
    addBullet('Pause or enable campaigns automatically based on performance');
    addSpace(8);

    // === 2. OAUTH FLOW ===
    addTitle('2. OAuth 2.0 Authentication Flow');
    addBody('Steve uses the standard OAuth 2.0 Authorization Code Grant flow to obtain access to Google Ads accounts. All token handling is performed exclusively on the server side.');
    addSpace();
    addSubtitle('2.1 Flow Steps');
    addBullet('1. User clicks "Connect Google Ads" in the client portal');
    addBullet('2. Frontend redirects to Google OAuth consent screen with scope: https://www.googleapis.com/auth/adwords');
    addBullet('3. User authorizes access and Google redirects back with an authorization code');
    addBullet('4. Backend Edge Function exchanges the code for access_token and refresh_token');
    addBullet('5. Tokens are encrypted using AES-256 (pgcrypto) and stored in the database');
    addBullet('6. User is redirected to the portal with a success confirmation');
    addSpace();
    addSubtitle('2.2 OAuth Configuration');
    addBody('Client ID: 850416724643-52bpu0tvsd9juc2v5b636ajfk4sogt24.apps.googleusercontent.com');
    addBody('Redirect URI: https://betabg.lovable.app/oauth/google-ads/callback');
    addBody('Scope: https://www.googleapis.com/auth/adwords');
    addBody('Access Type: offline (to obtain refresh tokens)');
    addBody('Prompt: consent (to always receive refresh token)');
    addSpace(8);

    // === 3. API ENDPOINTS ===
    addTitle('3. Google Ads API Endpoints Used');
    addSpace();
    addSubtitle('3.1 Read Operations (Current)');
    addBullet('customers:listAccessibleCustomers — Lists all Google Ads accounts the user has access to, including MCC sub-accounts');
    addBullet('customers/{id} — Retrieves account details (name, currency, timezone)');
    addBullet('googleAds:searchStream — Executes GAQL queries to retrieve campaign metrics: impressions, clicks, spend, conversions, conversion_value, ctr, cpc, cpm, roas');
    addSpace();
    addSubtitle('3.2 Write Operations (Planned & In Development)');
    addBullet('googleAds:mutate — Create campaigns, ad groups, and ads');
    addBullet('Campaign budget creation and modification');
    addBullet('Bidding strategy updates (Target ROAS, Maximize Conversions)');
    addBullet('Ad status changes (ENABLED, PAUSED, REMOVED)');
    addBullet('Keyword management for Search campaigns');
    addBullet('Asset management for Performance Max campaigns');
    addSpace();
    addSubtitle('3.3 Supported Campaign Types');
    addBullet('Search Campaigns');
    addBullet('Shopping Campaigns');
    addBullet('Display Campaigns');
    addBullet('Performance Max Campaigns');
    addBullet('Video Campaigns (YouTube)');
    addSpace(8);

    // === 4. DATA FLOW ===
    doc.addPage(); y = 20;
    addTitle('4. Data Flow Architecture');
    addSpace();
    addSubtitle('4.1 Metrics Synchronization');
    addBody('The sync-google-ads-metrics Edge Function retrieves campaign data for the last 30 days using GAQL (Google Ads Query Language). Metrics are stored in the campaign_metrics table with the following fields: campaign_id, campaign_name, impressions, clicks, spend, conversions, conversion_value, ctr, cpc, cpm, roas, currency, and metric_date.');
    addSpace();
    addSubtitle('4.2 MCC (Manager Account) Support');
    addBody('When a user connects an MCC account, the system uses the login-customer-id header to access sub-accounts. The listAccessibleCustomers endpoint returns all accounts in the hierarchy, and the user can select which account to connect.');
    addSpace();
    addSubtitle('4.3 Token Refresh');
    addBody('Access tokens expire after 1 hour. The system automatically uses the stored refresh_token to obtain a new access_token before making API calls. The refresh process is transparent to the user and handled entirely server-side.');
    addSpace(8);

    // === 5. SECURITY ===
    addTitle('5. Security Architecture');
    addSpace();
    addBullet('All OAuth tokens are encrypted at rest using AES-256 via PostgreSQL pgcrypto extension');
    addBullet('Token exchange and API calls occur exclusively in server-side Edge Functions (Deno)');
    addBullet('No credentials are ever exposed to the client/frontend');
    addBullet('Row Level Security (RLS) policies ensure strict data isolation between clients');
    addBullet('HMAC-SHA256 verification for webhook payloads');
    addBullet('JWT-based authentication for all API endpoints');
    addBullet('Refresh tokens are stored separately and encrypted independently');
    addSpace(8);

    // === 6. COMPLIANCE ===
    addTitle('6. Compliance & Data Handling');
    addSpace();
    addBullet('Steve does NOT use the Google Ads API for App Conversion Tracking');
    addBullet('Steve does NOT use the Google Ads API for Remarketing');
    addBullet('Data is used solely for analytics, reporting, and campaign management on behalf of authenticated users');
    addBullet('Users can disconnect their Google Ads account at any time, which deactivates the connection and stops all data synchronization');
    addBullet('No Google Ads data is shared with third parties');
    addBullet('Data retention follows standard business analytics practices');
    addSpace(8);

    // === 7. TECH STACK ===
    addTitle('7. Technical Stack');
    addSpace();
    addBullet('Frontend: React + TypeScript + Vite');
    addBullet('Backend: Supabase Edge Functions (Deno runtime)');
    addBullet('Database: PostgreSQL with Row Level Security');
    addBullet('Encryption: pgcrypto (AES-256)');
    addBullet('Authentication: Supabase Auth + JWT');
    addBullet('Hosting: Lovable Cloud');
    addBullet('Google Ads API Version: v18');

    // Save
    doc.save('Steve_Google_Ads_API_Design_Documentation.pdf');

    // Redirect back after download
    setTimeout(() => {
      window.history.back();
    }, 2000);
  }, []);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <p className="text-lg">Generando PDF de documentación técnica...</p>
    </div>
  );
}
