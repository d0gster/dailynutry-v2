import { describe, it, expect } from 'vitest';
import { extractJsonString } from '@/core/json';

describe('extractJsonString', () => {
  it('returns a clean object untouched', () => {
    expect(extractJsonString('{"a":1}')).toBe('{"a":1}');
  });

  it('strips ```json fences', () => {
    expect(extractJsonString('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('strips bare ``` fences', () => {
    expect(extractJsonString('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('slices the object out of surrounding prose', () => {
    expect(extractJsonString('Here is the JSON: {"a":1} hope it helps')).toBe('{"a":1}');
  });

  it('trims whitespace', () => {
    expect(extractJsonString('   {"a":1}   ')).toBe('{"a":1}');
  });
});
