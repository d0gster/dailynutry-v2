import { randomUUID } from 'node:crypto';

/**
 * One identity per request, threaded through everything it touches.
 *
 * Without it the audit trail is a pile of unrelated rows: a rate-limit event
 * here, a refusal there, no way to tell whether they belong to the same
 * attempt. With it, "it failed, code abc-123" resolves to every row that one
 * request produced — which is the whole difference between a log and an audit.
 *
 * The id is echoed back in `x-request-id`, so the caller can quote it and
 * support can find it without asking for a timestamp and guessing.
 */

export interface RequestContext {
  requestId: string;
  endpoint: string;
  method: string;
  startedAt: number;
  /** Chosen by the caller, so recorded as reported, never as fact. */
  userAgent: string | null;
}

export function beginRequest(req: Request): RequestContext {
  const url = new URL(req.url);
  return {
    requestId: randomUUID(),
    endpoint: url.pathname,
    method: req.method,
    startedAt: Date.now(),
    // Truncated: this is attacker-controlled and unbounded.
    userAgent: req.headers.get('user-agent')?.slice(0, 200) ?? null,
  };
}

/** The fields every audit row carries, so events stay comparable. */
export function baseContext(ctx: RequestContext, extra: Record<string, unknown> = {}) {
  return {
    endpoint: ctx.endpoint,
    method: ctx.method,
    durationMs: Date.now() - ctx.startedAt,
    userAgent: ctx.userAgent,
    ...extra,
  };
}

/** Merges the correlation id into response headers. */
export function withRequestId(
  ctx: RequestContext,
  headers: Record<string, string> = {},
): Record<string, string> {
  return { ...headers, 'x-request-id': ctx.requestId };
}
