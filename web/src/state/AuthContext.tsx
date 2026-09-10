import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { api, getToken, setToken } from "../api/client.ts";
import type { User } from "../api/types.ts";

type AuthValue = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: {
    email: string;
    password: string;
    name: string;
    university: string;
  }) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
  setUser: (user: User) => void;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore the session on first paint if a token survived in localStorage.
  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api
      .me()
      .then(({ user: me }) => setUserState(me))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { token, user: me } = await api.login({ email, password });
    setToken(token);
    setUserState(me);
  }, []);

  const register = useCallback(
    async (input: { email: string; password: string; name: string; university: string }) => {
      const { token, user: me } = await api.register(input);
      setToken(token);
      setUserState(me);
    },
    [],
  );

  const logout = useCallback(() => {
    setToken(null);
    setUserState(null);
  }, []);

  const refresh = useCallback(async () => {
    const { user: me } = await api.me();
    setUserState(me);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ user, loading, login, register, logout, refresh, setUser: setUserState }),
    [user, loading, login, register, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
