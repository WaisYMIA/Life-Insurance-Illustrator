'use strict';
// RFC 4180-style CSV parser (quotes, doubled quotes, CRLF). Returns an array of rows (arrays of strings).
function parseCsv(text){
  text = String(text || '').replace(/^﻿/, '');
  const rows = []; let row = [], cell = '', q = false;
  for(let i = 0; i < text.length; i++){
    const c = text[i];
    if(q){ if(c === '"'){ if(text[i + 1] === '"'){ cell += '"'; i++; } else q = false; } else cell += c; }
    else if(c === '"') q = true;
    else if(c === ','){ row.push(cell); cell = ''; }
    else if(c === '\n' || c === '\r'){ if(c === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; if(row.some(x => x !== '')) rows.push(row); row = []; }
    else cell += c;
  }
  row.push(cell); if(row.some(x => x !== '')) rows.push(row);
  return rows;
}
// Excel / Sheets treat a cell starting with = + - @ as a formula. Neutralise it so a client's name cannot run code.
function csvCell(v){ v = v == null ? '' : String(v); if(/^[=+\-@\t\r]/.test(v)) v = "'" + v; return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
function toCsv(rows, cols){ return '﻿' + [cols.map(c => csvCell(c.label)).join(',')].concat(rows.map(r => cols.map(c => csvCell(r[c.key])).join(','))).join('\r\n'); }
const utcNow = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
function sqlDate(v){ if(!v) return null; const d = new Date(v); return isNaN(d) ? null : d.toISOString().slice(0, 19).replace('T', ' '); }
function addDays(dateStr, days){ const d = new Date(dateStr + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
function addMonths(dateStr, n){ const d = new Date(dateStr + 'T00:00:00Z'); const day = d.getUTCDate(); d.setUTCMonth(d.getUTCMonth() + n); if(d.getUTCDate() < day) d.setUTCDate(0); return d.toISOString().slice(0, 10); }
const todayStr = () => new Date().toISOString().slice(0, 10);
module.exports = { parseCsv, toCsv, csvCell, utcNow, sqlDate, addDays, addMonths, todayStr };
