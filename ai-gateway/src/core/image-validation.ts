/**
 * Validates and sanitises a user-supplied image before it costs anything.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS, AND WHY IT DOESN'T USE A LIBRARY
 *
 * Everything arriving here came from a camera or a gallery picker, which means
 * it is whatever the sender decided to send. The declared `mimeType` is a
 * CLAIM by the client, never checked against the bytes, so until now arbitrary
 * content could be forwarded to a paid provider labelled "image/jpeg".
 *
 * The obvious move is a library. Measured, none fits:
 *   - `sharp` re-encodes (the strongest sanitiser there is) but ships a native
 *     binary via an install script, which `.npmrc` blocks on purpose — and at
 *     the time of writing its latest release was 14 hours old, below this
 *     project's release-cooldown floor.
 *   - `image-size` is the package already sitting in accepted-risk.json for
 *     denial-of-service via infinite loops in its own parsers.
 *   - `file-type` identifies formats but not dimensions, so the header walk
 *     below would still be needed.
 *
 * Since the walk is required regardless, magic-byte checking comes almost free
 * inside it, and the whole thing stays dependency-free.
 *
 * THREAT MODEL — what is and isn't in scope
 *
 * These images are never stored, never served, and never executed: they are
 * base64 in a request, forwarded to a provider HTTP API, then dropped. That
 * removes the entire classic file-upload risk class (polyglot web shells, path
 * traversal on write, content sniffing by a browser) — those all need the file
 * to be written and later served, which never happens.
 *
 * What remains, and what this module actually addresses:
 *   1. A lying `mimeType` — arbitrary bytes billed as an image.
 *   2. Pixel bombs — a header declaring gigapixel dimensions.
 *   3. EXIF, which is a PRIVACY leak rather than an attack: a phone photo of a
 *      printed sheet carries the GPS coordinates of where it was taken, and
 *      forwarding it hands a third-party provider the user's home address for
 *      no benefit. Stripping it needs no re-encode — it is one segment.
 *
 * Prompt injection through text rendered INSIDE the image is real and is NOT
 * solved here; no byte-level check can see it. It is contained downstream by
 * the Zod schema (the model cannot return a shape the app didn't ask for) and
 * by field sanitisation before anything reaches the UI.
 * ---------------------------------------------------------------------------
 */

/** Guards against a header claiming gigapixel dimensions. Real phone photos
 *  top out two orders of magnitude below this. */
export const MAX_PIXELS = 100_000_000;
export const MAX_DIMENSION = 20_000;
/** Below this, it cannot be a legible photo of a printed page. */
export const MIN_DIMENSION = 32;

export type ImageRejection =
  | 'not_base64'
  | 'unknown_format'
  | 'mime_mismatch'
  | 'corrupt_header'
  | 'dimensions_out_of_range';

export interface ValidatedImage {
  /** Re-encoded base64 with EXIF removed. Safe to forward. */
  base64: string;
  mimeType: 'image/jpeg' | 'image/png';
  width: number;
  height: number;
  /** True when an EXIF segment was found and dropped. */
  exifStripped: boolean;
}

export type ImageCheck =
  | { ok: true; image: ValidatedImage }
  | { ok: false; reason: ImageRejection; detail: string };

const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(bytes: Uint8Array, magic: number[]): boolean {
  if (bytes.length < magic.length) return false;
  return magic.every((byte, i) => bytes[i] === byte);
}

/**
 * Strict base64 decode.
 *
 * `Buffer.from(s, 'base64')` silently ignores anything it can't parse, so a
 * string of pure garbage decodes to a short buffer instead of failing. Round
 * -tripping is what actually detects that.
 */
function decodeBase64(input: string): Uint8Array | null {
  const cleaned = input.trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(cleaned)) return null;

  const buffer = Buffer.from(cleaned, 'base64');
  if (buffer.length === 0) return null;
  if (buffer.toString('base64').replace(/=+$/, '') !== cleaned.replace(/=+$/, '')) return null;
  return new Uint8Array(buffer);
}

