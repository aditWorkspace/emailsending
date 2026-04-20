import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getUser } from '@/lib/users';
import { getCooldown, getPointer, getHistory } from '@/lib/kv';
import { EMAILS } from '@/lib/emails';
import DashboardClient from './client';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await getSession();
  const user = session.pin ? getUser(session.pin) : undefined;
  if (!user || !session.pin) {
    redirect('/');
  }

  const [cooldown, pointer, history] = await Promise.all([
    getCooldown(session.pin),
    getPointer(),
    getHistory(session.pin),
  ]);
  const remaining = Math.max(0, EMAILS.length - pointer);

  return (
    <DashboardClient
      name={user.name}
      cooldownIso={cooldown ? cooldown.toISOString() : null}
      remaining={remaining}
      history={history}
    />
  );
}
