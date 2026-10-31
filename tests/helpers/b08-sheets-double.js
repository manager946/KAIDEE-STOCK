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
  const cell = (r, c) => data.get(r + ',' + c) || {v: '', f: ''};
  const put = (r, c, x) => data.set(r + ',' + c, x);
  const sh = {
    data, getName: () => name, getLastRow: lastRow, getMaxRows: () => maxRows,
    insertRowAfter: () => { maxRows++; },
    getRange(r, c, n = 1, m = 1) {
      const grid = fn => Array.from({length: n}, (_, i) => Array.from({length: m}, (_, j) => fn(cell(r + i, c + j))));
      const val = x => (x.f && !x.pin && sh.evaluate ? sh.evaluate(x.f) : x.v);
      return {
        getValues: () => grid(val), getFormulas: () => grid(x => x.f || ''),
        getDisplayValues: () => grid(x => { const v = val(x); return v instanceof Date ? v.toISOString() : String(v); }),
        getDisplayValue: () => String(val(cell(r, c))), getFormula: () => cell(r, c).f || '',
        setValue: v => { sh.onWrite(name, r, c, v); put(r, c, {v, f: ''}); },
        setFormula: f => { sh.onWrite(name, r, c, f); put(r, c, {v: '', f}); },
        setValues: vals => vals.forEach((row, i) => row.forEach((v, j) => { sh.onWrite(name, r + i, c + j, v); put(r + i, c + j, {v, f: ''}); }))
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

function baseProps(o = {}) {
  return Object.assign({
    KAIDEE_B08_TARGET_ID: IDS.target, KAIDEE_B08_TARGET_SHA256: sha(IDS.target),
    KAIDEE_B08_SCRIPT_SHA256: sha(IDS.script), KAIDEE_B08_RUN_ID: RUN, KAIDEE_B08_ROLE: 'TEST',
    KAIDEE_B08_DENYLIST_SHA256: [IDS.staging, IDS.prod, IDS.qaOld, IDS.b07].map(sha).join(',')
  }, o);
}

/** Builds a runtime: bundle executed against doubles. */
function runtime(opts = {}) {
  const src = bundleLib.loadSources();
  // opts.transform: in-memory source mutation for defense-in-depth layer tests only.
  if (opts.transform) opts.transform(src);
  const {hooked} = bundleLib.staticVerify(src);
  const identity = bundleLib.identitySource(src, hooked, 'TEST');
  const book = opts.book || seed();
  const props = opts.props || baseProps();
  const log = [], writes = [], opened = [], timeline = [];
  const sticky = new Set(opts.stickyKeys || []); // deleteProperty silently ignored (simulated service fault)
  let clock = opts.clock || Date.parse('2026-10-31T03:00:00Z');
  let lockHeld = false;
  const lock = {waitLock: ms => { log.push(['wait', ms]); if (opts.lockBusy || lockHeld) { clock += ms; throw new Error('Lock timeout: another process was holding the lock for too long.'); } lockHeld = true; },
    releaseLock: () => { lockHeld = false; log.push(['release']); timeline.push(['release']); }};
  Object.values(book.sheets).forEach(s => { s.onWrite = (n, r, c, v) => { writes.push([n, r, c, v]); timeline.push(['write', n, r, c, v]); }; });
  const inv = book.sheets['คลังสินค้า'], led = book.sheets['บันทึกรับ-จ่าย'];
  // Evaluates the approved G/H SUMIFS and I = F+G-H (resolving referenced cells, honouring pins).
  const invVal = (r, c) => inv.getRange(r, c).getValues()[0][0];
  // Sheets ignores whitespace/case outside quoted literals; normalize the same way before matching.
  const norm = f => String(f).replace(/("(?:[^"]|"")*"|'(?:[^']|'')*')|([^"']+)/g, (m, q, x) => q || x.replace(/\s+/g, '').toUpperCase());
  if (inv) inv.evaluate = raw => {
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
  };
  const ss = {getId: () => book.id, getName: () => book.title,
    getSheets: () => Object.values(book.sheets), getSheetByName: n => book.sheets[n] || null};
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
    Session: {getActiveUser: () => ({getEmail: () => TEST_ADMIN}), getScriptTimeZone: () => 'Asia/Bangkok'},
    PropertiesService: {getScriptProperties: () => ({
      getProperty: k => (Object.prototype.hasOwnProperty.call(props, k) ? props[k] : null),
      getProperties: () => Object.assign({}, props),
      setProperty: (k, v) => { props[k] = String(v); timeline.push(['setProperty', k]); },
      deleteProperty: k => { timeline.push(['deleteProperty', k]); if (!sticky.has(k)) delete props[k]; }
    })}
  };
  vm.createContext(ctx);
  vm.runInContext(hooked + '\n' + src.adapter + '\n' + src.runner + '\n' + identity, ctx);
  // Test-only Admin allowlist for the sandbox. The real requireStaff_ -> role_ -> isAdmin_ chain still
  // runs; only the source of the allowlist is swapped. apps-script/Code.gs (ADMINS) is not modified.
  ctx.admins_ = () => [TEST_ADMIN];
  return {ctx, book, props, log, writes, opened, timeline, run: RUN, IDS,
    tick: ms => { clock += ms; }, now: () => clock, setLockHeld: v => { lockHeld = v; },
    bal: code => ctx.balances_(ctx.readItems_(), ctx.readMv_())[code]};
}

module.exports = {runtime, seed, cloneBook, baseProps, makeSheet, sha, IDS, RUN, FIX, G, H, I, TEST_ADMIN};
