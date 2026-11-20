/* Green Job Cards — Green Enterprise Solutions technician app (offline, tablet-first).
   Technicians · Company vehicles · Customers (local databases, export/import)
   Pre-trip cost summary · Site call-out job card with photos, signatures and PDF export. */
'use strict';
const APP_VERSION = '1.1.0';

/* ------------------------------------------------------------------ helpers */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const num = v => { if (v === null || v === undefined || v === '') return null; const n = parseFloat(String(v).replace(/[^\d.\-]/g, '')); return isNaN(n) ? null : n; };
const nad = n => 'N$ ' + (Math.round((+n || 0) * 100) / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const kmF = n => { n = +n || 0; return n < 20 && n % 1 ? `${n.toFixed(1)} km` : `${Math.round(n).toLocaleString('en-GB')} km`; };
const pd = s => { if (!s) return null; const d = new Date(s); return isNaN(d) ? null : d; };
const fmtD = s => { const d = pd(s); return d ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''; };
const fmtDT = s => { const d = pd(s); return d ? d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''; };
const fmtT = s => { const d = pd(s); return d ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''; };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const localInput = d => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16); };
const hav = (a, b) => { const R = 6371, r = x => x * Math.PI / 180, dLa = r(b.lat - a.lat), dLo = r(b.lng - a.lng); const h = Math.sin(dLa / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const hrs = h => { const m = Math.round(h * 60); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; };
const mapURL = g => `https://maps.google.com/?q=${g.lat},${g.lng}`;

/* ------------------------------------------------------------------ storage (IndexedDB) */
const STORES = ['techs', 'vehicles', 'customers', 'jobs', 'trips'];
const DB = (() => {
  let p;
  const open = () => p || (p = new Promise((res, rej) => {
    const r = indexedDB.open('green-jobcards', 1);
    r.onupgradeneeded = () => { const d = r.result; STORES.forEach(s => d.objectStoreNames.contains(s) || d.createObjectStore(s, { keyPath: 'id' })); d.objectStoreNames.contains('kv') || d.createObjectStore('kv'); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const tx = async (st, mode, fn) => { const d = await open(); return new Promise((res, rej) => { const t = d.transaction(st, mode); const q = fn(t.objectStore(st)); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }); };
  return {
    all: s => tx(s, 'readonly', o => o.getAll()).then(x => x || []),
    get: (s, k) => tx(s, 'readonly', o => o.get(k)),
    put: (s, v, k) => tx(s, 'readwrite', o => k === undefined ? o.put(v) : o.put(v, k)),
    del: (s, k) => tx(s, 'readwrite', o => o.delete(k)),
    clear: s => tx(s, 'readwrite', o => o.clear()),
  };
})();
const DEFAULT_SETTINGS = {
  company: 'Green Enterprise Solutions (Pty) Ltd', web: 'www.green.com.na', phone: '', email: '',
  tabletId: 'T1', prefix: 'JC', seq: 0, tripSeq: 0,
  hoName: 'Head Office', hoAddress: 'Old Power Station, Windhoek', hoTown: 'Windhoek', hoLat: null, hoLng: null,
  diesel: 28.70, petrol: 23.90, kmRate: 0, labourRate: 0, avgSpeed: 80, calloutFee: 0, accom: 0, snt: 0,
  overnightKm: 350, inTownKm: 12, roadFactor: 1.3,
  emailMode: 'outlook', approverEmail: '', visitPrefix: 'SV',
};
let SET = { ...DEFAULT_SETTINGS };
async function loadSettings() { try { const v = await DB.get('kv', 'settings'); if (v) SET = { ...DEFAULT_SETTINGS, ...v }; } catch (e) { } return SET; }
const saveSettings = () => DB.put('kv', SET, 'settings');
const hoLabel = () => `${SET.hoName}, ${SET.hoAddress || SET.hoTown}`;

/* ------------------------------------------------------------------ images */
function fileToDataURL(f) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); }); }
function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }
async function compressImage(file, max = 1400, q = 0.72) {
  const url = URL.createObjectURL(file); const img = await loadImg(url); URL.revokeObjectURL(url);
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', q);
}

/* ------------------------------------------------------------------ icons */
const I = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICON = {
  home: I('<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>'),
  job: I('<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9z"/><path d="M9 12h6M9 16h4"/>'),
  trip: I('<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7"/>'),
  cust: I('<path d="M4 21V5l8-3v19M12 8l8 3v10M2 21h20M7 9h2M7 13h2M7 17h2M15 14h2M15 18h2"/>'),
  tech: I('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>'),
  car: I('<path d="M5 17h14v-5l-2-5H7l-2 5z"/><circle cx="8" cy="17" r="2"/><circle cx="16" cy="17" r="2"/><path d="M5 12h14"/>'),
  gear: I('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>'),
  camera: I('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="4"/>'),
  image: I('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>'),
  plus: I('<path d="M12 5v14M5 12h14"/>'),
  trash: I('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  pin: I('<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>'),
  doc: I('<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M9 13h8M9 17h6"/>'),
  save: I('<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>'),
  upload: I('<path d="M12 21V9M7 14l5-5 5 5M4 3h16"/>'),
  wa: I('<path d="M20.5 11.6a8.5 8.5 0 0 1-12.6 7.4L3.5 20.5l1.5-4.3a8.5 8.5 0 1 1 15.5-4.6z"/><path d="M9 8.5c0 3.5 3 6.5 6.5 6.5l1-1.6-2-1-1 .9a5 5 0 0 1-2.8-2.8l.9-1-1-2z"/>'),
  mail: I('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>'),
  bt: I('<path d="M7 7l10 10-5 5V2l5 5L7 17"/>'),
  eye: I('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  check: I('<path d="M4 12l5 5L20 6"/>'),
  arrow: I('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  money: I('<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 9v.01M18 15v.01"/>'),
  download: I('<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>'),
  box: I('<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8M12 13v8"/>'),
  list: I('<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>'),
  tool: I('<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.4 2.4-2.6-.4-.4-2.6z"/>'),
  star: I('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>'),
  sheet: I('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>'),
};

/* ------------------------------------------------------------------ UI primitives */
function toast(msg, ms = 2800) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), ms); }
function modal(title, html, buttons) {
  return new Promise(res => {
    const m = document.createElement('div'); m.className = 'modal';
    m.innerHTML = `<div class="box"><h3>${esc(title)}</h3><div class="mb">${html}</div><div class="ma">${buttons.map((b, i) => `<button class="btn ${b.cls || ''}" data-i="${i}">${b.icon ? ICON[b.icon] : ''}${esc(b.label)}</button>`).join('')}</div></div>`;
    m.addEventListener('click', e => { const b = e.target.closest('button[data-i]'); if (b) { const v = buttons[+b.dataset.i].value; m.remove(); res(v); } else if (e.target === m) { m.remove(); res(undefined); } });
    document.body.appendChild(m);
  });
}
const confirmBox = (t, h, ok = 'Confirm', cls = 'pri') => modal(t, h, [{ label: 'Cancel', value: false, cls: 'ghost' }, { label: ok, value: true, cls }]);
const segHTML = (id, opts, cur, cls = '') => `<div class="seg ${cls}" id="${id}">${opts.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<button type="button" data-v="${esc(v)}" class="${String(cur) === String(v) ? 'on' : ''}">${esc(l)}</button>`; }).join('')}</div>`;
function bindSeg(sel, fn) { $$(sel + ' button').forEach(b => b.onclick = () => { $$(sel + ' button').forEach(x => x.classList.toggle('on', x === b)); fn(b.dataset.v); }); }
const townOpts = (cur, blank = 'Select town…') => `<option value="">${blank}</option>${TOWNS.map(n => `<option ${n === cur ? 'selected' : ''}>${esc(n)}</option>`).join('')}`;
/* camera + gallery buttons for one target */
const pickBtns = (attr, val, label = 'Take photo', cls = 'sm') => `<label class="btn ${cls}">${ICON.camera} ${esc(label)}<input type="file" accept="image/*" capture="environment" ${attr}="${esc(val)}" hidden></label><label class="btn ghost ${cls}">${ICON.image} Gallery<input type="file" accept="image/*" ${attr}="${esc(val)}" hidden></label>`;

/* ------------------------------------------------------------------ router & shell */
const NAV = [['#/', 'Home', 'home'], ['#/pretrip', 'Pre-trip', 'trip'], ['#/prep', 'Trip-prep', 'box'], ['#/jobs', 'Site call-out', 'job'], ['#/visits', 'Site visit', 'eye'], ['#/customers', 'Customers', 'cust'], ['#/techs', 'Technicians', 'tech'], ['#/vehicles', 'Vehicles', 'car'], ['#/settings', 'Settings', 'gear']];
const app = $('#app');
const ROUTES = [];
const route = (p, fn) => ROUTES.push({ re: new RegExp('^' + p.replace(/:(\w+)/g, '([^/?]+)') + '(?:\\?.*)?$'), fn });
const go = h => { if (location.hash === h) render(); else location.hash = h; };
const qp = k => { const m = location.hash.match(new RegExp('[?&]' + k + '=([^&]+)')); return m ? decodeURIComponent(m[1]) : ''; };
window.addEventListener('hashchange', () => render());
let RQ = Promise.resolve();
function render(keep) { RQ = RQ.then(() => doRender(keep)).catch(e => console.error(e)); return RQ; }
async function doRender(keep) {
  const y = window.scrollY, h = location.hash.replace(/^#/, '') || '/';
  const r = ROUTES.find(x => x.re.test(h)); if (!r) return go('#/');
  drawRail(h);
  try { await r.fn(...h.match(r.re).slice(1).map(decodeURIComponent)); }
  catch (e) { console.error(e); setTop('Something went wrong'); app.innerHTML = `<div class="banner bad">${esc(e.message)}</div><button class="btn" onclick="go('#/')">Home</button>`; }
  window.scrollTo(0, keep ? y : 0);
}
function drawRail(h) {
  const sec = '#/' + (h.split('/')[1] || '').split('?')[0];
  const map = { '#/job': '#/jobs', '#/visit': '#/visits', '#/bom': '#/prep', '#/customer': '#/customers', '#/tech': '#/techs', '#/vehicle': '#/vehicles' };
  const cur = map[sec] || sec;
  $('#rail').innerHTML = `<div class="lg"><img src="assets/logo.png" alt="green"></div>${NAV.map(([hh, l, i]) => `<a href="${hh}" class="${cur === hh ? 'on' : ''}">${ICON[i]}${l}</a>`).join('')}<div class="sp"></div>`;
}
function setTop(title, sub = SET.company, back = '') {
  $('#tb-title').textContent = title; $('#tb-sub').textContent = sub || '';
  const b = $('#back'); b.classList.toggle('hidden', !back); b.onclick = () => go(back);
  document.title = `${title} · Green Job Cards`;
}
const net = () => { const n = $('#net'); n.textContent = navigator.onLine ? 'online' : 'offline'; n.classList.toggle('off', !navigator.onLine); };
window.addEventListener('online', net); window.addEventListener('offline', net);

/* ------------------------------------------------------------------ GPS */
function getGPS(timeout = 25000) {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error('GPS is not available on this device'));
    navigator.geolocation.getCurrentPosition(p => res({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6), acc: Math.round(p.coords.accuracy), at: new Date().toISOString() }),
      e => rej(new Error(e.code === 1 ? 'Location permission is blocked — allow location for this app' : e.code === 3 ? 'GPS timed out — try again near a window or outside' : 'Location unavailable — switch on Location')),
      { enableHighAccuracy: true, timeout, maximumAge: 0 });
  });
}

/* ------------------------------------------------------------------ master data definitions (technicians, vehicles, customers) */
const DEPTS = ['Infrastructure', 'Networking', 'R&D (Engineering Solutions)', 'Software', 'Other'];
const deptOf = t => DEPTS.includes(t.department) ? t.department : 'Other';
const KINDS = {
  techs: { one: 'Technician', many: 'Technicians', icon: 'tech', route: 'tech',
    fields: [['name', 'Full name', { req: 1 }], ['position', 'Position / title'], ['department', 'Department', { list: DEPTS }], ['empNo', 'Employee no.'],
      ['phone', 'Cell number', { type: 'tel' }], ['email', 'Email', { type: 'email' }], ['idNo', 'ID number'], ['licNo', "Driver's licence no."], ['licExpiry', 'Licence expiry', { type: 'date' }], ['notes', 'Skills / certifications / notes', { area: 1, span: 1 }]],
    title: x => x.name, line: x => [x.position, x.department, x.phone].filter(Boolean).join(' · ') },
  vehicles: { one: 'Vehicle', many: 'Company vehicles', icon: 'car', route: 'vehicle',
    fields: [['name', 'Vehicle name (e.g. Hilux 2)', { req: 1 }], ['reg', 'Registration no.', { req: 1 }], ['make', 'Make & model'], ['fuel', 'Fuel type', { seg: [['diesel', 'Diesel'], ['petrol', 'Petrol']] }],
      ['cons', 'Fuel consumption (l/100 km)', { type: 'num' }], ['odo', 'Current odometer (km)', { type: 'num' }], ['discExpiry', 'Licence disc expiry', { type: 'date' }], ['notes', 'Notes', { area: 1, span: 1 }]],
    title: x => `${x.name} · ${x.reg}`, line: x => [x.make, x.fuel, x.cons ? x.cons + ' l/100 km' : '', x.odo ? kmF(x.odo) : ''].filter(Boolean).join(' · ') },
  customers: { one: 'Customer', many: 'Customers', icon: 'cust', route: 'customer',
    fields: [['name', 'Company / customer', { req: 1 }], ['branch', 'Branch / site'], ['contact', 'Contact person'], ['phone', 'Phone', { type: 'tel' }], ['email', 'Email', { type: 'email' }], ['accountNo', 'Account / contract no.'],
      ['address', 'Street address', { span: 1 }], ['town', 'Town', { town: 1 }], ['kmFromHO', 'Distance from head office, one way (km)', { type: 'num', hint: 'Leave blank — the app calculates it' }], ['notes', 'Notes (access, hours, equipment on site)', { area: 1, span: 1 }]],
    title: x => x.name + (x.branch ? ' — ' + x.branch : ''), line: x => [x.town, x.address, x.contact, x.phone].filter(Boolean).join(' · ') },
};
function fieldHTML(pre, x, [k, l, o = {}]) {
  const v = x[k] ?? '', cls = o.span ? 'f spanall' : 'f';
  if (o.seg) return `<div class="${o.span ? 'spanall' : ''}"><div class="hint" style="font-weight:600;font-size:14px;margin-bottom:6px">${esc(l)}</div>${segHTML(pre + k, o.seg, v || o.seg[0][0])}</div>`;
  if (o.list) return `<label class="${cls}">${esc(l)}<select id="${pre}${k}"><option value="">—</option>${o.list.map(z => `<option ${z === v ? 'selected' : ''}>${esc(z)}</option>`).join('')}</select></label>`;
  if (o.town) return `<label class="${cls}">${esc(l)}<select id="${pre}${k}">${townOpts(v)}</select></label>`;
  if (o.area) return `<label class="${cls}">${esc(l)}<textarea id="${pre}${k}">${esc(v)}</textarea></label>`;
  const type = o.type === 'num' ? 'text" inputmode="decimal' : o.type || 'text';
  return `<label class="${cls}">${esc(l)}${o.req ? ' *' : ''}<input id="${pre}${k}" type="${type}" value="${esc(v)}">${o.hint ? `<span class="h">${esc(o.hint)}</span>` : ''}</label>`;
}
function readFields(pre, x, fields) {
  fields.forEach(([k, , o = {}]) => {
    if (o.seg) { const b = $(`#${pre}${k} button.on`); x[k] = b ? b.dataset.v : o.seg[0][0]; return; }
    const el = $('#' + pre + k); if (!el) return; x[k] = o.type === 'num' ? num(el.value) : el.value.trim();
  });
  return x;
}
async function kindList(kind) {
  const K = KINDS[kind]; const xs = (await DB.all(kind)).sort((a, b) => K.title(a).localeCompare(K.title(b)));
  setTop(K.many, `${xs.length} on this tablet`);
  const pre = kind === 'techs' ? await techBoardHTML() : '';
  app.innerHTML = `${pre}<div class="search"><input id="q" placeholder="Search ${K.many.toLowerCase()}…" autocomplete="off"><button class="btn pri" onclick="go('#/${K.route}/new')">${ICON.plus} Add ${K.one.toLowerCase()}</button></div>
    <div class="card list" id="lst"></div>
    <div class="acts"><button class="btn ghost sm" id="ex">${ICON.save} Export ${K.many.toLowerCase()}</button><button class="btn ghost sm" onclick="go('#/settings?s=data')">${ICON.upload} Import…</button></div>`;
  const draw = () => {
    const q = $('#q').value.toLowerCase().trim();
    const f = xs.filter(x => !q || JSON.stringify(x).toLowerCase().includes(q));
    $('#lst').innerHTML = f.map(x => `<div class="it" data-id="${x.id}"><span class="av">${ICON[K.icon]}</span><div class="tx"><b>${esc(K.title(x))}</b><div>${esc(K.line(x)) || '&nbsp;'}</div></div><span class="chip">Edit</span></div>`).join('') || `<div class="empty">${xs.length ? 'No match.' : `No ${K.many.toLowerCase()} yet — add the first one, or import a file from another tablet in Settings → Data.`}</div>`;
    $$('#lst .it').forEach(el => el.onclick = () => go(`#/${K.route}/${el.dataset.id}`));
  };
  $('#q').oninput = draw; draw();
  $('#ex').onclick = () => exportData([kind]);
}
async function kindEdit(kind, id) {
  const K = KINDS[kind]; const isNew = id === 'new'; const ret = qp('ret');
  const x = isNew ? { id: uid(), fuel: 'diesel' } : await DB.get(kind, id); if (!x) return go('#/' + kind);
  const back = ret ? '#/' + ret : '#/' + kind;
  setTop(isNew ? `New ${K.one.toLowerCase()}` : K.title(x), K.many, back);
  const used = kind === 'customers' && !isNew ? (await DB.all('jobs')).filter(j => j.customerId === x.id).length : 0;
  const hist = kind === 'techs' && !isNew ? await techHistoryHTML(x.id) : '';
  app.innerHTML = `<div class="card"><h2>${ICON[K.icon].replace('<svg', '<svg width="26" height="26"')} ${esc(K.one)} details</h2><div class="in grid2">${K.fields.map(f => fieldHTML('f_', x, f)).join('')}
      ${kind === 'customers' ? `<div class="spanall"><div class="hint" style="font-weight:600;font-size:14px;margin-bottom:6px">GPS location of the site</div><div class="acts" style="align-items:center"><span id="gpsTxt" class="snap" style="flex:1">${x.lat ? `${(+x.lat).toFixed(5)}, ${(+x.lng).toFixed(5)} · <a href="${mapURL(x)}" target="_blank" rel="noopener">map</a>` : 'Not set — capture it while standing at the customer (or from a site call-out). Used for in-town distances.'}</span><button class="btn sm" id="gps">${ICON.pin} Use my location</button>${x.lat ? '<button class="btn ghost sm" id="gpsx">Clear</button>' : ''}</div></div>` : ''}
    </div></div>
    ${hist}${used ? `<div class="banner">${used} job card(s) on this tablet for this customer.</div>` : ''}
    <div class="acts"><button class="btn pri lg" id="sv">${ICON.check} Save ${K.one.toLowerCase()}</button>${isNew ? '' : `<button class="btn ghost" id="del">${ICON.trash} Delete</button>`}</div>`;
  K.fields.filter(f => f[2] && f[2].seg).forEach(([k]) => bindSeg('#f_' + k, () => { }));
  const gpsShow = () => { $('#gpsTxt').innerHTML = x.lat ? `${(+x.lat).toFixed(5)}, ${(+x.lng).toFixed(5)} · <a href="${mapURL(x)}" target="_blank" rel="noopener">map</a> <span class="hint">(saved with the customer)</span>` : 'Not set'; };
  if ($('#gps')) $('#gps').onclick = async () => { try { toast('Getting location…'); const g = await getGPS(); x.lat = g.lat; x.lng = g.lng; toast(`Location captured (±${g.acc} m)`); gpsShow(); } catch (e) { toast(e.message, 5000); } };
  if ($('#gpsx')) $('#gpsx').onclick = () => { x.lat = x.lng = null; gpsShow(); };
  $('#sv').onclick = async () => {
    readFields('f_', x, K.fields);
    const miss = K.fields.filter(f => f[2] && f[2].req && !x[f[0]]); if (miss.length) return toast(`${miss.map(f => f[1]).join(', ')} required`);
    x.updatedAt = Date.now(); await DB.put(kind, x); toast(`${K.one} saved`);
    if (ret) { const [rk, rid] = ret.split('/'); const store = rk === 'job' ? 'jobs' : 'trips'; const rec = await DB.get(store, rid); const fld = { customers: 'customerId', techs: 'techId', vehicles: 'vehicleId' }[kind];
      if (rec && store === 'trips' && kind === 'techs') { rec.techIds = [...new Set([...(rec.techIds || []), x.id])]; await DB.put(store, rec); }
      else if (rec && !rec[fld]) { rec[fld] = x.id; if (store === 'trips' && kind === 'customers') rec.destMode = 'customer'; if (store === 'jobs') snapJob(rec, await refs()); await DB.put(store, rec); } }
    go(back);
  };
  if ($('#del')) $('#del').onclick = async () => { if (await confirmBox(`Delete ${K.one.toLowerCase()}?`, `<p>${esc(K.title(x))} is removed from this tablet. Existing job cards keep their copy of the details.</p>`, 'Delete', 'red')) { await DB.del(kind, x.id); go('#/' + kind); } };
}
route('/techs', () => kindList('techs')); route('/tech/:id', id => kindEdit('techs', id));
route('/vehicles', () => kindList('vehicles')); route('/vehicle/:id', id => kindEdit('vehicles', id));
route('/customers', () => kindList('customers')); route('/customer/:id', id => kindEdit('customers', id));
async function refs() { const [techs, vehicles, customers] = await Promise.all([DB.all('techs'), DB.all('vehicles'), DB.all('customers')]); const by = a => Object.fromEntries(a.map(x => [x.id, x])); return { techs, vehicles, customers, T: by(techs), V: by(vehicles), C: by(customers) }; }
const custOpts = (cs, cur) => `<option value="">Select customer…</option>${cs.slice().sort((a, b) => KINDS.customers.title(a).localeCompare(KINDS.customers.title(b))).map(c => `<option value="${c.id}" ${c.id === cur ? 'selected' : ''}>${esc(KINDS.customers.title(c))}${c.town ? ' (' + esc(c.town) + ')' : ''}</option>`).join('')}`;
const techOpts = (ts, cur, blank = 'Select technician…') => `<option value="">${blank}</option>${ts.slice().sort((a, b) => a.name.localeCompare(b.name)).map(t => `<option value="${t.id}" ${t.id === cur ? 'selected' : ''}>${esc(t.name)}${t.department ? ' — ' + esc(t.department) : ''}</option>`).join('')}`;
const vehOpts = (vs, cur) => `<option value="">Select vehicle…</option>${vs.slice().sort((a, b) => a.name.localeCompare(b.name)).map(v => `<option value="${v.id}" ${v.id === cur ? 'selected' : ''}>${esc(v.name)} · ${esc(v.reg)}</option>`).join('')}`;

