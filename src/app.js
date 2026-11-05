'use strict';
/* UI wiring for the Spain Mortgage Simulator. All state lives in three scenario
 * slots (A/B/C), mirrored into the URL hash so a setup can be shared as a link. */
(function () {
  const M = MortgageCore;
  const DATA = window.EURIBOR.data;
  const PROVISIONAL = new Set(window.EURIBOR.provisional || []);
  const $ = (id) => document.getElementById(id);
  const eur = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const eur2 = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct = new Intl.NumberFormat('en-IE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const num = (id) => parseFloat($(id).value) || 0;
  const latest = M.euriborLatest(DATA);

  const DEFAULTS = {
    price: 300000, region: 'cataluna', isNew: false, down: 60000,
    principalManual: false, principal: 240000, years: 25, opening: 0,
    rateType: 'fixed', tin: 2.9, initialTin: 2.4, initialYears: 3,
    spread: 0.9, review: 12,
    euriborMode: 'latest', euriborPick: latest[0], euriborManual: latest[1],
    assumption: 'constant', historyFrom: '2005-01', shock: 2,
    extras: [], income: 0,
    taxOverride: null, ajdOverride: null, notary: null, registry: null, gestoria: 350, appraisal: 400,
  };

  const slots = [structuredClone(DEFAULTS), structuredClone(DEFAULTS), structuredClone(DEFAULTS)];
  slots[1].rateType = 'variable';
  slots[1].assumption = 'constant';
  slots[2].rateType = 'variable';
  slots[2].assumption = 'shock';
  let active = 0;
  let compareMode = false;
  let monthlyView = false;

  // --- persistence ----------------------------------------------------------
  function saveHash() {
    const payload = { v: 1, active, slots };
    const s = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    history.replaceState(null, '', '#' + s);
  }
  function loadHash() {
    if (!location.hash || location.hash.length < 8) return;
    try {
      const payload = JSON.parse(decodeURIComponent(escape(atob(location.hash.slice(1)))));
      if (payload && Array.isArray(payload.slots) && payload.slots.length === 3) {
        payload.slots.forEach((s, i) => { slots[i] = Object.assign(structuredClone(DEFAULTS), s); });
        active = Math.min(2, Math.max(0, payload.active | 0));
      }
    } catch (e) { /* ignore corrupt hashes */ }
  }

  // --- input <-> state -------------------------------------------------------
  function pushStateToInputs() {
    const s = slots[active];
    $('price').value = s.price;
    $('region').value = s.region;
    $('type-resale').classList.toggle('is-on', !s.isNew);
    $('type-new').classList.toggle('is-on', s.isNew);
    $('down').value = s.down;
    $('principal').value = s.principal;
    $('years').value = s.years;
    $('opening').value = s.opening;
    $('rate-fixed').classList.toggle('is-on', s.rateType === 'fixed');
    $('rate-variable').classList.toggle('is-on', s.rateType === 'variable');
    $('rate-mixed').classList.toggle('is-on', s.rateType === 'mixed');
    $('tin').value = s.tin;
    $('initial-tin').value = s.initialTin;
    $('initial-years').value = s.initialYears;
    $('spread').value = s.spread;
    $('review').value = String(s.review);
    $('euribor-mode').value = s.euriborMode;
    $('euribor-pick').value = s.euriborPick;
    $('euribor-manual').value = s.euriborManual;
    $('euribor-assumption').value = s.assumption;
    $('history-from').value = s.historyFrom;
    $('shock').value = s.shock;
    $('income').value = s.income || 0;
    $('tax-override').value = s.taxOverride == null ? '' : s.taxOverride;
    $('ajd-override').value = s.ajdOverride == null ? '' : s.ajdOverride;
    $('notary-override').value = s.notary == null ? '' : s.notary;
    $('registry-override').value = s.registry == null ? '' : s.registry;
    $('gestoria-override').value = s.gestoria;
    $('appraisal-override').value = s.appraisal;
    syncVisibility();
    renderExtras();
    document.querySelectorAll('.stab[data-slot]').forEach((b) => {
      b.classList.toggle('is-on', !compareMode && parseInt(b.dataset.slot, 10) === active);
    });
    $('compare').classList.toggle('is-on', compareMode);
  }

  function pullInputsToState() {
    const s = slots[active];
    const autoPrincipal = Math.max(0, s.price - s.down);
    if (document.activeElement === $('principal')) s.principalManual = true;
    if (document.activeElement === $('price') || document.activeElement === $('down')) s.principalManual = false;
    s.price = num('price');
    s.region = $('region').value;
    s.down = num('down');
    s.years = Math.min(40, Math.max(1, num('years') || 25));
    s.opening = num('opening');
    s.tin = num('tin');
    s.initialTin = num('initial-tin');
    s.initialYears = num('initial-years');
    s.spread = num('spread');
    s.review = parseInt($('review').value, 10);
    s.euriborMode = $('euribor-mode').value;
    s.euriborPick = $('euribor-pick').value || latest[0];
    s.euriborManual = num('euribor-manual');
    s.assumption = $('euribor-assumption').value;
    s.historyFrom = $('history-from').value || '2005-01';
    s.shock = num('shock');
    s.income = num('income');
    s.taxOverride = $('tax-override').value === '' ? null : num('tax-override');
    s.ajdOverride = $('ajd-override').value === '' ? null : num('ajd-override');
    s.notary = $('notary-override').value === '' ? null : num('notary-override');
    s.registry = $('registry-override').value === '' ? null : num('registry-override');
    s.gestoria = num('gestoria-override');
    s.appraisal = num('appraisal-override');
    if (!s.principalManual) {
      s.principal = Math.max(0, s.price - s.down);
      $('principal').value = s.principal;
    } else {
      s.principal = num('principal');
    }
    saveHash();
  }

  function syncVisibility() {
    const s = slots[active];
    const variable = s.rateType !== 'fixed';
    $('variable-fields').hidden = !variable;
    $('row-fixed').hidden = variable;
    $('row-initial').hidden = s.rateType !== 'mixed';
    $('row-initial-years').hidden = s.rateType !== 'mixed';
    $('row-euribor-pick').hidden = s.euriborMode !== 'pick';
    $('row-euribor-manual').hidden = s.euriborMode !== 'manual';
    $('row-history-from').hidden = s.assumption !== 'history';
    $('row-shock').hidden = s.assumption !== 'shock';
    $('row-ajd').hidden = !s.isNew;
    $('tax-label').textContent = s.isNew ? 'VAT / IGIC / IPSI rate' : 'ITP rate';
    const pickMin = DATA[0][0], pickMax = latest[0];
    $('euribor-pick').min = pickMin; $('euribor-pick').max = pickMax;
    $('history-from').min = pickMin; $('history-from').max = pickMax;
  }

  // --- computation -----------------------------------------------------------
  function euriborStart(s) {
    if (s.euriborMode === 'manual') return { ym: 'manual', value: s.euriborManual };
    if (s.euriborMode === 'pick') {
      const v = M.euriborAt(DATA, s.euriborPick);
      return { ym: s.euriborPick, value: v == null ? latest[1] : v };
    }
    return { ym: latest[0], value: latest[1] };
  }

  function compute(s) {
    const months = s.years * 12;
    const region = M.REGIONS.find((r) => r.id === s.region) || M.REGIONS[0];
    const costs = M.purchaseCosts({
      price: s.price, region, isNewBuild: s.isNew, withMortgage: true,
      taxRateOverride: s.taxOverride, ajdRateOverride: s.ajdOverride,
      notary: s.notary, registry: s.registry, gestoria: s.gestoria, appraisal: s.appraisal,
    });
    let ratePath;
    const start = euriborStart(s);
    if (s.rateType === 'fixed') {
      ratePath = M.buildRatePath({ months, type: 'fixed', fixedTin: s.tin });
    } else {
      const assumption = { mode: s.assumption, value: start.value, startYm: s.historyFrom, shock: s.shock };
      const ePath = M.euriborPath(DATA, months, assumption);
      ratePath = M.buildRatePath({
        months, type: 'variable', spread: s.spread, reviewEvery: s.review,
        initialFixedMonths: s.rateType === 'mixed' ? Math.round(s.initialYears * 12) : 0,
        initialTin: s.initialTin, euriborPath: ePath,
      });
    }
    const extras = s.extras.map((e) => ({ month: Math.min(e.year * 12, months), amount: e.amount, mode: e.mode }));
    const sched = M.buildSchedule({ principal: s.principal, months, ratePath, extras });
    const openingFee = (s.principal * s.opening) / 100;
    const upfront = s.down + costs.total + openingFee;
    const ltv = s.price > 0 ? (s.principal / s.price) * 100 : 0;
    const firstPayment = sched.rows.length ? sched.rows[0].payment : 0;
    const effort = s.income > 0 ? (firstPayment / s.income) * 100 : null;
    return { months, region, costs, ratePath, sched, openingFee, upfront, ltv, firstPayment, effort, start };
  }

  // --- rendering -------------------------------------------------------------
  function tile(cls, k, v, sub) {
    return `<div class="tile ${cls}"><div class="k">${k}</div><div class="v">${v}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>`;
  }

  function renderTiles(s, r) {
    const t = [];
    let effortCls = '';
    if (r.effort != null) effortCls = r.effort <= 30 ? 'good' : r.effort <= 35 ? 'warn' : 'bad';
    const paySub = [];
    if (s.rateType !== 'fixed') {
      const y5 = r.sched.rows[Math.min(60, r.sched.rows.length - 1)];
      if (y5 && Math.abs(y5.payment - r.firstPayment) >= 1) paySub.push(`${eur2.format(y5.payment)} in year 5`);
    }
    if (r.effort != null) paySub.push(`${pct.format(r.effort)}% of income`);
    t.push(tile('hero ' + effortCls, 'Monthly payment', eur2.format(r.firstPayment), paySub.join(' · ')));
    t.push(tile('', 'Cash needed upfront', eur.format(r.upfront),
      `down payment + ${eur.format(r.costs.total)} costs${r.openingFee ? ` + ${eur.format(r.openingFee)} opening fee` : ''}`));
    t.push(tile('', 'Total interest', eur.format(r.sched.totals.interest),
      r.sched.totals.extra ? `with ${eur.format(r.sched.totals.extra)} early repayments` : `over ${r.sched.totals.months} months`));
    const costPerEuro = s.principal > 0 ? r.sched.totals.paid / s.principal : 0;
    t.push(tile('', 'Total paid on the loan', eur.format(r.sched.totals.paid),
      `${eur2.format(costPerEuro)} per euro borrowed${r.sched.totals.extra ? ' · includes early repayments' : ''}`));
    t.push(tile('', 'LTV', pct.format(r.ltv) + '%', r.ltv > 80 ? 'above the usual 80% resident cap' : r.ltv > 60 ? 'typical range' : 'comfortable'));
    t.push(tile('', 'Payoff', `${Math.ceil(r.sched.totals.months / 12)}y ${r.sched.totals.months % 12}m`,
      r.sched.totals.months < r.months ? `saves ${r.months - r.sched.totals.months} months` : `of ${s.years} years`));
    $('tiles').innerHTML = t.join('');
    const hint = $('ltv-hint');
    if (s.price > 0) {
      hint.textContent = r.ltv > 80
        ? `LTV ${pct.format(r.ltv)}%. Resident buyers usually get at most 80% of the lower of price or appraisal.`
        : `LTV ${pct.format(r.ltv)}%.`;
      hint.classList.toggle('warn', r.ltv > 80);
    } else hint.textContent = '';
  }

  function drawBalanceChart(r) {
    const cv = $('chart-balance');
    const rows = r.sched.rows;
    if (!rows.length) return;
    const dpr = window.devicePixelRatio || 1;
    const W = cv.clientWidth || cv.parentElement.clientWidth - 32, H = 220;
    cv.width = W * dpr; cv.height = H * dpr;
    cv.style.height = H + 'px';
    const ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);
    const padR = 10, padT = 12, padB = 24;
    const maxBal = Math.max(...rows.map((x) => x.balance));
    let cumI = 0;
    const cumInterest = rows.map((x) => (cumI += x.interest + x.extra));
    const maxY = Math.max(maxBal, ...cumInterest);
    ctx.font = '11px system-ui';
    const padL = Math.ceil(ctx.measureText(eur.format(maxY)).width) + 14;
    const w = W - padL - padR, h = H - padT - padB;
    const x = (i) => padL + (i / Math.max(1, rows.length - 1)) * w;
    const y = (v) => padT + h - (v / maxY) * h;
    // gridlines
    ctx.strokeStyle = '#eceadf'; ctx.fillStyle = '#8a929b'; ctx.font = '11px system-ui';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let g = 0; g <= 4; g++) {
      const gv = (maxY * g) / 4;
      ctx.beginPath(); ctx.moveTo(padL, y(gv)); ctx.lineTo(W - padR, y(gv)); ctx.stroke();
      ctx.fillText(eur.format(gv), padL - 8, y(gv));
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const years = Math.ceil(rows.length / 12);
    for (let yy = 0; yy <= years; yy += Math.max(1, Math.round(years / 8))) {
      const i = Math.min(rows.length - 1, yy * 12);
      ctx.fillText(yy + 'y', x(i), padT + h + 6);
    }
    // cumulative interest area
    ctx.beginPath();
    ctx.moveTo(x(0), y(0));
    cumInterest.forEach((v, i) => ctx.lineTo(x(i), y(v)));
    ctx.lineTo(x(rows.length - 1), y(cumInterest[cumInterest.length - 1]));
    ctx.strokeStyle = '#e8590c'; ctx.lineWidth = 2; ctx.stroke();
    ctx.lineTo(x(rows.length - 1), y(0)); ctx.closePath();
    ctx.fillStyle = 'rgba(232,89,12,.09)'; ctx.fill();
    // balance line
    ctx.beginPath();
    rows.forEach((row, i) => (i ? ctx.lineTo(x(i), y(row.balance)) : ctx.moveTo(x(i), y(row.balance))));
    ctx.strokeStyle = '#1d4ed8'; ctx.lineWidth = 2.4; ctx.stroke();
    // legend
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#1d4ed8'; ctx.fillRect(padL + 6, padT + 6, 14, 3);
    ctx.fillStyle = '#1c2127'; ctx.fillText('Balance', padL + 26, padT + 12);
    ctx.fillStyle = '#e8590c'; ctx.fillRect(padL + 92, padT + 6, 14, 3);
    ctx.fillStyle = '#1c2127'; ctx.fillText('Interest + extras paid', padL + 112, padT + 12);
  }

  function drawRateChart(s, r) {
    const show = s.rateType !== 'fixed';
    $('rate-card').hidden = !show;
    if (!show) return;
    const cv = $('chart-rate');
    const rows = r.sched.rows;
    const dpr = window.devicePixelRatio || 1;
    const W = cv.clientWidth || cv.parentElement.clientWidth - 32, H = 140;
    cv.width = W * dpr; cv.height = H * dpr;
    cv.style.height = H + 'px';
    const ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);
    const padR = 10, padT = 10, padB = 24;
    const rates = rows.map((x) => x.rate);
    const minR = Math.min(...rates, 0), maxR = Math.max(...rates, 0.5);
    const span = Math.max(0.5, maxR - minR);
    ctx.font = '11px system-ui';
    const padL = Math.ceil(ctx.measureText(pct.format(maxR) + '%').width) + 12;
    const w = W - padL - padR, h = H - padT - padB;
    const x = (i) => padL + (i / Math.max(1, rows.length - 1)) * w;
    const y = (v) => padT + h - ((v - minR) / span) * h;
    ctx.strokeStyle = '#eceadf'; ctx.fillStyle = '#8a929b'; ctx.font = '11px system-ui';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let g = 0; g <= 3; g++) {
      const gv = minR + (span * g) / 3;
      ctx.beginPath(); ctx.moveTo(padL, y(gv)); ctx.lineTo(W - padR, y(gv)); ctx.stroke();
      ctx.fillText(pct.format(gv) + '%', padL - 6, y(gv));
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const years = Math.ceil(rows.length / 12);
    for (let yy = 0; yy <= years; yy += Math.max(1, Math.round(years / 8))) {
      ctx.fillText(yy + 'y', x(Math.min(rows.length - 1, yy * 12)), padT + h + 6);
    }
    ctx.beginPath();
    rates.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))));
    ctx.strokeStyle = '#1d4ed8'; ctx.lineWidth = 2; ctx.stroke();
  }

  function renderCosts(s, r) {
    const c = r.costs;
    const rows = [
      [`${c.taxName} (${pct.format(c.taxRate)}%${s.isNew ? ' combined' : ''})`, c.tax],
      ['Notary (purchase deed)', c.notary],
      ['Property registry', c.registry],
      ['Gestoría', c.gestoria],
      ['Appraisal', c.appraisal],
    ];
    let html = '<thead><tr><th class="l">Item</th><th>Amount</th></tr></thead><tbody>';
    for (const [k, v] of rows) html += `<tr><td class="l">${k}</td><td>${eur.format(v)}</td></tr>`;
    html += `</tbody><tfoot><tr><td class="l">Total purchase costs</td><td>${eur.format(c.total)}</td></tr>`;
    if (r.openingFee) html += `<tr><td class="l">Opening commission (${pct.format(s.opening)}%)</td><td>${eur.format(r.openingFee)}</td></tr>`;
    html += `<tr><td class="l">Cash needed upfront (with down payment)</td><td>${eur.format(r.upfront)}</td></tr></tfoot>`;
    $('costs-table').innerHTML = html;
    $('costs-note').textContent = `${r.region.name} · general 2026 rates, reduced rates not modeled`;
  }

  function renderSchedule(s, r) {
    const rows = r.sched.rows;
    const extraMonths = new Map();
    for (const row of rows) if (row.extra > 0) extraMonths.set(row.month, row.extra);
    let html;
    if (monthlyView) {
      html = '<thead><tr><th>Month</th><th>Rate</th><th>Payment</th><th>Interest</th><th>Principal</th><th>Extra</th><th>Balance</th></tr></thead><tbody>';
      for (const row of rows) {
        html += `<tr${row.extra ? ' class="extra-row"' : ''}><td>${row.month}</td><td>${pct.format(row.rate)}%</td><td>${eur2.format(row.payment)}</td><td>${eur2.format(row.interest)}</td><td>${eur2.format(row.principal)}</td><td>${row.extra ? eur.format(row.extra) : ''}</td><td>${eur.format(row.balance)}</td></tr>`;
      }
      html += '</tbody>';
    } else {
      html = '<thead><tr><th>Year</th><th>Avg rate</th><th>Paid</th><th>Interest</th><th>Principal</th><th>Extra</th><th>Balance</th></tr></thead><tbody>';
      for (let y = 0; y * 12 < rows.length; y++) {
        const chunk = rows.slice(y * 12, (y + 1) * 12);
        const paid = chunk.reduce((a, x) => a + x.payment, 0);
        const interest = chunk.reduce((a, x) => a + x.interest, 0);
        const principal = chunk.reduce((a, x) => a + x.principal, 0);
        const extra = chunk.reduce((a, x) => a + x.extra, 0);
        const avgRate = chunk.reduce((a, x) => a + x.rate, 0) / chunk.length;
        const endBal = chunk[chunk.length - 1].balance;
        html += `<tr${extra ? ' class="extra-row"' : ''}><td>${y + 1}</td><td>${pct.format(avgRate)}%</td><td>${eur.format(paid)}</td><td>${eur.format(interest)}</td><td>${eur.format(principal)}</td><td>${extra ? eur.format(extra) : ''}</td><td>${eur.format(endBal)}</td></tr>`;
      }
      html += '</tbody>';
    }
    $('schedule-table').innerHTML = html;
  }

  function downloadCsv(r) {
    let csv = 'month,rate_pct,payment,interest,principal,extra,balance\n';
    for (const row of r.sched.rows) {
      csv += `${row.month},${row.rate},${row.payment},${row.interest},${row.principal},${row.extra},${row.balance}\n`;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'amortization-schedule.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function renderEuriborBox(s) {
    const el = $('euribor-current');
    const prov = PROVISIONAL.has(latest[0]);
    el.innerHTML = `${pct.format(latest[1])}% <span style="font-size:12px;color:var(--muted);font-weight:600;white-space:nowrap">${latest[0]}</span>${prov ? '<span class="prov">provisional</span>' : ''}`;
    const start = euriborStart(s);
    const notes = [];
    if (s.euriborMode === 'pick') notes.push(`starting from ${pct.format(start.value)}% (${start.ym}${PROVISIONAL.has(start.ym) ? ', provisional' : ''})`);
    if (s.euriborMode === 'manual') notes.push(`manual start value ${pct.format(start.value)}%`);
    if (s.assumption === 'history') {
      const from = M.euriborAt(DATA, s.historyFrom) != null ? s.historyFrom : latest[0];
      notes.push(`replaying real Euribor month by month from ${from}; past the last official month it holds ${pct.format(latest[1])}%`);
    }
    if (s.assumption === 'shock') notes.push(`constant Euribor of ${pct.format(start.value + s.shock)}% after the shock`);
    notes.push(`series ${window.EURIBOR.series} (Banco de España), retrieved ${window.EURIBOR.retrieved}`);
    $('euribor-note').textContent = notes.join('. ') + '.';
  }

  function renderExtras() {
    const s = slots[active];
    const box = $('extras');
    box.innerHTML = s.extras.map((e, i) =>
      `<div class="extra-item"><span>Year ${e.year} · ${eur.format(e.amount)} · ${e.mode === 'reduce-term' ? 'cut the term' : 'cut the payment'}</span><button data-i="${i}" title="Remove">&times;</button></div>`
    ).join('');
    box.querySelectorAll('button').forEach((b) => {
      b.onclick = () => { slots[active].extras.splice(parseInt(b.dataset.i, 10), 1); saveHash(); renderExtras(); update(); };
    });
  }

  function renderCompare() {
    $('compare-card').hidden = !compareMode;
    if (!compareMode) return;
    const names = ['A', 'B', 'C'];
    const results = slots.map(compute);
    const metric = (label, fn, fmt) =>
      `<tr><td class="l">${label}</td>${results.map((r, i) => `<td>${fmt(fn(r, slots[i]))}</td>`).join('')}</tr>`;
    let html = `<thead><tr><th class="l"></th>${names.map((n) => `<th>${n}</th>`).join('')}</tr></thead><tbody>`;
    html += metric('Type', (r, s) => s, (s) => s.rateType === 'fixed' ? `Fixed ${pct.format(s.tin)}%` : s.rateType === 'mixed' ? `Mixed ${s.initialYears}y, then +${pct.format(s.spread)}%` : `Euribor +${pct.format(s.spread)}%`);
    html += metric('Loan', (r, s) => s.principal, (v) => eur.format(v));
    html += metric('First payment', (r) => r.firstPayment, (v) => eur2.format(v));
    html += metric('Payment in year 5', (r) => r.sched.rows[Math.min(60, r.sched.rows.length - 1)].payment, (v) => eur2.format(v));
    html += metric('Highest payment', (r) => Math.max(...r.sched.rows.map((x) => x.payment)), (v) => eur2.format(v));
    html += metric('Total interest', (r) => r.sched.totals.interest, (v) => eur.format(v));
    html += metric('Total cost of loan', (r) => r.sched.totals.paid, (v) => eur.format(v));
    html += metric('Purchase costs', (r) => r.costs.total, (v) => eur.format(v));
    html += metric('Cash needed upfront', (r) => r.upfront, (v) => eur.format(v));
    html += metric('Payoff', (r) => r.sched.totals.months, (v) => `${Math.ceil(v / 12)}y ${v % 12}m`);
    html += '</tbody>';
    $('compare-table').innerHTML = html;
  }

  function update() {
    pullInputsToState();
    const s = slots[active];
    const r = compute(s);
    renderTiles(s, r);
    drawBalanceChart(r);
    drawRateChart(s, r);
    renderCosts(s, r);
    renderSchedule(s, r);
    renderEuriborBox(s);
    renderCompare();
  }

  // --- events ----------------------------------------------------------------
  function onInput() { update(); }

  function init() {
    loadHash();
    const sel = $('region');
    sel.innerHTML = M.REGIONS.map((r) => `<option value="${r.id}">${r.name}</option>`).join('');
    $('series-code').textContent = window.EURIBOR.series;
    document.querySelectorAll('.series-code').forEach((el) => (el.textContent = window.EURIBOR.series));
    pushStateToInputs();

    document.querySelectorAll('input, select').forEach((el) => {
      if (el.id === 'extra-year' || el.id === 'extra-amount' || el.id === 'extra-mode') return;
      el.addEventListener('input', onInput);
      el.addEventListener('change', onInput);
    });

    const setType = (isNew) => { slots[active].isNew = isNew; $('type-resale').classList.toggle('is-on', !isNew); $('type-new').classList.toggle('is-on', isNew); saveHash(); syncVisibility(); update(); };
    $('type-resale').onclick = () => setType(false);
    $('type-new').onclick = () => setType(true);

    const setRate = (t) => { slots[active].rateType = t; pushStateToInputs(); update(); };
    $('rate-fixed').onclick = () => setRate('fixed');
    $('rate-variable').onclick = () => setRate('variable');
    $('rate-mixed').onclick = () => setRate('mixed');

    $('extra-add').onclick = () => {
      const year = parseInt($('extra-year').value, 10);
      const amount = parseFloat($('extra-amount').value);
      if (!year || !(amount > 0)) return;
      slots[active].extras.push({ year, amount, mode: $('extra-mode').value });
      slots[active].extras.sort((a, b) => a.year - b.year);
      $('extra-year').value = ''; $('extra-amount').value = '';
      saveHash(); renderExtras(); update();
    };

    document.querySelectorAll('.stab[data-slot]').forEach((b) => {
      b.onclick = () => {
        active = parseInt(b.dataset.slot, 10);
        compareMode = false;
        document.querySelectorAll('.stab').forEach((x) => x.classList.remove('is-on'));
        b.classList.add('is-on');
        pushStateToInputs(); saveHash(); update();
      };
    });
    $('compare').onclick = () => {
      compareMode = !compareMode;
      document.querySelectorAll('.stab').forEach((x) => x.classList.remove('is-on'));
      $('compare').classList.toggle('is-on', compareMode);
      if (!compareMode) document.querySelector(`.stab[data-slot="${active}"]`).classList.add('is-on');
      renderCompare();
    };

    $('view-toggle').onclick = () => {
      monthlyView = !monthlyView;
      $('view-toggle').textContent = monthlyView ? 'Show yearly' : 'Show monthly';
      renderSchedule(slots[active], compute(slots[active]));
    };
    $('csv').onclick = () => downloadCsv(compute(slots[active]));
    $('share').onclick = async () => {
      try {
        await navigator.clipboard.writeText(location.href);
        $('share').textContent = 'Link copied';
        setTimeout(() => ($('share').textContent = 'Copy link'), 1600);
      } catch (e) {
        prompt('Copy this link:', location.href);
      }
    };
    window.addEventListener('resize', () => { const s = slots[active]; const r = compute(s); drawBalanceChart(r); drawRateChart(s, r); });
    update();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
