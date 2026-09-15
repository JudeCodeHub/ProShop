"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";

export function useApi(path) {
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState({ path: null, version: -1, data: undefined, error: null });

  useEffect(() => {
    if (!path) {
      return undefined;
    }
    let cancelled = false;
    api.get(path).then(
      (data) => {
        if (!cancelled) {
          setResult({ path, version, data, error: null });
        }
      },
      (error) => {
        if (!cancelled) {
          setResult({ path, version, data: undefined, error });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [path, version]);

  const reload = useCallback(() => setVersion((current) => current + 1), []);
  const isCurrentPath = Boolean(path) && result.path === path;

  return {
    data: isCurrentPath ? result.data : undefined,
    error: isCurrentPath ? result.error : null,
    loading: Boolean(path) && (!isCurrentPath || result.version !== version),
    reload,
  };
}
