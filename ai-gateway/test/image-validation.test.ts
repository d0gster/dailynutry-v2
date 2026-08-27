import { describe, it, expect } from 'vitest';
import { validateImage, MAX_DIMENSION } from '@/core/image-validation';

/**
 * These build real file headers rather than using fixtures, so each test says
 * exactly which byte it is exercising.
 */

function jpeg({
  width = 800,
  height = 600,
  exif = false,
  sofMarker = 0xc0,
}: { width?: number; height?: number; exif?: boolean; sofMarker?: number } = {}): Buffer {
  const parts: number[] = [0xff, 0xd8]; // SOI

  if (exif) {
    // APP1 carrying an "Exif\0\0" header plus a little payload standing in for
    // the GPS tags a real phone writes.
    const payload = [...Buffer.from('Exif\0\0'), ...Array(20).fill(0x42)];
    parts.push(0xff, 0xe1, ((payload.length + 2) >> 8) & 0xff, (payload.length + 2) & 0xff, ...payload);
  }

  // Frame header: [precision][height:2][width:2][components]
  const sof = [8, (height >> 8) & 0xff, height & 0xff, (width >> 8) & 0xff, width & 0xff, 3];
  parts.push(0xff, sofMarker, ((sof.length + 2) >> 8) & 0xff, (sof.length + 2) & 0xff, ...sof);

  parts.push(0xff, 0xda, 0x00, 0x03, 0x01); // SOS
  parts.push(0xde, 0xad, 0xbe, 0xef); // entropy-coded data
  parts.push(0xff, 0xd9); // EOI
  return Buffer.from(parts);
}

function png({ width = 800, height = 600 }: { width?: number; height?: number } = {}): Buffer {
  const buffer = Buffer.alloc(24);
  buffer.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write('IHDR', 12);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

const b64 = (buffer: Buffer) => buffer.toString('base64');

describe('validateImage', () => {
  it('accepts a well-formed JPEG and reads its real dimensions', () => {
    const result = validateImage(b64(jpeg({ width: 1024, height: 768 })), 'image/jpeg');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.image.width).toBe(1024);
    expect(result.image.height).toBe(768);
  });

  it('accepts a well-formed PNG', () => {
    const result = validateImage(b64(png({ width: 640, height: 480 })), 'image/png');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.image.width).toBe(640);
    expect(result.image.height).toBe(480);
  });

  it('reads dimensions from progressive JPEGs too, not just baseline', () => {
    // 0xC2 is progressive — the marker most phone cameras actually emit.
    const result = validateImage(b64(jpeg({ sofMarker: 0xc2, width: 300, height: 200 })), 'image/jpeg');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.image.width).toBe(300);
  });

  // ── The declared type is a claim, not a fact ──────────────────────────────

  it('refuses arbitrary bytes wearing an image mime type', () => {
    const notAnImage = Buffer.from('#!/bin/sh\nrm -rf /\n');
    const result = validateImage(b64(notAnImage), 'image/jpeg');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('unknown_format');
  });

  it('refuses a PNG that claims to be a JPEG', () => {
    const result = validateImage(b64(png()), 'image/jpeg');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('mime_mismatch');
  });

  it('refuses a PDF, however it labels itself', () => {
    const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(64)]);

    expect(validateImage(b64(pdf), 'image/jpeg').ok).toBe(false);
    expect(validateImage(b64(pdf), 'image/png').ok).toBe(false);
  });

  it('refuses input that is not base64 at all', () => {
    const result = validateImage('not base64!!! @@@', 'image/jpeg');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('not_base64');
  });

  it('refuses an empty payload', () => {
    expect(validateImage('', 'image/jpeg').ok).toBe(false);
  });

  // ── Pixel bombs ───────────────────────────────────────────────────────────

  it('refuses a header declaring gigapixel dimensions', () => {
    // 64000 x 64000 = 4 gigapixels from a tiny file — the classic bomb.
    const result = validateImage(b64(png({ width: 64000, height: 64000 })), 'image/png');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('dimensions_out_of_range');
  });

  it('refuses a single side beyond the cap even when the area is modest', () => {
    const result = validateImage(b64(png({ width: MAX_DIMENSION + 1, height: 10 })), 'image/png');
    expect(result.ok).toBe(false);
  });

  it('refuses something too small to be a photo of a page', () => {
    const result = validateImage(b64(png({ width: 8, height: 8 })), 'image/png');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('dimensions_out_of_range');
  });

  it('accepts a large but plausible phone photo', () => {
    expect(validateImage(b64(png({ width: 4032, height: 3024 })), 'image/png').ok).toBe(true);
  });

  // ── EXIF is a privacy leak, not an attack ─────────────────────────────────

  it('strips EXIF, so a photo taken at home does not carry GPS to the provider', () => {
    const withExif = jpeg({ exif: true });
    const result = validateImage(b64(withExif), 'image/jpeg');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.image.exifStripped).toBe(true);

    const out = Buffer.from(result.image.base64, 'base64');
    expect(out.includes(Buffer.from('Exif'))).toBe(false);
    expect(out.length).toBeLessThan(withExif.length);
  });

  it('keeps the image usable after stripping — dimensions and markers survive', () => {
    const result = validateImage(b64(jpeg({ exif: true, width: 1200, height: 900 })), 'image/jpeg');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.image.width).toBe(1200);
    expect(result.image.height).toBe(900);

    const out = Buffer.from(result.image.base64, 'base64');
    expect(out.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8])); // SOI
    expect(out.subarray(-2)).toEqual(Buffer.from([0xff, 0xd9])); // EOI
    expect(out.includes(Buffer.from([0xff, 0xda]))).toBe(true); // SOS
  });

  it('reports nothing stripped when there was no EXIF to begin with', () => {
    const result = validateImage(b64(jpeg({ exif: false })), 'image/jpeg');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.image.exifStripped).toBe(false);
  });

  // ── Malformed structure ───────────────────────────────────────────────────

  it('refuses a JPEG whose segment length runs past the end of the file', () => {
    const truncated = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0xff, 0xff, 0x08]);
    const result = validateImage(b64(truncated), 'image/jpeg');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('corrupt_header');
  });

  it('refuses a JPEG with the magic bytes but no frame header', () => {
    const headerOnly = Buffer.from([0xff, 0xd8, 0xff, 0xfe, 0x00, 0x04, 0x00, 0x00]);
    expect(validateImage(b64(headerOnly), 'image/jpeg').ok).toBe(false);
  });

  it('does not mistake a Huffman table for a frame header', () => {
    // 0xC4 sits in the same numeric range as the SOF markers but carries a
    // table, not dimensions. Reading it as one yields nonsense.
    const withDht = Buffer.from([0xff, 0xd8, 0xff, 0xc4, 0x00, 0x08, 1, 2, 3, 4, 5, 6]);
    expect(validateImage(b64(withDht), 'image/jpeg').ok).toBe(false);
  });

  it('refuses a PNG signature with a truncated header chunk', () => {
    const short = Buffer.alloc(16);
    short.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    expect(validateImage(b64(short), 'image/png').ok).toBe(false);
  });
});
