import React, { useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, TextInput, Linking, Share, Alert, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme, space, radius, type as T, elevate } from '../theme';
import { IconBtn, Avatar, Empty, toast } from '../components/ui';
import { sendToWhatsApp } from '../bills';
import { money, fdate, dateStr, cmpAsc, cmpDesc, balLabel, balColorKey, entryLabel, entryShort } from '../utils';

export default function LedgerScreen({ db, party, onBack, onEditParty, onEntry, onEditEntry, onViewBill }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();

  // Built per render rather than as a module constant: the labels depend on
  // this party's type, which does not exist at module load time.
  const typeOptions = [
    { value: 'all', label: 'All entries' },
    { value: 'gave', label: entryLabel('gave', party.type) },
    { value: 'got', label: entryLabel('got', party.type) },
  ];

  const [startDate, setStartDate] = useState(''); // '' = no lower bound
  const [endDate, setEndDate] = useState('');
  const [showPicker, setShowPicker] = useState(null);
  const [q, setQ] = useState('');
  const [type, setType] = useState('all');
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);

  // Running balance is computed over the FULL history so it stays accurate
  // even while the visible list is filtered or searched.
  const runningById = useMemo(() => {
    const asc = db.txns.filter((t) => t.pid === party.id).sort(cmpAsc);
    let run = 0;
    const m = {};
    asc.forEach((t) => { run += t.type === 'gave' ? t.amount : -t.amount; m[t.id] = Math.round(run * 100) / 100; });
    return m;
  }, [db.txns, party.id]);

  const { rows, totalGave, totalGot, count } = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let gave = 0, got = 0, n = 0;
    const out = db.txns
      .filter((t) => t.pid === party.id)
      .filter((t) => !startDate || t.date >= startDate)
      .filter((t) => !endDate || t.date <= endDate)
      .filter((t) => type === 'all' || t.type === type)
      .filter((t) => !needle
        || (t.note || '').toLowerCase().includes(needle)
        || (t.billNo || '').toLowerCase().includes(needle)
        || (t.invoiceNo || '').toLowerCase().includes(needle)
        || t.date.includes(needle))
      .sort(cmpDesc);
    out.forEach((t) => { n += 1; if (t.type === 'gave') gave += t.amount; else got += t.amount; });
    return { rows: out, totalGave: gave, totalGot: got, count: n };
  }, [db.txns, party.id, startDate, endDate, type, q]);

  // gave - got, matching balanceOf() and the Parties screen: positive means
  // the party owes you. Previously this was shown through money(), which
  // strips the sign, and coloured the opposite way round from every other
  // screen — so a credit balance read as a debt.
  const net = Math.round((totalGave - totalGot) * 100) / 100;
  const filtered = !!(startDate || endDate || q.trim() || type !== 'all');
  const rangeBroken = !!(startDate && endDate && startDate > endDate);

  const open = (url) => Linking.openURL(url).catch(() => Alert.alert('Could not open link', 'No app on this phone can handle it.'));

  const statement = () => {
    const lines = [`Statement: ${party.name} (${db.business})`];
    if (startDate || endDate) {
      lines.push(`Period: ${startDate ? fdate(startDate) : 'start'} to ${endDate ? fdate(endDate) : 'today'}`);
    }
    lines.push('');
    rows.slice().sort(cmpAsc).forEach((t) => {
      const no = t.billNo || t.invoiceNo;
      lines.push(`${fdate(t.date)}  ${entryShort(t.type, party.type)}  ${money(t.amount)}${t.note ? '  ' + t.note : ''}${no ? '  #' + no : ''}`);
    });
    lines.push(
      '',
      `${entryLabel('gave', party.type)}: ${money(totalGave)}`,
      `${entryLabel('got', party.type)}: ${money(totalGot)}`,
      `${balLabel(net)}: ${money(net)}`
    );
    return lines.join('\n');
  };

  const doShare = () => {
    const withBills = rows.find((t) => t.bills && t.bills.length);
    sendToWhatsApp({ phone: party.phone, message: statement(), billNames: withBills ? withBills.bills : [] });
  };
  const doDownload = () => Share.share({ message: statement() }).catch(() => toast('Could not share'));

  const pickDate = (which) => {
    const current = which === 'start' ? startDate : endDate;
    setShowPicker({ which, value: current ? new Date(current + 'T00:00:00') : new Date() });
  };
  const onPickerChange = (event, selected) => {
    const which = showPicker && showPicker.which;
    setShowPicker(null);
    if (event.type !== 'set' || !selected || !which) return;
    const s = dateStr(selected);
    if (which === 'start') setStartDate(s); else setEndDate(s);
  };

  const DateBtn = ({ label, value, onPress, onClear }) => (
    <Pressable onPress={onPress} style={{
      flex: 1, backgroundColor: 'rgba(255,255,255,.14)', borderRadius: radius.md,
      paddingVertical: 10, paddingHorizontal: space.md,
      flexDirection: 'row', alignItems: 'center', gap: space.sm,
    }}>
      <Text style={{ fontSize: 13 }}>{'\uD83D\uDCC5'}</Text>
      <Text numberOfLines={1} style={{ ...T.caption, fontWeight: '700', color: c.brandInk, flex: 1 }}>
        {value ? fdate(value) : label}
      </Text>
      {value ? (
        <Pressable onPress={onClear} hitSlop={10}>
          <Text style={{ color: c.brandInk, opacity: 0.8, fontSize: 13 }}>{'\u2715'}</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );

  const selectedTypeLabel = typeOptions.find((o) => o.value === type).label;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={[{ backgroundColor: c.brand, paddingTop: insets.top + space.sm, paddingBottom: space.md, paddingHorizontal: space.md }, elevate(c, 2)]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.md }}>
          <IconBtn label={'\u2190'} a11y="Back" onPress={onBack} />
          <Avatar name={party.name} size={36} onBrand />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ ...T.body, fontWeight: '700', color: c.brandInk }}>{party.name}</Text>
            <Text numberOfLines={1} style={{ ...T.caption, color: c.brandInk, opacity: 0.7 }}>
              {party.phone ? party.phone : 'No phone saved'}
            </Text>
          </View>
          <IconBtn label={'\u270E'} a11y="Edit party" onPress={onEditParty} />
        </View>

        <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.sm }}>
          <DateBtn label="From" value={startDate} onPress={() => pickDate('start')} onClear={() => setStartDate('')} />
          <DateBtn label="To" value={endDate} onPress={() => pickDate('end')} onClear={() => setEndDate('')} />
        </View>

        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <View style={{
            flex: 1, backgroundColor: 'rgba(255,255,255,.14)', borderRadius: radius.md,
            flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md,
          }}>
            <Text style={{ fontSize: 13, marginRight: space.sm, opacity: 0.8 }}>{'\uD83D\uDD0D'}</Text>
            <TextInput
              value={q} onChangeText={setQ} placeholder="Search notes, bill no."
              placeholderTextColor="rgba(255,255,255,.6)"
              style={{ flex: 1, color: c.brandInk, paddingVertical: 10, fontSize: 14 }}
            />
          </View>
          <Pressable
            onPress={() => setTypeMenuOpen(true)}
            style={{
              backgroundColor: type === 'all' ? 'rgba(255,255,255,.14)' : c.brandInk,
              borderRadius: radius.md, paddingHorizontal: space.md,
              flexDirection: 'row', alignItems: 'center', gap: space.xs + 2,
            }}>
            <Text style={{ ...T.caption, fontWeight: '700', color: type === 'all' ? c.brandInk : c.brand }}>
              {selectedTypeLabel}
            </Text>
            <Text style={{ fontSize: 9, color: type === 'all' ? c.brandInk : c.brand }}>{'\u25BC'}</Text>
          </Pressable>
        </View>
      </View>

      <View style={{ backgroundColor: c.surface, paddingHorizontal: space.lg, paddingVertical: space.lg, borderBottomWidth: 1, borderBottomColor: c.lineSoft }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: space.md }}>
          <View>
            <Text style={{ ...T.caption, color: c.muted }}>{filtered ? 'Balance of shown entries' : 'Balance'}</Text>
            <Text style={{ ...T.label, color: c[balColorKey(net)], marginTop: 2 }}>{balLabel(net)}</Text>
          </View>
          <Text style={{ ...T.amount, color: c[balColorKey(net)] }}>{money(net)}</Text>
        </View>
        <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: c.lineSoft, paddingTop: space.md }}>
          <View style={{ flex: 1 }}>
            <Text style={{ ...T.caption, color: c.muted }}>Entries</Text>
            <Text style={{ ...T.money, color: c.text, marginTop: 1 }}>{count}</Text>
          </View>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Text numberOfLines={1} style={{ ...T.caption, color: c.muted }}>{entryLabel('gave', party.type)}</Text>
            <Text style={{ ...T.money, color: c.red, marginTop: 1 }}>{money(totalGave)}</Text>
          </View>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Text numberOfLines={1} style={{ ...T.caption, color: c.muted }}>{entryLabel('got', party.type)}</Text>
            <Text style={{ ...T.money, color: c.green, marginTop: 1 }}>{money(totalGot)}</Text>
          </View>
        </View>
      </View>

      {rangeBroken ? (
        <View style={{ backgroundColor: c.redBg, paddingVertical: space.sm, paddingHorizontal: space.lg }}>
          <Text style={{ ...T.caption, color: c.red, fontWeight: '600' }}>
            The From date is after the To date, so nothing can match. Clear one of them.
          </Text>
        </View>
      ) : null}

      <FlatList
        data={rows}
        keyExtractor={(t) => t.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: space.md }}
        ListEmptyComponent={
          <Empty
            title={filtered ? 'Nothing matches' : 'No entries yet'}
            body={filtered
              ? 'Try clearing the date range, the search box, or the filter.'
              : `Use the ${entryLabel('gave', party.type)} and ${entryLabel('got', party.type)} buttons below to add one.`}
          />
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => onEditEntry(item.id)} android_ripple={{ color: c.lineSoft }}
            style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center',
              paddingVertical: space.md, paddingHorizontal: space.lg,
              backgroundColor: pressed ? c.surfaceAlt : c.surface,
              borderBottomWidth: 1, borderBottomColor: c.lineSoft,
            })}>
            <View style={{ flex: 1.25, minWidth: 0, paddingRight: space.sm }}>
              <Text style={{ ...T.body, fontWeight: '700', color: c.text }}>{fdate(item.date)}</Text>
              <Text style={{ ...T.caption, color: c.faint, marginTop: 1 }}>
                Bal. {money(runningById[item.id] ?? 0)}
              </Text>
              {item.note ? (
                <Text numberOfLines={1} style={{ ...T.caption, color: c.muted, marginTop: 2 }}>{item.note}</Text>
              ) : null}
              {item.billNo || item.invoiceNo ? (
                <Text numberOfLines={1} style={{ ...T.caption, color: c.faint, marginTop: 1 }}>
                  {item.billNo ? `Bill #${item.billNo}` : ''}
                  {item.billNo && item.invoiceNo ? '  \u00B7  ' : ''}
                  {item.invoiceNo ? `Inv #${item.invoiceNo}` : ''}
                </Text>
              ) : null}
              {item.bills && item.bills.length ? (
                <Pressable onPress={() => onViewBill(item)} hitSlop={6} style={{ marginTop: space.xs + 1 }}>
                  <Text style={{ ...T.caption, color: c.brand, fontWeight: '700' }}>
                    {'\uD83D\uDCF7'} {item.bills.length > 1 ? `${item.bills.length} bills` : 'View bill'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              {item.type === 'gave' ? (
                <View style={{ backgroundColor: c.redBg, paddingVertical: 4, paddingHorizontal: space.sm + 2, borderRadius: radius.sm }}>
                  <Text style={{ ...T.money, color: c.red }}>{money(item.amount)}</Text>
                </View>
              ) : null}
            </View>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              {item.type === 'got' ? (
                <View style={{ backgroundColor: c.greenBg, paddingVertical: 4, paddingHorizontal: space.sm + 2, borderRadius: radius.sm }}>
                  <Text style={{ ...T.money, color: c.green }}>{money(item.amount)}</Text>
                </View>
              ) : null}
            </View>
          </Pressable>
        )}
      />

      <View style={[{
        paddingHorizontal: space.md, paddingTop: space.md, paddingBottom: space.sm,
        backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.lineSoft,
      }, elevate(c, 2)]}>
        {/* Primary actions, named for this party type. A bare minus and plus
            were unguessable once the concepts are Sales and Payment. */}
        <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.sm }}>
          <Pressable
            onPress={() => onEntry('gave')} accessibilityRole="button"
            accessibilityLabel={`Add ${entryLabel('gave', party.type)} entry`}
            android_ripple={{ color: 'rgba(255,255,255,.2)' }}
            style={({ pressed }) => [{
              flex: 1, height: 48, backgroundColor: c.red, borderRadius: radius.md,
              alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.88 : 1,
            }, elevate(c, 1)]}>
            <Text numberOfLines={1} style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
              {entryLabel('gave', party.type)}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => onEntry('got')} accessibilityRole="button"
            accessibilityLabel={`Add ${entryLabel('got', party.type)} entry`}
            android_ripple={{ color: 'rgba(255,255,255,.2)' }}
            style={({ pressed }) => [{
              flex: 1, height: 48, backgroundColor: c.green, borderRadius: radius.md,
              alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.88 : 1,
            }, elevate(c, 1)]}>
            <Text numberOfLines={1} style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
              {entryLabel('got', party.type)}
            </Text>
          </Pressable>
        </View>

        {/* Secondary actions, shorter so the hierarchy reads without extra chrome. */}
        <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
          <Pressable
            onPress={doDownload} accessibilityRole="button"
            style={({ pressed }) => ({
              flex: 1, height: 42, borderWidth: 1.5, borderColor: c.brand, borderRadius: radius.md,
              alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: space.xs + 2,
              opacity: pressed ? 0.8 : 1,
            })}>
            <Text style={{ fontSize: 13 }}>{'\uD83D\uDCC4'}</Text>
            <Text style={{ color: c.brand, fontWeight: '700', fontSize: 14 }}>Statement</Text>
          </Pressable>
          {party.phone ? (
            <Pressable
              onPress={() => open('tel:' + party.phone)} accessibilityRole="button" accessibilityLabel="Call"
              style={({ pressed }) => ({
                width: 42, height: 42, borderRadius: radius.md, borderWidth: 1.5, borderColor: c.brand,
                alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1,
              })}>
              <Text style={{ fontSize: 16 }}>{'\uD83D\uDCDE'}</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={doShare} accessibilityRole="button"
            style={({ pressed }) => [{
              flex: 1, height: 42, backgroundColor: c.brand, borderRadius: radius.md,
              alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: space.xs + 2,
              opacity: pressed ? 0.88 : 1,
            }, elevate(c, 1)]}>
            <Text style={{ fontSize: 13 }}>{'\uD83D\uDCAC'}</Text>
            <Text style={{ color: c.brandInk, fontWeight: '700', fontSize: 14 }}>Send</Text>
          </Pressable>
        </View>
      </View>
      <View style={{ height: insets.bottom, backgroundColor: c.surface }} />

      {showPicker ? (
        <DateTimePicker value={showPicker.value} mode="date" display="default" maximumDate={new Date()} onChange={onPickerChange} />
      ) : null}

      <Modal transparent visible={typeMenuOpen} animationType="fade" onRequestClose={() => setTypeMenuOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: c.overlay }} onPress={() => setTypeMenuOpen(false)}>
          <View style={[{
            position: 'absolute', top: insets.top + 104, right: space.md,
            backgroundColor: c.surface, borderRadius: radius.md, overflow: 'hidden', minWidth: 172,
          }, elevate(c, 3)]}>
            {typeOptions.map((o, i) => (
              <Pressable
                key={o.value}
                onPress={() => { setType(o.value); setTypeMenuOpen(false); }}
                android_ripple={{ color: c.lineSoft }}
                style={{
                  paddingVertical: space.md, paddingHorizontal: space.lg,
                  borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.lineSoft,
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md,
                }}>
                <Text style={{ ...T.body, fontWeight: o.value === type ? '700' : '600', color: o.value === type ? c.brand : c.text }}>
                  {o.label}
                </Text>
                {o.value === type ? <Text style={{ color: c.brand, fontSize: 13 }}>{'\u2713'}</Text> : null}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
