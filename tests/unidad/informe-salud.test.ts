import { describe, expect, it } from 'vitest';
import { construirInformeSalud, etiquetaSexo, nombreArchivoInforme, type DatosInformeSalud } from '@/lib/informe-salud-pdf';

function datos(sexo: string, extra: Partial<DatosInformeSalud['healthInfo']> = {}): DatosInformeSalud {
  return {
    personalInfo: { firstName: 'Sofia', lastName: 'Perez', sex: sexo, dateOfBirth: new Date(2019, 2, 10), insuranceProvider: 'EPS contributiva', insuranceProviderName: 'Sura' },
    healthInfo: { allergies: ['Amoxicilina', 'Latex'], medications: ['Salbutamol'], pathologicalHistory: 'Asma leve', surgicalHistory: '', gynecologicalHistory: 'G1P1', ...extra },
    appointments: [{ date: new Date(2026, 8, 20, 15, 30), doctor: 'Dra. Gomez', specialty: 'Pediatria' }],
    medications: [{ name: 'Salbutamol', dosage: '100 mcg', frequency: 8, time: ['08:00', '16:00'], active: true }],
    documents: [{ name: 'Espirometria.pdf', category: 'Laboratorio', uploadedAt: new Date(2026, 7, 1) }],
  };
}

/** Texto del PDF sin comprimir (jsPDF no comprime por defecto). */
const textoDe = (d: DatosInformeSalud) => construirInformeSalud(d, new Date(2026, 8, 15, 10, 0)).output();

describe('Informe de salud en PDF', () => {
  it('lee el sexo guardado como m/f (familia) y como male/female (titular)', () => {
    expect(etiquetaSexo('f')).toBe('Femenino');
    expect(etiquetaSexo('female')).toBe('Femenino');
    expect(etiquetaSexo('m')).toBe('Masculino');
    expect(etiquetaSexo('male')).toBe('Masculino');
    expect(etiquetaSexo('other')).toBe('Indeterminado');
    expect(etiquetaSexo(undefined)).toBe('Indeterminado');
  });

  it('copia lo registrado: alergias, medicamentos, antecedentes, citas y documentos', () => {
    const pdf = textoDe(datos('f'));
    for (const esperado of ['Resumen de Salud', 'Femenino', 'EPS contributiva - Sura', 'Amoxicilina, Latex', 'Asma leve', 'Dra. Gomez', 'Cada 8 hrs', 'Espirometria.pdf']) {
      expect(pdf).toContain(esperado);
    }
  });

  it('dice "EPS / aseguradora" y ya no el término chileno "Previsión"', () => {
    const pdf = textoDe(datos('m'));
    expect(pdf).toContain('EPS / aseguradora:');
    expect(pdf).not.toContain('Previsi');
  });

  it('solo incluye antecedentes gineco-obstétricos cuando la persona es de sexo femenino', () => {
    expect(textoDe(datos('f'))).toContain('G1P1');
    expect(textoDe(datos('m'))).not.toContain('G1P1');
  });

  it('no deja secciones vacías cuando falta un dato', () => {
    const pdf = textoDe(datos('m', { allergies: [], pathologicalHistory: '' }));
    expect(pdf).not.toContain('(Alergias:)');
    expect(pdf).not.toContain('Antecedentes Patol');
  });

  it('arma el nombre del archivo con el nombre de la persona', () => {
    expect(nombreArchivoInforme(datos('f').personalInfo)).toBe('resumen_salud_sofia_perez.pdf');
  });
});
