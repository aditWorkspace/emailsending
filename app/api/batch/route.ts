import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getUser } from '@/lib/users';
import { EMAILS } from '@/lib/emails';
import type { EmailRow } from '@/lib/emails';
import {
  getPointer,
  setPointer,
  getCooldown,
  setCooldown,
  appendHistory,
  isBlacklistedBatch,
  addToBlacklist,
  countFresh,
  setEffectiveRemaining,
} from '@/lib/kv';
import { createBatchSheet, describeGoogleError } from '@/lib/sheets';

const BATCH_SIZE = 400;
const COOLDOWN_HOURS = 12;
const LOOKAHEAD_WINDOW = 500;

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

  const startPointer = await getPointer();

  // Walk forward from the pointer, skipping any row whose email is already
  // in the blacklist. We pull LOOKAHEAD_WINDOW rows at a time and batch-check
  // membership in Redis so we don't do one round trip per row.
  const picked: EmailRow[] = [];
  let cursor = startPointer;
  while (picked.length < BATCH_SIZE && cursor < EMAILS.length) {
    const windowEnd = Math.min(cursor + LOOKAHEAD_WINDOW, EMAILS.length);
    const window = EMAILS.slice(cursor, windowEnd);
    const flags = await isBlacklistedBatch(window.map((r) => r.email));
    for (let i = 0; i < window.length; i++) {
      cursor = cursor + 1;
      if (flags[i]) continue;
      picked.push(window[i]);
      if (picked.length >= BATCH_SIZE) break;
    }
  }

  if (picked.length < BATCH_SIZE) {
    // Ran out of pool before filling a full batch. Still advance the pointer
    // so we don't re-scan the same exhausted tail next time.
    await setPointer(cursor);
    await setEffectiveRemaining(cursor, 0);
    return NextResponse.json({
      ok: false,
      reason: 'exhausted',
      remaining: 0,
    });
  }

  let url: string;
  let title: string;
  try {
    const result = await createBatchSheet({
      userName: user.name,
      userEmail: user.email,
      rows: picked,
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

  await setPointer(cursor);
  // Auto-add every email we just shipped so no future batch can re-contact them.
  await addToBlacklist(picked.map((r) => r.email));

  // Recompute fresh-remaining against the new pointer + blacklist and cache it.
  const freshRemaining = await countFresh(
    EMAILS.slice(cursor).map((r) => r.email),
  );
  await setEffectiveRemaining(cursor, freshRemaining);

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
    remaining: freshRemaining,
    newEntry,
  });
}
