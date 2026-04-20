import { Redis } from '@upstash/redis';

const POINTER_KEY = 'pointer';
const cooldownKey = (pin: string) => `cooldown:${pin}`;
const historyKey = (pin: string) => `history:${pin}`;
const HISTORY_CAP = 50;

export interface HistoryEntry {
  url: string;
  createdAt: string;
  title: string;
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

export async function getCooldown(pin: string): Promise<Date | null> {
  const iso = await redis().get<string>(cooldownKey(pin));
  return iso ? new Date(iso) : null;
}

export async function setCooldown(pin: string, date: Date): Promise<void> {
  await redis().set(cooldownKey(pin), date.toISOString());
}

export async function clearCooldown(pin: string): Promise<void> {
  await redis().del(cooldownKey(pin));
}

export async function getHistory(pin: string): Promise<HistoryEntry[]> {
  const raw = await redis().get(historyKey(pin));
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
  pin: string,
  entry: HistoryEntry,
): Promise<void> {
  const existing = await getHistory(pin);
  const next = [entry, ...existing].slice(0, HISTORY_CAP);
  await redis().set(historyKey(pin), JSON.stringify(next));
}
