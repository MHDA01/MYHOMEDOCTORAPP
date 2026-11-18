# El latido de salud de MHDA

Qué se construyó el 9 de noviembre de 2026, qué quedó verificado, qué no, y los pasos que siguen.

> Decidido el 18-nov-2026: este archivo **entra al repositorio**. No contiene secretos, cifras de uso
> ni precios, y lo que cuenta —por qué el límite es 60, qué sigue sin confirmarse y cómo cerrar la
> duda— no está en ningún otro sitio.

---

## De dónde salió

La pregunta fue medir la estabilidad de la app. "Estabilidad" son cuatro cosas distintas, y la app
solo medía dos:

| Capa | Qué mide | Estado antes | Estado hoy |
|---|---|---|---|
| 1. Que el código no se rompa | `npm test`, `typecheck`, `build`, el arnés del grafo | **Ya existía** | Sin cambios |
| 2. Que el grafo clínico no afloje | 200 casos deterministas, falsos negativos aparte | **A medias**: el arnés sí, los casos no | Sin cambios |
| 3. Disponibilidad y errores en producción | Si la app está arriba; cuántos errores hubo | **Nada** | Endpoint hecho, sin desplegar |
| 4. Carga | Cuántos usuarios simultáneos aguanta | Nada | Descartado por ahora (ver abajo) |

**Corrección del 18-nov-2026.** La fila 2 decía "Ya existía" y no era cierto. Existe el arnés
—`src/lib/grafo-arnes.ts`: `correrArnes`, `banda`, `veredicto`, con los falsos negativos contados
aparte— pero **el banco de doscientos casos no está escrito**. Los doscientos son lo que pide el §12
del diseño, no lo que hay. `evaluacion/casos/universales.json` es otra cosa: los casos del evaluador
de Hilda, que sí llama al modelo. Mientras el banco no exista, la capa 2 mide la maquinaria, no el
grafo.

Se eligió empezar por la capa 3 porque era la única sin nada: si la app se caía de madrugada, se
sabía porque alguien escribía.

---

## Qué se construyó

Un endpoint `GET /api/salud` para que una máquina pregunte cada pocos minutos si la app está en pie.

**Archivos nuevos** (seis):

- `src/lib/salud.ts` — qué se revisa, cómo se resume en un estado y qué código HTTP le toca.
- `src/app/api/salud/route.ts` — la ruta, que conecta eso con Firestore y con el registro.
- `src/lib/limite-peticiones.ts` — el contador de peticiones por IP.
- `tests/unidad/salud.test.ts`, `tests/unidad/limite-peticiones.test.ts`, `tests/acciones/salud.test.ts`
  — 33 pruebas.

### Qué revisa

- **Firestore responde**: lee el documento `_salud/latido`, que no existe ni necesita existir. Lo que
  se prueba es que la credencial sirve y que la base de datos contesta. Está fuera de los datos de
  los pacientes para que el latido no pueda tocar nada clínico, y las reglas dejan `_salud/` cerrado
  a los clientes por ser una colección no declarada.
- **Las claves están puestas**: las tres de Firebase Admin y `MHDA_ENCRYPTION_KEY` (esenciales), y
  `GEMINI_API_KEY` (no esencial). Se comprueba la **presencia, nunca el valor**.
- **A Gemini no se le llama**: cada latido costaría dinero.

### Qué contesta

| Estado | Cuándo | Código |
|---|---|---|
| `ok` | todo en pie | 200 |
| `degradado` | falta algo no esencial (p. ej. la clave de Gemini: Hilda no contesta, pero el paciente entra, ve su ficha y descarga informes) | 200 |
| `caido` | falla algo esencial | **503** |

Que `caido` conteste 503 es lo que hace sonar la alerta: con un 200 y un `ok: false` adentro, el
chequeo de disponibilidad daría la app por buena. Hay una prueba que falla si alguien cambia eso.

### Tres precauciones, porque el endpoint es público

No lleva autenticación: un chequeo de disponibilidad no sabe iniciar sesión. De ahí que:

1. **La respuesta no cuenta nada.** Salen los nombres de los chequeos y si pasaron. Nunca el mensaje
   de la excepción, el nombre del proyecto, versiones ni rutas. El motivo real va al registro del
   servidor con la marca `MHDA_SALUD`, buscable por texto porque los registros de App Hosting llegan
   sin severity. Hay una prueba que falla si alguien deja escapar el detalle en la respuesta.
2. **Solo lee un documento vacío**, nunca escribe.
3. **Límite de 60 peticiones por minuto y por IP**, aplicado **antes** de tocar Firestore, para que
   una avalancha no gaste lecturas. Devuelve 429 con `Retry-After` y no dice cuál es el límite.

