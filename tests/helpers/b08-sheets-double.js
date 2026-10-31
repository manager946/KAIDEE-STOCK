'use strict';
// Offline Google service doubles for the B08 disposable bundle. No Google access.
// Executes the GENERATED bundle (hooked Code.gs copy + adapter + runner + identity).
const vm = require('node:vm'), crypto = require('node:crypto');
const bundleLib = require('../../scripts/b08-qa-bundle');

const RUN = 'T08RUN01';
const TEST_ADMIN = 'admin@example.test'; // reserved test domain (RFC 2606); never a real identity
const sha = t => crypto.createHash('sha256').update(String(t), 'utf8').digest('hex');
const IDS = {target: 'disposableTargetSheet_0001', script: 'disposableScript_P1_0001',
  staging: 'stagingSheetId_protected_01', prod: 'productionSheet_protected_1',
  qaOld: 'syntheticQaStep815_protected', b07: 'b07QaScriptProject_protected'};
const H = row => "=SUMIFS('บันทึกรับ-จ่าย'!$E:$E,'บันทึกรับ-จ่าย'!$C:$C,A" + row + ",'บันทึกรับ-จ่าย'!$B:$B,\"จ่ายออก\")";
const G = row => "=SUMIFS('บันทึกรับ-จ่าย'!$E:$E,'บันทึกรับ-จ่าย'!$C:$C,A" + row + ",'บันทึกรับ-จ่าย'!$B:$B,\"รับเข้า\")";
const I = row => '=F' + row + '+G' + row + '-H' + row;
const FIX = {
  'PC-001': [['QA-010', 2], ['QA-011', 3]], 'LOCK-001': [['QA-020', 1]], 'LOCK-002': [['QA-021', 1]],
  'PROP-001': [['QA-030', 1]], 'PROP-002': [['QA-031', 1]], 'RESTORE-001': [['QA-040', 2]], 'RESTORE-002': [['QA-041', 1]]
};

// Formula evaluation (F-6): the canonical issued-SUMIFS is computed from the ledger sheet
// like Google Sheets would. A cell with {pin: true} keeps its stored v even though it has
// a formula — this models a calculated value that drifted while the formula text did not.
const SUMIFS_RE = /^=SUMIFS\('บันทึกรับ-จ่าย'!\$E:\$E,'บันทึกรับ-จ่าย'!\$C:\$C,A(\d+),'บันทึกรับ-จ่าย'!\$B:\$B,"(จ่ายออก|รับเข้า)"\)$/;
const BAL_RE = /^=F(\d+)\+G\1-H\1$/;
function makeSheet(name, cells = {}) {
  // cells: Map key "r,c" -> {v, f, pin?}
  const data = new Map(Object.entries(cells));
  let maxRows = 1000;
  const lastRow = () => { let m = 0; for (const [k, x] of data) if (x.v !== '' || x.f) m = Math.max(m, +k.split(',')[0]); return m; };
  const lastCol = () => { let m = 0; for (const [k, x] of data) if (x.v !== '' || x.f) m = Math.max(m, +k.split(',')[1]); return m; };
  const cell = (r, c) => data.get(r + ',' + c) || {v: '', f: ''};
  const put = (r, c, x) => data.set(r + ',' + c, x);
  const sh = {
    data, getName: () => name, getLastRow: lastRow, getLastColumn: lastCol, getMaxRows: () => maxRows,
    setName: n => { const old = name; name = n; sh.onRename(old, n); return sh; },
    appendRow: row => { sh.onWrite(name, lastRow() + 1, 1, '<appendRow>'); row.forEach((v, j) => put(lastRow() + 1, j + 1, {v, f: ''})); },
    hideSheet: () => { sh.onWrite(name, 0, 0, '<hideSheet>'); },
    protect: () => { sh.onWrite(name, 0, 0, '<protect>'); return {}; },
    getParent: () => sh.parent,
    onRename: () => {},
    insertRowAfter: () => { maxRows++; },
    getRange(r, c, n = 1, m = 1) {
      const grid = fn => Array.from({length: n}, (_, i) => Array.from({length: m}, (_, j) => fn(cell(r + i, c + j))));
      const val = x => (x.f && !x.pin && sh.evaluate && name === 'คลังสินค้า' ? sh.evaluate(x.f) : x.v);
      return {
        getValues: () => grid(val), getFormulas: () => grid(x => x.f || ''),
        getDisplayValues: () => grid(x => { const v = val(x); return v instanceof Date ? v.toISOString() : String(v); }),
        getDisplayValue: () => String(val(cell(r, c))), getFormula: () => cell(r, c).f || '',
        setValue: v => { sh.onWrite(name, r, c, v); put(r, c, {v, f: ''}); },
        setFormula: f => { sh.onWrite(name, r, c, f); put(r, c, {v: '', f}); },
        setValues: vals => vals.forEach((row, i) => row.forEach((v, j) => { sh.onWrite(name, r + i, c + j, v); put(r + i, c + j, {v, f: ''}); })),
        setFormulas: fs => fs.forEach((row, i) => row.forEach((f, j) => { sh.onWrite(name, r + i, c + j, f); put(r + i, c + j, {v: '', f}); })),
        // Real Apps Script Range mutators whose names do NOT start with set/insert/delete (F-15).
        // In the double they record a write, so any read-only bypass becomes observable.
        breakApart: () => { sh.onWrite(name, r, c, '<breakApart>'); },
        splitTextToColumns: () => { sh.onWrite(name, r, c, '<splitTextToColumns>'); put(r, c, {v: 'split', f: ''}); },
        trimWhitespace: () => { sh.onWrite(name, r, c, '<trimWhitespace>'); },
        randomize: () => { sh.onWrite(name, r, c, '<randomize>'); },
        merge: () => { sh.onWrite(name, r, c, '<merge>'); },
        check: () => { sh.onWrite(name, r, c, '<check>'); },
        removeDuplicates: () => { sh.onWrite(name, r, c, '<removeDuplicates>'); },
        createFilter: () => { sh.onWrite(name, r, c, '<createFilter>'); return {remove: () => {}}; },
        copyTo: () => { sh.onWrite(name, r, c, '<copyTo>'); },
        getSheet: () => sh
      };
    },
    onWrite: () => {}
  };
  return sh;
}

