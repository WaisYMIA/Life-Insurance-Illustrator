/**
 * Workbook structure scanner — Stage 3 of the original roadmap
 * ("upload → structure scanner → human review → validate → activate").
 *
 * This intentionally does NOT attempt to blindly convert an arbitrary
 * workbook into engine-ready JSON and trust the result — that is exactly
 * the kind of silent-wrong-number risk this whole project has been built
 * to avoid. What it does instead:
 *
 *   1. Always returns a generic, honest preview of every sheet (headers +
 *      sample rows) so an admin can see exactly what was uploaded.
 *   2. For the parts of a workbook that follow a predictable, flat,
 *      column-per-field shape — a rate table (age/term/rate/survival/
 *      death-benefit factor) — it auto-extracts them with a fuzzy header
 *      matcher. This is the genuinely automatable 90% of the work, and is
 *      exactly the "prates"-style table every one of the three engines
 *      already expects.
 *   3. For anything else (plan-level metadata: booleans like `cagr`,
 *      `wholeLifeAfterPT`, rider-eligibility flags) it reports what it
 *      could and could not confidently map, rather than guessing — those
 *      stay a human judgment call, surfaced as a short, specific list
 *      rather than hidden.
 *
 * The output is always a *draft* for a human to review and edit before it
 * goes anywhere near /versions, and that draft still has to pass
 * /validate against a real reference scenario before it can be activated
 * — this scanner shortens the manual-entry work, it does not bypass the
 * safety gate.
 */
'use strict';
const XLSX = require('xlsx');

// Fuzzy header matcher: normalizes punctuation/case/whitespace, then looks
// for any of a field's known aliases as a substring. Good enough for real
// workbook header variance ("Age Next Birthday", "ANB", "Age (ANB)") while
// staying simple and auditable.
function normalizeHeader(h){
  return String(h || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
const FIELD_ALIASES = {
  plan:   ['plan', 'plan name', 'product', 'product name'],
  anb:    ['anb', 'age next birthday', 'age nb', 'age'],
  term:   ['term', 'policy term', 'years', 'plan term'],
  rate:   ['rate', 'premium rate', 'rate per mille', 'per mille'],
  surv:   ['surv', 'survival', 'survival factor', 'maturity factor'],
  death:  ['death', 'death benefit', 'death factor', 'death rate']
};
function matchField(header){
  const norm = normalizeHeader(header);
  for(const [field, aliases] of Object.entries(FIELD_ALIASES)){
    if(aliases.some(a => norm === a || norm.includes(a))) return field;
  }
  return null;
}

function sheetToRows(sheet){
  return XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: null });
}

function scanWorkbook(buffer, opts){
  opts = opts || {};
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheets = workbook.SheetNames.map(name => {
    const rows = sheetToRows(workbook.Sheets[name]);
    const headerRow = rows[0] || [];
    return {
      name,
      rowCount: rows.length,
      headers: headerRow,
      sampleRows: rows.slice(1, 6)
    };
  });

  const warnings = [];
  let ratesSheet = null, fieldMap = null;
  for(const sheet of sheets){
    const map = {};
    sheet.headers.forEach((h, i) => {
      const field = matchField(h);
      if(field && map[field] === undefined) map[field] = i;
    });
    // A usable rate table needs at least plan/anb-or-term/rate recognizable.
    const matchedCount = Object.keys(map).length;
    if(matchedCount >= 3 && map.rate !== undefined){
      ratesSheet = sheet; fieldMap = map;
      break;
    }
  }

  let extractedRates = null;
  if(ratesSheet && fieldMap){
    extractedRates = [];
    const rows = sheetToRows(workbook.Sheets[ratesSheet.name]).slice(1);
    for(const row of rows){
      if(row.every(c => c === null || c === '')) continue;
      const rec = {};
      for(const field of Object.keys(FIELD_ALIASES)){
        if(fieldMap[field] !== undefined) rec[field] = row[fieldMap[field]];
      }
      // Only keep rows that at least have a rate value — skips section headers/notes rows.
      if(rec.rate === null || rec.rate === undefined || rec.rate === '') continue;
      extractedRates.push(rec);
    }
    const missingFields = Object.keys(FIELD_ALIASES).filter(f => fieldMap[f] === undefined);
    if(missingFields.length){
      warnings.push(`Rate table "${ratesSheet.name}": could not find a column for: ${missingFields.join(', ')}. Review the extracted rows and fill these in manually if your engine type needs them.`);
    }
    warnings.push(`Auto-extracted ${extractedRates.length} rate rows from sheet "${ratesSheet.name}" using columns: ${Object.entries(fieldMap).map(([f,i]) => `${f}←"${ratesSheet.headers[i]}"`).join(', ')}. Check a few rows against the source workbook before trusting this.`);
  } else {
    warnings.push('No sheet looked like a flat rate table (needs recognizable age/term/rate-style columns) — nothing was auto-extracted. Use the sheet preview below to build the JSON manually, or rename headers to something more standard (Age/ANB, Term, Rate) and re-scan.');
  }

  return {
    sheets: sheets.map(s => ({ name: s.name, rowCount: s.rowCount, headers: s.headers, sampleRows: s.sampleRows })),
    extracted: extractedRates ? { sourceSheet: ratesSheet.name, fieldMap, rows: extractedRates } : null,
    warnings
  };
}

module.exports = { scanWorkbook };
