/**
 * Builds a byte-valid JPEG for tests that need to get PAST image validation.
 *
 * Route tests used to send `base64: 'AAAA'`, which was fine while nothing
 * inspected the bytes. Now that the gateway proves an image is an image before
 * spending a provider call, that placeholder is correctly rejected with a 422
 * — so tests aiming at auth, rate limiting or the provider chain need real
 * headers to reach the code they are actually about.
 */
export function fakeJpegBase64({ width = 800, height = 600 } = {}): string {
  const bytes = [
    0xff, 0xd8, // SOI
    // Baseline frame header: [precision][height:2][width:2][components]
    0xff, 0xc0, 0x00, 0x08,
    8, (height >> 8) & 0xff, height & 0xff, (width >> 8) & 0xff, width & 0xff, 3,
    0xff, 0xda, 0x00, 0x03, 0x01, // SOS
    0xde, 0xad, 0xbe, 0xef, // entropy-coded data
    0xff, 0xd9, // EOI
  ];
  return Buffer.from(bytes).toString('base64');
}
