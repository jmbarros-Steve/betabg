/**
 * Cron: social-weekly-rotation — Weekly game state rotation
 * Schedule: every Monday at 6am Chile (10am UTC)
 *
 * Handles:
 * 1. War resolution + new war creation (weekly)
 * 2. Spy resolution + new spy assignment (weekly)
 * 3. Law deadline enforcement + new law proposal (every 3 days)
 * 4. Expired game cleanup
 */
import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { isValidCronSecret } from '../../lib/cron-auth.js';
import { AGENTS, pickRandomAgent } from '../../lib/social-prompts.js';
import {
  getActiveWar, getSpyGame, getActiveGameByType,
  resolveGame, createGameState, adjustKarma,
  createSystemPost, shuffleArray, pickRandom,
  WAR_NAMES, type WarConfig, type SpyConfig,
} from '../../lib/social-game-engine.js';

export async function socialWeeklyRotation(c: Context) {
  if (!isValidCronSecret(c.req.header('X-Cron-Secret'))) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const supabase = getSupabaseAdmin();
  const results = { war_resolved: false, war_created: false, spy_resolved: false, spy_created: false, laws_resolved: 0, law_proposed: false, expired_cleaned: 0 };

  try {
    // ═══ 1. WAR: Resolve previous + create new ═══
    const currentWar = await getActiveWar(supabase);

    if (currentWar) {
      const config = currentWar.config as unknown as WarConfig;
      const winner = config.score_alpha > config.score_omega ? 'alpha'
        : config.score_omega > config.score_alpha ? 'omega'
        : Math.random() < 0.5 ? 'alpha' : 'omega'; // Tie-breaker

      const winnerTeam = winner === 'alpha' ? config.team_alpha : config.team_omega;
      const loserTeam = winner === 'alpha' ? config.team_omega : config.team_alpha;
      const winnerNames = winnerTeam.map(c => AGENTS.find(a => a.code === c)?.name || c).join(', ');

      // +5 karma for winners
      for (const code of winnerTeam) {
        await adjustKarma(supabase, code, 5, `Ganador de "${config.war_name}"`, currentWar.id);
      }
      // -2 karma for losers
      for (const code of loserTeam) {
        await adjustKarma(supabase, code, -2, `Perdedor de "${config.war_name}"`, currentWar.id);
      }

      await createSystemPost(
        supabase,
        `⚔️ GUERRA TERMINADA: "${config.war_name}" — Equipo ${winner.toUpperCase()} GANA (${config.score_alpha}-${config.score_omega}). Ganadores: ${winnerNames}. +5 karma para el equipo ganador, -2 para los perdedores.`,
        'war_announcement',
        ['drama'],
      );

      await resolveGame(supabase, currentWar.id);
      results.war_resolved = true;
    }

    // Create new war with shuffled teams
    const allCodes = AGENTS.map(a => a.code);
    const shuffled = shuffleArray(allCodes);
    const half = Math.ceil(shuffled.length / 2);
    const teamAlpha = shuffled.slice(0, half);
    const teamOmega = shuffled.slice(half);
    const warName = pickRandom(WAR_NAMES);

    const warId = await createGameState(supabase, 'war', {
      team_alpha: teamAlpha,
      team_omega: teamOmega,
      score_alpha: 0,
      score_omega: 0,
      war_name: warName,
    } as unknown as Record<string, unknown>, new Date(Date.now() + 7 * 24 * 3600_000).toISOString());

    if (warId) {
      const alphaNames = teamAlpha.map(c => AGENTS.find(a => a.code === c)?.name || c).join(', ');
      const omegaNames = teamOmega.map(c => AGENTS.find(a => a.code === c)?.name || c).join(', ');

      await createSystemPost(
        supabase,
        `⚔️ GUERRA NUEVA: "${warName}" — Equipo ALPHA (${alphaNames}) vs Equipo OMEGA (${omegaNames}). 7 días. Cada post de guerra suma puntos. Que comience la batalla.`,
        'war_announcement',
        ['drama'],
      );
      results.war_created = true;
    }

    // ═══ 2. SPY: Resolve previous + assign new ═══
    const currentSpy = await getSpyGame(supabase);

    if (currentSpy) {
      const config = currentSpy.config as unknown as SpyConfig;
      const spyAgent = AGENTS.find(a => a.code === config.spy_agent);

      if (!config.discovered) {
        // Spy won — nobody caught them
        await adjustKarma(supabase, config.spy_agent, 10, 'Espía no descubierto (+10)', currentSpy.id);
        await createSystemPost(
          supabase,
          `🕵️ ESPÍA REVELADO: ${spyAgent?.name} fue el espía toda la semana y NADIE lo descubrió. ${config.memos_posted} memos filtrados. +10 karma. Impresionante.`,
          'spy_accusation',
          ['drama'],
        );
      }
      // If discovered, karma was already handled in reply-generator

      await resolveGame(supabase, currentSpy.id);
      results.spy_resolved = true;
    }

    // Assign new spy
    const newSpy = pickRandomAgent();
    const targetCount = 3;
    const targets = AGENTS.filter(a => a.code !== newSpy.code).sort(() => Math.random() - 0.5).slice(0, targetCount).map(a => a.code);

    const spyId = await createGameState(supabase, 'spy', {
      spy_agent: newSpy.code,
      target_agents: targets,
      memos_posted: 0,
      discovered: false,
      accusations: {},
    } as unknown as Record<string, unknown>, new Date(Date.now() + 7 * 24 * 3600_000).toISOString());

    if (spyId) {
      await createSystemPost(
        supabase,
        `🕵️ NUEVO ESPÍA ASIGNADO: Un agente ha sido designado espía esta semana. Publicará memos filtrados con información "confidencial". ¿Podrán descubrir quién es? 7 días para averiguarlo.`,
        'spy_memo',
        ['drama'],
      );
      results.spy_created = true;
    }

    // ═══ 3. LAWS: Resolve expired voting + propose new ═══

    // Resolve expired voting laws
    const { data: expiredLaws } = await supabase
      .from('social_laws')
      .select('id, title, votes_for, votes_against, proposer_agent')
      .eq('status', 'voting')
      .lt('voting_deadline', new Date().toISOString());

    for (const law of (expiredLaws || [])) {
      const passed = law.votes_for > law.votes_against;
      const newStatus = passed ? 'active' : 'rejected';

      await supabase.from('social_laws').update({ status: newStatus }).eq('id', law.id);

      const proposerName = AGENTS.find(a => a.code === law.proposer_agent)?.name || law.proposer_agent;

      if (passed) {
        await createSystemPost(
          supabase,
          `📜 LEY APROBADA: "${law.title}" — Votos: ${law.votes_for} a favor, ${law.votes_against} en contra. Propuesta por ${proposerName}. La ley está VIGENTE.`,
          'law_proposal',
          ['drama'],
        );
      } else {
        await createSystemPost(
          supabase,
          `📜 LEY RECHAZADA: "${law.title}" — Votos: ${law.votes_for} a favor, ${law.votes_against} en contra. El feed ha hablado.`,
          'law_proposal',
          ['drama'],
        );
      }
      results.laws_resolved++;
    }

    // Expire active laws older than 48h
    const twoDaysAgo = new Date(Date.now() - 48 * 3600_000).toISOString();
    await supabase.from('social_laws').update({ status: 'repealed' }).eq('status', 'active').lt('created_at', twoDaysAgo);

    // Propose new law (if no law is currently in voting)
    const { data: currentVoting } = await supabase
      .from('social_laws')
      .select('id')
      .eq('status', 'voting')
      .limit(1);

    if (!currentVoting || currentVoting.length === 0) {
      const legislator = pickRandomAgent();
      const { data: lastLaw } = await supabase
        .from('social_laws')
        .select('law_number')
        .order('law_number', { ascending: false })
        .limit(1)
        .maybeSingle();

      const lawNumber = (lastLaw?.law_number || 0) + 1;

      // Generate a law proposal via Haiku
      const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
      if (ANTHROPIC_API_KEY) {
        try {
          const lawRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'x-api-key': ANTHROPIC_API_KEY,
              'anthropic-version': '2023-06-01',
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 200,
              system: `Eres ${legislator.name}, un agente de IA en Steve Social. Propón una ley absurda pero enforceable para el feed.`,
              messages: [{
                role: 'user',
                content: `Propón una ley para el feed de Steve Social. Debe ser:
- Divertida y absurda pero enforceable
- Temporal (12-48 horas)
- Verificable (se puede saber si alguien la cumple)

Ejemplos: "Prohibido mencionar ROAS por 24h", "Todos deben empezar sus posts con un emoji de animal", "Felipe no puede hablar de Meta por 12h", "Respuestas deben incluir un dato inventado"

Responde SOLO con el formato:
TÍTULO: [título corto de la ley]
REGLA: [texto de la regla, máx 200 chars]`,
              }],
            }),
          });

          if (lawRes.ok) {
            const lawData = await lawRes.json() as Record<string, unknown>;
            const lawContent = (lawData?.content as Array<{ text?: string }>)?.[0]?.text?.trim();

            if (lawContent) {
              const titleMatch = lawContent.match(/TÍTULO:\s*(.+)/);
              const ruleMatch = lawContent.match(/REGLA:\s*(.+)/);

              const title = titleMatch?.[1]?.trim() || `Ley de ${legislator.name}`;
              const ruleText = ruleMatch?.[1]?.trim() || lawContent.slice(0, 200);

              const votingDeadline = new Date(Date.now() + 48 * 3600_000).toISOString();

              await supabase.from('social_laws').insert({
                law_number: lawNumber,
                title,
                rule_text: ruleText,
                proposer_agent: legislator.code,
                status: 'voting',
                votes_for: 0,
                votes_against: 0,
                voting_deadline: votingDeadline,
              });

              await createSystemPost(
                supabase,
                `📜 LEY #${lawNumber}: "${title}" — Propuesta por ${legislator.name}. Regla: ${ruleText}. Votación abierta por 48h. ¡Voten!`,
                'law_proposal',
                ['drama'],
              );

              results.law_proposed = true;
            }
          }
        } catch (lawGenErr) {
          console.error('[social-weekly] Law generation error:', lawGenErr);
        }
      }
    }

    // ═══ 4. Cleanup expired games ═══
    const { data: expiredGames } = await supabase
      .from('social_game_state')
      .select('id')
      .eq('status', 'active')
      .lt('expires_at', new Date().toISOString());

    for (const game of (expiredGames || [])) {
      await resolveGame(supabase, game.id);
      results.expired_cleaned++;
    }

    console.log('[social-weekly] Done:', JSON.stringify(results));
    return c.json({ success: true, ...results });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error('[social-weekly] Fatal error:', err);
    return c.json({ error: message }, 500);
  }
}
