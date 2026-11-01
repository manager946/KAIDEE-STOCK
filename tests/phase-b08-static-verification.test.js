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
  assert.equal((hooked.match(/B08 QA-ONLY HOOK/g) || []).length, 4, '3 fault hooks + 1 business gate hook');
});

test('repository Code.gs is the pinned reviewed base and contains no B08 hook', () => {
  const src = fresh(), spec = JSON.parse(src.hooks);
  assert.equal(lib.sha256(src.code), spec.baseCodeSha256);
  assert.ok(!src.code.includes('phaseB08'));
  assert.ok(!fs.readFileSync('apps-script/SalesStaging.gs', 'utf8').includes('phaseB08'));
});

test('hooked copy differs from base only by 4 hook lines and 3 neutralized functions', () => {
  const src = fresh(), spec = JSON.parse(src.hooks);
  const hooked = lib.buildHookedCode(src.code, spec);
  const b = src.code.split('\n'), h = hooked.split('\n');
  // +3 inserted hook lines (2 fault + 1 gate), doGet 5 -> 1, setCompany 18 -> 1, savePdf 26 -> 1
  assert.equal(h.length - b.length, 3 - 4 - 17 - 25);
  assert.deepEqual(h.filter(l => !b.includes(l)).map(l => l.trim().split(' // ')[0].slice(0, 38)), [
    "function doGet() { throw new Error('PH",
    "b08BusinessGate_();",
    "function setCompany() { throw new Erro",
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
  assert.deepEqual([...policy.sources], ['b08OpenTarget_']);
  assert.deepEqual([...policy.violations], []);
  const byClass = c => policy.report.filter(e => e.class === c).map(e => e.fn);
  assert.deepEqual(byClass('FORBIDDEN'), []);
  assert.deepEqual(byClass('UNGUARDED_WRITE'), []);
  assert.deepEqual(byClass('PROPERTY_ONLY_ALLOWED'), [], 'F-13: no business mutation outside the gate');
  for (const fn of ['savePdf', 'doGet', 'setCompany']) assert.equal(policy.report.find(e => e.fn === fn).class, 'NO_GOOGLE_WRITE');
  const codeWriters = policy.report.filter(e => e.file === 'Code.gs' && e.businessGated !== 'N/A');
  assert.equal(codeWriters.filter(e => e.businessGated === 'UNGATED').length, 0);
  assert.deepEqual(codeWriters.filter(e => e.businessGated === 'READ_PATH_EXEMPT').map(e => e.fn), ['checkSetup', 'getData']);
  assert.equal(codeWriters.filter(e => e.businessGated === 'WITHLOCK_GATE').length, 15, '15 business writers pass withLock_ (gate)');
  for (const fn of ['setReqStatus', 'saveReq', 'deleteReqs', 'addMovement', 'phaseB08PartialCommitFaultOnce'])
    assert.equal(policy.report.find(e => e.fn === fn).class, 'GUARDED_WRITE');
});

test('entry-point policy rejects unguarded writers, unlisted property writers, Drive paths and second sources', () => {
  const base = {'G.gs': 'function b08OpenTarget_() { return SpreadsheetApp.openById("x"); }\nconst sh_ = n => b08OpenTarget_().getSheetByName(n);\n'};
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
    assert.deepEqual(r.manifest.neutralized, ['doGet', 'savePdf', 'setCompany']);
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

test('staticVerify enforces the entry-point policy: an unlisted property-only writer in Code.gs must fail', () => {
  const s = fresh(), spec = JSON.parse(s.hooks);
  s.code += '\nfunction setFlag(v) { PropertiesService.getScriptProperties().setProperty("FLAG", v); }\n';
  spec.baseCodeSha256 = lib.sha256(s.code); s.hooks = JSON.stringify(spec);
  assert.throws(() => lib.staticVerify(s), /setFlag: UNGUARDED_PROPERTY_WRITE/);
});

test('F-13 static: a Code.gs business writer that bypasses withLock_ (the gate) must fail', () => {
  const s = fresh(), spec = JSON.parse(s.hooks);
  s.code += '\nfunction quickFix(r) { sh_(SH.rq).getRange(r, 7).setValue("จ่ายแล้ว"); }\n';
  spec.baseCodeSha256 = lib.sha256(s.code); s.hooks = JSON.stringify(spec);
  assert.throws(() => lib.staticVerify(s), /quickFix: BUSINESS_MUTATION_UNGATED/);
});

test('F-13 static: the business gate must be the first statement of withLock_', () => {
  const s = fresh(), spec = JSON.parse(s.hooks);
  spec.hooks = spec.hooks.filter(h => h.point !== 'BUSINESS_GATE'); s.hooks = JSON.stringify(spec);
  assert.throws(() => lib.staticVerify(s), /business gate must be the first statement of withLock_/);
  const t = fresh(), spec2 = JSON.parse(t.hooks);
  spec2.neutralize = spec2.neutralize.filter(n => n.name !== 'setCompany'); t.hooks = JSON.stringify(spec2);
  assert.throws(() => lib.staticVerify(t), /required neutralization missing: setCompany/);
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
  'tests/phase-b08-static-verification.test.js', 'qa/phase-b/b08/seed/B08_Seeder_QA_ONLY.gs', 'tests/phase-b08-seeder.test.js',
  'tests/phase-b08-business-gate.test.js',
  'scripts/b08-sha256-id.ps1', 'docs/PHASE_B08_1_OWNER_RUNBOOK_TH.md'];

test('protected-ID hash list is real: it matches an ID-shaped token in apps-script/Code.gs (without revealing it)', () => {
  const hits = lib.protectedIdHits(fs.readFileSync('apps-script/Code.gs', 'utf8'), lib.PROTECTED_ID_SHA256);
  assert.ok(hits.length >= 1, 'hash must correspond to the STAGING ID used by Code.gs');
  assert.deepEqual(Object.keys(hits[0]).sort(), ['hash', 'offset'], 'hits never carry the token text');
});

test('no B08 file in this repository embeds a protected ID (hash scan of all B08 files)', () => {
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

/* ---------- B08-1: SEED bundle static rules, bundle separation, PowerShell helper ---------- */

test('SEED bundle static verification passes and covers seeder-specific rules', () => {
  const r = lib.staticVerifySeed(fresh());
  assert.ok(r.findings.every(f => f.pass));
  assert.ok(r.findings.length > lib.staticVerify(fresh()).findings.length);
  assert.deepEqual([...r.policy.violations], []);
  assert.deepEqual([...r.policy.sources], ['b08OpenTarget_']);
});

const seedInjections = {
  'DriveApp in seeder': s => { s.seeder += '\nfunction x(){DriveApp.getFiles();}'; },
  'deleteSheet in seeder': s => { s.seeder += '\nfunction x(ss){ss.deleteSheet(ss.getSheets()[0]);}'; },
  'clear in seeder': s => { s.seeder += '\nfunction x(r){r.clearContent();}'; },
  'single-cell setValue in seeder': s => { s.seeder += '\nfunction x(r){r.setValue(1);}'; },
  'unlisted write method (setNote)': s => { s.seeder += '\nfunction x(r){r.setNote("n");}'; },
  'insertRows in seeder': s => { s.seeder += '\nfunction x(sh){sh.insertRowsAfter(1, 2);}'; },
  'direct openById in seeder': s => { s.seeder += '\nfunction x(){SpreadsheetApp.openById("a");}'; },
  'direct setProperty in seeder': s => { s.seeder += '\nfunction x(p){p.setProperty("A","B");}'; },
  'seeder clears seed markers': s => { s.seeder += '\nfunction x(){b08DeleteEvidence_("PHASEB08_SEED_STATE");}'; },
  'second b08OpenTarget_() call': s => { s.seeder += '\nfunction x(){return b08OpenTarget_();}'; },
  'second seeding-mode guard request': s => { s.seeder += '\nfunction x(){return b08FixtureGuard_("R", {seeding: true});}'; },
  'QA-PB reference in seeder': s => { s.seeder += "\nconst x='QA-PB-001';"; },
  'unguarded setValues helper in seeder (policy-only violation)': s => { s.seeder += '\nfunction b08SeedHelperUnguarded(r) { r.setValues([[1]]); }'; },
  'state order: COMPLETED before DONE': s => {
    const a = "    b08SetEvidence_(B08_SEED.state, 'COMPLETED');\n";
    s.seeder = s.seeder.replace(a, '').replace("    b08SetEvidence_(B08_SEED.done,", a + "    b08SetEvidence_(B08_SEED.done,");
  },
  'F-14: pre-seed guard moved before the lock': s => {
    s.seeder = s.seeder.replace("  const lock = LockService.getScriptLock();\n", "  const early = b08PreSeedGuard_();\n  const lock = LockService.getScriptLock();\n");
  },
  'F-14: lock not released in finally': s => { s.seeder = s.seeder.replace("  } finally {\n    lock.releaseLock();\n  }", "  }"); },
  'F-14: REVIEW_REQUIRED written even when STARTED was not written': s => { s.seeder = s.seeder.replace('    if (started) {', '    if (true) {'); },
  'F-13: seeder uses the gated business withLock_': s => { s.seeder += '\nfunction x(){ return withLock_(() => 1); }'; },
  'F-13: read-back performed outside b08WithSeedReadback_': s => {
    s.seeder = s.seeder.replace("  return b08WithSeedReadback_(() => {", "  return ((f) => f())(() => {");
  },
  'entry point calls guard before attestation': s => {
    s.seeder = s.seeder.replace("function phaseB08SeedDisposableOnce() {\n  b08SeedAttest_();", "function phaseB08SeedDisposableOnce() {\n  void 0;");
  }
};
for (const [name, inject] of Object.entries(seedInjections)) test('SEED static verification rejects: ' + name, () => {
  const s = fresh(); const before = s.seeder; inject(s);
  assert.notEqual(s.seeder, before, 'injection applied');
  assert.throws(() => lib.staticVerifySeed(s), /B08_STATIC_FAIL/);
});

test('SEED static verification rejects a protected ID in the seeder (hash only)', () => {
  const fakeId = 'fakeProtectedSeedSheet_' + 'K'.repeat(22);
  const s = fresh(); s.seeder += '\n// ' + fakeId;
  assert.throws(() => lib.staticVerifySeed(s, {protectedIdSha256: lib.PROTECTED_ID_SHA256.concat([lib.sha256(fakeId)])}),
    /seeder contains no protected ID/);
});

test('F-13 static: RUNNER files may not enter seed read-back, and stagingDb_ must gate first', () => {
  const a = fresh(); a.runner += '\nfunction z(){ return b08WithSeedReadback_(() => stagingDb_()); }';
  assert.throws(() => lib.staticVerify(a), /readback never entered from RUNNER files/);
  const b = fresh(); b.adapter = b.adapter.replace("  const mode = b08BusinessGate_({allowSeedReadback: true});\n", "  const mode = 'RUNNER';\n");
  assert.throws(() => lib.staticVerify(b), /stagingDb_ applies the seed-completion gate/);
});

test('RUNNER files may not define seeder functions or request seeding mode', () => {
  const a = fresh(); a.runner += '\nfunction phaseB08SeedDisposableOnce(){}';
  assert.throws(() => lib.staticVerify(a), /RUNNER files define no seeder functions/);
  const b = fresh(); b.adapter += '\nfunction z(){return b08FixtureGuard_("R", {seeding: true});}';
  assert.throws(() => lib.staticVerify(b), /only the seeder may request seeding-mode guard/);
});

test('RUNNER and SEED builds are separate: kinds, files and attested function sets differ', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b08-kinds-'));
  try {
    const r = lib.build(path.join(dir, 'runner'), 'X'), s = lib.build(path.join(dir, 'seed'), 'X', 'SEED');
    assert.equal(r.manifest.bundleKind, 'RUNNER');
    assert.equal(s.manifest.bundleKind, 'SEED');
    assert.equal(fs.existsSync(path.join(dir, 'runner', 'B08_Seeder_QA_ONLY.gs')), false);
    assert.equal(fs.existsSync(path.join(dir, 'seed', 'B08_Seeder_QA_ONLY.gs')), true);
    const rid = fs.readFileSync(path.join(dir, 'runner', 'B08_BundleIdentity.gs'), 'utf8');
    const sid = fs.readFileSync(path.join(dir, 'seed', 'B08_BundleIdentity.gs'), 'utf8');
    assert.match(rid, /"bundleKind": "RUNNER"/); assert.doesNotMatch(rid, /phaseB08SeedDisposableOnce/);
    assert.match(sid, /"bundleKind": "SEED"/); assert.match(sid, /"phaseB08SeedDisposableOnce": "[0-9a-f]{64}"/);
    for (const k of ['Code.gs', 'PhaseB08DisposableAdapter.gs', 'B08_DisposableQA_QA_ONLY.gs', 'appsscript.json'])
      assert.equal(r.manifest[k], s.manifest[k], k + ' identical in both bundles');
    assert.notEqual(r.manifest['B08_BundleIdentity.gs'], s.manifest['B08_BundleIdentity.gs']);
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

test('PowerShell hash helper reads the ID as SecureString and prints only the hash (content check; not executed here)', () => {
  const ps = fs.readFileSync('scripts/b08-sha256-id.ps1', 'utf8');
  assert.match(ps, /Read-Host[^\n]*-AsSecureString/);
  assert.match(ps, /ZeroFreeBSTR/);
  assert.match(ps, /SHA256\]::Create\(\)/);
  assert.doesNotMatch(ps, /Write-(Host|Output)[^\n]*\$id|Set-Clipboard|Invoke-WebRequest|Invoke-RestMethod|Out-File|Add-Content/);
  assert.deepEqual(lib.protectedIdHits(ps, lib.PROTECTED_ID_SHA256), []);
});

/* ---------- F-15: static checks of the read-only facade allowlist ---------- */

test('F-15 static: facade allowlist equals the reviewed set; adding a mutator or a prefix blacklist fails', () => {
  assert.deepEqual(lib.readonlyAllowlistOf(fresh().adapter), lib.EXPECTED_READONLY_ALLOW);
  const a = fresh(); a.adapter = a.adapter.replace("getFormula: 'value',", "getFormula: 'value', breakApart: 'value',");
  assert.throws(() => lib.staticVerify(a), /allowlist equals the reviewed method set/);
  const b = fresh(); b.adapter = b.adapter.replace("      if (!ret) return deny(key);\n", "      if (!ret) return (...x) => raw[key].apply(raw, x);\n");
  assert.throws(() => lib.staticVerify(b), /default-deny/);
  const c = fresh(); c.adapter = c.adapter.replace("return new Proxy(Object.freeze(Object.create(null)), {", "return new Proxy(raw, {");
  assert.throws(() => lib.staticVerify(c), /default-deny/);
});
