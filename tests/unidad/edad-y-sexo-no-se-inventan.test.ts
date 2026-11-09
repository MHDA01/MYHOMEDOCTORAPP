import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Ni la edad ni el sexo se inventan, en ningún camino de la app.
 *
 * Son los dos datos con los que se estratifica toda la orientación: "la edad
 * sola descarta condiciones patológicas" y "el sexo no se deduce de un nombre"
 * (criterio del médico responsable, 28-oct-2026). Hasta el 8-nov-2026 había
 * **cuatro** sitios que los fabricaban, y ninguno rompía ninguna pantalla:
 *
 * 1. El registro guardaba `other` y la fecha del día, sin preguntar.
 * 2. El contexto de usuario hacía lo mismo para una cuenta sin documento, y lo
 *    escribía en Firestore.
 * 3. Los dos normalizadores de fecha —en el contexto y en la Server Action—
 *    devolvían la fecha de hoy cuando no podían leer la que había.
 * 4. El formulario de integrantes traía "Mujer" preseleccionado.
 *
 * Esta prueba lee el código fuente porque la suite corre en Node, sin DOM, y
 * porque lo que hay que impedir es que esas líneas vuelvan. No comprueba que la
 * app funcione: comprueba que no mienta.
 */

const leer = (ruta: string) => readFileSync(resolve(__dirname, '../../', ruta), 'utf8');

const REGISTRO = 'src/components/auth/register-form.tsx';
const CONTEXTO = 'src/context/user-context.tsx';
const ACCION = 'src/app/actions/user.ts';
const INTEGRANTES = 'src/components/familia/formulario-integrante.tsx';

/**
 * Un sexo escrito a mano en el código es, por definición, uno que nadie
 * contestó. Solo mira asignaciones: en una asignación el literal va seguido de
 * una coma o del cierre del objeto, mientras que en una declaración de tipo
 * —`sex: 'male' | 'female' | 'other' | ''`— lo sigue una barra.
 */
const SEXO_FIJO = /sex:\s*['"](other|male|female)['"]\s*[,}]/;
/** `new Date()` sin argumentos es hoy, y nadie nace hoy. */
const NACIMIENTO_DE_HOY = /dateOfBirth:\s*new Date\(\s*\)/;

describe('Ningún camino escribe un sexo que nadie contestó', () => {
  for (const ruta of [REGISTRO, CONTEXTO, ACCION, INTEGRANTES]) {
    it(`${ruta} no fija el sexo`, () => {
      expect(leer(ruta)).not.toMatch(SEXO_FIJO);
    });
  }

  it('la Server Action no rellena el sexo que falta', () => {
    expect(leer(ACCION)).not.toMatch(/sex:[^\n]*\|\|\s*['"]other['"]/);
  });

  it('el formulario de integrantes abre sin sexo elegido y lo exige para guardar', () => {
    const fuente = leer(INTEGRANTES);
    expect(fuente).toMatch(/sex:\s*''/);
    expect(fuente).toContain('<option value="">Selecciona…</option>');
    expect(fuente).toContain('!f.sex');
  });
});

describe('Ningún camino usa la fecha de hoy como fecha de nacimiento', () => {
  for (const ruta of [REGISTRO, CONTEXTO, ACCION]) {
    it(`${ruta} no nace hoy`, () => {
      expect(leer(ruta)).not.toMatch(NACIMIENTO_DE_HOY);
    });
  }

  it('los dos normalizadores devuelven "no se sabe" en vez de hoy', () => {
    // Era la trampa más silenciosa de las cuatro: una fecha ilegible se
    // convertía en una edad de cero sin que nada avisara.
    expect(leer(CONTEXTO)).toMatch(/function toDate\([^)]*\): Date \| undefined/);
    expect(leer(ACCION)).toMatch(/function normalizeDateValue\([^)]*\): string \| undefined/);
  });
});

describe('El formulario de registro pregunta la edad y el sexo', () => {
  const fuente = leer(REGISTRO);

  it('tiene el campo de fecha de nacimiento, obligatorio y sin futuro', () => {
    expect(fuente).toContain('id="register-dob"');
    expect(fuente).toMatch(/type="date"/);
    expect(fuente).toMatch(/max=\{hoyEnTexto\(\)\}/);
  });

  it('tiene el selector de sexo, y sin opción preseleccionada', () => {
    expect(fuente).toContain('id="register-sex"');
    expect(fuente).toContain('<option value="female">');
    expect(fuente).toContain('<option value="male">');
    expect(fuente).toContain('<option value="other">');
    expect(fuente).toContain('<option value="">');
    expect(fuente).toMatch(/const \[sex, setSex\] = useState\(''\)/);
    expect(fuente).toMatch(/const \[dateOfBirth, setDateOfBirth\] = useState\(''\)/);
  });

  it('no crea la cuenta si falta cualquiera de los dos', () => {
    // El `required` del navegador es la primera barrera; esta es la segunda,
    // porque crear la cuenta con los datos inventados es peor que no crearla.
    const validacion = fuente.indexOf('.test(dateOfBirth)');
    const creacion = fuente.indexOf('createUserWithEmailAndPassword(auth');
    expect(validacion).toBeGreaterThan(-1);
    expect(validacion).toBeLessThan(creacion);
    expect(fuente).toContain('!sex');
  });

  it('guarda la fecha del integrante como texto AAAA-MM-DD, sin hora', () => {
    // Regla de la casa. El perfil del tutor sí lleva Date, a mediodía UTC,
    // igual que saveTitularProfile, para que el día no se corra de zona.
    expect(fuente).toMatch(/^\s*dateOfBirth,\s*$/m);
    expect(fuente).toContain('T12:00:00.000Z');
  });
});
