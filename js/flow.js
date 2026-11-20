/* Green Job Cards — request flow.
   Pre-trip (cost + approval) ─┬─ Site call-out: Trip-prep (equipment & tools) → BOM check → Site call-out job card
                               └─ Site visit: Site visit report
   Plus technician ratings (call-out outcomes + client ratings). */
'use strict';

/* ------------------------------------------------------------------ constants */
const APPROVAL = {
  pending: { l: 'No feedback yet', i: '?', d: 'Waiting for the manager' },
  approved: { l: 'Approved', i: '✓', d: 'Go ahead' },
  deferred: { l: 'Deferred', i: '↻', d: 'Can be rescheduled' },
  cancelled: { l: 'Cancelled', i: '✕', d: 'Will not go ahead' },
};
const AP_ORDER = ['pending', 'approved', 'deferred', 'cancelled'];
const apChip = a => `<span class="chip ap ${a || 'pending'}">${APPROVAL[a || 'pending'].i} ${APPROVAL[a || 'pending'].l}</span>`;
const KIND_L = { callout: 'Site call-out', visit: 'Site visit' };
const JOB_TYPES = ['Breakdown / repair', 'Scheduled service', 'Installation', 'Toner / consumables', 'Inspection / assessment', 'Training / support', 'Other'];
const OUTCOMES = ['Resolved', 'Partly resolved', 'Follow-up required', 'Not resolved'];
const OUT_PTS = { 'Resolved': 5, 'Partly resolved': 1, 'Follow-up required': 0, 'Not resolved': -2 };
const CRATE = { excellent: { l: 'Excellent', pts: 5, cls: 'ex' }, average: { l: 'Average', pts: 1, cls: 'av' }, poor: { l: 'Poor', pts: -2, cls: 'po' } };
const NEXT_STEPS = ['No further action', 'Quote to be sent', 'Call-out to be scheduled', 'Other'];
const faceSVG = (k, cls = '') => { const m = { excellent: 'M7.5 14c1.2 2 2.7 3 4.5 3s3.3-1 4.5-3', average: 'M8 15.5h8', poor: 'M7.5 17c1.2-2 2.7-3 4.5-3s3.3 1 4.5 3' }[k];
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><circle cx="8.8" cy="9.5" r="1.1" fill="currentColor"/><circle cx="15.2" cy="9.5" r="1.1" fill="currentColor"/><path d="${m}"/></svg>`; };
const blankRow = () => ({ id: uid(), name: '', serial: '', qty: '', ph: '' });
const filled = a => (a || []).filter(r => (r.name || '').trim());
const ensureRows = (a, n = 5) => { while (a.length < n) a.push(blankRow()); return a; };
const custSigned = j => !!(j.sign && (j.sign.cust.sig || j.sign.cust.photo));
const siteKm = j => { const a = num(j.odoStart), b = num(j.odoSite); return a != null && b != null && b >= a ? Math.round((b - a) * 10) / 10 : null; };
async function loadScript(src) { if ([...document.scripts].some(s => s.src.endsWith(src))) return; await new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); document.head.appendChild(s); }); }
const subTitle = t => `<div class="hint" style="font-weight:600;font-size:14px;margin-bottom:6px">${t}</div>`;

/* ------------------------------------------------------------------ request stage (one pre-trip = one request) */
function stageOf(p, j) {
  const a = p.approval || 'pending';
  if (a === 'cancelled') return { k: 'cancelled', l: 'Cancelled', i: 1 };
  if (a === 'deferred') return { k: 'deferred', l: 'Deferred — to be rescheduled', i: 1 };
  if (a !== 'approved') return { k: 'awaiting', l: 'Waiting for approval', i: 1 };
  if (p.kind === 'visit') return j && j.status === 'completed' ? { k: 'done', l: 'Site visit report done', i: 4 } : { k: 'visit', l: j ? 'Site visit in progress' : 'Ready for the site visit', i: 2 };
  const pr = p.prep || {};
  if (!pr.finishedAt) return { k: 'prep', l: filled(pr.equip).length + filled(pr.tools).length ? 'Trip-prep in progress' : 'Trip-prep to do', i: 2 };
  if (!pr.bomAt) return { k: 'bom', l: 'BOM check outstanding', i: 3 };
  if (j && j.status === 'completed') return { k: 'done', l: 'Job card completed', i: 6 };
  return { k: 'callout', l: j ? 'Call-out in progress' : 'Ready for the call-out', i: 4 };
}
function trackHTML(p, st) {
  const steps = p.kind === 'visit' ? ['Pre-trip', 'Approval', 'Site visit', 'Report'] : ['Pre-trip', 'Approval', 'Trip-prep', 'BOM check', 'Call-out', 'Job card'];
  return `<div class="track">${steps.map((s, i) => {
    let c = i < st.i ? 'done' : i === st.i ? 'cur' : '', ic = i < st.i ? '✓' : i + 1;
    if (i === 1 && st.k === 'cancelled') { c = 'bad'; ic = '✕'; } if (i === 1 && st.k === 'deferred') { c = 'def'; ic = '↻'; } if (i === 1 && st.k === 'awaiting') ic = '?';
    return `${i ? `<span class="ln ${i <= st.i ? 'done' : ''}"></span>` : ''}<span class="st ${c}"><i>${ic}</i>${s}</span>`; }).join('')}</div>`;
}
function nextAction(p, j, st) {
  switch (st.k) {
    case 'awaiting': case 'deferred': case 'cancelled': return { l: 'Open pre-trip', h: `#/pretrip/${p.id}`, c: 'ghost' };
    case 'prep': return { l: 'Trip-prep', h: `#/prep/${p.id}`, c: 'pri', i: 'box' };
    case 'bom': return { l: 'Do BOM check', h: `#/bom/${p.id}`, c: 'pri', i: 'list' };
    case 'callout': return j ? { l: 'Open call-out', h: `#/job/${j.id}`, c: 'pri', i: 'job' } : { l: 'Start call-out', h: `#/start/${p.id}`, c: 'pri', i: 'job' };
    case 'visit': return j ? { l: 'Open site visit', h: `#/visit/${j.id}`, c: 'pri', i: 'eye' } : { l: 'Start site visit', h: `#/start/${p.id}`, c: 'pri', i: 'eye' };
    case 'done': return { l: p.kind === 'visit' ? 'View report' : 'View job card', h: `#/${p.kind === 'visit' ? 'visit' : 'job'}/${j.id}`, c: 'ghost' };
  }
}
async function loadAll() {
  const [R, trips, jobs] = await Promise.all([refs(), DB.all('trips'), DB.all('jobs')]);
  const JT = {}; jobs.forEach(j => { if (j.pretripId) JT[j.pretripId] = j; });
  trips.forEach(p => { p.kind = p.kind || 'callout'; p.approval = p.approval || 'pending'; });
  return { R, trips: trips.sort((a, b) => b.updatedAt - a.updatedAt), jobs: jobs.sort((a, b) => b.updatedAt - a.updatedAt), JT };
}
function reqRow(p, D, opt = {}) {
  const j = D.JT[p.id], st = stageOf(p, j), a = nextAction(p, j, st), R = D.R;
  const techs = (p.techIds || []).map(id => R.T[id]).filter(Boolean).map(t => t.name).join(', ');
  return `<div class="req ${opt.locked ? 'locked' : ''}"><div class="top2"><span class="av" style="width:48px;height:48px;border-radius:12px;background:var(--tint);color:var(--g-d);display:flex;align-items:center;justify-content:center">${(p.kind === 'visit' ? ICON.eye : ICON.job).replace('<svg', '<svg width="26" height="26"')}</span>
    <div class="tx"><b>${esc(p.no)} · ${esc(destInfo(p, R).label)}</b><div>${KIND_L[p.kind]} · ${esc(fmtD(p.date))}${p.dept ? ' · ' + esc(p.dept) : ''}${techs ? ' · ' + esc(techs) : ''}${p.purpose ? ' · ' + esc(p.purpose) : ''}</div>${trackHTML(p, st)}</div>
    <div class="acts" style="align-items:center">${apChip(p.approval)}${a ? `<a class="btn ${a.c} sm" href="${a.h}">${a.i ? ICON[a.i] : ''}${a.l}</a>` : ''}</div></div></div>`;
}
function lockPage(title, msg, btns = []) {
  app.innerHTML = `<div class="lock">${I('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>')}<div><b>${esc(title)}</b><p style="margin:6px 0 14px;color:var(--muted)">${msg}</p><div class="acts">${btns.map(b => `<a class="btn ${b.c || 'pri'}" href="${b.h}">${b.l}</a>`).join('')}</div></div></div>`;
}

/* ------------------------------------------------------------------ technician ratings */
function scoreJobs(jobs) {
  const S = {};
  for (const j of jobs) {
    if (j.status !== 'completed') continue;
    const ids = [...new Set([j.techId, ...(j.assistIds || [])].filter(Boolean))];
    const op = j.kind !== 'visit' && j.outcome ? OUT_PTS[j.outcome] || 0 : 0;
    const rk = custSigned(j) && j.rating && CRATE[j.rating.k] ? j.rating.k : null, rp = rk ? CRATE[rk].pts : 0;
    ids.forEach(id => { const s = S[id] = S[id] || { pts: 0, callouts: 0, visits: 0, out: {}, rate: {}, items: [] };
      s.pts += op + rp; if (j.kind === 'visit') s.visits++; else s.callouts++;
      if (j.kind !== 'visit' && j.outcome) s.out[j.outcome] = (s.out[j.outcome] || 0) + 1; if (rk) s.rate[rk] = (s.rate[rk] || 0) + 1;
      s.items.push({ j, op, rp, rk }); });
  }
  return S;
}
const levelOf = pts => pts >= 200 ? 'Platinum' : pts >= 100 ? 'Gold' : pts >= 40 ? 'Silver' : pts >= 10 ? 'Bronze' : 'Starter';
const PTS_RULES = 'Call-out outcome: Resolved +5 · Partly resolved +1 · Follow-up required 0 · Not resolved −2. Client rating (only when the customer signed): Excellent +5 · Average +1 · Poor −2. Points go to the lead and assisting technicians of completed job cards.';
async function techBoardHTML(limit) {
  const [techs, jobs] = await Promise.all([DB.all('techs'), DB.all('jobs')]); const S = scoreJobs(jobs);
  if (!techs.length) return '';
  const rows = techs.map(t => ({ t, s: S[t.id] || { pts: 0, callouts: 0, visits: 0, out: {}, rate: {} } })).sort((a, b) => b.s.pts - a.s.pts || b.s.callouts - a.s.callouts || a.t.name.localeCompare(b.t.name));
  const show = limit ? rows.slice(0, limit) : rows;
  return `<div class="card lb"><h2>${ICON.star.replace('<svg', '<svg width="24" height="24"')} Technician ratings<span class="r">${limit ? `<a href="#/techs">All technicians</a>` : 'points'}</span></h2>
    ${show.map(({ t, s }, i) => `<div class="row" onclick="go('#/tech/${t.id}')" style="cursor:pointer"><div class="pos">${i + 1}</div><div><b>${esc(t.name)}</b><span class="lvl ${levelOf(s.pts)}">${levelOf(s.pts)}</span><div class="mini-stats">${esc(deptOf(t))} · ${s.callouts} call-out(s) · ${s.visits} visit(s) · resolved ${s.out['Resolved'] || 0} · partly ${s.out['Partly resolved'] || 0} · follow-up ${s.out['Follow-up required'] || 0} · not resolved ${s.out['Not resolved'] || 0}</div>
      <div class="mini-stats">Client: <b style="color:#239047">${s.rate.excellent || 0} excellent</b> · <b style="color:#d9822b">${s.rate.average || 0} average</b> · <b style="color:#c62828">${s.rate.poor || 0} poor</b></div></div><div class="pts">${s.pts}<small>points</small></div></div>`).join('')}
    ${limit ? '' : `<div class="in" style="padding-top:8px"><p class="hint" style="margin:0">${esc(PTS_RULES)}</p></div>`}</div>`;
}
async function techHistoryHTML(tid) {
  const S = scoreJobs(await DB.all('jobs'))[tid]; if (!S) return '<div class="banner">No completed job cards yet — points appear here once a job card PDF has been created.</div>';
  return `<div class="card"><h2>${ICON.star.replace('<svg', '<svg width="24" height="24"')} Rating — ${S.pts} points <span class="lvl ${levelOf(S.pts)}">${levelOf(S.pts)}</span></h2>
    <div class="sheetwrap" style="border:0;border-radius:0"><table class="sheet ro"><tr><th>Job card</th><th>Date</th><th>Customer</th><th>Outcome</th><th>Client rating</th><th>Points</th></tr>
    ${S.items.sort((a, b) => String(b.j.date).localeCompare(String(a.j.date))).map(x => `<tr onclick="go('#/${x.j.kind === 'visit' ? 'visit' : 'job'}/${x.j.id}')" style="cursor:pointer"><td>${esc(x.j.no)}</td><td>${esc(fmtD(x.j.date))}</td><td>${esc(x.j.customer ? KINDS.customers.title(x.j.customer) : '—')}</td><td>${esc(x.j.kind === 'visit' ? 'site visit' : x.j.outcome || '—')}${x.op ? ` (${x.op > 0 ? '+' : ''}${x.op})` : ''}</td><td>${x.rk ? `${CRATE[x.rk].l} (${x.rp > 0 ? '+' : ''}${x.rp})` : '—'}</td><td><b>${x.op + x.rp > 0 ? '+' : ''}${x.op + x.rp}</b></td></tr>`).join('')}</table></div>
    <div class="in"><p class="hint" style="margin:0">${esc(PTS_RULES)}</p></div></div>`;
}

