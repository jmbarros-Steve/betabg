export interface ReportDateRange {
  from: Date;
  to: Date;
}

export interface KPISummary {
  revenue: number;
  orders: number;
  roas: number;
  adSpend: number;
  aov: number;
  netProfitMargin: number;
  // % change vs previous period
  revenueChange?: number;
  ordersChange?: number;
  roasChange?: number;
  adSpendChange?: number;
  aovChange?: number;
}

export interface ProfitLossData {
  grossRevenue: number;
  netRevenue: number;
  costOfGoods: number;
  grossProfit: number;
  metaSpend: number;
  googleSpend: number;
  manualGoogleSpend: number;
  totalAdSpend: number;
  fixedCostItems: { name: string; amount: number }[];
  totalFixedCosts: number;
  paymentGatewayFees: number;
  shippingCosts: number;
  shopifyCommission: number;
  netProfit: number;
  netProfitMargin: number;
}

export interface ShopifyPerformance {
  topSkus: { title: string; revenue: number; quantity: number }[];
  dailyBreakdown: { date: string; revenue: number; orders: number }[];
  abandonedCartsCount: number;
  abandonedCartsValue: number;
  funnel: {
    sessions: number | null;
    addToCarts: number | null;
    checkoutsInitiated: number;
    purchases: number;
  } | null;
  customerMetrics: {
    conversionRate: number;
    averageLtv: number;
    totalCustomers: number;
    repeatCustomerRate: number;
  } | null;
}

export interface CampaignRow {
  campaign_name: string;
  platform: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  conversions: number;
  conversion_value: number;
  roas: number;
}

export interface AdPlatformPerformance {
  platform: 'meta' | 'google';
  campaigns: CampaignRow[];
  totalSpend: number;
  totalImpressions: number;
  totalClicks: number;
  totalConversions: number;
  totalRevenue: number;
  avgCtr: number;
  avgRoas: number;
}

export interface AIInsight {
  title: string;
  message: string;
  action: string;
}

export interface BundleRecommendation {
  name: string;
  products: string[];
  suggestedPrice: string;
  reason: string;
  type: 'star' | 'aov' | 'recovery';
}

export interface CampaignPlan {
  name: string;
  objective: string;
  audience: string;
  budgetSuggestion: string;
  rationale: string;
}

export interface EmailFlowPlan {
  flowName: string;
  trigger: string;
  emailCount: number;
  timing: string;
  expectedImpact: string;
  description: string;
}

export interface Projection {
  metric: string;
  current: string;
  projected: string;
  improvement: string;
}

export interface StrategySection {
  bundles: BundleRecommendation[];
  metaCampaigns: CampaignPlan[];
  googleCampaigns: CampaignPlan[];
  emailFlows: EmailFlowPlan[];
  projections: Projection[];
}

export interface ReportData {
  clientName: string;
  dateRange: ReportDateRange;
  kpi: KPISummary;
  profitLoss: ProfitLossData;
  shopify: ShopifyPerformance;
  adPlatforms: AdPlatformPerformance[];
  insights: AIInsight[];
  strategy?: StrategySection;
}
