# DEFOPS evidence review implementation

User authorized improving the framework, redesigning the app, committing and deploying, revising the newsletter, recording a 30-second real UI demo, and finally generating two header alternatives.

## Design

Keep a static, local-first application. Replace an averaged funding verdict with an explicit review gate. Design direction: an editorial technical workbench, warm ivory canvas, dark ink, teal for passed checks, orange for open work, precise rules and restrained motion. Persistent navigation: Overview, Assessment, Review, Data. A demo banner must stay visible whenever sample data is active.

Use seven controls. Patching, revocation, and reconstruction are mandatory. Scores describe outcomes: 0 absent/failed, 1 defined but untested, 2 passed a representative exercise, 3 passed in deployed conditions with a reviewer. Readiness requires scoped deployment, every applicable control assessed at least 2, evidence/owner/test date/result, passing outcome, and fresh evidence. Score 3 requires reviewer. Exclusions require a rationale and owner; critical controls cannot be excluded. Evidence age defaults to 90 days as an explicit adjustable review policy, not an empirically validated threshold. No funding verdict, coverage percentage, or compensating average.

Unknown stays distinct from absent. Result labels: Incomplete, Needs remediation, Ready for review. Self-reported data does not become independently verified evidence because a form is complete. Ready for review never implies deployment approval or attack protection.

## File ownership and API

- js/model.js: UMD export `DefopsModel` in browser and module.exports in Node. Owns DIMENSIONS, RUBRIC, createAssessment(), evaluate(state, now), validateAssessment(state), serializeExport(state, exportedAt), parseImport(text), migrateLegacy(data), createSample(kind, now). Pure logic, Node tests in tests/model.test.cjs.
- index.html and css/styles.css: semantic static shell, full responsive design. Root integrates dynamic app markup.
- js/app.js: browser controller; owns editing, autosave, isolated demo state, previous-state backup, import preview/confirmation, exact-byte export snapshot/hash, navigation and DOM rendering.
- e2e/: actual controls and import interactions using existing CDP Chrome, no browser spawning locally.
- README.md: framework, policy, limitations, data and migration behavior.
- .github/workflows/pages.yml: unit and browser checks before staging only deployable assets.

State contract:
```
{
 schema: 'defops-scorecard/v2',
 scope: { system:'', environment:'', owner:'', boundary:'' },
 policy: { maxAgeDays:90 },
 controls: { [id]: { status:'unassessed', score:null, outcome:'not-tested', owner:'', evidence:'', testedAt:'', result:'', reviewer:'', exclusion:'', notes:'' } },
 isSample:false, updatedAt:null
}
```
IDs remain patch, identity, trajectory, credentials, registry, sharedstate, evalfidelity. Control status is unassessed/scored/excluded; outcome is not-tested/passed/failed. DIMENSIONS entries have id, name, shortName, critical, description, test. RUBRIC entries have value, label, detail.

evaluate returns {status: 'incomplete'|'remediate'|'review', label, assessed, applicable, passed, criticalPassed, scopeComplete, blockers:[{id,title,detail,kind:'missing'|'failed'|'stale'}], controls:[{id,status:'unassessed'|'missing'|'failed'|'stale'|'passed'|'excluded',issues:[]}]}.
Known failing/low scored controls take precedence as Needs remediation, otherwise missing requirements yield Incomplete. Evidence is dated YYYY-MM-DD, cannot be future, older than policy requires retest. Result is Ready for review only with no blockers. Excluded control counts as assessed but not applicable/passed.
serializeExport returns exact pretty JSON string {schema,exportedAt,assessment,summary}. parseImport accepts this schema or a recognizable legacy v1 scores/notes export. Reject unrelated JSON, arrays, invalid scores/dates/types, oversized input. Do not mutate caller data. Legacy ratings remain self-reported with missing evidence; never gain readiness through migration.

## Work sequence and definition of done

1. Write and run model regression tests before implementation: incomplete/weak critical/no evidence, exclusions, dates, strict non-destructive imports, exact export bytes, samples and legacy migration.
2. Build semantic shell and app controller; isolate sample state and protect local work with replacement preview plus restore backup.
3. Exercise real inputs on desktop/mobile, verify reload, invalid/valid imports, exclusion rules, demo isolation, export/hash match and keyboard navigation.
4. Run an independent review, fix findings, commit on feature branch, merge to main, push to Danny's repository. Require Pages workflow success and verify deployed content/assets.
5. Rewrite article and companion posts to describe the implemented behavior, preserving primary-source chart. Save v3 alongside v2.
6. Record actual deployed UI into a 30-second MP4 in Downloads; verify duration, dimensions and sampled frames.
7. Generate two futuristic header alternatives after other tasks; save keepables under AI Projects and copies in Downloads.
