import React, { useMemo } from 'react';
import { View, Text, FlatList, Pressable, TextInput } from 'react-native';
import { useTheme, space, radius, type as T, elevate } from '../theme';
import { Header, IconBtn, Avatar, Btn, Seg, Empty, SectionLabel } from '../components/ui';
import { money, fdate, balLabel, balColorKey } from '../utils';

export default function HomeScreen({ db, tab, setTab, q, setQ, onOpen, onAdd, onSample, onRename }) {
  const c = useTheme();

  // One pass over the entries builds every party's balance and last entry.
  // The previous version called balanceOf() plus a sort per party, which was
  // O(parties x entries) and got sluggish on a long customer list.
  const index = useMemo(() => {
    const bal = {};
    const last = {};
    db.parties.forEach((p) => { bal[p.id] = 0; });
    db.txns.forEach((t) => {
      if (!(t.pid in bal)) return;
      bal[t.pid] += t.type === 'gave' ? t.amount : -t.amount;
      const prev = last[t.pid];
      if (!prev || t.date > prev.date || (t.date === prev.date && t.ts > prev.ts)) last[t.pid] = t;
    });
    Object.keys(bal).forEach((k) => { bal[k] = Math.round(bal[k] * 100) / 100; });
    return { bal, last };
  }, [db.parties, db.txns]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return db.parties
      .filter((p) => p.type === tab)
      .filter((p) => !needle || p.name.toLowerCase().includes(needle) || (p.phone || '').includes(needle))
      .map((p) => ({ p, bal: index.bal[p.id] || 0, last: index.last[p.id] }))
      .sort((a, b) => a.p.name.localeCompare(b.p.name, undefined, { sensitivity: 'base' }));
  }, [db.parties, tab, q, index]);

  const totals = useMemo(() => {
    let get = 0, give = 0, n = 0;
    db.parties.forEach((p) => {
      if (p.type !== tab) return;
      n += 1;
      const b = index.bal[p.id] || 0;
      if (b > 0) get += b; else give -= b;
    });
    return { get, give, count: n };
  }, [db.parties, tab, index]);

  const noun = tab === 'customer' ? 'Customer' : 'Supplier';
  const plural = tab === 'customer' ? 'customers' : 'suppliers';

  const header = (
    <View>
      <View style={[{
        backgroundColor: c.surface, borderRadius: radius.lg, borderWidth: 1,
        borderColor: c.lineSoft, overflow: 'hidden', marginBottom: space.lg,
      }, elevate(c, 1)]}>
        <View style={{ flexDirection: 'row' }}>
          <View style={{ flex: 1, paddingVertical: space.lg, paddingHorizontal: space.lg }}>
            <Text style={{ ...T.caption, color: c.muted }}>Receivable</Text>
            <Text numberOfLines={1} style={{ ...T.amount, color: c.green, marginTop: 3 }}>{money(totals.get)}</Text>
          </View>
          <View style={{ width: 1, backgroundColor: c.lineSoft, marginVertical: space.md }} />
          <View style={{ flex: 1, paddingVertical: space.lg, paddingHorizontal: space.lg }}>
            <Text style={{ ...T.caption, color: c.muted }}>Payable</Text>
            <Text numberOfLines={1} style={{ ...T.amount, color: c.red, marginTop: 3 }}>{money(totals.give)}</Text>
          </View>
        </View>
        <View style={{ backgroundColor: c.surfaceAlt, paddingVertical: space.sm + 1, paddingHorizontal: space.lg, borderTopWidth: 1, borderTopColor: c.lineSoft }}>
          <Text style={{ ...T.caption, color: c.muted }}>
            {totals.count} {totals.count === 1 ? plural.slice(0, -1) : plural}
            {totals.get - totals.give !== 0
              ? `  \u00B7  net ${money(totals.get - totals.give)} ${totals.get >= totals.give ? 'receivable' : 'payable'}`
              : ''}
          </Text>
        </View>
      </View>

      <Seg
        value={tab}
        onChange={setTab}
        options={[{ value: 'customer', label: 'Customers' }, { value: 'supplier', label: 'Suppliers' }]}
      />

      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: space.sm,
        borderWidth: 1, borderColor: c.line, backgroundColor: c.surface,
        borderRadius: radius.md, paddingHorizontal: space.md, marginBottom: space.md,
      }}>
        <Text style={{ fontSize: 14, color: c.faint }}>{'\uD83D\uDD0D'}</Text>
        <TextInput
          value={q} onChangeText={setQ}
          placeholder={`Search ${plural} by name or phone`}
          placeholderTextColor={c.faint}
          style={{ flex: 1, color: c.text, paddingVertical: 11, fontSize: 15 }}
        />
        {q ? <IconBtn label={'\u2715'} a11y="Clear search" tone="plain" onPress={() => setQ('')} /> : null}
      </View>

      {rows.length ? <SectionLabel>{q ? `${rows.length} matching` : 'All'}</SectionLabel> : null}
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <Header
        title={db.business}
        subtitle="Tap to switch business"
        onTitlePress={onRename}
        right={<IconBtn label={'\u21C4'} a11y="Switch business" onPress={onRename} />}
      />
      <FlatList
        data={rows}
        keyExtractor={(r) => r.p.id}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={header}
        contentContainerStyle={{ padding: space.lg, paddingBottom: 104 }}
        ListEmptyComponent={
          <Empty
            title={q ? 'No matches' : `No ${plural} yet`}
            body={q
              ? 'Try a different name or number.'
              : `Add your first ${plural.slice(0, -1)} to start recording what you gave and got.`}
            action={!q && db.parties.length === 0
              ? <Btn kind="ghost" label="Load sample data" onPress={onSample} />
              : null}
          />
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => onOpen(item.p.id)} android_ripple={{ color: c.lineSoft }}
            style={({ pressed }) => [{
              flexDirection: 'row', alignItems: 'center', gap: space.md,
              paddingVertical: space.md, paddingHorizontal: space.md,
              backgroundColor: pressed ? c.surfaceAlt : c.surface,
              borderWidth: 1, borderColor: c.lineSoft,
              borderRadius: radius.lg, marginBottom: space.sm,
            }, elevate(c, 1)]}>
            <Avatar name={item.p.name} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ ...T.body, fontWeight: '700', color: c.text }}>{item.p.name}</Text>
              <Text numberOfLines={1} style={{ ...T.caption, color: c.muted, marginTop: 2 }}>
                {item.last ? fdate(item.last.date) : 'No entries yet'}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ ...T.money, color: c[balColorKey(item.bal)] }}>{money(item.bal)}</Text>
              <Text style={{ ...T.caption, color: c.faint, marginTop: 1 }}>{balLabel(item.bal)}</Text>
            </View>
          </Pressable>
        )}
      />
      <Pressable
        onPress={onAdd} accessibilityRole="button" accessibilityLabel={`Add ${noun}`}
        android_ripple={{ color: 'rgba(255,255,255,.2)' }}
        style={({ pressed }) => [{
          position: 'absolute', right: space.lg, bottom: space.lg,
          backgroundColor: c.brand, paddingVertical: space.md + 2, paddingHorizontal: space.xl,
          borderRadius: radius.lg, opacity: pressed ? 0.9 : 1,
        }, elevate(c, 3)]}>
        <Text style={{ color: c.brandInk, fontWeight: '700', fontSize: 15 }}>{'\uFF0B'}  Add {noun}</Text>
      </Pressable>
    </View>
  );
}
