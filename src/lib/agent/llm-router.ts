// zeta-riemannian-agent v1.0 — Multi-LLM Router
//
// Task-routed multi-LLM ensemble, mirroring the quantum-spherifier pattern.
// Each cognitive task is dispatched to the most appropriate frontier LLM
// available in the runtime. The router is wired around the z-ai-web-dev-sdk
// (which exposes Z.ai's GLM-4.6 family), with pluggable adapters for
// Groq (Llama 3.3 70B), OpenAI, Anthropic, Google Gemini and DeepSeek
// when API keys are present.
//
// Tasks are routed as follows (default policy):
//   hypothesis-gen      -> glm-4.6         (creative, broad)
//   proof-sketch        -> glm-4.6         (long-form reasoning)
//   proof-verify        -> glm-4.6         (adversarial self-check)
//   arxiv-summarise     -> glm-4.6         (fast compression)
//   riemann-attempt     -> glm-4.6         (frontier reasoning)
//   riemann-verify      -> glm-4.6         (double-adversarial)
//
// Failover chain (in order):
//   1. ZAI / GLM-4.6           (primary — auto-available in sandbox, or via
//                               .z-ai-config, or via ZAI_API_KEY env var)
//   2. Groq / Llama 3.3 70B    (first fallback — requires GROQ_API_KEY)
//   3. Deterministic stub      (last resort — keeps the agent running but
//                               clearly tagged as degraded in the UI)
//
// Other providers (OpenAI, Anthropic, Google, DeepSeek) are listed in
// listProviders() for visibility but are not yet wired into the call chain.
// They can be added by extending callGroq() into a generic OpenAI-compatible
// dispatcher (Groq, OpenAI and DeepSeek all speak the same API shape).

import ZAI from 'z-ai-web-dev-sdk';
import { emit } from './logger';

export type TaskKind =
  | 'hypothesis-gen'
  | 'proof-sketch'
  | 'proof-verify'
  | 'arxiv-summarise'
  | 'riemann-attempt'
  | 'riemann-verify'
  | 'kg-synthesise'
  | 'freeform';

export interface LLMCallOptions {
  task: TaskKind;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  preferredModel?: string;
  responseFormat?: 'text' | 'json';
}

export interface LLMCallResult {
  text: string;
  model: string;
  provider: string;
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
}

export interface LLMProviderInfo {
  id: string;
  label: string;
  available: boolean;
  defaultModel: string;
  reason?: string;
}

// ─── Groq adapter configuration ───────────────────────────────────────────
//
// Groq exposes an OpenAI-compatible /v1/chat/completions endpoint. The
// default model is llama-3.3-70b-versatile. Override with GROQ_MODEL in
// .env if you want to use a different one (e.g. llama-3.1-8b-instant for
// faster/cheaper summarisation).
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const GROQ_DEFAULT_MODEL = 'llama-3.3-70b-versatile';
const GROQ_TIMEOUT_MS = 90_000;

// OpenAI-compatible chat completions response shape — used by both the ZAI
// SDK and the Groq HTTP adapter. Defined once so both code paths share the
// same type narrowing.
interface LLMChoice {
  message?: { content?: string };
}
interface LLMUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
}
interface LLMResponse {
  choices?: LLMChoice[];
  usage?: LLMUsage;
  model?: string;
}

class LLMRouter {
  private zai: any = null;
  private zaiInitError: string | null = null;
  private callCount = 0;
  private tokensUsed = 0;

  // Per-cycle accounting — reset by the orchestrator at the start of each
  // cycle, accumulated by every call(). The orchestrator reads these via
  // cycleStats() at cycle end and persists them into the AgentCycle row.
  private cycleCalls = 0;
  private cycleTokensIn = 0;
  private cycleTokensOut = 0;
  private cycleLastProvider: string | null = null;
  private cycleLastModel: string | null = null;

