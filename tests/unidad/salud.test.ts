import { describe, expect, it, vi } from 'vitest';
import {
  chequearClaves,
  chequearConLimite,
  codigoHttp,
  resumirEstado,
  type Chequeo,
} from '@/lib/salud';

function chequeo(nombre: string, ok: boolean, esencial: boolean): Chequeo {
  return { nombre, ok, esencial };
}

/** Un entorno completo, con las claves que la app necesita de verdad. */
function entornoCompleto(): Record<string, string | undefined> {
  return {
    MHD_FIREBASE_PROJECT_ID: 'proyecto',
    MHD_FIREBASE_CLIENT_EMAIL: 'robot@proyecto.iam.gserviceaccount.com',
    MHD_FIREBASE_PRIVATE_KEY: 'llave-de-mentira',
    MHDA_ENCRYPTION_KEY: 'cifrado-de-mentira',
    GEMINI_API_KEY: 'clave-de-mentira',
  };
}

describe('El estado que se deduce de los chequeos', () => {
  it('todo en pie es ok', () => {
    const chequeos = [chequeo('firestore', true, true), chequeo('claves-ia', true, false)];
    expect(resumirEstado(chequeos)).toBe('ok');
    expect(codigoHttp('ok')).toBe(200);
  });

  it('un chequeo esencial caído deja la app caída', () => {
    const chequeos = [chequeo('firestore', false, true), chequeo('claves-ia', true, false)];
    expect(resumirEstado(chequeos)).toBe('caido');
  });

  it('solo lo no esencial caído deja la app degradada', () => {
    const chequeos = [chequeo('firestore', true, true), chequeo('claves-ia', false, false)];
    expect(resumirEstado(chequeos)).toBe('degradado');
  });

  it('lo esencial manda sobre lo no esencial', () => {
    const chequeos = [chequeo('firestore', false, true), chequeo('claves-ia', false, false)];
    expect(resumirEstado(chequeos)).toBe('caido');
  });

  it('sin chequeos no se inventa un fallo', () => {
    expect(resumirEstado([])).toBe('ok');
  });
});

describe('El código de la respuesta', () => {
  // Esta es la prueba que protege la alerta: si `caido` contestara 200, el
  // chequeo de disponibilidad daría la app por buena y nadie se enteraría.
  it('solo una app caída contesta 503', () => {
    expect(codigoHttp('caido')).toBe(503);
    expect(codigoHttp('degradado')).toBe(200);
    expect(codigoHttp('ok')).toBe(200);
  });
});