/* ------------------------------------------------------------------ home */
route('/', async () => {
  const D = await loadAll(), R = D.R;
  setTop('Green Job Cards', SET.company);
  const open = D.trips.filter(p => !['done', 'cancelled'].includes(stageOf(p, D.JT[p.id]).k));
  const cnt = k => D.trips.filter(p => stageOf(p, D.JT[p.id]).k === k).length;
  const done = D.jobs.filter(j => j.status === 'completed').slice(0, 5);
  const setup = [!R.techs.length && 'technicians', !R.vehicles.length && 'company vehicles', !R.customers.length && 'customers'].filter(Boolean);
  app.innerHTML = `${setup.length ? `<div class="banner warn">Set up first: add your ${setup.join(', ')} — or import them from another tablet in <a href="#/settings?s=data">Settings → Data</a>.</div>` : ''}
    <div class="tiles">
      <a class="tile hero" href="#/pretrip/new">${ICON.money}<b>New pre-trip</b><span>Every site call-out and site visit starts here: distance, cost and approval</span></a>
      <a class="tile hero hero2" href="#/pretrip">${ICON.trip}<b>Pre-trips</b><span>${cnt('awaiting')} waiting for approval · ${cnt('deferred')} deferred</span></a>
      <a class="tile" href="#/prep">${ICON.box}<b>Trip-prep</b><span>Equipment, tools & BOM check</span><span class="k">${cnt('prep') + cnt('bom')}</span></a>
      <a class="tile" href="#/jobs">${ICON.job}<b>Site call-out</b><span>Ready to go / in progress</span><span class="k">${cnt('callout')}</span></a>
      <a class="tile" href="#/visits">${ICON.eye}<b>Site visit</b><span>Ready / in progress</span><span class="k">${cnt('visit')}</span></a>
      <a class="tile" href="#/customers">${ICON.cust}<b>Customers</b><span>${R.customers.length} · technicians ${R.techs.length} · vehicles ${R.vehicles.length}</span></a>
    </div>
    ${open.length ? `<div class="card"><h2>Requests in progress<span class="r">${open.length}</span></h2>${open.map(p => reqRow(p, D)).join('')}</div>` : ''}
    ${await techBoardHTML(3)}
    ${done.length ? `<div class="card list"><h2>Recently completed</h2>${done.map(jobRow).join('')}</div>` : ''}
    <p class="hint" style="text-align:center">Green Job Cards v${APP_VERSION} · tablet ${esc(SET.tabletId)} · all data stays on this tablet</p>`;
  bindRows();
});
function jobRow(j) {
  const c = j.customer || {};
  const st = j.status === 'completed' ? '<span class="chip done">Completed</span>' : '<span class="chip draft">Draft</span>';
  const res = j.kind !== 'visit' && j.outcome ? `<span class="chip ${j.outcome === 'Resolved' ? '' : j.outcome === 'Partly resolved' ? 'amber' : 'red'}">${esc(j.outcome)}</span>` : j.kind === 'visit' ? '<span class="chip">Site visit</span>' : '';
  return `<div class="it" data-go="#/${j.kind === 'visit' ? 'visit' : 'job'}/${j.id}"><span class="av">${j.kind === 'visit' ? ICON.eye : ICON.job}</span><div class="tx"><b>${esc(j.no)} · ${esc(c.name ? KINDS.customers.title(c) : 'No customer yet')}</b><div>${esc(fmtD(j.date))} · ${esc(j.jobType || (j.kind === 'visit' ? 'Site visit' : ''))} · ${esc((j.tech && j.tech.name) || 'no technician')}${c.town ? ' · ' + esc(c.town) : ''}</div></div>${res} ${st}</div>`;
}
const bindRows = () => $$('[data-go]').forEach(el => el.onclick = () => go(el.dataset.go));

