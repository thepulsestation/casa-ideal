// Fuentes primarias revisadas el 17 de octubre de 2026 (Europe/Madrid).
// Las cifras bancarias publicitadas son ejemplos; prevalecen la oferta y la FEIN.
export const SOURCES_REVIEWED_AT = '2026-10-17';

export const SOURCES = [
  {
    id: 'atc-itp',
    title: 'ATC · ITP: tipos y requisitos',
    url: 'https://atc.gencat.cat/es/tributs/itpajd/tpo/tarifes-tipus/',
    summary: 'Vivienda usada: tipo general progresivo. El 5 % joven depende de edad, renta fiscal y uso habitual, comprobados por adquirente y participación.',
  },
  {
    id: 'atc-base',
    title: 'ATC · Base imponible y valor de referencia',
    url: 'https://atc.gencat.cat/es/tributs/itpajd/tpo/base-imposable/',
    summary: 'Con valor de referencia, la base del ITP es el mayor entre ese valor, el declarado y el precio pactado. Sin valor de referencia, también interviene el valor de mercado. La tasación hipotecaria es otro dato.',
  },
  {
    id: 'aeat-iva',
    title: 'AEAT · Comprar vivienda: IVA o ITP',
    url: 'https://sede.agenciatributaria.gob.es/Sede/iva/iva-operaciones-inmobiliarias/compro-vivienda-tengo-que-pagar-itp.html',
    summary: 'La primera entrega por el promotor normalmente tributa por IVA al 10 %. La vivienda usada normalmente tributa por ITP. Ciertas viviendas protegidas tienen IVA del 4 %, que requiere una calificación concreta.',
  },
  {
    id: 'atc-ajd',
    title: 'ATC · AJD en la compraventa',
    url: 'https://atc.gencat.cat/ca/tributs/itpajd/operacions/immobles/compravenda-immobles/',
    summary: 'La compraventa sujeta y no exenta de IVA formalizada en escritura pública también tributa por AJD, normalmente al 1,5 % en Cataluña. Es distinto del AJD de constitución de la hipoteca.',
  },
  {
    id: 'atc-ajd-joven',
    title: 'ATC · Bonificación de AJD para jóvenes',
    url: 'https://atc.gencat.cat/es/tributs/itpajd/ajd/documents-notarials/bonificacions/',
    summary: 'Desde el 27/06/2025 puede bonificarse el 100 % del AJD de adquisición de vivienda habitual para personas de 35 años o menos, con renta fiscal máxima de 36.000 €. Esta bonificación no elimina el IVA.',
  },
  {
    id: 'icf-emancipacio',
    title: 'ICF · Préstec Habitatge Emancipació',
    url: 'https://www.icf.cat/es/prestecs/habitatge/icf-habitatge-emancipacio',
    summary: 'Préstamo para solicitantes de 18 a 40 años incluidos, al 0 % y sin comisiones: hasta el 20 % del menor entre precio y tasación, máximo 50.000 €. Se devuelve tras la hipoteca, en cinco años. La vivienda queda protegida permanentemente.',
  },
  {
    id: 'icf-guia',
    title: 'ICF · Guía de solicitud y disposición del dinero',
    url: 'https://www.icf.cat/es/prestecs/habitatge/icf-habitatge-emancipacio/guia',
    summary: 'Los titulares de ICF y de la hipoteca deben coincidir. Tras firmar, el banco ingresa la financiación conjunta y la transfiere al vendedor. La guía no garantiza anticipar las arras ni reintegrar anticipos anteriores.',
  },
  {
    id: 'icf-bases-2026',
    title: 'DOGC · Resolución TER/1649/2026: modificación de bases ICF',
    url: 'https://dogc.gencat.cat/es/document-del-dogc/index.html?documentId=1045529',
    summary: 'Modificación de las bases reguladoras del programa Emancipació, enlazada por la ficha oficial del ICF. Los requisitos y la aprobación deben contrastarse con la convocatoria y la resolución aplicables.',
  },
  {
    id: 'ico-convenio',
    title: 'BOE · Convenio de avales ICO para primera vivienda',
    url: 'https://www.boe.es/diario_boe/txt.php?id=BOE-A-2024-9128',
    summary: 'El aval ICO es una garantía de parte del préstamo bancario; la deuda se debe íntegramente. La concesión depende del banco. No es el préstamo ICF. Este convenio base no sustituye la comprobación de modificaciones y disponibilidad actuales.',
  },
  {
    id: 'bde-gastos',
    title: 'Banco de España · Gastos de la hipoteca',
    url: 'https://clientebancario.bde.es/pcb/es/menu-horizontal/productosservici/financiacion/hipotecas/guia-textual/primerospasoscon/Gastos_asociados_a_la_hipoteca.html',
    summary: 'En la constitución de la hipoteca, el cliente paga la tasación y el banco asume notaría, registro, impuestos y gestoría. Los gastos propios de comprar la vivienda se presupuestan por separado.',
  },
  {
    id: 'bde-endeudamiento',
    title: 'Banco de España · Endeudamiento para la primera hipoteca',
    url: 'https://clientebancario.bde.es/pcb/es/blog/consejos-para-firmar-tu-primera-hipoteca.html',
    summary: 'Como orientación, las entidades suelen considerar un endeudamiento del 30–35 % de los ingresos, incluyendo otras deudas. No es una garantía de aprobación ni un umbral legal universal; la entidad evalúa la solvencia completa.',
  },
  {
    id: 'bde-seguros',
    title: 'Banco de España · Seguros exigidos y pólizas alternativas',
    url: 'https://clientebancario.bde.es/pcb/es/blog/seguro-hipotecas.html',
    summary: 'Para seguros exigidos como garantía del préstamo o daños, deben aceptarse pólizas equivalentes de otro proveedor sin cobrar su análisis ni empeorar las condiciones. Hay que distinguirlos de productos combinados opcionales que ofrecen una bonificación.',
  },
  {
    id: 'bde-bonificaciones',
    title: 'Banco de España · Comparar las bonificaciones',
    url: 'https://clientebancario.bde.es/pcb/en/blog/productos-combinados.html',
    summary: 'Una cuota hipotecaria menor puede ir acompañada de seguros más caros. La comparación debe sumar intereses y primas, contrastar ofertas externas equivalentes y considerar las coberturas contratadas.',
  },
  {
    id: 'sabadell-fija',
    title: 'Banco Sabadell · Hipoteca fija: información pública',
    url: 'https://www.bancsabadell.com/bsnacional/es/particulares/hipotecas/hipoteca-fija/',
    summary: 'La financiación ordinaria publicada llega al 80 % del menor entre precio y tasación para primera residencia. La cuota usa amortización francesa. Los seguros, el mantenimiento de cuenta y las bonificaciones deben revisarse en la oferta particular.',
  },
  {
    id: 'atc-prestamo-familiar',
    title: 'ATC · Préstamos entre particulares',
    url: 'https://atc.gencat.cat/es/tributs/itpajd/operacions/prestecs-garanties/prestec/',
    summary: 'Un préstamo de un particular está sujeto pero exento: la persona que recibe el dinero presenta el modelo 600, tarifa DRG y exención 128, con el contrato. El préstamo bancario de la madre y su entrega a compradores son operaciones distintas.',
  },
  {
    id: 'atc-donaciones',
    title: 'ATC · Donaciones: operaciones sujetas',
    url: 'https://atc.gencat.cat/es/tributs/isd/donacions/operacions/',
    summary: 'La entrega gratuita de dinero puede tributar como donación. Si la aportación familiar es una donación, debe presupuestarse y documentarse según sus propias reglas; no se aplica automáticamente la exención del préstamo entre particulares.',
  },
  {
    id: 'atc-donaciones-tarifa',
    title: 'ATC · Donaciones: tarifa y patrimonio previo',
    url: 'https://atc.gencat.cat/es/tributs/isd/donacions/tarifa-coeficients-multiplicadors/',
    summary: 'Madre e hijos pertenecen a los grupos I o II. Con escritura pública pueden aplicar la tarifa reducida del 5 %, 7 % y 9 %. El patrimonio previo determina el coeficiente multiplicador.',
  },
  {
    id: 'atc-donaciones-dinero',
    title: 'ATC · Donar dinero y formalizar la escritura',
    url: 'https://atc.gencat.cat/es/tributs/isd/donacions/com-fer-una-donacio/donacio-de-diners/',
    summary: 'Si el dinero se entrega antes de la escritura, para aplicar la tarifa reducida debe elevarse a público dentro de un mes desde la entrega. Sin los requisitos, corresponde la tarifa general.',
  },
  {
    id: 'atc-donaciones-vivienda',
    title: 'ATC · Reducción por primera vivienda de descendientes',
    url: 'https://atc.gencat.cat/es/tributs/isd/donacions/reduccions/',
    summary: 'La reducción del 95 % tiene límites y condiciones propios. Comprar una parte indivisa entre hermanos no cumple la definición publicada de adquisición de primera vivienda a estos efectos.',
  },
  {
    id: 'atc-donaciones-651',
    title: 'ATC · Declarar una donación: modelo 651',
    url: 'https://atc.gencat.cat/es/tributs/isd/donacions/declarar-donacio/',
    summary: 'Cada receptor declara su donación y paga normalmente dentro de un mes. Las donaciones del mismo donante en los tres años anteriores pueden acumularse para calcular el tipo.',
  },
  {
    id: 'atc-donaciones-residencia',
    title: 'ATC · Administración competente en donaciones',
    url: 'https://atc.gencat.cat/es/tributs/isd/donacions/competencies/',
    summary: 'Para dinero recibido por residentes en España, importa la comunidad donde el receptor residió más días en los últimos cinco años. La ubicación de la futura vivienda no determina por sí sola la tributación de la donación dineraria.',
  },
  {
    id: 'atc-prestamo-familiar-plazo',
    title: 'ATC · Contrato y plazo del préstamo familiar',
    url: 'https://atc.gencat.cat/ca/que-cal-fer/prestec-particulars/',
    summary: 'La persona que recibe el préstamo presenta el modelo 600 exento con el contrato. El plazo es un mes desde su firma, aunque no resulte cuota a ingresar.',
  },
  {
    id: 'cc-intereses-prestamo',
    title: 'BOE · Código Civil: intereses del préstamo',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-1889-4763#art1755',
    summary: 'El artículo 1755 dispone que el préstamo no devenga intereses salvo pacto expreso. Un préstamo al 0 % sigue siendo una deuda que debe devolverse según el acuerdo.',
  },
  {
    id: 'lcci-solvencia',
    title: 'BOE · Información y evaluación de solvencia',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2019-3814#ar-12',
    summary: 'Los artículos 11 y 12 regulan la evaluación de solvencia y la información correcta, completa y pertinente. Documentar la aportación familiar no asegura la aprobación de la hipoteca.',
  },
  {
    id: 'cccat-arras',
    title: 'BOE · Código civil de Cataluña: arras y financiación',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2017-2466',
    summary: 'El artículo 621-8 considera las arras un anticipo del precio. El 621-49 regula el desistimiento por financiación denegada cuando el contrato prevé financiación, con condiciones, plazos y posibles pactos en contrario.',
  },
];

