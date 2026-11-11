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
 *  2. La pantalla ofrece el 123 y **ningún otro teléfono**. El directorio por EPS
 *     que se construyó ese mismo día se retiró por decisión de Alexander: no hay
 *     fuente oficial de con qué prestador atiende cada EPS, y en una urgencia la
 *     EPS no es la puerta (Ley 1751 de 2015, arts. 10 b) y 14). Esta prueba es lo
 *     que impide que vuelva a entrar un teléfono de tercero sin decidirlo.
 *  3. Una EPS escrita a mano no se casa por parecido: o coincide, o queda "otra".
 *     La EPS sigue viviendo en la ficha, que es donde sirve.
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
import { LINEA_EMERGENCIAS } from '../../src/lib/urgencias-colombia';

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
    expect(LINEA_EMERGENCIAS).toBe('123');
    expect(pantalla.texto, 'el número vive en urgencias-colombia.ts, no escrito a mano').toContain(
      'LINEA_EMERGENCIAS'
    );
  });

  it('la pantalla no marca ningún otro número que el 123', () => {
    // La regla que importa: un solo `tel:` en esta pantalla, y sale de la
    // constante. Si alguien vuelve a meter un teléfono de EPS, de prestador o de
    // una línea de coyuntura, esta prueba lo caza.
    const pantalla = archivos.find((a) => a.ruta.endsWith('components/dashboard/urgencias-page.tsx'))!;
    const marcados = pantalla.texto.match(/tel:[^`'"\s]*/g) ?? [];
    expect(marcados).toEqual(['tel:${LINEA_EMERGENCIAS}']);
  });

  it('no queda directorio por EPS: se retiró a propósito', () => {
    const directorio = archivos.filter((a) => /directorio-urgencias/.test(a.ruta));
    expect(directorio.map((a) => a.ruta), 'si vuelve, que sea por una decisión y no por inercia').toEqual([]);
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
