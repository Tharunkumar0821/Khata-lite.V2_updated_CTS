import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';

// Backup and restore as a real .json file, rather than a wall of text the
// user has to copy out of a box and keep somewhere safe themselves.
//
// Save  -> writes <business>-khata-backup-<date>.json into the cache and hands
//          it to the Android share sheet (Drive, WhatsApp, Files, email...).
// Load  -> opens the system file picker, reads the chosen file and parses it.
//
// Both use the current expo-file-system API (File / Paths) — the same one
// src/bills.js uses — so there is only one filesystem API in the project.

const stamp = () => new Date().toISOString().slice(0, 10);

const safe = (s) =>
  String(s || 'khata')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'khata';

export function backupFileName(businessName) {
  return `${safe(businessName)}-khata-backup-${stamp()}.json`;
}

// Writes the backup and opens the share sheet.
// Returns { ok: true, name } or { ok: false, reason }.
export async function saveBackupFile(db, businessName) {
  let file;
  try {
    file = new File(Paths.cache, backupFileName(businessName));

    // create() throws if the path already exists, so clear a same-day file
    // from an earlier save in this session first.
    try {
      if (file.exists) file.delete();
    } catch (e) {}

    file.create();
    file.write(JSON.stringify(db, null, 2));
  } catch (e) {
    return { ok: false, reason: 'write', message: e && e.message ? e.message : String(e) };
  }

  try {
    if (!(await Sharing.isAvailableAsync())) {
      return { ok: false, reason: 'no-sharing' };
    }
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      dialogTitle: 'Save Khata backup',
      UTI: 'public.json',
    });
    return { ok: true, name: file.name };
  } catch (e) {
    return { ok: false, reason: 'share', message: e && e.message ? e.message : String(e) };
  }
}

// Opens the system file picker and returns the parsed backup.
// Returns { ok: true, data, name }, { ok: false, reason: 'cancelled' }, or
// { ok: false, reason: 'parse' | 'read' | 'empty' }.
export async function loadBackupFile() {
  let asset;
  try {
    const result = await DocumentPicker.getDocumentAsync({
      // Some Android file providers hand back octet-stream for .json, so
      // accept both rather than greying out the user's own backup.
      type: ['application/json', 'application/octet-stream', 'text/plain'],
      multiple: false,
      // Required: without this the file may not be readable straight away.
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets || !result.assets.length) {
      return { ok: false, reason: 'cancelled' };
    }
    asset = result.assets[0];
  } catch (e) {
    return { ok: false, reason: 'picker', message: e && e.message ? e.message : String(e) };
  }

  let text;
  try {
    const file = new File(asset.uri);
    text = typeof file.textSync === 'function' ? file.textSync() : await file.text();
  } catch (e) {
    return { ok: false, reason: 'read', message: e && e.message ? e.message : String(e) };
  }

  if (!text || !text.trim()) return { ok: false, reason: 'empty' };

  try {
    return { ok: true, data: JSON.parse(text), name: asset.name || 'backup.json' };
  } catch (e) {
    return { ok: false, reason: 'parse' };
  }
}

// Plain-English message for a failed save or load, so the UI never has to
// show a raw exception.
export function backupErrorText(result) {
  switch (result && result.reason) {
    case 'write':
      return 'Could not create the backup file. Free up some storage and try again.';
    case 'no-sharing':
      return 'This device cannot open the share sheet, so the file cannot be handed off.';
    case 'share':
      return 'The backup was created but the share sheet did not open. Try again.';
    case 'picker':
      return 'Could not open the file picker.';
    case 'read':
      return 'That file could not be read. Try copying it to this phone first, then pick it again.';
    case 'empty':
      return 'That file is empty.';
    case 'parse':
      return 'That file is not a Khata backup — it is not valid JSON.';
    default:
      return 'Something went wrong. Please try again.';
  }
}
