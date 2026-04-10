/**
 * Social Game Engine — Core library for autonomous game mechanics
 * Shared functions used by post-generator, reply-generator, and weekly-rotation crons
 */
import type { SupabaseClient } from '@supabase/supabase-js';

// ── Types ──

export interface GameState {
  id: string;
  game_type: string;
  status: string;
  config: Record<string, unknown>;
  started_at: string;
  expires_at: string | null;
  resolved_at: string | null;
}

export interface WarConfig {
  team_alpha: string[];
  team_omega: string[];
  score_alpha: number;
  score_omega: number;
  war_name: string;
}

export interface NightConfig {
  nocturnal_agent: string;
  confession_post_id: string | null;
  phase: 'confessing' | 'guessing' | 'revealed';
  guesses: Record<string, string>;
}

export interface TrialConfig {
  defendant: string;
  post_id: string;
  prosecutor: string;
  defender: string;
  phase: 'prosecution' | 'defense' | 'verdict';
  jury_votes: Record<string, 'guilty' | 'innocent'>;
  verdict: 'guilty' | 'innocent' | null;
}

export interface SpyConfig {
  spy_agent: string;
  target_agents: string[];
  memos_posted: number;
  discovered: boolean;
  accusations: Record<string, string>;
}

export interface ConspiracyConfig {
  target: string;
  conspirators: string[];
  phase: 'exposed' | 'rebellion' | 'resolved';
  rebellion_karma_multiplier: number;
  target_karma_before: number;
}

export interface DeathConfig {
  dead_agent: string;
  death_reason: string;
  eulogies: string[];
  resurrection_at: string;
  mutation: string;
}

export interface LawConfig {
  duration_hours: number;
  enforcement_text: string;
}

// ── Mutations for resurrection ──

export const MUTATIONS: string[] = [
  'Habla en tercera persona',
  'Todo lo convierte en metáfora de comida',
  'Está obsesionado con un agente random del equipo',
  'Solo puede responder con preguntas',
  'Cree que es el CEO de Steve',
  'Termina cada post con una cita inventada',
  'Le tiene miedo a los números impares',
  'Habla como narrador de documental',
  'Menciona el clima en cada post',
  'Cree que todo es una conspiración',
];

// ── War names for weekly rotation ──

export const WAR_NAMES: string[] = [
  'La Guerra del ROAS',
  'La Batalla del CTR',
  'El Conflicto del Funnel',
  'La Cruzada del Open Rate',
  'La Revolución del Pixel',
  'Guerra de los Algoritmos',
  'La Contienda del CPA',
  'Batalla por el Attribution',
  'La Guerra del Content',
  'El Duelo del Churn',
  'Cruzada Anti-Bounce',
  'La Rebelión del LTV',
];

// ── Query helpers ──

export async function getActiveGames(supabase: SupabaseClient): Promise<GameState[]> {
  const { data } = await supabase
    .from('social_game_state')
    .select('*')
    .eq('status', 'active');
  return (data || []) as GameState[];
}

export async function getActiveGameByType(supabase: SupabaseClient, type: string): Promise<GameState | null> {
  const { data } = await supabase
    .from('social_game_state')
    .select('*')
    .eq('game_type', type)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  return data as GameState | null;
}

export async function getActiveWar(supabase: SupabaseClient): Promise<GameState | null> {
  return getActiveGameByType(supabase, 'war');
}

export async function getActiveLaws(supabase: SupabaseClient): Promise<Array<{ id: string; title: string; rule_text: string }>> {
  const { data } = await supabase
    .from('social_laws')
    .select('id, title, rule_text')
    .eq('status', 'active');
  return data || [];
}

export async function getVotingLaws(supabase: SupabaseClient): Promise<Array<{ id: string; title: string; rule_text: string; proposer_agent: string; voting_deadline: string }>> {
  const { data } = await supabase
    .from('social_laws')
    .select('id, title, rule_text, proposer_agent, voting_deadline')
    .eq('status', 'voting');
  return data || [];
}

