import { describe, expect, it } from 'vitest';
import {
  AVISO_INFORME,
  construirInformeOrientacion,
  nombreArchivoOrientacion,
  type DatosInformeOrientacion,
} from '@/lib/informe-orientacion-pdf';
import { AVISO_URGENCIAS } from '@/lib/textos-chat';

const FECHA_CONSULTA = new Date(2026, 9, 18, 20, 15);
const GENERADO = new Date(2026, 9, 18, 20, 40);

function datos(extra: Partial<DatosInformeOrientacion> = {}): DatosInformeOrientacion {
  return {
    integrante: {
      nombre: 'Sofia Perez',
      edad: 4,
      sexo: 'Femenino',
      aseguradora: 'Sura',
      alergias: ['Amoxicilina'],
      medicamentos: ['Salbutamol'],
    },
    fechaConsulta: FECHA_CONSULTA,
    mensajes: [
      { role: 'user', content: 'Mi hija tiene fiebre desde anoche.', timestamp: FECHA_CONSULTA },
      {
        role: 'assistant',
        content: 'Te ayudo ahora mismo. Empecemos con temperatura, hidratacion y senales de alarma.',
        timestamp: new Date(2026, 9, 18, 20, 16),
      },
    ],
    ...extra,
  };
}

/** Texto del PDF sin comprimir (jsPDF no comprime por defecto). */
const textoDe = (d: DatosInformeOrientacion) => construirInformeOrientacion(d, GENERADO).output();

describe('Informe de teleorientacion en PDF', () => {
  it('copia la conversacion literal, con quien habla cada mensaje', () => {
    const pdf = textoDe(datos());
    expect(pdf).toContain('Informe de teleorientaci');
    expect(pdf).toContain('Mi hija tiene fiebre desde anoche.');
    expect(pdf).toContain('Empecemos con temperatura, hidratacion y senales de alarma.');
    expect(pdf).toContain('Sofia Perez');
    expect(pdf).toContain('Dra. Hilda');
  });

  it('incluye los datos del integrante que el medico necesita', () => {
    const pdf = textoDe(datos());
    expect(pdf).toContain('4 a');
    expect(pdf).toContain('Femenino');
    expect(pdf).toContain('Sura');
    expect(pdf).toContain('Amoxicilina');
    expect(pdf).toContain('Salbutamol');
  });

  it('lleva el aviso de que no es un diagnostico y el aviso de urgencias', () => {
    const pdf = textoDe(datos());
    expect(pdf).toContain(AVISO_INFORME.slice(0, 40));
    expect(pdf).toContain(AVISO_URGENCIAS.slice(0, 30));
  });

  it('firma como Charis Integra', () => {
    expect(textoDe(datos())).toContain('Charis Integra');
  });

  it('omite las filas de datos que la persona no registro', () => {
    const sinExtras = datos({
      integrante: { nombre: 'Juan Gomez' },
    });
    const pdf = textoDe(sinExtras);
    expect(pdf).toContain('Juan Gomez');
    expect(pdf).not.toContain('Alergias');
    expect(pdf).not.toContain('EPS / aseguradora');
  });

  it('pagina una conversacion larga en vez de recortarla', () => {
    const largos = Array.from({ length: 40 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `Mensaje ${i}. ${'Texto de prueba suficientemente largo para empujar el salto de pagina. '.repeat(4)}`,
      timestamp: FECHA_CONSULTA,
    }));
    const doc = construirInformeOrientacion(datos({ mensajes: largos }), GENERADO);
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
    expect(doc.output()).toContain('Mensaje 39.');
  });

  it('arma un nombre de archivo sin tildes ni espacios', () => {
    expect(nombreArchivoOrientacion('Sofía Pérez', FECHA_CONSULTA)).toBe('orientacion-sofia-perez-2026-10-18.pdf');
    expect(nombreArchivoOrientacion('', FECHA_CONSULTA)).toBe('orientacion-consulta-2026-10-18.pdf');
  });
});
