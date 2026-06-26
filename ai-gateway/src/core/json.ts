/**
 * Extracts a JSON object from raw model text. Even with JSON-mode enabled,
 * models occasionally wrap output in ```json fences or add a stray sentence.
 * We strip fences and, as a last resort, slice from the first `{` to the last
 * `}`. Returns the cleaned string (still a string — parsing/validation happens
 * in the guardrail so the error can be fed back for repair).
 */
export function extractJsonString(text: string): string {
  let t = text.trim();

  // Strip ```json ... ``` or ``` ... ``` fences.
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) t = fence[1].trim();

  // If there's still leading/trailing prose, grab the outermost object.
  if (!t.startsWith('{')) {
    const first = t.indexOf('{');
    const last = t.lastIndexOf('}');
    if (first !== -1 && last !== -1 && last > first) {
      t = t.slice(first, last + 1);
    }
  }
  return t;
}
