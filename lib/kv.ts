import { Redis } from '@upstash/redis';
import { getAllPasswords, getUserByPassword } from './users';

const POINTER_KEY = 'pointer';
const BLACKLIST_KEY = 'blacklist';
const EFF_REMAINING_KEY = 'effective_remaining';
const cooldownKey = (password: string) => `cooldown:${password}`;
const historyKey = (password: string) => `history:${password}`;
const HISTORY_CAP = 50;

const SADD_CHUNK = 1000;
const SMISMEMBER_CHUNK = 500;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

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

export async function getBlacklistSize(): Promise<number> {
  return await redis().scard(BLACKLIST_KEY);
}

export async function isBlacklistedBatch(
  emails: string[],
): Promise<boolean[]> {
  const normalized = emails.map(normalizeEmail);
  const result: boolean[] = new Array(normalized.length);
  for (let i = 0; i < normalized.length; i += SMISMEMBER_CHUNK) {
    const chunk = normalized.slice(i, i + SMISMEMBER_CHUNK);
    const res = await redis().smismember(BLACKLIST_KEY, chunk);
    for (let j = 0; j < chunk.length; j++) {
      result[i + j] = res[j] === 1;
    }
  }
  return result;
}

export async function addToBlacklist(
  emails: string[],
): Promise<{ added: number; totalAfter: number }> {
  const unique = Array.from(
    new Set(emails.map(normalizeEmail).filter((e) => e.length > 0)),
  );
  let added = 0;
  for (let i = 0; i < unique.length; i += SADD_CHUNK) {
    const chunk = unique.slice(i, i + SADD_CHUNK);
    if (chunk.length === 0) continue;
    const n = await redis().sadd(BLACKLIST_KEY, chunk[0], ...chunk.slice(1));
    added += n;
  }
  const totalAfter = await getBlacklistSize();
  return { added, totalAfter };
}

export async function countFresh(emails: string[]): Promise<number> {
  const flags = await isBlacklistedBatch(emails);
  let fresh = 0;
  for (const f of flags) if (!f) fresh++;
  return fresh;
}

export interface EffectiveRemaining {
  pointer: number;
  fresh: number;
  updatedAt: string;
}

export async function getEffectiveRemaining(): Promise<EffectiveRemaining | null> {
  const raw = await redis().get(EFF_REMAINING_KEY);
  if (!raw) return null;
  try {
    const parsed =
      typeof raw === 'string' ? JSON.parse(raw) : (raw as EffectiveRemaining);
    if (
      typeof parsed?.pointer === 'number' &&
      typeof parsed?.fresh === 'number'
    ) {
      return parsed as EffectiveRemaining;
    }
    return null;
  } catch {
    return null;
  }
}

export async function setEffectiveRemaining(
  pointer: number,
  fresh: number,
): Promise<void> {
  const payload: EffectiveRemaining = {
    pointer,
    fresh,
    updatedAt: new Date().toISOString(),
  };
  await redis().set(EFF_REMAINING_KEY, JSON.stringify(payload));
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
