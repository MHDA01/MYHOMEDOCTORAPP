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
aprobación de Alexander**. Todo texto clínico visible lo aprueba él: los de `src/lib/textos-chat.ts`
ya están aprobados; la constante `AVISO_INFORME` de `src/lib/informe-orientacion-pdf.ts` está
pendiente.

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
- Salud mental queda fuera de los motivos de consulta de Hilda. La ideación suicida sigue como
  alarma universal.
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
- **No desplegar `firestore.indexes.json` completo sin revisar**: crea el índice `tokens` y activa el
  cobro mensual con riesgo de doble cobro.
- Los logs de Cloud Functions y Next no traen severity: buscar por texto, no por `ERROR`.
- Dos `next dev` sobre la misma carpeta dan EPERM en `.next/cache`. Para pruebas con sesión usa
  `127.0.0.1:<puerto>`, no `localhost` (la cookie `__session` se comparte entre puertos).
- `urgencias-page.tsx` tiene datos de Chile (SAMU 131): no enlazarla sin corregir.
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