  async init() {
    // ─── Strategy 1: try ZAI.create() with the .z-ai-config file ─────────
    try {
      this.zai = await ZAI.create();
      emit('log', 'LLM router initialised — primary: ZAI/GLM-4.6', {
        payload: { provider: 'zai', source: '.z-ai-config' },
      });
    } catch (e: any) {
      this.zaiInitError = e?.message ?? String(e);
      emit(
        'llm-error',
        `ZAI SDK init via .z-ai-config failed: ${this.zaiInitError}`,
        { level: 'warn' }
      );

      // ─── Strategy 2: bypass the SDK and call the Z.ai HTTP API directly ─
      // The user just needs to set ZAI_API_KEY (and optionally ZAI_BASE_URL).
      const apiKey = process.env.ZAI_API_KEY;
      if (apiKey && apiKey.length > 10) {
        this.zai = {
          _directMode: true,
          apiKey,
          baseUrl: process.env.ZAI_BASE_URL || 'https://api.z.ai/api/paas/v4',
          chat: {
            completions: {
              create: async (opts: any) => {
                const resp = await fetch(
                  (this.zai as any).baseUrl + '/chat/completions',
                  {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      Authorization: `Bearer ${(this.zai as any).apiKey}`,
                    },
                    body: JSON.stringify({
                      model: opts.preferredModel || 'glm-4-plus',
                      messages: opts.messages,
                      temperature: opts.temperature ?? 0.7,
                      max_tokens: opts.max_tokens ?? 2048,
                    }),
                  }
                );
                if (!resp.ok) {
                  const text = await resp.text();
                  throw new Error(
                    `ZAI HTTP ${resp.status}: ${text.slice(0, 200)}`
                  );
                }
                return await resp.json();
              },
            },
          },
        };
        this.zaiInitError = null;
        emit('log', 'LLM router initialised — primary: ZAI/GLM-4.6 (direct HTTP mode via ZAI_API_KEY)', {
          payload: { provider: 'zai', source: 'env' },
        });
      } else {
        emit(
          'llm-error',
          `ZAI SDK init failed entirely. Set ZAI_API_KEY in .env OR create .z-ai-config. Agent will run in degraded mode unless another provider is available.`,
          { level: 'warn' }
        );
      }
    }

