/**
 * De un documento de Firestore a una base de reglas tipada. Código puro.
 *
 * Es la aduana del grafo. `base-de-reglas-guardada.ts` lee el documento y lo
 * escribe; aquí se decide si lo que trae tiene **forma** de base de reglas, y se
 * construye una nueva desde cero, campo por campo.
 *
 * **Por qué no basta un `as BaseDeReglas`.** Lo que sale de Firestore es
 * `unknown` de verdad: lo escribió otra versión del código, o una mano en la
 * consola de Firebase, o un panel que todavía no existe. Un `as` le pondría el
 * tipo sin mirarlo, y el ejecutor recorrería una condición sin `op`, una rama
 * que apunta a `undefined` o un `n` que es una cadena. Es el mismo argumento de
 * `desdeFirestore()` en `hallazgos-del-episodio.ts`, donde cada hallazgo
 * guardado vuelve a pasar por `registrar()`.
 *
 * ── LAS TRES DECISIONES DE ESTE ARCHIVO ──
 *
 * 1. **La forma, aquí; las reglas de la casa, en `revisarBase()`.** Este archivo
 *    comprueba que un número sea un número y que un campo obligatorio esté;
 *    `revisarBase()` comprueba que la alarma tenga firma, que no exija un
 *    antecedente y que al paciente no le llegue la palabra "síndrome". Son dos
 *    revisiones distintas y las dos tienen que pasar: la primera existe para que
 *    la segunda pueda leer la base sin romperse.
 * 2. **Un problema cualquiera devuelve la base vacía, nunca media base.** Si un
 *    activador viene malformado no se publica "todo lo demás": las reglas se
 *    referencian entre sí —una susceptibilidad eleva un activador, un activador
 *    pide una escala— y una base a la que le falta una pieza decide distinto de
 *    la que el médico aprobó. Correr en vacío es un estado conocido y legible en
 *    el log; correr con la mitad no lo es.
 * 3. **Se copia campo por campo y lo que sobra se cae.** No hay un `...crudo` en
 *    ningún sitio: un campo de más en el documento no llega al ejecutor.
 */

import {
  type Activador,
  type Alarma,
  type Aprobacion,
  type Arbol,
  type BaseDeReglas,
  type Condicion,
  type Desenlace,
  type Escala,
  type ExplicacionComun,
  type FuenteRegla,
  type Nodo,
  type Sindrome,
  type Susceptibilidad,
  BASE_VACIA,
} from '@/lib/grafo-reglas';
import { type Temporalidad, type ValorHallazgo, TEMPORALIDADES } from '@/lib/hallazgos';

/**
 * Hasta dónde se deja anidar una condición.
 *
 * Firestore admite veinte niveles de anidamiento y una condición compuesta se
 * evalúa con recursión, así que un documento escrito a mano podría llegar al
 * ejecutor con un árbol de condiciones absurdo. Doce niveles es muchísimo más de
 * lo que una regla legible necesita —las del diseño no pasan de tres— y pone un
 * techo a la recursión antes de que sea un problema.
 */
export const TOPE_ANIDAMIENTO = 12;

const CLASES = [
  'alarmas',
  'activadores',
  'sindromes',
  'susceptibilidades',
  'escalas',
  'arboles',
] as const;

const OPS_COMPUESTA = ['todas', 'alguna', 'alMenos'] as const;
const OPS_PRESENCIA = ['presente', 'negado', 'conocido'] as const;
const OPS_NUMERO = ['>=', '<=', '>', '<'] as const;
const FRECUENCIAS = ['alta', 'media', 'baja'] as const;
const PRIORIDADES = ['alta', 'media', 'baja'] as const;

type Di = (problema: string) => void;

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function incluye(opciones: readonly string[], v: unknown): v is string {
  return typeof v === 'string' && opciones.includes(v);
}

/** Una cadena. Que esté llena lo dice `revisarBase()`, con su propio mensaje. */
function texto(v: unknown, ruta: string, di: Di, campo: string): string | null {
  if (typeof v !== 'string') {
    di(`${ruta}: "${campo}" no es un texto`);
    return null;
  }
  return v;
}

function listaDeTextos(v: unknown, ruta: string, di: Di, campo: string): string[] | null {
  if (!Array.isArray(v)) {
    di(`${ruta}: "${campo}" no es una lista`);
    return null;
  }
  const salida: string[] = [];
  for (const [i, x] of v.entries()) {
    if (typeof x !== 'string') {
      di(`${ruta}: "${campo}[${i}]" no es un texto`);
      return null;
    }
    salida.push(x);
  }
  return salida;
}

