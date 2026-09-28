import { describe, expect, it } from 'vitest';
import {
  armarFamiliograma,
  calcularEdad,
  listaDesdeTexto,
  normalizarFechaNacimiento,
  normalizarSexo,
  rolDeParentesco,
} from '@/lib/familia';

const persona = (firstName: string, relationship: string, dateOfBirth: string, esTitular = false) => ({
  firstName,
  lastName: 'Pérez',
  relationship,
  dateOfBirth,
  esTitular,
});

const nombres = (grupo: { personas: { persona: { firstName: string } }[] }) => grupo.personas.map((p) => p.persona.firstName);

describe('Reglas de la familia', () => {
  it('normaliza el sexo de cualquiera de los formatos que ha tenido la app', () => {
    expect(['m', 'male', 'Masculino'].map(normalizarSexo)).toEqual(['male', 'male', 'male']);
    expect(['f', 'female', 'FEMENINO'].map(normalizarSexo)).toEqual(['female', 'female', 'female']);
    expect([undefined, 'other', 'x'].map(normalizarSexo)).toEqual(['other', 'other', 'other']);
  });

  it('deja la fecha de nacimiento como AAAA-MM-DD y rechaza las que no existen', () => {
    expect(normalizarFechaNacimiento('2019-03-10')).toBe('2019-03-10');
    expect(normalizarFechaNacimiento('2019-03-10T00:00:00.000Z')).toBe('2019-03-10');
    expect(normalizarFechaNacimiento(new Date('2019-03-10T12:00:00Z'))).toBe('2019-03-10');
    expect(normalizarFechaNacimiento('2019-02-31')).toBeNull();
    expect(normalizarFechaNacimiento('10/03/2019')).toBeNull();
    expect(normalizarFechaNacimiento('')).toBeNull();
  });

  it('calcula la edad por día, sin correrse por la zona horaria', () => {
    const hoy = new Date(2026, 8, 28, 9, 0);
    expect(calcularEdad('2019-09-28', hoy)).toBe(7);
    expect(calcularEdad('2019-09-29', hoy)).toBe(6);
    expect(calcularEdad('2026-09-28', hoy)).toBe(0);
    expect(calcularEdad('', hoy)).toBeUndefined();
    expect(calcularEdad('no-es-fecha', hoy)).toBeUndefined();
  });

  it('separa listas escritas con comas, punto y coma o saltos de línea', () => {
    expect(listaDesdeTexto('penicilina, maní;; látex\n polvo ,')).toEqual(['penicilina', 'maní', 'látex', 'polvo']);
    expect(listaDesdeTexto('   ')).toEqual([]);
  });

  it('clasifica los parentescos de la lista y los escritos a mano', () => {
    const casos: [string, string][] = [
      ['Cónyuge / Pareja', 'pareja'],
      ['Esposa', 'pareja'],
      ['Hijo/a', 'hijos'],
      ['Hija', 'hijos'],
      ['Padre', 'padres'],
      ['Mamá', 'padres'],
      ['Suegra', 'padres'],
      ['Hermano/a', 'hermanos'],
      ['Abuelo/a', 'abuelos'],
      ['Nieto/a', 'nietos'],
      ['Tío/a', 'tios'],
      ['Primo/a', 'primos'],
      ['Otro familiar', 'otros'],
      ['Integrante', 'otros'],
      ['', 'otros'],
    ];
    for (const [texto, rol] of casos) expect(rolDeParentesco(texto), texto).toBe(rol);
    expect(rolDeParentesco('Titular')).toBe('titular');
    expect(rolDeParentesco('lo que sea', true)).toBe('titular');
  });
});

describe('armarFamiliograma', () => {
  const hoy = new Date(2026, 8, 28);
  const familia = [
    persona('Sofía', 'Hijo/a', '2019-03-10'),
    persona('Ana', 'Titular', '1991-07-02', true),
    persona('Luis', 'Padre', '1960-01-01'),
    persona('Carlos', 'Cónyuge / Pareja', '1989-05-05'),
    persona('Marta', 'Madre', '1962-02-02'),
    persona('Rosa', 'Abuelo/a', '1935-04-04'),
    persona('Diego', 'Hermano/a', '1994-12-12'),
    persona('Tomás', 'Hijo/a', '2015-06-06'),
    persona('Nora', 'Tío/a', '1965-08-08'),
    persona('Zoe', 'Nieto/a', '2045-01-01'),
  ];

  it('ordena por generaciones, de abuelos a nietos', () => {
    const filas = armarFamiliograma(familia, hoy);
    expect(filas.map((f) => f.etiqueta)).toEqual(['Abuelos', 'Padres y tíos', 'Tu generación', 'Hijos', 'Nietos']);
  });

  it('une al titular con su pareja y al padre con la madre', () => {
    const filas = armarFamiliograma(familia, hoy);

    const media = filas.find((f) => f.nivel === 0)!;
    expect(media.grupos[0].esPareja).toBe(true);
    expect(nombres(media.grupos[0])).toEqual(['Ana', 'Carlos']);
    expect(media.grupos.slice(1).map((g) => nombres(g)[0])).toEqual(['Diego']);

    const padres = filas.find((f) => f.nivel === -1)!;
    expect(padres.grupos[0].esPareja).toBe(true);
    expect(nombres(padres.grupos[0])).toEqual(['Luis', 'Marta']);
    expect(nombres(padres.grupos[1])).toEqual(['Nora']);
  });

  it('ordena a los hijos del mayor al menor', () => {
    const hijos = armarFamiliograma(familia, hoy).find((f) => f.nivel === 1)!;
    expect(hijos.grupos.map((g) => nombres(g)[0])).toEqual(['Tomás', 'Sofía']);
  });

  it('un titular solo forma una fila sin pareja, y sin familia no hay filas', () => {
    const solo = armarFamiliograma([persona('Ana', 'Titular', '1991-07-02', true)], hoy);
    expect(solo).toHaveLength(1);
    expect(solo[0].grupos[0].esPareja).toBe(false);
    expect(armarFamiliograma([], hoy)).toEqual([]);
  });

  it('lo que no se reconoce va a "Otros familiares", al final', () => {
    const filas = armarFamiliograma([persona('Ana', 'Titular', '1991-07-02', true), persona('Pía', 'Vecina', '1980-01-01')], hoy);
    expect(filas.map((f) => f.etiqueta)).toEqual(['Tu generación', 'Otros familiares']);
  });
});
