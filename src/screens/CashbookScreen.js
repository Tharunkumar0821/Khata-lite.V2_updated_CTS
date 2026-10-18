import React, { useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme, space, radius, type as T, elevate } from '../theme';
import { Chip, Empty, SectionLabel, IconBtn, Seg } from '../components/ui';
import { money, fdate, dateStr, todayStr, daysAgoStr, cmpDesc, signedMoney, entryLabel } from '../utils';

const GROUPS = [
  { value: 'all', label: 'All' },
  { value: 'customer', label: 'Customers' },
  { value: 'supplier', label: 'Suppliers' },
];
const TYPES = [
  { value: 'all', label: 'All' },
  { value: 'gave', label: 'Out' },
  { value: 'got', label: 'In' },
];

// Quick shortcuts just fill in the From/To fields below, so there is one
// source of truth for "what period am I looking at" instead of two
// competing filters.
function shortcutRange(key) {
  const t = todayStr();
  if (key === 'today') return { start: t, end: t };
  if (key === 'week') return { start: daysAgoStr(6), end: t };
  if (key === 'month') return { start: t.slice(0, 7) + '-01', end: t };
  return { start: '', end: '' }; // all time
}

export default function CashbookScreen({ db, onOpen }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const [group, setGroup] = useState('all');
  const [type, setType] = useState('all');
  const [q, setQ] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showPicker, setShowPicker] = useState(null); // { which: 'start'|'end', value }

  const pById = useMemo(() => Object.fromEntries(db.parties.map((p) => [p.id, p])), [db.parties]);

  // Always both groups, over the selected date range only — independent of
  // the group tab, type filter and search below, so switching to look at
  // just customers never hides what suppliers are doing, and vice versa.
  const groupTotals = useMemo(() => {
    const out = {
      customer: { in: 0, out: 0 },
      supplier: { in: 0, out: 0 },
    };
    db.txns.forEach((t) => {
      const p = pById[t.pid];
      if (!p) return;
      if (startDate && t.date < startDate) return;
      if (endDate && t.date > endDate) return;
      const bucket = out[p.type];
      if (!bucket) return;
      if (t.type === 'got') bucket.in += t.amount; else bucket.out += t.amount;
    });
    return out;
  }, [db.txns, pById, startDate, endDate]);

  const { items, filteredCount, filteredGot, filteredGave } = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let got = 0, gave = 0, count = 0;
    const out = [];
    let last = '';
    db.txns
      .filter((x) => pById[x.pid])
      .filter((x) => group === 'all' || pById[x.pid].type === group)
      .filter((x) => !startDate || x.date >= startDate)
      .filter((x) => !endDate || x.date <= endDate)
      .filter((x) => type === 'all' || x.type === type)
      .filter((x) => {
        if (!needle) return true;
        const p = pById[x.pid];
        return p.name.toLowerCase().includes(needle)
          || (x.note || '').toLowerCase().includes(needle)
          || (x.billNo || '').toLowerCase().includes(needle)
          || (x.invoiceNo || '').toLowerCase().includes(needle);
      })
      .sort(cmpDesc)
      .forEach((x) => {
        count += 1;
        if (x.type === 'got') got += x.amount; else gave += x.amount;
        if (x.date !== last) { out.push({ kind: 'day', key: 'd' + x.date, date: x.date }); last = x.date; }
        out.push({ kind: 'tx', key: x.id, x, p: pById[x.pid] });
      });
    return { items: out, filteredCount: count, filteredGot: got, filteredGave: gave };
  }, [db.txns, pById, group, startDate, endDate, type, q]);

  const filtersActive = !!(startDate || endDate || type !== 'all' || q.trim());
  const rangeBroken = !!(startDate && endDate && startDate > endDate);
  const net = filteredGot - filteredGave;

  const activeShortcut = useMemo(() => {
    for (const key of ['today', 'week', 'month']) {
      const r = shortcutRange(key);
      if (r.start === startDate && r.end === endDate) return key;
    }
    return !startDate && !endDate ? 'all' : null;
  }, [startDate, endDate]);

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

  const GroupTotal = ({ title, t }) => (
    <View style={{ flex: 1 }}>
      <Text style={{ ...T.caption, color: c.muted, fontWeight: '700' }}>{title}</Text>
      <View style={{ flexDirection: 'row', gap: space.md, marginTop: 2 }}>
        <View>
          <Text style={{ ...T.caption, color: c.faint }}>In</Text>
          <Text style={{ ...T.money, color: c.green }}>{money(t.in)}</Text>
        </View>
        <View>
          <Text style={{ ...T.caption, color: c.faint }}>Out</Text>
          <Text style={{ ...T.money, color: c.red }}>{money(t.out)}</Text>
        </View>
      </View>
    </View>
  );

  const top = (
    <View>
      <View style={[{
        backgroundColor: c.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: c.lineSoft,
        padding: space.lg, marginBottom: space.lg,
      }, elevate(c, 1)]}>
        <Text style={{ ...T.caption, color: c.muted, marginBottom: space.sm }}>
          {startDate || endDate
            ? `${startDate ? fdate(startDate) : 'Start'} \u2192 ${endDate ? fdate(endDate) : 'Today'}`
            : 'All time'}
        </Text>
        <View style={{ flexDirection: 'row' }}>
          <GroupTotal title="Customers" t={groupTotals.customer} />
          <View style={{ width: 1, backgroundColor: c.lineSoft, marginHorizontal: space.md }} />
          <GroupTotal title="Suppliers" t={groupTotals.supplier} />
        </View>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md }}>
        {[
          { key: 'today', label: 'Today' },
          { key: 'week', label: '7 days' },
          { key: 'month', label: 'This month' },
          { key: 'all', label: 'All time' },
        ].map((o) => (
          <Chip
            key={o.key} label={o.label} selected={activeShortcut === o.key}
            onPress={() => { const r = shortcutRange(o.key); setStartDate(r.start); setEndDate(r.end); }}
          />
        ))}
      </View>

      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: space.sm,
        borderWidth: 1, borderColor: c.line, backgroundColor: c.surface,
        borderRadius: radius.md, paddingHorizontal: space.md, marginBottom: space.md,
      }}>
        <Text style={{ fontSize: 14, color: c.faint }}>{'\uD83D\uDD0D'}</Text>
        <TextInput
          value={q} onChangeText={setQ} placeholder="Search party, note or bill no."
          placeholderTextColor={c.faint}
          style={{ flex: 1, color: c.text, paddingVertical: 11, fontSize: 15 }}
        />
        {q ? <IconBtn label={'\u2715'} a11y="Clear search" tone="plain" onPress={() => setQ('')} /> : null}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {TYPES.map((o) => (
          <Chip key={o.value} label={o.label} selected={o.value === type} onPress={() => setType(o.value)} />
        ))}
      </View>

      {rangeBroken ? (
        <View style={{ backgroundColor: c.redBg, borderRadius: radius.md, paddingVertical: space.sm, paddingHorizontal: space.md, marginTop: space.md }}>
          <Text style={{ ...T.caption, color: c.red, fontWeight: '600' }}>
            The From date is after the To date, so nothing can match. Clear one of them.
          </Text>
        </View>
      ) : null}

      {filtersActive && filteredCount ? (
        <View style={{
          flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
          marginTop: space.md, backgroundColor: c.brandSoft, borderRadius: radius.md,
          paddingVertical: space.sm + 1, paddingHorizontal: space.md,
        }}>
          <Text style={{ ...T.caption, color: c.text, fontWeight: '600' }}>
            {filteredCount} {filteredCount === 1 ? 'entry' : 'entries'} shown
          </Text>
          <Text style={{ ...T.label, color: net >= 0 ? c.green : c.red }}>Net {signedMoney(net)}</Text>
        </View>
      ) : null}

      {items.length ? <View style={{ height: space.xs }} /> : null}
    </View>
  );

  const groupLabel = GROUPS.find((g) => g.value === group).label.toLowerCase();

  return (
    <View style={{ flex: 1 }}>
      <View style={[{ backgroundColor: c.brand, paddingTop: insets.top + space.sm, paddingBottom: space.md, paddingHorizontal: space.md }, elevate(c, 2)]}>
        <Text style={{ ...T.title, color: c.brandInk, marginBottom: space.md }}>Cashbook</Text>
        <Seg value={group} onChange={setGroup} options={GROUPS} style={{ marginBottom: space.sm }} />
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <DateBtn label="From" value={startDate} onPress={() => pickDate('start')} onClear={() => setStartDate('')} />
          <DateBtn label="To" value={endDate} onPress={() => pickDate('end')} onClear={() => setEndDate('')} />
        </View>
      </View>

      <FlatList
        data={items}
        keyExtractor={(i) => i.key}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={top}
        contentContainerStyle={{ padding: space.lg, paddingBottom: space.xl }}
        ListEmptyComponent={
          <Empty
            title={filtersActive || group !== 'all' ? 'Nothing matches' : 'Nothing recorded yet'}
            body={filtersActive || group !== 'all'
              ? `No ${groupLabel} entries match the date range, search, or filter.`
              : 'Entries you add for customers and suppliers all show up here.'}
          />
        }
        renderItem={({ item }) =>
          item.kind === 'day' ? (
            <SectionLabel style={{ marginTop: space.lg, marginBottom: space.sm }}>{fdate(item.date)}</SectionLabel>
          ) : (
            <Pressable
              onPress={() => onOpen(item.p.id)} android_ripple={{ color: c.lineSoft }}
              style={({ pressed }) => [{
                flexDirection: 'row', alignItems: 'center', gap: space.md,
                paddingVertical: space.md, paddingHorizontal: space.md,
                backgroundColor: pressed ? c.surfaceAlt : c.surface,
                borderWidth: 1, borderColor: c.lineSoft, borderRadius: radius.md,
                marginBottom: space.sm,
              }, elevate(c, 1)]}>
              <View style={{
                width: 3, alignSelf: 'stretch', borderRadius: 2,
                backgroundColor: item.x.type === 'gave' ? c.red : c.green,
              }} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs + 2 }}>
                  <Text numberOfLines={1} style={{ ...T.body, fontWeight: '700', color: c.text, flexShrink: 1 }}>{item.p.name}</Text>
                  <View style={{
                    paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.sm,
                    backgroundColor: item.p.type === 'supplier' ? c.brandSoft : c.lineSoft,
                  }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: item.p.type === 'supplier' ? c.brand : c.muted }}>
                      {item.p.type === 'supplier' ? 'SUPPLIER' : 'CUSTOMER'}
                    </Text>
                  </View>
                </View>
                <Text numberOfLines={1} style={{ ...T.caption, color: c.muted, marginTop: 1 }}>
                  {item.x.note || entryLabel(item.x.type, item.p.type)}
                  {item.x.billNo ? `  \u00B7  Bill #${item.x.billNo}` : ''}
                </Text>
              </View>
              <Text style={{ ...T.money, color: item.x.type === 'gave' ? c.red : c.green }}>
                {item.x.type === 'gave' ? '\u2212' : '\uFF0B'} {money(item.x.amount)}
              </Text>
            </Pressable>
          )
        }
      />

      {showPicker ? (
        <DateTimePicker value={showPicker.value} mode="date" display="default" maximumDate={new Date()} onChange={onPickerChange} />
      ) : null}
    </View>
  );
}
