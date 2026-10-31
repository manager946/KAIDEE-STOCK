'use strict';
// B08 static source verification — OFFLINE. Proves the disposable bundle is a
// mechanical, reviewed transformation and that QA-only files cannot reach
// protected targets. Repository apps-script/* is read, never modified.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const lib = require('../scripts/b08-qa-bundle');

const fresh = () => lib.loadSources();

test('static verification passes for the reviewed sources', () => {
  const {findings, hooked} = lib.staticVerify(fresh());
  assert.ok(findings.length > 40);
  assert.ok(findings.every(f => f.pass));
  assert.equal((hooked.match(/B08 QA-ONLY HOOK/g) || []).length, 3);
});

test('repository Code.gs is the pinned reviewed base and contains no B08 hook', () => {
  const src = fresh(), spec = JSON.parse(src.hooks);
  assert.equal(lib.sha256(src.code), spec.baseCodeSha256);
  assert.ok(!src.code.includes('phaseB08'));
  assert.ok(!fs.readFileSync('apps-script/SalesStaging.gs', 'utf8').includes('phaseB08'));
});

test('hooked copy differs from base only by 3 hook lines and 2 neutralized functions', () => {
  const src = fresh(), spec = JSON.parse(src.hooks);
  const hooked = lib.buildHookedCode(src.code, spec);
  const b = src.code.split('\n'), h = hooked.split('\n');
  // +2 hook lines, doGet 5 lines -> 1 stub, savePdf 26 lines -> 1 stub
  assert.equal(h.length - b.length, 2 - 4 - 25);
  assert.deepEqual(h.filter(l => !b.includes(l)).map(l => l.trim().split(' // ')[0].slice(0, 38)), [
    "function doGet() { throw new Error('PH",
    "phaseB08Fault_('BEFORE_INTENT_READ', r",
    "phaseB08Fault_('BEFORE_INTENT_WRITE', ",
    "found.forEach(m => { if (m.v[1] === ''",
    "function savePdf() { throw new Error('"
  ]);
  for (const word of ['DriveApp', 'setSharing', 'HtmlService', 'createFile', 'base64Decode'])
    assert.equal(lib.stripComments(hooked).includes(word), false, word + ' must not exist in bundle Code.gs');
  assert.ok(src.code.includes('DriveApp') && src.code.includes('function savePdf(no, vatMode, b64, docType)'),
    'repository source still holds the original savePdf (production source untouched)');
});

test('F-1 neutralization is pinned and fail-closed', () => {
  const src = fresh();
  const drop = JSON.parse(src.hooks); drop.neutralize = drop.neutralize.filter(n => n.name !== 'savePdf');
  assert.throws(() => lib.buildHookedCode(src.code, drop), /required neutralization missing: savePdf/);
  const drift = JSON.parse(src.hooks); drift.neutralize[1].sha256 = '0'.repeat(64);
  assert.throws(() => lib.buildHookedCode(src.code, drift), /body changed; re-review: savePdf/);
  const sneaky = JSON.parse(src.hooks);
  sneaky.neutralize[1].stub = "function savePdf() { DriveApp.getFiles(); } // B08 QA-ONLY NEUTRALIZED";
  assert.throws(() => lib.buildHookedCode(src.code, sneaky), /not a pure fail-closed throw/);
  const partial = JSON.parse(src.hooks);
  partial.neutralize[1].stub = "function savePdf() { throw new Error('PHASEB08_STOP: x'); DriveApp.getFiles(); } // B08 QA-ONLY NEUTRALIZED";
  assert.throws(() => lib.buildHookedCode(src.code, partial), /not a pure fail-closed throw/);
  const extraLine = JSON.parse(src.hooks);
  extraLine.hooks[0].replacement += '\n  DriveApp.getFiles();';
  assert.throws(() => lib.buildHookedCode(src.code, extraLine), /unreviewed line/);
});

