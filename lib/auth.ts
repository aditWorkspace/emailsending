import { getIronSession, type SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';

export const SESSION_TTL_SECONDS = 5 * 60;

export interface SessionData {
  password?: string;
  loginAt?: string;
}

const sessionOptions: SessionOptions = {
  password: process.env.COOKIE_SECRET ?? 'dev-only-insecure-secret-change-me-please-32chars',
  cookieName: 'emailsendingasa',
  ttl: SESSION_TTL_SECONDS,
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
  },
};

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}
