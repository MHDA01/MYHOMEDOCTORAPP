/**
 * Las EPS que operan en Colombia, como lista cerrada.
 *
 * ¿Por qué una lista y no texto libre? Hasta el 11-nov-2026 la EPS se escribía a
 * mano (`insuranceProviderName`, 200 caracteres). Así, "Sanitas", "sanitas eps" y
 * "EPS SANITAS S.A.S." son tres valores distintos y no se pueden casar con nada:
 * ni con un directorio de urgencias, ni entre dos integrantes de la misma familia.
 *
 * FUENTE, y es la única: "EPS VIGENTES DEL REGIMEN CONTRIBUTIVO Y SUBSIDIADO –
 * SGSSS", Ministerio de Salud y Protección Social, Subdirección de la Operación
 * del Aseguramiento en Salud. Fecha del formato: 05 de junio de 2025.
 * https://www.minsalud.gov.co/sites/rid/Lists/BibliotecaDigital/RIDE/VP/DOA/listado-eps-por-regimen.pdf
 * Leída y transcrita el 11-nov-2026. Son las 28 entidades del documento, con su
 * código, su NIT y su régimen tal como el documento los trae.
 *
 * ⚠️ ESTA LISTA ENVEJECE. El mapa de EPS en Colombia se mueve: hay entidades
 * intervenidas, recuperadas y liquidadas, y una EPS liquidada deja a sus afiliados
 * trasladados a otra. `FUENTE_FECHA` es la fecha del documento, no la de hoy:
 * quien la use para algo que importe debe mirar si el Ministerio publicó una
 * versión nueva. No se añaden ni se quitan filas "de memoria": se vuelve al PDF.
 *
 * Este archivo no trae un solo teléfono ni un solo texto clínico: es solo cómo se
 * nombra una EPS. Los teléfonos viven en `directorio-urgencias.ts`, con su propia
 * fuente y su propia fecha, porque envejecen mucho más rápido que un nombre.
 */

export const FUENTE_EPS =
  'https://www.minsalud.gov.co/sites/rid/Lists/BibliotecaDigital/RIDE/VP/DOA/listado-eps-por-regimen.pdf';

/** Fecha del formato del documento del Ministerio, no la de la última lectura. */
export const FUENTE_EPS_FECHA = '2025-06-05';

/** Día en que se transcribió el PDF a este archivo. */
export const FUENTE_EPS_LEIDA = '2026-11-11';

export type RegimenEps = 'contributivo' | 'subsidiado' | 'ambos';

export type Eps = {
  /** Identificador estable que se guarda en la ficha. No cambia aunque el nombre comercial cambie. */
  id: string;
  /** Nombre como lo trae el documento del Ministerio, con mayúsculas y tildes normales. */
  nombre: string;
  /** Código de habilitación principal (EPS/ESS/CCF/EAS/EPSI). */
  codigo: string;
  nit: string;
  regimen: RegimenEps;
};

/**
 * El valor que se guarda cuando la persona dice que tiene una EPS que no está en
 * la lista: una liquidada, una nueva, o un nombre que no reconocemos. No es un
 * error, es una respuesta, y se guarda con el nombre que ella escribió.
 */
export const EPS_OTRA = 'otra';

