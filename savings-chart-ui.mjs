const IDS = ['buyer1', 'buyer2', 'mother', 'sister'];
const LABELS = {buyer1: 'Tú', buyer2: 'Tu hermano', mother: 'Tu madre', sister: 'Tu hermana', household: 'Todo el hogar'};
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const known = value => typeof value === 'number' && Number.isFinite(value);
const escapeHtml = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const defaultEuro = value => new Intl.NumberFormat('es-ES', {style: 'currency', currency: 'EUR', useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2}).format(value);

function monthLabel(value, short = false) {
  if (!MONTH.test(String(value || ''))) return 'Fecha pendiente';
  const [year, month] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('es-ES', {month: short ? 'short' : 'long', year: short ? '2-digit' : 'numeric', timeZone: 'UTC'}).format(new Date(Date.UTC(year, month - 1, 1)));
}

function axisNumber(value) {
  const absolute = Math.abs(value);
  const divisor = absolute >= 1e6 ? 1e6 : absolute >= 1e3 ? 1e3 : 1;
  return new Intl.NumberFormat('es-ES', {maximumFractionDigits: divisor === 1 ? 0 : 1, useGrouping: 'always'}).format(value / divisor) + (divisor === 1e6 ? ' M' : divisor === 1e3 ? ' mil' : '') + ' €';
}

function scaleBounds(values) {
  const low = Math.min(0, ...values), high = Math.max(0, ...values);
  const span = high - low || 100;
  const rough = span / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const unit = [1, 2, 2.5, 5, 10].find(step => step * magnitude >= rough) * magnitude;
  const min = Math.floor(low / unit) * unit;
  const max = Math.ceil((high === low ? low + span : high) / unit) * unit;
  const ticks = [];
  for (let value = min; value <= max + unit * .01; value += unit) ticks.push(Math.abs(value) < unit * 1e-8 ? 0 : value);
  return {min, max, ticks};
}

