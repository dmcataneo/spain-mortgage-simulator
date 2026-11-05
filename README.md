# Spain Mortgage Simulator

Simulate a Spanish home loan in the browser: the monthly payment, the full amortization schedule, what a Euribor revision can do to a variable rate, how much an early repayment saves, and the taxes and fees you pay on top of the price.

It runs in the browser. There is nothing to install: open `index.html`, or serve the folder with any static file server.

## Run locally

```bash
# Option 1: open index.html in a browser
# Option 2: serve the folder
python3 -m http.server 8000     # then visit http://localhost:8000
```

## What you can do

- Price, region and down payment. The loan amount and LTV follow; an LTV over the usual 80% resident cap is flagged.
- Resale or new build. Resale applies the region's ITP (general 2026 rates, flat / marginal / tiered as each region sets them). New build applies IVA (10%) or IGIC/IPSI plus the region's AJD. Notary, registry, gestoría and appraisal come prefilled with typical figures; everything is editable.
- Fixed, variable or mixed rates. Variable is Euribor 12M plus a spread, reviewed every 6 or 12 months; mixed adds an initial fixed period.
- Euribor three ways: hold it flat, shock it (+0.5 to +6 points), or replay the real month-by-month history from any month since 1999 to see what a loan signed back then would have done.
- Early repayments in any year, cutting either the term or the payment. On a rate review or a payment-cutting repayment, the installment is recast over the remaining term, as Spanish lenders do.
- Three scenarios (A/B/C) with a side-by-side comparison table: first payment, payment in year 5, worst payment, total interest, cash needed.
- Yearly or monthly schedule, downloadable as CSV. The whole setup is stored in the URL, so Copy link shares the exact scenario.
- Optional household income for the effort gauge (payment / income, marked against the common 30-35% guideline).

## The Euribor data

The page embeds the official one-year Euribor series (monthly average, in percent) published by Banco de España as the official mortgage-market reference rate, series `D_1NBAF472`, from January 1999 to the latest available month. The file header records when it was pulled; the newest month is marked provisional until it appears in the BOE. Nothing is fetched live.

Refresh it with:

```bash
python3 scripts/update_euribor.py
```

which pulls the full series from the [BdE statistics API](https://www.bde.es/webbe/es/estadisticas/recursos/api-estadisticas-bde.html) and rewrites `src/euribor-data.js`.

## What it does not do

- Taxes are the **general** 2026 rates. Reduced rates for young buyers, large families, VPO or disability are not modeled, and the taxable base can be the cadastral reference value when it is higher than the price. Check your case before relying on the number.
- Notary and registry figures are approximations of the regulated tariffs; gestoría and appraisal are typical quotes. Adjust them in the panel.
- Under Law 5/2019 the bank pays the notary, registry, gestoría and AJD of the loan deed itself, so only the purchase side appears here.
- It is a simulator, not financial advice. A bank's binding figures come in its FIPRE/FiCARE pre-contractual documents.

Sources: [Banco de España statistics API](https://www.bde.es/webbe/es/estadisticas/recursos/api-estadisticas-bde.html) and [official reference rates](https://clientebancario.bde.es/pcb/es/menu-horizontal/podemosayudarte/tiposinteres/guia_textual/tiposinteresreferenciaotrostiposfrecuentes/tabla_tipos_referencia_oficiales_mercado_hipotecario.html), [idealista: ITP by region 2026](https://www.idealista.com/news/inmobiliario/vivienda/2024/09/18/819047-itp-por-comunidades-2024-conoce-los-tipos-aplicables), [Rankia: AJD by region 2026](https://www.rankia.com/blog/mejores-hipotecas/2574021-impuesto-actos-juridicos-documentados-ajd-segun-comunidad-autonoma), [Law 5/2019 (BOE)](https://www.boe.es/buscar/act.php?id=BOE-A-2019-3814).

## Tests

```bash
node --test tests/core.test.js
```

The tests check the payment formula against the textbook figure, exact amortization at fixed rates, installment recasts on rate reviews, both early-repayment modes, the Catalonia marginal ITP brackets, flat and tiered regions, new-build VAT + AJD, and the integrity of the embedded Euribor series. Node 18 or newer, no dependencies.

## Layout

```
index.html, style.css   Page
src/core.js             Mortgage math and taxes (used by the page and the tests)
src/app.js              UI, charts, scenarios, URL state
src/euribor-data.js     Embedded official Euribor series (Banco de España)
tests/core.test.js      Tests
scripts/update_euribor.py   Refresh the Euribor data file
```

All figures are computed from what you type. Nothing leaves the browser.

## Author

[dmcataneo](https://github.com/dmcataneo)
