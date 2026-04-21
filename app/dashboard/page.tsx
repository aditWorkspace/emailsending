import { redirect } from 'next/navigation';
import { getSession, SESSION_TTL_SECONDS } from '@/lib/auth';
import { getUser } from '@/lib/users';
import { getCooldown, getPointer, getHistory } from '@/lib/kv';
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

  const [cooldown, pointer, history] = await Promise.all([
    getCooldown(session.password),
    getPointer(),
    getHistory(session.password),
  ]);
  const remaining = Math.max(0, EMAILS.length - pointer);

  return (
    <DashboardClient
      name={user.name}
      cooldownIso={cooldown ? cooldown.toISOString() : null}
      remaining={remaining}
      history={history}
      expiresAtIso={expiresAt.toISOString()}
    />
  );
}