/** Render a projection already calculated by buildSavingsProjection; no financial state is changed. */
export function renderSavingsChart(projection = {}, {euro = defaultEuro, esc = escapeHtml} = {}) {
  const points = (projection.points || []).filter(point => MONTH.test(String(point?.month || '')));
  const label = id => projection.persons?.find(person => person.id === id)?.label || LABELS[id];
  const amount = value => known(value) ? esc(euro(Math.abs(value) < .005 ? 0 : value, 2)) : 'Por completar';
  const totals = projection.totals || points.at(-1)?.cumulative || {};
  const finalMonth = points.at(-1)?.month;
  const cutoff = projection.cutoffMonth || finalMonth;
  const purchase = projection.purchaseMonth;
  const title = 'Ahorro acumulado antes de comprar';
  const invalid = projection.valid === false;
  if (invalid || !points.length) return `<section class="card savings-chart"><h2>${title}</h2><p>${invalid ? 'Revisa el calendario y los importes pendientes para calcular la previsión.' : 'No hay meses de alquiler anteriores a la compra en este calendario.'}</p>${(projection.errors || []).length ? `<ul class="warning-list">${projection.errors.map(error => `<li>${esc(error)}</li>`).join('')}</ul>` : ''}<p class="fine-print">El gráfico parte de 0 € y muestra una previsión, no ahorros ya guardados.</p></section>`;
  const series = ['household', ...IDS];
  const values = points.flatMap(point => series.map(id => point.cumulative?.[id]).filter(known));
  const bounds = scaleBounds(values);
  const renderSvg = mobile => {
    const width = mobile ? 420 : 840, height = mobile ? 310 : 345;
    const left = mobile ? 62 : 80, right = 22, top = 20, bottom = mobile ? 55 : 49;
    const plotWidth = width - left - right, plotHeight = height - top - bottom;
    const x = index => left + (points.length > 1 ? index / (points.length - 1) : .5) * plotWidth;
    const y = value => top + (bounds.max - value) / (bounds.max - bounds.min) * plotHeight;
    const n = value => Number(value.toFixed(2));
    const suffix = mobile ? 'mobile' : 'desktop';
    const stride = Math.max(1, Math.ceil(points.length / (mobile ? 5 : 9)));
    const axes = bounds.ticks.map(value => `<g class="savings-chart-tick${value === 0 ? ' savings-chart-zero' : ''}"><line x1="${left}" x2="${width - right}" y1="${n(y(value))}" y2="${n(y(value))}"/><text x="${left - 10}" y="${n(y(value) + 4)}" text-anchor="end">${esc(axisNumber(value))}</text></g>`).join('');
    const dates = points.map((point, index) => index === points.length - 1 || index % stride === 0 && points.length - 1 - index >= stride ? `<text class="savings-chart-month" x="${n(x(index))}" y="${height - bottom + 25}" text-anchor="${index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}">${esc(monthLabel(point.month, true))}</text>` : '').join('');
    const paths = [...IDS, 'household'].map(id => {
      let started = false;
      const d = points.map((point, index) => {
        const value = point.cumulative?.[id];
        if (!known(value)) { started = false; return ''; }
        const command = started ? 'L' : 'M'; started = true;
        return `${command}${n(x(index))},${n(y(value))}`;
      }).join(' ');
      return d ? `<path class="savings-chart-line savings-chart-${id}" d="${d}"/>` : '';
    }).join('');
    const markers = points.map((point, index) => {
      const summary = `${monthLabel(point.month)}. ${series.map(id => `${label(id)}: ${known(point.cumulative?.[id]) ? euro(point.cumulative[id], 2) : 'Por completar'}`).join('. ')}`;
      const hitWidth = Math.min(45, plotWidth / Math.max(1, points.length - 1));
      return `<g class="savings-chart-point" tabindex="0" role="img" aria-label="${esc(summary)}"><title>${esc(summary)}</title><rect class="savings-chart-hit" x="${n(x(index) - hitWidth / 2)}" y="${top}" width="${n(hitWidth)}" height="${plotHeight}"/><line class="savings-chart-guide" x1="${n(x(index))}" x2="${n(x(index))}" y1="${top}" y2="${height - bottom}"/>${[...IDS, 'household'].map(id => known(point.cumulative?.[id]) ? `<circle class="savings-chart-marker savings-chart-${id}" cx="${n(x(index))}" cy="${n(y(point.cumulative[id]))}" r="${id === 'household' ? 4.5 : 3}"/>` : '').join('')}</g>`;
    }).join('');
    return `<svg class="savings-chart-svg savings-chart-${suffix}" viewBox="0 0 ${width} ${height}" role="group" aria-labelledby="savings-chart-title-${suffix} savings-chart-description-${suffix}"><title id="savings-chart-title-${suffix}">${title}</title><desc id="savings-chart-description-${suffix}">Previsión desde ${esc(monthLabel(points[0].month))} hasta ${esc(monthLabel(finalMonth))}. Eje horizontal: meses. Eje vertical: euros acumulados desde cero. El hogar se muestra con la línea verde gruesa. Cada mes se puede enfocar para consultar sus importes; la tabla inferior ofrece los datos completos.</desc>${axes}${dates}${paths}${markers}</svg>`;
  };
  const incomplete = projection.incomplete || points.some(point => series.some(id => !known(point.cumulative?.[id])));
  const hasUnassigned = points.some(point => point.hasUnassignedExpenses);
  const total = totals.household;
  return `<section class="card savings-chart"><div class="savings-chart-heading"><div><span class="mini-label">HASTA LA COMPRA</span><h2>${title}</h2><p>Si guardáis todo el dinero que queda cada mes, partiendo de 0 €.</p></div><div class="savings-chart-total${known(total) && total < 0 ? ' is-negative' : ''}"><span>${known(total) && total < 0 ? 'Déficit acumulado del hogar' : 'Disponible acumulado del hogar'}</span><strong>${amount(total)}</strong><small>Al cierre de ${esc(monthLabel(finalMonth))}</small></div></div><div class="savings-chart-legend" aria-label="Previsión acumulada por persona y del hogar">${series.map(id => `<div class="savings-chart-key savings-chart-${id}"><span><i aria-hidden="true"></i>${esc(label(id))}</span><strong${known(totals[id]) && totals[id] < 0 ? ' class="negative"' : ''}>${amount(totals[id])}</strong></div>`).join('')}</div><div class="savings-chart-plot">${renderSvg(false)}${renderSvg(true)}</div><p class="savings-chart-cutoff"><strong>Compra prevista: ${esc(monthLabel(purchase))}.</strong> Contamos hasta ${esc(monthLabel(cutoff))}; la nómina y las pagas extra del mes de compra no se dan por cobradas antes de firmar. Tampoco damos por pagados la entrada, los impuestos ni los honorarios de compra.</p>${incomplete || hasUnassigned ? `<p class="notice">${incomplete ? 'Previsión provisional: revisad los gastos e ingresos pendientes. Si falta una cifra, su línea se interrumpe. ' : ''}${hasUnassigned ? 'Hay gastos sin asignar: los acumulados individuales son provisionales; el hogar ya descuenta esos pagos.' : ''}</p>` : ''}<details class="savings-chart-data" data-detail-key="savings-chart-monthly-values"><summary>Ver importes mes a mes</summary><div class="savings-chart-table-wrap"><table><caption>Ahorro acumulado desde 0 € · antes de la compra</caption><thead><tr><th scope="col">Mes</th>${IDS.map(id => `<th scope="col" class="number">${esc(label(id))}</th>`).join('')}<th scope="col" class="number">Hogar</th></tr></thead><tbody>${points.map(point => `<tr><th scope="row">${esc(monthLabel(point.month))}</th>${[...IDS, 'household'].map(id => `<td class="number${known(point.cumulative?.[id]) && point.cumulative[id] < 0 ? ' negative' : ''}">${amount(point.cumulative?.[id])}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details><p class="fine-print">Es capacidad de ahorro prevista, no un saldo bancario confirmado. Los déficits reducen el acumulado y los cobros futuros conservan sus hipótesis del presupuesto. El total del hogar cuenta cada pago una sola vez; las transferencias entre familiares no crean dinero nuevo.</p></section>`;
}
