/**
 * Que la pantalla de urgencias sea colombiana y no diga nada que no podamos
 * sostener.
 *
 * Por qué existe esta prueba: hasta el 11-nov-2026 `urgencias-page.tsx` tenía un
 * botón rojo que marcaba `tel:131` ("Llamar al SAMU") y cuatro prestadores
 * chilenos —Red de Salud UC CHRISTUS, Clínica Alemana, Help Asistencia,
 * familymed— presentados como "nuestros proveedores". El SAMU y el 131 son de
 * Chile: en Colombia ese número no manda una ambulancia. Y no era código muerto:
 * `/dashboard/urgencias` es una ruta viva y estaba desplegada.
 *
 * Las reglas que se fijan aquí:
 *
 *  1. Ni el 131, ni el SAMU, ni los cuatro prestadores chilenos vuelven a `src/`.
 *  2. El 123 no depende de nada: ni de la EPS, ni de la ciudad, ni de que algo
 *     esté verificado.
 *  3. Ningún teléfono de un tercero se muestra sin fuente, sin fecha y sin la
 *     aprobación del fundador.
 *  4. Una EPS escrita a mano no se casa por parecido: o coincide, o queda "otra".
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  EPS_COLOMBIA,
  EPS_OTRA,
  REGIMEN_CONTRIBUTIVO,
  REGIMEN_SUBSIDIADO,
  PREPAGADA,
  buscarEps,
  epsDelRegimen,
  epsPorId,
  normalizarNombreEps,
  pideEps,
} from '../../src/lib/eps-colombia';
import { MUNICIPIOS_COLOMBIA, MUNICIPIO_OTRO, municipioPorId, municipiosOrdenados } from '../../src/lib/municipios-colombia';
import {
  APROBADO_POR_EL_FUNDADOR,
  DIAS_DE_VIGENCIA,
  LINEAS_POR_EPS,
  LINEA_EMERGENCIAS,
  SEDES_DE_URGENCIAS,
  fuenteVigente,
  hoyEnBogota,
  urgenciasPara,
  type Fuente,
} from '../../src/lib/directorio-urgencias';

const RAIZ = join(__dirname, '..', '..');
const SRC = join(RAIZ, 'src');

function archivosDeCodigo(carpeta: string): string[] {
  return readdirSync(carpeta).flatMap((nombre) => {
    const ruta = join(carpeta, nombre);
    if (statSync(ruta).isDirectory()) return archivosDeCodigo(ruta);
    return /\.tsx?$/.test(nombre) ? [ruta] : [];
  });
}

/**
 * Quita los comentarios antes de buscar. Hace falta: la propia pantalla explica
 * en su cabecera qué tenía antes —el SAMU, el 131, los cuatro prestadores— y esa
 * memoria es justo lo que evita que alguien lo reintroduzca. Lo que no puede
 * volver es el **código**, no el relato de por qué se fue.
 */
function sinComentarios(texto: string): string {
  return texto.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|\s)\/\/.*$/gm, ' ');
}

const archivos = archivosDeCodigo(SRC).map((ruta) => ({
  ruta: ruta.slice(RAIZ.length + 1).replace(/\\/g, '/'),
  texto: sinComentarios(readFileSync(ruta, 'utf8')),
}));

describe('Nada de Chile en la app colombiana', () => {
  it('nadie marca el 131', () => {
    const culpables = archivos.filter((a) => /tel:\s*131/.test(a.texto)).map((a) => a.ruta);
    expect(culpables, 'el 131 es la línea de Chile; en Colombia es el 123').toEqual([]);
  });

  it('no se nombra al SAMU ni a Fonasa como si fueran de aquí', () => {
    // 'Fonasa' sí puede aparecer en la lista de países de la ficha (familia.ts),
    // que es una opción deliberada; lo que no puede es estar en una pantalla.
    const culpables = archivos
      .filter((a) => a.ruta.includes('/components/') || a.ruta.includes('/app/'))
      .filter((a) => /\bSAMU\b/i.test(a.texto))
      .map((a) => a.ruta);
    expect(culpables).toEqual([]);
  });

  it('los cuatro prestadores chilenos no vuelven', () => {
    const inventados = ['UC CHRISTUS', 'Clínica Alemana', 'Help Asistencia', 'familymed'];
    for (const nombre of inventados) {
      const culpables = archivos.filter((a) => a.texto.includes(nombre)).map((a) => a.ruta);
      expect(culpables, `${nombre} no es un prestador nuestro ni opera en Colombia`).toEqual([]);
    }
  });

  it('la pantalla de urgencias no promete "nuestros proveedores"', () => {
    const pantalla = archivos.find((a) => a.ruta.endsWith('components/dashboard/urgencias-page.tsx'));
    expect(pantalla, 'la pantalla de urgencias debe existir').toBeTruthy();
    expect(/nuestros proveedores/i.test(pantalla!.texto)).toBe(false);
  });

  it('la pantalla de urgencias ofrece el 123', () => {
    const pantalla = archivos.find((a) => a.ruta.endsWith('components/dashboard/urgencias-page.tsx'))!;
    expect(pantalla.texto).toContain('123');
  });
});

