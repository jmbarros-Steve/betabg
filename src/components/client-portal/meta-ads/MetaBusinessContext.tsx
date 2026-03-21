import { createContext, useContext } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MetaBusinessAssets {
  connectionId: string;
  businessId: string | null;
  businessName: string | null;
  adAccountId: string | null;
  adAccountName: string | null;
  pageId: string | null;
  pageName: string | null;
  igAccountId: string | null;
  igAccountName: string | null;
  pixelId: string | null;
}

export interface PortfolioItem {
  /** Display name for this portfolio / negocio */
  name: string;
  /** Business Manager ID */
  businessId: string;
  businessName: string;
  /** Ad account (without act_ prefix) */
  adAccountId: string;
  adAccountName: string;
  currency: string;
  timezone: string;
  /** Facebook Page */
  pageId: string | null;
  pageName: string | null;
  /** Instagram Business Account */
  igAccountId: string | null;
  igAccountName: string | null;
  /** Meta Pixel */
  pixelId: string | null;
}

export interface PageOption {
  id: string;
  name: string;
  igAccountId: string | null;
  igAccountName: string | null;
}

export interface BusinessGroup {
  businessId: string;
  businessName: string;
  portfolios: PortfolioItem[];
  pages?: PageOption[];
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface MetaBusinessContextType extends MetaBusinessAssets {
  /** Whether we're still loading the initial hierarchy */
  loading: boolean;
  /** Whether an account switch is in progress */
  switching: boolean;
  /** Timestamp of the last successful sync — components should refetch when this changes */
  lastSyncAt: number;
  /** Grouped hierarchy for the selector */
  businessGroups: BusinessGroup[];
  /** All flat portfolios for quick lookup */
  allPortfolios: PortfolioItem[];
  /** Switch to a different portfolio */
  selectPortfolio: (portfolio: PortfolioItem) => Promise<void>;
}

const MetaBusinessContext = createContext<MetaBusinessContextType | null>(null);

export function useMetaBusiness(): MetaBusinessContextType {
  const ctx = useContext(MetaBusinessContext);
  if (!ctx) {
    throw new Error('useMetaBusiness must be used inside MetaBusinessProvider');
  }
  return ctx;
}

export default MetaBusinessContext;
