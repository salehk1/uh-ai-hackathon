import "server-only";

const MAX_BYTES = 64 * 1024;

/** Parse a small JSON body; anything unparseable becomes `undefined` and fails schema validation. */
export async function readJson(req: Request): Promise<unknown> {
  const text = await req.text();
  if (text.length > MAX_BYTES) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
