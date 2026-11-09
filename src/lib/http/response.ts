import { NextResponse } from "next/server";

/**
 * Kontrak respons API KuisKita (PRD §14).
 *
 * Sukses : { data, request_id }
 * Error  : { error: { code, message, request_id } }
 *
 * request_id diambil dari header `x-request-id`/`x-vercel-id` bila ada
 * (agar berelasi dengan log Vercel/Sentry), atau dibuat baru.
 */

export type ApiSuccess<T> = {
  data: T;
  request_id: string;
};

export type ApiError = {
  error: {
    code: string;
    message: string;
    request_id: string;
  };
};

export function getRequestId(request?: Request): string {
  const header = request?.headers.get("x-request-id") ?? request?.headers.get("x-vercel-id");
  return header ?? crypto.randomUUID();
}

export function ok<T>(request: Request | undefined, data: T, init?: ResponseInit) {
  const body: ApiSuccess<T> = { data, request_id: getRequestId(request) };
  return NextResponse.json(body, { status: 200, ...init });
}

export function fail(
  request: Request | undefined,
  status: number,
  code: string,
  message: string,
  init?: ResponseInit,
) {
  const body: ApiError = { error: { code, message, request_id: getRequestId(request) } };
  return NextResponse.json(body, { status, ...init });
}

/** Salin cookie sesi dari satu respons ke respons lain (dipakai middleware). */
export function copySessionCookies(target: NextResponse, source: NextResponse) {
  for (const cookie of source.cookies.getAll()) {
    target.cookies.set(cookie);
  }
  return target;
}
