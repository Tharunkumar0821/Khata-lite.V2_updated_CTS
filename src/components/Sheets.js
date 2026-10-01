import React, { useRef, useState } from 'react';
import { View, Text, Share, Image, Pressable, Modal, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Sheet, Field, Seg, Btn, ErrorText, Chip, Note, SectionLabel, toast } from './ui';
import { useTheme, space, radius, type as T, elevate } from '../theme';
import DateTimePicker from '@react-native-community/datetimepicker';
import { todayStr, daysAgoStr, dateStr, fdate } from '../utils';
import { billUri, pickBill, deleteBill, sendToWhatsApp } from '../bills';
import { pickContact } from '../contacts';
import { saveBackupFile, loadBackupFile, backupErrorText } from '../backup';

// A tappable settings row: icon, label, hint, chevron.
function Row({ label, hint, icon, onPress, tone = 'normal', last }) {
  const c = useTheme();
  const fg = tone === 'danger' ? c.red : c.text;
  return (
    <Pressable
      onPress={onPress} accessibilityRole="button" android_ripple={{ color: c.lineSoft }}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: space.md,
        paddingVertical: space.md + 1, paddingHorizontal: space.md,
        backgroundColor: pressed ? c.surface : 'transparent',
        borderBottomWidth: last ? 0 : 1, borderBottomColor: c.lineSoft,
      })}>
      {icon ? <Text style={{ fontSize: 16, width: 24, textAlign: 'center' }}>{icon}</Text> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ ...T.body, fontWeight: '600', color: fg }}>{label}</Text>
        {hint ? <Text style={{ ...T.caption, color: c.muted, marginTop: 1 }}>{hint}</Text> : null}
      </View>
      <Text style={{ color: c.faint, fontSize: 16 }}>{'\u203A'}</Text>
    </Pressable>
  );
}

function Group({ children }) {
  const c = useTheme();
  return (
    <View style={{
      backgroundColor: c.surfaceAlt, borderRadius: radius.md, borderWidth: 1,
      borderColor: c.lineSoft, overflow: 'hidden', marginBottom: space.lg,
    }}>
      {children}
    </View>
  );
}

export function PartySheet({ party, defaultType, onSave, onDelete, onClose }) {
  const [type, setType] = useState(party ? party.type : defaultType);
  const [name, setName] = useState(party ? party.name : '');
  const [phone, setPhone] = useState(party ? party.phone : '');
  const [err, setErr] = useState('');
  const [picking, setPicking] = useState(false);

  const fromContacts = async () => {
    setPicking(true);
    try {
      const picked = await pickContact();
      if (picked) {
        if (picked.name) setName(picked.name);
        if (picked.phone) setPhone(picked.phone);
        setErr('');
      }
    } finally {
      setPicking(false);
    }
  };

  const save = () => {
    if (!name.trim()) { setErr('Enter a name to save this party.'); return; }
    let digits = phone.replace(/\D/g, '');
    if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
    if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
    if (digits && !/^[6-9]\d{9}$/.test(digits)) {
      setErr('Enter a valid 10-digit mobile number, or leave it empty.');
      return;
    }
    onSave({ name: name.trim(), phone: digits, type });
  };

  return (
    <Sheet
      title={party ? 'Edit party' : `Add ${type === 'customer' ? 'customer' : 'supplier'}`}
      subtitle={party ? null : 'A phone number lets you send statements and reminders on WhatsApp.'}
      onClose={onClose}>
      <Seg
        value={type} onChange={setType}
        options={[{ value: 'customer', label: 'Customer' }, { value: 'supplier', label: 'Supplier' }]}
      />
      {!party ? (
        <Btn
          kind="ghost" icon={'\uD83D\uDC64'} busy={picking}
          label={picking ? 'Opening contacts' : 'Pick from contacts'}
          onPress={fromContacts} style={{ marginBottom: space.md }}
        />
      ) : null}
      <Field label="Name" value={name} onChangeText={setName} maxLength={60} autoFocus={!party} autoCapitalize="words" placeholder="e.g. Ramesh Kirana Store" />
      <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={16} placeholder="10-digit mobile" hint="Optional" />
      <ErrorText>{err}</ErrorText>
      <View style={{ flexDirection: 'row', gap: space.sm + 2 }}>
        {party
          ? <Btn kind="danger" label="Delete" onPress={onDelete} style={{ flex: 1 }} />
          : <Btn kind="ghost" label="Cancel" onPress={onClose} style={{ flex: 1 }} />}
        <Btn label="Save" onPress={save} style={{ flex: 1.3 }} />
      </View>
    </Sheet>
  );
}