/* ------------------------------------------------------------------ distance & cost (pre-trip) */
function startInfo(p) { return p.startMode === 'other' ? { town: p.startTown, label: [p.startAddress, p.startTown].filter(Boolean).join(', ') || 'not set', lat: null, lng: null, ho: false } : { town: SET.hoTown, label: hoLabel(), lat: SET.hoLat, lng: SET.hoLng, ho: true }; }
function destInfo(p, R) {
  if (p.destMode === 'manual') return { town: p.destTown, label: [p.destAddress, p.destTown].filter(Boolean).join(', ') || 'not set', lat: null, lng: null };
  const c = R.C[p.customerId]; if (!c) return { town: '', label: 'no customer selected' };
  return { town: c.town, label: `${KINDS.customers.title(c)}${c.address || c.town ? ' — ' + [c.address, c.town].filter(Boolean).join(', ') : ''}`, lat: c.lat, lng: c.lng, cust: c };
}
function distance(p, R) {
  const s = startInfo(p), d = destInfo(p, R);
  if (num(p.kmOverride) != null) return { km: num(p.kmOverride), method: 'entered manually', s, d };
  if (s.ho && d.cust && num(d.cust.kmFromHO) != null) return { km: num(d.cust.kmFromHO), method: 'from the customer record', s, d };
  if (!s.town || !d.town) return { km: null, method: !d.town ? 'select a destination' : 'select the start town', s, d };
  if (s.town !== d.town) { const r = roadRoute(s.town, d.town); return r ? { km: r.km, method: 'road network', path: r.path, s, d } : { km: null, method: 'no road route — enter km', s, d }; }
  if (s.lat && d.lat) return { km: Math.max(1, Math.round(hav(s, d) * (+SET.roadFactor || 1.3) * 10) / 10), method: `in town — GPS distance × ${SET.roadFactor}`, s, d };
  return { km: +SET.inTownKm || 10, method: 'in town — default estimate', s, d };
}
function tripCalc(p, R) {
  const D = distance(p, R), v = R.V[p.vehicleId] || {};
  const one = D.km || 0, total = Math.round(one * (p.round ? 2 : 1) * 10) / 10;
  const n = Math.max(1, (p.techIds || []).length), cons = +v.cons || 12, price = v.fuel === 'petrol' ? +SET.petrol : +SET.diesel;
  const litres = Math.round(total * cons / 100 * 10) / 10, fuel = litres * price;
  const travelH = total / (+SET.avgSpeed || 80), onsite = num(p.onsiteHours) || 0;
  const sugN = one > (+SET.overnightKm || 350) || travelH + onsite > 11 ? Math.max(1, Math.ceil((travelH + onsite) / 10) - 1) : 0; // ~10 working hours per day
  const nights = num(p.nights) != null ? num(p.nights) : sugN;
  const lines = [['Fuel', `${kmF(total)} × ${cons} l/100 km = ${litres} L × ${nad(price)}/L (${v.fuel || 'diesel'})`, fuel]];
  if (+SET.kmRate) lines.push(['Vehicle running cost', `${kmF(total)} × ${nad(SET.kmRate)}/km`, total * SET.kmRate]);
  if (+SET.labourRate) { lines.push(['Travel time', `${hrs(travelH)} × ${n} technician(s) × ${nad(SET.labourRate)}/h`, travelH * n * SET.labourRate]); if (onsite) lines.push(['On-site labour', `${onsite} h × ${n} technician(s) × ${nad(SET.labourRate)}/h`, onsite * n * SET.labourRate]); }
  if (+SET.calloutFee) lines.push(['Call-out fee', '', +SET.calloutFee]);
  if (nights && (+SET.accom || +SET.snt)) lines.push(['Accommodation & S&T', `${nights} night(s) × ${n} technician(s) × ${nad((+SET.accom || 0) + (+SET.snt || 0))}`, nights * n * ((+SET.accom || 0) + (+SET.snt || 0))]);
  (p.extras || []).filter(e => num(e.amt)).forEach(e => lines.push([e.desc || 'Other', 'additional cost', num(e.amt)]));
  const totalCost = lines.reduce((a, l) => a + l[2], 0);
  return { D, one, total, n, cons, price, litres, travelH, onsite, nights, sugN, lines, totalCost, v };
}