function valorDeHallazgo(v: unknown): ValorHallazgo | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') return v;
  return undefined;
}

// ─────────────────────────────────────────────────────────────
// Condiciones
// ─────────────────────────────────────────────────────────────

function condicion(v: unknown, ruta: string, di: Di, nivel = 0): Condicion | null {
  if (nivel > TOPE_ANIDAMIENTO) {
    di(`${ruta}: la condición anida más de ${TOPE_ANIDAMIENTO} niveles`);
    return null;
  }
  if (!esObjeto(v)) {
    di(`${ruta}: la condición no es un objeto`);
    return null;
  }
  const op = v.op;
  if (typeof op !== 'string') {
    di(`${ruta}: la condición no dice su "op"`);
    return null;
  }

  if (incluye(OPS_COMPUESTA, op)) {
    if (!Array.isArray(v.de) || v.de.length === 0) {
      di(`${ruta}: "${op}" sin condiciones en "de"`);
      return null;
    }
    const partes: Condicion[] = [];
    for (const [i, cruda] of v.de.entries()) {
      const parte = condicion(cruda, `${ruta} → de[${i}]`, di, nivel + 1);
      if (!parte) return null;
      partes.push(parte);
    }
    if (op === 'alMenos') {
      const n = v.n;
      if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) {
        di(`${ruta}: "alMenos" necesita un "n" entero de 1 o más`);
        return null;
      }
      return { op: 'alMenos', n, de: partes };
    }
    return op === 'todas' ? { op: 'todas', de: partes } : { op: 'alguna', de: partes };
  }

  const hallazgo = v.hallazgo;
  if (typeof hallazgo !== 'string' || !hallazgo.trim()) {
    di(`${ruta}: la condición no nombra un hallazgo`);
    return null;
  }

  // La temporalidad es opcional, pero si viene tiene que ser una de las dos. Una
  // tercera palabra haría que `buscar()` no encontrara nunca el hallazgo y la
  // regla callaría en silencio, que es el peor de los dos fallos posibles.
  let temporalidad: Temporalidad | undefined;
  if (v.temporalidad !== undefined) {
    if (!incluye(TEMPORALIDADES, v.temporalidad)) {
      di(`${ruta}: "${String(v.temporalidad)}" no es una temporalidad`);
      return null;
    }
    temporalidad = v.temporalidad as Temporalidad;
  }

  if (incluye(OPS_PRESENCIA, op)) {
    const base = { op: op as 'presente' | 'negado' | 'conocido', hallazgo };
    return temporalidad ? { ...base, temporalidad } : base;
  }

  if (incluye(OPS_NUMERO, op)) {
    if (typeof v.valor !== 'number' || !Number.isFinite(v.valor)) {
      di(`${ruta}: "${op}" compara contra algo que no es un número`);
      return null;
    }
    const base = { op: op as '>=' | '<=' | '>' | '<', hallazgo, valor: v.valor };
    return temporalidad ? { ...base, temporalidad } : base;
  }

  if (op === '==') {
    const valor = valorDeHallazgo(v.valor);
    if (valor === undefined) {
      di(`${ruta}: "==" sin un valor que sea número o texto`);
      return null;
    }
    const base = { op: '==' as const, hallazgo, valor };
    return temporalidad ? { ...base, temporalidad } : base;
  }

  if (op === 'en') {
    if (!Array.isArray(v.valores) || v.valores.length === 0) {
      di(`${ruta}: "en" sin lista de valores`);
      return null;
    }
    const valores: ValorHallazgo[] = [];
    for (const [i, crudo] of v.valores.entries()) {
      const valor = valorDeHallazgo(crudo);
      if (valor === undefined) {
        di(`${ruta}: "en" trae en la posición ${i} algo que no es número ni texto`);
        return null;
      }
      valores.push(valor);
    }
    const base = { op: 'en' as const, hallazgo, valores };
    return temporalidad ? { ...base, temporalidad } : base;
  }

  di(`${ruta}: "${op}" no es una operación conocida`);
  return null;
}

// ─────────────────────────────────────────────────────────────
// Trazabilidad
// ─────────────────────────────────────────────────────────────

