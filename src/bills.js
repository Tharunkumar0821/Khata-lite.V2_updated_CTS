import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import Share from 'react-native-share';
import { File, Directory, Paths } from 'expo-file-system';

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

// Deletes every file in a bills array. Safe to call with [], null, or undefined.
export function deleteBills(names) {
  (names || []).forEach(deleteBill);
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

