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

La sincronización utiliza Supabase Auth, RLS y membresía por familia. La clave de `config.mjs` es publicable; no es una credencial privilegiada. Un código aleatorio de 192 bits permite unirse al espacio privado y modificar sus viviendas. El servidor conserva únicamente su hash. Compartir el código otorga acceso: conservarlo en privado para recuperar acceso en otro dispositivo. La lista se actualiza al guardar o con «Actualizar lista», sin prometer edición simultánea en tiempo real. La última versión guardada prevalece si dos familiares editan la misma vivienda.

Para entrar desde otro dispositivo, guarda primero la vivienda y abre «Compartir en familia». «Copiar enlace privado» prepara un acceso con la invitación en el fragmento de la URL; no contiene nóminas ni sesiones. El dispositivo receptor entra únicamente al pulsar el botón de acceso. Al entrar, si no hay borrador local y hay una sola vivienda, se abre automáticamente; con varias se muestra la lista. Un borrador existente nunca se sustituye automáticamente. El enlace se retira de la barra de direcciones al leerlo.

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

Los importes bancarios proceden de una conversación y escenarios editables, no de una oferta aprobada. La FEIN, los presupuestos y la situación fiscal de cada adquirente prevalecen. ICF se explora de forma separada del aval ICO. Los seguros, impuestos locales, reformas y gastos de vida deben presupuestarse para cada casa. Las cifras totales de deuda no incluyen treinta años de suministros, seguros o reparaciones futuras.

El préstamo nuevo de la madre se prepara con una hipótesis editable de 5 % TIN a 10 años. Su importe automático cubre la necesidad de compra introducida más un colchón adicional de 3.000 €, con tope de 60.000 €. El colchón permanece como efectivo y se cuenta una sola vez, separado de otras reservas. Los escenarios antiguos mantienen sus tipos/plazos desconocidos. La comparación principal separa alquiler y compra con gastos de vivienda y compara también ambos presupuestos familiares completos. Los suministros a cero se avisan como pendientes.
