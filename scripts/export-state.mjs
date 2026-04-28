// Dump every Redis key this app uses into export/state.json so the data
// is portable when migrating into another project.
//
// Usage:
//   1. vercel env pull .env.local        (fetches KV_REST_API_* into .env.local)
//   2. node --env-file=.env.local scripts/export-state.mjs
//
// Output: export/state.json with this shape:
//   {
//     exportedAt: ISO string,
//     pointer: number,
//     blacklist: string[],            // every email ever blacklisted
//     effectiveRemaining: { pointer, fresh, updatedAt } | null,
//     cooldowns: { [password]: ISO },
//     histories: { [password]: HistoryEntry[] },
//     users: { password, name, email, isAdmin? }[]   // mirrors lib/users.ts
//   }
//
// Plus a flat blacklist.csv for easy human review / re-import.

import { Redis } from '@upstash/redis';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const outDir = resolve(repoRoot, 'export');

const url =
  process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const token =
  process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

if (!url || !token) {
  console.error(
    'Missing Redis env vars. Run: vercel env pull .env.local',
    '\nThen: node --env-file=.env.local scripts/export-state.mjs',
  );
  process.exit(1);
}

const redis = new Redis({ url, token });

// We mirror lib/users.ts here rather than importing it (this is a .mjs node
// script, lib/users.ts is TS). If users.ts changes, update this list.
const USERS = [
  { password: '7722', name: 'Adit', email: 'aditmittal@berkeley.edu', isAdmin: true },
  { password: '3490', name: 'Srijay', email: 'srijay_vejendla@berkeley.edu' },
  { password: '5514', name: 'Asim', email: 'asim_ali@berkeley.edu' },
];

function parseMaybeJson(raw) {
  if (raw == null) return null;
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

async function main() {
  console.log('Fetching pointer...');
  const pointer = (await redis.get('pointer')) ?? 0;

  console.log('Fetching blacklist (SMEMBERS)...');
  const blacklist = (await redis.smembers('blacklist')) ?? [];

  console.log('Fetching effective_remaining...');
  const effectiveRemaining = parseMaybeJson(
    await redis.get('effective_remaining'),
  );

  const cooldowns = {};
  const histories = {};
  for (const u of USERS) {
    console.log(`Fetching state for user ${u.name}...`);
    const cd = await redis.get(`cooldown:${u.password}`);
    if (cd) cooldowns[u.password] = cd;

    const hist = parseMaybeJson(await redis.get(`history:${u.password}`));
    if (Array.isArray(hist) && hist.length > 0) {
      histories[u.password] = hist;
    }
  }

  const payload = {
    exportedAt: new Date().toISOString(),
    pointer: typeof pointer === 'number' ? pointer : Number(pointer) || 0,
    blacklist: blacklist.sort(),
    effectiveRemaining,
    cooldowns,
    histories,
    users: USERS,
  };

  mkdirSync(outDir, { recursive: true });
  const jsonPath = resolve(outDir, 'state.json');
  writeFileSync(jsonPath, JSON.stringify(payload, null, 2));
  console.log(`Wrote ${jsonPath}`);

  const csvPath = resolve(outDir, 'blacklist.csv');
  writeFileSync(csvPath, 'email\n' + blacklist.sort().join('\n') + '\n');
  console.log(`Wrote ${csvPath}`);

  console.log('\nSummary:');
  console.log(`  pointer:            ${payload.pointer}`);
  console.log(`  blacklist size:     ${payload.blacklist.length}`);
  console.log(`  cooldowns set:      ${Object.keys(cooldowns).length}`);
  console.log(
    `  histories captured: ${Object.values(histories).reduce(
      (n, arr) => n + arr.length,
      0,
    )} entries across ${Object.keys(histories).length} users`,
  );
  console.log(
    `  effectiveRemaining: ${
      effectiveRemaining
        ? `pointer=${effectiveRemaining.pointer} fresh=${effectiveRemaining.fresh}`
        : 'null'
    }`,
  );
}

main().catch((err) => {
  console.error('Export failed:', err);
  process.exit(1);
});