function seed({run = RUN, scriptSha = sha(IDS.script), title} = {}) {
  const inv = {}, rq = {}, ln = {};
  inv['1,1'] = {v: 'KAIDEE-STOCK DISPOSABLE QA B08 — NO REAL DATA — ' + run, f: ''};
  inv['2,1'] = {v: 'B08-BIND|' + run + '|' + scriptSha, f: ''};
  for (let i = 0; i < 52; i++) {
    const r = 8 + i;
    inv[r + ',1'] = {v: 'QA-' + ('000' + (i + 1)).slice(-3), f: ''};
    inv[r + ',5'] = {v: 10, f: ''}; inv[r + ',6'] = {v: 100, f: ''};
    inv[r + ',7'] = {v: '', f: G(r)}; inv[r + ',8'] = {v: '', f: H(r)}; inv[r + ',9'] = {v: '', f: I(r)};
  }
  let row = 2, lrow = 2;
  rq['1,1'] = {v: 'ReqID', f: ''}; ln['1,1'] = {v: 'LineID', f: ''};
  Object.keys(FIX).forEach(key => {
    const id = 'QA-DISP-' + run + '-' + key;
    [id, 'QA-DISP-' + run + '-RQ-' + key, '', 'qa', 'qa', 'qa', 'อนุมัติ'].forEach((v, j) => { rq[row + ',' + (j + 1)] = {v, f: ''}; });
    FIX[key].forEach(([code, qty], i) => {
      [id + '-L' + (i + 1), id, code, qty, ''].forEach((v, j) => { ln[lrow + ',' + (j + 1)] = {v, f: ''}; });
      lrow++;
    });
    row++;
  });
  const sheets = {
    'คลังสินค้า': makeSheet('คลังสินค้า', inv), 'บันทึกรับ-จ่าย': makeSheet('บันทึกรับ-จ่าย'),
    'ใบเบิกสินค้า': makeSheet('ใบเบิกสินค้า', rq), 'รายการใบเบิก': makeSheet('รายการใบเบิก', ln)
  };
  return {id: IDS.target, title: title || 'KAIDEE-STOCK-DISPOSABLE-QA-B08-' + run, sheets};
}

function cloneBook(book, overrides = {}) {
  const sheets = {};
  Object.keys(book.sheets).forEach(n => {
    const copy = makeSheet(n);
    for (const [k, x] of book.sheets[n].data) copy.data.set(k, {v: x.v instanceof Date ? new Date(x.v) : x.v, f: x.f});
    sheets[n] = copy;
  });
  return Object.assign({id: book.id, title: book.title, sheets}, overrides);
}