/* ------------------------------------------------------------------ signature pad (strokes kept so Undo works) */
function sigPad(canvas, so, onChange) {
  const ratio = Math.max(window.devicePixelRatio || 1, 1), ctx = canvas.getContext('2d');
  so.strokes = so.strokes || [];
  let W = 1, H = 1, base = null, cur = null;
  if (so.sig && !so.strokes.length) { base = new Image(); base.onload = redraw; base.src = so.sig; }
  function style() { ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0d2a18'; }
  function fit() { const r = canvas.getBoundingClientRect(); W = r.width || 300; H = r.height || 200; canvas.width = W * ratio; canvas.height = H * ratio; ctx.setTransform(ratio, 0, 0, ratio, 0, 0); style(); redraw(); }
  function redraw() {
    ctx.clearRect(0, 0, W, H);
    if (base && base.complete && base.naturalWidth) ctx.drawImage(base, 0, 0, W, H);
    for (const st of so.strokes) { ctx.beginPath(); st.forEach(([x, y], i) => i ? ctx.lineTo(x * W, y * H) : ctx.moveTo(x * W, y * H)); if (st.length === 1) ctx.lineTo(st[0][0] * W + 0.5, st[0][1] * H + 0.5); ctx.stroke(); }
  }
  function commit() { so.sig = (so.strokes.length || base) ? canvas.toDataURL('image/png') : ''; onChange(); }
  const pos = e => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) / W, (e.clientY - r.top) / H]; };
  canvas.addEventListener('pointerdown', e => { cur = [pos(e)]; so.strokes.push(cur); canvas.setPointerCapture(e.pointerId); e.preventDefault(); });
  canvas.addEventListener('pointermove', e => { if (!cur) return; const p = pos(e), l = cur[cur.length - 1]; ctx.beginPath(); ctx.moveTo(l[0] * W, l[1] * H); ctx.lineTo(p[0] * W, p[1] * H); ctx.stroke(); cur.push([+p[0].toFixed(4), +p[1].toFixed(4)]); e.preventDefault(); });
  const end = () => { if (!cur) return; if (cur.length === 1) redraw(); cur = null; commit(); };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end); canvas.addEventListener('pointerleave', end);
  fit(); window.addEventListener('resize', () => canvas.isConnected && fit());
  return {
    undo() { if (so.strokes.length) { so.strokes.pop(); redraw(); commit(); return true; } if (base) { base = null; redraw(); commit(); return true; } return false; },
    clear() { so.strokes = []; base = null; redraw(); commit(); },
  };
}

