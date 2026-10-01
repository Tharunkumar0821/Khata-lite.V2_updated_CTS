import { Alert, Linking, Platform } from 'react-native';
// IMPORTANT: this must be imported from 'expo-contacts/legacy', not from
// 'expo-contacts'.
//
// In SDK 57 the root export was reworked into a class-based API and the old
// `Contacts.presentContactPickerAsync()` is deprecated there — calling it
// THROWS at runtime, which is exactly why "Pick from contacts" was failing
// with the generic error alert.
//
// The documented replacement, `Contact.presentPicker()`, is not usable yet
// either: on Android 14+ with SDK 57/58 it launches the photo/video picker
// instead of the contact picker (expo/expo#50081 — the new intent omits the
// contacts MIME type). The legacy entry point builds the correct intent, so
// that is what we use until the fix ships.
import * as Contacts from 'expo-contacts/legacy';

// Pull the most sensible number off a contact. Android often returns several
// (mobile, home, work); a mobile number is what WhatsApp and calls want.
function bestPhone(contact) {
  const numbers = contact.phoneNumbers || [];
  if (!numbers.length) return '';
  const score = (entry) => {
    const label = String(entry.label || '').toLowerCase();
    if (entry.isPrimary) return 0;
    if (label.includes('mobile') || label.includes('cell')) return 1;
    if (label.includes('main')) return 2;
    if (label.includes('home')) return 3;
    return 4;
  };
  const picked = numbers.slice().sort((a, b) => score(a) - score(b))[0];
  return String(picked.number || picked.digits || '').replace(/\D/g, '');
}

function bestName(contact) {
  if (contact.name && contact.name.trim()) return contact.name.trim();
  return [contact.firstName, contact.middleName, contact.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();
}

// Opens the phone's own contact picker. Returns { name, phone }, or null if
// the user cancelled, denied permission, or the contact had nothing usable.
export async function pickContact() {
  try {
    // Android genuinely requires READ_CONTACTS for this picker — an earlier
    // comment in this file claimed otherwise, which is why the permission was
    // never requested and the call failed on a real device.
    if (Platform.OS === 'android') {
      const current = await Contacts.getPermissionsAsync();
      let granted = current.granted;

      if (!granted && current.canAskAgain) {
        const asked = await Contacts.requestPermissionsAsync();
        granted = asked.granted;
      }

      if (!granted) {
        Alert.alert(
          'Contacts access needed',
          'Khata needs permission to read contacts so it can fill in a name and number for you. You can still type them in by hand.',
          [
            { text: 'Type it instead', style: 'cancel' },
            { text: 'Open settings', onPress: () => Linking.openSettings().catch(() => {}) },
          ]
        );
        return null;
      }
    }

    const contact = await Contacts.presentContactPickerAsync();
    if (!contact) return null; // cancelled

    const name = bestName(contact);
    const phone = bestPhone(contact);

    if (!name && !phone) {
      Alert.alert('Nothing to import', 'That contact has no name or phone number saved.');
      return null;
    }
    return { name, phone };
  } catch (e) {
    Alert.alert(
      'Could not open contacts',
      'The contact picker did not open. Type the name and number in by hand, and let me know if it keeps happening.'
    );
    return null;
  }
}
