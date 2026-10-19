import {renderPropertyCosts} from './property-costs.mjs?v=30';
/** Family income and household expenses. Personal amounts live in the scenario. */
export function renderBudget(s, result, { field, select, check, section, notice, row, euro, pct, resultSidebar, global = false }) {
  const b = result.budget;
  const families = [
    { index: 0, label: 'Tu madre', hint: 'Su sueldo ayuda al presupuesto de casa; no se añade a los ingresos de los titulares hipotecarios.' },
    { index: 1, label: 'Tu hermana', hint: 'De momento puede quedar a 0 €. Actualízalo cuando empiece a trabajar.' },
  ];
  const utilities = (current = false) => {
    const modeKey = current ? 'currentUtilitiesMode' : 'utilitiesMode';
    const aggregateKey = current ? 'currentUtilitiesMonthly' : 'utilitiesMonthly';
    const breakdownKey = current ? 'currentUtilityBreakdown' : 'utilityBreakdown';
    const mode = s.budget[modeKey] || 'detailed';
    const aggregate = s.budget[aggregateKey] || 0;
    const total = current ? b.currentUtilitiesMonthly : b.utilitiesMonthly;
    return `<div class="form-grid">
      <div class="full">${select('Cómo introducir los suministros' + (current ? ' actuales' : ''), 'budget.' + modeKey, [
        ['detailed', 'Desglosar agua, electricidad/gas e internet'],
        ['aggregate', 'Introducir un único total mensual'],
      ])}</div>
      ${mode === 'aggregate'
        ? `<div class="full">${field('Total de suministros' + (current ? ' actuales' : '') + ' al mes', 'budget.' + aggregateKey, {
          hint: 'Incluye agua, electricidad/gas e internet. Al elegir desglose, este total se conserva como referencia y deja de sumarse.',
        })}</div>`
        : `${field('Agua' + (current ? ' actual' : '') + ' al mes', 'budget.' + breakdownKey + '.waterMonthly', {
          hint: 'Introduce el equivalente mensual. Por ejemplo, divide entre 2 una factura bimestral.',
        })}${field('Electricidad y gas' + (current ? ' actuales' : '') + ' al mes', 'budget.' + breakdownKey + '.energyMonthly', {
          hint: 'Si llegan juntos, usa el total del recibo. Si llegan separados, suma ambos aquí.',
        })}${field('Internet' + (current ? ' actual' : '') + ' al mes', 'budget.' + breakdownKey + '.internetMonthly')}
        ${field('Otros suministros' + (current ? ' actuales' : '') + ' al mes', 'budget.' + breakdownKey + '.otherMonthly', {
          hint: 'Solo recibos que no hayas incluido ya en agua, electricidad/gas o internet.',
        })}`}
    </div>
    ${mode === 'detailed' && aggregate > 0 ? notice(`El total anterior de ${euro(aggregate, 2)} sigue conservado como referencia. Ahora solo se suma el desglose; el total anterior no se vuelve a añadir.`, 'info') : ''}
    <div class="breakdown">${row('Total suministros ' + (current ? 'actuales' : 'de la nueva casa') + ' / mes', euro(total, 2), 'total')}</div>`;
  };

  return `<div class="grid form-layout"><div>
    ${section('Los dos titulares de la hipoteca', 'Vuestros sueldos se usan para el esfuerzo hipotecario. Las pagas extra se muestran aparte.', `
      <div class="form-grid">
        ${[0, 1].map(i => `${field(i === 0 ? 'Tu nómina neta' : 'Nómina neta de tu hermano', 'budget.incomes.' + i + '.monthly', {hint:'Neto de un mes ordinario. Si varía, compara también con un mes de ingresos menores; las pagas extra se muestran aparte.'})}
          ${select(i === 0 ? 'Tus pagas al año' : 'Pagas de tu hermano al año', 'budget.incomes.' + i + '.payments', [[12, '12 pagas'], [14, '14 pagas']])}`).join('')}
        ${field('Límite orientativo de deuda', 'budget.debtRatioLimit', { suffix: '%', scale: 100, max: 100 })}
      </div>
      <div class="purchase-strip"><div><small>Titulares · mes normal</small><strong>${euro(b.regularIncome, 2)}</strong></div><div><small>Titulares · media con pagas extra</small><strong>${euro(b.averagedIncome, 2)}</strong></div></div>
    `)}
    ${section('Un hogar de cuatro personas', 'Tú, tu hermano, tu madre y tu hermana. Estos ingresos amplían el presupuesto del hogar.', `
      <div class="form-grid">${families.map(person => `
        ${field('Nómina neta · ' + person.label, 'budget.householdIncomes.' + person.index + '.monthly', { hint: person.hint })}
        ${select('Pagas al año · ' + person.label, 'budget.householdIncomes.' + person.index + '.payments', [[12, '12 pagas'], [14, '14 pagas']])}
      `).join('')}</div>
      <details><summary>Otras aportaciones al hogar</summary><div class="section-gap">${field('Otras aportaciones mensuales', 'budget.familyIncomeMonthly', { hint: 'Solo ingresos adicionales. No repitas aquí las nóminas de tu madre o tu hermana.' })}</div></details>
      <div class="purchase-strip"><div><small>Hogar · mes normal</small><strong>${euro(b.actualRegularIncome, 2)}</strong></div><div><small>Hogar · media con pagas extra</small><strong>${euro(b.actualAveragedIncome, 2)}</strong></div></div>
      ${notice(`Las pagas extra del hogar suman ${euro(b.extraPaysAnnual)} al año. No se cuentan como ingresos de todos los meses. El sueldo de tu madre y el de tu hermana no cambian el esfuerzo de los dos titulares de la hipoteca.`, 'info')}
    `)}
    ${section('Lo que ya debéis', 'Cuotas de préstamos actuales, tarjetas y otras financiaciones.', `
      <div class="form-grid">
        ${field('Préstamo personal principal · cuota mensual', 'budget.existingDebtMonthly', { hint: 'Solo la cuota principal ya registrada. Coche, tarjetas y otras cuotas se desglosan en Reparto; no vuelvas a sumarlas aquí.' })}
        ${field('Otras deudas mensuales de mamá', 'budget.familyExistingDebtMonthly', { hint: 'Sin repetir el nuevo préstamo de compra.' })}
      </div>
      <div class="breakdown">${row('Deudas actuales de los titulares · mes del cálculo',euro(b.existingDebtMonthly,2))}${row('Otros pagos personales · sin préstamo',euro(b.personalExpenseMonthly??0,2))}</div><button class="card-link" data-view="reparto">Editar pagos personales y cancelación prevista →</button>
      ${!global?notice(`Esfuerzo de los titulares: <strong>${pct(b.debtRatio)}</strong>. Deudas frente a ingresos del hogar: <strong>${pct(b.familyDebtRatio)}</strong>. Son dos perspectivas distintas. La aprobación del banco depende de su análisis, incluida la financiación de la entrada.`, 'info'):''}
    `)}
    ${section('Agua, electricidad/gas e internet', 'Un solo presupuesto para las cuatro personas. Por defecto se usa igual al alquilar y al comprar.', utilities())}
    ${section('El resto de la vida en casa', 'Rellénalo una vez. Estos mismos gastos se suman tanto al alquiler como a la compra, para todo el hogar.', `
      <div class="form-grid">
        ${field('Alimentación mensual · todo el hogar','budget.foodMonthly')}
        ${field('Coche y transporte mensual · todo el hogar','budget.carMonthly')}
        ${field('Trastero al mes','budget.storageMonthly',{hint:'Se mantiene igual en los dos presupuestos. No lo repitas en alquiler ni en otros gastos.'})}
        ${field('Otros gastos de vida al mes','budget.otherMonthly',{hint:'Salud, ocio, suscripciones… Sin repetir el trastero ni la universidad del reparto mensual.'})}
      </div>
      <div class="breakdown">${row('Universidad · gasto educativo este mes',euro(b.universityMonthly??0,2))}</div><p class="fine-print">Se incluye una vez en el coste del hogar, hasta el último mes indicado. No se clasifica como préstamo. <button class="card-link" data-view="reparto">Editar importe, fechas y reparto →</button></p>
    `)}
    ${!global?section('Los gastos propios de la casa que compraríais','IBI, residuos y comunidad o conservación. Usa recibos cuando los tengas; mientras tanto puedes probar una provisión.',renderPropertyCosts(s,result,{field,check,notice,row,euro})):notice('Este presupuesto se aplica a todas las viviendas. El IBI, la comunidad, los seguros y los préstamos de compra se ajustan dentro de cada vivienda.','info')}
    ${section(global?'Vuestro alquiler actual':'Alquilar o comprar, con el mismo presupuesto','No tienes que volver a rellenar agua, luz, internet, comida, transporte ni trastero.',`
      <div class="form-grid">${field('Alquiler mensual actual','budget.currentRent')}
        ${field('Otros gastos exclusivos de la vivienda actual / mes','budget.currentOtherMonthly',{hint:'Si pagas residuos, comunidad o IBI aparte del alquiler, introduce su equivalente mensual aquí. Agua, luz, internet, alimentación, transporte y trastero ya están incluidos.'})}
      </div>
      ${notice(b.sharedLivingCosts?'Se utilizan exactamente los mismos suministros y gastos de vida en ambos casos. La diferencia viene de alquiler frente a hipoteca, préstamo de mamá y gastos propios de la compra.':'Los gastos de vida y el trastero se mantienen iguales. Has activado suministros distintos en las opciones de abajo.','info')}
      ${!global?`<div class="purchase-strip"><div><small>Alquiler + vida + deudas actuales</small><strong>${euro(b.currentComparable,2)}</strong></div><div><small>Compra + vida + deudas</small><strong>${euro(b.totalMonthly,2)}</strong></div></div>`:''}
      <details class="section-gap"><summary>Opcional: usar suministros diferentes después de comprar</summary>
       ${check('Mantener los mismos suministros al alquilar y al comprar','budget.sharedLivingCosts','Activado por defecto. Desmárcalo solo si quieres comparar facturas diferentes.')}
       ${!b.sharedLivingCosts?`<div class="section-gap">${utilities(true)}</div>`:b.currentUtilitiesIndependentMonthly>0?`<p class="fine-print">Importe actual anterior conservado: ${euro(b.currentUtilitiesIndependentMonthly,2)} /mes. Es una referencia; se usa el presupuesto común y no se suma dos veces.</p>`:''}
      </details>
    `)}
    ${!global?section('Si un mes no va según lo previsto', 'Una prueba de resistencia del hogar completo, también editable.', `
      <div class="form-grid">
        ${field('Caída de ingresos', 'stress.incomeDropPercent', { suffix: '%', max: 100 })}
        ${field('Aumento de gastos de vida', 'stress.expenseIncreasePercent', { suffix: '%', max: 500 })}
        ${field('Reparación imprevista', 'stress.unexpectedCost')}
        <div style="align-self:center">${check('Perder las bonificaciones hipotecarias', 'stress.loseDiscounts')}</div>
      </div>
      ${notice(`<strong>Margen mensual en este escenario: ${b.actualRegularIncome ? euro(result.stress.remainingRegular) : 'faltan ingresos'}.</strong> Colchón tras el imprevisto: ${euro(result.stress.reserveAfterUnexpectedCost)}. ${b.incomplete ? 'La prueba también está incompleta: faltan datos base.' : ''}`, result.stress.remainingRegular < 0 ? 'error' : 'info')}
    `):''}
  </div>${resultSidebar()}</div>`;
}
