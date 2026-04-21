'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(false);
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (res.ok) {
      router.push('/dashboard');
      router.refresh();
    } else {
      setError(true);
      setPassword('');
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-black text-white p-6">
      <form onSubmit={submit} className="flex flex-col gap-4 w-72">
        <h1 className="text-2xl font-bold text-center tracking-tight">
          emailsendingasa
        </h1>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="password"
          className={`px-4 py-3 text-lg text-center rounded bg-neutral-900 border ${
            error ? 'border-red-500 animate-shake' : 'border-neutral-700'
          }`}
          autoFocus
        />
        <button
          type="submit"
          disabled={password.length === 0 || loading}
          className="bg-white text-black font-semibold py-3 rounded disabled:opacity-40 transition"
        >
          {loading ? '...' : 'Enter'}
        </button>
        {error && (
          <p className="text-red-500 text-sm text-center">Wrong password.</p>
        )}
      </form>
    </main>
  );
}