describe('Las claves', () => {
  it('con todas puestas, los dos chequeos pasan', () => {
    const chequeos = chequearClaves(entornoCompleto());
    expect(chequeos.every((c) => c.ok)).toBe(true);
  });

  it('acepta los nombres alternos que también lee firebase-admin', () => {
    const chequeos = chequearClaves({
      FIREBASE_PROJECT_ID: 'proyecto',
      FIREBASE_CLIENT_EMAIL: 'robot@proyecto.iam.gserviceaccount.com',
      FIREBASE_PRIVATE_KEY: 'llave-de-mentira',
      MHDA_ENCRYPTION_KEY: 'cifrado-de-mentira',
      GEMINI_API_KEY: 'clave-de-mentira',
    });
    expect(chequeos.every((c) => c.ok)).toBe(true);
  });

  it('una clave esencial que falta es un fallo esencial', () => {
    const entorno = entornoCompleto();
    delete entorno.MHDA_ENCRYPTION_KEY;
    const chequeos = chequearClaves(entorno);
    const claves = chequeos.find((c) => c.nombre === 'claves')!;
    expect(claves.ok).toBe(false);
    expect(claves.esencial).toBe(true);
    expect(resumirEstado(chequeos)).toBe('caido');
  });

  it('sin la clave de Gemini la app está CAÍDA, no degradada', () => {
    // Cambiado el 18-nov-2026, y la prueba decía justo lo contrario. El motivo
    // está en `CLAVES_DE_IA`: con la clave como no esencial, el estado quedaba
    // en `degradado`, `degradado` contesta 200 y el chequeo de disponibilidad
    // solo mira el código, así que la alerta no sonaba. Es el fallo del
    // 21-oct-2026 —Hilda sin contestar en producción durante un mes sin que
    // nadie se enterara—, que es el fallo para el que se hizo este endpoint.
    const entorno = entornoCompleto();
    delete entorno.GEMINI_API_KEY;
    const chequeos = chequearClaves(entorno);
    const ia = chequeos.find((c) => c.nombre === 'claves-ia')!;
    expect(ia.ok).toBe(false);
    expect(ia.esencial).toBe(true);
    expect(resumirEstado(chequeos)).toBe('caido');
    // Lo que de verdad importa: que el chequeo de disponibilidad lo vea.
    expect(codigoHttp(resumirEstado(chequeos))).toBe(503);
  });

  it('el chequeo de claves sigue diciendo CUÁL falta, no solo que falta algo', () => {
    // Los dos son esenciales, pero separados: el log tiene que dejar claro si
    // hay que mirar en Secret Manager o en la cuenta de Gemini.
    const sinGemini = entornoCompleto();
    delete sinGemini.GEMINI_API_KEY;
    const porIa = chequearClaves(sinGemini);
    expect(porIa.find((c) => c.nombre === 'claves')!.ok).toBe(true);
    expect(porIa.find((c) => c.nombre === 'claves-ia')!.ok).toBe(false);

    const sinCifrado = entornoCompleto();
    delete sinCifrado.MHDA_ENCRYPTION_KEY;
    const porClaves = chequearClaves(sinCifrado);
    expect(porClaves.find((c) => c.nombre === 'claves')!.ok).toBe(false);
    expect(porClaves.find((c) => c.nombre === 'claves-ia')!.ok).toBe(true);
  });

  it('una clave en blanco cuenta como ausente', () => {
    const entorno = entornoCompleto();
    entorno.MHDA_ENCRYPTION_KEY = '   ';
    expect(chequearClaves(entorno).find((c) => c.nombre === 'claves')!.ok).toBe(false);
  });

  it('el nombre del chequeo no lleva el valor de ninguna clave', () => {
    const chequeos = chequearClaves(entornoCompleto());
    const texto = JSON.stringify(chequeos);
    expect(texto).not.toContain('llave-de-mentira');
    expect(texto).not.toContain('clave-de-mentira');
  });
});

describe('Un chequeo con límite de tiempo', () => {
  it('cuando la dependencia contesta, pasa y anota cuánto tardó', async () => {
    let t = 1_000;
    const resultado = await chequearConLimite('firestore', true, async () => 'listo', {
      ahora: () => {
        const actual = t;
        t += 40;
        return actual;
      },
    });

    expect(resultado).toMatchObject({ nombre: 'firestore', ok: true, esencial: true });
    expect(resultado.ms).toBe(40);
  });

  it('un error de la dependencia es un fallo, y el motivo va al registro', async () => {
    const registro = vi.fn();
    const resultado = await chequearConLimite(
      'firestore',
      true,
      async () => {
        throw new Error('credencial vencida');
      },
      { alFallar: registro }
    );

    expect(resultado.ok).toBe(false);
    expect(registro).toHaveBeenCalledWith('firestore', expect.any(Error));
  });

  it('el motivo del fallo no viaja en el chequeo', async () => {
    // El endpoint es público: lo que vuelva de aquí lo puede leer cualquiera.
    const resultado = await chequearConLimite('firestore', true, async () => {
      throw new Error('PERMISSION_DENIED: proyecto myhomedoctorapp');
    });

    expect(JSON.stringify(resultado)).not.toContain('myhomedoctorapp');
    expect(JSON.stringify(resultado)).not.toContain('PERMISSION_DENIED');
  });

  it('una dependencia que no contesta nunca se da por caída al vencer el límite', async () => {
    const registro = vi.fn();
    const resultado = await chequearConLimite(
      'firestore',
      true,
      () => new Promise(() => {}), // nunca resuelve, como un Firestore mudo
      { limiteMs: 20, alFallar: registro }
    );

    expect(resultado.ok).toBe(false);
    expect(registro).toHaveBeenCalledWith('firestore', 'sin respuesta en 20 ms');
  });

  it('una comprobación que falla sin ser esencial no tumba la app', async () => {
    const resultado = await chequearConLimite('claves-ia', false, async () => {
      throw new Error('falta');
    });

    expect(resumirEstado([resultado])).toBe('degradado');
  });
});