---

## El error que se corrigió

La primera versión leía la IP de la **última** entrada de `x-forwarded-for`, con el razonamiento de
que esa la pone la infraestructura y el cliente no la controla. **Era falso.** El balanceador de
Google añade **dos** entradas al final: la dirección que de verdad se conectó a él y **su propia
dirección**. La última es la del balanceador, la misma para todo el mundo.

Con eso, todo el tráfico del planeta caía en una sola cuenta de 60 por minuto: el chequeo de
disponibilidad se habría cortado solo, y a cualquiera le habría bastado gastar la cuota para dejar
la app sin monitoreo. El límite puesto para proteger habría sido la forma de apagar la vigilancia.

**Lo correcto es la penúltima entrada**, y es robusta por las dos puntas: lo que el cliente inventa
queda a la izquierda y se ignora; la penúltima la escribe el balanceador. Las dos elecciones
equivocadas y su consecuencia están escritas en el comentario de `ipDelPedido`, y hay una prueba
—"la dirección del balanceador no se usa como clave"— que falla si alguien vuelve a la versión mala.

### Lo que sigue sin confirmar

La documentación de Google no es explícita para App Hosting: el formato del balanceador de
aplicaciones (entradas sin verificar, cliente, dirección de la regla de reenvío) está confirmado por
la comunidad, mientras que la referencia de Cloud Functions describe lo contrario para una petición
directa. `myhomedoctorapp.com` va por el balanceador, pero eso es inferencia, no un hecho medido.

Por eso quedaron dos seguros:

- **El límite en 60 y no en 20.** Si la cadena trajera una entrada más de lo previsto, la clave
  volvería a ser compartida; con 60 el monitoreo aguanta incluso así, y a un bucle de mil por minuto
  lo corta igual.
- **Un diagnóstico que se autoverifica.** La ruta registra **una vez por instancia**, y solo si no
  son dos entradas: `MHDA_SALUD x-forwarded-for entradas=N`. Solo el número, nunca las direcciones,
  porque una IP es dato personal (Ley 1581).

---

## Qué está verificado y qué no

**Verificado:**

- 417 pruebas en verde con `npm test` (emuladores, Java 21 disponible). *Al 18-nov son 641: el
  latido se commiteó junto al grafo por datos y al cobro, cada uno con las suyas.*
- `npm run typecheck` y `npm run build` limpios. La ruta compila como dinámica (`ƒ /api/salud`).
- Probado en local contra la **Firestore de producción** (`npm run dev` con `.env.local`):
  `{"estado":"ok","ms":190,...}` con 200 OK en caliente.
- El límite, de punta a punta: veinte respuestas 200 seguidas y de ahí en adelante 429 con
  `Retry-After: 52`.

**No verificado:**

- El endpoint nunca ha corrido en producción.
- La forma real de `x-forwarded-for` en App Hosting (lo resuelve el diagnóstico de arriba).
- El chequeo de disponibilidad y la alerta no existen todavía.

**Un número que salió de medir:** la primera lectura de Firestore de un proceso recién levantado
tardó **3,2 s**; en caliente, 190 ms. Como `apphosting.yaml` tiene `minInstances: 0`, la app se apaga
sola y buena parte de los latidos pagan ese arranque. Por eso el límite por chequeo quedó en 8 s y
no en 5: con 5 s, cada arranque lento habría sido una alarma falsa, y una alarma que miente se acaba
ignorando.

---

## Pasos a seguir

### 1. Limpiar el repositorio antes de cualquier commit amplio — **hecho el 18-nov-2026**

Hay 19 archivos sueltos sin rastrear que **no deben entrar a un repositorio público**:
`deploy_mhda_*.log`, `deploy-output.txt`, `deploy_output.txt`, `firebase_logs.txt`, `tscout*.txt`,
`build.log`, `build_output.log`, `delete_resimed_orphans.log`, `PR-descripcion.md` y el
`firestore-debug.log` que dejan las corridas de pruebas. Son de julio y octubre. Los registros de
despliegue de Firebase suelen traer nombres de recursos, correos de cuentas de servicio y rutas del
proyecto; un `git add .` los sube y ya no se quitan del historial. **Van al `.gitignore`.**

Hecho en el commit "Lo que no puede acabar en un repositorio publico": `*.log` y los `.txt` por
nombre, para no ignorar de paso un `robots.txt`. Con ellos se fue también el expediente de
validación del grafo, respaldado fuera.

### 2. Commitear el latido solo — **hecho el 18-nov-2026**

