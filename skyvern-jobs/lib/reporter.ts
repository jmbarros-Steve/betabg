import { createTask, type DetectiveLogEntry } from './supabase.js';

const AGENT_MAP: Record<string, string> = {
  'meta-campaigns': 'producto',
  'meta-audiences': 'producto',
  'meta-metrics': 'producto',
  'klaviyo-emails': 'producto',
  'shopify-products': 'producto',
  'shopify-orders': 'producto',
  'tokens-health': 'infra',
  'visual-meta': 'producto',
  'visual-shopify': 'producto',
  'visual-klaviyo': 'producto',
  'qa-meta-wizard': 'producto',
  'qa-steve-chat': 'producto',
  'qa-steve-mail': 'producto',
};

export async function alertIfCritical(results: DetectiveLogEntry[]) {
  const criticals = results.filter(r => r.severity === 'CRITICAL');

  for (const c of criticals) {
    const squad = AGENT_MAP[c.module] || 'producto';
    await createTask(
      `[DETECTIVE] ${c.severity}: ${(c.details || '').slice(0, 80)}`,
      `Run: ${c.run_id}\nModule: ${c.module}\nCheck: ${c.check_type}\n\n${c.details || ''}`,
      'alta',
      squad
    );
  }

  const majors = results.filter(r => r.severity === 'MAJOR');
  for (const m of majors) {
    const squad = AGENT_MAP[m.module] || 'producto';
    await createTask(
      `[DETECTIVE] ${m.severity}: ${(m.details || '').slice(0, 80)}`,
      `Run: ${m.run_id}\nModule: ${m.module}\nCheck: ${m.check_type}\n\n${m.details || ''}`,
      'media',
      squad
    );
  }

  if (criticals.length >= 2) {
    console.log(`🚨 ${criticals.length} CRITICAL issues — tasks created`);
  }

  return { criticals: criticals.length, majors: majors.length };
}
