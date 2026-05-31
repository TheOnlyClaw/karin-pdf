/**
 * Compress a PDF using the server-side GS compression endpoint.
 * Falls back when WASM client-side compression can't achieve the target.
 */

const COMPRESS_SERVER = "http://10.0.0.21:3003";

/** Health check — verify the server is reachable */
export async function checkServer(): Promise<boolean> {
  try {
    const resp = await fetch(`${COMPRESS_SERVER}/health`, { signal: AbortSignal.timeout(3000) });
    return resp.ok;
  } catch {
    return false;
  }
}

/**
 * Compress a PDF using the server.
 * Returns the compressed blob, or throws on failure.
 */
export async function compressViaServer(file: File): Promise<Blob> {
  const formData = new FormData();
  formData.set("file", file);

  const resp = await fetch(`${COMPRESS_SERVER}/compress`, {
    method: "POST",
    body: formData,
    signal: AbortSignal.timeout(120_000), // 2 minute timeout
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: "Server error" }));
    throw new Error(err.error || `Server returned ${resp.status}`);
  }

  return await resp.blob();
}
