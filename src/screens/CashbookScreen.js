import React, { useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, TextInput } from 'react-native';
import { useTheme, space, radius, type as T, elevate } from '../theme';
import { Header, Chip, Empty, SectionLabel, IconBtn } from '../components/ui';
import { money, fdate, todayStr, daysAgoStr, cmpDesc, signedMoney, entryLabel } from '../utils';

const PERIODS = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: '7 days' },
  { value: 'month', label: 'This month' },
  { value: 'all', label: 'All time' },
];
const TYPES = [
  { value: 'all', label: 'All' },
  { value: 'gave', label: 'Out' },
  { value: 'got', label: 'In' },
];

export default function CashbookScreen({ db, onOpen }) {
  const c = useTheme();
  const [period, setPeriod] = useState('all');
  const [type, setType] = useState('all');
  const [q, setQ] = useState('');

  const snapshot = useMemo(() => {
    const t = todayStr();
    const mo = t.slice(0, 7);
    const s = { gotToday: 0, gaveToday: 0, net: 0 };
    db.txns.forEach((x) => {
      if (x.date === t) { if (x.type === 'got') s.gotToday += x.amount; else s.gaveToday += x.amount; }
      if (x.date.slice(0, 7) === mo) s.net += (x.type === 'got' ? 1 : -1) * x.amount;
    });
    return s;
  }, [db.txns]);

  const { items, filteredCount, filteredGot, filteredGave } = useMemo(() => {
    const t = todayStr();
    const weekStart = daysAgoStr(6);
    const mo = t.slice(0, 7);
    const needle = q.trim().toLowerCase();

    const inPeriod = (x) => {
      if (period === 'today') return x.date === t;
      if (period === 'week') return x.date >= weekStart;
      if (period === 'month') return x.date.slice(0, 7) === mo;
      return true;
    };

    const pById = Object.fromEntries(db.parties.map((p) => [p.id, p]));
    let got = 0, gave = 0, count = 0;
    const out = [];
    let last = '';
    db.txns
      .filter((x) => pById[x.pid])
      .filter(inPeriod)
      .filter((x) => type === 'all' || x.type === type)
      .filter((x) => {
        if (!needle) return true;
        const p = pById[x.pid];
        return p.name.toLowerCase().includes(needle)
          || (x.note || '').toLowerCase().includes(needle)
          || (x.billNo || '').toLowerCase().includes(needle);
      })
      .sort(cmpDesc)
      .forEach((x) => {
        count += 1;
        if (x.type === 'got') got += x.amount; else gave += x.amount;
        if (x.date !== last) { out.push({ kind: 'day', key: 'd' + x.date, date: x.date }); last = x.date; }
        out.push({ kind: 'tx', key: x.id, x, p: pById[x.pid] });
      });
    return { items: out, filteredCount: count, filteredGot: got, filteredGave: gave };
  }, [db.txns, db.parties, period, type, q]);

  const filtersActive = period !== 'all' || type !== 'all' || !!q.trim();
  const net = filteredGot - filteredGave;

  const top = (
    <View>
      <View style={[{
        backgroundColor: c.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: c.lineSoft,
        padding: space.lg, marginBottom: space.lg,
      }, elevate(c, 1)]}>
        <Text style={{ ...T.caption, color: c.muted }}>Net this month</Text>
        <Text style={{ ...T.amount, color: snapshot.net >= 0 ? c.green : c.red, marginTop: 2 }}>
          {signedMoney(snapshot.net)}
        </Text>
        <View style={{ flexDirection: 'row', marginTop: space.lg, borderTopWidth: 1, borderTopColor: c.lineSoft, paddingTop: space.md }}>
          <View style={{ flex: 1 }}>
            <Text style={{ ...T.caption, color: c.muted }}>Got today</Text>
            <Text style={{ ...T.money, color: c.green, marginTop: 1 }}>{money(snapshot.gotToday)}</Text>
          </View>
          <View style={{ width: 1, backgroundColor: c.lineSoft }} />
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Text style={{ ...T.caption, color: c.muted }}>Gave today</Text>
            <Text style={{ ...T.money, color: c.red, marginTop: 1 }}>{money(snapshot.gaveToday)}</Text>
          </View>
        </View>
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

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.sm }}>
        {PERIODS.map((o) => (
          <Chip key={o.value} label={o.label} selected={o.value === period} onPress={() => setPeriod(o.value)} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {TYPES.map((o) => (
          <Chip key={o.value} label={o.label} selected={o.value === type} onPress={() => setType(o.value)} />
        ))}
      </View>

      {filtersActive && filteredCount ? (
        <View style={{
          flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
          marginTop: space.lg, backgroundColor: c.brandSoft, borderRadius: radius.md,
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

  return (
    <View style={{ flex: 1 }}>
      <Header title="Cashbook" subtitle="Every entry, newest first" />
      <FlatList
        data={items}
        keyExtractor={(i) => i.key}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={top}
        contentContainerStyle={{ padding: space.lg, paddingBottom: space.xl }}
        ListEmptyComponent={
          <Empty
            title={filtersActive ? 'Nothing matches' : 'Nothing recorded yet'}
            body={filtersActive
              ? 'Try a different search term, period, or type.'
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
                <Text numberOfLines={1} style={{ ...T.body, fontWeight: '700', color: c.text }}>{item.p.name}</Text>
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
    </View>
  );
}
