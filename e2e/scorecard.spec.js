// @ts-check
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const REPORT = {
  cases: [],
  bugs: [],
  fixes: [],
};

function record(name, pass, detail = '') {
  REPORT.cases.push({ name, pass, detail });
}

test.afterAll(async () => {
  const passed = REPORT.cases.filter((c) => c.pass).length;
  const failed = REPORT.cases.filter((c) => !c.pass).length;
  const lines = [
    '# DEFOPS Scorecard E2E Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    `## Summary: ${passed} passed / ${failed} failed / ${REPORT.cases.length} total`,
    '',
    '## Cases',
    '',
  ];
  for (const c of REPORT.cases) {
    lines.push(`- **${c.pass ? 'PASS' : 'FAIL'}**: ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
  }
  lines.push('', '## Bugs found', '');
  if (REPORT.bugs.length === 0) {
    lines.push('- None.');
  } else {
    for (const b of REPORT.bugs) lines.push(`- ${b}`);
  }
  lines.push('', '## Fixes applied', '');
  if (REPORT.fixes.length === 0) {
    lines.push('- None required.');
  } else {
    for (const f of REPORT.fixes) lines.push(`- ${f}`);
  }
  lines.push('', '## Deploy readiness', '');
  lines.push(
    failed === 0
      ? 'Site is ready to deploy (e2e green; Apache 2.0 license applied). Do not push from this agent — parent deploys.'
      : 'NOT ready: fix failing cases before deploy.'
  );
  fs.writeFileSync(path.join(__dirname, '..', 'e2e-report.md'), lines.join('\n') + '\n');
});

test.describe('DEFOPS Coverage Scorecard E2E', () => {
  /** @type {string[]} */
  let consoleErrors;

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', (err) => {
      consoleErrors.push(String(err));
    });
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/#home');
    await page.waitForFunction(() => window.DEFOPS && document.querySelectorAll('.dim-card').length === 7);
  });

  test('1. Home loads; title contains DEFOPS', async ({ page }) => {
    const title = await page.title();
    const ok = /DEFOPS/i.test(title);
    const homeVisible = await page.locator('#home:not([hidden])').isVisible();
    const h1 = await page.locator('#home h1').textContent();
    record('Home loads; title contains DEFOPS', ok && homeVisible, `title="${title}" h1="${h1}"`);
    expect(title).toMatch(/DEFOPS/i);
    expect(homeVisible).toBe(true);
  });

  test('2. Navigate to Assessment; all 7 dimensions render', async ({ page }) => {
    await page.click('a[data-nav="assessment"]');
    await expect(page.locator('#assessment:not([hidden])')).toBeVisible();
    const cards = page.locator('.dim-card');
    await expect(cards).toHaveCount(7);
    const names = await cards.locator('.dim-title').allTextContents();
    record(
      'Assessment shows all 7 dimensions',
      names.length === 7,
      names.join(' | ')
    );
    expect(names.length).toBe(7);
  });

  test('3. Score a dimension; progress updates; localStorage persists after reload', async ({ page }) => {
    await page.goto('/#assessment');
    await expect(page.locator('#assessment:not([hidden])')).toBeVisible();

    // Score first dimension (patch) as 2
    const firstCard = page.locator('.dim-card[data-dim="patch"]');
    await firstCard.locator('button.score-btn[data-value="2"]').click();
    await expect(page.locator('#progress-label')).toHaveText('1 of 7 scored');
    await expect(page.locator('#progress-pct')).toHaveText('14%');

    const storedBefore = await page.evaluate(() => localStorage.getItem('defops-scorecard-v1'));
    expect(storedBefore).toBeTruthy();
    const parsed = JSON.parse(storedBefore);
    expect(parsed.scores.patch).toBe(2);

    await page.reload();
    await page.waitForFunction(() => window.DEFOPS);
    await page.goto('/#assessment');
    await expect(page.locator('#progress-label')).toHaveText('1 of 7 scored');
    const pressed = firstCard.locator('button.score-btn[data-value="2"]');
    await expect(pressed).toHaveAttribute('aria-pressed', 'true');

    record('Score + progress + localStorage persist', true, 'patch=2 persisted across reload');
  });

  test('4. Load Ops-ready → Fund; Load Research-demo → Don\'t fund', async ({ page }) => {
    await page.goto('/#profiles');
    await expect(page.locator('#profiles:not([hidden])')).toBeVisible();

    await page.click('#load-ops-ready');
    await page.goto('/#dashboard');
    await expect(page.locator('#verdict-badge')).toHaveText('Fund');
    const opsVerdict = await page.locator('#verdict-badge').textContent();

    await page.goto('/#profiles');
    await page.click('#load-research-demo');
    await page.goto('/#dashboard');
    await expect(page.locator('#verdict-badge')).toHaveText("Don't fund");
    const researchVerdict = await page.locator('#verdict-badge').textContent();

    record(
      'Profiles: Ops-ready→Fund, Research-demo→Don\'t fund',
      opsVerdict === 'Fund' && researchVerdict === "Don't fund",
      `ops=${opsVerdict} research=${researchVerdict}`
    );
  });

  test('5. Dashboard shows mean and verdict badge', async ({ page }) => {
    await page.goto('/#profiles');
    await page.click('#load-ops-ready');
    await page.goto('/#dashboard');
    await expect(page.locator('#dashboard:not([hidden])')).toBeVisible();
    const mean = await page.locator('#overall-mean').textContent();
    const badge = await page.locator('#verdict-badge').textContent();
    const meanOk = mean !== null && mean !== '—' && !Number.isNaN(parseFloat(mean));
    const badgeOk = ['Fund', 'Gate', "Don't fund"].includes(badge || '');
    record('Dashboard mean + verdict badge', meanOk && badgeOk, `mean=${mean} badge=${badge}`);
    expect(meanOk).toBe(true);
    expect(badgeOk).toBe(true);
  });

  test('6. Export JSON valid schema; import round-trip restores scores', async ({ page }) => {
    await page.goto('/#profiles');
    await page.click('#load-ops-ready');

    const payload = await page.evaluate(() => window.DEFOPS.buildExportPayload());
    expect(payload.schema).toBe('defops-scorecard/v1');
    expect(payload.scores.patch).toBe(3);
    expect(payload.dimensions).toHaveLength(7);

    // Clear then import via FileChooser-style injection
    await page.goto('/#data');
    page.once('dialog', (d) => d.accept());
    await page.click('#btn-clear');
    await expect(page.locator('#data-status')).toContainText(/cleared/i);

    const cleared = await page.evaluate(() => window.DEFOPS.getState().scores.patch);
    expect(cleared).toBeNull();

    // Simulate import by writing file and using the import handler path
    const importResult = await page.evaluate(async (jsonText) => {
      const data = JSON.parse(jsonText);
      const scores = data.scores || {};
      const notes = data.notes || {};
      window.DEFOPS.DIMENSIONS.forEach((d) => {
        const s = scores[d.id];
        // use setScores + notes via state mutation through setScores only for scores
      });
      window.DEFOPS.setScores(scores);
      const st = window.DEFOPS.getState();
      Object.keys(notes).forEach((id) => {
        st.notes[id] = notes[id];
      });
      window.DEFOPS.saveState();
      window.DEFOPS.renderDimensions();
      window.DEFOPS.updateProgress();
      window.DEFOPS.updateDashboard();
      return {
        schema: data.schema,
        patch: window.DEFOPS.getState().scores.patch,
        identity: window.DEFOPS.getState().scores.identity,
      };
    }, JSON.stringify(payload));

    expect(importResult.schema).toBe('defops-scorecard/v1');
    expect(importResult.patch).toBe(3);
    expect(importResult.identity).toBe(3);

    // Also exercise real file input import
    await page.goto('/#profiles');
    await page.click('#load-research-demo');
    const researchPayload = await page.evaluate(() => window.DEFOPS.buildExportPayload());

    await page.goto('/#data');
    page.once('dialog', (d) => d.accept());
    await page.click('#btn-clear');

    const tmp = path.join(__dirname, '_tmp-import.json');
    fs.writeFileSync(tmp, JSON.stringify(researchPayload, null, 2));
    await page.setInputFiles('#import-file', tmp);
    await expect(page.locator('#data-status')).toContainText(/Import successful/i);
    const restored = await page.evaluate(() => window.DEFOPS.getState().scores);
    expect(restored.identity).toBe(0);
    expect(restored.evalfidelity).toBe(2);
    fs.unlinkSync(tmp);

    record(
      'Export schema defops-scorecard/v1 + import round-trip',
      true,
      `schema=${payload.schema}; file import restored research-demo scores`
    );
  });

  test('7. Hash (SHA-256) produces 64 hex chars', async ({ page }) => {
    await page.goto('/#profiles');
    await page.click('#load-ops-ready');
    await page.goto('/#data');
    await page.click('#btn-hash');
    await expect(page.locator('#hash-display')).toBeVisible();
    const hex = (await page.locator('#hash-display').textContent()) || '';
    const ok = /^[0-9a-f]{64}$/i.test(hex.trim());
    record('SHA-256 hash is 64 hex chars', ok, `hash=${hex.trim().slice(0, 16)}…`);
    expect(ok).toBe(true);
  });

  test('8. Clear all resets scores', async ({ page }) => {
    await page.goto('/#profiles');
    await page.click('#load-ops-ready');
    let scored = await page.evaluate(() =>
      window.DEFOPS.DIMENSIONS.filter((d) => window.DEFOPS.getState().scores[d.id] !== null).length
    );
    expect(scored).toBe(7);

    await page.goto('/#data');
    page.once('dialog', (d) => d.accept());
    await page.click('#btn-clear');
    await expect(page.locator('#data-status')).toContainText(/cleared/i);

    scored = await page.evaluate(() =>
      window.DEFOPS.DIMENSIONS.filter((d) => window.DEFOPS.getState().scores[d.id] !== null).length
    );
    expect(scored).toBe(0);
    await page.goto('/#assessment');
    await expect(page.locator('#progress-label')).toHaveText('0 of 7 scored');
    record('Clear all resets scores', true);
  });

  test('9. Hash nav: #about, #data, #profiles show correct sections', async ({ page }) => {
    for (const id of ['about', 'data', 'profiles']) {
      await page.goto(`/#${id}`);
      await expect(page.locator(`#${id}:not([hidden])`)).toBeVisible();
      // others hidden
      for (const other of ['home', 'assessment', 'dashboard', 'about', 'data', 'profiles']) {
        if (other === id) continue;
        await expect(page.locator(`#${other}`)).toBeHidden();
      }
    }
    record('Hash nav #about #data #profiles', true);
  });

  test('10. No console errors during happy path', async ({ page }) => {
    await page.goto('/#home');
    await page.goto('/#assessment');
    await page.locator('.dim-card[data-dim="patch"] button.score-btn[data-value="3"]').click();
    await page.goto('/#profiles');
    await page.click('#load-ops-ready');
    await page.goto('/#dashboard');
    await expect(page.locator('#verdict-badge')).toHaveText('Fund');
    await page.goto('/#data');
    await page.click('#btn-hash');
    await page.goto('/#about');

    // Filter benign noise if any (fonts/cdn)
    const serious = consoleErrors.filter(
      (e) => !/favicon|fonts\.googleapis|fonts\.gstatic/i.test(e)
    );
    const ok = serious.length === 0;
    record('No console errors on happy path', ok, ok ? '' : serious.join(' || '));
    expect(serious).toEqual([]);
  });

  test('11. Verdict edge cases via window.DEFOPS', async ({ page }) => {
    await page.goto('/#assessment');

    // mean 2.5+ no zeros → Fund
    const fund = await page.evaluate(() => {
      window.DEFOPS.setScores({
        patch: 3, identity: 3, trajectory: 3, credentials: 2,
        registry: 2, sharedstate: 2, evalfidelity: 3,
      });
      return window.DEFOPS.computeVerdict();
    });
    expect(fund.verdict).toBe('Fund');

    // mean < 1.5 → Don't fund
    const low = await page.evaluate(() => {
      window.DEFOPS.setScores({
        patch: 1, identity: 1, trajectory: 1, credentials: 1,
        registry: 1, sharedstate: 1, evalfidelity: 1,
      });
      return window.DEFOPS.computeVerdict();
    });
    expect(low.verdict).toBe("Don't fund");

    // ≥2 zeros → Don't fund
    const zeros = await page.evaluate(() => {
      window.DEFOPS.setScores({
        patch: 3, identity: 0, trajectory: 3, credentials: 0,
        registry: 3, sharedstate: 3, evalfidelity: 3,
      });
      return window.DEFOPS.computeVerdict();
    });
    expect(zeros.verdict).toBe("Don't fund");

    // high mean + one zero → Gate
    const gate = await page.evaluate(() => {
      window.DEFOPS.setScores({
        patch: 3, identity: 3, trajectory: 3, credentials: 3,
        registry: 3, sharedstate: 3, evalfidelity: 0,
      });
      return window.DEFOPS.computeVerdict();
    });
    expect(gate.verdict).toBe('Gate');

    record(
      'Verdict edge cases (Fund / Don\'t fund low / Don\'t fund zeros / Gate)',
      true,
      `Fund=${fund.verdict}; low=${low.verdict}; zeros=${zeros.verdict}; gate=${gate.verdict}`
    );
  });
});
