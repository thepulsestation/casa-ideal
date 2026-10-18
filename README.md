# Casa Ideal

Calculadora familiar de compra de vivienda en Cataluña, centrada en los escenarios comentados con Banco Sabadell. Aplicación estática sin instalación ni servicios de pago necesarios para calcular.

## Uso

La vista general muestra todas las viviendas guardadas. «Añadir vivienda» permite crear una casa o piso con nombre, anuncio, precio, imágenes HTTPS y notas; «Editar vivienda» conserva su identidad y sus cálculos. El nuevo escenario reutiliza los ingresos, deudas y gastos cotidianos del hogar y reinicia los datos propios del inmueble. Completa compra, hipoteca y presupuesto. Los datos pendientes se muestran como tales: no se presume que un seguro desconocido o un préstamo sin oferta cueste cero.

La vista general separa hipoteca, coste de vivir en la casa, presupuesto familiar completo, dinero inicial y momentos de pago. Las arras se descuentan del precio. Se muestran ingresos mensuales normales y media de pagas extra por separado.

El presupuesto distingue a los dos titulares hipotecarios de las cuatro personas del hogar. Madre y hermana tienen su propia nómina y número de pagas; sus ingresos mejoran el margen familiar sin añadirse al cálculo de esfuerzo de los titulares. Las pagas extra aparecen en la media anual y como importe anual, sin contarlas como ingresos de un mes ordinario.

Agua, electricidad/gas, internet, alimentación, transporte, trastero y otros gastos se introducen una sola vez y se usan en alquiler y compra. El presupuesto es para todo el hogar, sin multiplicarlo por cuatro. Los suministros distintos quedan como opción avanzada. Las copias anteriores conservan los importes actuales como referencia; si solo estaban rellenados los actuales, se reutilizan en el presupuesto común. Solo se suma el total conjunto o su desglose, nunca ambos.

IBI, residuos y comunidad/conservación se separan como gastos de la compra. Una provisión opcional de 250 €/mes (1.500 €/año IBI, 300 €/año residuos y 100 €/mes comunidad) es exclusivamente una hipótesis editable, nunca un máximo ni una estimación municipal derivada del precio o los metros. Requiere comprobar recibos y cuotas. El asistente de IBI usa su base liquidable y el tipo municipal, sin mezclar precio de compra ni valor de referencia. Recogida y tratamiento de residuos pueden generar recibos distintos. Mantenimiento y derramas no están incluidos en esa provisión.

La deuda bancaria de la madre y la entrega a sus hijos son operaciones distintas. Se comparan donación y préstamo familiar; la devolución interna entre hijos y madre no se duplica en el presupuesto consolidado. Se refleja por separado en el esfuerzo de los titulares hipotecarios. Las estimaciones fiscales requieren verificar residencia, parentesco, donaciones anteriores y los contratos definitivos.

## Datos y familia

Los borradores y viviendas se guardan en el navegador. Exportar JSON permite conservar una copia; contiene los datos financieros introducidos. No contiene sesiones ni invitaciones. El código público no incluye ingresos privados ni transcripciones.

La sincronización utiliza Supabase Auth, RLS y membresía por familia. La clave de `config.mjs` es publicable; no es una credencial privilegiada. Un código aleatorio de 192 bits permite unirse al espacio privado y modificar sus viviendas. El servidor conserva únicamente su hash. Compartir el código otorga acceso: conservarlo en privado para recuperar acceso en otro dispositivo. La lista familiar usa el servidor como fuente de verdad; las copias antiguas del navegador no vuelven a añadir viviendas borradas. Se consulta cada 10 segundos mientras la ventana está visible y al volver a ella o recuperar conexión. Los campos válidos de viviendas existentes se guardan automáticamente tras una breve pausa; los nuevos inmuebles se crean con «Añadir y calcular». Una edición o borrado usa la revisión original del servidor: si otro dispositivo cambió o eliminó la vivienda, se conserva el borrador y se pide revisar la versión familiar. Las pestañas con versiones antiguas deben recargarse para adoptar estas protecciones.

Para entrar desde otro dispositivo, guarda primero la vivienda y abre «Compartir en familia». «Copiar enlace privado» prepara un acceso con la invitación en el fragmento de la URL; no contiene nóminas ni sesiones. Los enlaces privados nuevos abren directamente la familia sin escribir un código. La invitación se mantiene en el fragmento al navegar, de modo que la dirección completa también se puede compartir o guardar como favorito; el enlace público sin invitación nunca muestra datos de la familia. Los enlaces antiguos conservan su acceso manual. Al entrar se respeta el borrador existente, y si difiere de la versión del servidor se conserva para revisión. Un borrador de otra familia no se envía implícitamente al espacio nuevo. Una copia financiera JSON no sustituye a la copia privada del enlace de acceso.

Esquema completo: `supabase-schema.sql`. Configuración y pruebas RLS: carpeta `supabase/` del checkout local. La sesión anónima identifica cada navegador; borrar sus datos elimina esa sesión, pero se puede volver a entrar con el código de familia.

## Desarrollo y validación

Requiere Node.js 20+ para las pruebas y el servidor de desarrollo. La aplicación publicada solo requiere un navegador moderno con HTTPS.

```sh
npm test
npm start
```

