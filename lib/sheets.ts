import { google } from 'googleapis';
import type { EmailRow } from './emails';

function getCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON env var is not set');

  // Accept either base64-encoded JSON or raw JSON.
  let text = raw.trim();
  if (!text.startsWith('{')) {
    text = Buffer.from(text, 'base64').toString('utf-8');
  }
  return JSON.parse(text);
}

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: getCredentials(),
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive',
    ],
  });
}

export interface CreateBatchSheetInput {
  userName: string;
  userEmail: string;
  rows: EmailRow[];
}

export interface CreateBatchSheetResult {
  url: string;
  spreadsheetId: string;
}

export async function createBatchSheet(
  input: CreateBatchSheetInput,
): Promise<CreateBatchSheetResult> {
  const sharedDriveId = process.env.SHARED_DRIVE_ID;
  if (!sharedDriveId) {
    throw new Error(
      'SHARED_DRIVE_ID env var is not set. Create a Shared Drive, add the service account as Content Manager, and set SHARED_DRIVE_ID to the drive ID (see README).',
    );
  }

  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const drive = google.drive({ version: 'v3', auth });

  const today = new Date().toISOString().slice(0, 10);
  const title = `${input.userName} - ${today} - Batch`;

  console.log('[sheets] creating file in shared drive', { title, sharedDriveId });

  // 1. Create the file via Drive API inside the Shared Drive. Files in Shared
  //    Drives are owned by the drive itself, so the service account's
  //    zero-storage-quota doesn't block creation.
  const createdFile = await drive.files.create({
    requestBody: {
      name: title,
      mimeType: 'application/vnd.google-apps.spreadsheet',
      parents: [sharedDriveId],
    },
    fields: 'id,name,parents',
    supportsAllDrives: true,
  });
  const spreadsheetId = createdFile.data.id;
  if (!spreadsheetId) throw new Error('Drive create did not return a file id');

  console.log('[sheets] created file', { spreadsheetId });

  // 2. Read the auto-created first tab's id + title.
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const firstSheet = meta.data.sheets?.[0]?.properties;
  if (firstSheet?.sheetId == null || !firstSheet.title) {
    throw new Error('Could not read sheet metadata after create');
  }

  // 3. Write values to the first tab.
  const values = [
    ['Company', 'Full Name', 'Email', 'First Name'],
    ...input.rows.map((r) => [r.company, r.fullName, r.email, r.firstName]),
  ];
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${firstSheet.title}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values },
  });

  // 4. Bold the header row and freeze it.
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: {
              sheetId: firstSheet.sheetId,
              startRowIndex: 0,
              endRowIndex: 1,
            },
            cell: { userEnteredFormat: { textFormat: { bold: true } } },
            fields: 'userEnteredFormat.textFormat.bold',
          },
        },
        {
          updateSheetProperties: {
            properties: {
              sheetId: firstSheet.sheetId,
              gridProperties: { frozenRowCount: 1 },
            },
            fields: 'gridProperties.frozenRowCount',
          },
        },
      ],
    },
  });

  console.log('[sheets] sharing with user', { userEmail: input.userEmail });

  // 5. Share the file with the user's Gmail. supportsAllDrives is required
  //    for files that live in a Shared Drive.
  await drive.permissions.create({
    fileId: spreadsheetId,
    supportsAllDrives: true,
    requestBody: {
      role: 'writer',
      type: 'user',
      emailAddress: input.userEmail,
    },
    sendNotificationEmail: false,
  });

  return {
    url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    spreadsheetId,
  };
}

export function describeGoogleError(err: unknown): string {
  const e = err as {
    message?: string;
    code?: number | string;
    status?: string;
    errors?: Array<{ message?: string; reason?: string }>;
    response?: {
      status?: number;
      data?: { error?: { message?: string; status?: string } };
    };
  };
  const googleMsg =
    e?.response?.data?.error?.message ??
    e?.errors?.[0]?.message ??
    e?.message ??
    'unknown error';
  const status = e?.response?.status ?? e?.code ?? e?.status ?? '?';
  const reason = e?.errors?.[0]?.reason ?? e?.response?.data?.error?.status ?? '';
  return `[${status}${reason ? ` ${reason}` : ''}] ${googleMsg}`;
}
