export type ServiceStatus = 'loading' | 'up' | 'down';
export async function checkHealth(request: typeof fetch = fetch): Promise<ServiceStatus> {
  try {
    const response = await request('/api/v1/health', { signal: AbortSignal.timeout(6000) });
    if (!response.ok) return 'down';
    const data: unknown = await response.json();
    if (typeof data !== 'object' || data === null) return 'down';
    return 'status' in data && 'database' in data && data.status === 'UP' && data.database === 'UP' ? 'up' : 'down';
  } catch { return 'down'; }
}
