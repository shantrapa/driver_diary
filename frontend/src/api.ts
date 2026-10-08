import type { DayResponse, Trip, TripResult } from './types';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Turns FastAPI/Pydantic 422 `detail` or our `{error: {...}}` body into one readable line.
function errorMessage(status: number, body: unknown): string {
  const b = body as { detail?: unknown; error?: { message?: string } } | null;
  if (Array.isArray(b?.detail)) {
    return b.detail
      .map((d: { loc?: unknown[]; msg?: string }) => {
        const field = d.loc?.length ? String(d.loc[d.loc.length - 1]) : '';
        return field && field !== 'body' ? `${field}: ${d.msg}` : d.msg;
      })
      .join('; ');
  }
  return b?.error?.message ?? `Ошибка сервера (HTTP ${status})`;
}

async function request<T>(url: string, init?: RequestInit): Promise<{ status: number; data: T }> {
  const res = await fetch(url, { ...init, headers: { Accept: 'application/json', ...init?.headers } });
  const body = await res.json().catch(() => null);
  // Backend always answers with JSON; a non-JSON error comes from the dev proxy when backend is down.
  if (!res.ok && body === null) throw new ApiError(res.status, 'сервер API недоступен (запущен ли backend на порту 8000?)');
  if (!res.ok) throw new ApiError(res.status, errorMessage(res.status, body));
  return { status: res.status, data: body as T };
}

export async function getDay(date: string, signal?: AbortSignal): Promise<DayResponse> {
  return (await request<DayResponse>(`/api/days/${date}`, { signal })).data;
}

export function createTrip(trip: Trip) {
  return request<TripResult>('/api/trips', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(trip),
  });
}