describe('La lista de EPS', () => {
  it('son las 28 del documento del Ministerio', () => {
    expect(EPS_COLOMBIA).toHaveLength(28);
  });

  it('ningún id ni código repetido, porque el id es lo que se guarda', () => {
    const ids = EPS_COLOMBIA.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    const codigos = EPS_COLOMBIA.map((e) => e.codigo);
    expect(new Set(codigos).size).toBe(codigos.length);
  });

  it('todas traen NIT y régimen', () => {
    for (const eps of EPS_COLOMBIA) {
      expect(eps.nit, eps.nombre).toMatch(/^\d{9}$/);
      expect(['contributivo', 'subsidiado', 'ambos']).toContain(eps.regimen);
    }
  });

  it('el contributivo incluye las de ambos regímenes y no las subsidiadas', () => {
    const contributivas = epsDelRegimen(REGIMEN_CONTRIBUTIVO);
    expect(contributivas.map((e) => e.id)).toContain('sanitas');
    expect(contributivas.map((e) => e.id)).toContain('nueva-eps'); // ambos regímenes
    expect(contributivas.map((e) => e.id)).not.toContain('capital-salud');
  });

  it('el subsidiado incluye las de ambos regímenes y no las contributivas', () => {
    const subsidiadas = epsDelRegimen(REGIMEN_SUBSIDIADO);
    expect(subsidiadas.map((e) => e.id)).toContain('capital-salud');
    expect(subsidiadas.map((e) => e.id)).toContain('coosalud'); // ambos regímenes
    expect(subsidiadas.map((e) => e.id)).not.toContain('sanitas');
  });

  it('la medicina prepagada no ofrece lista: no es una EPS y no tenemos fuente', () => {
    expect(pideEps(PREPAGADA)).toBe(false);
    expect(epsDelRegimen(PREPAGADA)).toEqual([]);
    expect(epsDelRegimen(undefined)).toEqual([]);
  });

  it('epsPorId devuelve null en vez de inventar', () => {
    expect(epsPorId('sura')?.nombre).toBe('EPS Sura');
    expect(epsPorId('la-que-no-existe')).toBeNull();
    expect(epsPorId(undefined)).toBeNull();
    expect(epsPorId(EPS_OTRA)).toBeNull();
  });
});

describe('Casar la EPS que alguien escribió a mano', () => {
  it('normaliza tildes, mayúsculas, puntos y las palabras que no distinguen', () => {
    expect(normalizarNombreEps('EPS SANITAS S.A.S.')).toBe('sanitas');
    expect(normalizarNombreEps('  sanitas ')).toBe('sanitas');
    expect(normalizarNombreEps('Emssanar E.S.S.')).toBe('emssanar');
  });

  it('casa las formas en que la gente de verdad la escribe', () => {
    expect(buscarEps('sanitas')?.id).toBe('sanitas');
    expect(buscarEps('EPS SANITAS S.A.S.')?.id).toBe('sanitas');
    expect(buscarEps('Nueva EPS')?.id).toBe('nueva-eps');
    expect(buscarEps('nueva eps')?.id).toBe('nueva-eps');
    expect(buscarEps('Salud Total EPS')?.id).toBe('salud-total');
    expect(buscarEps('compensar')?.id).toBe('compensar');
  });

  it('no adivina: lo que no coincide queda sin casar', () => {
    expect(buscarEps('Coomeva')).toBeNull(); // liquidada, no está en la lista
    expect(buscarEps('la del barrio')).toBeNull();
    expect(buscarEps('')).toBeNull();
    expect(buscarEps(undefined)).toBeNull();
    expect(buscarEps('ab')).toBeNull();
  });

  it('"eps" a secas no casa con nadie, aunque todas la lleven en el nombre', () => {
    expect(buscarEps('EPS')).toBeNull();
    expect(buscarEps('eps s.a.')).toBeNull();
  });
});

