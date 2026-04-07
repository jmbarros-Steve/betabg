// El Chino — visual check executor
// Takes screenshots with Puppeteer and evaluates them with Claude Vision
// Check #46: SteveMail email rendering + any URL-based visual checks

import type { SupabaseClient } from '@supabase/supabase-js';
import { anthropicFetch } from '../../lib/anthropic-fetch.js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';
import type { ChinoCheck, MerchantConn, CheckResult } from '../types.js';

const VISION_MODEL = 'claude-haiku-4-5-20251001';

// ─── Puppeteer launcher (lazy import to avoid crash if not installed) ─

async function launchBrowser() {
  // Dynamic import to avoid crash if puppeteer is not installed locally
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const puppeteer = await import(/* webpackIgnore: true */ 'puppeteer' as string) as any;
  const launcher = puppeteer.default || puppeteer;
  return launcher.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  });
}

// ─── Upload screenshot to Supabase Storage ──────────────────────

async function uploadScreenshot(
  supabase: SupabaseClient,
  buffer: Buffer | Uint8Array,
  checkNumber: number
): Promise<string | null> {
  const filename = `chino/screenshots/${checkNumber}_${Date.now()}.png`;

  const { error } = await supabase.storage
    .from('chino-screenshots')
    .upload(filename, buffer, {
      contentType: 'image/png',
      upsert: true,
    });

  if (error) {
    console.error(`[chino/visual] Screenshot upload failed: ${error.message}`);
    return null;
  }

  const { data: urlData } = supabase.storage
    .from('chino-screenshots')
    .getPublicUrl(filename);

  return urlData.publicUrl;
}

// ─── Claude Vision evaluation ────────────────────────────────────

async function evaluateScreenshot(
  base64Image: string,
  evalPrompt: string
): Promise<{ pass: boolean; issues: string[]; score: number }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const result = await anthropicFetch(
    {
      model: VISION_MODEL,
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: base64Image,
              },
            },
            {
              type: 'text',
              text: `Eres un QA obsesivo revisando la interfaz de Steve Ads, una plataforma de marketing para e-commerce.

Evalúa este screenshot y responde en JSON:
{
  "pass": true/false,
  "issues": ["lista de problemas encontrados"],
  "score": 1-10
}

Criterios de evaluación:
${evalPrompt}

Criterios generales SIEMPRE aplican:
- No debe haber texto "undefined", "null", "NaN", "[object Object]"
- No debe haber texto en inglés (todo debe ser español)
- No debe haber imágenes rotas
- No debe haber pantallas en blanco o completamente vacías
- Los gráficos deben tener datos (no vacíos)
- Los números de dinero deben tener formato chileno ($1.234.567)
- Los colores deben ser consistentes con la marca
- No debe haber errores visibles en la consola

Si hay CUALQUIER issue, pass debe ser false.
Responde SOLO el JSON, nada más.`,
            },
          ],
        },
      ],
    },
    apiKey,
    { timeoutMs: 30_000 },
  );

  if (!result.ok) {
    throw new Error(`Claude Vision API error: ${result.status}`);
  }

  const text = result.data?.content?.[0]?.text || '{}';
  // Parse JSON — strip markdown code fences if present
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return { pass: false, issues: [`Claude returned unparseable response: ${text.substring(0, 100)}`], score: 0 };
  }
}

// ─── Get a test email HTML for check #46 ─────────────────────────

async function getTestEmailHtml(supabase: SupabaseClient): Promise<string | null> {
  const data = await safeQuerySingleOrDefault<{ base_html: string | null }>(
    supabase
      .from('email_templates')
      .select('base_html')
      .eq('is_system', true)
      .limit(1)
      .maybeSingle(),
    null,
    'chinoVisual.getTestEmailHtml',
  );

  return data?.base_html || null;
}

// ─── Concurrency guard: only 1 browser at a time to avoid OOM ───
let browserLock: Promise<void> = Promise.resolve();

function withBrowserLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = browserLock;
  let resolve: () => void;
  browserLock = new Promise<void>((r) => { resolve = r; });
  return prev.then(fn).finally(() => resolve!());
}

// ─── Main visual check executor ─────────────────────────────────

export async function executeVisual(
  supabase: SupabaseClient,
  check: ChinoCheck,
  _merchant?: MerchantConn | null
): Promise<CheckResult> {
  return withBrowserLock(() => _executeVisualInner(supabase, check, _merchant));
}

async function _executeVisualInner(
  supabase: SupabaseClient,
  check: ChinoCheck,
  _merchant?: MerchantConn | null
): Promise<CheckResult> {
  const start = Date.now();

  const url = check.check_config?.url as string | undefined;
  const evalPrompt = (check.check_config?.eval_prompt as string) || 'Evalúa si la página se ve correcta.';

  let browser: any = null;

  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    // If auth_token is configured, inject it
    if (check.check_config?.auth_token) {
      await page.setExtraHTTPHeaders({
        Authorization: `Bearer ${check.check_config.auth_token}`,
      });
    }

    let screenshotBuffer: Buffer | Uint8Array;

    if (check.check_number === 46) {
      // SteveMail check: render email HTML directly in Puppeteer
      const emailHtml = await getTestEmailHtml(supabase);
      if (!emailHtml) {
        return {
          result: 'skip',
          error_message: 'No hay email_templates para evaluar',
          duration_ms: Date.now() - start,
        };
      }
      await page.setContent(emailHtml, { waitUntil: 'networkidle2', timeout: 15_000 });
      await new Promise((r) => setTimeout(r, 2000));
      screenshotBuffer = await page.screenshot({ type: 'png', fullPage: false });
    } else if (url) {
      // URL-based visual check
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30_000 });
      await new Promise((r) => setTimeout(r, 3000));
      screenshotBuffer = await page.screenshot({ type: 'png', fullPage: false });
    } else {
      return {
        result: 'skip',
        error_message: 'check_config missing url (and not check #46)',
        duration_ms: Date.now() - start,
      };
    }

    // Upload screenshot
    const screenshotUrl = await uploadScreenshot(supabase, screenshotBuffer, check.check_number);

    // Evaluate with Claude Vision
    const base64Image = Buffer.from(screenshotBuffer).toString('base64');
    const evaluation = await evaluateScreenshot(base64Image, evalPrompt);

    return {
      result: evaluation.pass ? 'pass' : 'fail',
      steve_value: `Score: ${evaluation.score}/10`,
      real_value: evaluation.issues.length > 0
        ? evaluation.issues.join('; ')
        : 'Sin issues',
      error_message: evaluation.pass
        ? undefined
        : `Issues visuales: ${evaluation.issues.join('; ')}`,
      duration_ms: Date.now() - start,
      screenshot_url: screenshotUrl || undefined,
    };
  } catch (err: any) {
    return {
      result: 'error',
      error_message: err.message,
      duration_ms: Date.now() - start,
    };
  } finally {
    if (browser) {
      try { await browser.close(); } catch { /* ignore */ }
    }
  }
}
