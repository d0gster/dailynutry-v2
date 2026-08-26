import { NextResponse } from 'next/server';

/**
 * Request size limits.
 *
 * Next.js route handlers do NOT cap the request body (the 4 MB limit applies
 * to the legacy Pages API only), so without an explicit guard a single large
 * POST can exhaust the process memory before any validation runs.
 *
 * Two layers, deliberately:
 *   1. `enforceContentLength` rejects on the declared header, BEFORE the body
 *      is read into memory. Cheap, and stops the obvious attack.
 *   2. The Zod `.max()` on each base64 string catches a lying or absent
 *      Content-Length, at the cost of having buffered the body first.
 */

/** Base64 inflates bytes by 4/3, so this is roughly a 4.5 MB image. */
export const MAX_IMAGE_BASE64_CHARS = 6_000_000;

/** Ceiling for the whole JSON payload, headroom included. */
export const MAX_REQUEST_BYTES = 20 * 1024 * 1024;

/** Upper bound on images per request — also bounds provider cost per call. */
export const MAX_IMAGES = 8;

/**
 * Rejects an over-sized request using the declared Content-Length, before the
 * body is buffered. A missing or unparseable header is allowed through: layer 2
 * still applies, and rejecting every chunked request would break valid clients.
 */
export function enforceContentLength(req: Request): NextResponse | null {
  const header = req.headers.get('content-length');
  if (!header) return null;

  const declared = Number(header);
  if (!Number.isFinite(declared)) return null;

  if (declared > MAX_REQUEST_BYTES) {
    return NextResponse.json(
      {
        error: 'Request too large',
        detail: `Body is ${declared} bytes; the limit is ${MAX_REQUEST_BYTES}.`,
      },
      { status: 413 },
    );
  }
  return null;
}
