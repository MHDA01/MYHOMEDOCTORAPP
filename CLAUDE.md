# MyHome DoctorApp — reglas de la casa

App colombiana de **teleorientación** en salud familiar. Next.js 15 + Tailwind + Radix/shadcn sobre
Firebase (Auth, Firestore, Functions, App Hosting). Producción: https://myhomedoctorapp.com,
proyecto `myhomedoctorapp`. Desarrollo en el puerto 9002 (`npm run dev`).

Este archivo guarda lo que **no se vuelve a discutir**. Si algo de aquí choca con lo que pides, dilo
antes de hacerlo.

> **Este repositorio es público.** Nada de secretos en el código ni en `apphosting.yaml`, y nada de
> cifras de uso, precios ni estrategia comercial en archivos rastreados.

## La visión

"Un médico y su consultorio en el bolsillo." El layout se puede mover; **el comportamiento no, sin
aprobación de Alexander**. Todo texto clínico visible lo aprueba él. **Lo aprobado y su fecha
vive en `tests/unidad/textos-aprobados.test.ts`**, que falla si alguno cambia: los de
`src/lib/textos-chat.ts` y `AVISO_URGENCIAS` (14-sep-2026), los 17 de la sesión del 18-nov-2026
—urgencias, la ficha, el registro, Mis datos y `AVISO_INFORME`, que llevaba pendiente desde
octubre— y los **dos del modo conversación (19-nov-2026)**: `SALUDO_MODO_VOZ` de `src/lib/voz.ts` y
el aviso del pie de `ModoVoz.tsx`. Para cambiar uno: se le pregunta a él, y el código y esa lista se
mueven en el mismo commit, con la fecha nueva.

Esos dos últimos se escaparon de la sesión del 18-nov por donde viven —dentro del modo voz, no en
una pantalla del panel— y llevaban en producción desde entonces. **Si aparece texto clínico visible
que no está en esa lista, es deuda, no un borrador**: se firma o se quita, no se deja correr.

## Marco legal

- **Res. 1644 de 2026** (derogó la 2654 de 2019). La **teleorientación es telesalud y NO requiere
  habilitación**; telexperticia, teleconcepto, teleconsulta y telemonitoreo sí, por la Res. 3100 de
  2019.
- La IA de impacto clínico es **apoyo del médico** y exige validación documentada. La fábrica de
  protocolos de `protocolos/` y el evaluador de Hilda (`npm run evaluar:hilda`) son ese expediente.
- **Ley 1581 de 2012** para datos personales. Los datos de salud son sensibles: autorización
  expresa. Las capturas y los datos de ejemplo van siempre con datos ficticios.
- **No usar la palabra "triage"** en nada visible.
- **Hilda es un personaje creado con IA**, no una médica. La portada y los videos lo dicen. Nunca
  "IA médica asistida por profesionales" ni presentarla como "Dra." ante el paciente.
- Los protocolos se llaman **"adaptados"** mientras haya un solo médico revisor.

## Decisiones cerradas

- Acceso libre durante el lanzamiento: `ACCESO_LIBRE` en `src/config/acceso.ts` y
  `functions/src/acceso.ts`, que **deben valer lo mismo**. El umbral no enciende el cobro solo; es
  una decisión manual.
- Quienes se registraron durante la etapa gratis **quedan gratis de por vida**. No romper eso al
  apagar el interruptor.
- Salud mental **sí es motivo de consulta** (decidido el 28-oct-2026; antes quedaba fuera). Hilda
  la admite, tamiza la seguridad —ideación, plan, medios, autolesión previa—, y **encamina siempre
  a una persona**: ninguna rama termina en un consejo suyo. No explora el episodio a fondo ni
  aplica escalas de depresión o ansiedad: eso es ejercicio clínico en el área con menos margen. La
  ideación suicida sigue como alarma universal.
- La red de apoyo **se pide en el registro** y se guarda en la ficha de cada integrante; se ofrece
  a un toque, **siempre iniciado por la persona**. La app nunca marca sola: avisarle a un tercero revela que alguien
  está en crisis, y ese contacto no siempre es seguro. Cada contacto declara si puede ser
  llamado en una crisis.
- **Un antecedente negado baja la sospecha, nunca apaga una alarma** (28-oct-2026). Los activadores
  pueden exigir antecedentes; las alarmas no exigen nada: se disparan con los hallazgos de hoy. La
  gente subnotifica —gastritis, colon irritable, obesidad—, y un "yo no tengo nada" no puede
  desactivar una señal de peligro. Al revés también: una alergia referida no es un hecho clínico.
  Hilda la caracteriza, no la reclasifica, y nunca autoriza un suministro; para su propia conducta
  la trata como real.
- Toda orientación termina en algo que la persona se lleva (hoy, el informe en PDF de
  `src/lib/informe-orientacion-pdf.ts`): es una regla de producto, no una función opcional.
- El informe transcribe la consulta **literal, sin resumir**. Un resumen generado sería texto
  clínico nuevo y un punto más donde la IA puede inventar, justo en el documento que se le muestra a
  un profesional.
