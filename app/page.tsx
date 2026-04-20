'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(false);
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    setLoading(false);
    if (res.ok) {
      router.push('/dashboard');
      router.refresh();
    } else {
      setError(true);
      setPin('');
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
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          placeholder="4-digit pin"
          className={`px-4 py-3 text-xl text-center rounded bg-neutral-900 border tracking-widest ${
            error ? 'border-red-500 animate-shake' : 'border-neutral-700'
          }`}
          autoFocus
        />
        <button
          type="submit"
          disabled={pin.length !== 4 || loading}
          className="bg-white text-black font-semibold py-3 rounded disabled:opacity-40 transition"
        >
          {loading ? '...' : 'Enter'}
        </button>
        {error && (
          <p className="text-red-500 text-sm text-center">Wrong pin.</p>
        )}
      </form>
    </main>
  );
}
