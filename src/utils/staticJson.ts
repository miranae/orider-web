export async function fetchStaticJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const contentType = response.headers.get("content-type") ?? "";

  if (!response.ok) {
    throw new Error(`Static JSON request failed: ${response.status} ${response.statusText}`);
  }
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(`Static JSON request returned ${contentType || "unknown content type"}`);
  }

  return response.json() as Promise<T>;
}