/* ------------------------------------------------------------------ export panel: save / WhatsApp / Outlook / Bluetooth */
const expHTML = () => `<div class="exp"><button class="sv" data-exp="save">${ICON.save}Save to device</button><button class="wa" data-exp="wa">${ICON.wa}WhatsApp</button><button class="em" data-exp="email">${ICON.mail}${SET.emailMode === 'outlook' ? 'Outlook email' : 'Email'}</button><button class="bt" data-exp="bt">${ICON.bt}Bluetooth</button></div>
  <div class="acts" style="margin-top:12px"><button class="btn ghost sm" data-exp="view">${ICON.eye} View PDF</button><button class="btn ghost sm" data-exp="share">${ICON.upload} Attach via share menu (Outlook, Gmail, Drive…)</button></div>`;
let LAST_PDF = null;
function downloadBlob(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000); }
async function shareFile(r, hint) {
  const file = new File([r.blob], r.name, { type: 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    if (hint) toast(hint, 3500);
    try { await navigator.share({ files: [file], title: r.title, text: r.title }); return true; } catch (e) { if (e.name === 'AbortError') return true; console.warn(e); }
  }
  return false;
}
/* Opens a NEW email in the Outlook app (ms-outlook:// deep link) with recipient, subject and text filled in.
   A web page cannot attach a file to it, so the PDF is saved to Downloads first and attached with the paper clip.
   If Outlook is not installed the phone's default mail app opens instead. */
function openOutlook(to, subject, body) {
  const q = `to=${encodeURIComponent(to || '')}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const mailto = `mailto:${encodeURIComponent(to || '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  if (SET.emailMode === 'mailto') { location.href = mailto; return; }
  let left = false; const vis = () => { if (document.hidden) left = true; };
  document.addEventListener('visibilitychange', vis); window.addEventListener('blur', vis);
  location.href = `ms-outlook://compose?${q}`;
  setTimeout(() => { document.removeEventListener('visibilitychange', vis); window.removeEventListener('blur', vis); if (!left && !document.hidden) { toast('Outlook app not found — opening the default email app', 4000); location.href = mailto; } }, 2000);
}
function bindExport(build, opt = {}) {
  $$('[data-exp]').forEach(b => b.onclick = async () => {
    const how = b.dataset.exp;
    const wait = document.createElement('div'); wait.className = 'modal'; wait.innerHTML = '<div class="box" style="max-width:360px;text-align:center"><h3>Creating PDF…</h3><div class="spinner"></div></div>';
    let r; try { document.body.appendChild(wait); r = await build(); } catch (e) { console.error(e); toast('PDF failed: ' + e.message, 6000); } finally { wait.remove(); }
    if (!r) return; LAST_PDF = r;
    const text = typeof opt.text === 'function' ? opt.text() : (opt.text || r.title), email = typeof opt.email === 'function' ? opt.email() : opt.email;
    if (how === 'save') { downloadBlob(r.blob, r.name); toast(`Saved to Downloads: ${r.name}`, 4000); return; }
    if (how === 'view') { window.open(URL.createObjectURL(r.blob), '_blank'); return; }
    if (how === 'email' && SET.emailMode !== 'share') {
      downloadBlob(r.blob, r.name);
      const go2 = await modal('New email in Outlook', `<p>The PDF <b>${esc(r.name)}</b> has been saved to <b>Downloads</b>.</p><p>Outlook opens a new email with the recipient, subject and message filled in.<br>In Outlook tap the <b>📎 paper clip → Attach file</b> and pick the PDF from Downloads (it is at the top of the recent files).</p>${email ? `<p class="hint">To: ${esc(email)}</p>` : ''}`,
        [{ label: 'Cancel', value: false, cls: 'ghost' }, { label: 'Attach automatically instead (share menu)', value: 'share', cls: 'ghost' }, { label: 'Open Outlook', value: true, cls: 'pri', icon: 'mail' }]);
      if (go2 === true) openOutlook(email, r.title, `Good day,\n\nPlease find attached ${r.title}.\n\n${text}\n\nKind regards\n${SET.company}`);
      if (go2 === 'share' && !(await shareFile(r, 'Choose Outlook in the share menu'))) toast('This browser cannot share files.', 4000);
      return;
    }
    const hints = { wa: 'Choose WhatsApp in the share menu', email: 'Choose Outlook in the share menu', bt: 'Choose Bluetooth in the share menu', share: 'Choose the app in the share menu' };
    if (await shareFile(r, hints[how])) return;
    // browser cannot share files (e.g. desktop): save the PDF, then open the app with the message ready
    downloadBlob(r.blob, r.name);
    if (how === 'wa') { window.open(`https://wa.me/?text=${encodeURIComponent(text + ' — PDF saved to Downloads, please attach: ' + r.name)}`, '_blank'); return; }
    if (how === 'email') { openOutlook(email, r.title, `Good day,\n\nPlease find attached ${r.title}.\n\n(Attach the PDF from Downloads: ${r.name})\n\nKind regards\n${SET.company}`); return; }
    toast('This browser cannot share files — the PDF was saved to Downloads; share it from the Files app.', 6000);
  });
}

/* ------------------------------------------------------------------ data export / import (move to a new tablet) */
const LABEL = { techs: 'technicians', vehicles: 'vehicles', customers: 'customers', jobs: 'job cards & site visits', trips: 'pre-trips (incl. trip-prep)' };
async function exportData(kinds, withSettings) {
  const data = { app: 'green-jobcards', version: APP_VERSION, exportedAt: new Date().toISOString(), tablet: SET.tabletId, kinds };
  for (const k of kinds) data[k] = await DB.all(k);
  if (withSettings) { const s = { ...SET }; delete s.seq; delete s.tripSeq; data.settings = s; }
  const tag = kinds.length === 1 ? LABEL[kinds[0]].replace(/[^a-z]+/g, '-') : kinds.includes('jobs') ? 'full-backup' : 'master-data';
  const name = `Green_${tag}_${SET.tabletId}_${today()}.json`;
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const f = new File([blob], name, { type: 'application/json' });
  const n = kinds.map(k => `${data[k].length} ${LABEL[k]}`).join(', ');
  const how = await modal('Export ready', `<p><b>${esc(name)}</b><br>${esc(n)}${withSettings ? ' + settings' : ''}</p><p class="hint">Send it to the new tablet (Bluetooth, WhatsApp, email) or save it, then use <b>Settings → Data → Import</b> there.</p>`,
    [{ label: 'Cancel', value: null, cls: 'ghost' }, { label: 'Save to device', value: 'save', icon: 'save' }, { label: 'Share / send', value: 'share', cls: 'pri', icon: 'upload' }]);
  if (how === 'save') { downloadBlob(blob, name); toast('Saved to Downloads'); }
  if (how === 'share') { try { if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: name }); return; } } catch (e) { if (e.name === 'AbortError') return; } downloadBlob(blob, name); toast('Sharing not supported here — saved to Downloads instead'); }
}
const CSV_COLS = ['name', 'branch', 'contact', 'phone', 'email', 'accountNo', 'address', 'town', 'kmFromHO', 'lat', 'lng', 'notes'];
function customersCSV(cs) { const q = v => { const s = String(v ?? ''); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }; return [CSV_COLS.join(','), ...cs.map(c => CSV_COLS.map(k => q(c[k])).join(','))].join('\r\n'); }
function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false; text = text.replace(/^﻿/, '');
  const delim = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  for (let i = 0; i < text.length; i++) { const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true; else if (ch === delim) { row.push(cur); cur = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; } else cur += ch; }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const head = rows.shift().map(h => h.trim().toLowerCase());
  const map = { name: ['name', 'company', 'customer'], branch: ['branch', 'site'], contact: ['contact', 'contact person'], phone: ['phone', 'tel', 'cell'], email: ['email', 'e-mail'], accountNo: ['accountno', 'account', 'account no', 'contract'], address: ['address', 'street'], town: ['town', 'city'], kmFromHO: ['kmfromho', 'km', 'distance'], lat: ['lat', 'latitude'], lng: ['lng', 'lon', 'longitude'], notes: ['notes', 'note'] };
  const idx = Object.fromEntries(Object.entries(map).map(([k, al]) => [k, head.findIndex(h => al.includes(h))]));
  return rows.filter(r => r.some(x => x.trim())).map(r => { const c = { id: uid() }; for (const k in idx) if (idx[k] >= 0) c[k] = (r[idx[k]] || '').trim(); ['kmFromHO', 'lat', 'lng'].forEach(k => c[k] = num(c[k])); const t = TOWNS.find(t => t.toLowerCase() === String(c.town || '').toLowerCase()); if (t) c.town = t; return c; }).filter(c => c.name);
}
async function importFile(file) {
  let data;
  try {
    const text = await file.text();
    if (/\.csv$/i.test(file.name) || !text.trim().startsWith('{')) data = { app: 'green-jobcards', customers: parseCSV(text), kinds: ['customers'] };
    else { data = JSON.parse(text); if (data.app !== 'green-jobcards') throw new Error('This is not a Green Job Cards export file'); }
  } catch (e) { return toast('Import failed: ' + e.message, 6000); }
  const kinds = STORES.filter(k => Array.isArray(data[k]) && data[k].length);
  if (!kinds.length && !data.settings) return toast('The file contains no records');
  const how = await modal('Import data', `<p>The file contains:</p><ul class="miss">${kinds.map(k => `<li><b>${data[k].length}</b> ${LABEL[k]}</li>`).join('')}${data.settings ? '<li>settings (company, head office, rates)</li>' : ''}</ul>
    <p class="hint"><b>Merge</b> adds new records and updates ones that already exist (same record). <b>Replace</b> first deletes the ${kinds.map(k => LABEL[k]).join(', ')} on this tablet.</p>`,
    [{ label: 'Cancel', value: null, cls: 'ghost' }, { label: 'Replace', value: 'replace', cls: 'red' }, { label: 'Merge', value: 'merge', cls: 'pri' }]);
  if (!how) return;
  for (const k of kinds) { if (how === 'replace') await DB.clear(k); for (const x of data[k]) if (x && x.id) await DB.put(k, x); }
  if (data.settings) { const keep = { seq: SET.seq, tripSeq: SET.tripSeq, tabletId: SET.tabletId }; SET = { ...DEFAULT_SETTINGS, ...data.settings, ...keep }; await saveSettings(); }
  toast(`Imported: ${kinds.map(k => `${data[k].length} ${LABEL[k]}`).join(', ') || 'settings'}`, 4500); render(true);
}

