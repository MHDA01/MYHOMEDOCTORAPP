import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';
import { verifyAdminAccess } from '@/lib/admin-access';
import { obtenerResumenAdmin, listarUsuariosAdmin } from '@/app/actions/admin-seguimiento';
import { listarProtocolosAdmin, publicarProtocoloAdmin } from '@/app/actions/admin-protocolos';
import { checkTokenAvailability, getTokenInfo, getTransactionHistory } from '@/app/actions/tokens';
import { getAdminDb } from '@/lib/firebase-admin';
import { crearUsuario, vaciarFirestore } from '../ayudas';

afterEach(() => {
  delete process.env.ADMIN_EMAILS;
  vi.restoreAllMocks();
});

describe('Rutas protegidas (middleware)', () => {
  const ir = (ruta: string, init?: ConstructorParameters<typeof NextRequest>[1]) =>
    middleware(new NextRequest(`https://myhomedoctorapp.com${ruta}`, init));

  it('sin sesión, el panel redirige al ingreso', () => {
    const respuesta = ir('/dashboard/teleorientacion');
    expect(respuesta.status).toBe(307);
    expect(respuesta.headers.get('location')).toBe('https://myhomedoctorapp.com/login');
  });

  it('con sesión, deja pasar al panel', () => {
    const respuesta = ir('/dashboard', { headers: { cookie: '__session=cookie-de-sesion' } });
    expect(respuesta.headers.get('x-middleware-next')).toBe('1');
  });

  it('con sesión, el ingreso manda directo al panel', () => {
    const respuesta = ir('/login', { headers: { cookie: '__session=cookie-de-sesion' } });
    expect(respuesta.headers.get('location')).toBe('https://myhomedoctorapp.com/dashboard');
  });
});

describe('Panel de administración (verifyAdminAccess)', () => {
  it('sin ADMIN_EMAILS configurado, nadie entra', async () => {
    const usuario = await crearUsuario();
    const acceso = await verifyAdminAccess(usuario.idToken);
    expect(acceso.ok).toBe(false);
  });

  it('una cuenta que no está en la lista no entra', async () => {
    process.env.ADMIN_EMAILS = 'direccion@ejemplo.test';
    const usuario = await crearUsuario();
    expect((await verifyAdminAccess(usuario.idToken)).ok).toBe(false);
  });

  it('el correo de la lista entra, sin importar mayúsculas', async () => {
    const admin = await crearUsuario('direccion@ejemplo.test');
    process.env.ADMIN_EMAILS = 'otra@ejemplo.test, DIRECCION@ejemplo.test';
    expect(await verifyAdminAccess(admin.idToken)).toEqual({ ok: true, uid: admin.uid, email: 'direccion@ejemplo.test' });
  });

  it('una sesión falsa no entra', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    process.env.ADMIN_EMAILS = 'direccion@ejemplo.test';
    expect((await verifyAdminAccess('token-inventado')).ok).toBe(false);
  });

  it('las acciones de administración rechazan a quien no es administrador', async () => {
    process.env.ADMIN_EMAILS = 'direccion@ejemplo.test';
    const usuario = await crearUsuario();
    for (const resultado of [
      await obtenerResumenAdmin(usuario.idToken),
      await listarUsuariosAdmin(usuario.idToken),
      await listarProtocolosAdmin(usuario.idToken),
      await publicarProtocoloAdmin(usuario.idToken, 'cualquier-borrador'),
    ]) {
      expect(resultado).toEqual({ success: false, error: 'No autorizado para usar esta herramienta.' });
    }
  });
});

describe('Tokens (acciones que antes aceptaban un uid del cliente)', () => {
  beforeEach(async () => {
    await vaciarFirestore();
  });

  it('cada cuenta ve solo su propio historial de pagos', async () => {
    const ana = await crearUsuario();
    const beto = await crearUsuario();
    await getAdminDb().collection(`Cuentas_Tutor/${ana.uid}/transactions`).add({ status: 'success', createdAt: new Date() });

    expect(await getTransactionHistory(ana.idToken)).toHaveLength(1);
    expect(await getTransactionHistory(beto.idToken)).toHaveLength(0);
  });

  it('sin sesión válida no entrega información', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(checkTokenAvailability('token-inventado')).rejects.toThrow();
    await expect(getTransactionHistory('')).rejects.toThrow();
    expect(await getTokenInfo('')).toMatchObject({ free: 0, paid: 0 });
  });

  it('con acceso libre, una cuenta con sesión siempre puede consultar', async () => {
    const ana = await crearUsuario();
    const estado = await checkTokenAvailability(ana.idToken);
    expect(estado.available).toBe(true);
    expect(estado.needsPayment).toBe(false);
  });
});
