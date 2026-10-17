# Casa Ideal

Calculadora familiar de compra de vivienda en Cataluña, centrada en los escenarios comentados con Banco Sabadell. Aplicación estática sin instalación ni servicios de pago necesarios para calcular.

## Uso

Abre la aplicación, introduce el precio del anuncio y completa compra, hipoteca y presupuesto. Guarda cada casa con nombre, anuncio y notas. Los datos pendientes se muestran como tales: no se presume que un seguro desconocido o un préstamo sin oferta cueste cero.

La vista general separa hipoteca, coste de vivir en la casa, presupuesto familiar completo, dinero inicial y momentos de pago. Las arras se descuentan del precio. Se muestran ingresos mensuales normales y media de pagas extra por separado.

La deuda bancaria de la madre y la entrega a sus hijos son operaciones distintas. Se comparan donación y préstamo familiar; la devolución interna entre hijos y madre no se duplica en el presupuesto consolidado. Se refleja por separado en el esfuerzo de los titulares hipotecarios. Las estimaciones fiscales requieren verificar residencia, parentesco, donaciones anteriores y los contratos definitivos.

## Datos y familia

Los borradores y viviendas se guardan en el navegador. Exportar JSON permite conservar una copia; contiene los datos financieros introducidos. No contiene sesiones ni invitaciones. El código público no incluye ingresos privados ni transcripciones.

La sincronización utiliza Supabase Auth, RLS y membresía por familia. La clave de `config.mjs` es publicable; no es una credencial privilegiada. Un código aleatorio de 192 bits permite unirse al espacio privado y modificar sus viviendas. El servidor conserva únicamente su hash. Compartir el código otorga acceso: conservarlo en privado para recuperar acceso en otro dispositivo. La lista se actualiza al guardar o con «Actualizar lista», sin prometer edición simultánea en tiempo real. La última versión guardada prevalece si dos familiares editan la misma vivienda.

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
