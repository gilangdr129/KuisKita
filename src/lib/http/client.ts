/** Helper membaca respons envelope API dari sisi klien. */

export type EnvelopeError = {
  error: { code: string; message: string; request_id: string };
};

export type EnvelopeSuccess<T> = {
  data: T;
  request_id: string;
};

export async function readError(response: Response): Promise<EnvelopeError | null> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && "error" in body) {
      return body as EnvelopeError;
    }
    return null;
  } catch {
    return null;
  }
}

export async function readData<T>(response: Response): Promise<T | null> {
  try {
    const body = (await response.json()) as EnvelopeSuccess<T> | EnvelopeError;
    if (body && typeof body === "object" && "data" in body) {
      return body.data as T;
    }
    return null;
  } catch {
    return null;
  }
}
