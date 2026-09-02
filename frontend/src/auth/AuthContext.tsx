import { createContext, useContext, useState, type ReactNode } from 'react';
import { ACCESS_TOKEN_KEY, USER_KEY, apiRequest } from '../api/client';
import type { User } from '../types';

interface AuthResponse {
  user: User;
  accessToken: string;
}

interface AuthContextValue {
  user: User | null;
  accessToken: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function readStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(readStoredUser);
  const [accessToken, setAccessToken] = useState<string | null>(() => localStorage.getItem(ACCESS_TOKEN_KEY));

  function persistSession(data: AuthResponse) {
    localStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    setAccessToken(data.accessToken);
    setUser(data.user);
  }

  async function login(email: string, password: string) {
    const data = await apiRequest<AuthResponse>('/auth/login', {
      method: 'POST',
      body: { email, password },
      auth: false,
    });
    persistSession(data);
  }

  async function register(name: string, email: string, password: string) {
    const data = await apiRequest<AuthResponse>('/auth/register', {
      method: 'POST',
      body: { name, email, password },
      auth: false,
    });
    persistSession(data);
  }

  function logout() {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setAccessToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, accessToken, login, register, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
