import { getSupabaseAdmin } from './supabase.js';

export type TaskPriority = 'critica' | 'alta' | 'media' | 'baja';
export type TaskType = 'bug' | 'mejora' | 'feature' | 'adaptacion' | 'seguridad';
export type TaskSource = 'ojos' | 'criterio' | 'espejo' | 'juez' | 'oidos' | 'ceo' | 'manual';
export type Squad = 'marketing' | 'producto' | 'infra';

export interface TaskInput {
  shop_id?: string;
  title: string;
  description: string;
  priority: TaskPriority;
  type: TaskType;
  source: TaskSource;
  assigned_squad?: Squad;
}

export async function createTask(input: TaskInput) {
  const supabase = getSupabaseAdmin();

  // Deduplicación: no crear si ya existe título igual con status pending/in_progress
  const { data: existing } = await supabase
    .from('tasks')
    .select('id')
    .eq('title', input.title)
    .in('status', ['pending', 'in_progress'])
    .limit(1);

  if (existing && existing.length > 0) {
    return { created: false, reason: 'duplicate', existing_id: existing[0].id };
  }

  if (!input.assigned_squad) {
    input.assigned_squad = autoAssignSquad(input);
  }

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      ...input,
      status: 'pending',
      attempts: 0,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return { created: false, reason: error.message };
  return { created: true, task: data };
}

function autoAssignSquad(input: TaskInput): Squad {
  const text = (input.title + ' ' + input.description).toLowerCase();
  if (text.match(/meta|campaña|anuncio|klaviyo|email|copy|creative|targeting|ad\b/)) return 'marketing';
  if (text.match(/deploy|edge function|timeout|cloud run|supabase|api caída|endpoint|ssl|dns/)) return 'infra';
  return 'producto';
}