- Firma de la casa: **Charis Integra**.
- Fecha de nacimiento como texto `AAAA-MM-DD`, nunca ISO con hora. El titular se edita solo con
  `saveTitularProfile`.

## Trampas técnicas

- Desplegar **siempre** con `--project myhomedoctorapp` explícito (ResiMed ya pisó este host una vez).
- **⚠️ UN PUSH A `master` PUBLICA EN PRODUCCIÓN.** Comprobado el 18-nov-2026: App Hosting construye
  y lanza el rollout **solo**, sin que nadie lo pida. Dos pushes de ese día —ambos de documentación—
  crearon `rollout-2026-11-18-002` y `-003` por su cuenta. Hasta el 11-nov la nota decía lo
  contrario (`ABIU: Disabled`, "hay que crear el rollout a mano"); eso ya no vale. **No hay ningún
  paso entre subir y publicar**, así que un cambio de una coma reconstruye y redespliega la app. Se
  trabaja en rama y se empuja a `master` solo cuando se quiera publicar. El rollout a mano
  (`npx firebase apphosting:rollouts:create studio --git-branch master --project myhomedoctorapp`)
  sigue existiendo y sirve para relanzar sin un commit nuevo.
  **El automático se queda: decisión de Alexander del 18-nov-2026, no la reabras.** Lo que cambia no
  es la configuración, es la disciplina: la rama es el borrador y `master` es el botón de publicar.
  - **No es instantáneo, y son dos pasos.** El push dispara primero un **build** y el rollout llega
    después. Entre uno y otro, producción sigue sirviendo el build anterior, así que un sitio que
    responde 200 no prueba que lo tuyo ya esté arriba.
  - **El listado de rollouts NO incluye el más reciente**, así que no sirve para comprobar nada:
    el 18-nov pareció que un push no se había publicado, y la API contestó `409 "ya existe"` al
    intentar crear el rollout a mano. **La única señal fiable es a qué revisión va el tráfico**:
    `gcloud run services describe studio --project myhomedoctorapp --region us-central1
    --format="value(status.traffic)"`, y mirar el `percent: 100`. El commit de esa revisión se
    confirma en `.../builds/<id>`, campo `source.codebase.hash`.
- **No desplegar `firestore.indexes.json` completo sin revisar**: crea el índice `tokens` y activa el
  cobro mensual con riesgo de doble cobro.
- Los logs de Cloud Functions y Next no traen severity: buscar por texto, no por `ERROR`.
- Dos `next dev` sobre la misma carpeta dan EPERM en `.next/cache`. Para pruebas con sesión usa
  `127.0.0.1:<puerto>`, no `localhost` (la cookie `__session` se comparte entre puertos).
- ~~`urgencias-page.tsx` tiene datos de Chile (SAMU 131): no enlazarla sin corregir.~~ **Corregido y
  desplegado el 18-nov-2026.** La pantalla quedó con el 123 y la entrada a una orientación, sin
  teléfonos de terceros, y ya está enlazada desde Inicio y desde la cabecera del chat. El motivo de
  que baste el 123 está en `src/lib/urgencias-colombia.ts`: en una urgencia la EPS no es la puerta
  (Ley 1751 de 2015, arts. 10 b) y 14). `tests/unidad/urgencias-colombia.test.ts` falla si el 131,
  el SAMU o los cuatro prestadores chilenos vuelven a `src/`, o si esa pantalla marca algún número
  que no sea el 123.
- `inventario.py` no reconoce el formato de la GPC de neumonía 2014: no subirla hasta adaptar el
  extractor.
- El redactor de protocolos varía mucho entre corridas: la revisión del médico es indispensable.

## Pruebas

`npm test` levanta los emuladores de Firebase (Auth, Firestore y Storage) contra el proyecto de
mentira `demo-mhda` y corre toda la suite; **requiere Java 21** y no se puede filtrar por archivo.
Si el entorno no tiene Java, las pruebas no corren: dilo en vez de dar por buena la suite. En ese
caso, `npm run typecheck` y `npm run build` son lo único que puedes afirmar.

La prueba con sesión autenticada la hace Alexander: la contraseña de la cuenta demo no se escribe
desde automatización.

## Entorno local (puede no aplicar en la nube)

- `git` no está en el PATH de la máquina de Alexander: usa el de GitHub Desktop, en
  `C:\Users\alexa\AppData\Local\GitHubDesktop\app-<versión>\resources\app\git\cmd`.
- `.env.local` no está en el repositorio. Sin llaves, nada que hable con Gemini, Abacus o Firebase
  Admin funciona: no intentes probarlo, dilo.

## Archivos que no están en el repositorio

Por ser público, estos viven solo en la máquina de Alexander. Si trabajas sin ellos, **dilo al
empezar** en vez de suponer su contenido:

- `ESTADO.md` — qué está hecho, qué está apagado y qué está pendiente hoy.
- `PLAN-90-DIAS.md` — los tres frentes comerciales, el plan de 90 días, su estado y las métricas.

Cuando sí están, el subagente `estratega-mhda` los lee para decir por dónde va el plan y si una
decisión vale la pena. Ese agente vive en el `~/.claude/agents` de su máquina, así que tampoco
cuentes con él fuera de ahí.
