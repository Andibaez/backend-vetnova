import type { Response } from 'express';

export const AUTH_COOKIE = 'vetnova-token';
export const CSRF_COOKIE = 'vetnova-csrf';

const DURATION_UNITS: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

/** Convierte una duración estilo JWT ("10d", "1h", "30m") a milisegundos. */
export function durationToMs(value: string, fallbackMs: number): number {
  const match = /^(\d+)([smhd])$/.exec(value.trim());
  if (!match) return fallbackMs;
  return Number(match[1]) * DURATION_UNITS[match[2]];
}

export function setAuthCookie(
  res: Response,
  token: string,
  jwtExpiresIn: string,
): void {
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: durationToMs(jwtExpiresIn, 10 * 24 * 60 * 60 * 1000),
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(AUTH_COOKIE, { path: '/' });
  res.clearCookie(CSRF_COOKIE, { path: '/' });
}
