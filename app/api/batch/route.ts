import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getUser } from '@/lib/users';
import { EMAILS } from '@/lib/emails';
import {
  getPointer,
  setPointer,
  getCooldown,
  setCooldown,
  appendHistory,
} from '@/lib/kv';
import { createBatchSheet, describeGoogleError } from '@/lib/sheets';

const BATCH_SIZE = 300;
const COOLDOWN_HOURS = 12;

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST() {
  const session = await getSession();
  const password = session.password;
  const user = password ? getUser(password) : undefined;

  if (!password || !user) {
    return NextResponse.json(
      { ok: false, reason: 'unauthenticated' },
      { status: 401 },
    );
  }

  const now = new Date();

  const cooldown = await getCooldown(password);
  if (cooldown && now < cooldown) {
    return NextResponse.json({
      ok: false,
      reason: 'cooldown',
      retryAt: cooldown.toISOString(),
    });
  }

  const pointer = await getPointer();
  if (pointer + BATCH_SIZE > EMAILS.length) {
    return NextResponse.json({
      ok: false,
      reason: 'exhausted',
      remaining: Math.max(0, EMAILS.length - pointer),
    });
  }

  const rows = EMAILS.slice(pointer, pointer + BATCH_SIZE);

  let url: string;
  let title: string;
  try {
    const result = await createBatchSheet({
      userName: user.name,
      userEmail: user.email,
      rows,
    });
    url = result.url;
    title = result.title;
  } catch (err) {
    const detail = describeGoogleError(err);
    console.error('createBatchSheet failed:', detail, err);
    return NextResponse.json(
      { ok: false, reason: 'sheet_error', detail },
      { status: 500 },
    );
  }

  await setPointer(pointer + BATCH_SIZE);
  const nextAvailable = new Date(
    now.getTime() + COOLDOWN_HOURS * 60 * 60 * 1000,
  );
  await setCooldown(password, nextAvailable);

  const newEntry = { url, title, createdAt: now.toISOString(), createdBy: user.name };
  await appendHistory(password, newEntry);

  return NextResponse.json({
    ok: true,
    url,
    nextAvailable: nextAvailable.toISOString(),
    remaining: EMAILS.length - (pointer + BATCH_SIZE),
    newEntry,
  });
}
