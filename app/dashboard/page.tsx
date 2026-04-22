import { redirect } from 'next/navigation';
import { getSession, SESSION_TTL_SECONDS } from '@/lib/auth';
import { getUser } from '@/lib/users';
import {
  getCooldown,
  getPointer,
  getHistory,
  getAllHistory,
  getBlacklistSize,
  getEffectiveRemaining,
  setEffectiveRemaining,
  countFresh,
} from '@/lib/kv';
import { EMAILS } from '@/lib/emails';
import DashboardClient from './client';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await getSession();
  const user = session.password ? getUser(session.password) : undefined;
  if (!user || !session.password || !session.loginAt) {
    redirect('/');
  }

  const expiresAt = new Date(
    new Date(session.loginAt).getTime() + SESSION_TTL_SECONDS * 1000,
  );
  if (Date.now() >= expiresAt.getTime()) {
    redirect('/');
  }

  const isAdmin = user.isAdmin ?? false;

  const [cooldown, pointer, history, blacklistSize, cachedRemaining] =
    await Promise.all([
      getCooldown(session.password),
      getPointer(),
      isAdmin ? getAllHistory() : getHistory(session.password),
      isAdmin ? getBlacklistSize() : Promise.resolve(0),
      getEffectiveRemaining(),
    ]);

  let remaining: number;
  if (cachedRemaining && cachedRemaining.pointer === pointer) {
    remaining = cachedRemaining.fresh;
  } else {
    // Cold cache (fresh deploy, Redis eviction, or pointer drift). Recompute
    // once; subsequent loads hit the cache.
    remaining = await countFresh(EMAILS.slice(pointer).map((r) => r.email));
    await setEffectiveRemaining(pointer, remaining);
  }

  return (
    <DashboardClient
      name={user.name}
      cooldownIso={cooldown ? cooldown.toISOString() : null}
      remaining={remaining}
      history={history}
      expiresAtIso={expiresAt.toISOString()}
      isAdmin={isAdmin}
      blacklistSize={blacklistSize}
    />
  );
}
