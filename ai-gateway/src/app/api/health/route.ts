import { NextRequest, NextResponse } from 'next/server';
import { buildProviderChain } from '@/core/config';
import { isDbEnabled } from '@/db/client';
import { requireApiKey } from '@/core/auth';

export const runtime = 'nodejs';

/**
 * GET /api/health
 *
 * Open to anyone so load balancers and uptime checks can probe it without a
 * credential — but the ANSWER is tiered. Anonymous callers get liveness only;
 * naming the configured providers and models tells an attacker which upstream
 * to target and which keys are worth stealing.
 *
 * Send a valid `x-api-key` to get the full picture.
 */
export function GET(req: NextRequest) {
  const chain = buildProviderChain();
  const authorized = requireApiKey(req) === null;

  if (!authorized) {
    return NextResponse.json({
      status: 'ok',
      // A boolean is enough to tell "misconfigured" from "healthy" without
      // revealing which providers are wired up.
      providersConfigured: chain.length > 0,
    });
  }

  return NextResponse.json({
    status: 'ok',
    providers: chain.map((p) => ({ name: p.name, model: p.model })),
    db: isDbEnabled() ? 'postgres' : 'stdout',
  });
}
