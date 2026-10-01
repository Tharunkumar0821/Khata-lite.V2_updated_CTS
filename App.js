import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, StatusBar, View, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeContext, light, dark } from './src/theme';
import { useStore } from './src/store';
import HomeScreen from './src/screens/HomeScreen';
import LedgerScreen from './src/screens/LedgerScreen';
import CashbookScreen from './src/screens/CashbookScreen';
import { BottomNav, toast } from './src/components/ui';
import { PartySheet, EntrySheet, BusinessSheet, SettingsSheet, SyncSheet, BackupSheet, BillViewer } from './src/components/Sheets';
import { deleteBills } from './src/bills';
import { exportExcel } from './src/excel';
import { money } from './src/utils';

export default function App() {
  return (
    <SafeAreaProvider>
      <Root />
    </SafeAreaProvider>
  );
}

function Root() {
  const store = useStore();
  const { db } = store;
  const system = useColorScheme();
  const [nav, setNav] = useState({ view: 'home', pid: null });
  const [tab, setTab] = useState('customer');
  const [q, setQ] = useState('');
  const [modal, setModal] = useState(null);

  const scheme = (db && db.theme) || system || 'light';
  const colors = scheme === 'dark' ? dark : light;

  // Android hardware back: close sheet, then leave ledger/cashbook, then exit.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (modal) { setModal(null); return true; }
      if (nav.view !== 'home') { setNav({ view: 'home', pid: null }); return true; }
      return false;
    });
    return () => sub.remove();
  }, [modal, nav]);

  // Data scoped to the active business, so screens keep working with a
  // single flat { business, parties, txns } shape without knowing about
  // the multi-business structure underneath.
  const activeBiz = db ? db.businesses.find((b) => b.id === db.activeBusinessId) : null;
  const viewDb = useMemo(() => {
    if (!db || !activeBiz) return null;
    return {
      business: activeBiz.name,
      theme: db.theme,
      parties: db.parties.filter((p) => p.businessId === db.activeBusinessId),
      txns: db.txns.filter((t) => t.businessId === db.activeBusinessId),
    };
  }, [db, activeBiz]);

  if (!db || !viewDb) {
    return (
      <ThemeContext.Provider value={colors}>
        <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </ThemeContext.Provider>
    );
  }

  const party = nav.pid ? db.parties.find((p) => p.id === nav.pid) : null;
  const view = nav.view === 'ledger' && !party ? 'home' : nav.view;
  const close = () => setModal(null);
  const open = (id) => setNav({ view: 'ledger', pid: id });

  const confirmDelete = (title, message, onYes) =>
    Alert.alert(title, message, [{ text: 'Keep it', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: onYes }]);

  let screen;
  if (view === 'ledger') {
    screen = (
      <LedgerScreen
        db={viewDb}
        party={party}
        onBack={() => setNav({ view: 'home', pid: null })}
        onEditParty={() => setModal({ type: 'party', id: party.id })}
        onEntry={(t) => setModal({ type: 'entry', entryType: t, pid: party.id })}
        onEditEntry={(id) => setModal({ type: 'entry', id, pid: party.id })}
        onViewBill={(t) => setModal({ type: 'bill', id: t.id })}
      />
    );
  } else if (view === 'cash') {
    screen = <CashbookScreen db={viewDb} onOpen={open} />;
  } else {
    screen = (
      <HomeScreen
        db={viewDb} tab={tab} setTab={setTab} q={q} setQ={setQ}
        onOpen={open}
        onAdd={() => setModal({ type: 'party' })}
        onSample={store.loadSample}
        onRename={() => setModal({ type: 'business' })}
      />
    );
  }

  let sheet = null;
  if (modal && modal.type === 'party') {
    const p = modal.id ? db.parties.find((x) => x.id === modal.id) : null;
    sheet = (
      <PartySheet
        party={p}
        defaultType={tab}
        onClose={close}
        onSave={(data) => {
          if (p) store.updateParty(p.id, data); else { store.addParty(data); setTab(data.type); }
          close(); toast('Saved');
        }}
        onDelete={() => confirmDelete('Delete this party?', 'This deletes the party and all their entries. This cannot be undone.', () => {
          db.txns.filter((t) => t.pid === p.id).forEach((t) => deleteBills(t.bills)); store.deleteParty(p.id); close(); setNav({ view: 'home', pid: null }); toast('Deleted');
        })}
      />
    );
  } else if (modal && modal.type === 'entry') {
    const e = modal.id ? db.txns.find((x) => x.id === modal.id) : null;
    const ownerParty = db.parties.find((x) => x.id === (e ? e.pid : modal.pid));
    sheet = (
      <EntrySheet
        entry={e}
        defaultType={modal.entryType}
        partyType={ownerParty ? ownerParty.type : 'customer'}
        onClose={close}
        onSave={(data) => {
          if (e) store.updateTxn(e.id, data); else store.addTxn({ ...data, pid: modal.pid });
          close(); toast('Entry saved');
        }}
        onDelete={() => confirmDelete('Delete this entry?', 'This cannot be undone.', () => { deleteBills(e.bills); store.deleteTxn(e.id); close(); toast('Entry deleted'); })}
      />
    );
  } else if (modal && modal.type === 'bill') {
    const t = db.txns.find((x) => x.id === modal.id);
    const owner = t ? db.parties.find((x) => x.id === t.pid) : null;
    sheet = t ? (
      <BillViewer
        bills={t.bills}
        partyName={owner ? owner.name : ''}
        partyPhone={owner ? owner.phone : ''}
        amountText={`${t.type === 'gave' ? 'You gave' : 'You got'} ${money(t.amount)}${t.note ? '  \u2022  ' + t.note : ''}`}
        onClose={close}
      />
    ) : null;
  } else if (modal && modal.type === 'business') {
    sheet = (
      <BusinessSheet
        businesses={db.businesses}
        activeId={db.activeBusinessId}
        onSwitch={(id) => { store.switchBusiness(id); setNav({ view: 'home', pid: null }); }}
        onAdd={store.addBusiness}
        onRename={store.renameBusiness}
        onDelete={(id, name) => confirmDelete(
          `Delete "${name}"?`,
          'This deletes the business and every party and entry in it. This cannot be undone.',
          () => {
            db.txns.filter((t) => t.businessId === id).forEach((t) => deleteBills(t.bills));
            store.deleteBusiness(id);
          }
        )}
        onClose={close}
      />
    );
  } else if (modal && modal.type === 'settings') {
    sheet = (
      <SettingsSheet
        theme={db.theme}
        syncOn={!!store.syncCode}
        businessName={activeBiz.name}
        onTheme={store.setTheme}
        onBusinesses={() => setModal({ type: 'business' })}
        onSync={() => setModal({ type: 'sync' })}
        onExport={() => { close(); exportExcel(viewDb, activeBiz.name); }}
        onBackup={() => setModal({ type: 'backup' })}
        onWipe={() => confirmDelete(
          `Erase "${activeBiz.name}"'s data?`,
          'This removes every party and entry in this business on this phone. Other businesses are not affected.',
          () => { viewDb.txns.forEach((t) => deleteBills(t.bills)); store.wipeActiveBusiness(); close(); setNav({ view: 'home', pid: null }); toast('Business data erased'); }
        )}
        onClose={close}
      />
    );
  } else if (modal && modal.type === 'sync') {
    sheet = (
      <SyncSheet
        syncCode={store.syncCode}
        onCreate={async () => { await store.enableSync(); toast('Sync turned on'); }}
        onJoin={(code) => new Promise((resolve, reject) => {
          Alert.alert(
            'Join this code?',
            'This replaces ALL data on this phone (every business) with the data from that code. This cannot be undone.',
            [
              { text: 'Cancel', style: 'cancel', onPress: () => reject(new Error('cancelled')) },
              { text: 'Replace and join', style: 'destructive', onPress: () => {
                store.joinSync(code).then(() => { setNav({ view: 'home', pid: null }); toast('Joined and synced'); resolve(); }).catch(reject);
              } },
            ]
          );
        })}
        onDisable={async () => { await store.disableSync(); toast('Sync turned off on this phone'); }}
        onClose={close}
      />
    );
  } else if (modal && modal.type === 'backup') {
    sheet = (
      <BackupSheet
        db={db}
        businessName={activeBiz.name}
        onClose={close}
        onRestore={(data) => { store.replaceAll(data); close(); setNav({ view: 'home', pid: null }); toast('Backup restored'); }}
      />
    );
  }

  return (
    <ThemeContext.Provider value={colors}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        <View style={{ flex: 1 }}>{screen}</View>
        {view !== 'ledger' ? <BottomNav view={view} onNav={(v) => setNav({ view: v, pid: null })} onSettings={() => setModal({ type: 'settings' })} /> : null}
        {sheet}
      </View>
    </ThemeContext.Provider>
  );
}
