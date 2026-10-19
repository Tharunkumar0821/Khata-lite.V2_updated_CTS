import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Sharing from 'expo-sharing';
import Share from 'react-native-share';
import { File, Directory, Paths } from 'expo-file-system';
// The legacy API's base64 read/write is already proven working in this
// project (src/excel.js uses it the same way), so bill-photo backup reuses
// it rather than guessing at the newer File class's base64 method names.
import * as FileSystemLegacy from 'expo-file-system/legacy';

// Bill photos are copied into the app's own storage so they survive
// the camera/cache being cleaned. Entries store only the file NAME.
function billsDir() {
  const d = new Directory(Paths.document, 'bills');
  try { if (!d.exists) d.create({ intermediates: true, idempotent: true }); } catch (e) {}
  return d;
}

export function billUri(name) {
  if (!name) return null;
  try { return new File(billsDir(), name).uri; } catch (e) { return null; }
}

function saveAsset(asset) {
  const raw = (asset.uri.split('?')[0].split('.').pop() || 'jpg').toLowerCase();
  const ext = /^[a-z0-9]{2,4}$/.test(raw) ? raw : 'jpg';
  const name = `bill_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}.${ext}`;
  new File(asset.uri).copy(new File(billsDir(), name));
  return name;
}

// source: 'camera' | 'gallery'. Returns the saved file name, or null if cancelled.
export async function pickBill(source) {
  try {
    let res;
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Camera permission needed', 'Allow camera access in your phone settings to photograph bills.');
        return null;
      }
      res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 });
    } else {
      res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
    }
    if (res.canceled || !res.assets || !res.assets.length) return null;
    return saveAsset(res.assets[0]);
  } catch (e) {
    Alert.alert('Could not add photo', 'Something went wrong while saving the image. Please try again.');
    return null;
  }
}

export function deleteBill(name) {
  if (!name) return;
  try { new File(billsDir(), name).delete(); } catch (e) {}
}

// True only if this bill's file is actually present on THIS phone. Bill
// photos live only on the device that took them — they are not in backups
// and are not synced — so a restored or second phone can have an entry that
// references a file it never received.
export function billExists(name) {
  if (!name) return false;
  try { return !!new File(billsDir(), name).exists; } catch (e) { return false; }
}

// Rotates a bill photo 90° clockwise, in place (same file name, so nothing
// else in the app — the entry, any pending backup, EXIF-adjacent metadata —
// needs to change). Returns true on success.
export async function rotateBill(name) {
  const uri = billUri(name);
  if (!uri) return false;
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri, [{ rotate: 90 }], { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
    );
    const dest = new File(billsDir(), name);
    try { if (dest.exists) dest.delete(); } catch (e) {}
    new File(result.uri).copy(dest);
    return true;
  } catch (e) {
    Alert.alert('Could not rotate', 'Something went wrong while rotating this photo. Please try again.');
    return false;
  }
}

// Deletes every file in a bills array. Safe to call with [], null, or undefined.
export function deleteBills(names) {
  (names || []).forEach(deleteBill);
}

// --- Including bill photos in a backup file -------------------------------
//
// A backup is one .json file. Photos go in as base64 text under their own
// file name, so the same file that holds the data can also hold the images,
// with no separate zip step. This only covers photos currently on THIS
// phone — an entry whose photo was never received here (restored from a
// photo-less backup, or synced from another phone) has nothing to collect.

// Every distinct bill photo file name referenced anywhere in `db` (every
// business, every entry), with no duplicates.
export function collectBillNames(db) {
  const set = new Set();
  (db && db.txns ? db.txns : []).forEach((t) => (t.bills || []).forEach((n) => { if (n) set.add(n); }));
  return Array.from(set);
}

