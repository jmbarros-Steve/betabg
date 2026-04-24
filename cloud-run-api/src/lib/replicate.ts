/**
 * Unified Replicate client for Steve Ads.
 *
 * Handles the full prediction lifecycle:
 *  1. POST to /v1/models/{model}/predictions with `Prefer: wait` for fast models.
 *  2. Polls /v1/predictions/{id} until status is terminal or timeout.
 *  3. Surfaces clean errors including the last Replicate log lines on failure.
 *
 * This helper is intentionally small — callers own the output shape (Replicate
 * returns `string | string[] | Record<string, any>` depending on the model).
 *
 * Env: REPLICATE_API_KEY. Throws if missing.
 */

export interface ReplicatePredictionOptions<TInput> {
  /** Model slug, e.g. `black-forest-labs/flux-1.1-pro-ultra`. */
  model: string;
  /** Optional specific version hash. If omitted, Replicate resolves to latest. */
  version?: string;
  /** Input payload — shape depends on the model. */
  input: TInput;
  /** Total wall-clock budget in ms. Default 120000 (2 min). */
  timeoutMs?: number;
  /** Delay between polls in ms. Default 2000. */
  pollIntervalMs?: number;
  /**
   * Seconds to attach to `Prefer: wait=<seconds>` header on the initial POST.
   * Replicate blocks up to this many seconds trying to return a finished
   * prediction in one HTTP call. Default 55.
   */
  preferWaitSeconds?: number;
}

export interface ReplicatePrediction<TOutput> {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output: TOutput | null;
  error: string | null;
  logs?: string | null;
  urls?: { get?: string; cancel?: string };
}

export class ReplicateError extends Error {
  constructor(
    message: string,
    public readonly predictionId?: string,
    public readonly status?: string,
    public readonly logs?: string | null,
  ) {
    super(message);
    this.name = 'ReplicateError';
  }
}

/**
 * Run a Replicate prediction to completion and return the raw output.
 * Callers are responsible for validating output shape (e.g. expecting string[]).
 */
export async function runReplicatePrediction<TInput, TOutput = unknown>(
  opts: ReplicatePredictionOptions<TInput>,
): Promise<TOutput> {
  const apiKey = process.env.REPLICATE_API_KEY;
  if (!apiKey) {
    throw new ReplicateError('REPLICATE_API_KEY not configured');
  }

  const {
    model,
    version,
    input,
    timeoutMs = 120_000,
    pollIntervalMs = 2_000,
    preferWaitSeconds = 55,
  } = opts;

  const deadline = Date.now() + timeoutMs;
  const endpoint = version
    ? `https://api.replicate.com/v1/predictions`
    : `https://api.replicate.com/v1/models/${model}/predictions`;
  const body = version ? { version, input } : { input };

  const launchRes = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Prefer: `wait=${Math.min(Math.max(preferWaitSeconds, 1), 60)}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(Math.min(timeoutMs, 70_000)),
  });

  if (!launchRes.ok) {
    const errText = await launchRes.text().catch(() => '');
    throw new ReplicateError(
      `Replicate launch failed (HTTP ${launchRes.status}): ${errText.slice(0, 300)}`,
    );
  }

  let prediction = (await launchRes.json()) as ReplicatePrediction<TOutput>;

  // If we already have a terminal status from `Prefer: wait`, short-circuit.
  if (prediction.status === 'succeeded') {
    if (prediction.output === null || prediction.output === undefined) {
      throw new ReplicateError(
        'Replicate prediction succeeded but returned no output',
        prediction.id,
        prediction.status,
        prediction.logs,
      );
    }
    return prediction.output as TOutput;
  }
  if (prediction.status === 'failed' || prediction.status === 'canceled') {
    throw new ReplicateError(
      `Replicate prediction ${prediction.status}: ${prediction.error || 'unknown'}`,
      prediction.id,
      prediction.status,
      prediction.logs,
    );
  }

  // Otherwise poll.
  const predictionId = prediction.id;
  if (!predictionId) {
    throw new ReplicateError('Replicate launch returned no prediction id');
  }

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollIntervalMs));
    try {
      const pollRes = await fetch(
        `https://api.replicate.com/v1/predictions/${predictionId}`,
        {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(15_000),
        },
      );
      if (!pollRes.ok) {
        // Transient — keep polling until deadline.
        continue;
      }
      prediction = (await pollRes.json()) as ReplicatePrediction<TOutput>;

      if (prediction.status === 'succeeded') {
        if (prediction.output === null || prediction.output === undefined) {
          throw new ReplicateError(
            'Replicate prediction succeeded but returned no output',
            prediction.id,
            prediction.status,
            prediction.logs,
          );
        }
        return prediction.output as TOutput;
      }
      if (prediction.status === 'failed' || prediction.status === 'canceled') {
        const tail = (prediction.logs || '').split('\n').slice(-6).join('\n');
        throw new ReplicateError(
          `Replicate prediction ${prediction.status}: ${prediction.error || 'unknown'}${tail ? `\nlogs:\n${tail}` : ''}`,
          prediction.id,
          prediction.status,
          prediction.logs,
        );
      }
    } catch (err) {
      if (err instanceof ReplicateError) throw err;
      // network blip during polling — keep trying until deadline
    }
  }

  // Hit the wall-clock deadline.
  throw new ReplicateError(
    `Replicate prediction timed out after ${timeoutMs}ms`,
    predictionId,
    prediction?.status,
    prediction?.logs,
  );
}
