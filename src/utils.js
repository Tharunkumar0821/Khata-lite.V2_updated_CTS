export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');

export const dateStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayStr = () => dateStr();
export const daysAgoStr = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return dateStr(d); };

export function fdate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  if (!m) return s || '';
  return `${m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}`;
}

export function validDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  if (!m) return false;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3];
}

// Indian digit grouping: 1,23,456.50
export function money(n) {
  const v = Math.abs(Number(n) || 0);
  const [i, d] = v.toFixed(2).split('.');
  let s = i;
  if (s.length > 3) {
    const last3 = s.slice(-3);
    const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    s = rest + ',' + last3;
  }
  return '\u20B9' + s + (d === '00' ? '' : '.' + d);
}

// A balance shown without its direction is ambiguous, so anywhere a signed
// figure is displayed use this instead of money().
export const signedMoney = (n) => {
  const v = Number(n) || 0;
  return (v < 0 ? '\u2212' : '') + money(v);
};

export const initials = (name) => {
  const p = String(name || '?').trim().split(/\s+/);
  return ((p[0] || '?')[0] + (p[1] ? p[1][0] : '')).toUpperCase();
};

export const balanceOf = (txns, pid) =>
  Math.round(txns.reduce((s, t) => (t.pid === pid ? s + (t.type === 'gave' ? t.amount : -t.amount) : s), 0) * 100) / 100;

export const cmpDesc = (a, b) => (a.date === b.date ? b.ts - a.ts : a.date < b.date ? 1 : -1);
export const cmpAsc = (a, b) => -cmpDesc(a, b);

// Accounting wording for a balance. The sign means the same thing for both
// party types -- positive is always money owed to you -- so this needs no
// partyType argument. For plainer English swap in 'To receive' / 'To pay'.
export const balLabel = (b) => (b > 0 ? 'Receivable' : b < 0 ? 'Payable' : 'Settled');
export const balColorKey = (b) => (b > 0 ? 'green' : b < 0 ? 'red' : 'text');

// Display names for the two entry types, which read differently depending on
// whether the party is a customer or a supplier:
//
//   Button    Party     Stored    Goods   Money   Balance
//   Sales     customer  gave      out     -       + (they owe you)
//   Receipt   customer  got       -       in      -
//   Purchase  supplier  got       in      -       - (you owe them)
//   Payment   supplier  gave      -       out     +
//
// The stored values stay 'gave' and 'got' forever. Renaming them in storage
// would mean a migration plus breaking every existing backup file and sync
// document, so this is kept strictly as a display concern.
export const entryLabel = (type, partyType) =>
  partyType === 'supplier'
    ? (type === 'gave' ? 'Payment' : 'Purchase')
    : (type === 'gave' ? 'Sales' : 'Receipt');

// Short forms for statements and spreadsheet cells, padded to equal width so
// plain-text statement lines stay in columns.
export const entryShort = (type, partyType) =>
  partyType === 'supplier'
    ? (type === 'gave' ? 'Paid ' : 'Purch')
    : (type === 'gave' ? 'Sale ' : 'Recd ');

export function statementText(db, party) {
  const txns = db.txns.filter((t) => t.pid === party.id).sort(cmpAsc);
  const b = balanceOf(db.txns, party.id);
  const lines = [`Statement: ${party.name} (${db.business})`, ''];
  txns.forEach((t) => {
    lines.push(`${fdate(t.date)}  ${entryShort(t.type, party.type)}  ${money(t.amount)}${t.note ? '  ' + t.note : ''}`);
  });
  lines.push('', `${balLabel(b)}: ${money(b)}`);
  return lines.join('\n');
}

export function waLink(db, party, b) {
  let d = (party.phone || '').replace(/\D/g, '');
  if (d.length === 10) d = '91' + d;
  const msg = `Hi ${party.name}, a gentle reminder from ${db.business}: ${money(b)} is pending. Please pay when you can. Thank you!`;
  return `https://wa.me/${d}?text=${encodeURIComponent(msg)}`;
}

export function sampleData() {
  const parties = [];
  const txns = [];
  let n = 0;
  const mk = (name, phone, type) => { const p = { id: uid() + 'p' + parties.length, name, phone, type, ts: Date.now() }; parties.push(p); return p.id; };
  const tx = (pid, type, amount, note, ago) => txns.push({ id: uid() + 't' + n, pid, type, amount, note, date: daysAgoStr(ago), ts: Date.now() + n++ });
  const a = mk('Ramesh Kirana Store', '9876543210', 'customer');
  tx(a, 'gave', 4200, 'Groceries on credit', 9); tx(a, 'got', 1500, 'Part payment', 4); tx(a, 'gave', 800, 'Oil and sugar', 1);
  const b = mk('Meena Tailors', '9123456780', 'customer');
  tx(b, 'gave', 2600, 'Uniform fabric', 12); tx(b, 'got', 2600, 'Paid in full', 3);
  const c = mk('Sri Balaji Traders', '9988776655', 'supplier');
  tx(c, 'got', 15000, 'Stock received', 8); tx(c, 'gave', 6000, 'Advance paid', 2);
  const e = mk('Kumar Transport', '', 'customer');
  tx(e, 'gave', 1250, 'Delivery charges', 5);
  return { parties, txns };
}