/* ------------------------------------------------------------------ install (PWA) */
let DEFER_INSTALL = null;
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); DEFER_INSTALL = e; if (location.hash.startsWith('#/settings')) render(true); });
window.addEventListener('appinstalled', () => { DEFER_INSTALL = null; toast('App installed — open it from the home screen'); });

/* ------------------------------------------------------------------ settings */
route('/settings', async () => {
  await loadSettings(); const R = await refs(); const [jobs, trips] = await Promise.all([DB.all('jobs'), DB.all('trips')]);
  setTop('Settings', 'Company, head office, rates & data');
  let est = ''; try { const e = await navigator.storage.estimate(); est = `${(e.usage / 1048576).toFixed(1)} MB used`; } catch (e) { }
  const f = (k, l, o = {}) => `<label class="f ${o.span ? 'spanall' : ''}">${esc(l)}<input id="s_${k}" ${o.num ? 'inputmode="decimal"' : ''} value="${esc(SET[k] ?? '')}">${o.hint ? `<span class="h">${esc(o.hint)}</span>` : ''}</label>`;
  app.innerHTML = `
    <div class="card" id="s-data"><h2>${ICON.upload.replace('<svg', '<svg width="24" height="24"')} Data — move to a new tablet</h2><div class="in">
      <div class="kpis"><div class="kpi"><span>Technicians</span><b>${R.techs.length}</b></div><div class="kpi"><span>Vehicles</span><b>${R.vehicles.length}</b></div><div class="kpi"><span>Customers</span><b>${R.customers.length}</b></div><div class="kpi"><span>Job cards · pre-trips</span><b>${jobs.length} · ${trips.length}</b></div></div>
      <div class="hint" style="font-weight:600;font-size:14px;margin-bottom:8px">Export</div>
      <div class="acts"><button class="btn pri" data-ex="techs,vehicles,customers" data-set="1">${ICON.save} All three + settings</button><button class="btn" data-ex="techs">${ICON.tech} Technicians</button><button class="btn" data-ex="vehicles">${ICON.car} Vehicles</button><button class="btn" data-ex="customers">${ICON.cust} Customers</button></div>
      <div class="acts" style="margin-top:10px"><button class="btn ghost sm" id="csvx">Customers as CSV (Excel)</button><button class="btn ghost sm" data-ex="techs,vehicles,customers,jobs,trips" data-set="1">Full backup incl. job cards & photos</button></div>
      <div class="hint" style="font-weight:600;font-size:14px;margin:18px 0 8px">Import</div>
      <label class="btn dark">${ICON.upload} Import file (.json export or customers .csv)<input type="file" id="imp" accept=".json,.csv,application/json,text/csv" hidden></label>
      <p class="hint" style="margin:10px 0 0">CSV columns: ${CSV_COLS.join(', ')} — only <b>name</b> is required; a first row with headings is expected. ${esc(est)}</p></div></div>
    <div class="card"><h2>${ICON.cust.replace('<svg', '<svg width="24" height="24"')} Head office (default start of every trip)</h2><div class="in grid3">
      ${f('hoName', 'Name')}${f('hoAddress', 'Address')}<label class="f">Town<select id="s_hoTown">${townOpts(SET.hoTown)}</select></label>
      <div class="spanall acts" style="align-items:center"><span class="snap" style="flex:1">${SET.hoLat ? `GPS ${(+SET.hoLat).toFixed(5)}, ${(+SET.hoLng).toFixed(5)} · <a href="${mapURL({ lat: SET.hoLat, lng: SET.hoLng })}" target="_blank" rel="noopener">map</a>` : 'GPS location not set — stand at the Old Power Station office and tap “Use my location”. It makes in-town distances to Windhoek customers more accurate.'}</span><button class="btn" id="hoGps">${ICON.pin} Use my location</button></div></div></div>
    <div class="card" id="s-rates"><h2>${ICON.money.replace('<svg', '<svg width="24" height="24"')} Rates for the pre-trip cost summary</h2><div class="in grid4">
      ${f('diesel', 'Diesel N$/L', { num: 1 })}${f('petrol', 'Petrol N$/L', { num: 1 })}${f('kmRate', 'Vehicle cost N$/km', { num: 1, hint: '0 = not charged' })}${f('avgSpeed', 'Average speed km/h', { num: 1 })}
      ${f('labourRate', 'Labour N$/hour per technician', { num: 1, hint: '0 = not charged' })}${f('calloutFee', 'Call-out fee N$', { num: 1 })}${f('accom', 'Accommodation N$/night', { num: 1 })}${f('snt', 'S&T N$/night', { num: 1 })}
      ${f('overnightKm', 'Suggest overnight above (km one way)', { num: 1 })}${f('inTownKm', 'In-town default (km one way)', { num: 1 })}${f('roadFactor', 'GPS → road distance factor', { num: 1 })}
      <p class="hint spanall" style="margin:0">Fuel defaults: Namibian pump prices after the May 2026 adjustment (Walvis Bay diesel 50ppm N$ 28.26, ULP95 N$ 23.48 + inland differential). Update them each month.</p></div></div>
    <div class="card"><h2>${ICON.doc.replace('<svg', '<svg width="24" height="24"')} Company & job card numbers</h2><div class="in grid3">
      ${f('company', 'Company name', { span: 1 })}${f('web', 'Website')}${f('phone', 'Phone')}${f('email', 'Email')}
      ${f('tabletId', 'Tablet code', { hint: 'Unique per tablet, e.g. T1, OSH' })}${f('prefix', 'Job card prefix')}<label class="f">Next job card no.<input value="${esc(`${SET.prefix}-${SET.tabletId}-${String((+SET.seq || 0) + 1).padStart(4, '0')}`)}" disabled></label></div></div>
    <div class="card"><h2>${ICON.mail.replace('<svg', '<svg width="24" height="24"')} Email & approvals</h2><div class="in grid2">
      <div class="spanall"><div class="hint" style="font-weight:600;font-size:14px;margin-bottom:6px">Email button opens</div>${segHTML('s_emailMode', [['outlook', 'Outlook app — new email (default)'], ['mailto', 'Default email app'], ['share', 'Share menu (PDF attached)']], SET.emailMode)}
        <p class="hint" style="margin:8px 0 0">Outlook / default email app: the PDF is saved to Downloads and attached with the paper clip — a web app cannot attach files to a new email itself. Share menu: the PDF is attached automatically, you pick Outlook in the list.</p></div>
      ${f('approverEmail', 'Pre-trip approver email (manager)', { hint: 'Pre-trip cost summaries are emailed here for approval' })}${f('visitPrefix', 'Site visit report prefix')}</div></div>
    <div class="acts" style="margin-bottom:22px"><button class="btn pri lg" id="sv">${ICON.check} Save settings</button></div>
    <div class="card"><h2>${ICON.download.replace('<svg', '<svg width="24" height="24"')} Install the app</h2><div class="in">${isStandalone() ? '<div class="banner" style="margin:0">Installed — you are using the app version.</div>' : DEFER_INSTALL ? `<p style="margin-top:0">Put Green Job Cards on the home screen. It opens full-screen and works without signal.</p><button class="btn pri" id="inst">${ICON.download} Install app on this tablet</button>` : `<p style="margin:0">Open this page in <b>Chrome</b>, tap the <b>⋮</b> menu and choose <b>Install app</b> / <b>Add to Home screen</b>. On an iPad: Safari → Share → <b>Add to Home Screen</b>.</p>`}</div></div>
    <p class="hint" style="text-align:center">Green Job Cards v${APP_VERSION}</p>`;
  bindSeg('#s_emailMode', () => { });
  $$('[data-ex]').forEach(b => b.onclick = () => exportData(b.dataset.ex.split(','), !!b.dataset.set));
  $('#csvx').onclick = () => { const blob = new Blob(['﻿' + customersCSV(R.customers)], { type: 'text/csv' }); downloadBlob(blob, `Green_customers_${today()}.csv`); toast('Customers CSV saved to Downloads'); };
  $('#imp').onchange = e => { const f0 = e.target.files[0]; if (f0) importFile(f0); };
  const read = () => { ['hoName', 'hoAddress', 'company', 'web', 'phone', 'email', 'prefix', 'approverEmail', 'visitPrefix'].forEach(k => SET[k] = $('#s_' + k).value.trim()); const em = $('#s_emailMode button.on'); if (em) SET.emailMode = em.dataset.v; SET.tabletId = $('#s_tabletId').value.trim().replace(/[^A-Za-z0-9]/g, '').toUpperCase() || 'T1'; SET.hoTown = $('#s_hoTown').value || 'Windhoek';
    ['diesel', 'petrol', 'kmRate', 'avgSpeed', 'labourRate', 'calloutFee', 'accom', 'snt', 'overnightKm', 'inTownKm', 'roadFactor'].forEach(k => SET[k] = num($('#s_' + k).value) ?? 0); };
  $('#sv').onclick = async () => { read(); await saveSettings(); toast('Settings saved'); render(true); };
  $('#hoGps').onclick = async () => { read(); try { toast('Getting location…'); const g = await getGPS(); SET.hoLat = g.lat; SET.hoLng = g.lng; await saveSettings(); toast(`Head office location saved (±${g.acc} m)`); } catch (e) { toast(e.message, 5000); } render(true); };
  const ib = $('#inst'); if (ib) ib.onclick = async () => { const p = DEFER_INSTALL; if (!p) return; p.prompt(); await p.userChoice.catch(() => null); DEFER_INSTALL = null; render(true); };
  const s = qp('s'); if (s) setTimeout(() => { const el = $('#s-' + s); el && window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 90, behavior: 'smooth' }); }, 50);
});

/* ------------------------------------------------------------------ boot */
(async function boot() {
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) { }
  await loadSettings(); net(); render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      reg.addEventListener('updatefound', () => { const nw = reg.installing; nw && nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) confirmBox('Update available', '<p>A new version of Green Job Cards is ready. Your data is kept.</p>', 'Update now').then(ok => { if (ok) { nw.postMessage('skip'); setTimeout(() => location.reload(), 400); } });
      }); });
    } catch (e) { console.warn(e); }
  }
})();
