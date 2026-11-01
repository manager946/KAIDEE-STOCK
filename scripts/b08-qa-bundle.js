#!/usr/bin/env node
'use strict';
// Phase B08 disposable QA bundle: static source verification, hooked-copy build,
// entry-point policy, runtime attestation hashes and offline snapshot comparison.
// Never edits apps-script/*. Never contacts Google. Output goes outside git.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const B08 = path.join(ROOT, 'qa/phase-b/b08');
const FILES = {
  code: path.join(ROOT, 'apps-script/Code.gs'),
  adapter: path.join(B08, 'PhaseB08DisposableAdapter.gs'),
  runner: path.join(B08, 'B08_DisposableQA_QA_ONLY.gs'),
  manifest: path.join(B08, 'appsscript.json'),
  hooks: path.join(B08, 'B08_HOOKS.json'),
  seeder: path.join(B08, 'seed/B08_Seeder_QA_ONLY.gs')
};
const ALLOWED_SCOPES = [
  'https://www.googleapis.com/auth/script.scriptapp',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/userinfo.email'
];
const EXCLUDED_FROM_BUNDLE = ['SalesStaging.gs', 'StagingDiagnostics.gs', 'Index.html'];
const NEUTRALIZE_REQUIRED = ['doGet', 'savePdf', 'setCompany'];
// Forbidden anywhere in the WHOLE generated bundle (hooked Code.gs included).
const BUNDLE_FORBIDDEN = [
  /DriveApp/, /setSharing/, /HtmlService/, /UrlFetchApp/, /GmailApp/, /MailApp/, /CalendarApp/,
  /DocumentApp/, /FormApp/, /SlidesApp/, /newBlob/, /base64Decode/, /ScriptApp\.newTrigger/, /deleteTrigger/,
  /openByUrl/, /SpreadsheetApp\.create/, /SpreadsheetApp\.open\(/, /getActiveSpreadsheet/, /SpreadsheetApp\.getActive\b/,
  /eval\(|new Function/
];
// Additionally forbidden in QA-only files (adapter + runner).
const QA_FORBIDDEN = [
  /DriveApp/, /setSharing/, /UrlFetchApp/, /GmailApp/, /MailApp/, /HtmlService/, /CalendarApp/,
  /ScriptApp\.newTrigger/, /deleteTrigger/, /openByUrl/, /SpreadsheetApp\.create/, /\bopen\(/,
  /function\s+doGet/, /function\s+doPost/, /fixFormulas/, /setFormula/, /setValues?\(/,
  /clear(Content|Contents)?\(/, /deleteRows?\(/, /insertRow/, /\.copyTo\(/, /makeCopy/,
  /QA-PB-/, /phaseB07|PHASEB_B07|phaseBPreflightReadOnly|PHASEB_QA|KAIDEE_PHASEB_SYNTHETIC/,
  /KAIDEE_STAGING_/, /getActiveSpreadsheet/,
  /eval\(|new Function/
];
// Protected spreadsheet/script IDs are NEVER embedded in this public repository.
// Only their SHA-256 is listed; any ID-shaped token in a QA file whose SHA-256 matches fails closed.
// sha256(STAGING spreadsheet ID referenced by apps-script/Code.gs qaStagingStaffGmailConfigReadOnly).
const PROTECTED_ID_SHA256 = Object.freeze([
  'b265d0896ef5a2de221cab006617335a872180184dbdc6d492b3a832bd8c7b56'
]);
// Owner-private additions (Production, synthetic QA, B07 project ...) via environment:
//   B08_PROTECTED_ID_SHA256=<64-hex>[,<64-hex>...]   (malformed value -> fail closed)
const ID_TOKEN = /[A-Za-z0-9_-]{20,}/g;
function protectedIdHashes(env = process.env) {
  const extra = String(env.B08_PROTECTED_ID_SHA256 || '').split(',').map(x => x.trim()).filter(Boolean);
  if (extra.some(h => !/^[0-9a-f]{64}$/.test(h))) fail('B08_PROTECTED_ID_SHA256 must be comma-separated 64-hex SHA-256 values');
  const all = PROTECTED_ID_SHA256.concat(extra);
  if (!all.length) fail('protected ID hash list is empty');
  return all;
}
/** Returns matches as {hash, offset} only — never the token text, so reports cannot leak the ID. */
function protectedIdHits(text, hashes) {
  const set = new Set(hashes), hits = [];
  let m;
  ID_TOKEN.lastIndex = 0;
  while ((m = ID_TOKEN.exec(String(text)))) {
    const h = sha256(m[0]);
    if (set.has(h)) hits.push({hash: h, offset: m.index});
  }
  return hits;
}

// Seeder file (SEED bundle only). It may write cells, but only these methods on the blank target.
const SEED_FORBIDDEN = [
  /DriveApp/, /setSharing/, /UrlFetchApp/, /GmailApp/, /MailApp/, /HtmlService/, /CalendarApp/,
  /ScriptApp\.newTrigger/, /deleteTrigger/, /openById/, /openByUrl/, /SpreadsheetApp\.create/, /SpreadsheetApp\.open\(/,
  /getActiveSpreadsheet/, /SpreadsheetApp\.getActive\b/, /function\s+doGet/, /function\s+doPost/, /fixFormulas/,
  /deleteSheet/, /\.clear/, /deleteRows?\(/, /deleteColumns?\(/, /insertRow/, /insertColumn/, /\.copyTo\(/, /makeCopy/,
  /\.setValue\(/, /\.setFormula\(/, /\.setProperty\(/, /\.deleteProperty\(/, /stagingDb_\(/,
  /QA-PB-/, /phaseB07|PHASEB_B07|phaseBPreflightReadOnly|PHASEB_QA|KAIDEE_PHASEB_SYNTHETIC/, /KAIDEE_STAGING_/,
  /eval\(|new Function/
];
const SEED_WRITE_METHODS = ['setValues', 'setFormulas', 'setName', 'insertSheet'];
// F-15: the ONLY methods the seed read-back facade may expose (reviewed). Anything else is denied.
const EXPECTED_READONLY_ALLOW = {
  Spreadsheet: {getSheetByName: 'Sheet', getSheets: 'Sheet[]', getName: 'value', getId: 'value'},
  Sheet: {getRange: 'Range', getLastRow: 'value', getLastColumn: 'value', getName: 'value'},
  Range: {getValues: 'value', getDisplayValues: 'value', getFormulas: 'value', getFormula: 'value', getValue: 'value', getDisplayValue: 'value'}
};
function readonlyAllowlistOf(adapter) {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(adapter + '\n;globalThis.__allow = B08_READONLY_ALLOW;', ctx);
  return JSON.parse(JSON.stringify(ctx.__allow));
}

// Entry points that write Script Properties of THEIR OWN project without touching a
// spreadsheet. Allowed only with a reason; the adapter key allowlist STOPs B08 afterwards.
// Since F-13 no business entry point may write outside the gate, so this allowlist is empty
// (setCompany is neutralized). The mechanism stays so that any future exception must be explicit.
const PROPERTY_ONLY_ENTRYPOINTS = {};
// F-13: Code.gs entry points that LOOK like writers to the lexical graph but never mutate:
// they only call dreqSheet_(false), which returns null instead of creating a sheet. They still
// pass stagingDb_()'s seed-completion gate before any spreadsheet access.
const READ_PATH_EXEMPT = {
  getData: 'readDelReqs_ -> dreqSheet_(false): no create, read only',
  checkSetup: 'getData/readDelReqs_ -> dreqSheet_(false): no create, read only'
};
const SINKS = {
  sheetWrite: /\.(setValue|setValues|setFormula|setFormulas|insertSheet|insertRowAfter|insertRows?|deleteRows?|deleteSheet|clear|clearContent|clearContents|appendRow|copyTo)\(/,
  propWrite: /\.(setProperty|setProperties|deleteProperty|deleteAllProperties)\(/,
  forbiddenService: /DriveApp|setSharing|HtmlService|UrlFetchApp|GmailApp|MailApp/,
  spreadsheetSource: /SpreadsheetApp\.(openById|openByUrl|open|getActive|getActiveSpreadsheet|create)\b/
};
const sha256 = t => crypto.createHash('sha256').update(t, 'utf8').digest('hex');
const count = (text, needle) => text.split(needle).length - 1;
const read = f => fs.readFileSync(f, 'utf8');

function fail(msg) { throw new Error('B08_STATIC_FAIL: ' + msg); }

/** Removes // and /* *\/ comments while respecting '...', "..." and `...` literals. */
function stripComments(src) {
  let out = '', i = 0, q = null;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (q) { out += c; if (c === '\\') { out += n || ''; i += 2; continue; } if (c === q) q = null; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; out += c; i++; continue; }
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; continue; }
    out += c; i++;
  }
  return out;
}

function lineCounts(text) {
  const m = new Map();
  text.split('\n').forEach(l => m.set(l, (m.get(l) || 0) + 1));
  return m;
}
function multisetMinus(a, b) {
  const out = [];
  for (const [l, n] of a) for (let k = (b.get(l) || 0); k < n; k++) out.push(l);
  return out.sort();
}

function buildHookedCode(base, spec) {
  if (sha256(base) !== spec.baseCodeSha256) fail('apps-script/Code.gs SHA-256 differs from reviewed base; re-review hooks');
  let out = base;
  const expectedAdded = [], expectedRemoved = [];
  spec.hooks.forEach(h => {
    if (count(out, h.anchor) !== 1) fail('hook anchor must occur exactly once: ' + h.point);
    const rep = h.replacement.split('\n');
    if (!rep.every(l => l === h.anchor || /phaseB08Fault_\('[A-Z_]+', r\.id\)/.test(l) || l === '  b08BusinessGate_(); // B08 QA-ONLY HOOK'))
      fail('hook replacement contains unreviewed line: ' + h.point);
    if (!rep.includes(h.anchor)) expectedRemoved.push(h.anchor);
    rep.filter(l => l !== h.anchor).forEach(l => expectedAdded.push(l));
    out = out.replace(h.anchor, () => h.replacement);
  });
  const names = (spec.neutralize || []).map(n => n.name);
  NEUTRALIZE_REQUIRED.forEach(n => { if (!names.includes(n)) fail('required neutralization missing: ' + n); });
  (spec.neutralize || []).forEach(n => {
    const start = out.indexOf(n.signature);
    if (start < 0 || count(out, n.signature) !== 1 || count(base, 'function ' + n.name + '(') !== 1)
      fail('neutralize target must occur exactly once: ' + n.name);
    const end = out.indexOf('\n}\n', start);
    const original = out.slice(start, end + 3);
    if (sha256(original) !== n.sha256) fail('neutralize target body changed; re-review: ' + n.name);
    const stubRe = new RegExp('^function ' + n.name + "\\(\\) \\{ throw new Error\\('PHASEB08_STOP: [^'\\\\]+'\\); \\} // B08 QA-ONLY NEUTRALIZED$");
    if (!stubRe.test(n.stub)) fail('neutralize stub is not a pure fail-closed throw: ' + n.name);
    original.slice(0, -1).split('\n').forEach(l => expectedRemoved.push(l));
    expectedAdded.push(n.stub);
    out = out.slice(0, start) + n.stub + '\n' + out.slice(end + 3);
  });
  // Multiset line proof: the ONLY differences are the reviewed hook lines and stubs.
  const b = lineCounts(base), o = lineCounts(out);
  if (JSON.stringify(multisetMinus(o, b)) !== JSON.stringify(expectedAdded.slice().sort()) ||
      JSON.stringify(multisetMinus(b, o)) !== JSON.stringify(expectedRemoved.slice().sort()))
    fail('hooked copy differs from base beyond the reviewed hook/neutralize lines');
  const body = /function writeIssue_\(r, who\) \{[\s\S]*?\n\}\n/.exec(out);
  if (!body || count(body[0], 'phaseB08Fault_(') !== 3 || count(out, 'phaseB08Fault_(') !== 3)
    fail('all 3 hooks must be inside writeIssue_ and nowhere else');
  if (count(out, 'b08BusinessGate_(') !== 1 ||
      !/function withLock_\(fn\) \{\n  b08BusinessGate_\(\); \/\/ B08 QA-ONLY HOOK\n  const lock = LockService\.getScriptLock\(\);/.test(out))
    fail('business gate must be the first statement of withLock_ and appear nowhere else in Code.gs');
  return out;
}

/** Lexical call graph over comment-stripped sources. Conservative (may over-report). */
function callGraph(files) {
  const fns = {};
  Object.keys(files).forEach(f => {
    const t = stripComments(files[f]);
    const re = /^(?:function\s+([A-Za-z0-9_$]+)\s*\(|const\s+([A-Za-z0-9_$]+)\s*=\s*(?:\([^)]*\)|[A-Za-z0-9_]+)\s*=>)/gm;
    const starts = []; let m;
    while ((m = re.exec(t))) starts.push({name: m[1] || m[2], i: m.index, arrow: !m[1]});
    starts.forEach((s, k) => {
      const whole = t.slice(s.i, k + 1 < starts.length ? starts[k + 1].i : t.length);
      const at = s.arrow ? whole.indexOf('=>') + 2 : whole.indexOf('{');
      fns[s.name] = {file: f, body: whole.slice(at), declared: s.arrow ? 'const' : 'function'};
    });
  });
  const names = Object.keys(fns);
  const callees = {};
  names.forEach(n => {
    callees[n] = names.filter(o => o !== n && new RegExp('(^|[^A-Za-z0-9_$.])' + o.replace(/\$/g, '\\$') + '\\s*\\(').test(fns[n].body));
  });
  const reach = n => { const seen = new Set([n]), q = [n]; while (q.length) for (const c of callees[q.shift()] || []) if (!seen.has(c)) { seen.add(c); q.push(c); } return [...seen]; };
  return {fns, callees, reach};
}

/** Every editor-callable entry point must be guarded, property-only allowlisted, or sink-free. */
function entryPointPolicy(files, opts = {}) {
  const allow = opts.propertyOnly || PROPERTY_ONLY_ENTRYPOINTS;
  const g = callGraph(files);
  const sources = Object.keys(g.fns).filter(n => SINKS.spreadsheetSource.test(g.fns[n].body));
  const report = [], violations = [];
  if (JSON.stringify(sources) !== JSON.stringify(['b08OpenTarget_'])) violations.push('spreadsheet object sources must be exactly [b08OpenTarget_], got ' + JSON.stringify(sources));
  Object.keys(g.fns).filter(n => !/_$/.test(n) && g.fns[n].declared === 'function').sort().forEach(n => {
    const r = g.reach(n), via = k => r.filter(x => SINKS[k].test(g.fns[x].body));
    const e = {fn: n, file: g.fns[n].file, guarded: r.includes('b08OpenTarget_'), sheetWrite: via('sheetWrite'),
      propWrite: via('propWrite'), forbidden: via('forbiddenService')};
    e.class = e.forbidden.length ? 'FORBIDDEN' : e.sheetWrite.length ? (e.guarded ? 'GUARDED_WRITE' : 'UNGUARDED_WRITE')
      : e.propWrite.length && !e.guarded ? (allow[n] ? 'PROPERTY_ONLY_ALLOWED' : 'UNGUARDED_PROPERTY_WRITE')
      : e.guarded ? (e.propWrite.length ? 'GUARDED_WRITE' : 'GUARDED_READ') : 'NO_GOOGLE_WRITE';
    if (['FORBIDDEN', 'UNGUARDED_WRITE', 'UNGUARDED_PROPERTY_WRITE'].includes(e.class)) violations.push(n + ': ' + e.class);
    // F-13: every Code.gs business writer must pass withLock_ (whose first statement is the gate hook).
    e.businessGated = e.file === 'Code.gs' && (e.sheetWrite.length || e.propWrite.length)
      ? (r.includes('withLock_') ? 'WITHLOCK_GATE' : (READ_PATH_EXEMPT[n] ? 'READ_PATH_EXEMPT' : 'UNGATED')) : 'N/A';
    if (e.businessGated === 'UNGATED' && !opts.skipBusinessGate) violations.push(n + ': BUSINESS_MUTATION_UNGATED');
    report.push(e);
  });
  return {sources, report, violations};
}

function staticVerify(src, opts = {}) {
  const findings = [];
  const ok = (cond, msg) => { findings.push({check: msg, pass: !!cond}); if (!cond) fail(msg); };
  const idHashes = opts.protectedIdSha256 || protectedIdHashes(opts.env);
  const spec = JSON.parse(src.hooks);
  const hooked = buildHookedCode(src.code, spec);
  ok(true, 'Code.gs pinned base, exact anchors, neutralize bodies pinned, multiset line proof');
  ok(count(src.code, 'lock.waitLock(20000);') === 1 && /B08_LOCK_WAIT_MS = 20000;/.test(src.runner),
    'withLock_ waitLock(20000) matches runner B08_LOCK_WAIT_MS');
  ok(!/function\s+stagingDb_/.test(src.code) && count(src.adapter, 'function stagingDb_(') === 1 &&
    !/function\s+stagingDb_/.test(src.runner), 'exactly one stagingDb_ definition (B08 adapter)');
  ok(count(src.adapter, 'function b08OpenTarget_(') === 1 && !/function\s+b08OpenTarget_/.test(src.code + src.runner),
    'exactly one b08OpenTarget_ definition (B08 adapter)');
  ok(!/function\s+(phaseB08Seed\w*|b08SeedLayout_|b08PreSeedGuard_|b08SeedVerify_|b08SeedAttest_)\s*\(/.test(src.adapter + src.runner),
    'RUNNER files define no seeder functions');
  ok(!/seeding\s*:\s*true/.test(src.adapter + src.runner), 'only the seeder may request seeding-mode guard');
  ok(count(src.adapter, 'function b08BusinessGate_(') === 1 && count(src.adapter, 'function b08WithSeedReadback_(') === 1 &&
    count(stripComments(src.adapter + src.runner), 'b08WithSeedReadback_(') === 1,
    'business gate + seed-readback wrapper defined once in the adapter; readback never entered from RUNNER files');
  ok(/function stagingDb_\(\) \{\n  const t = b08OpenTarget_\(\), ss = t\.ss, who = t\.who;\n  const mode = b08BusinessGate_\(\{allowSeedReadback: true\}\);/.test(src.adapter),
    'stagingDb_ applies the seed-completion gate immediately after opening the target');
  ok(JSON.stringify(readonlyAllowlistOf(src.adapter)) === JSON.stringify(EXPECTED_READONLY_ALLOW),
    'F-15: read-only facade allowlist equals the reviewed method set exactly');
  const ro = (/function b08ReadOnly_\(raw, kind\) \{[\s\S]*?\n\}\n/.exec(src.adapter) || [''])[0];
  ok(ro && /return new Proxy\(Object\.freeze\(Object\.create\(null\)\), \{/.test(ro) && !/\^\(set\|insert/.test(ro) &&
    /if \(!ret\) return deny\(key\);/.test(ro) && !/return raw\b/.test(ro),
    'F-15: facade is default-deny over a frozen null-prototype target and never returns the raw object');
  NEUTRALIZE_REQUIRED.forEach(n => ok(count(hooked, 'function ' + n + '(') === 1 &&
    new RegExp('function ' + n + "\\(\\) \\{ throw new Error\\('PHASEB08_STOP:").test(hooked), n + ' neutralized to a fail-closed stub in bundle'));
  const bundleText = {code: hooked, adapter: src.adapter, runner: src.runner};
  Object.keys(bundleText).forEach(k => BUNDLE_FORBIDDEN.forEach(re =>
    ok(!re.test(stripComments(bundleText[k])), 'bundle ' + k + ' free of ' + re)));
  ['adapter', 'runner', 'manifest', 'hooks'].forEach(k =>
    ok(protectedIdHits(src[k], idHashes).length === 0, k + ' contains no protected ID (SHA-256 token match)'));
  ['adapter', 'runner'].forEach(k => QA_FORBIDDEN.forEach(re => {
    const text = k === 'adapter' ? src.adapter.replace("protectedTitles: ['KAIDEE-STOCK-SYNTHETIC-QA-STEP8-15']", '') : src.runner;
    ok(!re.test(text), k + ' free of forbidden token ' + re);
  }));
  ok(count(src.adapter, "protectedTitles: ['KAIDEE-STOCK-SYNTHETIC-QA-STEP8-15']") === 1 &&
    count(src.adapter + src.runner, 'KAIDEE-STOCK-SYNTHETIC-QA-STEP8-15') === 1,
    'protected title appears only in the denylist constant');
  ok(count(hooked + src.adapter + src.runner, 'SpreadsheetApp.openById(') === 1 &&
    /function b08OpenTarget_\(\) \{\n  const who = b08Identity_\(\);\n  const ss = SpreadsheetApp\.openById\(who\.id\);/.test(src.adapter),
    'openById exactly once in the whole bundle, inside b08OpenTarget_ right after b08Identity_()');
  ok(count(src.adapter + src.runner, '.setProperty(') === 1 && count(src.adapter + src.runner, '.deleteProperty(') === 1 &&
    /function b08SetEvidence_[\s\S]*?\.setProperty\(/.test(src.runner) &&
    /function b08DeleteEvidence_[\s\S]*?\.deleteProperty\(/.test(src.runner),
    'QA property writes only via PHASEB08_ evidence helpers');
  ok(count(src.adapter + src.runner, 'setValue(') === 0, 'QA files never write cells directly');
  const policy = entryPointPolicy({'Code.gs': hooked, 'PhaseB08DisposableAdapter.gs': src.adapter, 'B08_DisposableQA_QA_ONLY.gs': src.runner});
  ok(policy.violations.length === 0, 'entry-point policy: ' + (policy.violations.join('; ') || 'no unguarded write / forbidden path'));
  const m = JSON.parse(src.manifest);
  ok(JSON.stringify((m.oauthScopes || []).slice().sort()) === JSON.stringify(ALLOWED_SCOPES),
    'manifest scopes exactly spreadsheets + script.scriptapp + userinfo.email');
  ok(!m.webapp && !m.executionApi && !m.addOns && !m.dependencies && !m.urlFetchWhitelist,
    'manifest has no web app / API executable / add-on / advanced services');
  ok(m.runtimeVersion === 'V8', 'manifest runtime V8');
  return {hooked, findings, spec, policy};
}

/** Static rules for the SEED bundle = RUNNER bundle rules + seeder-specific rules. */
function staticVerifySeed(src, opts = {}) {
  const base = staticVerify(src, opts);
  const findings = base.findings.slice();
  const ok = (cond, msg) => { findings.push({check: msg, pass: !!cond}); if (!cond) fail(msg); };
  const idHashes = opts.protectedIdSha256 || protectedIdHashes(opts.env);
  const seed = src.seeder, code = stripComments(seed);
  ok(typeof seed === 'string' && seed.length > 0, 'seeder source present');
  SEED_FORBIDDEN.forEach(re => ok(!re.test(code), 'seeder free of ' + re));
  BUNDLE_FORBIDDEN.forEach(re => ok(!re.test(code), 'seeder free of bundle-forbidden ' + re));
  ok(protectedIdHits(seed, idHashes).length === 0, 'seeder contains no protected ID (SHA-256 token match)');
  const writes = (code.match(/\.(set[A-Z]\w*|insert\w*)\(/g) || []).map(x => x.slice(1, -1));
  ok(writes.length > 0 && writes.every(w => SEED_WRITE_METHODS.indexOf(w) >= 0),
    'seeder write methods limited to ' + SEED_WRITE_METHODS.join('/') + ' (found ' + Array.from(new Set(writes)).join('/') + ')');
  ok(count(code, 'b08OpenTarget_()') === 1 && /function b08PreSeedGuard_\(\) \{\n  b08SeedAttest_\(\);\n  const t = b08OpenTarget_\(\);/.test(seed),
    'seeder opens the target exactly once, inside b08PreSeedGuard_ after SEED attestation');
  ok(count(code, 'b08WithSeedReadback_(') === 1 && /function b08SeedVerify_\(who\) \{\n  return b08WithSeedReadback_\(/.test(seed),
    'seed read-back runs only inside b08WithSeedReadback_ (read-only proxy, STARTED only)');
  ok(!/withLock_\(/.test(code), 'seeder never uses the business withLock_ (gated)');
  const once = (/function phaseB08SeedDisposableOnce\(\) \{[\s\S]*?\n\}\n/.exec(seed) || [''])[0];
  const iLock = once.indexOf('lock.tryLock('), iGuard = once.indexOf('b08PreSeedGuard_()'), iStart = once.indexOf("b08SetEvidence_(B08_SEED.state, 'STARTED')");
  ok(iLock > 0 && iLock < iGuard && iGuard < iStart && /\} finally \{\n    lock\.releaseLock\(\);\n  \}/.test(once),
    'F-14: script lock acquired before the in-lock state/blank re-check and STARTED; released in finally');
  ok(/if \(started\) \{/.test(once), 'F-14: failure marks REVIEW_REQUIRED only if THIS execution wrote STARTED');
  ok(count(code, '{seeding: true}') === 1, 'seeding-mode guard requested exactly once (b08SeedVerify_)');
  ['phaseB08SeedPreflightReadOnly', 'phaseB08SeedDisposableOnce'].forEach(fn => {
    const body = (new RegExp('function ' + fn + '\\(\\) \\{[\\s\\S]*?\\n\\}\\n').exec(seed) || [''])[0];
    ok(/^function \w+\(\) \{\n  b08SeedAttest_\(\);/.test(body) && body.indexOf('b08SeedAttest_()') < body.indexOf('b08PreSeedGuard_()'),
      fn + ' attests the SEED bundle (first statement) before calling the pre-seed guard');
  });
  const iStarted = seed.indexOf("b08SetEvidence_(B08_SEED.state, 'STARTED')");
  ok(iStarted > 0 && iStarted < seed.indexOf(".setName(") &&
    seed.indexOf("b08SetEvidence_(B08_SEED.done") < seed.indexOf("b08SetEvidence_(B08_SEED.state, 'COMPLETED')"),
    'seed state machine: STARTED before writes, DONE recorded before COMPLETED');
  ok(!/deleteProperty|b08DeleteEvidence_/.test(code), 'seeder never clears seed markers');
  ok((code.match(/LockService\.\w+/g) || []).every(x => x === 'LockService.getScriptLock'), 'seeder uses only the script lock');
  const policy = entryPointPolicy({'Code.gs': base.hooked, 'PhaseB08DisposableAdapter.gs': src.adapter,
    'B08_DisposableQA_QA_ONLY.gs': src.runner, 'B08_Seeder_QA_ONLY.gs': src.seeder});
  ok(policy.violations.length === 0, 'seed bundle entry-point policy: ' + (policy.violations.join('; ') || 'ok'));
  ['phaseB08SeedPreflightReadOnly', 'phaseB08SeedDisposableOnce'].forEach(fn => {
    const e = policy.report.find(x => x.fn === fn);
    ok(e && e.guarded, fn + ' is guarded by b08OpenTarget_');
  });
  return {hooked: base.hooked, findings, policy};
}

const ATTESTED = ['writeIssue_', 'setReqStatus', 'withLock_', 'stagingDb_', 'b08OpenTarget_', 'b08BusinessGate_', 'b08WithSeedReadback_', 'b08ReadOnly_', 'setCompany', 'b08Identity_', 'b08ValidateConfig_',
  'b08FixtureGuard_', 'b08SeedStateGuard_', 'b08AssertFreshFixture_', 'b08Reconcile52_', 'b08Snapshot_', 'b08Cell_',
  'b08IdentityReport_', 'phaseB08ValidateReadOnly', 'phaseB08PostSeedReadinessReadOnly', 'phaseB08Fault_', 'savePdf', 'doGet'];
const ATTESTED_SEED = ['b08OpenTarget_', 'stagingDb_', 'b08BusinessGate_', 'b08WithSeedReadback_', 'b08ReadOnly_', 'withLock_', 'b08Identity_', 'b08ValidateConfig_', 'b08FixtureGuard_', 'b08AssertFreshFixture_',
  'b08Reconcile52_', 'b08InvFormula_', 'b08SetEvidence_', 'b08Snapshot_', 'b08IdentityReport_',
  'b08SeedLayout_', 'b08PreSeedGuard_', 'b08SeedVerify_', 'phaseB08SeedPreflightReadOnly', 'phaseB08SeedDisposableOnce'];
/** Loads the bundle in a sandbox (no Google services) to hash function source text. */
function functionHashes(hooked, adapter, runner, seeder) {
  const list = seeder ? ATTESTED_SEED : ATTESTED;
  const ctx = {console};
  vm.createContext(ctx);
  vm.runInContext(hooked + '\n' + adapter + '\n' + runner + '\n' + (seeder || '') + '\n;globalThis.__fns={' + list.join(',') + '};', ctx);
  const out = {};
  list.forEach(k => { out[k] = sha256(Function.prototype.toString.call(ctx.__fns[k])); });
  return out;
}

function identitySource(src, hooked, sourceSha, kind = 'RUNNER') {
  if (kind !== 'RUNNER' && kind !== 'SEED') fail('bundle kind must be RUNNER or SEED');
  const id = {
    bundleKind: kind,
    sourceGitSha: sourceSha || 'UNSPECIFIED',
    baseCodeSha256: sha256(src.code),
    hookedCodeSha256: sha256(hooked),
    adapterSha256: sha256(src.adapter),
    runnerSha256: sha256(src.runner),
    manifestSha256: sha256(src.manifest),
    seederSha256: kind === 'SEED' ? sha256(src.seeder) : null,
    functionSha256: functionHashes(hooked, src.adapter, src.runner, kind === 'SEED' ? src.seeder : null)
  };
  return '// GENERATED by scripts/b08-qa-bundle.js — DO NOT EDIT. Disposable QA only.\n' +
    'const B08_BUNDLE_IDENTITY = Object.freeze(' + JSON.stringify(id, null, 2) + ');\n';
}

function loadSources(files = FILES) {
  const src = {};
  Object.keys(files).forEach(k => { src[k] = read(files[k]); });
  return src;
}

function build(outDir, sourceSha, kind = 'RUNNER') {
  const abs = path.resolve(outDir);
  if (abs === ROOT || (abs.startsWith(ROOT + path.sep) && !abs.startsWith(path.join(ROOT, 'exports') + path.sep)))
    fail('output must be outside the repository or under gitignored exports/');
  const src = loadSources();
  const {hooked, findings, policy} = kind === 'SEED' ? staticVerifySeed(src) : staticVerify(src);
  fs.mkdirSync(abs, {recursive: true});
  const bundle = {
    'Code.gs': hooked,
    'PhaseB08DisposableAdapter.gs': src.adapter,
    'B08_DisposableQA_QA_ONLY.gs': src.runner,
    'B08_BundleIdentity.gs': identitySource(src, hooked, sourceSha, kind),
    'appsscript.json': src.manifest
  };
  if (kind === 'SEED') bundle['B08_Seeder_QA_ONLY.gs'] = src.seeder;
  Object.keys(bundle).forEach(n => fs.writeFileSync(path.join(abs, n), bundle[n]));
  const manifest = Object.fromEntries(Object.keys(bundle).map(n => [n, sha256(bundle[n])]));
  manifest.excluded = EXCLUDED_FROM_BUNDLE;
  manifest.neutralized = NEUTRALIZE_REQUIRED;
  manifest.bundleKind = kind;
  fs.writeFileSync(path.join(abs, 'BUNDLE_SHA256.json'), JSON.stringify(manifest, null, 2) + '\n');
  fs.writeFileSync(path.join(abs, 'ENTRYPOINT_POLICY.json'), JSON.stringify(policy, null, 2) + '\n');
  return {outDir: abs, manifest, checks: findings.length};
}

/** Offline restore equality using the SAME comparator shipped in the runner. */
function compareSnapshotFiles(a, b) {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(read(FILES.runner) + ';globalThis.__cmp=b08CompareSnapshots_;', ctx);
  return ctx.__cmp(JSON.parse(read(a)), JSON.parse(read(b)));
}

module.exports = {buildHookedCode, staticVerify, entryPointPolicy, callGraph, stripComments, functionHashes,
  identitySource, loadSources, build, compareSnapshotFiles, sha256, FILES, QA_FORBIDDEN, BUNDLE_FORBIDDEN,
  ALLOWED_SCOPES, PROPERTY_ONLY_ENTRYPOINTS, ATTESTED, ATTESTED_SEED, PROTECTED_ID_SHA256, protectedIdHashes, protectedIdHits,
  staticVerifySeed, SEED_FORBIDDEN, SEED_WRITE_METHODS, READ_PATH_EXEMPT, NEUTRALIZE_REQUIRED, EXPECTED_READONLY_ALLOW, readonlyAllowlistOf};

if (require.main === module) {
  const [cmd, a, b] = process.argv.slice(2);
  if (cmd === 'verify') {
    const src = loadSources(), r = staticVerify(src), s = staticVerifySeed(src);
    console.log(JSON.stringify({status: 'B08_STATIC_PASS', runnerChecks: r.findings.length, seedChecks: s.findings.length,
      entryPoints: r.policy.report.length, seedEntryPoints: s.policy.report.length}));
  }
  else if (cmd === 'build') console.log(JSON.stringify(build(a || 'exports/b08-bundle', b), null, 2));
  else if (cmd === 'build-seed') console.log(JSON.stringify(build(a || 'exports/b08-seed-bundle', b, 'SEED'), null, 2));
  else if (cmd === 'compare') { const r = compareSnapshotFiles(a, b); console.log(JSON.stringify(r, null, 2)); process.exitCode = r.equal ? 0 : 1; }
  else { console.error('usage: b08-qa-bundle.js verify | build <outDir> [gitSha] | build-seed <outDir> [gitSha] | compare <a.json> <b.json>'); process.exitCode = 2; }
}