/** Blank single-sheet workbook as created by sheets.new (pre-seed state). */
function blankBook({title = 'KAIDEE-STOCK-DISPOSABLE-QA-B08-' + RUN, id = IDS.target, sheet = 'แผ่น1'} = {}) {
  return {id, title, sheets: {[sheet]: makeSheet(sheet)}};
}

/** Configuration only, seed state NOT_STARTED (pre-seed). */
function preSeedProps(o = {}) {
  return Object.assign({
    KAIDEE_B08_TARGET_ID: IDS.target, KAIDEE_B08_TARGET_SHA256: sha(IDS.target),
    KAIDEE_B08_SCRIPT_SHA256: sha(IDS.script), KAIDEE_B08_RUN_ID: RUN, KAIDEE_B08_ROLE: 'TEST',
    KAIDEE_B08_DENYLIST_SHA256: [IDS.staging, IDS.prod, IDS.qaOld, IDS.b07].map(sha).join(',')
  }, o);
}

/** Post-seed state used by runner tests: seed COMPLETED for this run (baseline hash is evidence only). */
function baseProps(o = {}) {
  return preSeedProps(Object.assign({
    PHASEB08_SEED_STATE: 'COMPLETED',
    PHASEB08_SEED_DONE: JSON.stringify({run: RUN, completedAt: '2026-11-01T00:00:00.000Z', baselineSha256: 'b'.repeat(64),
      headers: 7, lines: 8, skus: 52})
  }, o));
}

