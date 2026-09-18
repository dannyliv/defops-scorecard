const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const base = process.env.TEST_URL || 'http://127.0.0.1:8766';
(async () => {
  const browser = await chromium.connectOverCDP(process.env.CDP_URL || 'http://127.0.0.1:9222');
  const context = browser.contexts()[0];
  let page = await context.newPage();
  const failures=[];
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const check=async(name,fn)=>{try{await fn();console.log('PASS '+name)}catch(e){failures.push(name+': '+e.message);console.error('FAIL '+name+': '+e.message)}};
  let savedStorage;
  try {
    await page.goto(base,{waitUntil:'networkidle'});
    savedStorage=await page.evaluate(()=>({current:localStorage.getItem('defops-scorecard-v2'),backup:localStorage.getItem('defops-scorecard-backup-v2'),legacy:localStorage.getItem('defops-scorecard-v1')}));
    await page.evaluate(()=>{localStorage.removeItem('defops-scorecard-v2');localStorage.removeItem('defops-scorecard-v1');localStorage.removeItem('defops-scorecard-backup-v2')});
    await page.reload({waitUntil:'networkidle'});
    await check('app renders scoped assessment controls',async()=>{await page.locator('a[data-nav="assessment"]').click();await page.locator('#scope-system').waitFor({timeout:5000});assert.equal(await page.locator('#control-nav button').count(),7)});
    if(failures.length) throw Error(failures.join('\n'));
    await check('one high rating remains incomplete',async()=>{
      await page.locator('[data-score="3"]').click();
      await page.locator('a[data-nav="dashboard"]').click();
      assert.equal(await page.locator('#review-status').innerText(),'Incomplete');
      assert.ok(!(await page.locator('#review-summary').innerText()).includes('100%'));
    });
    await check('scope and scores survive reload',async()=>{
      await page.locator('a[data-nav="assessment"]').click();
      await page.locator('#scope-system').fill('Browser regression assessment');
      await page.reload({waitUntil:'networkidle'});
      assert.equal(await page.locator('#scope-system').inputValue(),'Browser regression assessment');
      assert.equal(await page.locator('[data-score="3"]').getAttribute('aria-pressed'),'true');
    });
    await check('demo stays isolated from real assessment',async()=>{
      await page.locator('a[data-nav="overview"]').click();await page.locator('#load-sample').click();
      assert.equal(await page.locator('#demo-banner').isVisible(),true);
      assert.equal(await page.locator('#review-status').innerText(),'Needs remediation');
      await page.locator('#exit-demo').click();
      await page.locator('a[data-nav="assessment"]').click();
      assert.equal(await page.locator('#scope-system').inputValue(),'Browser regression assessment');
    });
    await check('critical gate clears only after passed exercise with evidence',async()=>{
      await page.locator('a[data-nav="overview"]').click();await page.locator('#load-sample').click();
      await page.locator('a[data-nav="assessment"]').click();await page.locator('[data-control="identity"]').click();
      assert.equal(await page.locator('#control-status option[value="excluded"]').count(),0);
      await page.locator('[data-score="2"]').click();
      await page.locator('#control-outcome').selectOption('passed');
      await page.locator('#control-result').fill('Old credential denied on every scoped service.');
      await page.locator('a[data-nav="dashboard"]').click();
      assert.equal(await page.locator('#review-status').innerText(),'Ready for review');
    });
    await check('download bytes match displayed snapshot hash',async()=>{
      await page.locator('a[data-nav="data"]').click();await page.locator('#export-btn').click();
      await page.waitForFunction(()=>document.querySelector('#export-hash').textContent.trim().length===64);
      const displayed=(await page.locator('#export-hash').innerText()).trim();
      const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#download-export').click()]);
      const bytes=await fs.readFile(await download.path());
      assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),displayed);
      const payload=JSON.parse(bytes.toString());assert.equal(payload.assessment.isSample,true);
    });
    await page.locator('#exit-demo').click();await page.locator('a[data-nav="data"]').click();
    await check('invalid imports do not replace stored work',async()=>{
      const before=await page.evaluate(()=>localStorage.getItem('defops-scorecard-v2'));
      await page.locator('#import-file').setInputFiles({name:'unrelated.json',mimeType:'application/json',buffer:Buffer.from('{}')});
      await page.waitForFunction(()=>document.querySelector('#app-message').textContent.includes('Import rejected'));
      assert.equal(await page.evaluate(()=>localStorage.getItem('defops-scorecard-v2')),before);
      assert.equal(await page.locator('#apply-import').isDisabled(),true);
    });
    await check('valid import previews before explicit replacement and backup restores',async()=>{
      const sample=await page.evaluate(()=>DefopsModel.serializeExport(DefopsModel.createSample('ready')));
      await page.locator('#import-file').setInputFiles({name:'assessment.json',mimeType:'application/json',buffer:Buffer.from(sample)});
      await page.locator('#apply-import').waitFor({state:'visible'});
      await page.waitForFunction(()=>!document.querySelector('#apply-import').disabled);
      assert.ok((await page.evaluate(()=>localStorage.getItem('defops-scorecard-v2'))).includes('Browser regression assessment'));
      await page.locator('#apply-import').click();
      // Imported samples remain isolated and never replace real work.
      assert.equal(await page.locator('#demo-banner').isVisible(),true);
      await page.locator('#exit-demo').click();
      const real=JSON.parse(sample);real.assessment.isSample=false;real.assessment.scope.system='Replacement assessment';
      await page.locator('#import-file').setInputFiles({name:'replacement.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(real))});
      await page.waitForFunction(()=>!document.querySelector('#apply-import').disabled);
      await page.locator('#apply-import').click();
      await page.locator('#restore-backup').click();
      await page.locator('a[data-nav="assessment"]').click();
      assert.equal(await page.locator('#scope-system').inputValue(),'Browser regression assessment');
    });
    await check('unreadable saved data survives editing until explicit recovery',async()=>{
      // A fresh tab avoids Chrome's repeated-download prompt in a personal profile.
      await page.close(); page = await context.newPage();
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(base, {waitUntil:'networkidle'});
      await page.evaluate(()=>localStorage.setItem('defops-scorecard-v2','{damaged assessment'));
      await page.reload({waitUntil:'networkidle'});
      await page.locator('a[data-nav="assessment"]').click();
      await page.locator('#scope-system').fill('Unsaved recovery draft');
      assert.equal(await page.evaluate(()=>localStorage.getItem('defops-scorecard-v2')),'{damaged assessment');
      await page.locator('a[data-nav="data"]').click();
      const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#download-recovery').click()]);
      assert.equal((await fs.readFile(await download.path())).toString(),'{damaged assessment');
    });
    await check('mobile layout and page runtime remain sound',async()=>{
      await page.setViewportSize({width:390,height:844});
      for(const name of ['overview','assessment','dashboard','data','framework']){
        await page.locator(`a[data-nav="${name}"]`).click();
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'overflow '+name);
      }
      assert.deepEqual(errors,[]);
    });
  } finally {
    if(savedStorage) await page.evaluate(s=>{for(const [key,value]of Object.entries({'defops-scorecard-v2':s.current,'defops-scorecard-backup-v2':s.backup,'defops-scorecard-v1':s.legacy})){if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value)}},savedStorage).catch(()=>{});
    await page.close();
    await browser.close();
  }
  if(failures.length)throw Error(failures.join('\n'));
})().catch(e=>{console.error(e.message);process.exitCode=1});