/** PNG keeps width and height at fixed offsets inside the mandatory first chunk. */
function readPngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  // 8-byte signature + 4-byte length + "IHDR" + 4-byte width + 4-byte height.
  if (bytes.length < 24) return null;
  if (String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR') return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** Markers that carry a frame header, and therefore the real dimensions.
 *  C4 (Huffman table), C8 (reserved) and CC (arithmetic coding) look like the
 *  others numerically but are not frame headers — reading them as one yields
 *  nonsense dimensions. */
const SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

/**
 * Walks a JPEG's segments to read its dimensions and drop EXIF in one pass.
 *
 * JPEG is a sequence of length-prefixed segments, so both jobs are the same
 * traversal: read each header, note the frame dimensions when the frame header
 * appears, and copy every segment forward EXCEPT the APP1/Exif one.
 */
function parseJpeg(
  bytes: Uint8Array,
): { width: number; height: number; sanitised: Uint8Array; exifStripped: boolean } | null {
  const kept: Array<[number, number]> = [[0, 2]]; // SOI
  let width = 0;
  let height = 0;
  let exifStripped = false;
  let offset = 2;

  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) return null; // Not on a segment boundary — corrupt.

    const marker = bytes[offset + 1];

    // Padding bytes and standalone markers carry no length field.
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      kept.push([offset, offset + 2]);
      offset += 2;
      continue;
    }

    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2 || offset + 2 + length > bytes.length) return null;

    if (SOF_MARKERS.has(marker)) {
      // [precision:1][height:2][width:2] immediately after the length field.
      if (offset + 9 > bytes.length) return null;
      height = (bytes[offset + 5] << 8) | bytes[offset + 6];
      width = (bytes[offset + 7] << 8) | bytes[offset + 8];
    }

    const isExif =
      marker === 0xe1 &&
      offset + 10 <= bytes.length &&
      String.fromCharCode(...bytes.slice(offset + 4, offset + 8)) === 'Exif';

    if (isExif) exifStripped = true;
    else kept.push([offset, offset + 2 + length]);

    offset += 2 + length;

    // Start of scan: the rest is entropy-coded image data, not segments.
    if (marker === 0xda) {
      kept.push([offset, bytes.length]);
      break;
    }
  }

  if (width === 0 || height === 0) return null;

  const total = kept.reduce((sum, [from, to]) => sum + (to - from), 0);
  const sanitised = new Uint8Array(total);
  let cursor = 0;
  for (const [from, to] of kept) {
    sanitised.set(bytes.subarray(from, to), cursor);
    cursor += to - from;
  }

  return { width, height, sanitised, exifStripped };
}

/**
 * Checks one image and returns a sanitised copy, or the reason it was refused.
 *
 * `declaredMimeType` is what the client SAID it was sending; it is compared
 * against the bytes rather than trusted, and a mismatch is refused outright —
 * a caller that mislabels its payload is not making an honest mistake worth
 * accommodating.
 */
export function validateImage(base64: string, declaredMimeType: string): ImageCheck {
  const bytes = decodeBase64(base64);
  if (!bytes) {
    return { ok: false, reason: 'not_base64', detail: 'Image data is not valid base64.' };
  }

  const isJpeg = startsWith(bytes, JPEG_MAGIC);
  const isPng = startsWith(bytes, PNG_MAGIC);
  if (!isJpeg && !isPng) {
    return {
      ok: false,
      reason: 'unknown_format',
      detail: 'Image data is not a JPEG or PNG, whatever its declared type says.',
    };
  }

  const actualMimeType = isJpeg ? 'image/jpeg' : 'image/png';
  if (declaredMimeType !== actualMimeType) {
    return {
      ok: false,
      reason: 'mime_mismatch',
      detail: `Declared ${declaredMimeType}, but the bytes are ${actualMimeType}.`,
    };
  }

  let width: number;
  let height: number;
  let sanitised = bytes;
  let exifStripped = false;

  if (isPng) {
    const dimensions = readPngDimensions(bytes);
    if (!dimensions) {
      return { ok: false, reason: 'corrupt_header', detail: 'PNG header is unreadable.' };
    }
    ({ width, height } = dimensions);
  } else {
    const parsed = parseJpeg(bytes);
    if (!parsed) {
      return { ok: false, reason: 'corrupt_header', detail: 'JPEG header is unreadable.' };
    }
    ({ width, height, sanitised, exifStripped } = parsed);
  }

  if (
    width < MIN_DIMENSION ||
    height < MIN_DIMENSION ||
    width > MAX_DIMENSION ||
    height > MAX_DIMENSION ||
    width * height > MAX_PIXELS
  ) {
    return {
      ok: false,
      reason: 'dimensions_out_of_range',
      detail: `Image is ${width}x${height}; expected between ${MIN_DIMENSION}px and ${MAX_DIMENSION}px per side.`,
    };
  }

  return {
    ok: true,
    image: {
      base64: Buffer.from(sanitised).toString('base64'),
      mimeType: actualMimeType,
      width,
      height,
      exifStripped,
    },
  };
}
