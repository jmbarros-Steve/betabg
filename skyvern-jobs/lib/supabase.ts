import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export interface DetectiveLogEntry {
  run_id: string;
  source: 'visual' | 'api' | 'qa' | 'onboarding';
  module: string;
  client_id?: string;
  check_type: string;
  status: 'PASS' | 'MISMATCH' | 'MISSING' | 'ERROR';
  severity: 'CRITICAL' | 'MAJOR' | 'MINOR';
  steve_value?: Record<string, unknown>;
  real_value?: Record<string, unknown>;
  mismatched_fields?: string[];
  details?: string;
  screenshot_url?: string;
  steve_record_id?: string;
  external_id?: string;
}

export async function logResult(entry: DetectiveLogEntry) {
  const { error } = await supabase.from('detective_log').insert(entry);
  if (error) console.error('Failed to log result:', error.message);
}

export async function saveRun(run: {
  run_id: string;
  source: string;
  total_checks: number;
  passed: number;
  mismatches: number;
  critical: number;
  score: number;
  by_module: Record<string, unknown>;
}) {
  const { error } = await supabase.from('detective_runs').insert(run);
  if (error) console.error('Failed to save run:', error.message);
}

export async function createTask(title: string, description: string, priority: 'alta' | 'media' | 'baja', squad = 'producto') {
  const { error } = await supabase.from('tasks').insert({
    title,
    description,
    priority,
    type: 'bug',
    source: 'ojos',
    assigned_squad: squad,
    status: 'pending',
  });
  if (error) console.error('Failed to create task:', error.message);
}