El árbol tiene además un lote grande de trabajo en curso que no es de esta tarea: cerca de cien bajas
ya en zona de preparación (componentes de `ui/`, `dashboard/`, `landing/`, `MHDA-integration-package`,
el agente de ventas de `functions/`), más cambios en `gemini.ts`, `voz.ts`, `teleorientacion.ts`, un
`gemini-cache.ts` nuevo y dos documentos en `protocolos/`. El latido son seis archivos y conviene que
vayan solos.

Así quedó: el latido en `d4ee3ef`, seis archivos y nada más. El resto se separó en sus propios
commits —el grafo por datos, el cobro, la limpieza y el agente de ventas—, y la rama
`limpieza-codigo` se mezcló en vez de rebasarse, porque se cortó antes de que el grafo existiera.

### 3. Decidir la rama — **sigue abierto**

Esto está en `voz/medir-latencia-hilda`, que es una rama de latencia de voz y no tiene que ver con un
endpoint de salud. `firebase.json` no tiene bloque `apphosting`, así que App Hosting publica por su
integración con GitHub desde la rama configurada en la consola: publicar significa llevar el latido a
esa rama.

### 4. Desplegar

Siempre con `--project myhomedoctorapp` explícito. **No desplegar `firestore.indexes.json` completo
sin revisar.**

### 5. Leer el diagnóstico (el paso que cierra la duda)

Con el latido ya en producción, buscar en los registros:

```
MHDA_SALUD x-forwarded-for
```

- **No aparece** → la cadena trae las dos entradas previstas, la IP se lee bien y el límite puede
  bajar de 60 a 20 (`LATIDOS_POR_MINUTO` en `src/lib/salud.ts`).
- **Aparece con otro número** → hay que ajustar `ipDelPedido` antes de confiar en el límite.

### 6. Crear el chequeo de disponibilidad y la alerta

En la consola de Cloud Monitoring → *Uptime checks*:

- HTTP(S) sobre `myhomedoctorapp.com`, ruta `/api/salud`.
- Periodo 5 min (15 min si se quiere reducir el tiempo de instancia, a cambio de tardar más en
  detectar la caída).
- Tiempo de espera 10 s.
- Alerta con **dos fallos consecutivos** antes de notificar, para que un arranque en frío no llame de
  madrugada.

Los chequeos en sí entran en la capa gratuita de Monitoring. Lo que conviene mirar en la primera
factura es el tiempo de instancia: un latido cada 5 minutos mantiene la app despierta casi todo el
día.

---

## Lo que queda pendiente después

- **Capa 2 del plan: contar los errores.** Hay 57 `console.error` repartidos en 13 acciones de
  servidor con prefijos distintos (`[Dra. Hilda]`, `[Admin]`, `[Mis datos]`…). Como los registros no
  traen severity, filtrar por ERROR no sirve y el texto es el único asidero. Un prefijo único y
  buscable en cada `catch`, una métrica basada en logs y una alerta por umbral convierten "a veces
  falla" en un número por día y por acción. La marca `MHDA_SALUD` ya quedó sembrada como ejemplo.
- **Capa 3: guardar los tiempos de voz que ya se miden.** `src/lib/tiempos-voz.ts` mide el turno por
  tramos, pero solo se ve en pantalla con `?tiempos=1` y no se guarda en ninguna parte: se mide en el
  momento, no en el tiempo. Guardar **solo duraciones y tamaños, nunca el texto** —la regla ya está
  escrita en ese archivo— y una vista en el admin mostrarían si Hilda se vuelve más lenta mes a mes,
  que es la estabilidad que el paciente siente.
- **Cloud Armor, si alguna vez hace falta.** El límite por IP frena el golpeo tonto: un bucle, un
  script que descubre la ruta. No frena a quien rote de red, y la cuenta es de cada instancia
  (`apphosting.yaml` permite cuatro, así que el límite efectivo es 60 por el número de instancias
  despiertas). La barrera contra un ataque dirigido es Cloud Armor en el balanceador, que cuesta y se
  configura fuera del código.
- **Prueba de carga: descartada por ahora.** `apphosting.yaml` tiene `maxInstances: 4`,
  `concurrency: 80`, 1 CPU y 512 MiB. En teoría 320 peticiones simultáneas, pero cada turno de Hilda
  ocupa su cupo varios segundos esperando a Gemini: el techo real no es la CPU, es el tiempo en
  vuelo. Una prueba con k6 contra los emuladores, con Gemini sustituido por un doble, mide Next y
  Firestore —no la espera que domina el turno—, así que revela mucho menos de lo que promete. Y
  contra `myhomedoctorapp` no se corre nunca: serían tokens de Gemini reales, cobro real y una
  saturación con pacientes dentro.