describe('Los municipios', () => {
  it('están las 32 capitales y Bogotá', () => {
    expect(MUNICIPIOS_COLOMBIA.filter((m) => m.capital)).toHaveLength(32);
  });

  it('ningún id repetido', () => {
    const ids = MUNICIPIOS_COLOMBIA.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('el selector pone las capitales primero', () => {
    const ordenados = municipiosOrdenados();
    expect(ordenados).toHaveLength(MUNICIPIOS_COLOMBIA.length);
    const primeraNoCapital = ordenados.findIndex((m) => !m.capital);
    const ultimaCapital = ordenados.map((m) => m.capital).lastIndexOf(true);
    expect(ultimaCapital).toBeLessThan(primeraNoCapital);
  });

  it('municipioPorId no inventa', () => {
    expect(municipioPorId('bogota')?.departamento).toBe('Bogotá D.C.');
    expect(municipioPorId(MUNICIPIO_OTRO)).toBeNull();
    expect(municipioPorId(undefined)).toBeNull();
  });
});

describe('El directorio de urgencias', () => {
  const HOY = '2026-11-11';

  it('el 123 es el 123', () => {
    expect(LINEA_EMERGENCIAS).toBe('123');
  });

  it('el 123 se devuelve siempre, incluso sin EPS, sin ciudad y sin nada verificado', () => {
    expect(urgenciasPara({}, HOY).lineaEmergencias).toBe('123');
    expect(urgenciasPara({ epsId: 'sura', municipioId: 'medellin' }, HOY).lineaEmergencias).toBe('123');
    expect(urgenciasPara({ epsId: 'la-que-no-existe' }, HOY).lineaEmergencias).toBe('123');
  });

  it('mientras el fundador no apruebe, no sale ni un teléfono de tercero', () => {
    // Esta prueba es el interruptor. El día que `APROBADO_POR_EL_FUNDADOR` pase a
    // `true`, deja de aplicar la primera rama y empiezan a valer las de abajo.
    const resultado = urgenciasPara({ epsId: 'sura', municipioId: 'medellin' }, HOY);
    if (!APROBADO_POR_EL_FUNDADOR) {
      expect(resultado.motivo).toBe('sin_aprobar');
      expect(resultado.telefonos).toEqual([]);
      expect(resultado.sedes).toEqual([]);
      expect(resultado.paginaOficial).toBeNull();
    } else {
      expect(resultado.telefonos.length).toBeGreaterThan(0);
    }
  });

  it('cada línea y cada sede trae fuente, fecha y responsable', () => {
    const conFuente = [...LINEAS_POR_EPS, ...SEDES_DE_URGENCIAS];
    for (const fila of conFuente) {
      expect(fila.fuente.url, JSON.stringify(fila)).toMatch(/^https?:\/\//);
      expect(fila.fuente.verificado).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(fila.fuente.por.length).toBeGreaterThan(0);
    }
  });

  it('cada línea apunta a una EPS que existe en la lista', () => {
    for (const linea of LINEAS_POR_EPS) {
      expect(epsPorId(linea.epsId), linea.epsId).not.toBeNull();
    }
    for (const sede of SEDES_DE_URGENCIAS) {
      expect(epsPorId(sede.epsId), sede.epsId).not.toBeNull();
      expect(municipioPorId(sede.municipioId), sede.municipioId).not.toBeNull();
    }
  });

  it('una fuente caduca a los seis meses', () => {
    const fuente: Fuente = { url: 'https://ejemplo.co', verificado: '2026-01-01', por: 'prueba' };
    expect(fuenteVigente(fuente, '2026-01-01')).toBe(true);
    expect(fuenteVigente(fuente, '2026-06-01')).toBe(true); // 151 días
    expect(fuenteVigente(fuente, '2026-12-01')).toBe(false); // 334 días
    expect(DIAS_DE_VIGENCIA).toBe(180);
  });

  it('una fecha ilegible o del futuro no vale: ante la duda, la pantalla calla', () => {
    expect(fuenteVigente({ url: 'https://x.co', verificado: 'ayer', por: 'p' }, '2026-11-11')).toBe(false);
    expect(fuenteVigente({ url: 'https://x.co', verificado: '2027-01-01', por: 'p' }, '2026-11-11')).toBe(false);
  });

  it('sin EPS en la ficha se dice que falta, no se muestra un hueco', () => {
    const resultado = urgenciasPara({}, HOY);
    expect(resultado.motivo).not.toBeNull();
    expect(resultado.eps).toBeNull();
  });

  it('la EPS escrita a mano se devuelve tal cual cuando no está en la lista', () => {
    const resultado = urgenciasPara({ epsDeclarada: '  Coomeva  ' }, HOY);
    expect(resultado.epsDeclarada).toBe('Coomeva');
    expect(resultado.eps).toBeNull();
  });

  it('con la EPS de la lista, el nombre sale de la lista y no del texto libre', () => {
    const resultado = urgenciasPara({ epsId: 'sura', epsDeclarada: 'sura eps s.a.' }, HOY);
    expect(resultado.eps).toBe('EPS Sura');
    expect(resultado.epsDeclarada).toBeNull();
  });

  it('hoyEnBogota da una fecha sin hora y en la zona de Bogotá', () => {
    expect(hoyEnBogota(new Date('2026-11-11T20:00:00.000Z'))).toBe('2026-11-11');
    // 02:00 UTC es todavía el día anterior en Bogotá (UTC-5).
    expect(hoyEnBogota(new Date('2026-11-11T02:00:00.000Z'))).toBe('2026-11-10');
  });
});
