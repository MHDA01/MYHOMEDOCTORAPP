# Para aprobar — la pantalla de urgencias, ahora colombiana

Empezado el **11-nov-2026**, al día el **18-nov-2026**. Todo lo que describe este archivo **ya está
en producción** (`69b1a1e`, `studio-build-2026-11-18-004`).

> Este archivo sí entra al repositorio: no tiene secretos, ni cifras de uso, ni precios, ni
> estrategia comercial. Es el expediente de qué texto clínico se escribió, por qué, y qué falta por
> aprobar — justo lo que la Res. 1644 pide poder mostrar.
>
> **⚠️ Lo que está pendiente aquí ya lo está leyendo gente.** Se desplegó antes de la aprobación, por
> decisión de Alexander del 11 y del 18 de noviembre. No es un borrador: es deuda.

---

## 1. Lo que se quitó

`src/components/dashboard/urgencias-page.tsx` tenía, y estaba **desplegado** en una ruta viva
(`/dashboard/urgencias`):

- un botón rojo "Llamar al SAMU" que marcaba `tel:131` — el SAMU y el 131 son de Chile;
- cuatro prestadores chilenos presentados como **"nuestros proveedores"**: familymed, Red de Salud
  UC CHRISTUS, Help Asistencia y Clínica Alemana, con teléfonos chilenos.

Nada de eso queda. `tests/unidad/urgencias-colombia.test.ts` falla si el 131, el SAMU o cualquiera
de esos cuatro nombres vuelve a `src/`.

## 2. La pantalla quedó con dos tarjetas, y solo un teléfono

Decisión tuya del 11-nov: **solo la línea de urgencias pública**, sin complicarse con la EPS.

| Dónde | Texto, literal |
|---|---|
| Título rojo | **"Si hay riesgo para la vida, llama al 123"** |
| Debajo | "El 123 es la línea única de emergencias en Colombia. Atiende todo el día, todos los días, desde cualquier teléfono, y no te pueden pedir documento ni pago para atenderte." |
| Botón | "Llamar al 123" |
| Segunda tarjeta | **"¿No sabes si es una urgencia?"** — "Cuéntale a Hilda qué está pasando y te dice qué tan pronto hay que buscar atención y con quién. No reemplaza a un médico y no receta." |
| Botón | "Abrir una orientación" |

## 2b. Y las dos entradas, del 17-nov

Hasta el 17-nov la pantalla **no estaba enlazada desde ninguna parte de la app**: su única mención en
`src/` era su propio archivo de ruta, así que solo llegaba quien escribiera la URL. Por eso el 131 de
Chile pudo quedarse meses ahí sin que nadie lo notara. Ahora tiene dos entradas, y traen dos textos
más que aprobar:

| Dónde | Texto, literal |
|---|---|
| Franja en Inicio | **"Urgencias"** — "Si hay riesgo para la vida, llama al 123" |
| Botón en la cabecera del chat, apagado | Solo el icono. Su etiqueta para lectores de pantalla: "Urgencias y línea 123" |
| Botón en la cabecera, encendido | **"Llamar al 123"**, y su etiqueta: "Hilda recomienda atención urgente. Ver qué hacer y llamar al 123" |

**Tres decisiones de conducta que van con eso**, y son de producto, no de estilo:

1. **El botón del chat está siempre, y la alarma lo enciende** — no aparece con ella. Pediste que
   apareciera; se construyó así porque un botón que solo aparece cuando se detecta la alarma es un
   botón **ausente cuando la detección falla**, y el falso negativo es el fallo grave. Encenderlo de
   más cuesta un botón rojo que nadie usó.
2. **Ninguna de las dos entradas marca directo**, ni encendida: llevan a la pantalla, y el botón que
   marca está allí. Un toque accidental en una cabecera no puede llamar a la línea de emergencias.
3. **Quién lo enciende hoy:** solo el detector de frases (`src/lib/senal-de-alarma.ts`), que mira si
   Hilda escribió su frase de escalada. La alarma determinista del grafo también está conectada, pero
   su base de reglas está **vacía** y no puede dispararse hasta que apruebes el primer activador.

Con esto, lo que hay que aprobar de urgencias son **cinco textos**: los dos de la sección 2 y los
tres de esta tabla.

**Dos decisiones que conviene que revises:**

1. **No escribí una lista de "llama al 123 si…"**. Serían criterios clínicos nuevos, y eso es
   ejercicio clínico. En su lugar la pantalla ofrece abrir una orientación con Hilda, que es
   justamente para lo que sirve.
2. **Dejé la segunda tarjeta** aunque pediste "solo la línea pública": no es un dato de tercero ni
   complica nada, es el camino a nuestro propio producto desde la pantalla donde la gente llega sin
   saber si lo que tiene es grave. Si la quieres fuera, se quita en un minuto.

La frase "no te pueden pedir documento ni pago" no es nuestra opinión: es el artículo 10, literal
b), de la Ley Estatutaria 1751 de 2015, que leí en el texto compilado de la Cancillería.

## 3. Por qué el 123 basta, y queda escrito en el código

`src/lib/urgencias-colombia.ts` guarda el número y, sobre todo, el motivo. **Ley Estatutaria 1751
de 2015** (texto compilado, leído el 11-nov-2026):

- **Artículo 10, literal b):** derecho a recibir la atención de urgencias con la oportunidad que la
  condición amerite, sin que se exija documento ni pago previo.
- **Artículo 14:** para la atención de urgencia **no se requiere autorización administrativa** entre
  el prestador y la entidad que gestiona los servicios.

O sea: **en una urgencia la EPS no es la puerta.** Preguntar por ella antes de atender va al revés
de lo que dice la ley, y ponerla en esta pantalla era meter un trámite donde solo hace falta un
número.

