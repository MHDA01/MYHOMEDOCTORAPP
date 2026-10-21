import { describe, expect, it, vi } from 'vitest';
import {
  entradaParaElModelo,
  gravedad,
  nivelFinal,
  resumenDesdeModelo,
  type BanderaRoja,
} from '@/lib/resumen-consulta';

const bandera = (severidad: BanderaRoja['severidad']): BanderaRoja => ({
  senal: 'Dificultad para respirar',
  evidencia: 'me cuesta respirar',
  severidad,
});

const base = {
  motivo: 'Tos y fiebre',
  evolucion: '3 días',
  relato: 'Tos seca desde hace tres días con fiebre de 38.',
  sintomas: { presentes: ['tos', 'fiebre'], negados: ['vómito'] },
  banderas: [],
  antecedentesRelevantes: [],
  nivel: 'casa' as const,
  porQue: 'Cuadro leve sin señales de alarma.',
  orientoHilda: 'Le dijo que vigilara la fiebre.',
  sinPreguntar: [],
  discrepancia: '',
  confianza: 'alta' as const,
};

describe('El nivel de atención solo puede subir', () => {
  it('una bandera crítica manda a urgencias aunque el modelo diga casa', () => {
    expect(nivelFinal('casa', [bandera('critica')])).toBe('urgencias');
  });

  it('una bandera alta no deja bajar de consulta prioritaria', () => {
    expect(nivelFinal('casa', [bandera('alta')])).toBe('consulta_prioritaria');
    expect(nivelFinal('consulta_general', [bandera('alta')])).toBe('consulta_prioritaria');
  });

  it('nunca baja el nivel que propuso el modelo', () => {
    expect(nivelFinal('urgencias', [])).toBe('urgencias');
    expect(nivelFinal('urgencias', [bandera('moderada')])).toBe('urgencias');
    expect(nivelFinal('consulta_prioritaria', [bandera('moderada')])).toBe('consulta_prioritaria');
  });

  it('sin banderas respeta lo que dijo el modelo', () => {
    expect(nivelFinal('casa', [])).toBe('casa');
  });

  it('la gravedad ordena de leve a urgente', () => {
    expect(gravedad('casa')).toBeLessThan(gravedad('consulta_general'));
    expect(gravedad('consulta_general')).toBeLessThan(gravedad('consulta_prioritaria'));
    expect(gravedad('consulta_prioritaria')).toBeLessThan(gravedad('urgencias'));
  });
});

describe('Lo que devuelve el modelo', () => {
  it('aplica la regla del nivel al resumen completo', () => {
    const resumen = resumenDesdeModelo({ ...base, banderas: [bandera('critica')] });
    expect(resumen?.nivel).toBe('urgencias');
  });

  it('un resumen al que le falta un campo no se acepta', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { motivo, ...incompleto } = base;
    expect(resumenDesdeModelo(incompleto)).toBeNull();
    expect(resumenDesdeModelo({ ...base, nivel: 'hospitalizar' })).toBeNull();
    expect(resumenDesdeModelo('texto suelto')).toBeNull();
  });

  it('las listas que faltan quedan vacías, no indefinidas', () => {
    const { sinPreguntar, ...sinEsaLista } = base;
    const resumen = resumenDesdeModelo(sinEsaLista);
    expect(resumen?.sinPreguntar).toEqual([]);
  });
});

describe('Lo que se le manda al modelo', () => {
  it('lleva la ficha y la conversación, y dice cuándo un dato no consta', () => {
    const entrada = entradaParaElModelo(
      { nombre: 'Ana Pérez', edad: 34, sexo: 'femenino', alergias: ['penicilina'], medicamentos: [], antecedentes: [] },
      [
        { quien: 'paciente', texto: 'Tengo tos' },
        { quien: 'hilda', texto: '¿Desde cuándo?' },
      ]
    );

    expect(entrada).toContain('Ana Pérez');
    expect(entrada).toContain('34 años');
    expect(entrada).toContain('penicilina');
    expect(entrada).toContain('Medicamentos: ninguno registrado');
    expect(entrada).toContain('PACIENTE: Tengo tos');
    expect(entrada).toContain('HILDA: ¿Desde cuándo?');
  });

  it('sin edad ni sexo lo dice en vez de inventarlo', () => {
    const entrada = entradaParaElModelo(
      { nombre: '', alergias: [], medicamentos: [], antecedentes: [] },
      [{ quien: 'paciente', texto: 'Me duele la cabeza' }]
    );
    expect(entrada).toContain('Edad: no consta');
    expect(entrada).toContain('Sexo: no consta');
    expect(entrada).toContain('Nombre: no consta');
  });
});
