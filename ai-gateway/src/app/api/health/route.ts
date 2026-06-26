import { NextResponse } from 'next/server';
import { buildProviderChain } from '@/core/config';
import { isDbEnabled } from '@/db/client';

export const runtime = 'nodejs';

export function GET() {
  const chain = buildProviderChain();
  return NextResponse.json({
    status: 'ok',
    providers: chain.map((p) => ({ name: p.name, model: p.model })),
    db: isDbEnabled() ? 'postgres' : 'stdout',
  });
}