/**
 * La fuente y la firma, con la forma que `revisarBase()` espera poder leer.
 *
 * Aquí no se exige que estén llenas —ese mensaje lo da `revisarBase()`, que es
 * quien habla el idioma de la casa—, pero sí que existan y que sean lo que son.
 * Si `aprobadoPor` llegara como una cadena, `revisarBase()` leería
 * `r.aprobadoPor.medico` sobre un texto, encontraría `undefined` y no sabría
 * decir que el documento está roto: diría que falta la firma.
 */
function trazabilidad(
  v: Record<string, unknown>,
  ruta: string,
  di: Di
): { fuente: FuenteRegla; aprobadoPor: Aprobacion } | null {
  if (!esObjeto(v.fuente)) {
    di(`${ruta}: no trae "fuente"`);
    return null;
  }
  if (!esObjeto(v.aprobadoPor)) {
    di(`${ruta}: no trae "aprobadoPor"`);
    return null;
  }
  const documento = texto(v.fuente.documento, ruta, di, 'fuente.documento');
  const medico = texto(v.aprobadoPor.medico, ruta, di, 'aprobadoPor.medico');
  const fecha = texto(v.aprobadoPor.fecha, ruta, di, 'aprobadoPor.fecha');
  if (documento === null || medico === null || fecha === null) return null;

  const fuente: FuenteRegla = { documento };
  if (v.fuente.pagina !== undefined) {
    const pagina = texto(v.fuente.pagina, ruta, di, 'fuente.pagina');
    if (pagina === null) return null;
    fuente.pagina = pagina;
  }
  if (v.fuente.anio !== undefined) {
    if (typeof v.fuente.anio !== 'number' || !Number.isInteger(v.fuente.anio)) {
      di(`${ruta}: "fuente.anio" no es un año`);
      return null;
    }
    fuente.anio = v.fuente.anio;
  }
  if (v.fuente.calificacionLiteral !== undefined) {
    const cal = texto(v.fuente.calificacionLiteral, ruta, di, 'fuente.calificacionLiteral');
    if (cal === null) return null;
    fuente.calificacionLiteral = cal;
  }

  return { fuente, aprobadoPor: { medico, fecha } };
}

// ─────────────────────────────────────────────────────────────
// Una por clase de regla
// ─────────────────────────────────────────────────────────────

function alarma(v: unknown, ruta: string, di: Di): Alarma | null {
  if (!esObjeto(v)) {
    di(`${ruta}: no es un objeto`);
    return null;
  }
  const traza = trazabilidad(v, ruta, di);
  const id = texto(v.id, ruta, di, 'id');
  const nombreClinico = texto(v.nombreClinico, ruta, di, 'nombreClinico');
  const escalaA = texto(v.escalaA, ruta, di, 'escalaA');
  const severidad = texto(v.severidad, ruta, di, 'severidad');
  const cuando = condicion(v.cuando, `${ruta} → cuando`, di);
  if (
    !traza ||
    id === null ||
    nombreClinico === null ||
    escalaA === null ||
    severidad === null ||
    !cuando
  ) {
    return null;
  }
  // `escalaA` y `severidad` viajan como texto a propósito: que sean un nivel de
  // atención y una severidad de verdad lo dice `revisarBase()`, con su mensaje.
  return {
    id,
    nombreClinico,
    cuando,
    escalaA: escalaA as Alarma['escalaA'],
    severidad: severidad as Alarma['severidad'],
    fuente: traza.fuente,
    aprobadoPor: traza.aprobadoPor,
  };
}

function explicacionComun(v: unknown, ruta: string, di: Di): ExplicacionComun | null {
  if (!esObjeto(v)) {
    di(`${ruta}: no es un objeto`);
    return null;
  }
  const id = texto(v.id, ruta, di, 'id');
  const nombreClinico = texto(v.nombreClinico, ruta, di, 'nombreClinico');
  const cuando = condicion(v.cuando, `${ruta} → cuando`, di);
  if (!incluye(FRECUENCIAS, v.frecuencia)) {
    di(`${ruta}: "frecuencia" no es alta, media ni baja`);
    return null;
  }
  if (id === null || nombreClinico === null || !cuando) return null;
  return { id, nombreClinico, frecuencia: v.frecuencia as ExplicacionComun['frecuencia'], cuando };
}

function escala(v: unknown, ruta: string, di: Di): Escala | null {
  if (!esObjeto(v)) {
    di(`${ruta}: no es un objeto`);
    return null;
  }
  const traza = trazabilidad(v, ruta, di);
  const id = texto(v.id, ruta, di, 'id');
  const nombreClinico = texto(v.nombreClinico, ruta, di, 'nombreClinico');
  const variables = listaDeTextos(v.variables, ruta, di, 'variables');
  if (!traza || id === null || nombreClinico === null || !variables) return null;
  return { id, nombreClinico, variables, fuente: traza.fuente, aprobadoPor: traza.aprobadoPor };
}

