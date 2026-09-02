const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export const ACCESS_TOKEN_KEY = 'gip_access_token';
export const USER_KEY = 'gip_user';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = options;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (auth) {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (response.status === 401) {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    if (window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
    throw new ApiError('Session expired. Please log in again.', 401);
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const rawMessage = data?.message ?? data?.error ?? 'Request failed';
    const message = Array.isArray(rawMessage) ? rawMessage.join(', ') : String(rawMessage);
    throw new ApiError(message, response.status);
  }

  return data as T;
}
