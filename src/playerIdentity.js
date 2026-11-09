export function normalizeIdentity(row) {
  const realName = String(row.realName || '').normalize('NFKC').trim();
  const phone = String(row.phone || '').normalize('NFKC').replace(/[\s().-]/g, '').replace(/^\+8860?/, '0');
  const name = String(row.name || '').trim();
  if (!realName || !name || !/^\+?\d{6,15}$/.test(phone)) throw new Error('請填寫本名、有效電話與打師名。');
  return { realName, phone, name };
}

export const identityMatches = (profiles, row) => profiles.filter(p => p.realName === row.realName || p.phone === row.phone);
export const reviewKey = profiles => JSON.stringify([...profiles].sort((a,b) => a.id.localeCompare(b.id)).map(p => [p.id,p.realName,p.phone,p.name]));

export function resolveIdentity(profiles, input, newId, decision) {
  const row = normalizeIdentity(input);
  const candidates = identityMatches(profiles, row);
  const exact = candidates.find(p => p.phone === row.phone && p.realName === row.realName);
  if (!candidates.length) return { id: newId, ...row };
  if (exact && exact.name === row.name) return exact;
  if (decision?.key !== reviewKey(candidates)) throw new Error('核對資料有差異，請確認選手身分。');
  if (!decision.id && exact) throw new Error('相同本名及電話已建立選手。');
  if (decision.id && (!candidates.some(p => p.id === decision.id) || (exact && decision.id !== exact.id))) throw new Error('請選擇符合的既有選手。');
  return { id: decision.id || newId, ...row, name: decision.name?.trim() || row.name };
}

export function readIdentityCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  const source = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '"') {
      if (quoted && source[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === ',' && !quoted) { row.push(cell); cell = ''; }
    else if (ch === '\n' && !quoted) { row.push(cell.trim()); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (quoted) throw new Error('CSV 引號未成對。');
  row.push(cell.trim()); rows.push(row);
  const headers = rows.shift().map(s => s.trim());
  const columns = ['本名', '電話號碼', '打師名'].map(key => headers.indexOf(key));
  if (columns.includes(-1)) throw new Error('CSV 表頭須包含本名、電話號碼、打師名。');
  return rows.filter(r => r.some(s => s.trim())).map(r => normalizeIdentity({ realName:r[columns[0]], phone:r[columns[1]], name:r[columns[2]] }));
}
