export function linkSignals(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!signal) return timeout;
  return AbortSignal.any([signal, timeout]);
}

export async function readErrorBody(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  const compact = text.replace(/\s+/g, ' ').trim();
  if (!compact) return response.statusText || 'request failed';
  return compact.length > 280 ? `${compact.slice(0, 279)}…` : compact;
}
