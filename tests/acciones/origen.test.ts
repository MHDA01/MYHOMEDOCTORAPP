import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registrarRegistroOrigen, registrarVisitaOrigen } from '@/app/actions/origen';
import { obtenerResumenAdmin } from '@/app/actions/admin-seguimiento';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { COLECCION_ORIGEN, diaBogota } from '@/lib/origen';
import { crearUsuario, vaciarFirestore } from '../ayudas';

const leer = async (red: string) => (await getAdminDb().collection(COLECCION_ORIGEN).doc(red).get()).data();

beforeEach(async () => {
  await vaciarFirestore();
});

afterEach(() => {
  delete process.env.ADMIN_EMAILS;
  vi.restoreAllMocks();
});

describe('Visitas desde una red social', () => {
  it('suma la visita al total y al día de hoy (hora de Bogotá)', async () => {
    expect(await registrarVisitaOrigen('tiktok')).toEqual({ contada: true });
    expect(await registrarVisitaOrigen('TikTok')).toEqual({ contada: true });

    const datos = await leer('tiktok');
    expect(datos?.visitas).toBe(2);
    expect(datos?.dias?.[diaBogota(Date.now())]).toEqual({ visitas: 2 });
  });

  it('una red desconocida no crea nada', async () => {
    expect(await registrarVisitaOrigen('red-inventada')).toEqual({ contada: false });
    expect(await registrarVisitaOrigen({ fuente: 'tiktok' })).toEqual({ contada: false });
    const todo = await getAdminDb().collection(COLECCION_ORIGEN).get();
    expect(todo.size).toBe(0);
  });
});

describe('Registros desde una red social', () => {
  it('una cuenta recién creada suma un registro, sin guardar quién es', async () => {
    const usuario = await crearUsuario();
    expect(await registrarRegistroOrigen(usuario.idToken, 'tiktok')).toEqual({ contado: true });

    const datos = await leer('tiktok');
    expect(datos?.registros).toBe(1);
    const texto = JSON.stringify(datos);
    expect(texto).not.toContain(usuario.uid);
    expect(texto).not.toContain(usuario.email);
  });

  it('una cuenta vieja no se cuenta como registro nuevo', async () => {
    const usuario = await crearUsuario();
    const real = getAdminAuth().getUser.bind(getAdminAuth());
    vi.spyOn(getAdminAuth(), 'getUser').mockImplementation(async (uid) => {
      const cuenta = await real(uid);
      return { ...cuenta, metadata: { ...cuenta.metadata, creationTime: new Date(Date.now() - 60 * 60 * 1000).toUTCString() } } as typeof cuenta;
    });
    expect(await registrarRegistroOrigen(usuario.idToken, 'tiktok')).toEqual({ contado: false });
    expect(await leer('tiktok')).toBeUndefined();
  });

  it('un token inventado no suma nada', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await registrarRegistroOrigen('token-inventado', 'tiktok')).toEqual({ contado: false });
    expect(await leer('tiktok')).toBeUndefined();
  });
});

describe('Panel de administración', () => {
  it('muestra visitas y registros por red, de 30 días y en total', async () => {
    const admin = await crearUsuario();
    process.env.ADMIN_EMAILS = admin.email;
    await registrarVisitaOrigen('tiktok');
    await registrarVisitaOrigen('tiktok');
    await registrarVisitaOrigen('instagram');
    await registrarRegistroOrigen(admin.idToken, 'tiktok');
    // Un día de hace dos meses: cuenta en el total, no en los 30 días.
    await getAdminDb().collection(COLECCION_ORIGEN).doc('instagram').set(
      { visitas: 6, dias: { '2026-08-01': { visitas: 5 } } },
      { merge: true }
    );

    const resumen = await obtenerResumenAdmin(admin.idToken);
    expect(resumen.success).toBe(true);
    if (!resumen.success) return;
    expect(resumen.data.origenes).toEqual([
      { fuente: 'instagram', visitas: 6, registros: 0, visitas30: 1, registros30: 0 },
      { fuente: 'tiktok', visitas: 2, registros: 1, visitas30: 2, registros30: 1 },
    ]);
  });
});
