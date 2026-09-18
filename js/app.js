/* DEFOPS: browser controller. Assessment logic lives in model.js. */
(() => {
  'use strict';
  const M = window.DefopsModel;
  const STORE = 'defops-scorecard-v2';
  const BACKUP = 'defops-scorecard-backup-v2';
  const LEGACY = 'defops-scorecard-v1';
  const RECOVERY = 'defops-unreadable-recovery-v2';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let startupMessage = '';
  let recovery = null;
  let real = load();
  let demo = null;
  let active = 'patch';
  let pending = null;
  let snapshot = null;
  let revision = 0;
  let importGeneration = 0;
  const current = () => demo || real;

  function load() {
    let original = '';
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) { original = raw; return M.validateAssessment(JSON.parse(raw)); }
      const legacy = localStorage.getItem(LEGACY);
      if (legacy) {
        original = legacy;
        startupMessage = 'Previous scores restored as self-reported ratings. Add scope and test evidence before review.';
        return M.migrateLegacy(JSON.parse(legacy));
      }
    } catch (error) {
      recovery = original;
      startupMessage = 'Saved data could not be read. Autosave is paused to protect the original. Download it from Data, then import a valid assessment or clear this draft to start again.';
    }
    return M.createAssessment();
  }
  function message(text, error = false) {
    $('app-message').textContent = text;
    $('app-message').classList.toggle('error', error);
  }
  function invalidateSnapshot() {
    revision++;
    snapshot = null;
    $('export-hash').textContent = '';
    $('export-snapshot').textContent = 'Prepare an export to create a fixed snapshot and its matching file hash.';
    $('download-export').disabled = true;
    $('copy-hash').disabled = true;
  }
  function persist() {
    current().updatedAt = new Date().toISOString();
    invalidateSnapshot();
    if (demo) {
      $('saved-state').textContent = 'Sample session only';
      return;
    }
    if (recovery !== null) {
      $('saved-state').textContent = 'Recovery required; draft not saved';
      return;
    }
    try {
      localStorage.setItem(STORE, JSON.stringify(real));
      $('saved-state').textContent = 'Saved in this browser';
    } catch (error) {
      $('saved-state').textContent = 'Not saved';
      message('Browser storage is unavailable. Export your work before leaving this page.', true);
    }
  }
  function saveReplacement(next) {
    // Back up successfully before replacing the active assessment.
    const previous = JSON.stringify(real);
    const replacement = JSON.stringify(next);
    try {
      if (recovery !== null) localStorage.setItem(RECOVERY, recovery);
      localStorage.setItem(BACKUP, previous);
      localStorage.setItem(STORE, replacement);
    } catch (error) {
      message('Replacement cancelled because browser storage is unavailable. Your active assessment is unchanged.', true);
      return false;
    }
    real = next;
    recovery = null;
    demo = null;
    invalidateSnapshot();
    return true;
  }
  function hasBackup() {
    try { return !!localStorage.getItem(BACKUP); } catch { return false; }
  }
  function statusName(status) {
    return ({unassessed:'Unassessed',missing:'Evidence needed',failed:'Needs work',stale:'Retest due',passed:'Evidence entered',excluded:'Excluded'})[status] || status;
  }
  function result() { return M.evaluate(current()); }

  function renderScope() {
    for (const key of ['system','environment','owner','boundary']) $('scope-' + key).value = current().scope[key];
    $('policy-max-age').value = current().policy.maxAgeDays;
  }
  function renderNav() {
    const report = result();
    $('control-nav').innerHTML = M.DIMENSIONS.map((d,i) => {
      const check = report.controls.find(c => c.id === d.id);
      return `<button type="button" class="control-nav-button ${d.id === active ? 'active' : ''}" data-control="${d.id}" aria-current="${d.id === active ? 'step' : 'false'}"><span class="control-number">${String(i+1).padStart(2,'0')}</span><span><strong>${esc(d.shortName)}</strong><small>${esc(statusName(check.status))}</small></span><span class="control-dot ${check.status}" aria-hidden="true"></span></button>`;
    }).join('');
  }
  function field(key, label, options = {}) {
    const c = current().controls[active];
    const helper = options.helper ? `<small class="helper">${esc(options.helper)}</small>` : '';
    const props = `id="control-${key}" name="${key}" data-field="${key}"`;
    let input;
    if (options.select) input = `<select ${props}>${options.select.map(([v,n])=>`<option value="${v}" ${c[key] === v ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
    else if (options.multiline) input = `<textarea ${props} rows="${options.rows || 2}" maxlength="10000">${esc(c[key])}</textarea>`;
    else input = `<input ${props} type="${options.type || 'text'}" value="${esc(c[key])}" ${options.type === 'date' ? `max="${new Date().toISOString().slice(0,10)}"` : 'maxlength="2000"'}>`;
    return `<div class="field"><label for="control-${key}">${esc(label)}</label>${input}${helper}</div>`;
  }
  function renderControl() {
    const d = M.DIMENSIONS.find(d=>d.id===active);
    const c = current().controls[active];
    const stateOptions = [['unassessed','Unassessed'],['scored','Assess this control']];
    if (!d.critical) stateOptions.push(['excluded','Not applicable to this scope']);
    $('control-detail').innerHTML = `<div class="section-heading"><div><p class="eyebrow">Control ${M.DIMENSIONS.indexOf(d)+1} of 7</p><h2>${esc(d.name)}</h2></div><span class="badge ${d.critical ? 'critical' : 'missing'}">${d.critical ? 'Required gate' : 'Scope dependent'}</span></div><p class="control-description">${esc(d.description)}</p><div class="test-brief"><span class="eyebrow">Exercise to run</span><p>${esc(d.test)}</p></div><form class="control-form" id="control-form">${field('status','Assessment state',{select:stateOptions})}${c.status !== 'excluded' ? `<fieldset class="score-fieldset"><legend>Observed maturity</legend><div class="score-options">${M.RUBRIC.map(r=>`<button type="button" class="score-option ${c.score === r.value && c.status==='scored' ? 'selected' : ''}" data-score="${r.value}" aria-pressed="${c.score===r.value && c.status==='scored'}"><span class="score-value">${r.value}</span><span><strong>${esc(r.label)}</strong><small>${esc(r.detail)}</small></span></button>`).join('')}</div></fieldset>` : ''}<div class="evidence-panel"><div class="section-heading"><h3>${c.status === 'excluded' ? 'Document the exclusion' : 'Record the evidence'}</h3><span class="status-chip">Self-reported</span></div>${c.status === 'excluded' ? field('owner','Owner approving this exclusion')+field('exclusion','Reason this control does not apply',{multiline:true,helper:'Tie the exclusion to the deployment boundary. Required gates cannot be excluded.'}) : `<div class="field-row">${field('owner','Control owner')}${field('testedAt','Test date',{type:'date'})}</div><div class="field-row">${field('outcome','Observed outcome',{select:[['not-tested','Not tested'],['passed','Passed'],['failed','Failed']]})}${field('reviewer','Reviewer',{helper:'Required for a score of 3. Name the person who reviewed the deployed test.'})}</div>${field('evidence','Evidence reference',{helper:'Link or identifier for the test record. Reference evidence; do not paste credentials or sensitive logs.'})}${field('result','Observed result',{multiline:true,helper:'State the measured result and whether it met the target agreed for this deployment.'})}`}${field('notes','Next action or review notes',{multiline:true})}</div></form><div class="control-footer"><button type="button" class="button secondary" id="previous-control" ${active === M.DIMENSIONS[0].id ? 'disabled' : ''}>Previous control</button><button type="button" class="button primary" id="next-control">${active === M.DIMENSIONS[6].id ? 'Review assessment' : 'Next control'}</button></div>`;
  }
  function renderReview() {
    const report = result();
    const state = current();
    $('review-status').textContent = report.label;
    $('review-status').className = 'review-status ' + report.status;
    const summaries = {
      incomplete:'Finish the scope and missing evidence before this assessment can enter review.',
      remediate:'Resolve the open control failures and retest. Other results cannot cancel these gaps.',
      review:'Required records are present under your review policy. A person must still inspect the evidence and approve any deployment.'
    };
    $('review-summary').textContent = summaries[report.status];
    $('dashboard-scope').textContent = state.scope.system ? `${state.scope.system} / ${state.scope.environment || 'Environment not specified'}` : 'No deployment scoped yet';
    $('metric-assessed').textContent = `${report.assessed} / 7`;
    $('metric-passed').textContent = `${report.passed} / ${report.applicable}`;
    $('metric-critical').textContent = `${report.criticalPassed} / 3`;
    $('critical-gates').innerHTML = M.DIMENSIONS.filter(d=>d.critical).map(d=>{
      const c=report.controls.find(c=>c.id===d.id);
      return `<a href="#assessment" class="gate-card ${c.status}" data-review-control="${d.id}"><div class="gate-top"><span class="eyebrow">Required gate</span><span class="gate-symbol" aria-hidden="true">${c.status==='passed' ? '&#10003;' : '&#8599;'}</span></div><h3>${esc(d.shortName)}</h3><p>${esc(statusName(c.status))}</p><span class="helper">${esc(c.issues[0] || 'Inspect the entered test record.')}</span></a>`;
    }).join('');
    $('open-actions').innerHTML = report.blockers.length ? report.blockers.map(b=>`<li class="action-item"><span class="action-marker ${b.kind}" aria-hidden="true"></span><div><strong>${esc(b.title)}</strong><p>${esc(b.detail)}</p></div><a class="action-link" href="#assessment" ${M.DIMENSIONS.some(d=>d.id===b.id) ? `data-review-control="${b.id}"` : ''}>Review<span class="sr-only"> ${esc(b.title)}</span> &rarr;</a></li>`).join('') : '<li class="empty-state"><strong>Ready for a human review.</strong><p>Inspect the referenced evidence, challenge the results, and record the deployment decision outside this self-assessment.</p></li>';
    $('full-control-list').innerHTML = report.controls.map(c=>{
      const d=M.DIMENSIONS.find(d=>d.id===c.id), record=state.controls[c.id];
      return `<a href="#assessment" class="control-row" data-review-control="${c.id}"><span>${esc(d.name)}</span><span class="control-rating">${record.status==='scored' ? `${record.score} / 3` : record.status==='excluded' ? 'N/A' : 'Unassessed'}</span><span class="badge ${c.status}">${esc(statusName(c.status))}</span></a>`;
    }).join('');
  }
  function render() {
    $('demo-banner').hidden = !demo;
    $('demo-label').textContent = 'Sample data. Fictional evidence for demonstration only.';
    $('saved-state').textContent = demo ? 'Sample session only' : recovery !== null ? 'Recovery required; draft not saved' : 'Local assessment';
    $('restore-backup').disabled = !hasBackup() || !!demo;
    $('clear-assessment').disabled = !!demo;
    renderScope(); renderNav(); renderControl(); renderReview(); renderRecovery();
  }
  function renderRecovery() {
    let raw = recovery;
    if (raw === null) { try { raw = localStorage.getItem(RECOVERY); } catch {} }
    let panel = $('recovery-panel');
    if (raw === null) { if (panel) panel.hidden = true; return; }
    if (!panel) {
      panel = document.createElement('section'); panel.id = 'recovery-panel'; panel.className = 'data-card';
      panel.innerHTML = '<h2>Recover unreadable data</h2><p>An original record is protected. Download its exact contents before repairing it or starting over.</p><button type="button" id="download-recovery" class="button secondary">Download original record</button>';
      document.querySelector('[data-view="data"]').append(panel);
      $('download-recovery').addEventListener('click', () => {
        let original = recovery;
        if (original === null) { try { original = localStorage.getItem(RECOVERY); } catch {} }
        if (original === null) return;
        const url = URL.createObjectURL(new Blob([original], {type:'text/plain'}));
        const link = document.createElement('a'); link.href = url; link.download = 'defops-recovery.txt';
        document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      });
    }
    panel.hidden = false;
  }
  function changed() { persist(); renderNav(); renderReview(); }
  function showView() {
    const aliases={home:'overview',profiles:'data',about:'framework'};
    let view=location.hash.slice(1) || 'overview';view=aliases[view] || view;
    if (!['overview','assessment','dashboard','data','framework'].includes(view))view='overview';
    document.querySelectorAll('[data-view]').forEach(el=>{el.hidden=el.dataset.view!==view;});
    document.querySelectorAll('a[data-nav]').forEach(el=>{
      const selected=el.dataset.nav===view;
      if(selected)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');
    });
    if(view==='dashboard')renderReview();
    window.scrollTo({top:0,behavior:'instant'});
  }
  function beginDemo(kind='gap') {
    demo=M.createSample(kind); active=kind==='gap' ? 'identity' : 'patch';
    invalidateSnapshot(); pending=null;clearImport();render();location.hash='dashboard';
    message('Sample opened in an isolated session. Your saved assessment is unchanged.');
  }
  function clearImport() {
    pending=null;importGeneration++;
    $('import-preview').hidden=true;
    $('import-preview').textContent='';$('apply-import').disabled=true;
    $('import-file').value='';
  }
  async function prepareExport() {
    const token=revision;
    $('export-btn').disabled=true;
    try {
      const text=M.serializeExport(current());
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
      if(token!==revision)return;
      const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
      snapshot={text,hash,filename:`defops-${current().isSample ? 'sample-' : ''}${new Date().toISOString().slice(0,10)}.json`};
      $('export-hash').textContent=hash;
      $('export-snapshot').textContent=`Snapshot prepared. ${new TextEncoder().encode(text).length.toLocaleString()} bytes. This hash matches the downloaded file. Editing the assessment invalidates this snapshot.`;
      $('download-export').disabled=false;$('copy-hash').disabled=false;
      message('Export snapshot ready. The assessment includes its scope, evidence records, review status, and sample label.');
    } catch(error) { message('Could not prepare export: '+error.message,true); }
    finally { $('export-btn').disabled=false; }
  }
  async function previewImport(file) {
    clearImport();const token=++importGeneration;
    if(!file)return;
    try {
      if(file.size>1024*1024)throw Error('File exceeds the 1 MB limit.');
      const candidate=M.parseImport(await file.text());
      if(token!==importGeneration)return;
      pending=candidate;
      const report=M.evaluate(candidate);
      $('import-preview').hidden=false;
      $('import-preview').textContent=`${candidate.isSample ? 'SAMPLE / ' : ''}${candidate.scope.system || 'Legacy assessment'}: ${report.assessed} of 7 assessed. ${report.label}. ${candidate.isSample ? 'This opens an isolated sample session.' : 'Applying this file replaces your active assessment. A restore point will be saved first.'}`;
      $('apply-import').disabled=false;
      message('Import validated. Review the preview before applying it.');
    } catch(error) {
      if(token!==importGeneration)return;
      message('Import rejected: '+error.message+' Your saved assessment is unchanged.',true);
    }
  }

  $('scope-form').addEventListener('submit',e=>e.preventDefault());
  $('scope-form').addEventListener('input',e=>{
    const id=e.target.id;
    if(id.startsWith('scope-'))current().scope[id.slice(6)]=e.target.value;
    if(id==='policy-max-age') {
      const value=Number(e.target.value);
      if(!Number.isInteger(value)||value<1||value>365)return;
      current().policy.maxAgeDays=value;
    }
    changed();
  });
  $('control-nav').addEventListener('click',e=>{
    const button=e.target.closest('[data-control]');if(!button)return;
    active=button.dataset.control;renderNav();renderControl();
  });
  $('control-detail').addEventListener('submit',e=>e.preventDefault());
  $('control-detail').addEventListener('click',e=>{
    const score=e.target.closest('[data-score]');
    if(score){current().controls[active].status='scored';current().controls[active].score=Number(score.dataset.score);changed();renderControl();return;}
    const nav=e.target.closest('#next-control, #previous-control');
    if(nav){const index=M.DIMENSIONS.findIndex(d=>d.id===active)+(nav.id==='next-control'?1:-1);if(index===7){location.hash='dashboard';return;}if(index>=0){active=M.DIMENSIONS[index].id;renderNav();renderControl();$('control-detail').scrollIntoView({behavior:'smooth',block:'start'});}}
  });
  $('control-detail').addEventListener('input',e=>{
    const key=e.target.dataset.field;if(!key)return;
    current().controls[active][key]=e.target.value;
    if(key==='status'){
      if(e.target.value!=='scored')current().controls[active].score=null;
      // An assessed state needs an explicit score selection.
      if(e.target.value==='scored'&&current().controls[active].score===null)current().controls[active].status='unassessed';
    }
    changed();if(key==='status')renderControl();
  });
  document.addEventListener('click',e=>{
    const link=e.target.closest('[data-review-control]');if(!link)return;
    active=link.dataset.reviewControl;renderNav();renderControl();
  });
  $('load-sample').addEventListener('click',()=>beginDemo('gap'));
  $('load-sample-data').addEventListener('click',()=>beginDemo('gap'));
  $('load-ready-sample').addEventListener('click',()=>beginDemo('ready'));
  $('exit-demo').addEventListener('click',()=>{demo=null;active='patch';clearImport();invalidateSnapshot();render();message('Returned to your saved assessment. Sample changes were not saved.');});
  $('export-btn').addEventListener('click',prepareExport);
  $('download-export').addEventListener('click',()=>{
    if(!snapshot)return;
    const url=URL.createObjectURL(new Blob([snapshot.text],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download=snapshot.filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  $('copy-hash').addEventListener('click',async()=>{if(!snapshot)return;try{await navigator.clipboard.writeText(snapshot.hash);message('Matching file hash copied.');}catch{message('Select and copy the displayed hash.');}});
  $('import-file').addEventListener('change',e=>previewImport(e.target.files[0]));
  $('cancel-import').addEventListener('click',()=>{clearImport();message('Import cancelled.');});
  $('apply-import').addEventListener('click',()=>{
    if(!pending)return;
    const next=pending;
    if(next.isSample){demo=next;clearImport();invalidateSnapshot();render();message('Imported sample opened in an isolated session.');return;}
    if(saveReplacement(next)){active='patch';clearImport();render();message('Assessment replaced. Restore previous assessment is available.');}
  });
  $('restore-backup').addEventListener('click',()=>{
    if(demo)return;
    try{const previous=M.validateAssessment(JSON.parse(localStorage.getItem(BACKUP)));if(saveReplacement(previous)){render();message('Previous assessment restored. The replaced version is now the restore point.');}}catch{message('No valid restore point is available.',true);}
  });
  $('clear-assessment').addEventListener('click',()=>{
    if(demo||!confirm('Clear this assessment? A restore point will be saved.'))return;
    if(saveReplacement(M.createAssessment())){active='patch';render();message('Assessment cleared. You can restore the previous assessment.');}
  });
  $('framework-controls').innerHTML=M.DIMENSIONS.map(d=>`<article class="framework-control"><div class="section-heading"><h3>${esc(d.name)}</h3>${d.critical?'<span class="badge critical">Required</span>':''}</div><p>${esc(d.test)}</p></article>`).join('');
  window.addEventListener('hashchange',showView);
  render();showView();if(startupMessage)message(startupMessage,true);
})();