El servidor local escucha en http://127.0.0.1:43187. GitHub Pages sirve los archivos desde la raíz de `main`. No hay compilación ni dependencias externas.

`finance.mjs` contiene el modelo y sus pruebas. `storage.mjs` contiene persistencia y REST; `sources.mjs`, las fuentes oficiales verificadas y preguntas pendientes. Los porcentajes de TIN son números como 3.7; LTV, participación e impuestos son fracciones como 0.8 o 0.05.

## Límites de los resultados

El tipo reducido puede aplicarse como hipótesis explícita por comprador sin marcar sus requisitos como comprobados; ambas situaciones se muestran y validan por separado. Los honorarios de agencia pendientes impiden dar por cerrado el presupuesto aunque exista una provisión general.

Las ofertas de referencia del préstamo de la madre se conservan como datos privados del escenario, con TIN para el cálculo y TAE informativa. Los límites y comisiones que se negocian no se presentan como condiciones aprobadas. El préstamo familiar puede tener un interés y un plazo propios; una nueva vivienda conserva esa elección y la tabla de plazos bancarios no cambia el contrato familiar implícitamente.

Los gastos se introducen como importes finales, con IVA cuando corresponda. En los presupuestos por concepto, reformas y mudanza se puede indicar expresamente un importe sin IVA, su tipo y los suplidos incluidos que no reciben el recargo. El modelo añade ese IVA una sola vez al coste y a la necesidad de financiación; tasación y asesoría incluyen su IVA antes de firmar. La provisión general sigue siendo un total orientativo, sin multiplicarla por el 21 %: falta confirmar si la estimación verbal de 3.000–5.000 € cubre IVA y todos los conceptos. Los impuestos sobre la vivienda, arras, reservas y otros gastos no reciben un IVA general adicional.

Los importes bancarios proceden de una conversación y escenarios editables, no de una oferta aprobada. La FEIN, los presupuestos y la situación fiscal de cada adquirente prevalecen. ICF se explora de forma separada del aval ICO. Los seguros, impuestos locales, reformas y gastos de vida deben presupuestarse para cada casa. Las cifras totales de deuda no incluyen treinta años de suministros, seguros o reparaciones futuras.

El plan solicitado explora hipoteca Sabadell del 80 % más ICF hasta el 20 % (máximo 50.000 €), sujeto a concesión y elegibilidad sin confirmar. Los planes anteriores se actualizan una sola vez a esta simulación; después se respetan cambios explícitos como desactivar el ICF. La actualización mantiene ingresos, deudas y requisitos fiscales individuales. El préstamo nuevo de la madre se prepara con una hipótesis editable de 5 % TIN a 10 años y compara 10, 15 y 20 años sin afirmar que una entidad los ofrezca. Su importe automático cubre sólo el precio que no financien hipoteca/ICF, impuestos, gastos, reformas y reservas introducidos, más un colchón adicional de 3.000 €, con tope de 60.000 €. El colchón permanece como efectivo y se cuenta una sola vez, separado de otras reservas. Los escenarios antiguos mantienen sus tipos/plazos desconocidos. La comparación principal separa alquiler y compra con gastos de vivienda y compara también ambos presupuestos familiares completos. Los suministros a cero se avisan como pendientes.

El reparto de los gastos de ITP se calcula sobre la participación de cada titular y su tipo individual confirmado. La devolución simulada a mamá puede igualar la cuota de su banco o usar otro calendario pactado: afecta al esfuerzo de los titulares, pero no se vuelve a sumar al presupuesto consolidado. El 35 % es una referencia editable y no una aprobación bancaria. Las arras son un anticipo del precio: no se duplican como coste ni se presume que el ICF las anticipe o reintegre.

## Fotos, características y trayectos

Las fotos del cálculo y las portadas se abren en un diálogo dentro de la página, con contador, flechas, miniaturas y cierre con Escape. Las habitaciones, baños y superficie se muestran también en el detalle. Sólo se cargan imágenes HTTPS y no se envía la URL privada como referente.

«Ubicación y trayectos» conserva tres destinos editables por vivienda, con origen, kilómetros, minutos mínimos/máximos, transbordos, horario y fuentes. El botón de ruta abre Google Maps en transporte público sin clave de API; los datos no se consultan automáticamente. Cambiar origen o destino invalida los tiempos anteriores. Crear otra vivienda conserva preferencias de destino y reinicia las mediciones del inmueble anterior.

La ficha pública de Navàs se completa una sola vez, respetando posteriores correcciones: 75 m², 4 habitaciones según características (la descripción menciona 3), un baño. Las rutas son referencias con origen en la estación de autobuses de Navàs, no en una calle exacta del piso. Los ejemplos del GTFS interurbano oficial consultado el 17/10/2026 corresponden al lunes 19/10/2026: 62 min hasta Zona Universitària en una expedición, o 76–86 min hasta Gran Via/Balmes en las expediciones citadas. No son tiempos puerta a puerta ni un rango exhaustivo del día; kilómetros y duración completa quedan pendientes. Los destinos de referencia son la estación de tren de Sant Joan Despí, Elisava (La Rambla 30–32) y Leonardo Royal Barcelona Fira (Alts Forns 40). Las conexiones y los servicios de vuelta deben comprobarse para el día y la hora concretos.
