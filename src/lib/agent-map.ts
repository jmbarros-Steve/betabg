export interface Agent {
  name: string;
  tmux_window: number;
  squad: 'marketing' | 'producto' | 'infra' | 'ventas';
  speciality: string;
}

export const AGENTS: Agent[] = [
  { name: 'W0-klaviyo',   tmux_window: 0, squad: 'marketing', speciality: 'klaviyo, email flows, contactos' },
  { name: 'W1-stevemail', tmux_window: 1, squad: 'marketing', speciality: 'email editor, templates, grapesjs' },
  { name: 'W2-meta',      tmux_window: 2, squad: 'marketing', speciality: 'meta ads, campañas, pixel, targeting' },
  { name: 'W3-google',    tmux_window: 3, squad: 'marketing', speciality: 'google ads, google oauth' },
  { name: 'W4-frontend',  tmux_window: 4, squad: 'producto',  speciality: 'react, ui, componentes, portal cliente' },
  { name: 'W5-nube',      tmux_window: 5, squad: 'infra',     speciality: 'cloud run, edge functions, deploy, infra' },
  { name: 'W6-metricas',  tmux_window: 6, squad: 'producto',  speciality: 'dashboard, analytics, reportes, graficos' },
  { name: 'W7-brief',     tmux_window: 7, squad: 'producto',  speciality: 'steve ai, chat, brand research, estrategia' },
  { name: 'W8-database',  tmux_window: 8, squad: 'infra',     speciality: 'supabase, sql, rls, migrations' },
  { name: 'W22-revenue', tmux_window: 22, squad: 'ventas',   speciality: 'planes, pricing, billing, stripe, subscriptions, upgrade, paywall, revenue' },
];

export function getAgentForSquad(squad: string): Agent {
  const available = AGENTS.filter(a => a.squad === squad);
  return available[Math.floor(Math.random() * available.length)];
}

export function getAgentBySpeciality(keywords: string[]): Agent {
  const text = keywords.join(' ').toLowerCase();
  for (const agent of AGENTS) {
    if (agent.speciality.split(', ').some(s => text.includes(s))) return agent;
  }
  if (text.includes('meta')) return AGENTS[2];
  if (text.includes('email') || text.includes('klaviyo')) return AGENTS[0];
  if (text.includes('deploy') || text.includes('edge')) return AGENTS[5];
  return AGENTS[4]; // fallback: frontend
}
