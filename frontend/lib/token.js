const TOKEN_KEY = "proshop.accessToken";

function storage() {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getToken() {
  return storage()?.getItem(TOKEN_KEY) ?? null;
}

export function setToken(token) {
  storage()?.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  storage()?.removeItem(TOKEN_KEY);
}
