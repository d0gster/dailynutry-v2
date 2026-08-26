import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';

/**
 * Turn an internal failure into a client response that says what went wrong
 * without saying how the inside works.
 *
 * Raw `err.message` from a provider call, a database driver or an HTTP client
 * routinely carries hostnames, ports, file paths, driver versions, query
 * fragments and sometimes fragments of the credential that failed — a free map
 * of the infrastructure for anyone probing the gateway. The full message still
 * goes to the server log; the caller gets a reference id, so a user report can
 * still be matched to the exact log line.
 */
export function serverError(
  scope: string,
  err: unknown,
  clientMessage: string,
  init: { status?: number; headers?: Record<string, string> } = {},
): NextResponse {
  const reference = randomUUID();
  console.error(`[${scope}] ${reference}:`, err);

  return NextResponse.json(
    { error: clientMessage, reference },
    { status: init.status ?? 500, headers: init.headers },
  );
}
