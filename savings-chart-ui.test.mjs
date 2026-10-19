import test from 'node:test';
import assert from 'node:assert/strict';
import {renderSavingsChart} from './savings-chart-ui.mjs';

const ids = ['buyer1', 'buyer2', 'mother', 'sister', 'household'];
const balance = values => Object.fromEntries(ids.map((id, index) => [id, values[index]]));
const fixture = () => ({valid: true, startMonth: '2026-10', purchaseMonth: '2027-06', cutoffMonth: '2027-05', incomplete: false, warnings: [], errors: [], persons: [{id: 'buyer1', label: 'Tú'}, {id: 'buyer2', label: 'Tu hermano'}, {id: 'mother', label: 'Tu madre'}, {id: 'sister', label: 'Tu hermana'}], points: [
  {month: '2026-10', monthly: balance([200, 100, 150, 0, 450]), cumulative: balance([200, 100, 150, 0, 450])},
  {month: '2026-11', monthly: balance([-50, 100, 150, 0, 200]), cumulative: balance([150, 200, 300, 0, 650])},
  {month: '2027-05', monthly: balance([250, 100, 150, 50, 550]), cumulative: balance([400, 300, 450, 50, 1200])},
], totals: balance([400, 300, 450, 50, 1200])});

test('chart identifies the pre-purchase cutoff and separate total without treating the forecast as existing savings', () => {
  const projection = fixture(), original = structuredClone(projection);
  const html = renderSavingsChart(projection);
  assert.match(html, /Ahorro acumulado antes de comprar/);
  assert.match(html, /Compra prevista: junio de 2027/);
  assert.match(html, /Contamos hasta mayo de 2027/);
  assert.match(html, /pagas extra del mes de compra no se dan por cobradas antes de firmar/);
  assert.match(html, /Tampoco damos por pagados la entrada, los impuestos ni los honorarios/);
  assert.match(html, /partiendo de 0 €/);
  assert.match(html, /capacidad de ahorro prevista, no un saldo bancario confirmado/);
  assert.match(html, /1\.200,00/);
  assert.equal((html.match(/<path class="savings-chart-line /g) || []).length, 10, 'five series in each responsive SVG');
  assert.deepEqual(projection, original, 'rendering is presentation only');
});

test('each month has an accessible exact-value summary and the fallback table shares those values', () => {
  const html = renderSavingsChart(fixture());
  assert.match(html, /tabindex="0" role="img" aria-label="octubre de 2026\. Todo el hogar: 450,00/);
  assert.match(html, /<summary>Ver importes mes a mes<\/summary>/);
  assert.match(html, /<th scope="row">mayo de 2027<\/th>/);
  assert.match(html, /class="savings-chart-table-wrap"/);
  assert.doesNotMatch(html, /class="table-wrap"/);
  assert.match(html, /aria-labelledby="savings-chart-title-desktop savings-chart-description-desktop"/);
  assert.match(html, /aria-labelledby="savings-chart-title-mobile savings-chart-description-mobile"/);
});

test('negative accumulation stays negative and is shown as a deficit', () => {
  const projection = fixture();
  projection.points.at(-1).cumulative = balance([-400, 100, -500, 0, -800]);
  projection.totals = {...projection.points.at(-1).cumulative};
  const html = renderSavingsChart(projection);
  assert.match(html, /Déficit acumulado del hogar/);
  assert.match(html, /-800,00/);
  assert.match(html, /savings-chart-total is-negative/);
  assert.match(html, /class="number negative">-400,00/);
  assert.doesNotMatch(html, /NaN|Infinity/);
});

test('unknown data creates a gap and a pending label instead of invented zero', () => {
  const projection = fixture();
  projection.points[1].cumulative.buyer1 = null;
  projection.points[2].cumulative.buyer1 = null;
  projection.totals.buyer1 = null;
  projection.incomplete = true;
  const html = renderSavingsChart(projection);
  const buyerLine = html.match(/<path class="savings-chart-line savings-chart-buyer1" d="([^"]+)"/)[1];
  assert.equal((buyerLine.match(/M/g) || []).length, 1);
  assert.equal((buyerLine.match(/L/g) || []).length, 0, 'only the known point is plotted');
  assert.match(html, /Por completar/);
  assert.match(html, /Si falta una cifra, su línea se interrumpe/);
  assert.doesNotMatch(html, /NaN|Infinity/);
});

test('unassigned personal expenses keep the household total and warn about individual forecasts', () => {
  const projection = fixture();
  projection.points[0].hasUnassignedExpenses = true;
  projection.totals.household = 999;
  const html = renderSavingsChart(projection);
  assert.match(html, /999,00/);
  assert.match(html, /Hay gastos sin asignar: los acumulados individuales son provisionales/);
});

test('all-zero and one-point projections produce finite axes and retain real zeros', () => {
  const projection = fixture();
  projection.points = [{month: '2027-05', monthly: balance([0, 0, 0, 0, 0]), cumulative: balance([0, 0, 0, 0, 0])}];
  projection.totals = balance([0, 0, 0, 0, 0]);
  const html = renderSavingsChart(projection);
  assert.match(html, /0,00/);
  assert.doesNotMatch(html, /NaN|Infinity/);
});

test('unsafe labels, format helpers and error text are escaped', () => {
  const projection = fixture();
  projection.persons[0].label = '<img src=x onerror="alert(1)">';
  const html = renderSavingsChart(projection, {euro: () => '<b>unsafe</b>'});
  assert.doesNotMatch(html, /<img|<b>/);
  assert.match(html, /&lt;img/);
  assert.match(html, /&lt;b&gt;unsafe/);
  const invalid = renderSavingsChart({valid: false, errors: ['<script>alert(1)</script>']});
  assert.doesNotMatch(invalid, /<script>/);
  assert.match(invalid, /&lt;script&gt;/);
});

test('invalid and empty calendars explain why no chart is available', () => {
  assert.match(renderSavingsChart({valid: false, errors: ['Fecha incorrecta']}), /Fecha incorrecta/);
  assert.match(renderSavingsChart({valid: true, points: []}), /No hay meses de alquiler anteriores a la compra/);
  assert.doesNotMatch(renderSavingsChart({valid: false}), /<svg/);
});
