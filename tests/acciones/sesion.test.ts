import { afterEach, describe, expect, it, vi } from 'vitest';
import { crearUsuario } from '../ayudas';

// El route handler escribe la cookie con next/headers, que solo existe dentro de
// una petición de Next: aquí se reemplaza por un almacén en memoria.
const cookiesGuardadas = new Map<string, { value: string; options: Record<string, unknown> }>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    set: (nombre: string, valor: string, opciones: Record<string, unknown>) =>
      cookiesGuardadas.set(nombre, { value: valor, options: opciones }),
    delete: (nombre: string) => cookiesGuardadas.delete(nombre),
  }),
}));

const { POST, DELETE } = await import('@/app/api/auth/session/route');
const { GET: consultarTokens } = await import('@/app/api/user/tokens/route');

afterEach(() => {
  cookiesGuardadas.clear();
  vi.restoreAllMocks();
});

describe('Inicio de sesión (/api/auth/session)', () => {
  it('con un ID token válido crea la cookie de sesión httpOnly por 5 días', async () => {
    const usuario = await crearUsuario();
    const respuesta = await POST(new Request('https://myhomedoctorapp.com/api/auth/session', {
      method: 'POST',
      body: JSON.stringify({ idToken: usuario.idToken }),
    }));

    expect(respuesta.status).toBe(200);
    const sesion = cookiesGuardadas.get('__session');
    expect(sesion?.value).toBeTruthy();
    expect(sesion?.options).toMatchObject({ httpOnly: true, path: '/', maxAge: 5 * 24 * 60 * 60 * 1000 });
  });

  it('con un token inventado no crea sesión', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const respuesta = await POST(new Request('https://myhomedoctorapp.com/api/auth/session', {
      method: 'POST',
      body: JSON.stringify({ idToken: 'token-inventado' }),
    }));
    expect(respuesta.status).toBe(500);
    expect(cookiesGuardadas.has('__session')).toBe(false);
  });

  it('cerrar sesión borra la cookie', async () => {
    cookiesGuardadas.set('__session', { value: 'x', options: {} });
    await DELETE();
    expect(cookiesGuardadas.has('__session')).toBe(false);
  });
});

describe('Estado de tokens (/api/user/tokens)', () => {
  it('sin token responde 401', async () => {
    const respuesta = await consultarTokens(new Request('https://myhomedoctorapp.com/api/user/tokens'));
    expect(respuesta.status).toBe(401);
  });

  it('con sesión devuelve el estado de la cuenta', async () => {
    const usuario = await crearUsuario();
    const respuesta = await consultarTokens(new Request('https://myhomedoctorapp.com/api/user/tokens', {
      headers: { authorization: `Bearer ${usuario.idToken}` },
    }));
    expect(respuesta.status).toBe(200);
    expect(await respuesta.json()).toMatchObject({ available: true, accesoLibre: true });
  });
});