function activador(v: unknown, ruta: string, di: Di): Activador | null {
  if (!esObjeto(v)) {
    di(`${ruta}: no es un objeto`);
    return null;
  }
  const traza = trazabilidad(v, ruta, di);
  const id = texto(v.id, ruta, di, 'id');
  const sospecha = texto(v.sospecha, ruta, di, 'sospecha');
  const disparadores = condicion(v.disparadores, `${ruta} → disparadores`, di);
  if (!incluye(PRIORIDADES, v.prioridad)) {
    di(`${ruta}: "prioridad" no es alta, media ni baja`);
    return null;
  }
  if (!traza || id === null || sospecha === null || !disparadores) return null;

  const act: Activador = {
    id,
    sospecha,
    disparadores,
    prioridad: v.prioridad as Activador['prioridad'],
    fuente: traza.fuente,
    aprobadoPor: traza.aprobadoPor,
  };

  if (v.requisitos !== undefined) {
    const req = condicion(v.requisitos, `${ruta} → requisitos`, di);
    if (!req) return null;
    act.requisitos = req;
  }
  if (v.disparadoresRelajados !== undefined) {
    const rel = condicion(v.disparadoresRelajados, `${ruta} → disparadoresRelajados`, di);
    if (!rel) return null;
    act.disparadoresRelajados = rel;
  }
  if (v.amenazaVidaAguda !== undefined) {
    if (typeof v.amenazaVidaAguda !== 'boolean') {
      di(`${ruta}: "amenazaVidaAguda" no es sí o no`);
      return null;
    }
    act.amenazaVidaAguda = v.amenazaVidaAguda;
  }
  if (v.preguntas !== undefined) {
    const preguntas = listaDeTextos(v.preguntas, ruta, di, 'preguntas');
    if (!preguntas) return null;
    act.preguntas = preguntas;
  }
  if (v.nivelMinimo !== undefined) {
    const nivel = texto(v.nivelMinimo, ruta, di, 'nivelMinimo');
    if (nivel === null) return null;
    act.nivelMinimo = nivel as Activador['nivelMinimo'];
  }
  if (v.escalas !== undefined) {
    const escalas = listaDeTextos(v.escalas, ruta, di, 'escalas');
    if (!escalas) return null;
    act.escalas = escalas;
  }
  if (v.explicacionesComunes !== undefined) {
    if (!Array.isArray(v.explicacionesComunes)) {
      di(`${ruta}: "explicacionesComunes" no es una lista`);
      return null;
    }
    const comunes: ExplicacionComun[] = [];
    for (const [i, cruda] of v.explicacionesComunes.entries()) {
      const x = explicacionComun(cruda, `${ruta} → explicacionesComunes[${i}]`, di);
      if (!x) return null;
      comunes.push(x);
    }
    act.explicacionesComunes = comunes;
  }

  return act;
}

function sindrome(v: unknown, ruta: string, di: Di): Sindrome | null {
  if (!esObjeto(v)) {
    di(`${ruta}: no es un objeto`);
    return null;
  }
  const traza = trazabilidad(v, ruta, di);
  const id = texto(v.id, ruta, di, 'id');
  const nombreClinico = texto(v.nombreClinico, ruta, di, 'nombreClinico');
  const sistema = texto(v.sistema, ruta, di, 'sistema');
  const piso = texto(v.piso, ruta, di, 'piso');
  const explicacionLlana = texto(v.explicacionLlana, ruta, di, 'explicacionLlana');
  const criterios = condicion(v.criterios, `${ruta} → criterios`, di);
  if (
    !traza ||
    id === null ||
    nombreClinico === null ||
    sistema === null ||
    piso === null ||
    explicacionLlana === null ||
    !criterios
  ) {
    return null;
  }
  return {
    id,
    nombreClinico,
    sistema,
    criterios,
    piso: piso as Sindrome['piso'],
    explicacionLlana,
    fuente: traza.fuente,
    aprobadoPor: traza.aprobadoPor,
  };
}

