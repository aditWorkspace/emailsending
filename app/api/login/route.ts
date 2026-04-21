import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { USERS } from '@/lib/users';

export async function POST(req: NextRequest) {
  let body: { password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const password = typeof body.password === 'string' ? body.password.trim() : '';
  if (!USERS[password]) {
    return NextResponse.json({ ok: false, reason: 'invalid_password' }, { status: 401 });
  }

  const session = await getSession();
  session.password = password;
  session.loginAt = new Date().toISOString();
  await session.save();

  return NextResponse.json({ ok: true });
}