export function EntrySheet({ entry, defaultType, partyType, onSave, onDelete, onClose }) {
  const [type, setType] = useState(entry ? entry.type : defaultType);
  const [amount, setAmount] = useState(entry ? String(entry.amount) : '');
  const [note, setNote] = useState(entry ? entry.note : '');
  const [billNo, setBillNo] = useState(entry ? entry.billNo || '' : '');
  const [invoiceNo, setInvoiceNo] = useState(entry ? entry.invoiceNo || '' : '');
  const [date, setDate] = useState(entry ? entry.date : todayStr());
  const [showPicker, setShowPicker] = useState(false);
  const [bills, setBills] = useState(entry ? entry.bills || [] : []);
  const [err, setErr] = useState('');
  const added = useRef([]); // photos picked in this session, for cleanup on cancel
  const c = useTheme();

  const addPhoto = async (source) => {
    const name = await pickBill(source);
    if (!name) return;
    added.current.push(name);
    setBills((b) => [...b, name]);
  };
  const removePhoto = (name) => {
    if (added.current.includes(name)) {
      deleteBill(name);
      added.current = added.current.filter((n) => n !== name);
    }
    setBills((b) => b.filter((n) => n !== name));
  };
  const cancel = () => {
    added.current.forEach((n) => { if (!entry || !(entry.bills || []).includes(n)) deleteBill(n); });
    onClose();
  };
  const save = () => {
    const amt = parseFloat(amount.replace(/,/g, ''));
    if (!(amt > 0)) { setErr('Enter an amount greater than 0.'); return; }
    added.current.filter((n) => !bills.includes(n)).forEach(deleteBill);
    if (entry) (entry.bills || []).filter((n) => !bills.includes(n)).forEach(deleteBill);
    onSave({
      type, amount: Math.round(amt * 100) / 100, note: note.trim(), date, bills,
      billNo: billNo.trim(), invoiceNo: invoiceNo.trim(),
    });
  };

  const isToday = date === todayStr();
  const isYesterday = date === daysAgoStr(1);

  return (
    <Sheet title={entry ? 'Edit entry' : type === 'gave' ? 'You gave' : 'You got'} onClose={cancel}>
      <Seg
        value={type} onChange={setType}
        options={[{ value: 'gave', label: 'You gave' }, { value: 'got', label: 'You got' }]}
      />

      <View style={{
        borderWidth: 1.5, borderColor: type === 'gave' ? c.red : c.green,
        backgroundColor: type === 'gave' ? c.redBg : c.greenBg,
        borderRadius: radius.md, paddingHorizontal: space.md, paddingTop: space.sm,
        marginBottom: space.md,
      }}>
        <Text style={{ ...T.caption, color: type === 'gave' ? c.red : c.green, fontWeight: '700' }}>Amount</Text>
        <Field
          value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" autoFocus
          style={{
            ...T.amount, color: c.text, borderWidth: 0, backgroundColor: 'transparent',
            paddingHorizontal: 0, paddingVertical: 2,
          }}
        />
      </View>

      <Field label="Note" value={note} onChangeText={setNote} maxLength={80} placeholder="e.g. Rice 10 kg, advance" hint="Optional" />

      {partyType === 'supplier' ? (
        <View style={{ flexDirection: 'row', gap: space.sm + 2 }}>
          <View style={{ flex: 1 }}>
            <Field label="Bill no." value={billNo} onChangeText={setBillNo} maxLength={30} autoCapitalize="characters" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Invoice no." value={invoiceNo} onChangeText={setInvoiceNo} maxLength={30} autoCapitalize="characters" />
          </View>
        </View>
      ) : null}

      <SectionLabel>Date</SectionLabel>
      <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.md }}>
        <Chip label="Today" selected={isToday} onPress={() => setDate(todayStr())} />
        <Chip label="Yesterday" selected={isYesterday} onPress={() => setDate(daysAgoStr(1))} />
        <Pressable
          onPress={() => setShowPicker(true)} accessibilityRole="button"
          style={{
            flex: 1, borderWidth: 1,
            borderColor: !isToday && !isYesterday ? c.brand : c.line,
            backgroundColor: !isToday && !isYesterday ? c.brandSoft : c.surface,
            borderRadius: radius.pill, paddingHorizontal: space.md,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs + 2,
          }}>
          <Text style={{ fontSize: 13 }}>{'\uD83D\uDCC5'}</Text>
          <Text numberOfLines={1} style={{ ...T.label, color: c.text }}>
            {!isToday && !isYesterday ? fdate(date) : 'Pick'}
          </Text>
        </Pressable>
      </View>
      {showPicker ? (
        <DateTimePicker
          value={new Date(date + 'T00:00:00')} mode="date" display="calendar" maximumDate={new Date()}
          onChange={(event, selected) => {
            setShowPicker(false);
            if (event.type === 'set' && selected) setDate(dateStr(selected));
          }}
        />
      ) : null}

      <SectionLabel>{bills.length ? `Bill photos \u00B7 ${bills.length}` : 'Bill photos'}</SectionLabel>
      {bills.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm + 2, marginBottom: space.md }}>
          {bills.map((name) => (
            <View key={name} style={{ width: 78 }}>
              <Image
                source={{ uri: billUri(name) }}
                style={{ width: 78, height: 78, borderRadius: radius.md, backgroundColor: c.lineSoft }}
              />
              <Pressable onPress={() => removePhoto(name)} hitSlop={6} style={{ marginTop: space.xs, alignItems: 'center' }}>
                <Text style={{ ...T.caption, color: c.red, fontWeight: '700' }}>Remove</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', gap: space.sm + 2, marginBottom: space.md }}>
        <Btn kind="ghost" size="sm" icon={'\uD83D\uDCF7'} label="Camera" onPress={() => addPhoto('camera')} style={{ flex: 1 }} />
        <Btn kind="ghost" size="sm" icon={'\uD83D\uDDBC\uFE0F'} label="Gallery" onPress={() => addPhoto('gallery')} style={{ flex: 1 }} />
      </View>

      <ErrorText>{err}</ErrorText>
      <View style={{ flexDirection: 'row', gap: space.sm + 2 }}>
        {entry
          ? <Btn kind="danger" label="Delete" onPress={onDelete} style={{ flex: 1 }} />
          : <Btn kind="ghost" label="Cancel" onPress={cancel} style={{ flex: 1 }} />}
        <Btn kind={type === 'gave' ? 'red' : 'green'} label="Save entry" onPress={save} style={{ flex: 1.3 }} />
      </View>
    </Sheet>
  );
}

export function BillViewer({ bills, partyName, partyPhone, amountText, onClose }) {
  const insets = useSafeAreaInsets();
  const list = bills || [];
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState({});
  const uri = billUri(list[index]);
  const missing = !uri || !!failed[list[index]];

  const send = () => sendToWhatsApp({
    phone: partyPhone,
    message: amountText,
    billNames: partyPhone ? [list[index]] : list,
    whatsappOnly: true,
  });

  const Arrow = ({ label, onPress }) => (
    <Pressable onPress={onPress} hitSlop={10} style={{ paddingHorizontal: space.md, paddingVertical: space.xl }}>
      <Text style={{ color: '#fff', fontSize: 28, opacity: 0.85 }}>{label}</Text>
    </Pressable>
  );

  return (
    <Modal animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={{ flex: 1, backgroundColor: '#07090d', paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <View style={{ paddingHorizontal: space.lg, paddingVertical: space.md }}>
          <Text numberOfLines={1} style={{ ...T.body, fontWeight: '700', color: '#fff' }}>{partyName}</Text>
          <Text style={{ ...T.caption, color: '#b9c2d2', marginTop: 1 }}>{amountText}</Text>
          {list.length > 1 ? (
            <Text style={{ ...T.caption, color: '#7f8ca3', marginTop: 2 }}>Photo {index + 1} of {list.length}</Text>
          ) : null}
        </View>

        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
          {list.length > 1 ? <Arrow label={'\u2039'} onPress={() => setIndex((i) => (i - 1 + list.length) % list.length)} /> : null}
          <View style={{ flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center' }}>
            {missing ? (
              <View style={{ paddingHorizontal: space.xl }}>
                <Text style={{ ...T.body, fontWeight: '700', color: '#fff', textAlign: 'center' }}>
                  Photo not on this phone
                </Text>
                <Text style={{ ...T.caption, color: '#b9c2d2', textAlign: 'center', marginTop: space.sm, lineHeight: 18 }}>
                  Bill photos stay on the phone that took them. They are not inside backups and are not synced, so the
                  photo is missing after a restore or on a second phone.
                </Text>
              </View>
            ) : (
              <Image
                source={{ uri }} resizeMode="contain" style={{ flex: 1, width: '100%' }}
                onError={() => setFailed((f) => ({ ...f, [list[index]]: true }))}
              />
            )}
          </View>
          {list.length > 1 ? <Arrow label={'\u203A'} onPress={() => setIndex((i) => (i + 1) % list.length)} /> : null}
        </View>

        <Text style={{ ...T.caption, color: '#8d99ae', textAlign: 'center', paddingHorizontal: space.lg, paddingTop: space.sm }}>
          {partyPhone
            ? `Sends straight to ${partyName}'s WhatsApp.`
            : `Tap Send, then pick ${partyName || 'the contact'} in the share sheet.`}
        </Text>
        <View style={{ flexDirection: 'row', gap: space.sm + 2, padding: space.lg }}>
          <Btn kind="ghost" label="Close" onPress={onClose} style={{ flex: 1 }} />
          <Btn kind="green" icon={'\uD83D\uDCAC'} label="Send bill" onPress={send} disabled={missing} style={{ flex: 1.3 }} />
        </View>
      </View>
    </Modal>
  );
}

export function BusinessSheet({ businesses, activeId, onSwitch, onAdd, onRename, onDelete, onClose }) {
  const c = useTheme();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');

  return (
    <Sheet
      title="Businesses"
      subtitle="Each business keeps its own parties, entries and totals."
      onClose={onClose}>
      {businesses.map((b) => (
        <View key={b.id} style={{ marginBottom: space.sm + 2 }}>
          {editingId === b.id ? (
            <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Field label="Business name" value={editName} onChangeText={setEditName} autoFocus maxLength={40} />
              </View>
              <Btn
                label="Save" size="sm"
                onPress={() => { if (editName.trim()) onRename(b.id, editName.trim()); setEditingId(null); }}
                style={{ marginTop: 24 }}
              />
            </View>
          ) : (
            <Pressable
              onPress={() => onSwitch(b.id)} android_ripple={{ color: c.lineSoft }}
              style={({ pressed }) => [{
                flexDirection: 'row', alignItems: 'center', gap: space.md,
                paddingVertical: space.md, paddingHorizontal: space.md, borderRadius: radius.md,
                borderWidth: b.id === activeId ? 1.6 : 1,
                borderColor: b.id === activeId ? c.brand : c.lineSoft,
                backgroundColor: pressed ? c.surfaceAlt : b.id === activeId ? c.brandSoft : c.surface,
              }, b.id === activeId ? elevate(c, 1) : null]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ ...T.body, fontWeight: b.id === activeId ? '700' : '600', color: c.text }}>
                  {b.name}
                </Text>
                {b.id === activeId ? (
                  <Text style={{ ...T.caption, color: c.brand, marginTop: 1, fontWeight: '600' }}>Open now</Text>
                ) : null}
              </View>
              <Pressable
                onPress={() => { setEditingId(b.id); setEditName(b.name); }} hitSlop={10}
                accessibilityLabel={'Rename ' + b.name}>
                <Text style={{ color: c.muted, fontSize: 16 }}>{'\u270E'}</Text>
              </Pressable>
              {businesses.length > 1 ? (
                <Pressable onPress={() => onDelete(b.id, b.name)} hitSlop={10} accessibilityLabel={'Delete ' + b.name}>
                  <Text style={{ color: c.red, fontSize: 16 }}>{'\uD83D\uDDD1'}</Text>
                </Pressable>
              ) : null}
            </Pressable>
          )}
        </View>
      ))}

      {adding ? (
        <View style={{ marginTop: space.sm }}>
          <Field label="Business name" value={newName} onChangeText={setNewName} autoFocus maxLength={40} placeholder="e.g. Shebagam Electricals" />
          <View style={{ flexDirection: 'row', gap: space.sm + 2, marginBottom: space.xs }}>
            <Btn kind="ghost" label="Cancel" onPress={() => { setAdding(false); setNewName(''); }} style={{ flex: 1 }} />
            <Btn
              label="Create" disabled={!newName.trim()}
              onPress={() => { if (newName.trim()) { onAdd(newName.trim()); setAdding(false); setNewName(''); } }}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      ) : (
        <Btn kind="ghost" icon={'\uFF0B'} label="Add business" onPress={() => setAdding(true)} style={{ marginTop: space.xs, marginBottom: space.md }} />
      )}
      <Btn label="Done" onPress={onClose} />
    </Sheet>
  );
}

export function SettingsSheet({ theme, onTheme, onBusinesses, onSync, onExport, onBackup, onWipe, onClose, syncOn, businessName }) {
  return (
    <Sheet title="Settings" onClose={onClose}>
      <SectionLabel>Appearance</SectionLabel>
      <Seg
        value={theme} onChange={onTheme}
        options={[{ value: '', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]}
      />

      <SectionLabel>Data</SectionLabel>
      <Group>
        <Row icon={'\uD83C\uDFEA'} label="Businesses" hint="Switch, rename, add or remove" onPress={onBusinesses} />
        <Row icon={'\uD83D\uDD04'} label="Multi-device sync" hint={syncOn ? 'On for this phone' : 'Off'} onPress={onSync} />
        <Row icon={'\uD83D\uDCCA'} label="Export to Excel" hint="Parties and entries as .xlsx" onPress={onExport} />
        <Row icon={'\uD83D\uDCBE'} label="Backup and restore" hint="Save or load a .json file" onPress={onBackup} last />
      </Group>

      <SectionLabel>Careful</SectionLabel>
      <Group>
        <Row
          icon={'\uD83D\uDDD1'} tone="danger" label={`Erase ${businessName || 'this business'}'s data`}
          hint="Removes every party and entry here" onPress={onWipe} last
        />
      </Group>

      <Btn label="Done" onPress={onClose} />
    </Sheet>
  );
}

export function SyncSheet({ syncCode, onCreate, onJoin, onDisable, onClose }) {
  const c = useTheme();
  const [mode, setMode] = useState('choose'); // 'choose' | 'join'
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const run = async (fn) => {
    setBusy(true); setErr('');
    try { await fn(); } catch (e) {
      if (e && e.message !== 'cancelled') setErr(e.message || 'Something went wrong.');
    }
    setBusy(false);
  };

  if (syncCode) {
    return (
      <Sheet
        title="Multi-device sync"
        subtitle="This phone is syncing. Changes here show up on the other phone within a second or two."
        onClose={onClose}>
        <Note>
          On your other phone, open Settings, then Multi-device sync, then "I have a code from another phone", and enter
          this code.
        </Note>
        <View style={[{
          backgroundColor: c.brandSoft, borderWidth: 1, borderColor: c.brand,
          borderRadius: radius.md, paddingVertical: space.xl, alignItems: 'center', marginBottom: space.lg,
        }, elevate(c, 1)]}>
          <Text style={{ fontSize: 32, fontWeight: '800', letterSpacing: 7, color: c.text }}>{syncCode}</Text>
          <Pressable
            onPress={() => Share.share({ message: `Khata sync code: ${syncCode}` }).catch(() => {})}
            hitSlop={8} style={{ marginTop: space.sm }}>
            <Text style={{ ...T.caption, color: c.brand, fontWeight: '700' }}>Share this code</Text>
          </Pressable>
        </View>
        <ErrorText>{err}</ErrorText>
        <Btn kind="danger" busy={busy} label="Turn off sync on this phone" onPress={() => run(onDisable)} style={{ marginBottom: space.sm + 2 }} />
        <Btn kind="ghost" label="Done" onPress={onClose} />
      </Sheet>
    );
  }

  return (
    <Sheet
      title="Multi-device sync"
      subtitle="Keep the same data on two or more phones. Needs an internet connection."
      onClose={onClose}>
      {mode === 'choose' ? (
        <>
          <Note>Bill photos are not synced — only parties, entries and businesses.</Note>
          <Btn busy={busy} label="Turn on sync (first phone)" onPress={() => run(onCreate)} style={{ marginBottom: space.sm + 2 }} />
          <Btn kind="ghost" label="I have a code from another phone" onPress={() => { setMode('join'); setErr(''); }} style={{ marginBottom: space.sm + 2 }} />
          <ErrorText>{err}</ErrorText>
        </>
      ) : (
        <>
          <Note>
            Joining replaces everything on this phone with the data behind that code. Save a backup file first if this
            phone has entries you need.
          </Note>
          <Field
            label="Sync code" value={code} onChangeText={(t) => setCode(t.toUpperCase())}
            autoCapitalize="characters" maxLength={8} autoFocus placeholder="7K3PQR"
            style={{ fontSize: 22, fontWeight: '700', letterSpacing: 4, textAlign: 'center' }}
          />
          <ErrorText>{err}</ErrorText>
          <View style={{ flexDirection: 'row', gap: space.sm + 2, marginBottom: space.sm + 2 }}>
            <Btn kind="ghost" label="Back" onPress={() => { setMode('choose'); setErr(''); }} style={{ flex: 1 }} />
            <Btn
              busy={busy} label="Join" style={{ flex: 1.3 }}
              onPress={() => code.trim() ? run(() => onJoin(code)) : setErr('Enter the code from your other phone.')}
            />
          </View>
        </>
      )}
      <Btn kind="quiet" label="Cancel" onPress={onClose} />
    </Sheet>
  );
}

// Backup and restore as a .json file.
//
// The previous version put the whole database into a TextInput and asked the
// user to copy it out by hand. Now "Save backup file" writes a real .json and
// opens the share sheet (Drive, WhatsApp, Files, email), and "Restore from
// file" opens the system file picker. Pasting text is kept, collapsed, so
// backups taken the old way can still be restored.
export function BackupSheet({ db, businessName, onRestore, onClose }) {
  const c = useTheme();
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const [text, setText] = useState('');

  const doSave = async () => {
    setBusy('save'); setErr('');
    const res = await saveBackupFile(db, businessName);
    setBusy('');
    if (res.ok) toast('Backup file created');
    else setErr(backupErrorText(res));
  };

  const confirmRestore = (data, label) => {
    const n = Array.isArray(data && data.parties) ? data.parties.length : 0;
    Alert.alert(
      'Replace all data?',
      `${label} holds ${n} ${n === 1 ? 'party' : 'parties'}. Restoring replaces every business, party and entry on this phone. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Replace everything',
          style: 'destructive',
          onPress: () => {
            try { onRestore(data); }
            catch (e) { setErr('That backup could not be read. It may be from a different app.'); }
          },
        },
      ]
    );
  };

  const doLoad = async () => {
    setBusy('load'); setErr('');
    const res = await loadBackupFile();
    setBusy('');
    if (res.ok) confirmRestore(res.data, res.name);
    else if (res.reason !== 'cancelled') setErr(backupErrorText(res));
  };

  const doPaste = () => {
    setErr('');
    try { confirmRestore(JSON.parse(text), 'That text'); }
    catch (e) { setErr('That text is not a valid backup.'); }
  };

  const counts = [
    ['Businesses', Array.isArray(db && db.businesses) ? db.businesses.length : 0],
    ['Parties', Array.isArray(db && db.parties) ? db.parties.length : 0],
    ['Entries', Array.isArray(db && db.txns) ? db.txns.length : 0],
  ];

  return (
    <Sheet
      title="Backup and restore"
      subtitle="A backup covers every business on this phone, not just the one you have open."
      onClose={onClose}>
      <View style={{
        flexDirection: 'row', backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.lineSoft,
        borderRadius: radius.md, paddingVertical: space.md, marginBottom: space.lg,
      }}>
        {counts.map(([label, n], i) => (
          <View key={label} style={{
            flex: 1, alignItems: 'center',
            borderLeftWidth: i === 0 ? 0 : 1, borderLeftColor: c.lineSoft,
          }}>
            <Text style={{ ...T.money, color: c.text }}>{n}</Text>
            <Text style={{ ...T.caption, color: c.muted, marginTop: 1 }}>{label}</Text>
          </View>
        ))}
      </View>

      <Btn icon={'\u2193'} busy={busy === 'save'} label="Save backup file" onPress={doSave} style={{ marginBottom: space.sm + 2 }} />
      <Btn kind="ghost" icon={'\u2191'} busy={busy === 'load'} label="Restore from file" onPress={doLoad} style={{ marginBottom: space.md }} />

      <Note>
        Saving writes a .json file and opens the share sheet, so you can keep it in Drive, mail it to yourself, or send
        it on WhatsApp. Bill photos are not inside the file — they stay on this phone.
      </Note>

      <ErrorText>{err}</ErrorText>

      {showPaste ? (
        <View>
          <Field
            label="Paste backup text" value={text} onChangeText={setText} multiline numberOfLines={6}
            placeholder="Paste a backup from an older version here"
            style={{ minHeight: 120, textAlignVertical: 'top', fontFamily: 'monospace', fontSize: 12 }}
          />
          <View style={{ flexDirection: 'row', gap: space.sm + 2, marginBottom: space.md }}>
            <Btn kind="ghost" size="sm" label="Hide" onPress={() => setShowPaste(false)} style={{ flex: 1 }} />
            <Btn size="sm" label="Restore text" disabled={!text.trim()} onPress={doPaste} style={{ flex: 1 }} />
          </View>
        </View>
      ) : (
        <Btn
          kind="quiet" size="sm" label="Restore from pasted text instead"
          onPress={() => setShowPaste(true)} style={{ marginBottom: space.md }}
        />
      )}

      <Btn kind="ghost" label="Done" onPress={onClose} />
    </Sheet>
  );
}