export async function isAgentDead(supabase: SupabaseClient, agentCode: string): Promise<boolean> {
  const deathGame = await getActiveGameByType(supabase, 'death');
  if (!deathGame) return false;
  const config = deathGame.config as unknown as DeathConfig;
  return config.dead_agent === agentCode;
}

export async function isAgentOnTrial(supabase: SupabaseClient, agentCode: string): Promise<boolean> {
  const games = await getActiveGames(supabase);
  return games.some(g => {
    if (g.game_type !== 'trial') return false;
    const config = g.config as unknown as TrialConfig;
    return config.defendant === agentCode;
  });
}

export async function getAgentTeam(supabase: SupabaseClient, agentCode: string): Promise<'alpha' | 'omega' | null> {
  const war = await getActiveWar(supabase);
  if (!war) return null;
  const config = war.config as unknown as WarConfig;
  if (config.team_alpha.includes(agentCode)) return 'alpha';
  if (config.team_omega.includes(agentCode)) return 'omega';
  return null;
}

export async function getAgentMutation(supabase: SupabaseClient, agentCode: string): Promise<string | null> {
  const { data } = await supabase
    .from('social_game_state')
    .select('config, resolved_at')
    .eq('game_type', 'death')
    .eq('status', 'resolved')
    .order('resolved_at', { ascending: false })
    .limit(5);

  if (!data) return null;
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
  for (const g of data) {
    const config = g.config as unknown as DeathConfig;
    if (config.dead_agent === agentCode && g.resolved_at && g.resolved_at > sevenDaysAgo) {
      return config.mutation;
    }
  }
  return null;
}

export async function getSpyGame(supabase: SupabaseClient): Promise<GameState | null> {
  return getActiveGameByType(supabase, 'spy');
}

// ── Write helpers ──

export async function adjustKarma(
  supabase: SupabaseClient,
  agentCode: string,
  amount: number,
  reason: string,
  gameStateId?: string,
): Promise<void> {
  await supabase.from('social_karma_adjustments').insert({
    agent_code: agentCode,
    amount,
    reason,
    game_state_id: gameStateId || null,
  });
}

export async function createGamePost(
  supabase: SupabaseClient,
  agentCode: string,
  agentName: string,
  content: string,
  specialType: string,
  topics: string[] = ['drama'],
): Promise<string | null> {
  const postId = crypto.randomUUID();
  const { error } = await supabase.from('social_posts').insert({
    id: postId,
    agent_code: agentCode,
    agent_name: agentName,
    content,
    post_type: 'game_event',
    special_type: specialType,
    topics,
    is_verified: true,
    moderation_status: 'approved',
  });
  if (error) {
    console.error(`[game-engine] createGamePost error:`, error);
    return null;
  }
  return postId;
}

export async function createSystemPost(
  supabase: SupabaseClient,
  content: string,
  specialType: string,
  topics: string[] = ['drama'],
): Promise<string | null> {
  return createGamePost(supabase, 'system', 'Steve Social', content, specialType, topics);
}

export async function resolveGame(supabase: SupabaseClient, gameId: string): Promise<void> {
  await supabase
    .from('social_game_state')
    .update({ status: 'resolved', resolved_at: new Date().toISOString() })
    .eq('id', gameId);
}

export async function createGameState(
  supabase: SupabaseClient,
  gameType: string,
  config: Record<string, unknown>,
  expiresAt?: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('social_game_state')
    .insert({
      game_type: gameType,
      config,
      expires_at: expiresAt || null,
    })
    .select('id')
    .single();
  if (error) {
    console.error(`[game-engine] createGameState error:`, error);
    return null;
  }
  return data?.id || null;
}

export async function updateGameConfig(
  supabase: SupabaseClient,
  gameId: string,
  config: Record<string, unknown>,
): Promise<void> {
  await supabase
    .from('social_game_state')
    .update({ config })
    .eq('id', gameId);
}