test('entry-point policy: every editor entry point is guarded, property-only allowlisted, or write-free', () => {
  const {policy} = lib.staticVerify(fresh());
  assert.deepEqual([...policy.sources], ['stagingDb_']);
  assert.deepEqual([...policy.violations], []);
  const byClass = c => policy.report.filter(e => e.class === c).map(e => e.fn);
  assert.deepEqual(byClass('FORBIDDEN'), []);
  assert.deepEqual(byClass('UNGUARDED_WRITE'), []);
  assert.deepEqual(byClass('PROPERTY_ONLY_ALLOWED'), ['setCompany']);
  for (const fn of ['savePdf', 'doGet']) assert.equal(policy.report.find(e => e.fn === fn).class, 'NO_GOOGLE_WRITE');
  for (const fn of ['setReqStatus', 'saveReq', 'deleteReqs', 'addMovement', 'phaseB08PartialCommitFaultOnce'])
    assert.equal(policy.report.find(e => e.fn === fn).class, 'GUARDED_WRITE');
});

test('entry-point policy rejects unguarded writers, unlisted property writers, Drive paths and second sources', () => {
  const base = {'G.gs': 'function stagingDb_() { return SpreadsheetApp.openById("x"); }\nconst sh_ = n => stagingDb_().getSheetByName(n);\n'};
  const run = extra => lib.entryPointPolicy(Object.assign({}, base, {'X.gs': extra})).violations;
  assert.deepEqual(run('function ok() { sh_("a").getRange(1,1).setValue(1); }'), []);
  assert.match(run('function bad(r) { r.setValue(1); }').join(), /bad: UNGUARDED_WRITE/);
  assert.match(run('function cfg() { PropertiesService.getScriptProperties().setProperty("A","1"); }').join(), /cfg: UNGUARDED_PROPERTY_WRITE/);
  assert.match(run('function pdf() { DriveApp.getFiles(); }').join(), /pdf: FORBIDDEN/);
  assert.match(run('function two() { return SpreadsheetApp.openById("y"); }').join(), /spreadsheet object sources/);
  assert.deepEqual(run('function c() { /* DriveApp.getFiles(); */ return 1; }'), [], 'comments are not code');
});

test('base drift or ambiguous anchor fails closed', () => {
  const src = fresh(), spec = JSON.parse(src.hooks);
  assert.throws(() => lib.buildHookedCode(src.code + '\n// drift', spec), /SHA-256 differs/);
  const dup = JSON.parse(src.hooks); dup.baseCodeSha256 = lib.sha256(src.code + '\n' + spec.hooks[0].anchor);
  assert.throws(() => lib.buildHookedCode(src.code + '\n' + spec.hooks[0].anchor, dup), /exactly once/);
});

const injections = {
  'DriveApp in runner': s => { s.runner += '\nfunction x(){DriveApp.getFiles();}'; },
  'setSharing in runner': s => { s.runner += '\n// .setSharing('; },
  'QA-PB reference': s => { s.runner += "\nconst x='QA-PB-001';"; },
  'B07 runner call': s => { s.runner += '\nfunction y(){phaseB07RecoverAfterIntentOnce();}'; },
  'STAGING property read': s => { s.adapter += "\n// KAIDEE_STAGING_SPREADSHEET_ID"; },
  'second openById': s => { s.runner += '\nfunction z(){SpreadsheetApp.openById("a");}'; },
  'direct cell write': s => { s.runner += '\nfunction w(r){r.setValue(1);}'; },
  'extra property writer': s => { s.runner += '\nfunction v(p){p.setProperty("A","B");}'; },
  'trigger creation': s => { s.runner += '\nfunction u(){ScriptApp.newTrigger("x");}'; },
  'second stagingDb_': s => { s.runner += '\nfunction stagingDb_(){}'; },
  'Drive scope': s => { const m = JSON.parse(s.manifest); m.oauthScopes.push('https://www.googleapis.com/auth/drive'); s.manifest = JSON.stringify(m); },
  'web app manifest': s => { const m = JSON.parse(s.manifest); m.webapp = {access: 'ANYONE'}; s.manifest = JSON.stringify(m); },
  'lock wait mismatch': s => { s.runner = s.runner.replace('B08_LOCK_WAIT_MS = 20000;', 'B08_LOCK_WAIT_MS = 5000;'); },
  'protected title used outside denylist': s => { s.runner += "\n// KAIDEE-STOCK-SYNTHETIC-QA-STEP8-15"; }
};
for (const [name, inject] of Object.entries(injections)) test('static verification rejects: ' + name, () => {
  const s = fresh(); inject(s);
  assert.throws(() => lib.staticVerify(s), /B08_STATIC_FAIL/);
});

