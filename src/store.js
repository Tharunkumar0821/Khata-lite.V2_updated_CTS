import { useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { uid, sampleData } from './utils';
import { createSyncCode, fetchSyncCode, pushSyncData, listenSyncCode } from './sync';

const KEY = 'khata-lite:v2';
const OLD_KEY = 'khata-lite:v1'; // single-business save from before this update
const SYNC_KEY = 'khata-lite:sync-code';

const freshBusiness = (name) => ({ id: uid(), name: (name || 'My Business').slice(0, 40), ts: Date.now() });

function emptyDb() {
  const b = freshBusiness('My Business');
  return { businesses: [b], activeBusinessId: b.id, theme: '', parties: [], txns: [] };
}

// Accepts either the new multi-business shape, or the old single-business
// shape (which it upgrades into a single business), and always returns
// a clean, fully-typed db, or null if the input is unusable.
export function normalize(d) {
  if (!d || typeof d !== 'object') return null;

  if (Array.isArray(d.parties) && !Array.isArray(d.businesses) && typeof d.business !== 'undefined') {
    const b = freshBusiness(d.business || 'My Business');
    return normalize({
      businesses: [b],
      activeBusinessId: b.id,
      theme: d.theme,
      parties: d.parties.map((p) => ({ ...p, businessId: b.id })),
      txns: d.txns.map((t) => ({ ...t, businessId: b.id })),
    });
  }

  if (!Array.isArray(d.businesses) || !Array.isArray(d.parties) || !Array.isArray(d.txns)) return null;
  const businesses = d.businesses
    .filter((b) => b && b.id && b.name)
    .map((b) => ({ id: String(b.id), name: String(b.name).slice(0, 40), ts: Number(b.ts) || Date.now() }));
  if (!businesses.length) return null;
  const ids = new Set(businesses.map((b) => b.id));
  const activeBusinessId = ids.has(d.activeBusinessId) ? d.activeBusinessId : businesses[0].id;

  return {
    theme: d.theme === 'light' || d.theme === 'dark' ? d.theme : '',
    businesses,
    activeBusinessId,
    parties: d.parties
      .filter((p) => p && p.id && p.name && ids.has(p.businessId))
      .map((p) => ({
        id: String(p.id), name: String(p.name), phone: String(p.phone || ''),
        type: p.type === 'supplier' ? 'supplier' : 'customer',
        businessId: String(p.businessId), ts: Number(p.ts) || Date.now(),
      })),
    txns: d.txns
      .filter((t) => t && t.id && t.pid && Number(t.amount) > 0 && ids.has(t.businessId))
      .map((t) => ({
        id: String(t.id), pid: String(t.pid), businessId: String(t.businessId),
        type: t.type === 'got' ? 'got' : 'gave', amount: Number(t.amount), note: String(t.note || ''),
        date: String(t.date || ''),
        bills: (Array.isArray(t.bills) ? t.bills : t.bill ? [t.bill] : []).filter((b) => typeof b === 'string' && b).map(String),
        billNo: String(t.billNo || ''), invoiceNo: String(t.invoiceNo || ''),
        ts: Number(t.ts) || Date.now(),
      })),
  };
}

export function useStore() {
  const [db, setDb] = useState(null);
  const [syncCode, setSyncCode] = useState(null);
  const loaded = useRef(false);
  const dbRef = useRef(null);
  const skipNextPush = useRef(false);

  useEffect(() => { dbRef.current = db; }, [db]);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        const savedCode = await AsyncStorage.getItem(SYNC_KEY);
        if (raw) {
          const n = normalize(JSON.parse(raw));
          if (live) { loaded.current = true; setDb(n || emptyDb()); if (savedCode) setSyncCode(savedCode); }
          return;
        }
        // one-time upgrade from the old single-business save
        let d = emptyDb();
        const old = await AsyncStorage.getItem(OLD_KEY);
        if (old) { try { const n = normalize(JSON.parse(old)); if (n) d = n; } catch (e) {} }
        if (live) { loaded.current = true; setDb(d); if (savedCode) setSyncCode(savedCode); }
      } catch (e) {
        if (live) { loaded.current = true; setDb(emptyDb()); }
      }
    })();
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (db && loaded.current) AsyncStorage.setItem(KEY, JSON.stringify(db)).catch(() => {});
  }, [db]);

  // Pull: whenever another phone changes the synced data, apply it here.
  useEffect(() => {
    if (!syncCode) return;
    const unsub = listenSyncCode(syncCode, (remoteData) => {
      const n = normalize(remoteData);
      if (!n) return;
      skipNextPush.current = true; // don't immediately re-upload what we just received
      setDb(n);
    });
    return unsub;
  }, [syncCode]);

  // Push: whenever local data changes (and it wasn't from the pull above), upload it.
  useEffect(() => {
    if (!db || !loaded.current || !syncCode) return;
    if (skipNextPush.current) { skipNextPush.current = false; return; }
    const t = setTimeout(() => { pushSyncData(syncCode, db); }, 900);
    return () => clearTimeout(t);
  }, [db, syncCode]);

  const actions = useMemo(() => ({
    addParty: (p) => setDb((s) => ({ ...s, parties: [...s.parties, { id: uid(), businessId: s.activeBusinessId, name: p.name, phone: p.phone, type: p.type, ts: Date.now() }] })),
    updateParty: (id, p) => setDb((s) => ({ ...s, parties: s.parties.map((x) => (x.id === id ? { ...x, ...p } : x)) })),
    deleteParty: (id) => setDb((s) => ({ ...s, parties: s.parties.filter((x) => x.id !== id), txns: s.txns.filter((t) => t.pid !== id) })),

    addTxn: (t) => setDb((s) => ({ ...s, txns: [...s.txns, { id: uid(), businessId: s.activeBusinessId, ts: Date.now(), ...t }] })),
    updateTxn: (id, t) => setDb((s) => ({ ...s, txns: s.txns.map((x) => (x.id === id ? { ...x, ...t } : x)) })),
    deleteTxn: (id) => setDb((s) => ({ ...s, txns: s.txns.filter((x) => x.id !== id) })),

    setTheme: (theme) => setDb((s) => ({ ...s, theme })),
    loadSample: () => setDb((s) => {
      const d = sampleData();
      return {
        ...s,
        parties: [...s.parties, ...d.parties.map((p) => ({ ...p, businessId: s.activeBusinessId }))],
        txns: [...s.txns, ...d.txns.map((t) => ({ ...t, businessId: s.activeBusinessId }))],
      };
    }),
    replaceAll: (data) => { const n = normalize(data); if (!n) throw new Error('invalid'); setDb(n); },
    wipeActiveBusiness: () => setDb((s) => ({
      ...s,
      parties: s.parties.filter((p) => p.businessId !== s.activeBusinessId),
      txns: s.txns.filter((t) => t.businessId !== s.activeBusinessId),
    })),

    addBusiness: (name) => setDb((s) => { const b = freshBusiness(name); return { ...s, businesses: [...s.businesses, b], activeBusinessId: b.id }; }),
    renameBusiness: (id, name) => setDb((s) => ({ ...s, businesses: s.businesses.map((b) => (b.id === id ? { ...b, name: name.slice(0, 40) } : b)) })),
    switchBusiness: (id) => setDb((s) => (s.businesses.some((b) => b.id === id) ? { ...s, activeBusinessId: id } : s)),
    deleteBusiness: (id) => setDb((s) => {
      if (s.businesses.length <= 1) return s; // always keep at least one business
      const businesses = s.businesses.filter((b) => b.id !== id);
      const activeBusinessId = s.activeBusinessId === id ? businesses[0].id : s.activeBusinessId;
      return {
        ...s, businesses, activeBusinessId,
        parties: s.parties.filter((p) => p.businessId !== id),
        txns: s.txns.filter((t) => t.businessId !== id),
      };
    }),
  }), []);

  const syncActions = useMemo(() => ({
    // First phone: uploads what's here now under a brand-new code.
    enableSync: async () => {
      const code = await createSyncCode(dbRef.current);
      await AsyncStorage.setItem(SYNC_KEY, code);
      setSyncCode(code);
      return code;
    },
    // Other phone(s): downloads the data behind an existing code and
    // REPLACES everything on this phone with it, then stays linked.
    joinSync: async (rawCode) => {
      const code = rawCode.trim().toUpperCase();
      const remote = await fetchSyncCode(code);
      const n = normalize(remote);
      if (!n) throw new Error('That code has no valid data in it.');
      skipNextPush.current = true;
      await AsyncStorage.setItem(SYNC_KEY, code);
      setSyncCode(code);
      setDb(n);
    },
    // Stops syncing on this phone only. Local data stays exactly as it is.
    disableSync: async () => {
      await AsyncStorage.removeItem(SYNC_KEY);
      setSyncCode(null);
    },
  }), []);

  return { db, syncCode, ...actions, ...syncActions };
}