// Reads every bill photo that exists on this phone as base64 text, keyed by
// file name. Missing photos are simply left out of the result.
export async function readBillsAsBase64(names) {
  const out = {};
  for (const name of names) {
    if (!billExists(name)) continue;
    try {
      out[name] = await FileSystemLegacy.readAsStringAsync(
        billUri(name), { encoding: FileSystemLegacy.EncodingType.Base64 }
      );
    } catch (e) {
      // Skip this one photo rather than fail the whole backup.
    }
  }
  return out;
}

// Writes one base64 photo into the bills folder during a restore, unless a
// file with that name is already there (never overwrite something this
// phone already has).
async function writeBillBase64(name, base64) {
  if (!name || !base64) return;
  try {
    const dest = new File(billsDir(), name);
    if (dest.exists) return;
    await FileSystemLegacy.writeAsStringAsync(
      dest.uri, base64, { encoding: FileSystemLegacy.EncodingType.Base64 }
    );
  } catch (e) {
    // Best-effort: the entry's data still restores correctly either way,
    // just without this one photo.
  }
}

// Restores every photo in a { fileName: base64 } map. Fire-and-forget —
// does not block whatever called it, the same way the sync functions in
// src/sync.js don't block on their network writes.
export function writeAllBillPhotos(photos) {
  if (!photos) return;
  Object.keys(photos).forEach((name) => { writeBillBase64(name, photos[name]); });
}

// Opens the Android share sheet with the image. Choose WhatsApp, then the contact.
export async function shareBill(name) {
  const uri = billUri(name);
  if (!uri) { Alert.alert('Bill not found', 'This image file is missing from the phone.'); return; }
  try {
    if (!(await Sharing.isAvailableAsync())) { Alert.alert('Sharing not available on this device'); return; }
    const png = /\.png$/i.test(name);
    await Sharing.shareAsync(uri, { mimeType: png ? 'image/png' : 'image/jpeg', dialogTitle: 'Send bill' });
  } catch (e) {
    Alert.alert('Could not share', 'The share sheet failed to open. Please try again.');
  }
}

// Sends a caption and (optionally) one or more images straight into WhatsApp.
// If `phone` is a 10-digit number, it opens that contact's chat directly
// with no picker — but WhatsApp's direct-send only accepts ONE image that
// way, so if several bills are attached, only the first goes along (the
// caption still lists how many bills exist, added by the caller).
// If there's no phone (or whatsappOnly / no direct number), the normal
// share sheet opens and ALL bill photos are attached together.
export async function sendToWhatsApp({ phone, message, billName, billNames, whatsappOnly }) {
  const names = billNames && billNames.length ? billNames : billName ? [billName] : [];
  const uris = names.map(billUri).filter(Boolean);
  const digits = (phone || '').replace(/\D/g, '');
  const whatsAppNumber = digits.length === 10 ? '91' + digits : digits.length === 12 ? digits : undefined;

  try {
    if (whatsAppNumber) {
      await Share.shareSingle({
        social: Share.Social.WHATSAPP,
        whatsAppNumber,
        message: message || '',
        url: uris[0] || undefined,
      });
      return true;
    }
    if (whatsappOnly) {
      await Share.shareSingle({ social: Share.Social.WHATSAPP, message: message || '', url: uris[0] || undefined, urls: uris.length > 1 ? uris : undefined });
    } else {
      await Share.open({ message: message || '', url: uris.length <= 1 ? uris[0] : undefined, urls: uris.length > 1 ? uris : undefined, failOnCancel: false });
    }
    return true;
  } catch (e) {
    if (e && (e.message === 'User did not share' || /cancel/i.test(String(e.message)))) return false;
    // WhatsApp not installed, or the native share module isn't available in this build.
    if (uris[0]) {
      try { await Sharing.shareAsync(uris[0], { dialogTitle: 'Send bill' }); return true; } catch (e2) {}
    }
    Alert.alert('Could not share', whatsAppNumber
      ? 'Make sure WhatsApp is installed. If you just added this feature, you need a new build of the app for it to work.'
      : 'Something went wrong opening the share sheet.');
    return false;
  }
}