/** Builds a runtime: bundle executed against doubles. */
function runtime(opts = {}) {
  const src = bundleLib.loadSources();
  // opts.transform: in-memory source mutation for defense-in-depth layer tests only.
  if (opts.transform) opts.transform(src);
  // opts.seedBundle: SEED bundle (runner + seeder + SEED identity) instead of the RUNNER bundle.
  const kind = opts.seedBundle ? 'SEED' : 'RUNNER';
  const {hooked} = opts.seedBundle ? bundleLib.staticVerifySeed(src) : bundleLib.staticVerify(src);
  const identity = bundleLib.identitySource(src, hooked, 'TEST', opts.identityKind || kind);
  const book = opts.book || seed();
  const props = opts.props || baseProps();
  const log = [], writes = [], opened = [], timeline = [];
  const sticky = new Set(opts.stickyKeys || []); // deleteProperty silently ignored (simulated service fault)
  let clock = opts.clock || Date.parse('2026-10-31T03:00:00Z');
  let lockHeld = false;
  // Script-lock double. Offline only: models a held lock deterministically, NOT real Apps Script concurrency.
  const lock = {waitLock: ms => { log.push(['wait', ms]); if (opts.lockBusy || lockHeld) { clock += ms; throw new Error('Lock timeout: another process was holding the lock for too long.'); } lockHeld = true; },
    tryLock: ms => { log.push(['tryLock', ms]); timeline.push(['tryLock']); if (opts.lockBusy || lockHeld) { clock += ms; return false; } lockHeld = true; return true; },
    hasLock: () => lockHeld,
    releaseLock: () => { lockHeld = false; log.push(['release']); timeline.push(['release']); }};
  const lockHeldNow = () => lockHeld;
  const structure = [];
  // Evaluates the approved G/H SUMIFS and I = F+G-H (resolving referenced cells, honouring pins).
  // Sheets are looked up by name at evaluation time so a freshly seeded workbook evaluates too.
  const invVal = (r, c) => book.sheets['คลังสินค้า'].getRange(r, c).getValues()[0][0];
  const evaluate = raw => {
    const inv = book.sheets['คลังสินค้า'], led = book.sheets['บันทึกรับ-จ่าย'];
    return evalFormula(raw, inv, led);
  };
  const attach = sh => {
    sh.onWrite = (n, r, c, v) => { writes.push([n, r, c, v]); timeline.push(['write', n, r, c, v]); };
    sh.evaluate = evaluate;
    sh.onRename = (old, nw) => {
      structure.push(['rename', old, nw]);
      book.sheets = Object.fromEntries(Object.entries(book.sheets).map(([k, v]) => [k === old ? nw : k, v]));
    };
    return sh;
  };
  Object.values(book.sheets).forEach(attach);
  // Sheets ignores whitespace/case outside quoted literals; normalize the same way before matching.
  const norm = f => String(f).replace(/("(?:[^"]|"")*"|'(?:[^']|'')*')|([^"']+)/g, (m, q, x) => q || x.replace(/\s+/g, '').toUpperCase());
  function evalFormula(raw, inv, led) {
    if (!inv) return '#REF!';
    const f = norm(raw);
    const b = BAL_RE.exec(f);
    if (b) { const [F, Gv, Hv] = [6, 7, 8].map(c => invVal(+b[1], c)); return [F, Gv, Hv].every(x => typeof x === 'number') ? F + Gv - Hv : '#VALUE!'; }
    const m = SUMIFS_RE.exec(f);
    if (!m || !led) return f.startsWith('=') ? '#ERROR!' : f;
    const code = (inv.data.get(m[1] + ',1') || {}).v;
    let sum = 0;
    for (let row = 1; row <= led.getLastRow(); row++) {
      const t = (led.data.get(row + ',2') || {}).v, cc = (led.data.get(row + ',3') || {}).v, e = (led.data.get(row + ',5') || {}).v;
      if (t === m[2] && cc === code) sum += Number(e) || 0;
    }
    return sum;
  }
  const ss = {getId: () => book.id, getName: () => book.title,
    deleteSheet: () => { structure.push(['deleteSheet']); }, getActiveSheet: () => Object.values(book.sheets)[0],
    getSheets: () => Object.values(book.sheets), getSheetByName: n => book.sheets[n] || null,
    getNamedRanges: () => opts.namedRanges || [],
    insertSheet: n => { if (book.sheets[n]) throw new Error('sheet exists'); structure.push(['insertSheet', n]);
      book.sheets[n] = attach(makeSheet(n)); book.sheets[n].parent = ss; return book.sheets[n]; }};
  Object.values(book.sheets).forEach(sh => { sh.parent = ss; });
  const email = Object.prototype.hasOwnProperty.call(opts, 'email') ? opts.email : TEST_ADMIN;
  const effective = Object.prototype.hasOwnProperty.call(opts, 'effectiveEmail') ? opts.effectiveEmail : email;
  class FakeDate extends Date { constructor(...a) { super(...(a.length ? a : [clock])); } static now() { return clock; } }
  const ctx = {
    console: {log: x => log.push(['log', x])}, Date: FakeDate,
    Utilities: {DigestAlgorithm: {SHA_256: 'sha256'}, Charset: {UTF_8: 'utf8'},
      computeDigest: (_a, t) => Array.from(crypto.createHash('sha256').update(t, 'utf8').digest()).map(b => b > 127 ? b - 256 : b),
      sleep: ms => { const end = clock + ms; if (opts.onSleep) opts.onSleep(ms); clock = Math.max(clock, end); }, formatDate: d => d.toISOString()},
    ScriptApp: {getScriptId: () => opts.scriptId || IDS.script, getProjectTriggers: () => opts.triggers || []},
    SpreadsheetApp: {openById: id => { opened.push(id); if (id !== book.id) throw new Error('not found'); return ss; },
      flush: () => { log.push(['flush']); timeline.push(['flush']); }},
    LockService: {getScriptLock: () => lock},
    Session: {getActiveUser: () => ({getEmail: () => email}), getEffectiveUser: () => ({getEmail: () => effective}),
      getScriptTimeZone: () => 'Asia/Bangkok'},
    PropertiesService: {getScriptProperties: () => ({
      getProperty: k => (Object.prototype.hasOwnProperty.call(props, k) ? props[k] : null),
      getProperties: () => Object.assign({}, props),
      setProperty: (k, v) => { props[k] = String(v); timeline.push(['setProperty', k]); },
      deleteProperty: k => { timeline.push(['deleteProperty', k]); if (!sticky.has(k)) delete props[k]; }
    })}
  };
  vm.createContext(ctx);
  vm.runInContext(hooked + '\n' + src.adapter + '\n' + src.runner + '\n' + (opts.seedBundle ? src.seeder + '\n' : '') + identity, ctx);
  // Test-only Admin allowlist for the sandbox. The real requireStaff_ -> role_ -> isAdmin_ chain still
  // runs; only the source of the allowlist is swapped. apps-script/Code.gs (ADMINS) is not modified.
  // opts.realAdmins keeps the UNMODIFIED Code.gs allowlist (used to prove no identity elevation).
  if (!opts.realAdmins) ctx.admins_ = () => [TEST_ADMIN];
  return {ctx, book, props, log, writes, opened, timeline, structure, run: RUN, IDS, lockHeld: lockHeldNow,
    tick: ms => { clock += ms; }, now: () => clock, setLockHeld: v => { lockHeld = v; },
    bal: code => ctx.balances_(ctx.readItems_(), ctx.readMv_())[code]};
}

module.exports = {runtime, seed, cloneBook, baseProps, preSeedProps, blankBook, makeSheet, sha, IDS, RUN, FIX, G, H, I, TEST_ADMIN};
