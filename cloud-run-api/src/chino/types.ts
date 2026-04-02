// El Chino — Types for the check system

export interface ChinoCheck {
  id: string;
  check_number: number;
  description: string;
  check_type: 'api_compare' | 'api_exists' | 'token_health' | 'performance' | 'visual' | 'functional' | 'data_quality' | 'security';
  platform: 'shopify' | 'meta' | 'klaviyo' | 'stevemail' | 'steve_chat' | 'brief' | 'scraping' | 'infra' | 'security' | 'all';
  severity: 'critical' | 'high' | 'medium' | 'low';
  check_config: Record<string, any>;
  consecutive_fails: number;
  is_active: boolean;
  last_checked_at: string | null;
  last_result: string | null;
}

export interface MerchantConn {
  client_id: string;
  client_name: string;
  platform: string;
  connection_id: string;
  access_token_encrypted: string | null;
  api_key_encrypted: string | null;
  store_url: string | null;
  account_id: string | null;
}

export interface CheckResult {
  result: 'pass' | 'fail' | 'skip' | 'error';
  steve_value?: number | string | null;
  real_value?: number | string | null;
  error_message?: string;
  duration_ms: number;
  screenshot_url?: string;
}

export interface PatrolResult {
  run_id: string;
  total: number;
  passed: number;
  failed: number;
  errors: number;
  skipped: number;
  duration_ms: number;
  details: PatrolDetail[];
}

export interface PatrolDetail {
  check_number: number;
  description: string;
  platform: string;
  merchant_id?: string;
  merchant_name?: string;
  result: CheckResult;
}
