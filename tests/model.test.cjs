const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const modelPath = require('node:path').join(__dirname, '../js/model.js');
const M = fs.existsSync(modelPath) ? require(modelPath) : {};
const NOW = '2026-09-18';
const IDS = ['patch', 'identity', 'trajectory', 'credentials', 'registry', 'sharedstate', 'evalfidelity'];
function ready() {
  const state = M.createAssessment();
  state.scope = { system: 'Example assistant', environment: 'Staging', owner: 'Example team', boundary: 'Isolated test account' };
  for (const id of IDS) Object.assign(state.controls[id], { status: 'scored', score: 2, outcome: 'passed', owner: 'Example team', evidence: 'Internal exercise report', testedAt: NOW, result: 'Expected action blocked; all issued sessions invalidated.' });
  return state;
}
test('exports the agreed pure model API', () => {
  for (const key of ['createAssessment', 'evaluate', 'validateAssessment', 'serializeExport', 'parseImport', 'migrateLegacy', 'createSample']) assert.equal(typeof M[key], 'function', key);
});
test('blank assessment is incomplete and distinct from a failed control', () => {
  const state = M.createAssessment();
  assert.equal(M.evaluate(state, NOW).status, 'incomplete');
  assert.equal(M.evaluate(state, NOW).assessed, 0);
  assert.equal(M.evaluate(state, NOW).controls[0].status, 'unassessed');
  assert.deepEqual(M.DIMENSIONS.map(d => d.id), IDS);
});
test('one complete control cannot pass the assessment', () => {
  const state = M.createAssessment();
  state.controls.patch = ready().controls.patch;
  const result = M.evaluate(state, NOW);
  assert.equal(result.status, 'incomplete');
  assert.equal(result.assessed, 1);
  assert.equal(result.passed, 1);
});
test('complete evidence-backed assessment reaches review without claiming approval', () => {
  const result = M.evaluate(ready(), NOW);
  assert.equal(result.status, 'review');
  assert.equal(result.label, 'Ready for review');
  assert.equal(result.passed, 7);
  assert.equal(result.criticalPassed, 3);
  assert.deepEqual(result.blockers, []);
});
test('weak critical control cannot be averaged away and failure precedes missing data', () => {
  const state = ready();
  state.controls.identity.score = 1;
  state.controls.registry = M.createAssessment().controls.registry;
  assert.equal(M.evaluate(state, NOW).status, 'remediate');
  assert.equal(M.evaluate(state, NOW).controls.find(c => c.id === 'identity').status, 'failed');
});
test('every evidence field is required for a passing score', () => {
  for (const field of ['owner', 'evidence', 'testedAt', 'result']) {
    const state = ready();
    state.controls.patch[field] = '  ';
    assert.equal(M.evaluate(state, NOW).status, 'incomplete', field);
  }
  const state = ready();
  state.controls.patch.outcome = 'not-tested';
  assert.equal(M.evaluate(state, NOW).status, 'incomplete');
  state.controls.patch.outcome = 'failed';
  assert.equal(M.evaluate(state, NOW).status, 'remediate');
});
test('highest score requires a reviewer', () => {
  const state = ready();
  state.controls.patch.score = 3;
  assert.equal(M.evaluate(state, NOW).status, 'incomplete');
  state.controls.patch.reviewer = 'Example reviewer';
  assert.equal(M.evaluate(state, NOW).status, 'review');
});
test('scoped deployment is mandatory', () => {
  for (const field of ['system', 'environment', 'owner', 'boundary']) {
    const state = ready();
    state.scope[field] = '';
    assert.equal(M.evaluate(state, NOW).status, 'incomplete', field);
  }
});
test('noncritical exclusions require rationale and owner, critical exclusions never pass', () => {
  const state = ready();
  state.controls.registry = { ...M.createAssessment().controls.registry, status: 'excluded' };
  assert.equal(M.evaluate(state, NOW).status, 'incomplete');
  Object.assign(state.controls.registry, { exclusion: 'No third-party registry is inside this deployment boundary.', owner: 'Example owner' });
  let result = M.evaluate(state, NOW);
  assert.equal(result.status, 'review');
  assert.equal(result.applicable, 6);
  assert.equal(result.assessed, 7);
  assert.equal(result.passed, 6);
  state.controls.patch = { ...state.controls.registry };
  result = M.evaluate(state, NOW);
  assert.notEqual(result.status, 'review');
  assert.equal(result.applicable, 6);
});
test('age policy uses inclusive UTC calendar days and future dates cannot pass', () => {
  const state = ready();
  state.controls.patch.testedAt = '2026-06-20';
  assert.equal(M.evaluate(state, NOW).status, 'review');
  state.controls.patch.testedAt = '2026-06-19';
  assert.equal(M.evaluate(state, NOW).status, 'remediate');
  assert.equal(M.evaluate(state, NOW).controls[0].status, 'stale');
  state.policy.maxAgeDays = 120;
  assert.equal(M.evaluate(state, NOW).status, 'review');
  state.controls.patch.testedAt = '2026-09-19';
  assert.notEqual(M.evaluate(state, NOW).status, 'review');
});
test('validation returns a deep clone and rejects malformed data', () => {
  const state = ready();
  const copy = M.validateAssessment(state);
  copy.controls.patch.owner = 'Changed';
  assert.equal(state.controls.patch.owner, 'Example team');
  const changes = [s => { s.controls.patch.score = '2'; }, s => { s.controls.patch.score = 4; }, s => { s.controls.patch.testedAt = '2026-02-30'; }, s => { s.policy.maxAgeDays = 0; }, s => { s.isSample = 'false'; }, s => { s.scope.system = 7; }, s => { delete s.controls.patch; }, s => { s.controls.patch.outcome = 'unknown'; }, s => { s.controls.patch.status = 'done'; }];
  for (const change of changes) { const broken = ready(); change(broken); assert.throws(() => M.validateAssessment(broken)); }
});
test('strict import rejects unrelated, oversized and malformed JSON without mutating input', () => {
  for (const text of ['{}', '[]', 'null', '{bad', '{"scores":{}}', '{"scores":{"random":3}}', ' '.repeat(1000001)]) assert.throws(() => M.parseImport(text));
  const state = ready();
  const original = JSON.stringify(state);
  const imported = M.parseImport(JSON.stringify(state));
  imported.controls.patch.score = 0;
  assert.equal(JSON.stringify(state), original);
});
test('export returns repeatable exact bytes, validated assessment and recomputed summary', () => {
  const state = ready();
  const exportedAt = NOW + 'T12:00:00.000Z';
  const text = M.serializeExport(state, exportedAt);
  assert.equal(text, M.serializeExport(state, exportedAt));
  const parsed = JSON.parse(text);
  assert.equal(parsed.schema, 'defops-scorecard/v2');
  assert.equal(parsed.exportedAt, exportedAt);
  assert.equal(parsed.summary.status, 'review');
  assert.equal(text, JSON.stringify(parsed, null, 2));
  assert.deepEqual(M.parseImport(text), state);
  parsed.summary.status = 'fake';
  assert.equal(M.evaluate(M.parseImport(JSON.stringify(parsed)), NOW).status, 'review');
});
test('legacy scores migrate as unverified claims with no readiness and preserve notes', () => {
  const legacy = { scores: Object.fromEntries(IDS.map(id => [id, 3])), notes: { patch: 'Old note' } };
  const original = JSON.stringify(legacy);
  const state = M.migrateLegacy(legacy);
  assert.equal(state.controls.patch.score, 3);
  assert.equal(state.controls.patch.notes, 'Old note');
  assert.equal(state.controls.patch.evidence, '');
  assert.equal(M.evaluate(state, NOW).status, 'incomplete');
  assert.deepEqual(M.parseImport(JSON.stringify(legacy)), state);
  assert.equal(JSON.stringify(legacy), original);
  assert.throws(() => M.migrateLegacy({ scores: { patch: 99 } }));
});
test('samples are isolated, deterministic, plainly fictitious and preserve provenance on export', () => {
  const state = M.createSample('ready', NOW);
  assert.equal(state.isSample, true);
  assert.match(state.scope.system, /example|fictitious|demo/i);
  assert.equal(M.evaluate(state, NOW).status, 'review');
  assert.deepEqual(M.createSample('ready', NOW), state);
  state.controls.patch.owner = 'Changed';
  assert.notEqual(M.createSample('ready', NOW).controls.patch.owner, 'Changed');
  assert.equal(M.parseImport(M.serializeExport(state, NOW + 'T12:00:00.000Z')).isSample, true);
  assert.equal(M.evaluate(M.createSample('gap', NOW), NOW).status, 'remediate');
  assert.throws(() => M.createSample('unknown', NOW));
});
test('model attaches the same API in a plain browser without Node', () => {
  const context = {};
  vm.runInNewContext(fs.readFileSync(modelPath, 'utf8'), context);
  assert.equal(typeof context.DefopsModel.evaluate, 'function');
  assert.equal(context.DefopsModel.createAssessment().schema, 'defops-scorecard/v2');
});
test('every mandatory control blocks exclusion and zero scores block review', () => {
  for (const id of ['patch', 'identity', 'trajectory']) {
    const state = ready();
    Object.assign(state.controls[id], { status: 'excluded', owner: 'Example owner', exclusion: 'Attempted exception' });
    assert.equal(M.evaluate(state, NOW).status, 'remediate', id);
  }
  const state = ready();
  state.controls.credentials.score = 0;
  assert.equal(M.evaluate(state, NOW).status, 'remediate');
});
test('evaluation and export do not mutate the assessment or permit prototype properties', () => {
  const state = ready();
  const before = JSON.stringify(state);
  M.evaluate(state, NOW);
  M.serializeExport(state, NOW + 'T00:00:00.000Z');
  assert.equal(JSON.stringify(state), before);
  const input = JSON.stringify(state).replace('"scope":{', '"__proto__":{"isAdmin":true},"scope":{');
  const parsed = M.parseImport(input);
  assert.equal(Object.hasOwn(parsed, '__proto__'), false);
  assert.equal(parsed.isAdmin, undefined);
});
test('repairing sample evidence produces review readiness and preserves demo provenance', () => {
  const state = M.createSample('gap', NOW);
  Object.assign(state.controls.identity, { score: 2, outcome: 'passed', result: 'Old credential denied on every scoped service after revocation.' });
  assert.equal(M.evaluate(state, NOW).status, 'review');
  assert.equal(state.isSample, true);
});
test('timestamp validation rejects calendar rollovers and oversized imports describe the actual limit', () => {
  const state = ready();
  state.updatedAt = NOW + 'T24:00:00.000Z';
  assert.throws(() => M.validateAssessment(state));
  assert.throws(() => M.parseImport(' '.repeat(1000001)), /characters/);
});
test('evidence age policy rejects values above the supported one-year maximum', () => {
  for (const maxAgeDays of [366, 3650]) {
    const state = ready();
    state.policy.maxAgeDays = maxAgeDays;
    assert.throws(() => M.validateAssessment(state), /365/);
    assert.throws(() => M.parseImport(JSON.stringify(state)), /365/);
  }
  const state = ready();
  state.policy.maxAgeDays = 365;
  assert.equal(M.validateAssessment(state).policy.maxAgeDays, 365);
});
