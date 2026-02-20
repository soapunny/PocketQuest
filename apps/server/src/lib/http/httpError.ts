// apps/server/src/lib/http/httpError.ts

export type ErrorPayload = Record<string, unknown>;

export class HttpError extends Error {
  readonly status: number;
  readonly payload?: ErrorPayload;

  constructor(status: number, message: string, payload?: ErrorPayload) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.payload = payload;
  }
}
