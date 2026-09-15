"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";

export default function LogoutButton({ className = "" }) {
  const { user, logout } = useAuth();
  const [pending, setPending] = useState(false);

  if (!user) {
    return null;
  }

  async function handleClick() {
    setPending(true);
    await logout();
  }

  return (
    <div className={`flex items-center justify-between gap-3 ${className}`}>
      <span className="truncate text-sm" title={user.email}>
        {user.name || user.email}
      </span>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="shrink-0 rounded-md px-2 py-1 text-sm ring-1 ring-current hover:bg-white/10 disabled:opacity-60"
      >
        {pending ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}
