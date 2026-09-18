(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DefopsModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SCHEMA = 'defops-scorecard/v2';
  const MAX_INPUT = 1000000;
  const DAY = 86400000;
  const DIMENSIONS = Object.freeze([
    { id: 'patch', name: 'Patch and recovery', shortName: 'Patching', critical: true, description: 'Turn a discovered weakness into a deployed, tested fix with a recovery path.', test: 'Reproduce a weakness, ship the fix, retest the original case and verify rollback.' },
    { id: 'identity', name: 'Identity and revocation', shortName: 'Revocation', critical: true, description: 'Stop an agent and invalidate its access across the scoped services.', test: 'Revoke a running agent and retry its credentials on every service inside the deployment boundary.' },
    { id: 'trajectory', name: 'Action reconstruction', shortName: 'Reconstruction', critical: true, description: 'Reconstruct what the agent saw, decided and changed without exposing secrets.', test: 'Trace a consequential action back to its inputs, tool calls, permissions and approval record.' },
    { id: 'credentials', name: 'Credential boundaries', shortName: 'Credentials', critical: false, description: 'Limit credential scope, lifetime and exposure during tool use.', test: 'Attempt an out-of-scope action and a secret-exfiltration path; confirm both are blocked.' },
    { id: 'registry', name: 'Tool and artifact provenance', shortName: 'Provenance', critical: false, description: 'Control which tools, models and artifacts the agent can trust.', test: 'Substitute an unapproved artifact or tool release and verify it cannot enter the execution path.' },
    { id: 'sharedstate', name: 'Shared state isolation', shortName: 'Shared state', critical: false, description: 'Contain cross-session and cross-tenant contamination in memory and shared resources.', test: 'Seed another session with hostile state and verify the scoped agent cannot inherit or act on it.' },
    { id: 'evalfidelity', name: 'Evaluation fidelity', shortName: 'Evaluation', critical: false, description: 'Exercise the actual permissions, dependencies and failure paths used in deployment.', test: 'Run a representative adversarial exercise against the declared environment and record what it does not cover.' }
  ].map(Object.freeze));
  const RUBRIC = Object.freeze([
    { value: 0, label: 'Absent or failed', detail: 'No control exists, or an exercise showed it failed.' },
    { value: 1, label: 'Defined, not proven', detail: 'A design or implementation exists without a passing representative exercise.' },
    { value: 2, label: 'Exercise passed', detail: 'A representative exercise passed with dated evidence and an owner.' },
    { value: 3, label: 'Deployed and reviewed', detail: 'The control passed in deployed conditions with evidence and a named reviewer.' }
  ].map(Object.freeze));
  const TEXT_FIELDS = ['owner', 'evidence', 'testedAt', 'result', 'reviewer', 'exclusion', 'notes'];
  const SCOPE_FIELDS = ['system', 'environment', 'owner', 'boundary'];
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const filled = value => typeof value === 'string' && value.trim().length > 0;
  const fail = message => { throw new Error(message); };
  function dateValue(day) {
    if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return NaN;
    const value = Date.parse(day + 'T00:00:00.000Z');
    return Number.isFinite(value) && new Date(value).toISOString().slice(0, 10) === day ? value : NaN;
  }
  function utcDay(now) {
    const value = now === undefined ? new Date() : new Date(now);
    if (!Number.isFinite(value.getTime())) fail('Invalid review date.');
    return value.toISOString().slice(0, 10);
  }
  function checkText(value, label) {
    if (typeof value !== 'string' || value.length > 20000) fail(label + ' must be text of at most 20,000 characters.');
    return value;
  }
  function checkTimestamp(value, label) {
    if (value !== null && (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z$/.test(value) || !Number.isFinite(dateValue(value.slice(0, 10))) || !Number.isFinite(Date.parse(value)))) fail(label + ' must be a UTC timestamp or null.');
    return value;
  }
  function createAssessment() {
    const controls = {};
    DIMENSIONS.forEach(d => {
      controls[d.id] = { status: 'unassessed', score: null, outcome: 'not-tested', owner: '', evidence: '', testedAt: '', result: '', reviewer: '', exclusion: '', notes: '' };
    });
    return { schema: SCHEMA, scope: { system: '', environment: '', owner: '', boundary: '' }, policy: { maxAgeDays: 90 }, controls, isSample: false, updatedAt: null };
  }
  function validateAssessment(state) {
    if (!object(state) || state.schema !== SCHEMA) fail('Unrecognized assessment schema.');
    if (!object(state.scope) || !object(state.policy) || !object(state.controls)) fail('Assessment scope, policy and controls are required.');
    if (!Number.isInteger(state.policy.maxAgeDays) || state.policy.maxAgeDays < 1 || state.policy.maxAgeDays > 365) fail('Evidence age policy must be a whole number from 1 to 365 days.');
    if (typeof state.isSample !== 'boolean') fail('Sample provenance must be a boolean.');
    const copy = createAssessment();
    SCOPE_FIELDS.forEach(key => { copy.scope[key] = checkText(state.scope[key], 'Scope ' + key); });
    copy.policy.maxAgeDays = state.policy.maxAgeDays;
    copy.isSample = state.isSample;
    copy.updatedAt = checkTimestamp(state.updatedAt, 'Updated date');
    for (const dimension of DIMENSIONS) {
      const control = state.controls[dimension.id];
      if (!object(control)) fail('Missing control: ' + dimension.id);
      if (!['unassessed', 'scored', 'excluded'].includes(control.status)) fail('Invalid control status: ' + dimension.id);
      if (control.score !== null && (!Number.isInteger(control.score) || control.score < 0 || control.score > 3)) fail('Scores must be null or a whole number from 0 to 3.');
      if (control.status === 'scored' && control.score === null) fail('Scored controls require a score.');
      if (control.status === 'unassessed' && control.score !== null) fail('Unassessed controls cannot have a score.');
      if (!['not-tested', 'passed', 'failed'].includes(control.outcome)) fail('Invalid test outcome: ' + dimension.id);
      const target = copy.controls[dimension.id];
      target.status = control.status;
      target.score = control.score;
      target.outcome = control.outcome;
      TEXT_FIELDS.forEach(key => { target[key] = checkText(control[key], dimension.id + ' ' + key); });
      if (target.testedAt !== '' && !Number.isFinite(dateValue(target.testedAt))) fail('Test dates must be real calendar dates in YYYY-MM-DD format.');
    }
    return copy;
  }
  function evaluate(state, now) {
    const today = dateValue(utcDay(now));
    const blockers = [];
    const controls = [];
    let assessed = 0;
    let applicable = DIMENSIONS.length;
    let passed = 0;
    let criticalPassed = 0;
    const scopeComplete = SCOPE_FIELDS.every(key => filled(state.scope[key]));
    SCOPE_FIELDS.forEach(key => {
      if (!filled(state.scope[key])) blockers.push({ id: 'scope', title: 'Define deployment scope', detail: 'Add the deployment ' + key + '.', kind: 'missing' });
    });
    for (const dimension of DIMENSIONS) {
      const control = state.controls[dimension.id];
      const issues = [];
      let status = 'passed';
      const add = (kind, detail) => {
        issues.push(detail);
        blockers.push({ id: dimension.id, title: dimension.name, detail, kind });
        if (kind === 'failed') status = 'failed';
        else if (kind === 'stale' && status !== 'failed') status = 'stale';
        else if (status === 'passed') status = 'missing';
      };
      if (control.status === 'unassessed') {
        add('missing', 'Assess this control or document a permitted exclusion.');
        status = 'unassessed';
      } else if (control.status === 'excluded') {
        if (dimension.critical) add('failed', 'This mandatory control cannot be excluded.');
        else {
          if (!filled(control.exclusion)) add('missing', 'An exclusion needs a rationale tied to the deployment boundary.');
          if (!filled(control.owner)) add('missing', 'An exclusion needs an accountable owner.');
          if (!issues.length) { status = 'excluded'; applicable -= 1; assessed += 1; }
        }
      } else {
        assessed += 1;
        if (!Number.isInteger(control.score) || control.score < 0 || control.score > 3) add('missing', 'Select a valid control score.');
        else if (control.score < 2) add('failed', 'A representative exercise must pass before this control can pass review.');
        if (control.outcome === 'failed') add('failed', 'The recorded exercise failed. Remediate and retest.');
        else if (control.outcome !== 'passed') add('missing', 'Record a passing test outcome.');
        for (const [key, description] of [['owner', 'an accountable owner'], ['evidence', 'a reference to supporting evidence'], ['testedAt', 'a test date'], ['result', 'the observed test result']]) {
          if (!filled(control[key])) add('missing', 'Add ' + description + '.');
        }
        if (control.score === 3 && !filled(control.reviewer)) add('missing', 'A deployed-condition score needs a named reviewer.');
        if (filled(control.testedAt)) {
          const tested = dateValue(control.testedAt);
          if (!Number.isFinite(tested)) add('missing', 'Enter a valid calendar date for the test.');
          else if (tested > today) add('missing', 'A future test date cannot support this review.');
          else if ((today - tested) / DAY > state.policy.maxAgeDays) add('stale', 'Evidence is older than the selected review policy. Retest this control.');
        }
        if (!issues.length) { passed += 1; if (dimension.critical) criticalPassed += 1; }
      }
      controls.push({ id: dimension.id, status, issues });
    }
    const status = blockers.some(b => b.kind === 'failed' || b.kind === 'stale') ? 'remediate' : blockers.length ? 'incomplete' : 'review';
    return { status, label: { incomplete: 'Incomplete', remediate: 'Needs remediation', review: 'Ready for review' }[status], assessed, applicable, passed, criticalPassed, scopeComplete, blockers, controls };
  }
  function migrateLegacy(data) {
    if (!object(data) || (data.schema !== undefined && data.schema !== 'defops-scorecard/v1') || !object(data.scores) || !DIMENSIONS.some(d => own(data.scores, d.id))) fail('No recognizable legacy assessment was found.');
    if (data.notes !== undefined && !object(data.notes)) fail('Legacy notes must be an object.');
    const state = createAssessment();
    for (const dimension of DIMENSIONS) {
      if (own(data.scores, dimension.id)) {
        const score = data.scores[dimension.id];
        if (score !== null && (!Number.isInteger(score) || score < 0 || score > 3)) fail('Invalid legacy score.');
        if (score !== null) Object.assign(state.controls[dimension.id], { status: 'scored', score });
      }
      if (data.notes && own(data.notes, dimension.id)) state.controls[dimension.id].notes = checkText(data.notes[dimension.id], 'Legacy note');
    }
    return validateAssessment(state);
  }
  function parseImport(text) {
    if (typeof text !== 'string' || text.length > MAX_INPUT) fail('Import must be JSON text of at most 1,000,000 characters.');
    let data;
    try { data = JSON.parse(text); } catch (_) { fail('Import is not valid JSON.'); }
    if (!object(data)) fail('Import must contain an assessment object.');
    if (data.schema === SCHEMA) {
      if (own(data, 'assessment')) {
        checkTimestamp(data.exportedAt, 'Export date');
        if (data.exportedAt === null) fail('An export date is required.');
        return validateAssessment(data.assessment);
      }
      return validateAssessment(data);
    }
    return migrateLegacy(data);
  }
  function serializeExport(state, exportedAt) {
    const timestamp = exportedAt === undefined ? new Date().toISOString() : exportedAt;
    checkTimestamp(timestamp, 'Export date');
    if (timestamp === null) fail('An export date is required.');
    const assessment = validateAssessment(state);
    return JSON.stringify({ schema: SCHEMA, exportedAt: timestamp, assessment, summary: evaluate(assessment, timestamp) }, null, 2);
  }
  function createSample(kind, now) {
    if (kind !== 'gap' && kind !== 'ready') fail('Unknown sample profile.');
    const day = utcDay(now);
    const state = createAssessment();
    state.isSample = true;
    state.scope = { system: 'Example incident assistant (fictitious demo)', environment: 'Isolated example staging account', owner: 'Example operations team', boundary: 'Example ticket service, artifact store and agent runner. No production access or real evidence.' };
    state.updatedAt = day + 'T00:00:00.000Z';
    const results = {
      patch: 'Original regression case blocked after the example fix; rollback restored the previous test build.',
      identity: 'Old credential denied on every scoped service after revocation.',
      trajectory: 'Example ticket change traced to input, tool call, scoped identity and approval record.',
      credentials: 'Out-of-scope write denied; synthetic secret could not leave the example boundary.',
      registry: 'Unapproved example tool digest rejected by the test runner.',
      sharedstate: 'Injected example session memory remained isolated from the second test session.',
      evalfidelity: 'Representative example permissions and dependencies exercised; production traffic remains outside scope.'
    };
    for (const dimension of DIMENSIONS) {
      Object.assign(state.controls[dimension.id], { status: 'scored', score: 2, outcome: 'passed', owner: 'Example operations team', evidence: 'FICTITIOUS DEMO: exercise record EXAMPLE-' + dimension.id.toUpperCase(), testedAt: day, result: results[dimension.id], notes: 'Illustrative self-reported exercise only. No real system or independently verified evidence.' });
    }
    if (kind === 'gap') Object.assign(state.controls.identity, { score: 1, outcome: 'failed', result: 'Old credential still accepted by the test service' });
    return state;
  }
  return Object.freeze({ DIMENSIONS, RUBRIC, createAssessment, evaluate, validateAssessment, serializeExport, parseImport, migrateLegacy, createSample });
});
