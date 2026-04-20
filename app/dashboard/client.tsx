'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type BatchResponse =
  | { ok: true; url: string; nextAvailable: string; remaining: number }
  | { ok: false; reason: 'cooldown'; retryAt: string }
  | { ok: false; reason: 'exhausted'; remaining: number }
  | { ok: false; reason: 'sheet_error'; detail?: string }
  | { ok: false; reason: 'unauthenticated' };

interface Props {
  name: string;
  cooldownIso: string | null;
  remaining: number;
}

export default function DashboardClient({
  name,
  cooldownIso,
  remaining: initialRemaining,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [batchUrl, setBatchUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nextAvailable, setNextAvailable] = useState<string | null>(cooldownIso);
  const [remaining, setRemaining] = useState(initialRemaining);
  const [now, setNow] = useState<Date | null>(null);
  const [testMode, setTestMode] = useState(true);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const cooldownDate = nextAvailable ? new Date(nextAvailable) : null;
  const onCooldown = !!(now && cooldownDate && now < cooldownDate);

  async function getBatch() {
    setLoading(true);
    setError(null);
    setBatchUrl(null);
    try {
      const res = await fetch('/api/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testMode }),
      });
      const data: BatchResponse = await res.json();

      if (data.ok) {
        setBatchUrl(data.url);
        setNextAvailable(data.nextAvailable);
        setRemaining(data.remaining);
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

  async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    router.push('/');
    router.refresh();
  }

  function countdown(target: Date): string {
    if (!now) return '';
    const diff = Math.max(0, target.getTime() - now.getTime());
    const h = Math.floor(diff / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    const s = Math.floor((diff % 60_000) / 1000);
    return `${h}h ${m}m ${s}s`;
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-black text-white p-6">
      <div className="max-w-md w-full flex flex-col gap-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Hi {name}.</h1>
          <button
            onClick={logout}
            className="text-sm text-neutral-400 hover:text-white underline"
          >
            Log out
          </button>
        </div>

        {/* TEST MODE: remove this label block before sharing with Srijay/Asim */}
        <label className="flex items-center gap-2 text-sm text-yellow-400 bg-yellow-950/40 border border-yellow-900 rounded px-3 py-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={testMode}
            onChange={(e) => setTestMode(e.target.checked)}
            className="accent-yellow-400"
          />
          Test mode — don&apos;t consume emails or start cooldown
        </label>

        <button
          onClick={getBatch}
          disabled={loading || onCooldown}
          className="bg-white text-black font-semibold py-6 rounded text-lg disabled:opacity-40 transition"
        >
          {loading
            ? 'Preparing your batch...'
            : testMode
              ? 'Give me a test batch of 300'
              : 'Give me my batch of 300'}
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
          <p className="text-center text-green-500">Ready. ⚡ (oauth build)</p>
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
      </div>
    </main>
  );
}
