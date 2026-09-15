"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, UNAUTHORIZED_EVENT } from "./api.js";

const AuthContext = createContext(null);

export function AuthProvider({ initialUser = null, children }) {
  const router = useRouter();
  const [user, setUser] = useState(initialUser);

  const login = useCallback(async (email, password) => {
    let response;
    try {
      response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
    } catch (error) {
      throw new ApiError(0, { message: "Cannot reach the server. Please try again." }, { cause: error });
    }

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new ApiError(response.status, data);
    }
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setUser(null);
    router.replace("/login");
    router.refresh();
  }, [router]);

  useEffect(() => {
    const handleUnauthorized = () => {
      setUser(null);
      const next = `${window.location.pathname}${window.location.search}`;
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    };
    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
  }, [router]);

  const value = useMemo(
    () => ({ user, role: user?.role ?? null, isAuthenticated: Boolean(user), login, logout }),
    [user, login, logout],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return context;
}
