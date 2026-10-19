import { calculateScenario } from './finance.mjs?v=24';

/** HTML only. All editable controls use the app's existing data-field binding. */
export function renderMotherTransfer(s, result, { field, check, select, section, notice, row, euro, pct, num }) {
  const transfer = s.motherTransfer;
  const giftMode = transfer.mode === 'gift';
  const enabled = s.familyLoan.enabled;
  const controls = `<div class="form-grid section-gap">${select('Cómo entrega mamá el dinero', 'motherTransfer.mode', [
    ['family-loan', 'Préstamo entre madre e hijos'],
    ['gift', 'Donación de madre a hijos'],
  ], 'Es una operación distinta del préstamo que ella firma con su banco.')}</div>`;
  const loanFields = `<div class="form-grid section-gap">${select('Cómo devolvéis el dinero a mamá','motherTransfer.repaymentMode',[
    ['same-as-bank','Los hijos cubrimos la misma cuota que paga mamá al banco'],
    ['custom','Calendario independiente · permite préstamo familiar al 0 %'],
  ],'Es un supuesto del presupuesto y debe quedar reflejado en un contrato familiar aceptado por el banco.')}</div>${transfer.repaymentMode==='same-as-bank'?notice('La devolución de los hijos se calcula con el mismo importe, TIN y plazo del préstamo bancario de mamá. Esa devolución cuenta en vuestro esfuerzo hipotecario; en el presupuesto conjunto sólo se suma una vez la salida al banco. Si le abonáis intereses, confirmad también su tratamiento fiscal.','info'):`<div class="form-grid section-gap">${field('Interés del préstamo entre madre e hijos', 'motherTransfer.familyRate', {
    suffix: '%', nullable: true, max: 100,
    hint: '0 % es posible si se pacta así. No es el interés que cobra el banco a mamá.',
  })}${field('Plazo de devolución de hijos a mamá', 'motherTransfer.familyYears', {
    suffix: 'años', nullable: true, max: 50, step: 1,
    hint: 'Plazo independiente del préstamo bancario de mamá. Cambiar los años del banco no modifica este contrato. En blanco no se inventa una cuota.',
  })}</div>`}<div class="form-grid section-gap">${transfer.allocations.map((allocation,i)=>field(`Parte de la devolución del hijo ${i+1}`,`motherTransfer.allocations.${i}.share`,{suffix:'%',scale:100,max:100,hint:'El reparto debe sumar el 100 %. Es independiente del porcentaje de propiedad.'})).join('')}</div>${notice('Préstamo familiar: contrato, calendario de pagos y devoluciones reales. Se presenta el modelo 600 exento, generalmente en un mes. Si hay intereses, puede haber IRPF para mamá que esta estimación no calcula.', 'info')}`;
  const giftFields = `<div class="section-gap">${check('La donación se formalizará en escritura pública dentro del plazo legal', 'motherTransfer.giftPublicDeed',
    'La estimación usa la tarifa reducida madre a hijos cuando se cumple. Sin escritura usa la tarifa general.')}</div>
    <div class="form-grid section-gap">${field('Notaría de la donación', 'motherTransfer.giftNotaryCost', {
      hint: 'Presupuesto adicional a la escritura de compra. Si queda a cero, sigue pendiente.',
    })}${transfer.allocations.map((allocation, i) => `<div class="full"><h3>Hijo ${i + 1} · reparto del dinero</h3></div>${field(`Porcentaje de la donación al hijo ${i + 1}`, `motherTransfer.allocations.${i}.share`, {
      suffix: '%', scale: 100, max: 100, hint: 'El reparto total debe sumar el 100 %. No cambia la propiedad de la casa.',
    })}${field(`Patrimonio previo del hijo ${i + 1}`, `motherTransfer.allocations.${i}.preExistingWealth`, {
      hint: 'Puede modificar el coeficiente del impuesto. No son sus ingresos anuales.',
    })}`).join('')}</div>
    ${notice('<strong>Comprar a medias entre hermanos no da derecho a la reducción del 95 % por primera vivienda.</strong> Se calcula la donación ordinaria de madre a hijos. Esa reducción tiene requisitos distintos de los del ITP joven; no se presume por edad ni por comprar vuestra primera casa.')}
    <p class="fine-print">Estimación de donación de dinero bajo normativa catalana, sin donaciones previas acumulables. Hay que confirmar dónde corresponde tributar según la residencia del receptor durante los últimos cinco años; la ubicación de la futura casa no basta. Donaciones del mismo donante en los últimos tres años pueden cambiar el cálculo. El modelo 651 y el pago tienen, generalmente, un plazo de un mes.</p>`;

  if (!enabled) return section('Cómo llega el dinero de mamá a vosotros', 'Hay dos decisiones: su deuda con el banco y la entrega del dinero a sus hijos.',
    `${controls}${notice('Activa el préstamo bancario de mamá para incluir esta entrega en el cálculo. Su préstamo y su cuota se configuran en el apartado anterior.', 'info')}`);

  // Recalculate only in the UI. With a fixed bank principal both variants keep
  // exactly that principal; automatic sizing includes the donation's own tax.
  const current = calculateScenario(s);
  const alternatives = ['family-loan', 'gift'].map((mode) => calculateScenario({
    ...s, motherTransfer: { ...transfer, mode },
  }));
  const [family, gift] = alternatives;
  const usefulMoney = current.valid ? current.familyLoan.principal - current.motherTransfer.totalCosts - current.familyLoan.fee : null;
  const detail = current.valid ? `<div class="status-grid section-gap"><div>
    ${row('Préstamo del banco a mamá', euro(current.familyLoan.principal))}
    ${row('Impuesto de la donación', euro(current.motherTransfer.giftTax, 2))}
    ${row('Notaría de la donación', euro(current.motherTransfer.notaryCost, 2))}
    ${row('Fondos tras impuesto y comisiones', euro(usefulMoney, 2), 'total')}
    </div><div>
    ${row('Cuota que mamá debe al banco', euro(current.familyLoan.monthlyPayment, 2))}
    ${row('Devolución de hijos a mamá', euro(current.motherTransfer.familyMonthlyRepayment, 2))}
    ${row('Parte neta de mamá tras recibir devolución', euro(current.budget.motherNetExternalCostMonthly, 2))}
    ${row('Esfuerzo de los titulares hipotecarios', pct(current.budget.debtRatio))}
    </div></div>${!current.motherTransfer.termsKnown ? notice('Falta el calendario del préstamo familiar. La cuota bancaria de mamá puede estar calculada, pero la devolución de los hijos y su ratio de deuda siguen incompletos.') : ''}${!giftMode&&transfer.repaymentMode==='custom'&&transfer.familyRate===0?notice(`<strong>Los hijos devolvéis capital al 0 %; mamá soporta los intereses de su banco.</strong> ${current.motherTransfer.termsKnown&&current.familyLoan.monthlyPayment!=null?`Ahora el banco cobra ${euro(current.familyLoan.monthlyPayment,2)}/mes y vosotros devolvéis ${euro(current.motherTransfer.familyMonthlyRepayment,2)}/mes. La diferencia neta de mamá es ${euro(current.budget.motherNetExternalCostMonthly,2)}/mes mientras coinciden ambos pagos. `:''}No es un ahorro de intereses para todo el hogar: es una aportación real de mamá. El contrato debe reflejar lo que realmente se devuelve, y Sabadell debe valorar ambas deudas y su sostenibilidad. Si el plazo familiar supera al bancario, las devoluciones pueden continuar después de terminar su banco.`,'info'):''}` : notice('Corrige los importes o el reparto para calcular la entrega. Los campos permanecen editables.', 'error');

  const tableValue = (r, getter, format = euro) => r.valid ? format(getter(r)) : 'Revisar datos';
  const comparison = family.valid && gift.valid ? `<details class="section-gap"><summary>Comparar préstamo familiar y donación</summary>
    <div class="table-wrap"><table><caption>${s.familyLoan.amount == null
      ? 'Importe bancario automático: cada alternativa calcula el capital necesario, hasta el límite disponible.'
      : 'Mismo capital bancario fijado: los impuestos de la donación pueden dejar menos dinero útil.'}</caption>
    <thead><tr><th scope="col">Concepto</th><th scope="col" class="number">Préstamo familiar</th><th scope="col" class="number">Donación</th></tr></thead><tbody>
    ${[
      ['Capital que pide mamá al banco', (r) => r.familyLoan.principal, euro],
      ['Impuesto y notaría de entrega', (r) => r.motherTransfer.totalCosts, euro],
      ['Cuota bancaria de mamá / mes', (r) => r.familyLoan.monthlyPayment, (v) => euro(v, 2)],
      ['Hijos → mamá / mes', (r) => r.motherTransfer.familyMonthlyRepayment, (v) => euro(v, 2)],
      ['Salidas de toda la familia / mes', (r) => r.budget.totalMonthly, (v) => euro(v, 2)],
      ['Deudas / ingresos de titulares', (r) => r.budget.debtRatio, pct],
      ['Dinero que falta para la compra', (r) => r.cash.fundingGap, euro],
    ].map(([label, getter, format]) => `<tr><th scope="row">${label}</th><td class="number">${tableValue(family, getter, format)}</td><td class="number">${tableValue(gift, getter, format)}</td></tr>`).join('')}
    </tbody></table></div><p class="fine-print">«Pendiente» significa que falta un dato contractual. Un ratio mostrado sin plazo del préstamo familiar es el mínimo conocido. Los importes se deben confirmar con la entidad y con la asesoría fiscal.</p></details>` : '';

  return section('Cómo llega el dinero de mamá a vosotros', 'Su préstamo bancario sigue existiendo tanto si os presta el dinero como si os lo dona.',
    `${controls}${giftMode ? giftFields : loanFields}${detail}
    ${notice('<strong>La cuota bancaria de mamá cuenta una sola vez en el presupuesto familiar.</strong> Si los hijos se lo devuelven, ese pago circula dentro de la familia: se muestra para repartir responsabilidades y sí forma parte de la deuda contractual de los titulares ante el banco. No se añade una segunda vez a las salidas de todo el hogar.', 'info')}
    ${comparison}`);
}
