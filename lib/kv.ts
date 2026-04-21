import { Redis } from '@upstash/redis';
import { getAllPasswords, getUserByPassword } from './users';

const POINTER_KEY = 'pointer';
const cooldownKey = (password: string) => `cooldown:${password}`;
const historyKey = (password: string) => `history:${password}`;
const HISTORY_CAP = 50;

export interface HistoryEntry {
  url: string;
  createdAt: string;
  title: string;
  createdBy?: string;
}

let _redis: Redis | null = null;

function redis(): Redis {
  if (_redis) return _redis;
  const url =
    process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error(
      'Missing Redis env vars. Set KV_REST_API_URL + KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN).',
    );
  }
  _redis = new Redis({ url, token });
  return _redis;
}

export async function getPointer(): Promise<number> {
  const value = await redis().get<number>(POINTER_KEY);
  return typeof value === 'number' ? value : 0;
}

export async function setPointer(value: number): Promise<void> {
  await redis().set(POINTER_KEY, value);
}

export async function getCooldown(password: string): Promise<Date | null> {
  const iso = await redis().get<string>(cooldownKey(password));
  return iso ? new Date(iso) : null;
}

export async function setCooldown(password: string, date: Date): Promise<void> {
  await redis().set(cooldownKey(password), date.toISOString());
}

export async function clearCooldown(password: string): Promise<void> {
  await redis().del(cooldownKey(password));
}

export async function getHistory(password: string): Promise<HistoryEntry[]> {
  const raw = await redis().get(historyKey(password));
  if (!raw) return [];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : [];
    } catch {
      return [];
    }
  }
  return Array.isArray(raw) ? (raw as HistoryEntry[]) : [];
}

export async function appendHistory(
  password: string,
  entry: HistoryEntry,
): Promise<void> {
  const existing = await getHistory(password);
  const next = [entry, ...existing].slice(0, HISTORY_CAP);
  await redis().set(historyKey(password), JSON.stringify(next));
}

export async function getAllHistory(): Promise<HistoryEntry[]> {
  const passwords = getAllPasswords();
  const allEntries: HistoryEntry[] = [];

  for (const pwd of passwords) {
    const user = getUserByPassword(pwd);
    const entries = await getHistory(pwd);
    for (const entry of entries) {
      allEntries.push({
        ...entry,
        createdBy: user?.name ?? 'Unknown',
      });
    }
  }

  allEntries.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return allEntries;
}
