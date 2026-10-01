export interface User { id: string; username: string; name: string; role: 'admin' | 'employee'; active: boolean; sharedStorageAccess: boolean; }
export interface Session { user: User; csrfToken: string; }
export interface Shop { id: string; name: string; currency: string | null; timezone: string | null; can_change_prices: boolean; }
export interface Location { id: string; name: string; kind: string; shop_id: string | null; }
export interface Member { shopId: string; canChangePrices: boolean; }
export interface Staff extends User { memberships: Member[]; }
export interface AuditEvent { id: string; action: string; actor_name: string | null; occurred_at: string; details: unknown; }
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function api<T>(path: string, options: { method?: string; body?: unknown; csrf?: string; signal?: AbortSignal } = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: options.method ?? 'GET', credentials: 'same-origin', cache: 'no-store', signal: options.signal,
    headers: { ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(options.method ? { 'X-Requested-With': 'joyfrimens' } : {}),
      ...(options.csrf ? { 'X-CSRF-Token': options.csrf } : {}) },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  let data: unknown;
  try { data = await response.json(); } catch { throw new ApiError(response.status, 'The server returned an unexpected response.'); }
  if (!response.ok) throw new ApiError(response.status,
    typeof data === 'object' && data !== null && 'message' in data && typeof data.message === 'string' ? data.message : 'Request failed.');
  return data as T;
}
export const messageOf = (error: unknown) => error instanceof Error ? error.message : 'Unable to connect. Please try again.';
