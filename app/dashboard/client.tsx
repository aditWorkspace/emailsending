'use client';

import { useEffect, useRef, useState } from 'react';
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
  isAdmin?: boolean;
  blacklistSize?: number;
}

interface UploadResult {
  filesParsed: number;
  uniqueEmailsFound: number;
  newlyAdded: number;
  totalAfter: number;
}

export default function DashboardClient({
  name,
  cooldownIso,
  remaining: initialRemaining,
  history: initialHistory,
  expiresAtIso,
  isAdmin = false,
  blacklistSize: initialBlacklistSize = 0,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [batchUrl, setBatchUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nextAvailable, setNextAvailable] = useState<string | null>(cooldownIso);
  const [remaining, setRemaining] = useState(initialRemaining);
  const [history, setHistory] = useState<HistoryEntry[]>(initialHistory);
  const [now, setNow] = useState<Date | null>(null);
  const [blacklistSize, setBlacklistSize] = useState<number>(initialBlacklistSize);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  async function uploadBlacklist(files: FileList) {
    setUploading(true);
    setUploadError(null);
    setUploadResult(null);
    try {
      const form = new FormData();
      for (const f of Array.from(files)) form.append('files', f);
      const res = await fetch('/api/blacklist/upload', {
        method: 'POST',
        body: form,
      });
      const data = await res.json();
      if (!data.ok) {
        setUploadError(data.reason ?? 'upload failed');
      } else {
        setUploadResult({
          filesParsed: data.filesParsed,
          uniqueEmailsFound: data.uniqueEmailsFound,
          newlyAdded: data.newlyAdded,
          totalAfter: data.totalAfter,
        });
        setBlacklistSize(data.totalAfter);
      }
    } catch {
      setUploadError('network error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
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
          {isAdmin && (
            <>
              {' · '}
              {blacklistSize.toLocaleString()} in blacklist
            </>
          )}
        </p>

        {isAdmin && (
          <div className="border-t border-neutral-800 pt-4 flex flex-col gap-2">
            <p className="text-xs uppercase tracking-wider text-neutral-500">
              Blacklist upload (admin)
            </p>
            <p className="text-xs text-neutral-500">
              Upload CSVs of already-contacted people. Any email-looking string
              in any cell gets added to the blacklist. Future batches skip them.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              multiple
              disabled={uploading}
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  uploadBlacklist(e.target.files);
                }
              }}
              className="text-xs text-neutral-400 file:mr-3 file:px-3 file:py-2 file:rounded file:border-0 file:bg-neutral-800 file:text-white file:cursor-pointer hover:file:bg-neutral-700 disabled:opacity-40"
            />
            {uploading && (
              <p className="text-xs text-neutral-400">Uploading…</p>
            )}
            {uploadResult && (
              <p className="text-xs text-green-400">
                +{uploadResult.newlyAdded.toLocaleString()} added (
                {uploadResult.uniqueEmailsFound.toLocaleString()} unique emails
                across {uploadResult.filesParsed} file
                {uploadResult.filesParsed === 1 ? '' : 's'}). Total:{' '}
                {uploadResult.totalAfter.toLocaleString()}.
              </p>
            )}
            {uploadError && (
              <p className="text-xs text-red-400">Upload failed: {uploadError}</p>
            )}
          </div>
        )}

        {history.length > 0 && (
          <div className="border-t border-neutral-800 pt-4 flex flex-col gap-2">
            <p className="text-xs uppercase tracking-wider text-neutral-500">
              {isAdmin ? 'All batches (team view)' : 'Your past batches'}
            </p>
            <ul className="flex flex-col divide-y divide-neutral-900 max-h-72 overflow-y-auto">
              {history.map((h) => (
                <li
                  key={`${h.createdAt}-${h.createdBy ?? ''}`}
                  className="flex justify-between items-center py-2 text-sm"
                >
                  <div className="flex flex-col">
                    <span className="text-neutral-400">
                      {formatEntryDate(h.createdAt)}
                    </span>
                    {isAdmin && h.createdBy && (
                      <span className="text-xs text-neutral-600">
                        by {h.createdBy}
                      </span>
                    )}
                  </div>
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
