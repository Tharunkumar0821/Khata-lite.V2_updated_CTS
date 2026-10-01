import { Alert } from 'react-native';
import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { balanceOf, cmpAsc, fdate } from './utils';

// Exports the parties and entries of one business to a .xlsx file
// and opens the share sheet so it can be sent by WhatsApp, email, etc.
export async function exportExcel(db, businessName) {
  try {
    const partyRows = db.parties.map((p) => ({
      Name: p.name,
      Type: p.type === 'supplier' ? 'Supplier' : 'Customer',
      Phone: p.phone || '',
      Balance: balanceOf(db.txns, p.id),
    }));

    const byId = Object.fromEntries(db.parties.map((p) => [p.id, p]));
    const entryRows = db.txns
      .slice()
      .sort(cmpAsc)
      .map((t) => {
        const p = byId[t.pid];
        return {
          Date: fdate(t.date),
          Party: p ? p.name : '(deleted)',
          Type: p ? (p.type === 'supplier' ? 'Supplier' : 'Customer') : '',
          'You Gave': t.type === 'gave' ? t.amount : '',
          'You Got': t.type === 'got' ? t.amount : '',
          Note: t.note || '',
          'Bill No': t.billNo || '',
          'Invoice No': t.invoiceNo || '',
        };
      });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(partyRows), 'Parties');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(entryRows), 'Entries');
    const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

    const safeName = (businessName || 'Khata').replace(/[^a-z0-9]+/gi, '_');
    const fileName = `${safeName}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    const uri = FileSystem.cacheDirectory + fileName;
    await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });

    if (!(await Sharing.isAvailableAsync())) {
      Alert.alert('Sharing not available', 'This device cannot open the share sheet.');
      return;
    }
    await Sharing.shareAsync(uri, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dialogTitle: 'Export to Excel',
    });
  } catch (e) {
    Alert.alert('Could not export', 'Something went wrong while creating the Excel file.\n\n' + (e && e.message ? e.message : String(e)));
  }
}
