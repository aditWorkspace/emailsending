import { google } from 'googleapis';
import type { EmailRow } from './emails';

const OWNER_EMAIL = 'aditmittal@berkeley.edu';

function getOAuth2Client() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Missing OAuth env vars: set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and GOOGLE_OAUTH_REFRESH_TOKEN (see README).',
    );
  }
  const client = new google.auth.OAuth2(clientId, clientSecret);
  client.setCredentials({ refresh_token: refreshToken });
  return client;
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
  const auth = getOAuth2Client();
  const sheets = google.sheets({ version: 'v4', auth });
  const drive = google.drive({ version: 'v3', auth });

  const today = new Date().toISOString().slice(0, 10);
  const title = `${input.userName} - ${today} - Batch`;

  console.log('[sheets] creating spreadsheet as OAuth user', { title });

  const created = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title },
      sheets: [{ properties: { title: 'Batch' } }],
    },
  });

  const spreadsheetId = created.data.spreadsheetId;
  const firstSheet = created.data.sheets?.[0]?.properties;
  if (!spreadsheetId) throw new Error('Sheets API did not return a spreadsheetId');
  if (firstSheet?.sheetId == null) throw new Error('Sheets API did not return a sheetId for the first tab');

  console.log('[sheets] created', { spreadsheetId, sheetId: firstSheet.sheetId });

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

  // The sheet is already owned by the OAuth user (Adit). Skip sharing when the
  // batch is for Adit himself — Google errors on "share with yourself".
  if (input.userEmail.toLowerCase() !== OWNER_EMAIL.toLowerCase()) {
    console.log('[sheets] sharing with user', { userEmail: input.userEmail });
    await drive.permissions.create({
      fileId: spreadsheetId,
      requestBody: {
        role: 'writer',
        type: 'user',
        emailAddress: input.userEmail,
      },
      sendNotificationEmail: false,
    });
  } else {
    console.log('[sheets] skipping share — recipient is owner');
  }

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
