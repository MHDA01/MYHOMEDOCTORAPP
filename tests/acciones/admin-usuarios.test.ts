import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cambiarModalidadUsuario, eliminarUsuarioAdmin } from '@/app/actions/admin-usuarios';
import { listarUsuariosAdmin } from '@/app/actions/admin-seguimiento';
import { obtenerModalidad } from '@/lib/modalidad-acceso';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { COLECCION_MODALIDAD, COLECCION_TUTOR } from '@/lib/constants';
import { crearUsuario, vaciarFirestore, type UsuarioDePrueba } from '../ayudas';

// El emulador de Auth se comparte entre archivos de prueba y no se vacía: cada
// cuenta se crea con un correo propio (crearUsuario sin argumento) para no
// chocar con las de otras pruebas.
let admin: UsuarioDePrueba;

async function prepararAdmin() {
  await vaciarFirestore();
  admin = await crearUsuario();
  process.env.ADMIN_EMAILS = admin.email;
}

afterEach(() => {
  delete process.env.ADMIN_EMAILS;
  vi.restoreAllMocks();
});

describe('Modalidad de acceso desde el panel', () => {
  beforeEach(prepararAdmin);

  it('quien no es administrador no cambia ni elimina nada', async () => {
    const intruso = await crearUsuario();
    const victima = await crearUsuario();

    expect(await cambiarModalidadUsuario(intruso.idToken, victima.uid, 'gratis_ilimitado')).toEqual({
      success: false,
      error: 'No autorizado para usar esta herramienta.',
    });
    expect(await eliminarUsuarioAdmin(intruso.idToken, victima.uid, victima.email)).toEqual({
      success: false,
      error: 'No autorizado para usar esta herramienta.',
    });
    expect(await getAdminAuth().getUser(victima.uid)).toBeTruthy();
    expect(await obtenerModalidad(victima.uid)).toBe('pago');
  });

  it('sin nada escrito, una cuenta se asume de pago', async () => {
    const usuario = await crearUsuario();
    expect(await obtenerModalidad(usuario.uid)).toBe('pago');
  });

  it('el administrador deja una cuenta gratis de por vida y vuelve a cobrarle', async () => {
    const usuario = await crearUsuario();

    expect(await cambiarModalidadUsuario(admin.idToken, usuario.uid, 'gratis_ilimitado')).toEqual({
      success: true,
      data: { uid: usuario.uid, modalidad: 'gratis_ilimitado' },
    });
    expect(await obtenerModalidad(usuario.uid)).toBe('gratis_ilimitado');

    const lista = await listarUsuariosAdmin(admin.idToken);
    if (!lista.success) throw new Error(lista.error);
    expect(lista.data.find((u) => u.uid === usuario.uid)?.modalidad).toBe('gratis_ilimitado');

    await cambiarModalidadUsuario(admin.idToken, usuario.uid, 'pago');
    expect(await obtenerModalidad(usuario.uid)).toBe('pago');
  });

  it('una modalidad inventada no se guarda', async () => {
    const usuario = await crearUsuario();

    const resultado = await cambiarModalidadUsuario(admin.idToken, usuario.uid, 'vitalicio' as never);
    expect(resultado).toEqual({ success: false, error: 'Esa modalidad no existe.' });
    expect(await obtenerModalidad(usuario.uid)).toBe('pago');
  });
});

describe('Eliminar una cuenta desde el panel', () => {
  beforeEach(prepararAdmin);

  it('sin el correo escrito tal cual, no borra nada', async () => {
    const usuario = await crearUsuario();

    const resultado = await eliminarUsuarioAdmin(admin.idToken, usuario.uid, 'otro@ejemplo.test');
    expect(resultado.success).toBe(false);
    expect(await getAdminAuth().getUser(usuario.uid)).toBeTruthy();
  });

  it('con el correo correcto borra la cuenta, sus datos y su modalidad', async () => {
    const usuario = await crearUsuario();
    const db = getAdminDb();

    await db.collection(COLECCION_TUTOR).doc(usuario.uid).set({ personalInfo: { firstName: 'Ana' } });
    await db.collection(`${COLECCION_TUTOR}/${usuario.uid}/conversaciones`).doc('c1').set({ messageCount: 3 });
    await db.collection(`${COLECCION_TUTOR}/${usuario.uid}/conversaciones/c1/mensajes`).doc('m1').set({ texto: 'hola' });
    await cambiarModalidadUsuario(admin.idToken, usuario.uid, 'gratis_ilimitado');

    // El correo se acepta sin importar mayúsculas ni espacios alrededor.
    expect(await eliminarUsuarioAdmin(admin.idToken, usuario.uid, `  ${usuario.email.toUpperCase()} `)).toEqual({
      success: true,
      data: { uid: usuario.uid },
    });

    await expect(getAdminAuth().getUser(usuario.uid)).rejects.toThrow();
    expect((await db.collection(COLECCION_TUTOR).doc(usuario.uid).get()).exists).toBe(false);
    expect((await db.collection(`${COLECCION_TUTOR}/${usuario.uid}/conversaciones`).get()).empty).toBe(true);
    expect(
      (await db.collection(`${COLECCION_TUTOR}/${usuario.uid}/conversaciones/c1/mensajes`).get()).empty
    ).toBe(true);
    expect((await db.collection(COLECCION_MODALIDAD).doc(usuario.uid).get()).exists).toBe(false);
  });

  it('el administrador no se borra a sí mismo ni a otro administrador', async () => {
    const otroAdmin = await crearUsuario();
    process.env.ADMIN_EMAILS = `${admin.email}, ${otroAdmin.email}`;

    expect(await eliminarUsuarioAdmin(admin.idToken, admin.uid, admin.email)).toEqual({
      success: false,
      error: 'No puedes eliminar tu propia cuenta desde aquí.',
    });
    expect((await eliminarUsuarioAdmin(admin.idToken, otroAdmin.uid, otroAdmin.email)).success).toBe(false);
    expect(await getAdminAuth().getUser(otroAdmin.uid)).toBeTruthy();
  });

  it('una cuenta que ya no existe no rompe el panel', async () => {
    expect(await eliminarUsuarioAdmin(admin.idToken, 'uid-que-no-existe', 'uid-que-no-existe')).toEqual({
      success: false,
      error: 'Esa cuenta ya no existe.',
    });
  });
});
