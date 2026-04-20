import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { USERS } from '@/lib/users';

export async function POST(req: NextRequest) {
  let body: { pin?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const pin = typeof body.pin === 'string' ? body.pin.trim() : '';
  if (!USERS[pin]) {
    return NextResponse.json({ ok: false, reason: 'invalid_pin' }, { status: 401 });
  }

  const session = await getSession();
  session.pin = pin;
  await session.save();

  return NextResponse.json({ ok: true });
}
