import type { AuthUser, Permission } from '@collins-hr/shared';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from '../lib/api';

interface LoginResponse {
  token: string;
  user: AuthUser;
  permissions: string[];
}

interface SessionResponse {
  user: AuthUser;
  permissions: string[];
}

interface AuthState {
  user: AuthUser | null;
  permissions: Set<string>;
  status: 'loading' | 'authenticated' | 'unauthenticated';
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
  can: (permission: Permission | string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    permissions: new Set(),
    status: 'loading',
  });

  const logout = useCallback(() => {
    setToken(null);
    setState({ user: null, permissions: new Set(), status: 'unauthenticated' });
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setState({ user: null, permissions: new Set(), status: 'unauthenticated' });
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const token = getToken();
    if (!token) {
      setState((s) => ({ ...s, status: 'unauthenticated' }));
      return;
    }
    api
      .get<SessionResponse>('/auth/session')
      .then((res) => {
        if (cancelled) return;
        setState({
          user: res.user,
          permissions: new Set(res.permissions),
          status: 'authenticated',
        });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ user: null, permissions: new Set(), status: 'unauthenticated' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    const res = await api.get<SessionResponse>('/auth/session');
    setState({
      user: res.user,
      permissions: new Set(res.permissions),
      status: 'authenticated',
    });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<LoginResponse>('/auth/login', { email, password });
    setToken(res.token);
    setState({
      user: res.user,
      permissions: new Set(res.permissions),
      status: 'authenticated',
    });
  }, []);

  const can = useCallback(
    (permission: Permission | string) => state.permissions.has(permission),
    [state.permissions],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, login, logout, refresh, can }),
    [state, login, logout, refresh, can],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
