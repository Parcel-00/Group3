export async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    // Some backend failures return plain text (e.g. "Not Found").
    return { error: text.trim() || "Unexpected response format." };
  }
}

export function apiUrl(baseUrl, path) {
  const normalizedPath = String(path || "").replace(/^\/+/, "");
  const base = String(baseUrl || "").trim().replace(/\/+$/, "");

  if (!base) {
    return `/api/${normalizedPath}`;
  }

  if (/\/api$/i.test(base)) {
    return `${base}/${normalizedPath}`;
  }

  return `${base}/api/${normalizedPath}`;
}
