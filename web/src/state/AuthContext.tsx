import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { api, getToken, onTokenChange, setToken } from "../api/client.ts";
import type { User } from "../api/types.ts";

/** The server defaults to this when `university` is omitted (routes/auth.ts). */
export const DEFAULT_UNIVERSITY = "Syracuse University";

export type RegisterInput = {
  email: string;
  password: string;
  name: string;
  university?: string;
};

export type AuthValue = {
  user: User | null;
  token: string | null;
  /** True until we know whether a stored token still identifies someone. */
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setTokenState] = useState<string | null>(() => getToken());
  const [loading, setLoading] = useState(true);

  // Restore the session before first paint of any guarded screen. Without
  // this a refresh looks exactly like being signed out.
  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    api
      .me()
      .then(({ user: me }) => {
        if (!cancelled) setUser(me);
      })
      .catch(() => {
        // A stored token the server no longer accepts is worse than none:
        // every later call would fail the same way. client.ts has already
        // dropped it on a 401; this covers the rest.
        if (!cancelled) setToken(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The client drops the token by itself whenever any request comes back 401,
  // so the session can end somewhere far from this provider. Following it
  // keeps `user` and `token` from drifting out of step with storage.
  useEffect(
    () =>
      onTokenChange((next) => {
        setTokenState(next);
        if (!next) setUser(null);
      }),
    [],
  );

  const login = useCallback(async (email: string, password: string) => {
    const { token: next, user: me } = await api.login({ email, password });
    setToken(next);
    setUser(me);
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const { token: next, user: me } = await api.register({
      ...input,
      university: input.university ?? DEFAULT_UNIVERSITY,
    });
    setToken(next);
    setUser(me);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    const { user: me } = await api.me();
    setUser(me);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ user, token, loading, login, register, logout, refresh }),
    [user, token, loading, login, register, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
