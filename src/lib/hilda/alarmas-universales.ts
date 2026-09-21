import type { SignoDeAlarma } from './tipos';

/**
 * Signos de alarma que el centinela vigila en toda consulta, haya o no protocolo
 * del motivo. Son los que las instrucciones aprobadas de la Dra. Hilda (v2.1,
 * sección 3) mandan escalar SIEMPRE a urgencias. Agregar o quitar uno es una
 * decisión clínica: requiere la aprobación del médico responsable.
 *
 * Las palabras clave no deciden solas: si la IA que lee la conversación funciona,
 * manda su lectura (entiende "no tengo dolor en el pecho"). Si esa IA falla, una
 * coincidencia basta para derivar: ante la duda, se prefiere de más a de menos.
 * Se comparan contra el texto sin tildes y en minúsculas (ver normalizar()).
 */
export const ALARMAS_UNIVERSALES: SignoDeAlarma[] = [
  {
    id: 'u-dolor-toracico',
    texto: 'dolor en el pecho',
    origen: 'universal',
    palabrasClave: [
      /dolor (en el|de|del) pecho/,
      /(duele|dolia|duela) (mucho )?el pecho/,
      /dolor toracico/,
      /opresion (en el|del) pecho/,
      /(aprieta|oprime) el pecho/,
    ],
  },
  {
    id: 'u-dificultad-respiratoria',
    texto: 'dificultad para respirar',
    origen: 'universal',
    palabrasClave: [
      /no (puede|puedo|pueden|podia) respirar/,
      /(me|se) (ahoga|ahogo|esta ahogando)/,
      /dificultad (para|al) respirar/,
      /falta (de|el) aire/,
      /labios morados/,
    ],
  },
  {
    id: 'u-perdida-conciencia',
    texto: 'pérdida del conocimiento',
    origen: 'universal',
    palabrasClave: [/(se|me) desmay/, /inconsciente/, /perdio (el conocimiento|la conciencia|el sentido)/, /no (responde|reacciona|despierta)/],
  },
  {
    id: 'u-acv',
    texto: 'signos de ataque cerebrovascular (cara caída, debilidad de un brazo o dificultad para hablar)',
    origen: 'universal',
    palabrasClave: [
      /(cara|boca) (torcida|caida|chueca|desviada)/,
      /no (puede|puedo) hablar/,
      /habla (enredado|arrastrado|raro|trabado)/,
      /no (puede|puedo) mover (el|un|la) (brazo|pierna|lado)/,
      /(se le|se me) (durmio|adormecio|paralizo) (medio cuerpo|un lado|la mitad)/,
    ],
  },
  {
    id: 'u-sangrado',
    texto: 'sangrado activo que no se controla',
    origen: 'universal',
    palabrasClave: [/no (para|deja) de sangrar/, /sangra(ndo)? (mucho|abundante|sin parar)/, /hemorragia/, /(vomit|tos)\w* (con )?sangre/],
  },
  {
    id: 'u-trauma',
    texto: 'trauma severo',
    origen: 'universal',
    palabrasClave: [/accidente de (transito|moto|carro)/, /atropell/, /golpe (muy )?(fuerte )?en la cabeza/, /herida (por|de|con) (arma|bala|cuchillo|machete)/],
  },
  {
    id: 'u-crisis-mental',
    texto: 'ideas de hacerse daño o crisis de salud mental aguda',
    origen: 'universal',
    palabrasClave: [
      /suicid/,
      /quitarme la vida/,
      /matarme/,
      /no quiero (seguir )?vivir/,
      /hacerme dano/,
      /quiero morir/,
      /acabar con (mi vida|todo)/,
    ],
  },
  {
    id: 'u-alergia-grave',
    texto: 'reacción alérgica grave (dificultad para respirar o hinchazón de labios, lengua o garganta)',
    origen: 'universal',
    palabrasClave: [
      /(hincha|hinchan|hincho|inflam)\w* (la cara|los labios|la lengua|la garganta|los ojos)/,
      /hinchazon (de|en) (la )?(cara|labios|lengua|garganta)/,
      /(se me|se le) cierra la garganta/,
    ],
  },
];

/** Minúsculas, sin tildes y con espacios simples: así se comparan las palabras clave. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Ids de los signos universales cuyas palabras clave aparecen en el texto. */
export function coincidenciasPorPalabraClave(texto: string, signos: SignoDeAlarma[] = ALARMAS_UNIVERSALES): string[] {
  const limpio = normalizar(texto);
  return signos.filter((s) => s.palabrasClave?.some((re) => re.test(limpio))).map((s) => s.id);
}
