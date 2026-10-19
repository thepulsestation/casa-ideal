const known = value => typeof value === 'number' && Number.isFinite(value);
const amount = (value, euro, esc, digits = 2) => known(value) ? esc(euro(Math.abs(value) < .005 ? 0 : value, digits)) : 'Por completar';
const safeList = values => Array.isArray(values) ? values.filter(value => typeof value === 'string' && value.trim()) : [];
const unique = values => [...new Set(values)];

function monthLabel(value) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ''))) return 'el mes de referencia';
  const [year, month] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('es-ES', {month: 'long', year: 'numeric', timeZone: 'UTC'}).format(new Date(Date.UTC(year, month - 1, 1)));
}

function change(value, euro, esc) {
  if (!known(value)) return '<span>Por completar</span>';
  if (Math.abs(value) < .005) return '<span class="positive">Igual</span>';
  return `<span class="${value > 0 ? 'negative' : 'positive'}">${value > 0 ? '+' : '−'}${amount(Math.abs(value), euro, esc)}</span>`;
}

/** Net cash borne by each person; internal household transfers are not new spending. */
export function renderMonthlyCostComparison(comparison, {euro, esc, compact = false}) {
  const c = comparison || {};
  const people = Array.isArray(c.people) ? c.people : [];
  if (!people.length) return '<p class="notice">Completa el presupuesto y el reparto para ver cuánto pagaría cada persona.</p>';
  const increases = people.filter(person => known(person.difference) && person.difference > .005);
  const label = compact ? 'Lo que pagaría cada persona al mes' : 'Gasto mensual a cargo de cada persona';
  return `<div class="table-wrap budget-neutral-people"><table><caption>${label}</caption><thead><tr><th scope="col">Persona</th><th scope="col" class="number">Alquiler / mes</th><th scope="col" class="number">Compra / mes</th><th scope="col" class="number">Cambio</th>${compact ? '' : '<th scope="col" class="number">Le queda de su nómina</th>'}</tr></thead><tbody>${people.map(person => `<tr><th scope="row">${esc(person.label || 'Persona pendiente')}</th><td class="number">${amount(person.currentCost, euro, esc)}</td><td class="number">${amount(person.purchaseCost, euro, esc)}</td><td class="number">${change(person.difference, euro, esc)}</td>${compact ? '' : `<td class="number${known(person.purchaseRemaining) && person.purchaseRemaining < -.005 ? ' negative' : ''}">${amount(person.purchaseRemaining, euro, esc)}</td>`}</tr>`).join('')}<tr class="comparison-total"><th scope="row">Total de la familia</th><td class="number">${amount(c.currentTotal, euro, esc)}</td><td class="number">${amount(c.purchaseTotal, euro, esc)}</td><td class="number">${change(c.difference, euro, esc)}</td>${compact ? '' : '<td class="number">—</td>'}</tr></tbody></table></div>${increases.length ? `<p class="fine-print budget-neutral-person-warning">${esc(increases.map(person => person.label || 'Una persona').join(', '))}${increases.length === 1 ? ' pagaría' : ' pagarían'} más con este reparto, aunque el total familiar pueda bajar.</p>` : ''}${compact ? '' : '<p class="fine-print">Se muestra el gasto neto a cargo de cada uno, descontando las aportaciones que recibe de la familia. «Le queda de su nómina» usa ingresos ordinarios; no presupone que ese dinero se ahorre.</p>'}`;
}