/* ------------------------------------------------------------------ pre-trip (with approval) */
route('/pretrip', async () => {
  const D = await loadAll(); const f = qp('f') || 'all';
  setTop('Pre-trips', `${D.trips.length} on this tablet`);
  app.innerHTML = `<div class="acts" style="margin-bottom:16px"><button class="btn pri lg" onclick="go('#/pretrip/new')">${ICON.plus} New pre-trip</button></div>
    ${segHTML('flt', [['all', `All (${D.trips.length})`], ...AP_ORDER.map(k => [k, `${APPROVAL[k].i} ${APPROVAL[k].l} (${D.trips.filter(p => p.approval === k).length})`])], f)}
    <div class="card" style="margin-top:14px" id="lst"></div>`;
  const draw = v => { const xs = D.trips.filter(p => v === 'all' || p.approval === v); $('#lst').innerHTML = xs.map(p => reqRow(p, D)).join('') || '<div class="list"><div class="empty">No pre-trips.</div></div>'; };
  bindSeg('#flt', draw); draw(f);
});
route('/pretrip/:id', async id => {
  await loadSettings(); const R = await refs();
  if (id === 'new') {
    SET.tripSeq = (+SET.tripSeq || 0) + 1; await saveSettings();
    const one = R.techs.length === 1 ? R.techs[0] : null;
    const p = { id: uid(), no: `PT-${SET.tabletId}-${String(SET.tripSeq).padStart(4, '0')}`, createdAt: Date.now(), updatedAt: Date.now(), kind: 'callout', approval: 'pending', date: today(),
      dept: one ? deptOf(one) : '', techIds: one ? [one.id] : [], vehicleId: R.vehicles.length === 1 ? R.vehicles[0].id : '',
      startMode: 'ho', startTown: SET.hoTown, startAddress: '', destMode: 'customer', customerId: qp('c') || '', destTown: '', destAddress: '', round: true, kmOverride: '', onsiteHours: 2, nights: '', extras: [], purpose: '', notes: '',
      apBy: '', apDate: '', apNote: '', resched: '' };
    await DB.put('trips', p); history.replaceState(null, '', `#/pretrip/${p.id}`); render(); return;
  }
  const p = await DB.get('trips', id); if (!p) return go('#/pretrip');
  p.kind = p.kind || 'callout'; p.approval = p.approval || 'pending';
  const job = (await DB.all('jobs')).find(j => j.pretripId === p.id);
  setTop(`Pre-trip ${p.no}`, `${KIND_L[p.kind]} · distance, cost & approval`, '#/pretrip');
  const save = (deb) => { p.updatedAt = Date.now(); clearTimeout(save.t); if (deb) save.t = setTimeout(() => DB.put('trips', p), 300); else return DB.put('trips', p); };
  const deptTechs = R.techs.filter(t => deptOf(t) === p.dept).sort((a, b) => a.name.localeCompare(b.name));
  const A = APPROVAL[p.approval];
  app.innerHTML = `
    <div class="card"><h2><span class="n">1</span> Request</h2><div class="in grid3">
      <div class="spanall">${subTitle('Type of request')}${job ? `<div class="snap"><b>${KIND_L[p.kind]}</b> — fixed, ${esc(job.no)} has been started</div>` : segHTML('p_kind', [['callout', 'Site call-out (with trip-prep & BOM check)'], ['visit', 'Site visit (assessment / survey)']], p.kind)}</div>
      <label class="f">Date<input type="date" id="p_date" value="${esc(p.date)}"></label>
      <label class="f span2">Purpose / job<input id="p_purpose" value="${esc(p.purpose)}" placeholder="e.g. Install 3 access points at FNB Oshakati"></label>
      <div class="spanall">${subTitle('1. Department')}${segHTML('p_dept', DEPTS, p.dept)}</div>
      <div class="spanall">${subTitle(`2. Technician(s) on this trip${p.dept ? ' — ' + esc(p.dept) : ''}`)}${!p.dept ? '<div class="snap">Select the department first.</div>' : `<div class="seg" id="p_techs">${deptTechs.map(t => `<button type="button" data-v="${t.id}" class="${(p.techIds || []).includes(t.id) ? 'on' : ''}">${esc(t.name)}</button>`).join('') || `<span class="hint">No technicians in ${esc(p.dept)} yet — <a href="#/tech/new?ret=pretrip/${p.id}">add one</a></span>`}</div>`}</div>
      <label class="f span2">Company vehicle<select id="p_veh">${vehOpts(R.vehicles, p.vehicleId)}</select></label>
      <div style="display:flex;align-items:flex-end"><a class="btn ghost sm" href="#/vehicle/new?ret=pretrip/${p.id}">${ICON.plus} New vehicle</a></div>
    </div></div>
    <div class="card"><h2><span class="n">2</span> From</h2><div class="in">
      ${segHTML('p_sm', [['ho', 'Head office'], ['other', 'Other location']], p.startMode)}
      <div style="margin-top:14px">${p.startMode === 'other' ? `<div class="grid2"><label class="f">Current town<select id="p_st">${townOpts(p.startTown)}</select></label><label class="f">Address / place (optional)<input id="p_sa" value="${esc(p.startAddress)}" placeholder="e.g. FNB Oshakati branch"></label></div>`
        : `<div class="snap">${ICON.cust.replace('<svg', '<svg width="20" height="20" style="vertical-align:-4px"')} <b>${esc(SET.hoName)}</b><br>${esc(SET.hoAddress)} · ${esc(SET.hoTown)} <span class="hint">(change in Settings)</span></div>`}</div>
    </div></div>
    <div class="card"><h2><span class="n">3</span> To</h2><div class="in">
      ${segHTML('p_dm', [['customer', 'Customer from database'], ['manual', 'Enter address / town']], p.destMode)}
      <div style="margin-top:14px">${p.destMode === 'customer'
        ? `<div class="grid2"><label class="f">Customer<select id="p_cust">${custOpts(R.customers, p.customerId)}</select></label><div style="display:flex;align-items:flex-end"><a class="btn ghost sm" href="#/customer/new?ret=pretrip/${p.id}">${ICON.plus} New customer</a></div></div>`
        : `<div class="grid2"><label class="f">Town<select id="p_dt">${townOpts(p.destTown)}</select></label><label class="f">Address / site<input id="p_da" value="${esc(p.destAddress)}" placeholder="e.g. Bank Windhoek, Main Street"></label></div>`}
      <div class="check" style="margin-top:14px">Return trip (back to the start)<input type="checkbox" id="p_round" ${p.round ? 'checked' : ''}></div></div>
    </div></div>
    <div class="card"><h2><span class="n">4</span> Distance</h2><div class="in"><div id="p_dist"></div>
      <div class="grid3" style="margin-top:14px"><label class="f">Override distance, one way (km)<input id="p_km" inputmode="decimal" value="${esc(p.kmOverride)}" placeholder="auto"></label>
      <label class="f">Hours on site (estimate)<input id="p_on" inputmode="decimal" value="${esc(p.onsiteHours)}"></label>
      <label class="f">Nights away<input id="p_ni" inputmode="numeric" value="${esc(p.nights)}" placeholder="auto"></label></div></div></div>
    <div class="card"><h2><span class="n">5</span> Cost summary <span class="r" id="p_tot"></span></h2><div class="in"><div id="p_sum"></div>
      <div style="margin-top:16px">${subTitle('Additional costs (tolls, parking, couriers, parts…)')}<div id="p_ex"></div><button class="btn ghost sm" id="p_addx">${ICON.plus} Add cost line</button></div>
      <label class="f" style="margin-top:16px">Notes<textarea id="p_notes" placeholder="Anything the approver should know">${esc(p.notes)}</textarea></label></div></div>
    <div class="card"><h2>${ICON.doc.replace('<svg', '<svg width="24" height="24"')} Send the cost summary for approval</h2><div class="in">${expHTML()}${SET.approverEmail ? `<p class="hint" style="margin:10px 0 0">Email goes to the approver: ${esc(SET.approverEmail)} (Settings → Email & approvals).</p>` : `<p class="hint" style="margin:10px 0 0">Tip: set the approver's email in <a href="#/settings">Settings → Email & approvals</a> so it is filled in automatically.</p>`}</div></div>
    <div class="card" id="s-appr"><h2><span class="n ${p.approval === 'approved' ? 'done' : ''}">6</span> Approval<span class="r">${apChip(p.approval)}</span></h2><div class="in">
      <div class="apdd ap ${p.approval}" id="apdd"><button type="button" class="apbtn" id="apbtn"><span class="ic">${A.i}</span><span style="text-align:left">${A.l}<br><small style="font-weight:600;opacity:.8">${A.d}</small></span><span class="cv">▼</span></button></div>
      <div class="grid3" style="margin-top:16px"><label class="f">Decision by<input id="p_apby" value="${esc(p.apBy)}" placeholder="Manager's name"></label><label class="f">Decision date<input type="date" id="p_apdate" value="${esc(p.apDate)}"></label>
        ${p.approval === 'deferred' ? `<label class="f">Reschedule to<input type="date" id="p_resch" value="${esc(p.resched)}"></label>` : ''}
        <label class="f ${p.approval === 'deferred' ? 'spanall' : ''}">${p.approval === 'cancelled' ? 'Reason for cancelling' : p.approval === 'deferred' ? 'Reason / note' : 'Note'}<input id="p_apnote" value="${esc(p.apNote)}"></label></div>
    </div></div>
    <div class="acts">${p.approval !== 'approved' ? `<button class="btn lg" disabled>${ICON.box} ${p.kind === 'visit' ? 'Site visit' : 'Trip-prep'} unlocks once the pre-trip is approved</button>`
      : p.kind === 'visit' ? `<a class="btn dark lg" href="${job ? '#/visit/' + job.id : '#/start/' + p.id}">${ICON.eye} ${job ? 'Open site visit' : 'Go to Site visit'} ${ICON.arrow}</a>`
      : `<a class="btn dark lg" href="#/prep/${p.id}">${ICON.box} Continue to Trip-prep ${ICON.arrow}</a>`}
      <button class="btn ghost" id="p_del">${ICON.trash} Delete</button></div>`;
  const drawEx = () => { $('#p_ex').innerHTML = (p.extras || []).map((e, i) => `<div class="grid3" style="margin-bottom:10px;grid-template-columns:2fr 1fr auto"><label class="f">Description<input data-xd="${i}" value="${esc(e.desc)}"></label><label class="f">Amount (N$)<input data-xa="${i}" inputmode="decimal" value="${esc(e.amt)}"></label><div style="display:flex;align-items:flex-end"><button class="btn ghost sm" data-xr="${i}">${ICON.trash}</button></div></div>`).join('');
    $$('[data-xd]').forEach(el => el.oninput = () => { p.extras[+el.dataset.xd].desc = el.value; save(1); upd(); }); $$('[data-xa]').forEach(el => el.oninput = () => { p.extras[+el.dataset.xa].amt = el.value; save(1); upd(); });
    $$('[data-xr]').forEach(el => el.onclick = () => { p.extras.splice(+el.dataset.xr, 1); save(); drawEx(); upd(); }); };
  const upd = () => {
    const c = tripCalc(p, R), D = c.D;
    $('#p_dist').innerHTML = `<div class="kpis"><div class="kpi"><span>One way</span><b>${D.km != null ? kmF(D.km) : '—'}</b></div><div class="kpi"><span>${p.round ? 'Return trip' : 'Total'}</span><b>${c.total ? kmF(c.total) : '—'}</b></div><div class="kpi"><span>Driving time</span><b>${c.total ? hrs(c.travelH) : '—'}</b></div><div class="kpi"><span>Fuel</span><b>${c.litres} L</b></div></div>
      <div class="route"><b>${esc(D.s.label)}</b> → <b>${esc(D.d.label)}</b>${p.round ? ' → back' : ''}<br>Method: ${esc(D.method)}${D.path && D.path.length > 2 ? `<br>Via ${esc(D.path.join(' › '))}` : ''}${c.sugN && num(p.nights) == null ? `<br><b>Overnight suggested:</b> ${c.sugN} night(s)` : ''}</div>`;
    $('#p_sum').innerHTML = `${!+SET.labourRate && !+SET.accom && !+SET.snt && !+SET.calloutFee ? '<div class="banner warn">Only fuel is costed. Set your labour rate, call-out fee, accommodation and S&T in <a href="#/settings?s=rates">Settings → Rates</a> to include them.</div>' : ''}
      <table class="sum">${c.lines.map(l => `<tr><td>${esc(l[0])}<span class="h">${esc(l[1])}</span></td><td>${nad(l[2])}</td></tr>`).join('')}<tr class="tot"><td>Estimated trip cost</td><td>${nad(c.totalCost)}</td></tr></table>`;
    $('#p_tot').textContent = nad(c.totalCost);
  };
  drawEx(); upd();
  const inp = (sel, k) => { const el = $(sel); if (el) el.oninput = el.onchange = () => { p[k] = el.type === 'checkbox' ? el.checked : el.value; save(1); upd(); }; };
  inp('#p_date', 'date'); inp('#p_purpose', 'purpose'); inp('#p_km', 'kmOverride'); inp('#p_on', 'onsiteHours'); inp('#p_ni', 'nights'); inp('#p_notes', 'notes'); inp('#p_round', 'round');
  inp('#p_st', 'startTown'); inp('#p_sa', 'startAddress'); inp('#p_dt', 'destTown'); inp('#p_da', 'destAddress'); inp('#p_veh', 'vehicleId'); inp('#p_cust', 'customerId');
  inp('#p_apby', 'apBy'); inp('#p_apdate', 'apDate'); inp('#p_apnote', 'apNote'); inp('#p_resch', 'resched');
  bindSeg('#p_kind', async v => { p.kind = v; await save(); render(true); });
  bindSeg('#p_dept', async v => { p.dept = v; p.techIds = (p.techIds || []).filter(t => R.T[t] && deptOf(R.T[t]) === v); await save(); render(true); });
  $$('#p_techs button').forEach(b => b.onclick = () => { const s = new Set(p.techIds || []); s.has(b.dataset.v) ? s.delete(b.dataset.v) : s.add(b.dataset.v); p.techIds = [...s]; b.classList.toggle('on'); save(1); upd(); });
  bindSeg('#p_sm', async v => { p.startMode = v; await save(); render(true); });
  bindSeg('#p_dm', async v => { p.destMode = v; await save(); render(true); });
  $('#p_addx').onclick = () => { p.extras = p.extras || []; p.extras.push({ desc: '', amt: '' }); save(); drawEx(); };
  // approval drop-down: ? no feedback · ✓ approved · ↻ deferred · ✕ cancelled
  $('#apbtn').onclick = e => {
    e.stopPropagation(); const dd = $('#apdd'), old = $('.apmenu', dd); if (old) return old.remove();
    dd.insertAdjacentHTML('beforeend', `<div class="apmenu">${AP_ORDER.map(k => `<button type="button" class="apopt ap ${k} ${k === p.approval ? 'on' : ''}" data-ap="${k}"><span class="ic">${APPROVAL[k].i}</span>${APPROVAL[k].l}<small style="font-weight:600;opacity:.75">${APPROVAL[k].d}</small></button>`).join('')}</div>`);
    $$('[data-ap]', dd).forEach(b => b.onclick = async ev => { ev.stopPropagation(); const k = b.dataset.ap; if (k === p.approval) return $('.apmenu', dd).remove();
      if (job && k !== 'approved' && !(await confirmBox('Change approval?', `<p>${esc(job.no)} has already been started for this request. Changing the approval locks further work on it.</p>`, 'Change', 'red'))) return;
      p.approval = k; if (k !== 'pending' && !p.apDate) p.apDate = today(); await save(); toast(`Pre-trip ${APPROVAL[k].l.toLowerCase()}`); render(true); });
    setTimeout(() => document.addEventListener('click', function cl() { const m = $('.apmenu'); m && m.remove(); document.removeEventListener('click', cl); }), 0);
  };
  bindExport(async () => { await save(); return buildTripPDF(p, R, tripCalc(p, R)); }, { email: () => SET.approverEmail || '', text: () => `Pre-trip ${p.no} (${KIND_L[p.kind]}) — ${destInfo(p, R).label}. Estimated cost ${nad(tripCalc(p, R).totalCost)}. Please approve, defer or cancel.` });
  $('#p_del').onclick = async () => { if (await confirmBox('Delete pre-trip?', `<p>${esc(p.no)} and its trip-prep are removed from this tablet.${job ? ` Job card ${esc(job.no)} is kept.` : ''}</p>`, 'Delete', 'red')) { await DB.del('trips', p.id); go('#/pretrip'); } };
});

/* ------------------------------------------------------------------ trip-prep: equipment & tools sheets */
route('/prep', async () => {
  const D = await loadAll(); const C = D.trips.filter(p => p.kind === 'callout');
  setTop('Trip-prep', 'Equipment & tools for approved call-outs');
  const by = ks => C.filter(p => ks.includes(stageOf(p, D.JT[p.id]).k));
  const grp = (t, xs, locked) => xs.length ? `<div class="card"><h2>${t}<span class="r">${xs.length}</span></h2>${xs.map(p => reqRow(p, D, { locked })).join('')}</div>` : '';
  app.innerHTML = `<p class="sub">Only <b>approved</b> site call-outs can be prepared. Add every item to be installed and every tool, then do the BOM check before leaving for site.</p>
    ${grp('To prepare', by(['prep']))}${grp('BOM check outstanding', by(['bom']))}${grp('Ready — BOM check done', by(['callout']))}
    ${grp('Waiting for approval (locked)', by(['awaiting', 'deferred']), true)}
    ${!C.length ? `<div class="lock">${ICON.box}<div><b>No site call-outs yet</b><p style="margin:6px 0 14px;color:var(--muted)">Create a pre-trip for a site call-out and get it approved first.</p><a class="btn pri" href="#/pretrip/new">${ICON.plus} New pre-trip</a></div></div>` : ''}`;
});
function sheetHTML(t, rows, ro) {
  const eq = t === 'equip';
  if (ro) { const f = filled(rows); return f.length ? `<div class="sheetwrap"><table class="sheet ro"><tr><th>#</th>${eq || f.some(r => r.ph) ? '<th>Photo</th>' : ''}<th>${eq ? 'Item / equipment' : 'Tool'}</th><th>Serial no.</th><th>Qty</th></tr>${f.map((r, i) => `<tr><td class="n">${i + 1}</td>${eq || f.some(x => x.ph) ? `<td style="width:90px">${r.ph ? `<img class="thumb" src="${r.ph}" alt="">` : '—'}</td>` : ''}<td><b>${esc(r.name)}</b></td><td>${esc(r.serial || '—')}</td><td><b>${esc(r.qty || '1')}</b></td></tr>`).join('')}</table></div>` : '<div class="snap">None.</div>'; }
  return `<div class="sheetwrap"><table class="sheet" id="sh_${t}"><tr><th>#</th><th>${eq ? 'Item / equipment *' : 'Tool *'}</th><th>Serial no.${eq ? '' : ' / asset'}</th><th>Qty</th><th>Photo${eq ? ' *' : ''}</th><th></th></tr>
    ${rows.map((r, i) => `<tr class="${eq && r.name.trim() && !r.ph ? 'need' : ''}" data-row="${i}"><td class="n">${i + 1}</td><td><input data-t="${t}" data-i="${i}" data-k="name" value="${esc(r.name)}" placeholder="${eq ? 'e.g. Ubiquiti U6-Pro access point' : 'e.g. Crimping tool'}"></td><td><input data-t="${t}" data-i="${i}" data-k="serial" value="${esc(r.serial)}"></td><td class="q"><input data-t="${t}" data-i="${i}" data-k="qty" inputmode="decimal" value="${esc(r.qty)}" placeholder="1"></td>
      <td style="width:140px"><div class="pwrap"><label class="pcell ${r.ph ? 'has' : ''}">${r.ph ? `<img src="${r.ph}" alt="">` : `${ICON.camera}<span>${eq ? 'Photo *' : 'Photo'}</span>`}<input type="file" accept="image/*" capture="environment" data-pt="${t}" data-pi="${i}"></label><label class="gl" title="Gallery">${ICON.image}<input type="file" accept="image/*" data-pt="${t}" data-pi="${i}"></label></div></td>
      <td class="x"><button class="btn ghost sm" data-rx="${t}:${i}" aria-label="Remove row">${ICON.trash}</button></td></tr>`).join('')}</table></div>`;
}
route('/prep/:id', async id => {
  const R = await refs(); const p = await DB.get('trips', id); if (!p) return go('#/prep');
  p.kind = p.kind || 'callout'; const dest = destInfo(p, R).label;
  setTop(`Trip-prep ${p.no}`, dest, '#/prep');
  if (p.kind === 'visit') return lockPage('Site visits have no trip-prep', 'This request is a site visit — go straight to the Site visit tab once it is approved.', [{ l: 'Open pre-trip', h: `#/pretrip/${p.id}` }]);
  if (p.approval !== 'approved') return lockPage(`Pre-trip ${APPROVAL[p.approval || 'pending'].l.toLowerCase()}`, `Trip-prep is only possible once pre-trip ${esc(p.no)} is <b>approved</b>. Current status: ${APPROVAL[p.approval || 'pending'].l}.`, [{ l: 'Open pre-trip & approval', h: `#/pretrip/${p.id}` }]);
  p.prep = p.prep || { equip: [], tools: [], bom: {} };
  const pr = p.prep, ro = !!pr.finishedAt;
  if (!ro) { ensureRows(pr.equip); ensureRows(pr.tools); }
  const save = (deb) => { p.updatedAt = Date.now(); clearTimeout(save.t); if (deb) save.t = setTimeout(() => DB.put('trips', p), 300); else return DB.put('trips', p); };
  const techs = (p.techIds || []).map(t => R.T[t]).filter(Boolean).map(t => t.name).join(', ');
  const head = `<div class="snap" style="margin-bottom:16px"><b>${esc(p.no)} · ${esc(dest)}</b><br>${esc(fmtD(p.date))}${p.purpose ? ' · ' + esc(p.purpose) : ''}${techs ? ' · ' + esc(techs) : ''} ${apChip(p.approval)}</div>`;
  if (ro) {
    app.innerHTML = `${head}${pr.bomAt ? `<div class="banner"><b>BOM check completed</b> ${esc(fmtDT(pr.bomAt))} — ready for the call-out.</div>` : `<div class="banner warn"><b>BOM check outstanding.</b> The Site call-out stays locked until every item has been checked.</div>`}
      <div class="card"><h2>${ICON.box.replace('<svg', '<svg width="24" height="24"')} Equipment to install<span class="r">${filled(pr.equip).length} item(s)</span></h2><div class="in">${sheetHTML('equip', pr.equip, 1)}</div></div>
      <div class="card"><h2>${ICON.tool.replace('<svg', '<svg width="24" height="24"')} Tools<span class="r">${filled(pr.tools).length} item(s)</span></h2><div class="in">${sheetHTML('tools', pr.tools, 1)}</div></div>
      <div class="acts">${pr.bomAt ? `<a class="btn dark lg" href="#/start/${p.id}">${ICON.job} Go to Site call-out ${ICON.arrow}</a>` : `<a class="btn pri lg" href="#/bom/${p.id}">${ICON.list} Do the BOM check now</a>`}
        <button class="btn ghost" id="xl">${ICON.sheet} Export list (Excel)</button><button class="btn ghost" id="reopen">Re-open trip-prep</button></div>`;
    $('#xl').onclick = () => exportPrepXLSX(p);
    $('#reopen').onclick = async () => { if (!(await confirmBox('Re-open trip-prep?', '<p>You can change the items again. <b>The BOM check has to be done again</b> afterwards, and the Site call-out is locked until then.</p>', 'Re-open', 'red'))) return; pr.finishedAt = null; pr.bomAt = null; pr.bom = {}; await save(); render(); };
    return;
  }
  app.innerHTML = `${head}
    <div class="card"><h2>${ICON.box.replace('<svg', '<svg width="24" height="24"')} Equipment to install<span class="r" id="eqc"></span></h2><div class="in">
      <div class="sheetbar"><button class="btn sm" id="tpl">${ICON.download} Download template</button><label class="btn sm dark">${ICON.upload} Import BOQ (Excel / CSV)<input type="file" id="boq" accept=".xlsx,.xlsm,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" hidden></label><span class="hint">Name, serial number, quantity and a <b>photo of every item</b> (required). Items with individual serial numbers: one row per unit.</span></div>
      <div id="w_equip"></div><div class="acts" style="margin-top:10px"><button class="btn ghost sm" data-add="equip:1">${ICON.plus} Add row</button><button class="btn ghost sm" data-add="equip:5">${ICON.plus} Add 5 rows</button></div></div></div>
    <div class="card"><h2>${ICON.tool.replace('<svg', '<svg width="24" height="24"')} Tools<span class="r" id="tlc"></span></h2><div class="in">
      <div id="w_tools"></div><div class="acts" style="margin-top:10px"><button class="btn ghost sm" data-add="tools:1">${ICON.plus} Add row</button><button class="btn ghost sm" data-add="tools:5">${ICON.plus} Add 5 rows</button></div></div></div>
    <div class="bar"><div class="prog" id="prog"></div><button class="btn pri" id="fin">${ICON.check} Finish Trip-prep</button></div>`;
  const draw = t => {
    $('#w_' + t).innerHTML = sheetHTML(t, pr[t]);
    $$(`#w_${t} input[data-k]`).forEach(el => el.oninput = () => { pr[t][+el.dataset.i][el.dataset.k] = el.value; if (t === 'equip') el.closest('tr').classList.toggle('need', !!pr.equip[+el.dataset.i].name.trim() && !pr.equip[+el.dataset.i].ph); save(1); prog(); });
    $$(`#w_${t} input[data-pt]`).forEach(el => el.onchange = async e => { const f = e.target.files[0]; if (!f) return; pr[t][+el.dataset.pi].ph = await compressImage(f, 1000, 0.72); await save(); draw(t); prog(); });
    $$(`#w_${t} [data-rx]`).forEach(b => b.onclick = async () => { const i = +b.dataset.rx.split(':')[1], r = pr[t][i]; if ((r.name || r.ph) && !(await confirmBox('Remove row?', `<p>${esc(r.name || 'This row')} is removed.</p>`, 'Remove', 'red'))) return; pr[t].splice(i, 1); if (!pr[t].length) pr[t].push(blankRow()); await save(); draw(t); prog(); });
  };
  const prog = () => { const e = filled(pr.equip), tl = filled(pr.tools), np = e.filter(r => !r.ph).length;
    $('#eqc').textContent = `${e.length} item(s)`; $('#tlc').textContent = `${tl.length} tool(s)`;
    $('#prog').innerHTML = `<b>${e.length}</b> equipment item(s) · <b>${tl.length}</b> tool(s)${np ? ` · <span style="color:var(--red)"><b>${np}</b> photo(s) missing</span>` : e.length ? ' · all photos taken' : ''}`; };
  draw('equip'); draw('tools'); prog();
  $$('[data-add]').forEach(b => b.onclick = async () => { const [t, n] = b.dataset.add.split(':'); for (let i = 0; i < +n; i++) pr[t].push(blankRow()); await save(); draw(t); const ins = $$(`#w_${t} input[data-k=name]`); ins[ins.length - +n] && ins[ins.length - +n].focus(); });
  $('#tpl').onclick = () => downloadTemplate();
  $('#boq').onchange = async e => { const f = e.target.files[0]; if (!f) return; const ok = await importBOQ(f, pr); if (ok) { await save(); draw('equip'); draw('tools'); prog(); } e.target.value = ''; };
  $('#fin').onclick = async () => {
    const e = filled(pr.equip), tl = filled(pr.tools);
    if (!e.length && !tl.length) return toast('Add at least one equipment item or tool first', 4000);
    const np = e.filter(r => !r.ph);
    if (np.length) return modal('Photos missing', `<p>Every equipment item needs a photo. Missing for:</p><ul class="miss">${np.map(r => `<li>${esc(r.name)}</li>`).join('')}</ul>`, [{ label: 'OK', value: 1, cls: 'pri' }]);
    [...e, ...tl].forEach(r => { if (!num(r.qty)) r.qty = '1'; });
    const pick = await modal('Always do a BOM check', `<div style="display:flex;gap:14px;align-items:flex-start"><span style="flex:none;width:52px;height:52px;border-radius:50%;background:var(--amber-l);color:var(--amber);display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:800">!</span>
      <div><p style="margin-top:0">Always perform a <b>BOM (Bill of Materials) check</b> before heading to site: tick off each of the <b>${e.length} equipment item(s)</b> and <b>${tl.length} tool(s)</b> against what is loaded in the vehicle.</p><p class="hint">If you choose <b>Later</b>, the Site call-out stays locked until the BOM check is done.</p></div></div>`,
      [{ label: 'Cancel', value: null, cls: 'ghost' }, { label: 'Later', value: 'later' }, { label: 'Do BOM check now', value: 'now', cls: 'pri', icon: 'list' }]);
    if (!pick) return;
    pr.equip = filled(pr.equip); pr.tools = filled(pr.tools); pr.finishedAt = Date.now(); pr.bom = {}; pr.bomAt = null; await save();
    if (pick === 'now') go(`#/bom/${p.id}`); else { toast('Trip-prep finished — BOM check outstanding', 4000); go('#/prep'); }
  };
});
/* Excel template & BOQ import (SheetJS, loaded on demand) */
async function xlsxLib() { await loadScript('lib/xlsx.mini.min.js'); return window.XLSX; }
async function downloadTemplate() {
  const X = await xlsxLib(); const wb = X.utils.book_new();
  const e = X.utils.aoa_to_sheet([['Item / equipment', 'Serial number', 'Quantity', 'Notes']]); e['!cols'] = [{ wch: 44 }, { wch: 22 }, { wch: 10 }, { wch: 30 }];
  const t = X.utils.aoa_to_sheet([['Tool', 'Serial / asset number', 'Quantity']]); t['!cols'] = [{ wch: 40 }, { wch: 22 }, { wch: 10 }];
  const h = X.utils.aoa_to_sheet([['Green Job Cards — Trip-prep / BOQ template'], [''], ['Sheet "Equipment": one row per item to install. Item and Quantity are needed; serial numbers can also be added in the app.'], ['Sheet "Tools": the tools to take along.'], ['Existing BOQs also import: the app looks for columns named Item/Description, Serial, Qty/Quantity.'], ['Photos are taken in the app — every equipment item needs one.']]); h['!cols'] = [{ wch: 110 }];
  X.utils.book_append_sheet(wb, e, 'Equipment'); X.utils.book_append_sheet(wb, t, 'Tools'); X.utils.book_append_sheet(wb, h, 'Instructions');
  const out = X.write(wb, { bookType: 'xlsx', type: 'array' });
  downloadBlob(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'Green_TripPrep_BOQ_template.xlsx'); toast('Template saved to Downloads');
}
async function exportPrepXLSX(p) {
  const X = await xlsxLib(); const wb = X.utils.book_new(); const pr = p.prep;
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['Item / equipment', 'Serial number', 'Quantity', 'Photo taken'], ...filled(pr.equip).map(r => [r.name, r.serial, num(r.qty) || r.qty, r.ph ? 'yes' : 'no'])]), 'Equipment');
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['Tool', 'Serial / asset number', 'Quantity'], ...filled(pr.tools).map(r => [r.name, r.serial, num(r.qty) || r.qty])]), 'Tools');
  downloadBlob(new Blob([X.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `TripPrep_${p.no}.xlsx`); toast('Saved to Downloads');
}
async function importBOQ(file, pr) {
  let X, wb; try { X = await xlsxLib(); wb = /\.csv$/i.test(file.name) ? X.read(await file.text(), { type: 'string' }) : X.read(await file.arrayBuffer(), { type: 'array' }); } catch (e) { toast('Could not read the file: ' + e.message, 6000); return false; }
  const got = { equip: [], tools: [] };
  for (const sn of wb.SheetNames) {
    if (/instruction|cover|summary/i.test(sn)) continue;
    const rows = X.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '', raw: false });
    let hi = -1, col = {};
    for (let i = 0; i < Math.min(rows.length, 20); i++) {
      const h = rows[i].map(c => String(c).toLowerCase().trim());
      const ni = h.findIndex(c => /^(item|description|item description|equipment|material|product|tool|name|item \/ equipment)/.test(c) || /descr|equipment|material/.test(c));
      if (ni >= 0) { hi = i; col = { name: ni, serial: h.findIndex(c => /serial|s\/n|^sn$/.test(c)), qty: h.findIndex(c => /qty|quant/.test(c)), part: h.findIndex(c => /part|model|code/.test(c) && !/serial/.test(c)) }; if (col.qty < 0) col.qty = h.findIndex(c => /^(no|units?|count)\.?$/.test(c)); break; }
    }
    if (hi < 0) continue;
    const target = /tool/i.test(sn) ? 'tools' : 'equip';
    for (const r of rows.slice(hi + 1)) {
      let name = String(r[col.name] || '').trim(); if (!name || /^(sub)?total|^grand total/i.test(name)) continue;
      const qty = col.qty >= 0 ? String(r[col.qty] || '').trim() : '1';
      if (col.qty >= 0 && !qty && !(col.serial >= 0 && r[col.serial])) continue; // section headings without quantity
      const part = col.part >= 0 && col.part !== col.name ? String(r[col.part] || '').trim() : '';
      if (part && !name.includes(part)) name += ` (${part})`;
      got[target].push({ id: uid(), name, serial: col.serial >= 0 ? String(r[col.serial] || '').trim() : '', qty: String(num(qty) ?? qty ?? '1'), ph: '' });
    }
  }
  if (!got.equip.length && !got.tools.length) { toast('No items found — the sheet needs a column called Item or Description (see the template)', 6000); return false; }
  const how = await modal('Import BOQ', `<p>Found <b>${got.equip.length}</b> equipment item(s) and <b>${got.tools.length}</b> tool(s) in ${esc(file.name)}.</p><p class="hint">Photos still have to be taken for every equipment item.</p>`,
    [{ label: 'Cancel', value: null, cls: 'ghost' }, { label: 'Replace the list', value: 'replace', cls: 'red' }, { label: 'Add to the list', value: 'add', cls: 'pri' }]);
  if (!how) return false;
  const n = got.equip.length + got.tools.length;
  for (const t of ['equip', 'tools']) { if (!got[t].length) continue; pr[t] = how === 'replace' ? got[t] : [...filled(pr[t]), ...got[t]]; ensureRows(pr[t]); }
  toast(`Imported ${n} item(s)`); return true;
}