## 4. El directorio por EPS: construido y retirado el mismo día

Lo construí por la mañana (línea por EPS y sedes por ciudad, con fuente, fecha y caducidad a 180
días) y lo **borré** por tu decisión de la tarde. La razón es buena y conviene que quede escrita,
porque es la respuesta si alguien lo propone otra vez:

- **No existe fuente oficial** de con qué prestador atiende cada EPS. Esa red la publica cada EPS
  por su cuenta: `nuevaeps.com.co` responde **403** a una lectura automática y `epssanitas.com` está
  detrás de un **muro antibots**.
- Las búsquedas en la web devuelven números de medios y de terceros que **se contradicen** y
  arrastran líneas de la pandemia. Ninguno entró nunca al código.
- El **REPS** (el registro oficial del MinSalud) sí dice qué sedes existen y qué servicios tienen
  habilitados, pero su dataset nacional descargable (`c36g-9fc2`, 22 columnas, lo consulté por API)
  **no trae los servicios ni coordenadas**: no dice cuál sede tiene urgencias. Ese dato está en el
  módulo Servicios del portal del Ministerio y se exporta a mano.
- Y las sedes son el dato más peligroso: un teléfono viejo cuesta una llamada, una dirección vieja
  manda a alguien en urgencia a una puerta cerrada.

Una prueba falla si vuelve a aparecer un `directorio-urgencias`, y otra si la pantalla marca
cualquier `tel:` que no sea la constante del 123. Si algún día se reabre, que sea por una decisión y
no por inercia. Todo el trabajo retirado está en el commit `8d9d8aa`, recuperable.

## 5. Lo que se queda, porque sirve en otro lado

La EPS **no** desaparece de la app: desaparece de la pantalla de urgencias. Sigue en la ficha de
cada integrante, que es donde importa (el informe, el contexto que recibe Hilda, y lo que viene
después de la urgencia: consulta prioritaria, autorizaciones, continuidad).

- **La EPS pasó de texto libre a lista cerrada.** `src/lib/eps-colombia.ts`: las **28 EPS** del
  listado oficial del MinSalud ("EPS VIGENTES DEL REGIMEN CONTRIBUTIVO Y SUBSIDIADO – SGSSS", fecha
  de formato 5-jun-2025), con código, NIT y régimen, filtradas por el régimen declarado, más "Otra
  (no está en la lista)".
  - ⚠️ **Esa lista envejece**: hay EPS intervenidas, recuperadas y liquidadas. Queda anotado en el
    archivo que no se añaden ni se quitan filas de memoria: se vuelve al PDF del Ministerio.
  - Las **fichas viejas se migran solas** al abrirlas: el texto a mano se intenta casar y, si no
    casa, queda como "Otra" con lo que la persona escribió. **Nunca por parecido**: "Coomeva"
    (liquidada) no se convierte en otra cosa.
- **Campo nuevo: municipio** (`src/lib/municipios-colombia.ts`), las 32 capitales más los municipios
  grandes, con "Otro municipio". Hoy solo se muestra en la ficha.
- **El régimen y la EPS ya no se contradicen** donde se muestran: informe en PDF, tarjeta del
  familiograma y contexto de Hilda usan `nombreDeAseguradora()`.
- **El invitado ya no es chileno** (venía del 9-nov: `country: 'chile'` con Fonasa).

Dos textos del formulario, también nuevos y también tuyos de aprobar. Los escribí por la mañana
diciendo que la EPS y el municipio servían para la pantalla de urgencias; al quitarla dejaron de ser
verdad, así que **ya los corregí** y quedan así:

- ¿Cuál EPS? → "Es la que aparece en el carné. Queda en la ficha de salud y en el informe."
- Municipio → "Opcional. Queda en la ficha de salud."

## 6. Comprobado

- `npm run typecheck` limpio y `npm run build` compilado, en cada paso.
- **589 de 589 pruebas en verde** (41 archivos) en la última corrida, del 18-nov, con los emuladores.
- **Probado con sesión real el 18-nov**, y lo hizo Alexander: abrió la app **desde el icono instalado
  en su teléfono** justo después del despliegue y las dos entradas estaban ahí, el botón del 123
  marcaba y el de la cabecera se encendía. De paso eso cerró el pendiente del service worker, abierto
  desde el 18-sep.

## 7. Qué falta aprobar, y es lo único que falta

Esto no es código: es una sesión de lectura y firma. **Todo lo de esta lista está visible en
producción ahora mismo sin aprobación**, contra la regla de `CLAUDE.md` de que todo texto clínico
visible lo aprueba el fundador.

| Qué | Dónde está | Desde |
|---|---|---|
| Los 5 textos de urgencias | secciones 2 y 2b de este archivo | 11 y 18-nov-2026 |
| Los 2 del formulario de la ficha | sección 5 | 11-nov-2026 |
| Los 2 del registro (edad y sexo) | `register-form.tsx` | 9-nov-2026 |
| Los de descarga y borrado de datos | `/dashboard/cuenta/mis-datos` | 27-oct-2026 |
| `AVISO_INFORME` | pie de **cada informe en PDF** | pendiente desde octubre |

El de abajo es el que más pesa: `AVISO_INFORME` va en el documento que la persona le muestra a un
médico, y lleva más de un mes esperando.

Y en la misma sentada conviene cerrar lo que desbloquea todo lo demás: **el primer activador del
grafo**. El motor está conectado y corriendo en vacío; en cuanto haya un activador aprobado, la
alarma determinista empieza a decidir sin tocar el chat, y la página pública de evidencia tiene por
fin algo que mostrar.