/** An additional monthly-life ceiling, kept separate from bank underwriting. */
export function renderBudgetNeutral(scenario, capacity, {euro, pct, esc, mode = 'household'}) {
  const c = capacity || {};
  const individual = mode === 'individual';
  const price = individual ? c.maxIndividualPrice : c.maxPrice;
  const r = (individual ? c.individualSummary : c.summary) || {};
  const positive = known(price) && price > 0;
  const comparison = positive ? r.comparison : c.comparison;
  const bank = c.bankCapacity || {};
  const pending = unique([...safeList(c.errors), ...safeList(c.pendingAssumptions), ...safeList(c.missingQuotes)]);
  const missingQuotes = unique([...safeList(c.missingQuotes), ...safeList(comparison?.missingQuotes)]);
  const month = c.month ?? c.referenceMonth ?? comparison?.month;
  const currentTotal = comparison?.currentTotal ?? r.currentTotal;
  const purchaseTotal = comparison?.purchaseTotal ?? r.purchaseTotal ?? r.householdMonthly;
  const difference = comparison?.difference ?? (known(currentTotal) && known(purchaseTotal) ? purchaseTotal - currentTotal : null);
  const headline = positive
    ? `Hasta ${amount(price, euro, esc, 0)} ${individual ? 'sin que nadie pague más' : 'sin subir el gasto de la familia'}`
    : price === 0 ? (individual ? 'Con este reparto, alguien pagaría más' : 'El presupuesto necesita ajustes antes de comprar') : 'Faltan datos para calcular este límite';
  const referenceLabel = scenario?.name || scenario?.property?.name || 'la vivienda seleccionada';
  const reason = individual ? c.individualReason : c.reason;
  const generalReason = individual
    ? 'Cambiar quién paga cada gasto puede aumentar la aportación de una persona incluso con una vivienda más barata. Revisa el reparto o usa el límite del total familiar.'
    : 'Ningún precio positivo del intervalo cumple a la vez el presupuesto mensual, el dinero inicial y la deuda configurados.';
  const currentCaption = positive ? 'Alquiler · presupuesto conservado' : 'Alquiler · vivienda de referencia';
  const nextCaption = positive ? 'Compra · en este precio máximo' : 'Compra · vivienda de referencia';
  const assumptions = `<details class="budget-neutral-assumptions"><summary>Qué conserva esta simulación</summary><p>Comida, suministros, transporte, trastero, seguros y demás pagos del presupuesto. La compra añade hipoteca, cuota bancaria de mamá y gastos propios de la vivienda; el préstamo familiar no se cuenta dos veces.</p><p>No se eliminan gastos para hacer encajar la compra: se usa el calendario indicado en ambos casos. Las pagas extra, cobros extraordinarios y ahorros acumulados no amplían el presupuesto mensual ordinario.</p><p>El IBI, residuos, comunidad y seguros de compra se toman de ${esc(referenceLabel)}. Los importes estimados y las primas pendientes pueden cambiar el resultado.</p><p>Se mantienen los límites del ${known(scenario?.budget?.debtRatioLimit) ? esc(pct(scenario.budget.debtRatioLimit)) : 'esfuerzo'} de los titulares y del préstamo de mamá. Impuestos, provisión de compra y colchón se cubren en la financiación inicial; no se cobran cada mes.</p></details>`;
  return `<section class="card capacity-card budget-neutral-card"><div class="card-head"><div><span class="mini-label">COMPRAR SIN GASTAR MÁS</span><h2>${headline}</h2><p>Referencia: ${esc(monthLabel(month))} · mismos gastos de vida.</p></div><span class="pill amber">Estimación provisional</span></div><div class="budget-neutral-modes" role="group" aria-label="Cómo limitar el gasto mensual"><button type="button" class="button ${individual ? 'secondary' : 'primary'}" data-budget-neutral-mode="household" aria-pressed="${!individual}">Total de la familia</button><button type="button" class="button ${individual ? 'primary' : 'secondary'}" data-budget-neutral-mode="individual" aria-pressed="${individual}">Que nadie pague más</button></div><p class="fine-print">${individual ? 'Cada persona conserva como máximo su gasto actual, con el reparto previsto después de comprar.' : 'Se mantiene el gasto total de la familia. El reparto entre personas puede cambiar; compruébalo debajo.'}</p>
    ${positive && missingQuotes.length ? '<p class="notice">Faltan precios por confirmar. Este límite usa los importes conocidos y puede bajar al recibir los presupuestos.</p>' : ''}
    ${!positive ? `<p class="notice${price === 0 ? '' : ' error'}">${esc(reason || (price === 0 ? generalReason : 'Completa los ingresos, el reparto y los importes mensuales antes de usar este cálculo.'))}</p>` : ''}
    <div class="capacity-result-grid budget-neutral-headline-metrics"><div><small>${currentCaption}</small><strong>${amount(currentTotal, euro, esc)}</strong></div><div><small>${nextCaption}</small><strong>${amount(purchaseTotal, euro, esc)}</strong></div><div><small>Cambio del gasto familiar / mes</small><strong>${change(difference, euro, esc)}</strong></div><div><small>Tope por deuda y dinero inicial · separado</small><strong>${amount(bank.maxPrice, euro, esc, 0)}</strong></div></div>
    ${positive ? `<div class="purchase-strip budget-neutral-financing"><div><small>Hipoteca / mes</small><strong>${amount(r.mortgageMonthly, euro, esc)}</strong></div><div><small>Capital del préstamo de mamá</small><strong>${amount(r.motherLoanRequired ?? r.loanRequired, euro, esc, 0)}</strong></div><div><small>Cuota bancaria de mamá / mes</small><strong>${amount(r.motherBankMonthly, euro, esc)}</strong></div></div>` : ''}
    <h3 class="section-gap">${positive ? 'Así quedaría repartido en este precio' : 'El reparto de la vivienda de referencia'}</h3>${renderMonthlyCostComparison(comparison, {euro, esc})}
    <p class="fine-print">El tope por deuda y dinero inicial comprueba otro límite: cumplir el esfuerzo bancario no significa mantener vuestros gastos. Ninguna de estas cifras equivale a financiación aprobada.</p>${assumptions}
    ${pending.length ? `<details class="capacity-pending"><summary>Importes y condiciones por comprobar (${pending.length})</summary><ul class="warning-list">${pending.map(text => `<li>${esc(text)}</li>`).join('')}</ul></details>` : ''}<div class="inline-actions"><button class="button secondary" data-view="presupuesto">Revisar gastos del hogar</button><button class="button secondary" data-view="reparto">Editar reparto y fechas</button></div></section>`;
}
