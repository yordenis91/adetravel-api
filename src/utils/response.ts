import { Response } from "express";

export function sendItem<T>(res: Response, data: T, statusCode = 200): void {
  res.status(statusCode).json({ data });
}

export function sendList<T>(
  res: Response,
  data: T[],
  total: number,
  page: number,
  limit: number,
  statusCode = 200
): void {
  res.status(statusCode).json({ data, total, page, limit });
}

export function sendError(
  res: Response,
  error: string,
  code: string,
  statusCode = 400
): void {
  res.status(statusCode).json({ error, code });
}