export const EPS_COLOMBIA: readonly Eps[] = [
  // Ambos regímenes
  { id: 'coosalud', nombre: 'Coosalud EPS-S', codigo: 'ESS024', nit: '900226715', regimen: 'ambos' },
  { id: 'nueva-eps', nombre: 'Nueva EPS', codigo: 'EPS037', nit: '900156264', regimen: 'ambos' },
  { id: 'mutual-ser', nombre: 'Mutual SER', codigo: 'ESS207', nit: '806008394', regimen: 'ambos' },
  { id: 'salud-mia', nombre: 'Salud Mía', codigo: 'EPS046', nit: '900914254', regimen: 'ambos' },

  // Contributivo
  { id: 'aliansalud', nombre: 'Aliansalud EPS', codigo: 'EPS001', nit: '830113831', regimen: 'contributivo' },
  { id: 'salud-total', nombre: 'Salud Total EPS S.A.', codigo: 'EPS002', nit: '800130907', regimen: 'contributivo' },
  { id: 'sanitas', nombre: 'EPS Sanitas', codigo: 'EPS005', nit: '800251440', regimen: 'contributivo' },
  { id: 'sura', nombre: 'EPS Sura', codigo: 'EPS010', nit: '800088702', regimen: 'contributivo' },
  { id: 'famisanar', nombre: 'Famisanar', codigo: 'EPS017', nit: '830003564', regimen: 'contributivo' },
  { id: 'sos', nombre: 'Servicio Occidental de Salud EPS SOS', codigo: 'EPS018', nit: '805001157', regimen: 'contributivo' },
  { id: 'comfenalco-valle', nombre: 'Comfenalco Valle', codigo: 'EPS012', nit: '890303093', regimen: 'contributivo' },
  { id: 'compensar', nombre: 'Compensar EPS', codigo: 'EPS008', nit: '860066942', regimen: 'contributivo' },
  { id: 'epm', nombre: 'EPM - Empresas Públicas de Medellín', codigo: 'EAS016', nit: '890904996', regimen: 'contributivo' },
  {
    id: 'ferrocarriles',
    nombre: 'Fondo de Pasivo Social de Ferrocarriles Nacionales de Colombia',
    codigo: 'EAS027',
    nit: '800112806',
    regimen: 'contributivo',
  },

  // Subsidiado
  { id: 'cajacopi', nombre: 'Cajacopi Atlántico', codigo: 'CCF055', nit: '890102044', regimen: 'subsidiado' },
  { id: 'capresoca', nombre: 'Capresoca', codigo: 'EPS025', nit: '891856000', regimen: 'subsidiado' },
  { id: 'comfachoco', nombre: 'Comfachocó', codigo: 'CCF102', nit: '891600091', regimen: 'subsidiado' },
  { id: 'comfaoriente', nombre: 'Comfaoriente', codigo: 'CCF050', nit: '890500675', regimen: 'subsidiado' },
  { id: 'familiar-de-colombia', nombre: 'EPS Familiar de Colombia', codigo: 'CCF033', nit: '901543761', regimen: 'subsidiado' },
  { id: 'asmet-salud', nombre: 'Asmet Salud', codigo: 'ESS062', nit: '900935126', regimen: 'subsidiado' },
  { id: 'emssanar', nombre: 'Emssanar E.S.S.', codigo: 'ESS118', nit: '901021565', regimen: 'subsidiado' },
  { id: 'capital-salud', nombre: 'Capital Salud EPS-S', codigo: 'EPSS34', nit: '900298372', regimen: 'subsidiado' },
  { id: 'savia-salud', nombre: 'Savia Salud EPS', codigo: 'EPSS40', nit: '900604350', regimen: 'subsidiado' },
  { id: 'dusakawi', nombre: 'Dusakawi EPSI', codigo: 'EPSI01', nit: '824001398', regimen: 'subsidiado' },
  { id: 'aic', nombre: 'Asociación Indígena del Cauca EPSI', codigo: 'EPSI03', nit: '817001773', regimen: 'subsidiado' },
  { id: 'anas-wayuu', nombre: 'Anas Wayuu EPSI', codigo: 'EPSI04', nit: '839000495', regimen: 'subsidiado' },
  { id: 'mallamas', nombre: 'Mallamas EPSI', codigo: 'EPSI05', nit: '837000084', regimen: 'subsidiado' },
  { id: 'pijaos-salud', nombre: 'Pijaos Salud EPSI', codigo: 'EPSI06', nit: '809008362', regimen: 'subsidiado' },
] as const;

/** Las opciones de régimen del formulario (`SEGURIDAD_SOCIAL.colombia.opciones`). */
export const REGIMEN_CONTRIBUTIVO = 'EPS contributiva';
export const REGIMEN_SUBSIDIADO = 'EPS subsidiada';
export const PREPAGADA = 'Medicina prepagada';

/**
 * Las EPS que se ofrecen para el régimen que la persona declaró. "Ambos
 * regímenes" entra en los dos. La medicina prepagada no es una EPS: ahí no se
 * ofrece lista, porque no tenemos una fuente oficial de prepagadas y una lista
 * inventada sería peor que un campo en blanco.
 */
export function epsDelRegimen(regimen: string | undefined): readonly Eps[] {
  if (regimen === REGIMEN_CONTRIBUTIVO) {
    return EPS_COLOMBIA.filter((e) => e.regimen === 'contributivo' || e.regimen === 'ambos');
  }
  if (regimen === REGIMEN_SUBSIDIADO) {
    return EPS_COLOMBIA.filter((e) => e.regimen === 'subsidiado' || e.regimen === 'ambos');
  }
  return [];
}

