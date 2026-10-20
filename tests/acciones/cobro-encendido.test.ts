/**
 * Qué pasa el día que se apague ACCESO_LIBRE: quien quedó marcado
 * «gratis de por vida» sigue entrando y a los demás se les pide pagar.
 *
 * Todo el archivo corre con el interruptor en `false`; el resto de la suite lo
 * tiene en `true`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/config/acceso', () => ({ ACCESO_LIBRE: false }));

import { getUserTokenState } from '@/lib/token-system';
import { fijarModalidad } from '@/lib/modalidad-acceso';
import { getAdminDb } from '@/lib/firebase-admin';
import { COLECCION_TUTOR, DOC_TOKENS } from '@/lib/constants';
import { crearUsuario, vaciarFirestore } from '../ayudas';

/** Deja el período de prueba vencido, como el de quien se registró hace meses. */
async function conPruebaVencida(uid: string) {
  await getAdminDb()
    .collection(`${COLECCION_TUTOR}/${uid}/${DOC_TOKENS}`)
    .doc('config')
    .set({ free: 0, paid: 0, dailyReset: new Date(), freePeriodEnds: new Date('2026-07-01') });
}

describe('Con el cobro encendido', () => {
  beforeEach(async () => {
    await vaciarFirestore();
  });

  it('una cuenta gratis de por vida entra sin tokens y sin pagar', async () => {
    const usuario = await crearUsuario();
    await conPruebaVencida(usuario.uid);
    await fijarModalidad(usuario.uid, 'gratis_ilimitado', 'direccion@ejemplo.test');

    const estado = await getUserTokenState(usuario.uid);
    expect(estado).toMatchObject({ available: true, needsPayment: false, gratisDePorVida: true, accesoLibre: false });
  });

  it('una cuenta de pago con la prueba vencida y sin tokens queda bloqueada', async () => {
    const usuario = await crearUsuario();
    await conPruebaVencida(usuario.uid);

    const estado = await getUserTokenState(usuario.uid);
    expect(estado).toMatchObject({ available: false, needsPayment: true, gratisDePorVida: false });
  });

  it('volver a ponerla en pago la vuelve a bloquear', async () => {
    const usuario = await crearUsuario();
    await conPruebaVencida(usuario.uid);
    await fijarModalidad(usuario.uid, 'gratis_ilimitado', 'direccion@ejemplo.test');
    await fijarModalidad(usuario.uid, 'pago', 'direccion@ejemplo.test');

    expect(await getUserTokenState(usuario.uid)).toMatchObject({ available: false, needsPayment: true });
  });
});
