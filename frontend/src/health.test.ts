import { describe, it, expect, vi } from 'vitest';
import { checkHealth } from './health';
describe('backend readiness feedback', () => {
  it('requires both API and database readiness', async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'UP', database: 'UP' })));
    expect(await checkHealth(request)).toBe('up');
    expect(request.mock.calls[0][0]).toBe('/api/v1/health');
  });
  it('reports network failure', async () => {
    expect(await checkHealth(vi.fn().mockRejectedValue(new Error('offline')))).toBe('down');
  });
  it('does not treat an HTTP failure or incomplete body as ready', async () => {
    expect(await checkHealth(vi.fn().mockResolvedValue(new Response('{}', { status: 503 })))).toBe('down');
    expect(await checkHealth(vi.fn().mockResolvedValue(new Response('{"status":"UP"}')))).toBe('down');
  });
});
