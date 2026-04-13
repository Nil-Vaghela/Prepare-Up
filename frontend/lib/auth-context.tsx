"use client";

/**
 * Auth context using Google Identity Services (GIS).
 * The GIS button provides a Google ID token which is sent to the backend.
 * The backend verifies it and issues our own JWT access + refresh tokens.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { loginWithGoogle, getMe, refreshToken, logout as apiLogout } from "./api";

export type UserProfile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  email: string | null;
};

type AuthState = {
  user: UserProfile | null;
  accessToken: string | null;
  loading: boolean;
  error: string;
  signIn: () => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  user: null,
  accessToken: null,
  loading: true,
  error: "",
  signIn: () => {},
  signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

const GOOGLE_CLIENT_ID =
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

// Key for sessionStorage (tab-scoped; refresh token is an HttpOnly cookie handled by backend)
const AT_KEY = "pu_access_token";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const gsiRef = useRef(false);

  // Persist access token in sessionStorage (not localStorage — stays in tab)
  const saveToken = useCallback((token: string) => {
    try { sessionStorage.setItem(AT_KEY, token); } catch { /* */ }
    setAccessToken(token);
  }, []);

  const clearToken = useCallback(() => {
    try { sessionStorage.removeItem(AT_KEY); } catch { /* */ }
    setAccessToken(null);
  }, []);

  // On mount: try to restore session from sessionStorage, then refresh
  useEffect(() => {
    async function restore() {
      // 1. Try sessionStorage token
      let storedToken: string | null = null;
      try { storedToken = sessionStorage.getItem(AT_KEY); } catch { /* */ }

      if (storedToken) {
        try {
          const profile = await getMe(storedToken);
          setUser(profile);
          setAccessToken(storedToken);
          setLoading(false);
          return;
        } catch {
          clearToken();
        }
      }

      // 2. Try refresh cookie (backend HttpOnly cookie)
      try {
        const res = await refreshToken();
        saveToken(res.access_token);
        setUser(res.user);
        setLoading(false);
        return;
      } catch {
        // Not logged in — that's fine
      }

      setLoading(false);
    }
    restore();
  }, [saveToken, clearToken]);

  // GIS callback
  const handleCredential = useCallback(
    async (response: { credential?: string }) => {
      const idToken = response.credential;
      if (!idToken) {
        setError("Google sign-in failed: no credential received.");
        return;
      }
      setError("");
      try {
        const result = await loginWithGoogle(idToken);
        saveToken(result.access_token);
        setUser(result.user);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Login failed";
        setError(msg);
      }
    },
    [saveToken]
  );

  // Load GIS script and initialize
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || gsiRef.current) return;
    gsiRef.current = true;

    function init() {
      window.google?.accounts?.id?.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredential,
        auto_select: false,
      });
    }

    if (window.google?.accounts?.id) {
      init();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = init;
    document.head.appendChild(script);
  }, [handleCredential]);

  const signIn = useCallback(() => {
    window.google?.accounts?.id?.prompt();
  }, []);

  const signOut = useCallback(async () => {
    try { await apiLogout(); } catch { /* */ }
    clearToken();
    setUser(null);
    window.google?.accounts?.id?.disableAutoSelect?.();
  }, [clearToken]);

  return (
    <AuthContext.Provider value={{ user, accessToken, loading, error, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

// Declare Google global type
declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize?: (opts: {
            client_id: string;
            callback: (res: { credential?: string }) => void;
            auto_select?: boolean;
          }) => void;
          prompt?: () => void;
          renderButton?: (el: HTMLElement, opts: Record<string, unknown>) => void;
          disableAutoSelect?: () => void;
        };
      };
    };
  }
}