function susceptibilidad(v: unknown, ruta: string, di: Di): Susceptibilidad | null {
  if (!esObjeto(v)) {
    di(`${ruta}: no es un objeto`);
    return null;
  }
  const traza = trazabilidad(v, ruta, di);
  const id = texto(v.id, ruta, di, 'id');
  const nombreClinico = texto(v.nombreClinico, ruta, di, 'nombreClinico');
  const eleva = listaDeTextos(v.eleva, ruta, di, 'eleva');
  const cuando = condicion(v.cuando, `${ruta} → cuando`, di);
  if (!traza || id === null || nombreClinico === null || !eleva || !cuando) return null;

  const sus: Susceptibilidad = {
    id,
    nombreClinico,
    cuando,
    eleva,
    fuente: traza.fuente,
    aprobadoPor: traza.aprobadoPor,
  };
  if (v.relaja !== undefined) {
    const relaja = listaDeTextos(v.relaja, ruta, di, 'relaja');
    if (!relaja) return null;
    sus.relaja = relaja;
  }
  return sus;
}

function desenlace(v: unknown, ruta: string, di: Di): Desenlace | null {
  if (!esObjeto(v)) {
    di(`${ruta}: el desenlace no es un objeto`);
    return null;
  }
  if (!esObjeto(v.paraElPaciente)) {
    di(`${ruta}: el desenlace no trae "paraElPaciente"`);
    return null;
  }
  if (!esObjeto(v.paraElMedico)) {
    di(`${ruta}: el desenlace no trae "paraElMedico"`);
    return null;
  }
  if (!esObjeto(v.aprobadoPor)) {
    di(`${ruta}: el desenlace no trae "aprobadoPor"`);
    return null;
  }
  const nivel = texto(v.nivel, ruta, di, 'nivel');
  const medico = texto(v.aprobadoPor.medico, ruta, di, 'aprobadoPor.medico');
  const fecha = texto(v.aprobadoPor.fecha, ruta, di, 'aprobadoPor.fecha');
  const explicacionProbable = texto(
    v.paraElPaciente.explicacionProbable,
    ruta,
    di,
    'paraElPaciente.explicacionProbable'
  );
  const noSeResuelveAqui = texto(
    v.paraElPaciente.noSeResuelveAqui,
    ruta,
    di,
    'paraElPaciente.noSeResuelveAqui'
  );
  const planDelIntervalo = listaDeTextos(
    v.paraElPaciente.planDelIntervalo,
    ruta,
    di,
    'paraElPaciente.planDelIntervalo'
  );
  const hipotesis = texto(v.paraElMedico.hipotesis, ruta, di, 'paraElMedico.hipotesis');
  const loQueQuedaSinValorar = listaDeTextos(
    v.paraElMedico.loQueQuedaSinValorar,
    ruta,
    di,
    'paraElMedico.loQueQuedaSinValorar'
  );
  if (
    nivel === null ||
    medico === null ||
    fecha === null ||
    explicacionProbable === null ||
    noSeResuelveAqui === null ||
    !planDelIntervalo ||
    hipotesis === null ||
    !loQueQuedaSinValorar
  ) {
    return null;
  }
  return {
    nivel: nivel as Desenlace['nivel'],
    paraElPaciente: { explicacionProbable, noSeResuelveAqui, planDelIntervalo },
    paraElMedico: { hipotesis, loQueQuedaSinValorar },
    aprobadoPor: { medico, fecha },
  };
}

function nodo(v: unknown, ruta: string, di: Di): Nodo | null {
  if (!esObjeto(v)) {
    di(`${ruta}: no es un objeto`);
    return null;
  }
  const id = texto(v.id, ruta, di, 'id');
  if (id === null) return null;

  const n: Nodo = { id };
  if (v.llena !== undefined) {
    const llena = texto(v.llena, ruta, di, 'llena');
    if (llena === null) return null;
    n.llena = llena;
  }
  if (v.exigeInstrumento !== undefined) {
    if (typeof v.exigeInstrumento !== 'boolean') {
      di(`${ruta}: "exigeInstrumento" no es sí o no`);
      return null;
    }
    n.exigeInstrumento = v.exigeInstrumento;
  }
  if (v.ramas !== undefined) {
    if (!Array.isArray(v.ramas)) {
      di(`${ruta}: "ramas" no es una lista`);
      return null;
    }
    const ramas: { cuando: Condicion; ir: string }[] = [];
    for (const [i, cruda] of v.ramas.entries()) {
      if (!esObjeto(cruda)) {
        di(`${ruta} → ramas[${i}]: no es un objeto`);
        return null;
      }
      const ir = texto(cruda.ir, `${ruta} → ramas[${i}]`, di, 'ir');
      const cuando = condicion(cruda.cuando, `${ruta} → ramas[${i}] → cuando`, di);
      if (ir === null || !cuando) return null;
      ramas.push({ cuando, ir });
    }
    n.ramas = ramas;
  }
  if (v.desenlace !== undefined) {
    const d = desenlace(v.desenlace, ruta, di);
    if (!d) return null;
    n.desenlace = d;
  }
  return n;
}

