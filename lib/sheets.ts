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
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const drive = google.drive({ version: 'v3', auth });

  const today = new Date().toISOString().slice(0, 10);
  const title = `${input.userName} - ${today} - Batch`;

  const created = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title },
      sheets: [{ properties: { title: 'Batch' } }],
    },
  });
  const spreadsheetId = created.data.spreadsheetId;
  if (!spreadsheetId) throw new Error('Sheets API did not return a spreadsheetId');

  const values = [
    ['Company', 'Full Name', 'Email', 'First Name'],
    ...input.rows.map((r) => [r.company, r.fullName, r.email, r.firstName]),
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'Batch!A1',
    valueInputOption: 'RAW',
    requestBody: { values },
  });

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1 },
            cell: { userEnteredFormat: { textFormat: { bold: true } } },
            fields: 'userEnteredFormat.textFormat.bold',
          },
        },
        {
          updateSheetProperties: {
            properties: { sheetId: 0, gridProperties: { frozenRowCount: 1 } },
            fields: 'gridProperties.frozenRowCount',
          },
        },
      ],
    },
  });

  await drive.permissions.create({
    fileId: spreadsheetId,
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