test('build refuses output inside tracked repository paths and excludes STAGING files', () => {
  assert.throws(() => lib.build('qa/phase-b/b08/out'), /outside the repository/);
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'b08-bundle-'));
  try {
    const r = lib.build(out, 'TESTSHA');
    const names = fs.readdirSync(out).sort();
    assert.deepEqual(names, ['B08_BundleIdentity.gs', 'B08_DisposableQA_QA_ONLY.gs', 'BUNDLE_SHA256.json',
      'Code.gs', 'ENTRYPOINT_POLICY.json', 'PhaseB08DisposableAdapter.gs', 'appsscript.json']);
    assert.deepEqual(r.manifest.neutralized, ['doGet', 'savePdf']);
    assert.deepEqual(r.manifest.excluded, ['SalesStaging.gs', 'StagingDiagnostics.gs', 'Index.html']);
    const id = fs.readFileSync(path.join(out, 'B08_BundleIdentity.gs'), 'utf8');
    assert.match(id, /"sourceGitSha": "TESTSHA"/);
    assert.match(id, /"writeIssue_": "[0-9a-f]{64}"/);
    assert.match(id, /"savePdf": "[0-9a-f]{64}"/);
  } finally { fs.rmSync(out, {recursive: true, force: true}); }
});

test('offline snapshot comparison CLI helper reports equality and differences', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b08-cmp-'));
  try {
    const a = {business: {ledger: [[{t: '2026-10-31T03:00:00.000Z'}, 'จ่ายออก']], intents: {k: {at: 'x'}}}, config: {title: 'A'}};
    const b = JSON.parse(JSON.stringify(a)); b.config.title = 'B';
    const c = JSON.parse(JSON.stringify(a)); c.business.intents.k.at = 'y';
    for (const [n, v] of [['a', a], ['b', b], ['c', c]]) fs.writeFileSync(path.join(dir, n + '.json'), JSON.stringify(v));
    assert.equal(lib.compareSnapshotFiles(path.join(dir, 'a.json'), path.join(dir, 'b.json')).equal, true);
    const d = lib.compareSnapshotFiles(path.join(dir, 'a.json'), path.join(dir, 'c.json'));
    assert.equal(d.equal, false);
    assert.deepEqual([...d.diffs], ['/intents/k/at']);
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

test('staticVerify enforces the entry-point policy (removing the setCompany allowance must fail)', () => {
  const saved = lib.PROPERTY_ONLY_ENTRYPOINTS.setCompany;
  delete lib.PROPERTY_ONLY_ENTRYPOINTS.setCompany;
  try { assert.throws(() => lib.staticVerify(fresh()), /setCompany: UNGUARDED_PROPERTY_WRITE/); }
  finally { lib.PROPERTY_ONLY_ENTRYPOINTS.setCompany = saved; }
});

test('a future Drive path added to Code.gs is rejected even if the base pin is updated', () => {
  const s = fresh(), spec = JSON.parse(s.hooks);
  s.code += '\nfunction exportLeak() { return DriveApp.getFiles(); }\n';
  spec.baseCodeSha256 = lib.sha256(s.code);
  s.hooks = JSON.stringify(spec);
  assert.throws(() => lib.staticVerify(s), /bundle code free of \/DriveApp\//);
  const s2 = fresh(), spec2 = JSON.parse(s2.hooks);
  s2.code += '\nfunction cellLeak(r) { r.setValue(1); }\n';
  spec2.baseCodeSha256 = lib.sha256(s2.code);
  s2.hooks = JSON.stringify(spec2);
  assert.throws(() => lib.staticVerify(s2), /cellLeak: UNGUARDED_WRITE/);
});

/* ---------- Protected IDs: hash-only detection, no real ID in this public repository ---------- */

const B08_FILES = ['docs/PHASE_B08_0_DISPOSABLE_QA_RUNBOOK_20261031_TH.md', 'qa/phase-b/b08/B08_DisposableQA_QA_ONLY.gs',
  'qa/phase-b/b08/B08_HOOKS.json', 'qa/phase-b/b08/PhaseB08DisposableAdapter.gs', 'qa/phase-b/b08/appsscript.json',
  'scripts/b08-qa-bundle.js', 'tests/helpers/b08-sheets-double.js', 'tests/phase-b08-disposable-runner.test.js',
  'tests/phase-b08-static-verification.test.js'];

test('protected-ID hash list is real: it matches an ID-shaped token in apps-script/Code.gs (without revealing it)', () => {
  const hits = lib.protectedIdHits(fs.readFileSync('apps-script/Code.gs', 'utf8'), lib.PROTECTED_ID_SHA256);
  assert.ok(hits.length >= 1, 'hash must correspond to the STAGING ID used by Code.gs');
  assert.deepEqual(Object.keys(hits[0]).sort(), ['hash', 'offset'], 'hits never carry the token text');
});

test('no B08 file in this repository embeds a protected ID (hash scan of all 9 files)', () => {
  for (const f of B08_FILES) assert.deepEqual(lib.protectedIdHits(fs.readFileSync(f, 'utf8'), lib.PROTECTED_ID_SHA256), [], f);
});

test('static verification rejects a protected ID injected into QA files, detected by hash only', () => {
  const fakeId = 'fakeProtectedSheet_' + 'Q'.repeat(25); // synthetic stand-in, built at runtime
  const hashes = lib.PROTECTED_ID_SHA256.concat([lib.sha256(fakeId)]);
  for (const k of ['runner', 'adapter', 'manifest', 'hooks']) {
    const s = fresh();
    s[k] += k === 'manifest' || k === 'hooks' ? '' : '\n// ' + fakeId;
    if (k === 'manifest') { const m = JSON.parse(s.manifest); m.description = fakeId; s.manifest = JSON.stringify(m); }
    if (k === 'hooks') { const h = JSON.parse(s.hooks); h.comment += ' ' + fakeId; s.hooks = JSON.stringify(h); }
    assert.throws(() => lib.staticVerify(s, {protectedIdSha256: hashes}), new RegExp(k + ' contains no protected ID'));
  }
  assert.doesNotThrow(() => lib.staticVerify(fresh(), {protectedIdSha256: hashes}));
});

test('owner-private protected hashes via B08_PROTECTED_ID_SHA256 are enforced and malformed values fail closed', () => {
  const fakeId = 'ownerPrivateProdSheet_' + 'Z'.repeat(22);
  const s = fresh(); s.runner += '\n// ' + fakeId;
  assert.doesNotThrow(() => lib.staticVerify(s, {env: {}}));
  assert.throws(() => lib.staticVerify(s, {env: {B08_PROTECTED_ID_SHA256: lib.sha256(fakeId)}}), /runner contains no protected ID/);
  assert.throws(() => lib.protectedIdHashes({B08_PROTECTED_ID_SHA256: 'not-a-hash'}), /must be comma-separated 64-hex/);
  assert.equal(lib.protectedIdHashes({}).length, lib.PROTECTED_ID_SHA256.length);
});