function arbol(v: unknown, ruta: string, di: Di): Arbol | null {
  if (!esObjeto(v)) {
    di(`${ruta}: no es un objeto`);
    return null;
  }
  const id = texto(v.id, ruta, di, 'id');
  const motivo = texto(v.motivo, ruta, di, 'motivo');
  const raiz = texto(v.raiz, ruta, di, 'raiz');
  if (!Array.isArray(v.nodos) || v.nodos.length === 0) {
    di(`${ruta}: "nodos" no es una lista con algo dentro`);
    return null;
  }
  const nodos: Nodo[] = [];
  for (const [i, crudo] of v.nodos.entries()) {
    const n = nodo(crudo, `${ruta} → nodos[${i}]`, di);
    if (!n) return null;
    nodos.push(n);
  }
  if (id === null || motivo === null || raiz === null) return null;

  const a: Arbol = { id, motivo, raiz, nodos };
  if (v.adelanta !== undefined) {
    const adelanta = listaDeTextos(v.adelanta, ruta, di, 'adelanta');
    if (!adelanta) return null;
    a.adelanta = adelanta;
  }
  return a;
}

// ─────────────────────────────────────────────────────────────
// La puerta
// ─────────────────────────────────────────────────────────────

function repetidos(ids: readonly string[]): string[] {
  const vistos = new Set<string>();
  const dobles = new Set<string>();
  for (const id of ids) {
    if (vistos.has(id)) dobles.add(id);
    vistos.add(id);
  }
  return [...dobles];
}

/**
 * De un `unknown` a una base de reglas, o a la base vacía con la lista de lo que
 * estaba mal.
 *
 * `problemas` vacío es la única forma de que `base` traiga algo, y quien llama
 * no tiene que acordarse de comprobarlo: cuando hay un problema, `base` ya es
 * `BASE_VACIA`.
 */
export function desdeFirestore(crudo: unknown): { base: BaseDeReglas; problemas: string[] } {
  const problemas: string[] = [];
  const di: Di = (p) => problemas.push(p);

  if (crudo === undefined || crudo === null) {
    return { base: BASE_VACIA, problemas: ['no hay base de reglas publicada'] };
  }
  if (!esObjeto(crudo)) {
    return { base: BASE_VACIA, problemas: ['la base publicada no es un objeto'] };
  }

  // Una clase que falta es una lista vacía, no un error: una base con alarmas y
  // sin árboles es perfectamente válida. Una clase que está y no es lista, sí.
  for (const clase of CLASES) {
    if (crudo[clase] !== undefined && !Array.isArray(crudo[clase])) {
      di(`"${clase}" está en el documento y no es una lista`);
    }
  }
  if (problemas.length) return { base: BASE_VACIA, problemas };

  const cosechar = <T>(
    clase: (typeof CLASES)[number],
    uno: (v: unknown, ruta: string, di: Di) => T | null
  ): T[] => {
    const crudos = Array.isArray(crudo[clase]) ? (crudo[clase] as unknown[]) : [];
    const salida: T[] = [];
    for (const [i, crudoUno] of crudos.entries()) {
      const parsed = uno(crudoUno, `${clase}[${i}]`, di);
      if (parsed) salida.push(parsed);
    }
    return salida;
  };

  const base: BaseDeReglas = {
    alarmas: cosechar('alarmas', alarma),
    activadores: cosechar('activadores', activador),
    sindromes: cosechar('sindromes', sindrome),
    susceptibilidades: cosechar('susceptibilidades', susceptibilidad),
    escalas: cosechar('escalas', escala),
    arboles: cosechar('arboles', arbol),
  };

  // Dos reglas con el mismo id no las ve `revisarBase()` y hacen ilegible el log
  // del turno: "ALARMA: dolor_toracico" dejaría de decir cuál se disparó.
  for (const clase of CLASES) {
    for (const id of repetidos(base[clase].map((r) => r.id))) {
      di(`${clase}: hay más de una regla con el id "${id}"`);
    }
  }

  if (problemas.length) return { base: BASE_VACIA, problemas };
  return { base, problemas };
}