export const TAX_NOTES = [
  {
    id: 'joven-individual',
    title: 'El 5 % se verifica persona por persona',
    sourceIds: ['atc-itp'],
    summary: 'Edad de 35 años o menos a la compra y, en la última declaración aplicable de IRPF, base general más ahorro menos mínimo personal y familiar no superior a 36.000 €. No equivale al salario bruto ni al neto. Dos hermanos no pierden el beneficio por comprar juntos: cada uno debe cumplir para su parte.',
  },
  {
    id: 'habitual',
    title: 'La vivienda habitual tiene condiciones',
    sourceIds: ['atc-ajd-joven'],
    summary: 'Ocupar de forma efectiva dentro de doce meses y residir tres años continuados, salvo causas que obliguen a cambiar. El beneficio es provisional y su pérdida puede exigir liquidación complementaria con intereses. La declaración de IRPF aplicable depende de la fecha de transmisión y de presentación.',
  },
  {
    id: 'itp-general',
    title: 'El tipo general depende del valor completo',
    sourceIds: ['atc-itp'],
    summary: 'Escala: 10 % hasta 600.000 €; 11 % en los siguientes 300.000 €; 12 % en los siguientes 600.000 €; 13 % en el resto. En copropiedad se calcula sobre el valor total y se reparte. Otros supuestos especiales requieren revisión.',
  },
  {
    id: 'rural',
    title: 'Algunas compras rurales tienen otros tipos',
    sourceIds: ['atc-itp'],
    summary: 'Existen tipos del 4 % y 3 % para determinados municipios rurales, con requisitos adicionales. No se aplican automáticamente por ser una casa o estar fuera de una ciudad.',
  },
  {
    id: 'sin-itp-cero-joven',
    title: 'Ser joven o usar ICF no convierte el ITP en cero',
    sourceIds: ['atc-itp', 'atc-ajd-joven', 'aeat-iva', 'icf-emancipacio'],
    summary: 'ICF no elimina los impuestos de compra. La bonificación juvenil del 100 % corresponde al AJD cuando resulte aplicable; no elimina el IVA. En vivienda usada se calcula el ITP de cada comprador. Un 0 % individual requiere un supuesto fiscal específico confirmado.',
  },
  {
    id: 'valor-referencia',
    title: 'Precio, tasación y valor de referencia son distintos',
    sourceIds: ['atc-base'],
    summary: 'La tasación afecta a la financiación bancaria. El valor de referencia puede aumentar la base del ITP aunque el precio negociado sea menor. Si no se conoce, el cálculo sobre el precio es provisional y debe comprobarse antes de cerrar la compra.',
  },
  {
    id: 'icf-requisitos',
    title: 'ICF requiere un estudio específico',
    sourceIds: ['icf-emancipacio', 'icf-guia', 'icf-bases-2026'],
    summary: 'Todos los solicitantes: 18–40 años incluidos, empadronamiento en Cataluña, primera vivienda habitual y solvencia. El límite de 6,5 IRSC cuenta los ingresos brutos anuales de toda la convivencia futura, incluidos quienes no piden el préstamo. Deben coincidir los titulares de ICF e hipoteca. No basta la nómina neta.',
  },
  {
    id: 'icf-250000',
    title: '50.000 € de ICF no es un precio máximo de 250.000 €',
    sourceIds: ['icf-emancipacio'],
    summary: 'La información oficial prevé aportar recursos propios cuando banco e ICF no cubren el precio. No presenta los 250.000 € como límite general de compra. Impuestos y gastos requieren financiación aparte. La aprobación sigue siendo necesaria.',
  },
  {
    id: 'icf-futuro',
    title: 'El ICF se devuelve y deja límites permanentes',
    sourceIds: ['icf-emancipacio'],
    summary: 'La hipoteca bancaria puede durar hasta treinta años; después se devuelve el ICF durante cinco años. Un importe de 50.000 € supone aproximadamente 833,33 €/mes en esa etapa. La protección permanente limita venta y alquiler incluso si se amortiza antes.',
  },
  {
    id: 'gastos-separados',
    title: 'Comprar y constituir la hipoteca son trámites distintos',
    sourceIds: ['bde-gastos'],
    summary: 'No sumar al comprador los gastos de constitución hipotecaria que corresponden al banco. Sí prever la tasación y los gastos de compraventa que le correspondan, con presupuestos de notaría, registro, gestiones, asesoría y posibles comisiones.',
  },
  {
    id: 'arras-anticipo',
    title: 'Las arras requieren liquidez antes de la escritura',
    sourceIds: ['cccat-arras', 'icf-guia'],
    summary: 'Son parte del precio y no se suman dos veces. ICF se dispone en la firma, por lo que una reserva anterior necesita liquidez puente. Confirmar por escrito el circuito de anticipos y si pueden recuperarse: no se presume un reintegro para amortizar el préstamo de la madre.',
  },
  {
    id: 'ratio-titulares',
    title: 'El esfuerzo hipotecario considera las otras deudas',
    sourceIds: ['bde-endeudamiento', 'lcci-solvencia'],
    summary: 'La referencia del 35 % es orientativa. Al esfuerzo de los titulares se añaden sus cuotas existentes y las devoluciones que pacten con la madre. La cuota bancaria de ella se cuenta una vez en el hogar; no se atribuye automáticamente como deuda bancaria de los hijos.',
  },
  {
    id: 'prima-seguros',
    title: 'El recibo del seguro puede no ser mensual',
    sourceIds: ['sabadell-fija', 'bde-bonificaciones'],
    summary: 'Separar la provisión mensual del cobro real: Sabadell publica ejemplos de hogar mensual, vida trimestral y protección de pagos anual. Son ejemplos, no presupuestos para esta familia ni para una casa concreta. El coste cambia con la vivienda, edades, capital y coberturas.',
  },
  {
    id: 'prestamo-madre',
    title: 'La aportación familiar también tiene documentación',
    sourceIds: ['atc-prestamo-familiar', 'atc-donaciones', 'lcci-solvencia'],
    summary: 'La madre puede quedar fuera de la propiedad y seguir debiendo su préstamo al banco. Su entrega a los compradores debe definirse como donación o préstamo familiar. Informar al banco del origen del dinero, contratos y devoluciones; no presentar dinero prestado como ahorro propio.',
  },
  {
    id: 'donacion-tarifa',
    title: 'La donación tributa por cada receptor',
    sourceIds: ['atc-donaciones-tarifa', 'atc-donaciones-dinero'],
    summary: 'Con escritura pública válida: 5 % hasta 200.000 € de base liquidable, 7 % entre 200.000 y 600.000 €, y 9 % sobre el resto. Sin ella: escala general del 7 %, 11 %, 17 %, 24 % y 32 %, con umbrales de 50.000, 150.000, 400.000 y 800.000 €. La tarifa reducida no exige por sí misma ser joven.',
  },
  {
    id: 'donacion-patrimonio',
    title: 'El patrimonio previo modifica el impuesto',
    sourceIds: ['atc-donaciones-tarifa'],
    summary: 'En grupos I y II: coeficiente 1 hasta 500.000 €; 1,10 hasta 2.000.000 €; 1,15 hasta 4.000.000 €; 1,20 por encima. Existe alivio para evitar un salto de cuota superior al exceso de patrimonio sobre el umbral. Deben revisarse donaciones anteriores.',
  },
  {
    id: 'donacion-hermanos',
    title: 'Comprar entre hermanos no da automáticamente la reducción del 95 %',
    sourceIds: ['atc-donaciones-vivienda'],
    summary: 'Esta reducción exige adquirir la plena propiedad de toda la vivienda; la adquisición de una parte indivisa se contempla para cónyuges o futuros contrayentes. En una compra al 50 % entre hermanos se presupuesta sin la reducción, salvo confirmación fiscal específica.',
  },
  {
    id: 'donacion-reduccion-condiciones',
    title: 'Requisitos especiales de la reducción por primera vivienda',
    sourceIds: ['atc-donaciones-vivienda'],
    summary: 'Si la adquisición cumple: edad máxima de 36 años, salvo discapacidad de al menos el 65 %; renta fiscal máxima de 36.000 €; reducción del 95 %, con máximo acumulado de 60.000 € o 120.000 € por discapacidad. Escritura con finalidad expresa dentro de un mes desde la entrega; compra dentro de seis meses desde la primera donación. Ocupar en doce meses y mantener residencia tres años, salvo excepciones.',
  },
  {
    id: 'donacion-modelo-plazo',
    title: 'Plazo y acumulaciones de la donación',
    sourceIds: ['atc-donaciones-651'],
    summary: 'Modelo 651 por cada hijo que recibe dinero, generalmente dentro de un mes desde la donación. Si hubo otras donaciones de la misma madre al mismo hijo durante los tres años anteriores, pueden modificar el tipo. El dinero reservado al impuesto y al notario reduce lo disponible para la compra.',
  },
  {
    id: 'donacion-residencia',
    title: 'Confirmar dónde tributa cada donación de dinero',
    sourceIds: ['atc-donaciones-residencia'],
    summary: 'La simulación catalana de donaciones presupone que corresponde esta normativa por la residencia del receptor. Comprar una casa en Cataluña no basta para confirmar ese punto; para residentes en España se considera la permanencia de cada donatario durante los cinco años anteriores.',
  },
  {
    id: 'prestamo-familiar-cero',
    title: 'El préstamo familiar al 0 % se documenta y se devuelve',
    sourceIds: ['atc-prestamo-familiar-plazo', 'cc-intereses-prestamo'],
    summary: 'Contrato con importe, receptores, interés pactado del 0 % y calendario de devolución. Presentar modelo 600 exento dentro de un mes. Las devoluciones a la madre son obligaciones de los compradores aunque ella no sea titular de la hipoteca. La deuda bancaria de la madre continúa por separado.',
  },
  {
    id: 'deuda-banco-visible',
    title: 'El origen familiar no sustituye el estudio del banco',
    sourceIds: ['lcci-solvencia'],
    summary: 'La simulación no convierte un préstamo en ahorro ni garantiza financiación. Entregar al banco la información correcta sobre la aportación familiar y las cuotas comprometidas. La aceptación del origen de fondos y de la capacidad de pago debe quedar confirmada en el estudio de la operación.',
  },
];

// Puntos de conversación; son preguntas para obtener condiciones escritas,
// no una oferta publicada ni una aprobación del banco.
export const QUESTIONS_FOR_BANK = [
  '¿Cuál es el TIN inicial, el TIN sin bonificaciones y el plazo ofrecido por escrito?',
  '¿Qué rebaja exacta aporta cada producto y cuándo se revisa?',
  '¿Cuánto cuesta cada seguro, a quién cubre y con qué periodicidad se cobra?',
  '¿Hay prima única financiada, comisión de cuenta, apertura o amortización anticipada?',
  '¿Qué parte de la compraventa financian si la tasación resulta inferior al precio?',
  '¿Cómo tratarán el préstamo bancario de la madre y el préstamo familiar a los compradores?',
  '¿Cuándo se dispone de cada financiación y cómo se cubren las arras antes de escriturar?',
  '¿Cuál es el presupuesto desglosado de provisión de fondos, separando compra e hipoteca?',
];

export const SOURCE_BY_ID = Object.fromEntries(SOURCES.map((source) => [source.id, source]));
