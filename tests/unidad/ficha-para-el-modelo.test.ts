import { describe, expect, it } from 'vitest';
import { fichaParaElModelo } from '@/lib/ficha-para-el-modelo';
import { fichaVacia, type CampoFicha, type Ficha } from '@/lib/ficha';

const HOY = '2026-11-09';

function conCampos(campos: Record<string, CampoFicha>): Ficha {
  return { ...fichaVacia('ana'), campos };
}

const referido = (extra: Partial<CampoFicha['referido']> = {}): CampoFicha => ({
  referido: { estado: 'positivo', fecha: HOY, informante: 'paciente', ...extra } as any,
});

describe('La ficha, en palabras que el modelo lee', () => {
  it('una ficha sin nada no manda bloque, ni siquiera el encabezado', () => {
    // Un encabezado vacío se paga igual que uno lleno.
    expect(fichaParaElModelo(fichaVacia('ana'))).toBeNull();
    expect(fichaParaElModelo(null)).toBeNull();
    expect(fichaParaElModelo(undefined)).toBeNull();
  });

  it('lo que nadie preguntó no se manda: es la mayor parte del catálogo y no dice nada', () => {
    const ficha = conCampos({ tabaquismo: referido({ estado: 'no_preguntado' }) });
    expect(fichaParaElModelo(ficha)).toBeNull();
  });

  it('lo negado SÍ se manda, porque "no fuma" es información que ahorra una pregunta', () => {
    const texto = fichaParaElModelo(conCampos({ tabaquismo: referido({ estado: 'negado' }) }));
    expect(texto).toContain('Tabaquismo: no');
  });

  it('un positivo lleva su magnitud: "quiste renal: sí" no habría servido de nada', () => {
    const texto = fichaParaElModelo(
      conCampos({ peso: referido({ magnitud: { valor: 72, unidad: 'kg', fecha: '2026-10-02' } }) })
    );
    expect(texto).toContain('Peso: sí — 72 kg (2026-10-02)');
  });

  it('un desconocido dice por qué se desconoce, para no repreguntar en vano', () => {
    const texto = fichaParaElModelo(
      conCampos({ peso: referido({ estado: 'desconocido', razon: 'no se ha pesado' }) })
    );
    expect(texto).toContain('se desconoce');
    expect(texto).toContain('no se ha pesado');
  });

  it('una alergia sin caracterizar se marca como tal: es lo que falta preguntar', () => {
    const texto = fichaParaElModelo(
      conCampos({
        alergicos: referido({
          alergias: [{ sustancia: 'penicilina', manifestaciones: ['ronchas'] }],
        }),
      })
    );
    expect(texto).toContain('penicilina');
    expect(texto).toContain('ronchas');
    expect(texto).toContain('[sin caracterizar]');
  });

  it('una alergia completa no lleva la marca, y conserva las palabras de la persona', () => {
    const texto = fichaParaElModelo(
      conCampos({
        alergicos: referido({
          alergias: [
            {
              // "ibuprofeno", no "AINE": no se reclasifica.
              sustancia: 'ibuprofeno',
              manifestaciones: ['ronchas'],
              cuantoDespues: 'minutos',
              queSeHizo: 'urgencias',
              volvioATomarla: 'no',
            },
          ],
        }),
      })
    );
    expect(texto).toContain('ibuprofeno');
    expect(texto).not.toContain('[sin caracterizar]');
    expect(texto).not.toContain('AINE');
  });

  it('el texto libre del perfil viejo va entrecomillado y marcado, no como antecedente tipado', () => {
    const texto = fichaParaElModelo(
      conCampos({
        patologicos: referido({ sinEstructurar: true, detalle: 'hipertensión hace 5 años' }),
      }),
    );
    expect(texto).toContain('sin estructurar');
    expect(texto).toContain('"hipertensión hace 5 años"');
    // No puede quedar como un positivo tipado: convertirlo sería inferir.
    expect(texto).not.toMatch(/Antecedentes patológicos: sí/);
  });

  it('cada línea dice quién lo dijo, y lo del médico no se confunde con lo referido', () => {
    const soloReferido = fichaParaElModelo(conCampos({ tabaquismo: referido() }));
    expect(soloReferido).toContain('referido por la persona');

    const conMedico = fichaParaElModelo(
      conCampos({
        tabaquismo: {
          referido: { estado: 'negado', fecha: '2026-01-01', informante: 'paciente' },
          validado: {
            estado: 'positivo',
            fecha: HOY,
            informante: 'medico',
            medico: { nombre: 'A. Ruiz', registroProfesional: '123' },
          },
        },
      })
    );
    // Manda la capa del médico, y se dice que es suya.
    expect(conMedico).toContain('Tabaquismo: sí');
    expect(conMedico).toContain('caracterizado por médico');
  });

  it('el cuidador se distingue del propio paciente', () => {
    const texto = fichaParaElModelo(
      conCampos({ tabaquismo: referido({ informante: 'cuidador', estado: 'negado' }) })
    );
    expect(texto).toContain('referido por el cuidador');
  });

  it('el orden es el del catálogo, no el de escritura: el mismo paciente da el mismo texto', () => {
    const campos = {
      tabaquismo: referido({ estado: 'negado' }),
      alergicos: referido({ alergias: [{ sustancia: 'penicilina', manifestaciones: [] }] }),
      peso: referido({ magnitud: { valor: 72, unidad: 'kg' } }),
    };
    const unOrden = fichaParaElModelo(conCampos(campos))!;
    const otroOrden = fichaParaElModelo(
      conCampos({ peso: campos.peso, tabaquismo: campos.tabaquismo, alergicos: campos.alergicos })
    )!;
    expect(unOrden).toBe(otroOrden);
    // Y el catálogo pone los alérgicos antes que el peso y el tabaquismo.
    expect(unOrden.indexOf('Antecedentes alérgicos')).toBeLessThan(unOrden.indexOf('Peso'));
    expect(unOrden.indexOf('Peso')).toBeLessThan(unOrden.indexOf('Tabaquismo'));
  });

  it('se mantiene compacto: una ficha llena no se dispara de tamaño', () => {
    const ficha = conCampos({
      alergicos: referido({ alergias: [{ sustancia: 'penicilina', manifestaciones: ['ronchas'] }] }),
      peso: referido({ magnitud: { valor: 72, unidad: 'kg' } }),
      talla: referido({ magnitud: { valor: 168, unidad: 'cm' } }),
      tabaquismo: referido({ estado: 'negado' }),
      patologicos: referido({ sinEstructurar: true, detalle: 'hipertensión hace 5 años' }),
    });
    const texto = fichaParaElModelo(ficha)!;
    // El presupuesto de la ficha es del orden de 600 tokens; 2.000 caracteres
    // son unos 500. Si esto se dispara, la ficha deja de pagarse sola.
    expect(texto.length).toBeLessThan(2000);
  });
});
