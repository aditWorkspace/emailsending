import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getUser } from '@/lib/users';
import { addToBlacklist, getBlacklistSize } from '@/lib/kv';

export const runtime = 'nodejs';
export const maxDuration = 60;

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

export async function POST(req: NextRequest) {
  const session = await getSession();
  const user = session.password ? getUser(session.password) : undefined;
  if (!user?.isAdmin) {
    return NextResponse.json(
      { ok: false, reason: 'forbidden' },
      { status: 403 },
    );
  }

  let files: File[];
  try {
    const form = await req.formData();
    files = form
      .getAll('files')
      .filter((v): v is File => typeof v !== 'string');
  } catch {
    return NextResponse.json(
      { ok: false, reason: 'bad_form' },
      { status: 400 },
    );
  }

  if (files.length === 0) {
    return NextResponse.json(
      { ok: false, reason: 'no_files' },
      { status: 400 },
    );
  }

  const totalBefore = await getBlacklistSize();
  const allEmails = new Set<string>();
  for (const file of files) {
    const text = await file.text();
    const matches = text.match(EMAIL_RE);
    if (!matches) continue;
    for (const m of matches) allEmails.add(m.toLowerCase());
  }

  if (allEmails.size === 0) {
    return NextResponse.json({
      ok: true,
      filesParsed: files.length,
      uniqueEmailsFound: 0,
      newlyAdded: 0,
      totalBefore,
      totalAfter: totalBefore,
    });
  }

  const { added, totalAfter } = await addToBlacklist(Array.from(allEmails));

  return NextResponse.json({
    ok: true,
    filesParsed: files.length,
    uniqueEmailsFound: allEmails.size,
    newlyAdded: added,
    totalBefore,
    totalAfter,
  });
}