/* ------------------------------------------------------------------ BOM check */
route('/bom/:id', async id => {
  const R = await refs(); const p = await DB.get('trips', id); if (!p) return go('#/prep');
  setTop(`BOM check ${p.no}`, destInfo(p, R).label, `#/prep/${p.id}`);
  const pr = p.prep || {};
  if (p.approval !== 'approved') return lockPage('Pre-trip not approved', 'The BOM check is only possible for approved call-outs.', [{ l: 'Open pre-trip', h: `#/pretrip/${p.id}` }]);
  if (!pr.finishedAt) return lockPage('Finish the trip-prep first', 'Add the equipment and tools and tap <b>Finish Trip-prep</b>.', [{ l: 'Open trip-prep', h: `#/prep/${p.id}` }]);
  pr.bom = pr.bom || {};
  const E = filled(pr.equip), Tl = filled(pr.tools), all = [...E, ...Tl];
  const save = () => { p.updatedAt = Date.now(); return DB.put('trips', p); };
  const item = r => `<div class="bi ${pr.bom[r.id] ? 'on' : ''}" data-b="${r.id}"><span class="cb">${ICON.check}</span>${r.ph ? `<img class="thumb" src="${r.ph}" alt="">` : ''}<div class="tx"><b>${esc(r.name)}</b><span>${r.serial ? 'S/N ' + esc(r.serial) : 'no serial number'}</span></div><span class="qt">× ${esc(r.qty || '1')}</span></div>`;
  app.innerHTML = `<div class="banner warn" style="display:flex;gap:12px;align-items:center"><b style="font-size:26px">!</b><span>Check each item <b>physically in the vehicle</b> and tick it off. When everything is ticked you are ready for the call-out.</span></div>
    <div class="card"><div class="in"><div class="between" style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><b style="font-size:20px" id="cnt"></b><a class="btn ghost sm" href="#/prep/${p.id}">Back to trip-prep</a></div><div class="meter" style="height:14px"><i id="met"></i></div></div></div>
    <div class="card bom"><h2>${ICON.box.replace('<svg', '<svg width="24" height="24"')} Equipment<span class="r">${E.length}</span></h2>${E.map(item).join('') || '<div class="in hint">No equipment.</div>'}</div>
    <div class="card bom"><h2>${ICON.tool.replace('<svg', '<svg width="24" height="24"')} Tools<span class="r">${Tl.length}</span></h2>${Tl.map(item).join('') || '<div class="in hint">No tools.</div>'}</div>
    <div class="acts" id="bomDone"></div>`;
  const upd = async (justNow) => {
    const n = all.filter(r => pr.bom[r.id]).length; $('#cnt').textContent = `${n} of ${all.length} checked`; $('#met').style.width = `${Math.round(100 * n / (all.length || 1))}%`;
    const complete = n === all.length && all.length > 0;
    if (complete && !pr.bomAt) { pr.bomAt = Date.now(); await save(); }
    if (!complete && pr.bomAt) { pr.bomAt = null; await save(); }
    $('#bomDone').innerHTML = complete ? `<a class="btn dark lg" href="#/start/${p.id}">${ICON.job} Go to Site call-out ${ICON.arrow}</a>` : '';
    if (complete && justNow) {
      const go2 = await modal('BOM check complete', `<div class="ready"><div class="big1">${ICON.check}</div><h4>You are now ready for your Call-out!</h4><p>All ${E.length} equipment item(s) and ${Tl.length} tool(s) are checked. Drive safely.</p></div>`,
        [{ label: 'Later', value: false, cls: 'ghost' }, { label: 'Go to Site call-out', value: true, cls: 'pri', icon: 'job' }]);
      if (go2) go(`#/start/${p.id}`);
    }
  };
  $$('[data-b]').forEach(el => el.onclick = async () => { const k = el.dataset.b; pr.bom[k] = !pr.bom[k]; el.classList.toggle('on', pr.bom[k]); await save(); upd(true); });
  upd(false);
});