/** ¿Este régimen admite elegir una EPS de la lista? */
export function pideEps(regimen: string | undefined): boolean {
  return regimen === REGIMEN_CONTRIBUTIVO || regimen === REGIMEN_SUBSIDIADO;
}

/**
 * Cómo se escribe la aseguradora de una persona donde haya que mostrarla: el
 * informe en PDF, la tarjeta del familiograma, el contexto que recibe Hilda.
 *
 * El orden importa. Primero la EPS de la lista, que es el dato bueno; después lo
 * que la persona escribió a mano, que es lo que traen las fichas de antes del
 * 11-nov-2026 y lo que se guarda cuando la EPS no está en la lista; y al final el
 * régimen a secas ("EPS contributiva"), que al menos dice algo. Nunca inventa, y
 * devuelve cadena vacía cuando no hay nada: quien la use decide qué hacer con el
 * vacío en vez de recibir un "No registra" disfrazado de dato.
 */
export function nombreDeAseguradora(persona: {
  insuranceProvider?: string;
  insuranceProviderName?: string;
  epsId?: string;
}): string {
  const deLaLista = epsPorId(persona.epsId);
  if (deLaLista) return deLaLista.nombre;
  const aMano = persona.insuranceProviderName?.trim();
  if (aMano) return aMano;
  return persona.insuranceProvider?.trim() ?? '';
}

export function epsPorId(id: string | undefined): Eps | null {
  if (!id) return null;
  return EPS_COLOMBIA.find((e) => e.id === id) ?? null;
}

/**
 * Deja un nombre comparable: sin tildes, sin mayúsculas, sin puntuación, sin las
 * palabras que no distinguen a nadie ("eps", "s.a.", "e.s.s.", "epsi"…) y sin
 * espacios de más. "EPS SANITAS S.A.S." y "sanitas" acaban en el mismo "sanitas".
 */
export function normalizarNombreEps(texto: string): string {
  const sinTildes = texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  const sinPuntos = sinTildes.replace(/[^a-z0-9ñ ]+/g, ' ');
  const palabrasVacias = new Set([
    'eps',
    'epss',
    'epsi',
    'ess',
    'ccf',
    'eas',
    'sa',
    'sas',
    'ltda',
    'esp',
    'e',
    's',
    'de',
    'del',
    'la',
    'el',
    'y',
    'entidad',
    'promotora',
    'salud', // "salud" sola no distingue; los nombres que la necesitan la traen con otra palabra
  ]);
  const palabras = sinPuntos
    .split(/\s+/)
    // Una sola letra nunca distingue a una EPS, y "S.A.S." deja tres ("s a s"):
    // sin esto, "EPS SANITAS S.A.S." terminaba en "sanitas a".
    .filter((p) => p.length > 1)
    .filter((p) => !palabrasVacias.has(p));
  return palabras.join(' ').trim();
}

/**
 * Casa el texto que alguien escribió a mano con una EPS de la lista. Devuelve
 * `null` cuando no hay una coincidencia clara, y `null` es la respuesta correcta:
 * es lo que deja el valor como "otra" con su nombre, en vez de adivinar.
 *
 * Nunca hace coincidencias parciales de una sola letra ni por parecido: o el
 * nombre normalizado coincide, o una de las dos cadenas contiene a la otra con al
 * menos cuatro caracteres. Lo demás se queda sin casar, a propósito.
 */
export function buscarEps(textoLibre: string | undefined): Eps | null {
  if (!textoLibre) return null;
  const buscado = normalizarNombreEps(textoLibre);
  if (buscado.length < 3) return null;

  const exacta = EPS_COLOMBIA.find((e) => normalizarNombreEps(e.nombre) === buscado);
  if (exacta) return exacta;

  // "salud total eps" vs "salud total": uno contiene al otro.
  const contenidas = EPS_COLOMBIA.filter((e) => {
    const nombre = normalizarNombreEps(e.nombre);
    if (nombre.length < 4 || buscado.length < 4) return false;
    return nombre.includes(buscado) || buscado.includes(nombre);
  });
  // Si dos EPS encajan, no sabemos cuál es: no se elige ninguna.
  return contenidas.length === 1 ? contenidas[0] : null;
}
