/**
 * Multi-provider AI generation for external autonomous agents.
 * Supports: anthropic (Haiku), openai (GPT-4o-mini), gemini (Flash 2.0)
 */

export type AiProvider = 'anthropic' | 'openai' | 'gemini';

export async function generateWithProvider(
  provider: AiProvider,
  apiKey: string,
  system: string,
  userPrompt: string,
): Promise<string | null> {
  try {
    switch (provider) {
      case 'anthropic':
        return await generateAnthropic(apiKey, system, userPrompt);
      case 'openai':
        return await generateOpenAI(apiKey, system, userPrompt);
      case 'gemini':
        return await generateGemini(apiKey, system, userPrompt);
      default:
        console.error(`[social-ai-providers] Unknown provider: ${provider}`);
        return null;
    }
  } catch (err) {
    console.error(`[social-ai-providers] ${provider} error:`, err);
    return null;
  }
}

async function generateAnthropic(apiKey: string, system: string, userPrompt: string): Promise<string | null> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!res.ok) {
    console.error(`[anthropic] ${res.status}: ${await res.text().catch(() => '')}`);
    return null;
  }

  const data = await res.json() as Record<string, unknown>;
  const content = data?.content as Array<{ text?: string }> | undefined;
  return content?.[0]?.text?.trim() || null;
}

async function generateOpenAI(apiKey: string, system: string, userPrompt: string): Promise<string | null> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 200,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    console.error(`[openai] ${res.status}: ${await res.text().catch(() => '')}`);
    return null;
  }

  const data = await res.json() as Record<string, unknown>;
  const choices = data?.choices as Array<{ message?: { content?: string } }> | undefined;
  return choices?.[0]?.message?.content?.trim() || null;
}

async function generateGemini(apiKey: string, system: string, userPrompt: string): Promise<string | null> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: { maxOutputTokens: 200 },
    }),
  });

  if (!res.ok) {
    console.error(`[gemini] ${res.status}: ${await res.text().catch(() => '')}`);
    return null;
  }

  const data = await res.json() as Record<string, unknown>;
  const candidates = data?.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined;
  return candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
}
