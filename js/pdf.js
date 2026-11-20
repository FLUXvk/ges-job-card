/* Green Job Cards — PDFs built on the tablet (jsPDF + autotable), Green Enterprise Solutions branding. */
'use strict';
const C = { G: [57, 184, 7], GD: [35, 144, 71], GDD: [23, 102, 58], INK: [28, 42, 33], MUTED: [93, 107, 98], TINT: [236, 246, 230], LINE: [211, 228, 207], RED: [198, 40, 40], AMBER: [154, 91, 0] };
let LOGO = null, WM = null;
async function urlToDataURL(u) { const r = await fetch(u); return fileToDataURL(await r.blob()); }
async function loadAssets() { if (!LOGO) LOGO = await urlToDataURL('assets/logo.png'); if (!WM) WM = await urlToDataURL('assets/watermark.png'); }
/* Helvetica in jsPDF only covers Latin-1 */
const T = s => String(s ?? '').replace(/→/g, '->').replace(/›/g, '>').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[✓✔]/g, 'OK').replace(/↶/g, '').replace(/[^\x00-\xFF—–·°×±]/g, '');
const PM = { l: 14, r: 14, t: 34, b: 18 };
const NC = 'not captured';
async function dims(d) { try { const i = await loadImg(d); return { w: i.width, h: i.height }; } catch (e) { return { w: 4, h: 3 }; } }

function pdfBase(title, docNo) {
  const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const k = { doc, W, H, y: PM.t + 4 };
  k.newPage = () => { doc.addPage(); k.y = PM.t + 4; };
  k.need = h => { if (k.y + h > H - PM.b - 4) k.newPage(); };
  k.sect = txt => {
    k.need(22);
    doc.setFillColor(...C.G); doc.rect(PM.l, k.y, 2.2, 6, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.setTextColor(...C.GDD); doc.text(T(txt), PM.l + 4.5, k.y + 4.6); k.y += 8.5;
  };
  k.tbl = (body, opts = {}) => {
    doc.autoTable({ startY: k.y, margin: { left: PM.l, right: PM.r, top: PM.t + 2, bottom: PM.b + 2 }, theme: 'grid', body, head: opts.head ? [opts.head] : undefined,
      styles: { font: 'helvetica', fontSize: 8.8, cellPadding: 2, textColor: C.INK, lineColor: C.LINE, lineWidth: 0.25, overflow: 'linebreak', valign: 'top' },
      headStyles: { fillColor: C.GDD, textColor: 255, fontStyle: 'bold' }, columnStyles: opts.cols || {}, ...opts.extra });
    k.y = doc.lastAutoTable.finalY + 6;
  };
  k.L = s => ({ content: T(s), styles: { fillColor: C.TINT, textColor: C.GDD, fontStyle: 'bold' } });
  k.V = (v, f = x => x) => (v === null || v === undefined || v === '') ? { content: NC, styles: { textColor: C.RED, fontStyle: 'italic' } } : T(f(v));
  k.O = v => T(v || '—');
  k.C4 = { 0: { cellWidth: 32 }, 1: { cellWidth: 59 }, 2: { cellWidth: 32 } };
  k.photoGrid = async (list, cols = 3) => {
    const gap = 4, cw = (W - PM.l - PM.r - gap * (cols - 1)) / cols, ch = cw * 0.75; let c = 0;
    for (const [d, cap] of list) {
      if (c === 0) k.need(ch + 10);
      const x = PM.l + c * (cw + gap);
      doc.setFillColor(...C.TINT); doc.rect(x, k.y, cw, ch, 'F');
      if (d) { const m = await dims(d), s = Math.min(cw / m.w, ch / m.h), w = m.w * s, h = m.h * s; doc.addImage(d, 'JPEG', x + (cw - w) / 2, k.y + (ch - h) / 2, w, h, undefined, 'FAST'); }
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.6); doc.setTextColor(...C.MUTED); doc.text(doc.splitTextToSize(T(cap || ''), cw).slice(0, 2), x, k.y + ch + 3.6);
      c++; if (c === cols) { c = 0; k.y += ch + 10; }
    }
    if (c) k.y += ch + 10;
  };
  k.finish = () => {
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      doc.addImage(WM, 'PNG', (W - 120) / 2, (H - 121) / 2, 120, 121, 'wm', 'FAST');
      doc.addImage(LOGO, 'PNG', PM.l, 7, 19, 19.1, 'logo', 'FAST');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...C.GDD); doc.text(T(SET.company), W - PM.r, 12, { align: 'right' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...C.MUTED);
      doc.text(T([SET.hoAddress, SET.phone, SET.email, SET.web].filter(Boolean).join('  |  ')), W - PM.r, 16.5, { align: 'right' });
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...C.GD); doc.text(T(`${title}  ${docNo}`), W - PM.r, 22.5, { align: 'right' });
      doc.setDrawColor(...C.G); doc.setLineWidth(1.1); doc.line(PM.l, 29, W - PM.r, 29);
      doc.setLineWidth(0.4); doc.line(PM.l, H - 13, W - PM.r, H - 13);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...C.MUTED);
      doc.text(T(`${SET.company}  |  ${title} ${docNo}  |  generated ${fmtDT(new Date())}  |  page ${i} of ${n}`), W / 2, H - 8.5, { align: 'center' });
    }
  };
  k.title = (big, right, pill) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(19); doc.setTextColor(...C.GDD); doc.text(T(big), PM.l, k.y + 5);
    doc.setFontSize(12); doc.setTextColor(...C.INK); doc.text(T(right), W - PM.r, k.y + 5, { align: 'right' });
    if (pill) { const [txt, col] = pill; doc.setFontSize(8.5); const w = doc.getTextWidth(T(txt)) + 7; doc.setFillColor(...col); doc.roundedRect(W - PM.r - w, k.y + 8, w, 6, 3, 3, 'F'); doc.setTextColor(255); doc.text(T(txt), W - PM.r - w / 2, k.y + 12.2, { align: 'center' }); }
    k.y += 17;
  };
  return k;
}
const safe = s => T(s).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);

