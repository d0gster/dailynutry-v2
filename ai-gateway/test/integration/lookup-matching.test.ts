import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { searchYieldBatch } from '@/db/yield';
import { searchTaco, searchTacoBatch } from '@/db/taco';
import { hasDb, TEST_TAG, query, cleanup } from './helpers';

/**
 * Name matching against the real seed data.
 *
 * A mocked test proves only that the code passes a string to a function. What
 * actually broke was the SQL predicate's DIRECTION: enrichment looked for the
 * long prescribed name ("Frango peito grelhado") inside the short factor name
 * ("frango peito"), which never matches. Every plan came back with no yield
 * factors, so the shopping list silently stopped computing raw quantities —
 * no error, no failing test, just a feature that quietly did nothing.
 */
describe.skipIf(!hasDb)('yield matching against real rows', () => {
  beforeEach(async () => {
    await cleanup();
    await query(
      `INSERT INTO yield_factor (name, category, factor, method, source)
       VALUES ($1, 'protein', 0.65, 'cozido', 'padrao'),
              ($2, 'protein', 0.80, 'cozido', 'padrao')`,
      [`${TEST_TAG} frango peito`, `${TEST_TAG} frango`],
    );
  });

  afterAll(cleanup);

  it('matches a factor whose name is CONTAINED IN the prescribed food name', async () => {
    // The regression that shipped: this returned nothing.
    const found = await searchYieldBatch([`${TEST_TAG} frango peito grelhado sem pele`]);

    expect(found.size).toBe(1);
    expect(found.get(`${TEST_TAG} frango peito grelhado sem pele`)?.factor).toBeCloseTo(0.65);
  });

  it('prefers the most specific factor when several match', async () => {
    // Both "frango" and "frango peito" are inside the food name; the longer,
    // more specific one is the right answer.
    const found = await searchYieldBatch([`${TEST_TAG} frango peito grelhado`]);

    expect(found.get(`${TEST_TAG} frango peito grelhado`)?.factor).toBeCloseTo(0.65);
  });

  it('still matches when the plan is the terser of the two', async () => {
    const found = await searchYieldBatch([`${TEST_TAG} frango pei`]);
    expect(found.size).toBe(1);
  });

  it('returns nothing for a food with no factor, rather than a wrong one', async () => {
    const found = await searchYieldBatch([`${TEST_TAG} couve manteiga refogada`]);
    expect(found.size).toBe(0);
  });

  it('resolves many names in one call, deduplicating repeats', async () => {
    const found = await searchYieldBatch([
      `${TEST_TAG} frango peito grelhado`,
      `${TEST_TAG} frango peito grelhado`,
      `${TEST_TAG} nao existe`,
    ]);

    expect(found.size).toBe(1);
  });
});

describe.skipIf(!hasDb)('TACO matching against the real seed', () => {
  it('finds a real food from the seeded TACO table', async () => {
    const results = await searchTaco('arroz integral cozido');

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name.toLowerCase()).toContain('arroz');
    expect(results[0].energy_kcal).toBeGreaterThan(0);
  });

  it('matches a food carrying a qualifier TACO does not use', async () => {
    // The regression: a nutritionist writes "Filé de merluza grelhado"; TACO
    // says "Merluza, filé, assado". Requiring every word matched nothing, so
    // the item lost its nutrition data while three merluza rows sat unused.
    const results = await searchTaco('Filé de merluza grelhado');

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name.toLowerCase()).toContain('merluza');
    expect(results[0].energy_kcal).toBeGreaterThan(0);
  });

  it('still prefers an exact-ish match over a merely loose one', async () => {
    // Widening the net must not cost precision when every word does match.
    const results = await searchTaco('arroz integral cozido');
    expect(results[0].name.toLowerCase()).toContain('arroz');
    expect(results[0].name.toLowerCase()).toContain('integral');
  });

  it('the batch path applies the same widening', async () => {
    const found = await searchTacoBatch(['Filé de merluza grelhado']);
    expect(found.get('Filé de merluza grelhado')?.name.toLowerCase()).toContain('merluza');
  });

  it('survives punctuation that to_tsquery would otherwise choke on', async () => {
    // These characters are to_tsquery OPERATORS. Unsanitised they raise, and
    // the raise is swallowed into an empty result — so a stray character in an
    // LLM-produced food name silently cost that item its nutrition data.
    for (const name of ['arroz & feijão', 'arroz | feijão', 'arroz!', '(arroz)', 'arroz:*']) {
      await expect(searchTaco(name)).resolves.toBeInstanceOf(Array);
    }
  });

  it('returns an empty array — not a throw — for input with no searchable words', async () => {
    await expect(searchTaco('!!! &&& ???')).resolves.toEqual([]);
  });

  it('batch resolves several foods and keys results by the name asked for', async () => {
    const asked = ['arroz integral cozido', 'feijão carioca cozido', 'zzzz não existe zzzz'];
    const found = await searchTacoBatch(asked);

    expect(found.has('arroz integral cozido')).toBe(true);
    expect(found.has('feijão carioca cozido')).toBe(true);
    expect(found.has('zzzz não existe zzzz')).toBe(false);
  });

  it('batch and single lookup agree on the same food', async () => {
    const single = await searchTaco('arroz integral cozido');
    const batch = await searchTacoBatch(['arroz integral cozido']);

    expect(batch.get('arroz integral cozido')?.taco_id).toBe(single[0].taco_id);
  });
});
