import { GoogleGenAI } from '@google/genai';
import type { ChatRequest, ChatResult, LLMClient, ProviderId } from './types.js';
import { buildGeminiRequest, fromGeminiResponse, type GeminiLike } from './gemini.js';

// Vertex speaks the same protocol as the Gemini Developer API, so the wire-format
// mapping is shared. Re-exported here because it was originally this module's API.
export {
  toGeminiContents,
  toGeminiTools,
  mapGeminiStop,
  fromGeminiResponse,
  type GeminiLike,
  type GeminiResponse,
  type GeminiPart,
} from './gemini.js';

const DEFAULT_MODEL = 'gemini-2.5-pro';

/** Vertex AI Gemini — authenticates with Application Default Credentials. */
export class VertexAdapter implements LLMClient {
  readonly id: ProviderId = 'vertex';
  readonly supportsVision = true;
  readonly model: string;
  private project?: string;
  private location: string;
  private injected?: GeminiLike;
  private thinkingBudget: number;

  constructor(
    opts: { project?: string; location?: string; model?: string; client?: GeminiLike; thinkingBudget?: number } = {},
  ) {
    this.model = opts.model || process.env.VERTEX_MODEL || DEFAULT_MODEL;
    this.project = opts.project || process.env.VERTEX_PROJECT;
    this.location = opts.location || process.env.VERTEX_LOCATION || 'us-central1';
    this.injected = opts.client;
    this.thinkingBudget = opts.thinkingBudget ?? Number(process.env.FORGE_THINKING_BUDGET || 0);
  }

  private models(): GeminiLike {
    if (this.injected) return this.injected;
    // Vertex mode uses Application Default Credentials (GOOGLE_APPLICATION_CREDENTIALS).
    const ai = new GoogleGenAI({ vertexai: true, project: this.project, location: this.location });
    return ai.models as unknown as GeminiLike;
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    const body = buildGeminiRequest(this.model, req, { thinkingBudget: this.thinkingBudget });
    return fromGeminiResponse(await this.models().generateContent(body));
  }
}
