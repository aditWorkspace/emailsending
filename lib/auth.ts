import { getIronSession, type SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';

export interface SessionData {
  pin?: string;
}

const sessionOptions: SessionOptions = {
  password: process.env.COOKIE_SECRET ?? 'dev-only-insecure-secret-change-me-please-32chars',
  cookieName: 'emailsendingasa',
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