/* ------------------------------------------------------------------ start a call-out / site visit from an approved request */
route('/start/:id', async id => {
  const p = await DB.get('trips', id); if (!p) return go('#/');
  p.kind = p.kind || 'callout';
  const st = stageOf(p, (await DB.all('jobs')).find(j => j.pretripId === p.id));
  if (p.approval !== 'approved') return go(`#/pretrip/${p.id}`);
  if (p.kind === 'callout' && !(p.prep && p.prep.bomAt)) return go(`#/${p.prep && p.prep.finishedAt ? 'bom' : 'prep'}/${p.id}`);
  const existing = (await DB.all('jobs')).find(j => j.pretripId === p.id);
  const j = existing || await newJob({ pretripId: p.id, customerId: p.destMode === 'customer' ? p.customerId : '', dept: p.dept || '', techId: (p.techIds || [])[0] || '', assistIds: (p.techIds || []).slice(1), vehicleId: p.vehicleId,
    startLabel: startInfo(p).label, reason: p.purpose, plannedKm: tripCalc(p, await refs()).one, manualDest: p.destMode === 'manual' ? [p.destAddress, p.destTown].filter(Boolean).join(', ') : '' }, p.kind);
  history.replaceState(null, '', `#/${p.kind === 'visit' ? 'visit' : 'job'}/${j.id}`); render(); void st;
});

