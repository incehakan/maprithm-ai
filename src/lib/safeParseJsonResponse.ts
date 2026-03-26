export async function safeParseJsonResponse<T = Record<string, unknown>>(
  response: Response
): Promise<T | null> {
  let text = "";
  try {
    text = await response.text();
  } catch {
    return null;
  }
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
