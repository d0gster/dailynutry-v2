import { NextRequest, NextResponse } from 'next/server';

/**
 * Protects the observability dashboard with HTTP Basic auth.
 *
 * The dashboard exposes spend, provider mix, models and failure rates — useful
 * to you, and useful to anyone probing the service. It has no login of its own,
 * so the gate lives here, ahead of the page.
 *
 * Fails CLOSED: with no credentials configured the dashboard is disabled rather
 * than public. Leaving it open is the failure mode worth designing against.
 *
 * Runs on the Edge runtime, so this uses Web APIs only — no `node:crypto`.
 *
 * Lives in `proxy.ts`: Next 16 deprecated the `middleware.ts` convention in
 * favour of `proxy.ts` exporting `proxy`.
 */

/**
 * Length-independent comparison. Not as strong as a hash-then-compare (it
 * still reveals length), but it removes the early-exit that makes a naive
 * `===` trivially guessable character by character.
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function unauthorized(): NextResponse {
  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="DailyNutry gateway", charset="UTF-8"' },
  });
}

export function proxy(req: NextRequest) {
  const user = process.env.DASHBOARD_USER;
  const password = process.env.DASHBOARD_PASSWORD;

  if (!user || !password) {
    console.error('[dashboard] DASHBOARD_USER/DASHBOARD_PASSWORD unset — dashboard disabled');
    return new NextResponse(
      'Dashboard is disabled: set DASHBOARD_USER and DASHBOARD_PASSWORD on the gateway.',
      { status: 503 },
    );
  }

  const header = req.headers.get('authorization');
  if (!header?.startsWith('Basic ')) return unauthorized();

  let decoded: string;
  try {
    decoded = atob(header.slice('Basic '.length));
  } catch {
    return unauthorized();
  }

  // Only the FIRST colon separates user from password — passwords may contain one.
  const separator = decoded.indexOf(':');
  if (separator === -1) return unauthorized();

  const providedUser = decoded.slice(0, separator);
  const providedPassword = decoded.slice(separator + 1);

  // Both comparisons always run: short-circuiting on the username would leak
  // whether a guessed username was correct.
  const userOk = constantTimeEqual(providedUser, user);
  const passwordOk = constantTimeEqual(providedPassword, password);
  if (!userOk || !passwordOk) return unauthorized();

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/dashboard'],
};