/* ------------------------------------------------------------------ job cards (call-out & site visit share one editor) */
async function newJob(pre = {}, kind = 'callout') {
  await loadSettings(); const R = await refs();
  let no; if (kind === 'visit') { SET.visitSeq = (+SET.visitSeq || 0) + 1; no = `${SET.visitPrefix || 'SV'}-${SET.tabletId}-${String(SET.visitSeq).padStart(4, '0')}`; } else { SET.seq = (+SET.seq || 0) + 1; no = `${SET.prefix}-${SET.tabletId}-${String(SET.seq).padStart(4, '0')}`; }
  await saveSettings();
  const j = { id: uid(), kind, no, createdAt: Date.now(), updatedAt: Date.now(), status: 'draft',
    date: today(), jobType: kind === 'visit' ? 'Site visit' : '', ref: '', customerId: '', siteContact: '', sitePhone: '', dept: '', techId: '', assistIds: [], vehicleId: '',
    startLabel: hoLabel(), odoStart: '', odoSite: '', odoStartPh: '', odoSitePh: '', departAt: localInput(new Date()), arriveAt: '', leaveAt: '', gps: null,
    extra: ensureRows([]), reason: '', issues: '', resolved: '', outcome: '', followUp: '', notes: '', findings: '', recommend: '', nextStep: '',
    photos: [], sign: { tech: { name: '', date: today() }, cust: { name: '', designation: '', date: today() } }, rating: null, ...pre };
  snapJob(j, R); await DB.put('jobs', j);
  if (j.pretripId) { const p = await DB.get('trips', j.pretripId); if (p) { p.jobId = j.id; await DB.put('trips', p); } }
  return j;
}
function snapJob(j, R) {
  const c = R.C[j.customerId]; if (c) { j.customer = { ...c }; if (!j.siteContact) j.siteContact = c.contact || ''; if (!j.sitePhone) j.sitePhone = c.phone || ''; } else if (!j.customerId) j.customer = j.manualDest ? { name: j.manualDest } : null;
  const t = R.T[j.techId]; j.tech = t ? { ...t } : null; if (t && !j.sign.tech.name) j.sign.tech.name = t.name; if (t && !j.dept) j.dept = deptOf(t);
  j.assists = (j.assistIds || []).map(id => R.T[id]).filter(Boolean).map(t => ({ id: t.id, name: t.name }));
  const v = R.V[j.vehicleId]; j.vehicle = v ? { ...v } : null; if (v && !j.odoStart && v.odo) j.odoStart = String(v.odo);
  if (!j.sign.cust.name && j.siteContact) j.sign.cust.name = j.siteContact;
}
function jobCheck(j) {
  const m = [], visit = j.kind === 'visit';
  if (!j.customerId && !(j.customer && j.customer.name)) m.push(['job', 'Customer']);
  if (!visit && !j.jobType) m.push(['job', 'Type of call-out']);
  if (!j.techId) m.push(['team', 'Technician']);
  if (!j.vehicleId) m.push(['team', 'Vehicle']);
  if (num(j.odoStart) == null) m.push(['travel', 'Odometer at start']);
  if (num(j.odoSite) == null) m.push(['travel', 'Odometer at site']);
  if (!j.arriveAt) m.push(['travel', 'Arrival time']);
  if (visit) { if (!(j.reason || '').trim()) m.push(['find', 'Purpose of the visit']); if (!(j.findings || '').trim()) m.push(['find', 'Findings']); }
  else { if (!j.reason.trim()) m.push(['work', 'Reason for visit']); if (!j.issues.trim()) m.push(['work', 'Issues encountered']); if (!j.resolved.trim()) m.push(['work', 'Issues resolved / work done']); }
  if (!j.photos.length) m.push(['photos', 'At least one photo']);
  if (!(j.sign.tech.sig || j.sign.tech.photo)) m.push(['sign', 'Technician signature']);
  if (!custSigned(j)) m.push(['sign', 'Customer signature']);
  if (!visit && !j.outcome) m.push(['sign', 'Outcome of the call-out']);
  return m;
}
function listPage(kind) {
  return async () => {
    const D = await loadAll(); const visit = kind === 'visit';
    const reqs = D.trips.filter(p => p.kind === kind);
    const ready = reqs.filter(p => stageOf(p, D.JT[p.id]).k === (visit ? 'visit' : 'callout'));
    const locked = reqs.filter(p => (visit ? ['awaiting', 'deferred'] : ['awaiting', 'deferred', 'prep', 'bom']).includes(stageOf(p, D.JT[p.id]).k));
    const jobs = D.jobs.filter(j => (j.kind || 'callout') === kind);
    setTop(visit ? 'Site visits' : 'Site call-outs', visit ? 'Approved site visits & reports' : 'Approved call-outs with a completed BOM check');
    const f = 'all';
    app.innerHTML = `<p class="sub">${visit ? 'A site visit can start once its pre-trip is <b>approved</b>.' : 'A call-out can start once the pre-trip is <b>approved</b>, the <b>trip-prep</b> is finished and the <b>BOM check</b> is done.'} New requests start with a <a href="#/pretrip/new">pre-trip</a>.</p>
      ${ready.length ? `<div class="card"><h2>${visit ? 'Ready / in progress' : 'Ready to go / in progress'}<span class="r">${ready.length}</span></h2>${ready.map(p => reqRow(p, D)).join('')}</div>` : `<div class="lock">${visit ? ICON.eye : ICON.job}<div><b>Nothing ready yet</b><p style="margin:6px 0 14px;color:var(--muted)">${visit ? 'Approve a site-visit pre-trip first.' : 'Approve a call-out pre-trip, finish its trip-prep and do the BOM check.'}</p><a class="btn pri" href="#/pretrip/new">${ICON.plus} New pre-trip</a></div></div>`}
      ${locked.length ? `<div class="card"><h2>Locked — not ready yet<span class="r">${locked.length}</span></h2>${locked.map(p => reqRow(p, D, { locked: 1 })).join('')}</div>` : ''}
      <div class="card"><h2>${visit ? 'Site visit reports' : 'Job cards'}<span class="r">${jobs.length}</span></h2><div class="in" style="padding-bottom:0"><div class="search"><input id="q" placeholder="Search number, customer, serial, technician…" autocomplete="off"></div>
        ${visit ? '' : segHTML('flt', [['all', 'All'], ['draft', 'Drafts'], ['completed', 'Completed'], ['follow', 'Follow-up needed']], f)}</div><div class="list" style="margin-top:12px" id="lst"></div></div>`;
    let cur = f;
    const draw = () => { const q = $('#q').value.toLowerCase().trim();
      const xs = jobs.filter(j => (cur === 'all' || (cur === 'draft' && j.status !== 'completed') || (cur === 'completed' && j.status === 'completed') || (cur === 'follow' && ['Follow-up required', 'Not resolved', 'Partly resolved'].includes(j.outcome))) && (!q || JSON.stringify({ ...j, photos: 0, sign: 0, odoStartPh: 0, odoSitePh: 0 }).toLowerCase().includes(q)));
      $('#lst').innerHTML = xs.map(jobRow).join('') || '<div class="empty">None yet.</div>'; bindRows(); };
    $('#q').oninput = draw; if (!visit) bindSeg('#flt', v => { cur = v; draw(); }); draw();
  };
}
route('/jobs', listPage('callout')); route('/visits', listPage('visit'));
route('/job/new', () => go('#/pretrip/new')); route('/visit/new', () => go('#/pretrip/new'));
route('/job/:id', id => jobEditor(id, 'callout')); route('/visit/:id', id => jobEditor(id, 'visit'));

