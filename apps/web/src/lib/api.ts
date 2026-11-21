// Small fetch wrapper: always sends the session cookie and returns JSON or throws ApiError.
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: { errors?: unknown },
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.error ?? "Something went wrong", res.status, body);
  return body as T;
}