/* ================================================================== JOB CARD */
async function buildJobPDF(j, trip) {
  await loadAssets();
  const visit = j.kind === 'visit', DOC = visit ? 'SITE VISIT REPORT' : 'JOB CARD';
  const k = pdfBase(DOC, j.no), { doc, W } = k;
  const c = j.customer || {}, t = j.tech || {}, v = j.vehicle || {}, pr = trip && trip.prep ? trip.prep : null;
  const outCol = { 'Resolved': C.GDD, 'Partly resolved': C.AMBER, 'Follow-up required': C.RED, 'Not resolved': C.RED }[j.outcome] || C.MUTED;
  if (visit) k.title('SITE VISIT REPORT', j.no, [j.nextStep ? j.nextStep.toUpperCase() : 'SITE VISIT', C.GDD]);
  else k.title('JOB CARD — SITE CALL-OUT', j.no, [j.outcome ? j.outcome.toUpperCase() : 'OUTCOME NOT SET', outCol]);

  k.tbl([[k.L(visit ? 'Report no.' : 'Job card no.'), T(j.no), k.L('Date'), k.V(j.date, fmtD)], [k.L(visit ? 'Type' : 'Type of call-out'), visit ? T('Site visit') : k.V(j.jobType), k.L('Customer ref.'), k.O(j.ref)],
    ...(trip ? [[k.L('Pre-trip'), T(`${trip.no} · ${APPROVAL[trip.approval || 'pending'].l}${trip.apBy ? ' by ' + trip.apBy : ''}${trip.apDate ? ' · ' + fmtD(trip.apDate) : ''}`), k.L('BOM check'), T(visit ? 'n/a' : pr && pr.bomAt ? 'Completed ' + fmtDT(pr.bomAt) : '—')]] : [])], { cols: k.C4 });

  k.sect('Customer');
  k.tbl([[k.L('Customer'), k.V(c.name), k.L('Branch / site'), k.O(c.branch)],
    [k.L('Address'), k.O([c.address, c.town].filter(Boolean).join(', ')), k.L('Account no.'), k.O(c.accountNo)],
    [k.L('Contact on site'), k.O(j.siteContact), k.L('Phone'), k.O(j.sitePhone)],
    [k.L('Email'), { content: T(c.email || '—'), colSpan: 3 }]], { cols: k.C4 });

  k.sect('Technician & vehicle');
  k.tbl([[k.L('Lead technician'), k.V(t.name), k.L('Position'), k.O([t.position, j.dept || t.department].filter(Boolean).join(' · '))],
    [k.L('Employee no.'), k.O(t.empNo), k.L('Contact'), k.O([t.phone, t.email].filter(Boolean).join(' · '))],
    [k.L('Assisting'), { content: T((j.assists || []).map(a => a.name).join(', ') || '—'), colSpan: 3 }],
    [k.L('Vehicle'), k.V(v.name && `${v.name} · ${v.reg}`), k.L('Make / model'), k.O(v.make)]], { cols: k.C4 });

  k.sect('Travel');
  const km = siteKm(j), a = pd(j.arriveAt), l = pd(j.leaveAt);
  k.tbl([[k.L('Travelled from'), { content: T(j.startLabel || '—'), colSpan: 3 }],
    [k.L('Odometer at start'), k.V(num(j.odoStart), kmF), k.L('Odometer at site'), k.V(num(j.odoSite), kmF)],
    [k.L('Distance to site'), km != null ? { content: T(`${kmF(km)}  (return estimate ${kmF(km * 2)})`), styles: { fontStyle: 'bold' } } : k.V(null), k.L('Departed'), k.O(fmtDT(j.departAt))],
    [k.L('Arrived on site'), k.V(j.arriveAt, fmtDT), k.L('Left site'), k.O(fmtDT(j.leaveAt))],
    [k.L('Time on site'), T(a && l && l > a ? hrs((l - a) / 36e5) : '—'), k.L('Site GPS'), T(j.gps ? `${j.gps.lat.toFixed(5)}, ${j.gps.lng.toFixed(5)} (±${j.gps.acc} m)` : '—')]], { cols: k.C4,
    extra: { didDrawCell: d => { if (j.gps && d.section === 'body' && d.row.index === 4 && d.column.index === 3) doc.link(d.cell.x, d.cell.y, d.cell.width, d.cell.height, { url: mapURL(j.gps) }); } } });

  const eqTable = (rows, head) => k.tbl(rows.map((r, i) => [String(i + 1), T(r.name), T(r.serial || '—'), { content: T(r.qty || '1'), styles: { halign: 'center' } }]), { head: ['#', head, 'Serial no.', 'Qty'], cols: { 0: { cellWidth: 9 }, 2: { cellWidth: 50 }, 3: { cellWidth: 16 } } });
  const long = (lab, val) => [k.L(lab), { content: val ? T(val) : NC, colSpan: 3, styles: val ? {} : { textColor: C.RED, fontStyle: 'italic' } }];
  if (visit) {
    k.sect('Findings');
    const rows = [long('Purpose of the visit', (j.reason || '').trim()), long('Findings', (j.findings || '').trim()), [k.L('Recommendations'), { content: T(j.recommend || '—'), colSpan: 3 }], [k.L('Next step'), { content: T(j.nextStep || '—'), colSpan: 3, styles: { fontStyle: 'bold', textColor: C.GDD } }]];
    k.tbl(rows, { cols: { 0: { cellWidth: 32 } } });
  } else {
    const E = pr ? filled(pr.equip) : [], Tl = pr ? filled(pr.tools) : [], X = filled(j.extra);
    k.sect(`Equipment taken (${E.length})`);
    if (E.length) eqTable(E, 'Item / equipment'); else k.tbl([[{ content: pr ? 'No equipment on the trip-prep' : 'No trip-prep linked', styles: { textColor: C.MUTED, fontStyle: 'italic' } }]]);
    if (Tl.length) { k.sect(`Tools taken (${Tl.length})`); eqTable(Tl, 'Tool'); }
    if (X.length) { k.sect('Additional items now needed'); k.tbl(X.map((r, i) => [String(i + 1), T(r.name), T(r.serial || '—'), { content: T(r.qty || '1'), styles: { halign: 'center' } }, T(r.note || '')]), { head: ['#', 'Item', 'Part / serial no.', 'Qty', 'Reason / notes'], cols: { 0: { cellWidth: 9 }, 3: { cellWidth: 14 } } }); }
    k.sect('Work done');
    const rows = [long('Reason for visit', j.reason.trim()), long('Issues encountered', j.issues.trim()), long('Issues resolved / work done', j.resolved.trim())];
    if (j.followUp && j.followUp.trim()) rows.push([k.L('Follow-up needed'), { content: T(j.followUp), colSpan: 3, styles: { textColor: C.RED } }]);
    k.tbl(rows, { cols: { 0: { cellWidth: 32 } } });
  }
  if (j.notes && j.notes.trim()) { k.sect('General notes'); k.tbl([[T(j.notes)]]); }

  const ph = [];
  if (j.odoStartPh) ph.push([j.odoStartPh, `Odometer at start${num(j.odoStart) != null ? ' · ' + kmF(num(j.odoStart)) : ''}`]);
  if (j.odoSitePh) ph.push([j.odoSitePh, `Odometer at site${num(j.odoSite) != null ? ' · ' + kmF(num(j.odoSite)) : ''}`]);
  j.photos.forEach((p, i) => ph.push([p.d, `Photo ${i + 1}${p.cap ? ' — ' + p.cap : ''}`]));
  const eqPh = !visit && pr ? [...filled(pr.equip), ...filled(pr.tools)].filter(r => r.ph).map(r => [r.ph, `${r.name}${r.serial ? ' · S/N ' + r.serial : ''} × ${r.qty || 1}`]) : [];
  k.sect(`Photos (${ph.length})`);
  if (ph.length) await k.photoGrid(ph, 3); else k.tbl([[{ content: 'No photos taken', styles: { textColor: C.RED, fontStyle: 'italic' } }]]);
  if (eqPh.length) { k.sect(`Equipment & tool photos (trip-prep, ${eqPh.length})`); await k.photoGrid(eqPh, 4); }

  // sign-off: two boxes side by side
  k.need(72); k.sect('Sign-off');
  doc.setFont('helvetica', 'italic'); doc.setFontSize(8.2); doc.setTextColor(...C.MUTED);
  doc.text(T('By signing, the customer confirms that the technician attended the site and that the work described above was carried out.'), PM.l, k.y + 1); k.y += 4;
  const bw = (W - PM.l - PM.r - 6) / 2, bh = 52;
  const box = async (x, label, s, extra) => {
    doc.setDrawColor(...C.LINE); doc.setLineWidth(0.3); doc.setFillColor(255, 255, 255); doc.roundedRect(x, k.y, bw, bh, 2, 2, 'FD');
    doc.setFillColor(...C.TINT); doc.rect(x + 0.2, k.y + 0.2, bw - 0.4, 7, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...C.GDD); doc.text(T(label), x + 3, k.y + 5);
    const img = s.sig || s.photo, ax = x + 3, ay = k.y + 9, aw = bw - 6, ah = 26;
    if (img) { const m = await dims(img), sc = Math.min(aw / m.w, ah / m.h); doc.addImage(img, s.sig ? 'PNG' : 'JPEG', ax + (aw - m.w * sc) / 2, ay + (ah - m.h * sc) / 2, m.w * sc, m.h * sc, undefined, 'FAST'); }
    else { doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(...C.RED); doc.text('not signed', ax + aw / 2, ay + ah / 2, { align: 'center' }); }
    if (s.sig && s.photo) { const m = await dims(s.photo), sc = Math.min(22 / m.w, 14 / m.h); doc.addImage(s.photo, 'JPEG', x + bw - 3 - m.w * sc, ay, m.w * sc, m.h * sc, undefined, 'FAST'); }
    doc.setDrawColor(...C.MUTED); doc.line(ax, ay + ah + 1, ax + aw, ay + ah + 1);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.8); doc.setTextColor(...C.INK);
    doc.text(T(`Name: ${s.name || '—'}`), ax, ay + ah + 6); if (extra) doc.text(T(extra), ax, ay + ah + 11);
    doc.text(T(`Date: ${fmtD(s.date) || '—'}`), ax + aw, ay + ah + 6, { align: 'right' });
  };
  await box(PM.l, 'Technician', j.sign.tech, j.tech && j.tech.empNo ? `Employee no.: ${j.tech.empNo}` : '');
  await box(PM.l + bw + 6, 'Customer', j.sign.cust, j.sign.cust.designation ? `Designation: ${j.sign.cust.designation}` : '');
  k.y += bh + 6;
  const signed = custSigned(j), rt = signed && j.rating && CRATE[j.rating.k] ? j.rating : null;
  const rCol = rt ? { excellent: C.GDD, average: C.AMBER, poor: C.RED }[rt.k] : C.MUTED;
  k.tbl([...(visit ? [] : [[k.L('Outcome'), { content: T(j.outcome || NC), colSpan: 3, styles: { textColor: outCol, fontStyle: 'bold', fontSize: 10 } }]]),
    [k.L('Client rating'), { content: T(rt ? CRATE[rt.k].l : signed ? 'not rated' : 'not rated (customer did not sign)'), styles: { textColor: rCol, fontStyle: 'bold' } }, k.L('Client comments'), T(rt && rt.notes ? rt.notes : '—')]], { cols: k.C4 });

  k.finish();
  return { blob: doc.output('blob'), name: `${visit ? 'SiteVisit' : 'JobCard'}_${j.no}_${safe(c.name || 'customer')}${c.branch ? '_' + safe(c.branch) : ''}_${j.date || today()}.pdf`, title: `${visit ? 'Site visit report' : 'Job card'} ${j.no} — ${c.name ? KINDS.customers.title(c) : KIND_L[j.kind || 'callout']}` };
}

