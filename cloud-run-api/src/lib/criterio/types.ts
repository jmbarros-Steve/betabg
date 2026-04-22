// Shared types for the CRITERIO evaluation system

export interface CriterioRule {
  id: string;
  category: string;
  name: string;
  check_rule: string;
  severity: string;
  weight: number;
  auto: boolean;
  organ: string;
  active: boolean;
  check_type?: string;
  check_config?: CheckConfig;
  implemented?: boolean;
}

export interface EvalResult {
  passed: boolean;
  actual: string;
  expected: string;
  details: string | null;
  /**
   * If true, the rule was NOT applicable to this payload (e.g. the field
   * didn't exist). The evaluator short-circuits and the caller should treat
   * this result as a no-op: it doesn't count toward score, totals, blockers
   * or persist to criterio_results.
   */
  skipped?: boolean;
}

export interface CriterioIssue {
  rule_id: string;
  severity: string;
  details: string;
  actual_value?: string;
}

export interface CriterioResponse {
  score: number;
  total: number;
  passed: number;
  failed: number;
  blockers: number;
  can_publish: boolean;
  reason?: string;
  failed_rules: Array<CriterioIssue>;
  warnings?: Array<CriterioIssue>;
  skipped?: number;
}

// --- Check config types by check_type ---

export interface LengthConfig {
  field: string;         // which field to check (e.g. "primary_text", "subject")
  min?: number;
  max?: number;
}

export interface ForbiddenConfig {
  field: string;
  words?: string[];      // list of forbidden words/phrases
  patterns?: string[];   // optional regex patterns (word_boundary-aware)
  source?: string;       // optional: "brand_research.competitors" to load dynamically
  case_sensitive?: boolean;
  word_boundary?: boolean; // if true, match whole-words with \b (avoids "q" inside "que")
}

export interface RequiredConfig {
  field: string;         // field that must exist and not be empty
  contains?: string;     // optional substring that must be present
  source?: string;       // optional: dynamic source for the value to check
  description?: string;
}

export interface RegexConfig {
  field: string;
  pattern: string;       // regex pattern string
  flags?: string;        // regex flags (e.g. "gi")
  should_match?: boolean; // true = must match, false = must NOT match (default: false)
  max_pct?: number;      // quota mode: max % of matches vs total letters (e.g. 30)
  max_matches?: number;  // quota mode: max absolute number of matches (e.g. 2)
}

export interface RangeConfig {
  field: string;
  min?: number;
  max?: number;
  unit?: string;         // display unit (e.g. "CLP", "px", "%")
  skip_if_zero?: boolean; // true = treat 0 as "not using this dimension" (broad targeting)
  description?: string;  // optional human-readable description
}

export interface ComparisonConfig {
  field_a: string;
  field_b: string;
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'different' | 'contains';
  description?: string;
}

export interface DbLookupConfig {
  table: string;         // supabase table to query
  match_field: string;   // field in the table to match against
  match_value_field: string; // field in the data to get the value from
  check: 'exists' | 'not_exists' | 'value_matches' | 'count_min' | 'count_max' | 'freshness';
  value_field?: string;  // field in the table to return/compare
  min_count?: number;
  max_count?: number;
  max_age_hours?: number; // for freshness checks
}

export interface AiConfig {
  prompt: string;        // prompt template for Claude evaluation
  field: string;         // which field(s) to evaluate
  context_fields?: string[]; // additional context fields to include
  threshold?: number;    // pass threshold (0-1, default 0.7)
}

export interface ExternalConfig {
  service: 'languagetool' | 'spelling' | 'vision' | 'ffmpeg';
  field: string;
  language?: string;
  check?: string;        // what to check (e.g. "blur", "logo", "text_overlay", "no_watermark")
}

export interface ManualReviewConfig {
  description: string;
  create_task?: boolean;
  severity_override?: string;
}

// Union type for all configs
export type CheckConfig =
  | LengthConfig
  | ForbiddenConfig
  | RequiredConfig
  | RegexConfig
  | RangeConfig
  | ComparisonConfig
  | DbLookupConfig
  | AiConfig
  | ExternalConfig
  | ManualReviewConfig
  | Record<string, any>;

// Evaluator function signature
export type EvaluatorFn = (
  config: CheckConfig,
  data: Record<string, any>,
  context?: EvalContext,
) => EvalResult | Promise<EvalResult>;

// Context passed to evaluators that need external data
export interface EvalContext {
  brief?: Record<string, any> | null;
  products?: Array<Record<string, any>>;
  supabase?: any; // SupabaseClient
}
