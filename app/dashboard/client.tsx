'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { HistoryEntry } from '@/lib/kv';

type BatchResponse =
  | {
      ok: true;
      url: string;
      nextAvailable: string;
      remaining: number;
      newEntry: HistoryEntry;
    }
  | { ok: false; reason: 'cooldown'; retryAt: string }
  | { ok: false; reason: 'exhausted'; remaining: number }
  | { ok: false; reason: 'sheet_error'; detail?: string }
  | { ok: false; reason: 'unauthenticated' };

interface Props {
  name: string;
  cooldownIso: string | null;
  remaining: number;
  history: HistoryEntry[];
  expiresAtIso: string;
}

export default function DashboardClient({
  name,
  cooldownIso,
  remaining: initialRemaining,
  history: initialHistory,
  expiresAtIso,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [batchUrl, setBatchUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nextAvailable, setNextAvailable] = useState<string | null>(cooldownIso);
  const [remaining, setRemaining] = useState(initialRemaining);
  const [history, setHistory] = useState<HistoryEntry[]>(initialHistory);
  const [now, setNow] = useState<Date | null>(null);

  const expiresAt = new Date(expiresAtIso);

  async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    router.push('/');
    router.refresh();
  }

  useEffect(() => {
    const tick = () => {
      const current = new Date();
      setNow(current);
      if (current.getTime() >= expiresAt.getTime()) {
        logout();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAtIso]);

  const cooldownDate = nextAvailable ? new Date(nextAvailable) : null;
  const onCooldown = !!(now && cooldownDate && now < cooldownDate);
  const sessionMsLeft = now ? Math.max(0, expiresAt.getTime() - now.getTime()) : null;

  async function getBatch() {
    setLoading(true);
    setError(null);
    setBatchUrl(null);
    try {
      const res = await fetch('/api/batch', { method: 'POST' });
      const data: BatchResponse = await res.json();

      if (data.ok) {
        setBatchUrl(data.url);
        setNextAvailable(data.nextAvailable);
        setRemaining(data.remaining);
        setHistory((prev) => [data.newEntry, ...prev]);
        window.open(data.url, '_blank', 'noopener,noreferrer');
      } else if (data.reason === 'cooldown') {
        setNextAvailable(data.retryAt);
      } else if (data.reason === 'exhausted') {
        setError('Pool is empty. Tell Adit to add more emails.');
      } else if (data.reason === 'unauthenticated') {
        router.push('/');
      } else if (data.reason === 'sheet_error') {
        setError(`Sheet creation failed: ${data.detail ?? 'unknown error'}`);
      } else {
        setError('Something went wrong. Try again.');
      }
    } catch {
      setError('Network error. Try again.');
    } finally {
      setLoading(false);
    }
  }

  function countdown(target: Date): string {
    if (!now) return '';
    const diff = Math.max(0, target.getTime() - now.getTime());
    const h = Math.floor(diff / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    const s = Math.floor((diff % 60_000) / 1000);
    return `${h}h ${m}m ${s}s`;
  }

  function formatEntryDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-black text-white p-6">
      <div className="max-w-md w-full flex flex-col gap-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Hi {name}.</h1>
          <div className="flex flex-col items-end gap-0.5">
            <button
              onClick={logout}
              className="text-sm text-neutral-400 hover:text-white underline"
            >
              Log out
            </button>
            {sessionMsLeft !== null && (
              <span className="text-[10px] font-mono text-neutral-500">
                auto-logout in {Math.floor(sessionMsLeft / 60000)}m{' '}
                {Math.floor((sessionMsLeft % 60000) / 1000)
                  .toString()
                  .padStart(2, '0')}
                s
              </span>
            )}
          </div>
        </div>

        <button
          onClick={getBatch}
          disabled={loading || onCooldown}
          className="bg-white text-black font-semibold py-6 rounded text-lg disabled:opacity-40 transition"
        >
          {loading ? 'Preparing your batch...' : 'Give me my batch of 300'}
        </button>

        {onCooldown && cooldownDate && (
          <p className="text-center text-neutral-400">
            Next batch available in{' '}
            <span className="font-mono text-white">
              {countdown(cooldownDate)}
            </span>
            <br />
            <span className="text-xs">
              ({cooldownDate.toLocaleString()})
            </span>
          </p>
        )}

        {!onCooldown && !batchUrl && (
          <p className="text-center text-green-500">Ready to go.</p>
        )}

        {batchUrl && (
          <a
            href={batchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center bg-green-700 hover:bg-green-600 text-white py-3 rounded transition"
          >
            Your batch is ready → open sheet
          </a>
        )}

        {error && (
          <p className="text-center text-red-400">{error}</p>
        )}

        <p className="text-xs text-neutral-500 text-center">
          {remaining.toLocaleString()} emails left in pool
        </p>

        {history.length > 0 && (
          <div className="border-t border-neutral-800 pt-4 flex flex-col gap-2">
            <p className="text-xs uppercase tracking-wider text-neutral-500">
              Your past batches
            </p>
            <ul className="flex flex-col divide-y divide-neutral-900 max-h-72 overflow-y-auto">
              {history.map((h) => (
                <li
                  key={h.createdAt}
                  className="flex justify-between items-center py-2 text-sm"
                >
                  <span className="text-neutral-400">
                    {formatEntryDate(h.createdAt)}
                  </span>
                  <a
                    href={h.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 underline"
                  >
                    open sheet →
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}
