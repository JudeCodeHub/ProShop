import { getToken } from "./token.js";

export const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api"
).replace(/\/+$/, "");

function messageFrom(status, body) {
  if (Array.isArray(body?.message)) {
    return body.message.join(", ");
  }
  if (typeof body?.message === "string") {
    return body.message;
  }
  if (typeof body === "string" && body) {
    return body;
  }
  return `Request failed with status ${status}`;
}

export class ApiError extends Error {
  constructor(status, body, options) {
    super(messageFrom(status, body), options);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

async function readBody(response) {
  if (response.status === 204) {
    return null;
  }
  const type = response.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    return response.json();
  }
  if (type.startsWith("text/")) {
    return response.text();
  }
  return response.blob();
}

export async function apiFetch(
  path,
  { method = "GET", body, headers, token = getToken(), ...init } = {},
) {
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  const isJson = body !== undefined && !isFormData;
  const url = `${API_URL}${path.startsWith("/") ? path : `/${path}`}`;

  let response;
  try {
    response = await fetch(url, {
      ...init,
      method,
      headers: {
        Accept: "application/json",
        ...(isJson && { "Content-Type": "application/json" }),
        ...(token && { Authorization: `Bearer ${token}` }),
        ...headers,
      },
      body: isJson ? JSON.stringify(body) : body,
    });
  } catch (error) {
    throw new ApiError(0, { message: `Cannot reach the server at ${API_URL}` }, { cause: error });
  }

  const data = await readBody(response);
  if (!response.ok) {
    throw new ApiError(response.status, data);
  }
  return data;
}

export const api = {
  get: (path, options) => apiFetch(path, options),
  post: (path, body, options) => apiFetch(path, { ...options, method: "POST", body }),
  put: (path, body, options) => apiFetch(path, { ...options, method: "PUT", body }),
  delete: (path, options) => apiFetch(path, { ...options, method: "DELETE" }),
};
