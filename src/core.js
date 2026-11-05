/* Core mortgage math for Spain: French amortization, variable rates on Euribor,
 * early repayments, purchase taxes and fees. No DOM access; used by the page and the tests. */
(function (root, factory) {
  const M = factory();
  if (typeof module === 'object' && module.exports) module.exports = M;
  root.MortgageCore = M;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

  // Constant-payment (French system) monthly installment.
  function monthlyPayment(principal, annualRatePct, months) {
    if (months <= 0) return principal > 0 ? Infinity : 0;
    if (principal <= 0) return 0;
    const r = annualRatePct / 1200;
    if (Math.abs(r) < 1e-12) return principal / months;
    return (principal * r) / (1 - Math.pow(1 + r, -months));
  }

  // Months needed to amortize `principal` paying `payment` per month at the given rate.
  function monthsToPayOff(principal, payment, annualRatePct) {
    if (principal <= 0) return 0;
    const r = annualRatePct / 1200;
    if (payment <= 0) return Infinity;
    if (Math.abs(r) < 1e-12) return Math.ceil(principal / payment);
    if (payment <= principal * r) return Infinity; // does not amortize
    return Math.ceil(-Math.log(1 - (principal * r) / payment) / Math.log(1 + r));
  }

  // Build the month-by-month annual TIN (%) path for the loan.
  // cfg: { months, type: 'fixed'|'variable', fixedTin, spread, reviewEvery (months),
  //        initialFixedMonths, initialTin, euriborPath }.
  // euriborPath is an array of monthly Euribor values (%) aligned to simulation months.
  function buildRatePath(cfg) {
    const n = cfg.months;
    const path = new Array(n);
    if (cfg.type === 'fixed') {
      path.fill(cfg.fixedTin);
      return path;
    }
    const review = Math.max(1, cfg.reviewEvery || 12);
    const warm = Math.max(0, cfg.initialFixedMonths || 0);
    for (let m = 0; m < n; m++) {
      if (m < warm) {
        path[m] = cfg.initialTin;
      } else {
        const anchor = warm + Math.floor((m - warm) / review) * review;
        const e = cfg.euriborPath[Math.min(anchor, cfg.euriborPath.length - 1)];
        path[m] = round2((e == null ? 0 : e) + (cfg.spread || 0));
      }
    }
    return path;
  }

  // Full amortization schedule with optional early repayments.
  // extras: [{ month (1-based), amount, mode: 'reduce-payment' | 'reduce-term' }]
  // Rate revisions and 'reduce-payment' extras recast the installment over the
  // remaining term, as Spanish lenders do. 'reduce-term' extras keep the installment.
  function buildSchedule({ principal, months, ratePath, extras = [] }) {
    if (!(principal > 0) || !(months > 0)) {
      return { rows: [], totals: { paid: 0, interest: 0, principal: 0, extra: 0, months: 0 }, finalPayment: 0 };
    }
    const extraByMonth = new Map();
    for (const e of extras) {
      if (!extraByMonth.has(e.month)) extraByMonth.set(e.month, []);
      extraByMonth.get(e.month).push(e);
    }

    let balance = principal;
    let rate = ratePath[0];
    let remaining = months;
    let payment = monthlyPayment(balance, rate, remaining);
    const rows = [];
    let totalInterest = 0;
    let totalPaid = 0;
    let totalPrincipal = 0;
    let totalExtra = 0;
    let m = 1;
    const maxIter = months * 3 + 1200; // safety net, never expected

    while (balance > 0.005 && remaining > 0 && m <= maxIter) {
      const newRate = ratePath[Math.min(m - 1, ratePath.length - 1)];
      if (m > 1 && Math.abs(newRate - rate) > 1e-12) {
        rate = newRate;
        payment = monthlyPayment(balance, rate, remaining);
      }
      const interest = balance * (rate / 1200);
      let principalPaid = payment - interest;
      if (principalPaid <= 0) {
        // Negative-amortization guard: hold the balance, pay only interest.
        principalPaid = 0;
        payment = interest;
      }
      if (principalPaid > balance) {
        principalPaid = balance;
        payment = interest + principalPaid;
      }
      balance -= principalPaid;
      remaining -= 1;
      // The installment actually charged this month. A 'reduce-payment' extra
      // recasts the installment below, but only from the NEXT month on.
      const chargedPayment = payment;

      let extraAmount = 0;
      const monthExtras = extraByMonth.get(m);
      if (monthExtras) {
        for (const e of monthExtras) {
          const amt = Math.min(Math.max(0, e.amount), balance);
          if (amt <= 0) continue;
          extraAmount += amt;
          balance -= amt;
          if (balance <= 0.005) break;
          if (e.mode === 'reduce-term') {
            remaining = Math.min(remaining, monthsToPayOff(balance, payment, rate));
          } else {
            payment = monthlyPayment(balance, rate, remaining);
          }
        }
      }

      totalInterest += interest;
      totalPrincipal += principalPaid;
      totalExtra += extraAmount;
      totalPaid += chargedPayment + extraAmount;
      rows.push({
        month: m,
        rate: round2(rate),
        payment: round2(chargedPayment),
        interest: round2(interest),
        principal: round2(principalPaid),
        extra: round2(extraAmount),
        balance: round2(Math.max(0, balance)),
      });
      m += 1;
    }

    return {
      rows,
      totals: {
        paid: round2(totalPaid),
        interest: round2(totalInterest),
        principal: round2(totalPrincipal),
        extra: round2(totalExtra),
        months: rows.length,
      },
      finalPayment: rows.length ? rows[rows.length - 1].payment : 0,
    };
  }

  // --- Purchase taxes and fees (Spain) -------------------------------------
  // General 2026 rates for resale homes (ITP) and new builds (IVA/IGIC/IPSI + AJD).
  // Reduced rates (young buyers, large families, VPO, disability...) are NOT modeled.
  // Sources listed in README; every rate is editable in the UI.

  const REGIONS = [
    { id: 'andalucia',   name: 'Andalucía',              itp: { type: 'flat', rate: 7 },  ajd: 1.2 },
    { id: 'aragon',      name: 'Aragón',                 itp: { type: 'marginal', brackets: [[400000, 8], [450000, 8.5], [500000, 9], [750000, 9.5], [Infinity, 10]] }, ajd: 1.5 },
    { id: 'asturias',    name: 'Asturias',               itp: { type: 'tiered', brackets: [[300000, 8], [500000, 9], [Infinity, 10]] }, ajd: 1.2 },
    { id: 'baleares',    name: 'Illes Balears',          itp: { type: 'marginal', brackets: [[400000, 8], [600000, 9], [1000000, 10], [2000000, 12], [Infinity, 13]] }, ajd: 1.5 },
    { id: 'canarias',    name: 'Canarias',               itp: { type: 'flat', rate: 6.5 }, ajd: 1.0, newBuild: { name: 'IGIC', rate: 7 } },
    { id: 'cantabria',   name: 'Cantabria',              itp: { type: 'flat', rate: 9 },  ajd: 1.5 },
    { id: 'clm',         name: 'Castilla-La Mancha',     itp: { type: 'flat', rate: 9 },  ajd: 1.5 },
    { id: 'cyl',         name: 'Castilla y León',        itp: { type: 'tiered', brackets: [[250000, 8], [Infinity, 10]] }, ajd: 1.5 },
    { id: 'cataluna',    name: 'Cataluña',               itp: { type: 'marginal', brackets: [[600000, 10], [900000, 11], [1500000, 12], [Infinity, 13]] }, ajd: 1.5 },
    { id: 'ceuta-melilla', name: 'Ceuta y Melilla',      itp: { type: 'flat', rate: 6 },  ajd: 0.5, newBuild: { name: 'IPSI', rate: 0.5 } },
    { id: 'valenciana',  name: 'Comunitat Valenciana',   itp: { type: 'tiered', brackets: [[1000000, 9], [Infinity, 11]] }, ajd: 1.4 },
    { id: 'extremadura', name: 'Extremadura',            itp: { type: 'marginal', brackets: [[360000, 8], [600000, 10], [Infinity, 11]] }, ajd: 1.5 },
    { id: 'galicia',     name: 'Galicia',                itp: { type: 'flat', rate: 8 },  ajd: 1.5 },
    { id: 'madrid',      name: 'Comunidad de Madrid',    itp: { type: 'flat', rate: 6 },  ajd: 0.75, ajdTiers: [[120000, 0.4], [180000, 0.5], [Infinity, 0.75]] },
    { id: 'murcia',      name: 'Región de Murcia',       itp: { type: 'flat', rate: 8 },  ajd: 1.5 },
    { id: 'navarra',     name: 'Navarra',                itp: { type: 'flat', rate: 6 },  ajd: 0.5 },
    { id: 'pais-vasco',  name: 'País Vasco',             itp: { type: 'flat', rate: 4 },  ajd: 0.5 },
    { id: 'rioja',       name: 'La Rioja',               itp: { type: 'flat', rate: 7 },  ajd: 1.0 },
  ];

  function marginalTax(base, brackets) {
    let tax = 0;
    let lower = 0;
    for (const [cap, rate] of brackets) {
      if (base <= lower) break;
      const taxable = Math.min(base, cap) - lower;
      tax += (taxable * rate) / 100;
      lower = cap;
    }
    return tax;
  }

  function itpAmount(region, price) {
    const t = region.itp;
    if (t.type === 'flat') return (price * t.rate) / 100;
    if (t.type === 'marginal') return marginalTax(price, t.brackets);
    for (const [cap, rate] of t.brackets) { // tiered: rate on full value
      if (price <= cap) return (price * rate) / 100;
    }
    return 0;
  }

  function ajdRate(region, price) {
    if (region.ajdTiers) {
      for (const [cap, rate] of region.ajdTiers) if (price <= cap) return rate;
    }
    return region.ajd;
  }

  // Approximate regulated notary and registry tariffs for the purchase deed.
  // These grow with price in bands; the UI lets the user override each figure.
  function notaryFee(price) {
    if (price <= 100000) return 600;
    if (price <= 250000) return 750;
    if (price <= 500000) return 950;
    if (price <= 1000000) return 1250;
    return 1600;
  }
  function registryFee(price) {
    if (price <= 100000) return 400;
    if (price <= 250000) return 550;
    if (price <= 500000) return 700;
    if (price <= 1000000) return 900;
    return 1200;
  }

  function purchaseCosts({ price, region, isNewBuild, withMortgage, taxRateOverride, ajdRateOverride, notary, registry, gestoria, appraisal }) {
    let taxName, taxRate, tax;
    if (isNewBuild) {
      const nb = region.newBuild || { name: 'IVA', rate: 10 };
      taxName = nb.name;
      taxRate = taxRateOverride != null ? taxRateOverride : nb.rate;
      const ajd = ajdRateOverride != null ? ajdRateOverride : ajdRate(region, price);
      tax = (price * taxRate) / 100 + (price * ajd) / 100;
      taxName = nb.name + ' + AJD';
    } else {
      taxName = 'ITP';
      if (taxRateOverride != null) {
        taxRate = taxRateOverride;
        tax = (price * taxRate) / 100;
      } else {
        tax = itpAmount(region, price);
        taxRate = round2((tax / price) * 100);
      }
    }
    const notaryFeeV = notary != null ? notary : notaryFee(price);
    const registryFeeV = registry != null ? registry : registryFee(price);
    const gestoriaV = gestoria != null ? gestoria : withMortgage ? 350 : 0;
    const appraisalV = appraisal != null ? appraisal : withMortgage ? 400 : 0;
    return {
      taxName,
      taxRate,
      tax: round2(tax),
      notary: notaryFeeV,
      registry: registryFeeV,
      gestoria: gestoriaV,
      appraisal: appraisalV,
      total: round2(tax + notaryFeeV + registryFeeV + gestoriaV + appraisalV),
    };
  }

  // --- Euribor data helpers -------------------------------------------------

  function euriborLatest(data) {
    return data[data.length - 1];
  }

  function euriborAt(data, ym) {
    const hit = data.find((p) => p[0] === ym);
    return hit ? hit[1] : null;
  }

  // Monthly Euribor values for the simulation.
  // mode 'constant': hold `value`. mode 'history': replay the real series from startYm.
  // mode 'shock': hold value + shock (percentage points).
  function euriborPath(data, months, { mode, value, startYm, shock }) {
    const path = new Array(months);
    if (mode === 'history') {
      let idx = data.findIndex((p) => p[0] === startYm);
      if (idx < 0) idx = data.length - 1;
      for (let m = 0; m < months; m++) {
        path[m] = data[Math.min(idx + m, data.length - 1)][1];
      }
    } else {
      const base = mode === 'shock' ? value + (shock || 0) : value;
      path.fill(base);
    }
    return path;
  }

  return {
    round2,
    monthlyPayment,
    monthsToPayOff,
    buildRatePath,
    buildSchedule,
    REGIONS,
    marginalTax,
    itpAmount,
    ajdRate,
    notaryFee,
    registryFee,
    purchaseCosts,
    euriborLatest,
    euriborAt,
    euriborPath,
  };
});