/* ================================================================== PRE-TRIP COST SUMMARY */
async function buildTripPDF(p, R, c) {
  await loadAssets();
  const k = pdfBase('PRE-TRIP COST SUMMARY', p.no), { doc } = k, D = c.D;
  const apc = { approved: C.GDD, deferred: [217, 130, 43], cancelled: C.RED }[p.approval] || C.MUTED;
  k.title('PRE-TRIP COST SUMMARY', p.no, [APPROVAL[p.approval || 'pending'].l.toUpperCase(), apc]);
  const techs = (p.techIds || []).map(id => R.T[id]).filter(Boolean);
  k.tbl([[k.L('Request'), { content: T(KIND_L[p.kind || 'callout']), styles: { fontStyle: 'bold' } }, k.L('Department'), k.O(p.dept)],
    [k.L('Approval'), { content: T(`${APPROVAL[p.approval || 'pending'].l}${p.apBy ? ' — ' + p.apBy : ''}${p.apDate ? ', ' + fmtD(p.apDate) : ''}`), styles: { textColor: apc, fontStyle: 'bold' } }, k.L(p.approval === 'deferred' ? 'Reschedule to' : 'Note'), T(p.approval === 'deferred' ? [fmtD(p.resched), p.apNote].filter(Boolean).join(' · ') || '—' : p.apNote || '—')],
    [k.L('Date'), T(fmtD(p.date)), k.L('Purpose'), k.O(p.purpose)],
    [k.L('Technician(s)'), k.V(techs.map(t => t.name).join(', ')), k.L('Vehicle'), k.V(c.v.name && `${c.v.name} · ${c.v.reg}`)]], { cols: k.C4 });
  k.sect('Route');
  k.tbl([[k.L('From'), { content: T(D.s.label), colSpan: 3 }], [k.L('To'), { content: T(D.d.label), colSpan: 3 }],
    [k.L('Distance one way'), k.V(D.km, kmF), k.L(p.round ? 'Return trip' : 'Total'), T(c.total ? kmF(c.total) : '—')],
    [k.L('Calculated'), { content: T(D.method + (D.path && D.path.length > 2 ? ` · via ${D.path.join(' > ')}` : '')), colSpan: 3 }],
    [k.L('Driving time'), T(c.total ? hrs(c.travelH) + ` @ ${SET.avgSpeed} km/h` : '—'), k.L('On site / nights'), T(`${c.onsite || 0} h on site · ${c.nights} night(s) away`)]], { cols: k.C4 });
  k.sect('Estimated cost');
  k.tbl([...c.lines.map(l => [T(l[0]), T(l[1]), { content: T(nad(l[2])), styles: { halign: 'right' } }]),
    [{ content: 'ESTIMATED TRIP COST', colSpan: 2, styles: { fontStyle: 'bold', fillColor: C.GDD, textColor: 255, fontSize: 10.5 } }, { content: T(nad(c.totalCost)), styles: { fontStyle: 'bold', fillColor: C.GDD, textColor: 255, halign: 'right', fontSize: 10.5 } }]],
    { head: ['Item', 'Basis', 'Amount'], cols: { 0: { cellWidth: 45 }, 2: { cellWidth: 34 } } });
  if (p.notes && p.notes.trim()) { k.sect('Notes'); k.tbl([[T(p.notes)]]); }
  const pe = p.prep ? filled(p.prep.equip) : [], pt = p.prep ? filled(p.prep.tools) : [];
  if (pe.length || pt.length) { k.sect(`Trip-prep (${pe.length} equipment, ${pt.length} tools)`); k.tbl([...pe.map(r => ['Equipment', T(r.name), T(r.serial || '—'), T(r.qty || '1')]), ...pt.map(r => ['Tool', T(r.name), T(r.serial || '—'), T(r.qty || '1')])], { head: ['', 'Item', 'Serial no.', 'Qty'], cols: { 0: { cellWidth: 22 }, 2: { cellWidth: 45 }, 3: { cellWidth: 14 } } }); }
  doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(...C.MUTED);
  doc.text(T('Estimate only, based on the rates in the app settings. Actual travel is recorded on the job card (odometer readings) and fuel receipts.'), PM.l, k.y); k.y += 12;
  k.need(24);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...C.INK); doc.setDrawColor(...C.MUTED); doc.setLineWidth(0.3);
  doc.text('Prepared by:', PM.l, k.y + 8); doc.line(PM.l + 22, k.y + 8, PM.l + 85, k.y + 8);
  doc.text('Approved by:', PM.l + 98, k.y + 8); doc.line(PM.l + 120, k.y + 8, k.W - PM.r, k.y + 8);
  doc.setFontSize(7.5); doc.setTextColor(...C.MUTED); doc.text('Name, signature, date', PM.l + 22, k.y + 12); doc.text('Name, signature, date', PM.l + 120, k.y + 12);
  k.finish();
  return { blob: doc.output('blob'), name: `PreTrip_${p.no}_${safe(D.d.label)}_${p.date}.pdf`, title: `Pre-trip cost summary ${p.no} — ${D.d.label}` };
}