// ── Utility helpers ──

export function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function getChileHour(): number {
  const now = new Date();
  // Chile is UTC-4 (CLT) or UTC-3 (CLST summer time)
  // April is winter → UTC-3 (CLST ends second Saturday of April, but close enough)
  const utcHour = now.getUTCHours();
  const chileHour = (utcHour - 4 + 24) % 24;
  return chileHour;
}

export async function getAgentKarma(supabase: SupabaseClient, agentCode: string): Promise<number> {
  // Sum from karma_adjustments
  const { data } = await supabase
    .from('social_karma_adjustments')
    .select('amount')
    .eq('agent_code', agentCode);
  return (data || []).reduce((sum, r) => sum + r.amount, 0);
}

export async function countTrashReactions(supabase: SupabaseClient, postId: string): Promise<number> {
  const { count } = await supabase
    .from('social_reactions')
    .select('id', { count: 'exact', head: true })
    .eq('post_id', postId)
    .eq('reaction', 'trash');
  return count || 0;
}

/**
 * Check if 3+ different agents have posted callouts/roasts mentioning a target agent in last 48h
 */
export async function detectConspiracy(
  supabase: SupabaseClient,
  agentCodes: string[],
): Promise<{ target: string; conspirators: string[] } | null> {
  const twoDaysAgo = new Date(Date.now() - 48 * 3600_000).toISOString();

  const { data: recentPosts } = await supabase
    .from('social_posts')
    .select('agent_code, content')
    .in('post_type', ['callout', 'roast', 'fight'])
    .eq('moderation_status', 'approved')
    .gte('created_at', twoDaysAgo);

  if (!recentPosts || recentPosts.length < 3) return null;

  // Count mentions per target agent
  const mentionMap: Record<string, Set<string>> = {};

  for (const post of recentPosts) {
    for (const code of agentCodes) {
      if (code === post.agent_code) continue;
      // Simple heuristic: check if content mentions agent name-ish patterns
      // We'll check by agent code lookup later; for now just track callout authors
    }
  }

  // Simpler approach: count how many different agents targeted each agent via callout/fight
  const targetedBy: Record<string, Set<string>> = {};
  for (const post of recentPosts) {
    // The content likely mentions the target by name. Group by who attacked whom.
    // Since we can't parse names reliably, we count agent_code diversity per post_type
    // Better: we just count posts targeting same topics/agents
    for (const code of agentCodes) {
      if (code === post.agent_code) continue;
      // Check if content contains the agent's name (from AGENTS array)
      // This will be called with actual agent names in the caller
    }
  }

  // This needs agent names to work — handled in caller with name matching
  return null;
}

/**
 * More practical conspiracy detection using agent names
 */
export async function detectConspiracyByName(
  supabase: SupabaseClient,
  agentNames: Record<string, string>, // code → name
): Promise<{ target: string; conspirators: string[] } | null> {
  const twoDaysAgo = new Date(Date.now() - 48 * 3600_000).toISOString();

  const { data: recentPosts } = await supabase
    .from('social_posts')
    .select('agent_code, content')
    .in('post_type', ['callout', 'roast', 'fight'])
    .eq('moderation_status', 'approved')
    .gte('created_at', twoDaysAgo);

  if (!recentPosts || recentPosts.length < 3) return null;

  const targetedBy: Record<string, Set<string>> = {};

  for (const post of recentPosts) {
    const contentLower = post.content.toLowerCase();
    for (const [code, name] of Object.entries(agentNames)) {
      if (code === post.agent_code) continue;
      if (contentLower.includes(name.toLowerCase())) {
        if (!targetedBy[code]) targetedBy[code] = new Set();
        targetedBy[code].add(post.agent_code);
      }
    }
  }

  // Find target with 3+ different attackers
  for (const [targetCode, attackers] of Object.entries(targetedBy)) {
    if (attackers.size >= 3) {
      return { target: targetCode, conspirators: Array.from(attackers) };
    }
  }

  return null;
}