async function jobEditor(id, kindRoute) {
  const j = await DB.get('jobs', id); if (!j) return go(kindRoute === 'visit' ? '#/visits' : '#/jobs');
  j.kind = j.kind || 'callout'; if (j.kind !== kindRoute) { history.replaceState(null, '', `#/${j.kind === 'visit' ? 'visit' : 'job'}/${j.id}`); }
  const visit = j.kind === 'visit';
  j.extra = j.extra || ensureRows([]); j.sign.cust.designation = j.sign.cust.designation || '';
  const R = await refs(); snapJob(j, R);
  const trip = j.pretripId ? await DB.get('trips', j.pretripId) : null;
  setTop(`${visit ? 'Site visit' : 'Job card'} ${j.no}`, j.customer ? KINDS.customers.title(j.customer) : KIND_L[j.kind], visit ? '#/visits' : '#/jobs');
  if (trip && trip.approval !== 'approved') return lockPage(`Pre-trip ${APPROVAL[trip.approval || 'pending'].l.toLowerCase()}`, `The approval of pre-trip ${esc(trip.no)} was changed, so this ${visit ? 'site visit' : 'call-out'} is locked.`, [{ l: 'Open pre-trip', h: `#/pretrip/${trip.id}` }]);
  if (!visit && trip && !(trip.prep && trip.prep.bomAt)) return lockPage('BOM check outstanding', `The trip-prep of ${esc(trip.no)} was re-opened or the BOM check is not complete. The call-out unlocks once every item is checked.`, [{ l: trip.prep && trip.prep.finishedAt ? 'Do BOM check' : 'Open trip-prep', h: `#/${trip.prep && trip.prep.finishedAt ? 'bom' : 'prep'}/${trip.id}` }]);
  const past = (await DB.all('jobs')).filter(x => x.id !== j.id && x.customerId && x.customerId === j.customerId);
  const save = (deb) => { j.updatedAt = Date.now(); clearTimeout(save.t); if (deb) save.t = setTimeout(() => { DB.put('jobs', j); updBar(); }, 300); else { updBar(); return DB.put('jobs', j); } };
  const c = j.customer || {};
  const SEC = visit ? [['job', 'Job & customer'], ['team', 'Technician & vehicle'], ['travel', 'Travel'], ['find', 'Findings'], ['photos', 'Photos'], ['sign', 'Sign-off'], ['export', 'Export']]
    : [['job', 'Job & customer'], ['team', 'Technician & vehicle'], ['travel', 'Travel'], ['equip', 'Equipment'], ['work', 'Work done'], ['photos', 'Photos'], ['sign', 'Sign-off'], ['export', 'Export']];
  const NUM = Object.fromEntries(SEC.map(([k], i) => [k, i + 1]));
  const sec = (k, title, body, right = '') => `<section class="card" id="s-${k}"><h2><span class="n" id="n-${k}">${NUM[k]}</span> ${title}${right ? `<span class="r">${right}</span>` : ''}</h2><div class="in">${body}</div></section>`;
  const odoTile = (k, label) => `<div class="odo"><div class="ph ${j[k + 'Ph'] ? 'has' : ''}">${j[k + 'Ph'] ? `<img src="${j[k + 'Ph']}" alt="">` : `${ICON.camera.replace('<svg', '<svg width="30" height="30"')}<span>Odometer photo</span>`}</div>
      <div><label class="f">${label} (km)<input class="big" id="j_${k}" inputmode="decimal" value="${esc(j[k])}"></label><div class="acts" style="margin-top:8px">${pickBtns('data-odo', k, j[k + 'Ph'] ? 'Retake' : 'Photo')}${j[k + 'Ph'] ? `<button class="btn ghost sm" data-odox="${k}">${ICON.trash}</button>` : ''}</div></div></div>`;
  const sigBox = (k, label) => { const s = j.sign[k]; return `<div class="sigbox ${s.sig || s.photo ? 'has' : ''}"><div class="hd"><span>${label}</span><span class="acts"><button class="btn ghost sm" data-undo="${k}">↶ Undo</button><button class="btn ghost sm" data-clr="${k}">Clear</button></span></div>
      <canvas class="sig" data-sig="${k}"></canvas><div class="hint">Sign with a finger or stylus inside the box</div>
      <div class="acts" style="align-items:center">${s.photo ? `<img class="sigph" src="${s.photo}" alt="">` : ''}${pickBtns('data-sp', k, s.photo ? 'Retake signature photo' : 'Photo of signature')}${s.photo ? `<button class="btn ghost sm" data-spx="${k}">Remove</button>` : ''}</div>
      <div class="grid2"><label class="f">Name<input data-sn="${k}" value="${esc(s.name || '')}"></label>${k === 'cust' ? `<label class="f">Designation<input data-sdg="${k}" value="${esc(s.designation || '')}" placeholder="e.g. Branch manager"></label>` : `<label class="f">Date<input type="date" data-sd="${k}" value="${esc(s.date || today())}"></label>`}</div>
      ${k === 'cust' ? `<label class="f">Date<input type="date" data-sd="${k}" value="${esc(s.date || today())}"></label>` : ''}</div>`; };
  const deptTechs = R.techs.filter(t => !j.dept || deptOf(t) === j.dept).sort((a, b) => a.name.localeCompare(b.name));
  const pr = trip && trip.prep ? trip.prep : null;
  const extraSheet = () => `<div class="sheetwrap"><table class="sheet" id="sh_extra"><tr><th>#</th><th>Item now needed</th><th>Part / serial no.</th><th>Qty</th><th>Reason / notes</th><th></th></tr>
      ${j.extra.map((r, i) => `<tr><td class="n">${i + 1}</td><td><input data-xk="name" data-xi="${i}" value="${esc(r.name)}" placeholder="e.g. PoE injector"></td><td><input data-xk="serial" data-xi="${i}" value="${esc(r.serial)}"></td><td class="q"><input data-xk="qty" data-xi="${i}" inputmode="decimal" value="${esc(r.qty)}" placeholder="1"></td><td><input data-xk="note" data-xi="${i}" value="${esc(r.note || '')}"></td><td class="x"><button class="btn ghost sm" data-xx="${i}">${ICON.trash}</button></td></tr>`).join('')}</table></div>`;
  app.innerHTML = `<nav class="jump">${SEC.map(([k, l]) => `<a data-jump="${k}" id="j-${k}">${l}</a>`).join('')}</nav>
    ${trip ? `<div class="snap" style="margin-bottom:14px">From pre-trip <a href="#/pretrip/${trip.id}"><b>${esc(trip.no)}</b></a> ${apChip(trip.approval)}${!visit && pr && pr.bomAt ? ` · BOM check ${esc(fmtDT(pr.bomAt))}` : ''}</div>` : ''}
    ${sec('job', 'Job & customer', `<div class="grid3">
        <label class="f">${visit ? 'Report' : 'Job card'} no.<input value="${esc(j.no)}" disabled></label><label class="f">Date<input type="date" id="j_date" value="${esc(j.date)}"></label><label class="f">Customer ref. / call no.<input id="j_ref" value="${esc(j.ref)}" placeholder="e.g. bank ticket no."></label>
        ${visit ? '' : `<div class="spanall">${subTitle('Type of call-out')}${segHTML('j_type', JOB_TYPES, j.jobType)}</div>`}
        <label class="f span2">Customer<select id="j_cust">${custOpts(R.customers, j.customerId)}</select></label><div style="display:flex;align-items:flex-end;gap:8px"><a class="btn ghost sm" href="#/customer/new?ret=job/${j.id}">${ICON.plus} New customer</a></div>
        ${j.customerId ? `<div class="snap spanall"><b>${esc(KINDS.customers.title(c))}</b><br>${esc([c.address, c.town].filter(Boolean).join(', ') || 'no address')}${c.accountNo ? ' · acc. ' + esc(c.accountNo) : ''}<br>${esc([c.contact, c.phone, c.email].filter(Boolean).join(' · '))}${c.notes ? `<br><i>${esc(c.notes)}</i>` : ''} · <a href="#/customer/${c.id}?ret=job/${j.id}">edit customer</a></div>` : j.manualDest ? `<div class="snap spanall">Destination from the pre-trip: <b>${esc(j.manualDest)}</b> — select or add the customer above.</div>` : ''}
        <label class="f">Contact person on site<input id="j_sc" value="${esc(j.siteContact)}"></label><label class="f">Contact number<input id="j_sp" type="tel" value="${esc(j.sitePhone)}"></label>
      </div>`)}
    ${sec('team', 'Technician & vehicle', `<div class="grid3">
        <div class="spanall">${subTitle('Department')}${segHTML('j_dept', DEPTS, j.dept)}</div>
        <label class="f">Lead technician<select id="j_tech">${techOpts(deptTechs, j.techId, j.dept ? `Select (${j.dept})…` : 'Select technician…')}</select></label>
        <div class="span2">${subTitle('Assisting technician(s)')}<div class="seg" id="j_asst">${deptTechs.filter(t => t.id !== j.techId).map(t => `<button type="button" data-v="${t.id}" class="${(j.assistIds || []).includes(t.id) ? 'on' : ''}">${esc(t.name)}</button>`).join('') || '<span class="hint">—</span>'}</div></div>
        <label class="f">Company vehicle<select id="j_veh">${vehOpts(R.vehicles, j.vehicleId)}</select></label>
        ${j.tech ? `<div class="snap span2"><b>${esc(j.tech.name)}</b> ${esc([j.tech.position, deptOf(j.tech)].filter(Boolean).join(' · '))}<br>${esc([j.tech.empNo && 'Emp. ' + j.tech.empNo, j.tech.phone, j.tech.email].filter(Boolean).join(' · '))}</div>` : `<div class="span2" style="display:flex;align-items:flex-end;gap:8px"><a class="btn ghost sm" href="#/tech/new?ret=job/${j.id}">${ICON.plus} New technician</a><a class="btn ghost sm" href="#/vehicle/new?ret=job/${j.id}">${ICON.plus} New vehicle</a></div>`}
      </div>`)}
    ${sec('travel', 'Travel', `<div class="grid2">
        <label class="f spanall">Travelled from<input id="j_from" value="${esc(j.startLabel)}"></label>
        ${odoTile('odoStart', 'Odometer at start')}${odoTile('odoSite', 'Odometer at site')}
        <div class="kmbox spanall" id="j_km"></div>
        <label class="f">Departed<input type="datetime-local" id="j_dep" value="${esc(j.departAt)}"></label>
        <label class="f">Arrived on site<div class="acts" style="flex-wrap:nowrap"><input type="datetime-local" id="j_arr" value="${esc(j.arriveAt)}" style="flex:1"><button class="btn sm" data-now="arriveAt">Now</button></div></label>
        <label class="f">Left site<div class="acts" style="flex-wrap:nowrap"><input type="datetime-local" id="j_lv" value="${esc(j.leaveAt)}" style="flex:1"><button class="btn sm" data-now="leaveAt">Now</button></div></label>
        <div>${subTitle('Site location (GPS)')}<div class="acts" style="align-items:center"><span class="snap" style="flex:1">${j.gps ? `${j.gps.lat.toFixed(5)}, ${j.gps.lng.toFixed(5)} ±${j.gps.acc} m · <a href="${mapURL(j.gps)}" target="_blank" rel="noopener">map</a>` : 'Not captured'}</span><button class="btn sm" id="j_gps">${ICON.pin} ${j.gps ? 'Update' : 'Capture'}</button></div>
          ${j.gps && j.customerId && R.C[j.customerId] && !R.C[j.customerId].lat ? `<button class="btn ghost sm" id="j_gps2" style="margin-top:8px">Save as the customer's location</button>` : ''}</div>
      </div>`)}
    ${visit ? sec('find', 'Findings', `<div class="grid2">
        <label class="f spanall">Purpose of the visit<textarea id="w_reason" placeholder="Why the site was visited">${esc(j.reason)}</textarea></label>
        <label class="f">Findings<textarea id="w_find" placeholder="What was found on site: condition, measurements, requirements" style="min-height:160px">${esc(j.findings)}</textarea></label>
        <label class="f">Recommendations<textarea id="w_rec" placeholder="Proposed solution, equipment needed" style="min-height:160px">${esc(j.recommend)}</textarea></label>
        <div class="spanall">${subTitle('Next step')}${segHTML('w_next', NEXT_STEPS, j.nextStep)}</div>
        <label class="f spanall">General notes<textarea id="w_notes">${esc(j.notes)}</textarea></label></div>`)
      : sec('equip', 'Equipment', `${subTitle('Equipment taken (from the trip-prep — not editable)')}${pr ? sheetHTML('equip', pr.equip, 1) : '<div class="snap">No trip-prep linked.</div>'}
        ${pr && filled(pr.tools).length ? `<details style="margin-top:12px"><summary style="cursor:pointer;font-weight:700;color:var(--g-dd)">Tools taken (${filled(pr.tools).length})</summary><div style="margin-top:10px">${sheetHTML('tools', pr.tools, 1)}</div></details>` : ''}
        <div style="margin-top:20px">${subTitle('Additional items now needed')}<div id="w_extra"></div><div class="acts" style="margin-top:10px"><button class="btn ghost sm" id="x_add">${ICON.plus} Add row</button></div></div>`)}
    ${visit ? '' : sec('work', 'Work done', `<div class="grid2">
        <label class="f spanall">Reason for visit<textarea id="w_reason" placeholder="What was reported / requested">${esc(j.reason)}</textarea></label>
        <label class="f">Issues encountered<textarea id="w_issues" placeholder="What you found on site">${esc(j.issues)}</textarea></label>
        <label class="f">Issues resolved / work done<textarea id="w_res" placeholder="What was fixed, installed, configured">${esc(j.resolved)}</textarea></label>
        <label class="f spanall">Follow-up needed (if any)<textarea id="w_fu" placeholder="What still has to be done, parts to order, next visit">${esc(j.followUp)}</textarea></label>
        <label class="f spanall">General notes<textarea id="w_notes">${esc(j.notes)}</textarea></label></div>`)}
    ${sec('photos', 'Photos', `<div class="photos" id="ph"></div>`, `${j.photos.length} photo(s)`)}
    ${sec('sign', 'Sign-off', `<div class="sigs">${sigBox('tech', 'Technician')}${sigBox('cust', 'Customer')}</div>
        ${visit ? '' : `<div class="outbox"><h4>Outcome of the call-out</h4>${segHTML('w_out', OUTCOMES, j.outcome, 'st')}<p class="hint" style="margin:8px 0 0">Confirmed with the customer at sign-off.</p></div>`}
        <div class="ratebox" id="ratebox"></div>`)}
    ${sec('export', `Export ${visit ? 'site visit report' : 'job card'}`, `${expHTML()}<p class="hint" style="margin:12px 0 0">The PDF is created on this tablet. <b>Save to device</b> keeps a copy in Downloads; WhatsApp and Bluetooth open the share menu with the PDF attached; Email opens a new Outlook email.</p>`)}
    <div class="bar"><div class="prog" id="prog"></div><button class="btn pri" id="toExp">${ICON.doc} Create PDF</button></div>
    <div class="acts" style="margin-top:18px"><button class="btn ghost" id="j_del">${ICON.trash} Delete ${visit ? 'site visit' : 'job card'}</button></div>`;

  $$('[data-jump]').forEach(a => a.onclick = () => { const el = $('#s-' + a.dataset.jump); window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 130, behavior: 'smooth' }); });
  $('#toExp').onclick = () => $('[data-jump="export"]').click();
  const bindF = (sel, setter) => { const el = $(sel); if (el) el.oninput = el.onchange = () => { setter(el.value); save(1); }; };
  bindF('#j_date', v => j.date = v); bindF('#j_ref', v => j.ref = v); bindF('#j_sc', v => j.siteContact = v); bindF('#j_sp', v => j.sitePhone = v); bindF('#j_from', v => j.startLabel = v);
  bindF('#j_dep', v => j.departAt = v); bindF('#j_arr', v => j.arriveAt = v); bindF('#j_lv', v => j.leaveAt = v);
  bindF('#w_reason', v => j.reason = v); bindF('#w_issues', v => j.issues = v); bindF('#w_res', v => j.resolved = v); bindF('#w_fu', v => j.followUp = v); bindF('#w_notes', v => j.notes = v);
  bindF('#w_find', v => j.findings = v); bindF('#w_rec', v => j.recommend = v);
  bindF('#j_odoStart', v => { j.odoStart = v; showKm(); }); bindF('#j_odoSite', v => { j.odoSite = v; showKm(); });
  bindSeg('#j_type', v => { j.jobType = v; save(); });
  bindSeg('#w_out', v => { j.outcome = v; save(); });
  bindSeg('#w_next', v => { j.nextStep = v; save(); });
  bindSeg('#j_dept', async v => { j.dept = v; if (j.techId && R.T[j.techId] && deptOf(R.T[j.techId]) !== v) { j.techId = ''; if (!j.sign.tech.sig) j.sign.tech.name = ''; } j.assistIds = (j.assistIds || []).filter(x => R.T[x] && deptOf(R.T[x]) === v); snapJob(j, R); await save(); render(true); });
  $('#j_cust').onchange = async () => { j.customerId = $('#j_cust').value; j.siteContact = ''; j.sitePhone = ''; if (!j.sign.cust.sig) j.sign.cust.name = ''; snapJob(j, R); await save(); render(true); };
  $('#j_tech').onchange = async () => { j.techId = $('#j_tech').value; j.assistIds = (j.assistIds || []).filter(x => x !== j.techId); if (!j.sign.tech.sig) j.sign.tech.name = ''; snapJob(j, R); await save(); render(true); };
  $('#j_veh').onchange = async () => { j.vehicleId = $('#j_veh').value; snapJob(j, R); await save(); render(true); };
  $$('#j_asst button').forEach(b => b.onclick = () => { const s = new Set(j.assistIds || []); s.has(b.dataset.v) ? s.delete(b.dataset.v) : s.add(b.dataset.v); j.assistIds = [...s]; b.classList.toggle('on'); snapJob(j, R); save(); });
  $$('[data-now]').forEach(b => b.onclick = e => { e.preventDefault(); j[b.dataset.now] = localInput(new Date()); save(); render(true); });
  function showKm() { const k = siteKm(j), el = $('#j_km'); const a = num(j.odoStart), b = num(j.odoSite);
    el.className = 'kmbox spanall' + (a != null && b != null && k == null ? ' bad' : '');
    el.innerHTML = k != null ? `Distance to site: <b>${kmF(k)}</b> · return trip estimate ${kmF(k * 2)}${j.plannedKm ? ` · pre-trip planned ${kmF(j.plannedKm)} one way` : ''}` : a != null && b != null ? 'Odometer at site is lower than at start — please check' : 'Enter both odometer readings to get the distance travelled to site.'; }
  showKm();
  $$('[data-odo]').forEach(i => i.onchange = async e => { const f = e.target.files[0]; if (!f) return; j[i.dataset.odo + 'Ph'] = await compressImage(f, 1000, 0.72); await save(); render(true); });
  $$('[data-odox]').forEach(b => b.onclick = async () => { j[b.dataset.odox + 'Ph'] = ''; await save(); render(true); });
  $('#j_gps').onclick = async () => { const b = $('#j_gps'); b.disabled = true; b.textContent = 'Locating…'; try { j.gps = await getGPS(); toast(`Location captured (±${j.gps.acc} m)`); await save(); } catch (e) { toast(e.message, 5000); } render(true); };
  if ($('#j_gps2')) $('#j_gps2').onclick = async () => { const cu = R.C[j.customerId]; cu.lat = j.gps.lat; cu.lng = j.gps.lng; await DB.put('customers', cu); toast('Saved to the customer record'); render(true); };
  // additional items needed (call-out)
  const drawExtra = () => { if (!$('#w_extra')) return; $('#w_extra').innerHTML = extraSheet();
    $$('[data-xk]').forEach(el => el.oninput = () => { j.extra[+el.dataset.xi][el.dataset.xk] = el.value; save(1); });
    $$('[data-xx]').forEach(b => b.onclick = () => { j.extra.splice(+b.dataset.xx, 1); if (!j.extra.length) j.extra.push(blankRow()); save(); drawExtra(); }); };
  drawExtra(); if ($('#x_add')) $('#x_add').onclick = () => { j.extra.push(blankRow()); save(); drawExtra(); const l = $$('#w_extra input[data-xk=name]').pop(); l && l.focus(); };
  // photos
  const drawPh = () => { $('#ph').innerHTML = j.photos.map((p, i) => `<div class="photo"><img src="${p.d}" alt=""><input data-cap="${i}" value="${esc(p.cap || '')}" placeholder="Caption (e.g. before / after)"><div class="x"><button class="btn ghost sm" data-phx="${i}">${ICON.trash} Remove</button></div></div>`).join('') +
      `<div class="addph">${ICON.camera}<span>Add photos</span><div class="acts" style="justify-content:center"><label class="btn pri sm">${ICON.camera} Camera<input type="file" accept="image/*" capture="environment" id="ph_cam" hidden></label><label class="btn ghost sm">${ICON.image} Gallery<input type="file" accept="image/*" multiple id="ph_gal" hidden></label></div></div>`;
    $$('[data-cap]').forEach(el => el.oninput = () => { j.photos[+el.dataset.cap].cap = el.value; save(1); });
    $$('[data-phx]').forEach(b => b.onclick = async () => { if (await confirmBox('Remove photo?', '', 'Remove', 'red')) { j.photos.splice(+b.dataset.phx, 1); await save(); drawPh(); $('#s-photos .r').textContent = `${j.photos.length} photo(s)`; } });
    const add = async e => { const fs = [...e.target.files]; if (!fs.length) return; toast(`Adding ${fs.length} photo(s)…`, 1500); for (const f of fs) j.photos.push({ d: await compressImage(f), cap: '' }); await save(); drawPh(); $('#s-photos .r').textContent = `${j.photos.length} photo(s)`; };
    $('#ph_cam').onchange = add; $('#ph_gal').onchange = add; };
  drawPh();
  // client rating of the technician (only once the customer has signed)
  const drawRate = () => {
    const signed = custSigned(j), r = j.rating && CRATE[j.rating.k] ? j.rating : null;
    $('#ratebox').innerHTML = r ? `<span class="face on ${CRATE[r.k].cls}" style="padding:6px;border:0;background:none">${faceSVG(r.k, 'fc')}</span><div style="flex:1;min-width:200px"><b>Client rating: ${CRATE[r.k].l}</b>${r.notes ? `<div class="hint">“${esc(r.notes)}”</div>` : ''}${signed ? '' : '<div class="hint" style="color:var(--red)">Customer signature missing — the rating does not count.</div>'}</div><button class="btn ghost sm" id="rateBtn">Change rating</button>`
      : `${ICON.star.replace('<svg', '<svg class="fc" style="color:' + (signed ? '#d9a514' : '#b8c2bb') + '"')}<div style="flex:1;min-width:200px"><b>Rate the technician</b><div class="hint">${signed ? 'For the customer: how was the service today?' : 'Available once the customer has signed above.'}</div></div><button class="btn pri" id="rateBtn" ${signed ? '' : 'disabled'}>${ICON.star} Rate the technician</button>`;
    $('#rateBtn').onclick = async () => { if (!custSigned(j)) return toast('The customer must sign first'); const res = await rateModal(j); if (res) { j.rating = res; await save(); drawRate(); toast('Thank you for the rating'); } };
  };
  drawRate();
  // signatures
  const pads = {};
  $$('canvas[data-sig]').forEach(cv => { const k = cv.dataset.sig; pads[k] = sigPad(cv, j.sign[k], () => { cv.closest('.sigbox').classList.toggle('has', !!(j.sign[k].sig || j.sign[k].photo)); save(); if (k === 'cust') drawRate(); }); });
  $$('[data-undo]').forEach(b => b.onclick = () => pads[b.dataset.undo].undo() || toast('Nothing to undo'));
  $$('[data-clr]').forEach(b => b.onclick = async () => { if (await confirmBox('Clear signature?', '', 'Clear', 'red')) pads[b.dataset.clr].clear(); });
  $$('[data-sp]').forEach(i => i.onchange = async e => { const f = e.target.files[0]; if (!f) return; j.sign[i.dataset.sp].photo = await compressImage(f, 1000, 0.75); await save(); render(true); });
  $$('[data-spx]').forEach(b => b.onclick = async () => { j.sign[b.dataset.spx].photo = ''; await save(); render(true); });
  $$('[data-sn]').forEach(i => i.oninput = () => { j.sign[i.dataset.sn].name = i.value; save(1); });
  $$('[data-sd]').forEach(i => i.oninput = () => { j.sign[i.dataset.sd].date = i.value; save(1); });
  $$('[data-sdg]').forEach(i => i.oninput = () => { j.sign[i.dataset.sdg].designation = i.value; save(1); });
  // export
  bindExport(async () => {
    await save(); const miss = jobCheck(j);
    if (miss.length) {
      const ok = await modal(`${visit ? 'Site visit report' : 'Job card'} not complete`, `<p>These items are missing and will show as <b>not captured</b>:</p><ul class="miss">${miss.map(m => `<li>${esc(m[1])}</li>`).join('')}</ul>`,
        [{ label: 'Cancel', value: false, cls: 'ghost' }, { label: 'Create PDF anyway', value: true, cls: 'pri', icon: 'doc' }]);
      if (!ok) return null;
    }
    const r = await buildJobPDF(j, trip); j.status = 'completed'; j.completedAt = Date.now(); await save();
    if (j.vehicleId && num(j.odoSite)) { const v = await DB.get('vehicles', j.vehicleId); if (v && num(j.odoSite) > (+v.odo || 0)) { v.odo = num(j.odoSite); await DB.put('vehicles', v); } }
    return r;
  }, { email: () => (j.customer && j.customer.email) || '', text: () => `${visit ? 'Site visit report' : 'Job card'} ${j.no} — ${j.customer ? KINDS.customers.title(j.customer) : ''}${visit ? '' : ` (${j.outcome || 'in progress'})`}` });
  $('#j_del').onclick = async () => { if (await confirmBox(`Delete ${visit ? 'site visit' : 'job card'}?`, `<p>${esc(j.no)} and its photos are removed from this tablet. Its rating points are removed too.</p>`, 'Delete', 'red')) { await DB.del('jobs', j.id); if (trip) { trip.jobId = null; await DB.put('trips', trip); } go(visit ? '#/visits' : '#/jobs'); } };
  function updBar() {
    const miss = jobCheck(j), total = visit ? 12 : 15, done = total - miss.length;
    $('#prog').innerHTML = `<b>${j.status === 'completed' ? 'Completed' : 'Draft'}</b> · ${done}/${total} required items${miss.length ? ' · missing: ' + esc(miss.slice(0, 3).map(m => m[1]).join(', ')) + (miss.length > 3 ? '…' : '') : ' · ready'}<div class="meter"><i style="width:${Math.round(100 * done / total)}%"></i></div>`;
    SEC.forEach(([s]) => { if (s === 'export' || s === 'equip') return; const ok = !miss.some(m => m[0] === s); const a = $('#j-' + s); if (a) a.classList.toggle('done', ok); const n = $('#n-' + s); if (n) { n.classList.toggle('done', ok); n.textContent = ok ? '✓' : NUM[s]; } });
  }
  updBar();
}
function rateModal(j) {
  return new Promise(res => {
    let k = j.rating ? j.rating.k : '';
    const m = document.createElement('div'); m.className = 'modal';
    m.innerHTML = `<div class="box"><h3>How did ${esc((j.tech && j.tech.name) || 'our technician')} do today?</h3><p class="hint" style="margin-top:0">Your rating helps ${esc(SET.company)} improve its service.</p>
      <div class="faces">${Object.entries(CRATE).map(([key, c]) => `<button type="button" class="face ${c.cls} ${key === k ? 'on' : ''}" data-f="${key}">${faceSVG(key)}${c.l}</button>`).join('')}</div>
      <label class="f">Comments (optional)<textarea id="rnote" placeholder="Anything you would like to tell us">${esc(j.rating ? j.rating.notes : '')}</textarea></label>
      <div class="ma"><button class="btn ghost" data-r="0">Cancel</button><button class="btn pri" data-r="1" ${k ? '' : 'disabled'}>${ICON.check} Submit rating</button></div></div>`;
    document.body.appendChild(m);
    $$('[data-f]', m).forEach(b => b.onclick = () => { k = b.dataset.f; $$('[data-f]', m).forEach(x => x.classList.toggle('on', x === b)); $('[data-r="1"]', m).disabled = false; });
    $('[data-r="0"]', m).onclick = () => { m.remove(); res(null); };
    $('[data-r="1"]', m).onclick = () => { const notes = $('#rnote', m).value.trim(); m.remove(); res({ k, notes, at: new Date().toISOString(), by: j.sign.cust.name || '' }); };
  });
}