    // ─── Report fallback provider status ─────────────────────────────────
    if (process.env.GROQ_API_KEY) {
      const model = process.env.GROQ_MODEL || GROQ_DEFAULT_MODEL;
      emit('log', `LLM router fallback available: Groq/${model}`, {
        payload: { provider: 'groq', model },
      });
    }
  }

  listProviders(): LLMProviderInfo[] {
    const info: LLMProviderInfo[] = [
      {
        id: 'zai',
        label: 'Z.ai GLM-4.6',
        available: !!this.zai,
        defaultModel: 'glm-4.6',
        reason: this.zaiInitError ?? undefined,
      },
      {
        id: 'groq',
        label: 'Groq Llama 3.3 70B Versatile',
        available: !!process.env.GROQ_API_KEY,
        defaultModel: process.env.GROQ_MODEL || GROQ_DEFAULT_MODEL,
        reason: process.env.GROQ_API_KEY ? undefined : 'GROQ_API_KEY not set',
      },
      {
        id: 'openai',
        label: 'OpenAI GPT-4o',
        available: !!process.env.OPENAI_API_KEY,
        defaultModel: 'gpt-4o',
        reason: process.env.OPENAI_API_KEY ? undefined : 'OPENAI_API_KEY not set',
      },
      {
        id: 'anthropic',
        label: 'Anthropic Claude Opus 4.1',
        available: !!process.env.ANTHROPIC_API_KEY,
        defaultModel: 'claude-opus-4-1',
        reason: process.env.ANTHROPIC_API_KEY ? undefined : 'ANTHROPIC_API_KEY not set',
      },
      {
        id: 'google',
        label: 'Google Gemini 2.0 Pro',
        available: !!process.env.GOOGLE_API_KEY,
        defaultModel: 'gemini-2.0-pro',
        reason: process.env.GOOGLE_API_KEY ? undefined : 'GOOGLE_API_KEY not set',
      },
      {
        id: 'deepseek',
        label: 'DeepSeek R1',
        available: !!process.env.DEEPSEEK_API_KEY,
        defaultModel: 'deepseek-reasoner',
        reason: process.env.DEEPSEEK_API_KEY ? undefined : 'DEEPSEEK_API_KEY not set',
      },
    ];
    return info;
  }

  async call(opts: LLMCallOptions): Promise<LLMCallResult> {
    const start = Date.now();
    this.callCount++;
    emit('llm-call', `LLM call #${this.callCount} task=${opts.task}`, {
      payload: { task: opts.task, model: opts.preferredModel ?? 'glm-4.6' },
    });

    let result: LLMCallResult | null = null;

    // ─── 1. Primary: ZAI / GLM-4.6 ────────────────────────────────────────
    if (this.zai) {
      try {
        const resp = await this.callWithTimeout<LLMResponse>(
          this.zai.chat.completions.create({
            messages: [
              { role: 'system', content: opts.systemPrompt },
              { role: 'user', content: opts.userPrompt },
            ],
            temperature: opts.temperature ?? 0.7,
            max_tokens: opts.maxTokens ?? 2048,
          }),
          90_000,
          'ZAI'
        );
        const text = resp?.choices?.[0]?.message?.content ?? '';
        const usage = resp?.usage ?? { prompt_tokens: 0, completion_tokens: 0 };
        result = {
          text,
          model: 'glm-4.6',
          provider: 'zai',
          tokensIn: usage.prompt_tokens ?? 0,
          tokensOut: usage.completion_tokens ?? 0,
          durationMs: Date.now() - start,
        };
      } catch (e: any) {
        emit('llm-error', `ZAI call failed (${opts.task}): ${e?.message ?? e}`, {
          level: 'warn',
        });
      }
    }

    // ─── 2. Fallback: Groq / Llama 3.3 70B ────────────────────────────────
    if (!result && process.env.GROQ_API_KEY) {
      try {
        const resp = await this.callGroq(opts);
        const text = resp?.choices?.[0]?.message?.content ?? '';
        const usage = resp?.usage ?? { prompt_tokens: 0, completion_tokens: 0 };
        const model = resp?.model || process.env.GROQ_MODEL || GROQ_DEFAULT_MODEL;
        result = {
          text,
          model,
          provider: 'groq',
          tokensIn: usage.prompt_tokens ?? 0,
          tokensOut: usage.completion_tokens ?? 0,
          durationMs: Date.now() - start,
        };
      } catch (e: any) {
        emit('llm-error', `Groq call failed (${opts.task}): ${e?.message ?? e}`, {
          level: 'warn',
        });
      }
    }

    // ─── 3. Last resort: deterministic stub ───────────────────────────────
    if (!result) {
      const stub = this.stubResponse(opts);
      result = {
        text: stub,
        model: 'stub',
        provider: 'none',
        tokensIn: 0,
        tokensOut: stub.length,
        durationMs: Date.now() - start,
      };
    }

    // ─── Accumulate per-cycle stats ───────────────────────────────────────
    // The orchestrator reads these via cycleStats() at cycle end and resets
    // them via resetCycleStats() at cycle start.
    this.cycleCalls++;
    this.cycleTokensIn += result.tokensIn;
    this.cycleTokensOut += result.tokensOut;
    this.cycleLastProvider = result.provider;
    this.cycleLastModel = result.model;
    this.tokensUsed += result.tokensIn + result.tokensOut;

    // Emit a real-time event so the dashboard can show which provider served
    // this call without waiting for the cycle to end.
    emit('llm-provider-used', `${result.provider}/${result.model} served task=${opts.task}`, {
      payload: {
        task: opts.task,
        provider: result.provider,
        model: result.model,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        durationMs: result.durationMs,
      },
    });

    return result;
  }

  /**
   * Per-cycle accounting. The orchestrator calls resetCycleStats() at cycle
   * start and cycleStats() at cycle end. Returns null provider/model if no
   * LLM call was made during the cycle (e.g. an archive-only cycle).
   */
  resetCycleStats(): void {
    this.cycleCalls = 0;
    this.cycleTokensIn = 0;
    this.cycleTokensOut = 0;
    this.cycleLastProvider = null;
    this.cycleLastModel = null;
  }

  cycleStats(): {
    calls: number;
    tokensIn: number;
    tokensOut: number;
    provider: string | null;
    model: string | null;
  } {
    return {
      calls: this.cycleCalls,
      tokensIn: this.cycleTokensIn,
      tokensOut: this.cycleTokensOut,
      provider: this.cycleLastProvider,
      model: this.cycleLastModel,
    };
  }

  /**
   * Call the Groq OpenAI-compatible chat completions endpoint.
   * Uses GROQ_API_KEY from env. Model defaults to llama-3.3-70b-versatile
   * but can be overridden per-call via opts.preferredModel or globally via
   * GROQ_MODEL.
   *
   * Note: Groq's API is OpenAI-compatible, so the request/response shape is
   * identical to OpenAI's. The same pattern could be reused for OpenAI and
   * DeepSeek with minimal changes (just the base URL and auth header).
   */
  private async callGroq(opts: LLMCallOptions): Promise<LLMResponse> {
    const apiKey = process.env.GROQ_API_KEY!;
    const model = opts.preferredModel || process.env.GROQ_MODEL || GROQ_DEFAULT_MODEL;
    const body: Record<string, unknown> = {
      model,
      messages: [
        { role: 'system', content: opts.systemPrompt },
        { role: 'user', content: opts.userPrompt },
      ],
      temperature: opts.temperature ?? 0.3,
    };
    // Only forward max_tokens if the caller specified one — Groq accepts
    // both max_tokens and max_completion_tokens, but we keep it simple.
    if (typeof opts.maxTokens === 'number') {
      body.max_tokens = opts.maxTokens;
    }
    // Groq supports response_format: { type: 'json_object' } for structured
    // output. We enable it when the caller requests JSON.
    if (opts.responseFormat === 'json') {
      body.response_format = { type: 'json_object' };
    }

    const callPromise = fetch(`${GROQ_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const resp = await this.callWithTimeout(callPromise, GROQ_TIMEOUT_MS, 'Groq');
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Groq HTTP ${resp.status}: ${text.slice(0, 300)}`);
    }
    return (await resp.json()) as LLMResponse;
  }

  /**
   * Race a promise against a timeout. Rejects with `"<label> call timed out
   * after <ms>ms"` if the timeout fires first. Used to avoid hanging on a
   * stalled LLM provider.
   */
  private callWithTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} call timed out after ${ms}ms`)), ms);
    });
    return Promise.race([promise, timeoutPromise]) as Promise<T>;
  }

  private stubResponse(opts: LLMCallOptions): string {
    // Used only when no LLM provider is available. Keeps the agent running.
    const stamp = new Date().toISOString();
    if (opts.responseFormat === 'json') {
      switch (opts.task) {
        case 'hypothesis-gen':
          return JSON.stringify({
            title: 'Deterministic fallback hypothesis (no LLM available)',
            statement:
              'Let $s=\\sigma+it$. A structural perturbation of the completed zeta function $\\xi(s)$ preserves the symmetry $\\xi(s)=\\xi(1-s)$ if and only if the perturbation lies in the kernel of the operator $\\mathcal{R}=\\partial_s + \\partial_{1-s}$.',
            motivation:
              'Studied as a placeholder when no LLM is configured. Replace .env keys to enable creative generation.',
            strategySketch:
              'Linearise $\\xi$ around the critical line; study the kernel of $\\mathcal{R}$; show it forces $\\sigma=1/2$.',
            relatedConcepts: ['xi-function', 'critical-line', 'functional-equation'],
            relatedArxivIds: [],
            confidence: 0.2,
          });
        case 'proof-verify':
          return JSON.stringify({
            verdict: 'inconclusive',
            confidence: 0.1,
            gaps: ['No LLM verifier available; cannot assess proof validity.'],
            strengths: [],
            summary: 'Stub verdict — set API keys to enable real verification.',
          });
        default:
          return JSON.stringify({ stub: true, task: opts.task, stamp });
      }
    }
    return `[zRiemannian stub:${opts.task}@${stamp}] No LLM provider is configured. Set ZAI_API_KEY (auto-available in this sandbox), GROQ_API_KEY, or OPENAI/ANTHROPIC/GOOGLE/DEEPSEEK keys in .env to enable creative mathematical reasoning.`;
  }

  stats() {
    return { callCount: this.callCount, tokensUsed: this.tokensUsed };
  }
}

const router = new LLMRouter();
export default router;
