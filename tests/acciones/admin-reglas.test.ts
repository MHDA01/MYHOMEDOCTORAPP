/**
 * La puerta por la que una regla empieza a decidir en producción.
 *
 * Dos cosas se prueban aquí y las dos son de seguridad, no de interfaz: que
 * nadie que no sea administrador pueda publicar nada, y que lo que se publica
 * sea exactamente lo que la consulta va a usar. Lo segundo es lo que no se puede
 * comprobar mirando la pantalla: una base publicada que no pasa las revisiones
 * deja el grafo en vacío sin que se note.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  publicarBaseDeReglasAdmin,
  retirarBaseDeReglasAdmin,
  revisarBaseCandidataAdmin,
  verBaseDeReglasAdmin,
} from '@/app/actions/admin-reglas';
import { leerBasePublicada, olvidarCache } from '@/lib/base-de-reglas-guardada';
import { tieneReglas } from '@/lib/base-de-reglas';
import { crearUsuario, vaciarFirestore, type UsuarioDePrueba } from '../ayudas';

let admin: UsuarioDePrueba;

const fuente = { documento: 'Guía de ejemplo', pagina: '12' };
const aprobadoPor = { medico: 'Médico responsable', fecha: '2026-10-28' };

const ALARMA = {
  id: 'dificultad_para_respirar',
  nombreClinico: 'Disnea aguda',
  cuando: { op: 'presente', hallazgo: 'disnea' },
  escalaA: 'urgencias',
  severidad: 'critica',
  fuente,
  aprobadoPor,
};

const ACTIVADOR = {
  id: 'sospecha_de_ejemplo',
  sospecha: 'Sospecha de ejemplo',
  disparadores: { op: '>=', hallazgo: 'fiebre_medida', valor: 38 },
  prioridad: 'alta',
  fuente,
  aprobadoPor,
};

const json = (v: unknown) => JSON.stringify(v);

beforeEach(async () => {
  await vaciarFirestore();
  olvidarCache();
  admin = await crearUsuario();
  process.env.ADMIN_EMAILS = admin.email;
});

afterEach(() => {
  delete process.env.ADMIN_EMAILS;
  olvidarCache();
});

describe('Solo el administrador toca la base de reglas', () => {
  it('un usuario con sesión no puede verla, revisarla, publicarla ni retirarla', async () => {
    const intruso = await crearUsuario();
    const noAutorizado = { success: false, error: 'No autorizado para usar esta herramienta.' };

    expect(await verBaseDeReglasAdmin(intruso.idToken)).toEqual(noAutorizado);
    expect(await revisarBaseCandidataAdmin(intruso.idToken, json({ alarmas: [ALARMA] }))).toEqual(noAutorizado);
    expect(await publicarBaseDeReglasAdmin(intruso.idToken, json({ alarmas: [ALARMA] }), '')).toEqual(noAutorizado);
    expect(await retirarBaseDeReglasAdmin(intruso.idToken)).toEqual(noAutorizado);

    // Y, sobre todo, no quedó nada escrito.
    expect(tieneReglas(await leerBasePublicada())).toBe(false);
  });
});

describe('Publicar', () => {
  it('sin nada publicado, el panel lo dice y el grafo corre en vacío', async () => {
    const r = await verBaseDeReglasAdmin(admin.idToken);
    if (!r.success) throw new Error(r.error);
    expect(r.data.hayDocumento).toBe(false);
    expect(r.data.enUso).toBe(false);
    expect(tieneReglas(await leerBasePublicada())).toBe(false);
  });

  it('lo que no es JSON no se publica, y lo dice sin jerga', async () => {
    const r = await publicarBaseDeReglasAdmin(admin.idToken, '{ esto no es json', '');
    expect(r.success).toBe(false);
    if (r.success) throw new Error('debía fallar');
    expect(r.error).toContain('no es JSON válido');
  });

  it('una base que no pasa el revisor de la casa no se escribe', async () => {
    // Una alarma que exige un antecedente: un "yo no tengo nada" la apagaría.
    const mala = {
      alarmas: [
        { ...ALARMA, cuando: { op: 'presente', hallazgo: 'tabaquismo', temporalidad: 'antecedente' } },
      ],
    };
    const r = await publicarBaseDeReglasAdmin(admin.idToken, json(mala), '');
    expect(r.success).toBe(false);

    const estado = await verBaseDeReglasAdmin(admin.idToken);
    if (!estado.success) throw new Error(estado.error);
    expect(estado.data.hayDocumento).toBe(false);
    expect(tieneReglas(await leerBasePublicada())).toBe(false);
  });

  it('una base buena se publica, queda firmada y la consulta la usa en el turno siguiente', async () => {
    const r = await publicarBaseDeReglasAdmin(
      admin.idToken,
      json({ alarmas: [ALARMA], activadores: [ACTIVADOR] }),
      'la primera'
    );
    if (!r.success) throw new Error(r.error);
    expect(r.data.conteos).toMatchObject({ alarmas: 1, activadores: 1, arboles: 0 });

    const estado = await verBaseDeReglasAdmin(admin.idToken);
    if (!estado.success) throw new Error(estado.error);
    expect(estado.data.enUso).toBe(true);
    expect(estado.data.problemas).toEqual([]);
    expect(estado.data.publicadaPor).toBe(admin.email);
    expect(estado.data.nota).toBe('la primera');
    expect(estado.data.publicadaEn).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // Lo que de verdad importa: esto es lo que el turno de la consulta recorre.
    const enUso = await leerBasePublicada();
    expect(tieneReglas(enUso)).toBe(true);
    expect(enUso.alarmas[0].id).toBe('dificultad_para_respirar');
  });

  it('los campos de más del documento no sobreviven a la publicación', async () => {
    const r = await publicarBaseDeReglasAdmin(
      admin.idToken,
      json({ alarmas: [{ ...ALARMA, loQueSea: 'no declarado' }] }),
      ''
    );
    if (!r.success) throw new Error(r.error);
    const enUso = await leerBasePublicada();
    expect(Object.keys(enUso.alarmas[0])).not.toContain('loQueSea');
  });
});

describe('Revisar antes de publicar', () => {
  it('avisa de lo que entra, lo que sale y lo que cambia', async () => {
    await publicarBaseDeReglasAdmin(admin.idToken, json({ alarmas: [ALARMA], activadores: [ACTIVADOR] }), '');

    // Una base pegada SIN la alarma: el caso que esta pantalla existe para
    // atrapar, porque publicar es un acto sobre la base completa.
    const r = await revisarBaseCandidataAdmin(admin.idToken, json({ activadores: [ACTIVADOR] }));
    if (!r.success) throw new Error(r.error);
    expect(r.data.problemas).toEqual([]);
    expect(r.data.peso).toBe('quita_alarma');
    expect(r.data.cambios?.salen.map((x) => x.id)).toEqual(['dificultad_para_respirar']);
    expect(r.data.cambios?.iguales).toBe(1);

    // Y revisar no escribe nada: la alarma sigue en uso.
    expect((await leerBasePublicada()).alarmas).toHaveLength(1);
  });

  it('una base con problemas se revisa sin comparar: primero hay que arreglarla', async () => {
    const r = await revisarBaseCandidataAdmin(admin.idToken, json({ alarmas: [{ ...ALARMA, cuando: {} }] }));
    if (!r.success) throw new Error(r.error);
    expect(r.data.problemas.length).toBeGreaterThan(0);
    expect(r.data.cambios).toBeNull();
    expect(r.data.peso).toBeNull();
  });
});

describe('Retirar', () => {
  it('el interruptor de pánico deja el grafo en vacío sin desplegar nada', async () => {
    await publicarBaseDeReglasAdmin(admin.idToken, json({ alarmas: [ALARMA] }), '');
    expect(tieneReglas(await leerBasePublicada())).toBe(true);

    expect(await retirarBaseDeReglasAdmin(admin.idToken)).toEqual({ success: true, data: null });

    const estado = await verBaseDeReglasAdmin(admin.idToken);
    if (!estado.success) throw new Error(estado.error);
    expect(estado.data.hayDocumento).toBe(false);
    // Sin esperar el minuto de la caché: publicar y retirar la olvidan.
    expect(tieneReglas(await leerBasePublicada())).toBe(false);
  });
});
