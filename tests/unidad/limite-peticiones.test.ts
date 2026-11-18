import { describe, expect, it } from 'vitest';
import { crearLimitador, cuantasReenviadas, ipDelPedido } from '@/lib/limite-peticiones';

/** Un reloj de mentira que avanza cuando se le dice. */
function relojFalso(desde = 1_000) {
  let t = desde;
  return {
    ahora: () => t,
    avanzar: (ms: number) => {
      t += ms;
    },
  };
}

describe('Límite de peticiones por clave', () => {
  it('deja pasar hasta el máximo y corta la siguiente', () => {
    const limitador = crearLimitador({ maximo: 3, ventanaMs: 60_000 });

    expect(limitador.permitir('1.2.3.4').ok).toBe(true);
    expect(limitador.permitir('1.2.3.4').ok).toBe(true);
    expect(limitador.permitir('1.2.3.4')).toMatchObject({ ok: true, restantes: 0 });
    expect(limitador.permitir('1.2.3.4').ok).toBe(false);
  });

  it('cada clave lleva su propia cuenta', () => {
    const limitador = crearLimitador({ maximo: 1, ventanaMs: 60_000 });

    expect(limitador.permitir('1.2.3.4').ok).toBe(true);
    expect(limitador.permitir('1.2.3.4').ok).toBe(false);
    // Una IP castigada no puede arrastrar a las demás: eso convertiría el
    // límite en la forma de dejar la app sin monitoreo.
    expect(limitador.permitir('5.6.7.8').ok).toBe(true);
  });

  it('al vencer la ventana vuelve a dejar pasar', () => {
    const falso = relojFalso();
    const limitador = crearLimitador({ maximo: 1, ventanaMs: 60_000, ahora: falso.ahora });

    expect(limitador.permitir('1.2.3.4').ok).toBe(true);
    expect(limitador.permitir('1.2.3.4').ok).toBe(false);

    falso.avanzar(59_999);
    expect(limitador.permitir('1.2.3.4').ok).toBe(false);

    falso.avanzar(1);
    expect(limitador.permitir('1.2.3.4').ok).toBe(true);
  });

  it('dice cuánto falta para la próxima ventana', () => {
    const falso = relojFalso();
    const limitador = crearLimitador({ maximo: 1, ventanaMs: 60_000, ahora: falso.ahora });

    limitador.permitir('1.2.3.4');
    falso.avanzar(20_000);
    expect(limitador.permitir('1.2.3.4').esperaMs).toBe(40_000);
  });

  it('las peticiones sin clave comparten una sola cuenta', () => {
    const limitador = crearLimitador({ maximo: 2, ventanaMs: 60_000 });

    expect(limitador.permitir(null).ok).toBe(true);
    expect(limitador.permitir('').ok).toBe(true);
    expect(limitador.permitir(null).ok).toBe(false);
  });

  it('no deja que rotar la clave le llene la memoria a la instancia', () => {
    // Sin tope, el límite pensado para proteger la instancia sería la manera de
    // tumbarla: mil claves distintas, mil entradas que nadie borra.
    const limitador = crearLimitador({ maximo: 1, ventanaMs: 60_000, maximoDeClaves: 50 });

    for (let i = 0; i < 500; i += 1) {
      expect(limitador.permitir(`10.0.0.${i}`).ok).toBe(true);
    }
    // Y sigue funcionando después de la purga.
    expect(limitador.permitir('192.168.0.1').ok).toBe(true);
    expect(limitador.permitir('192.168.0.1').ok).toBe(false);
  });

  it('reiniciar borra las cuentas', () => {
    const limitador = crearLimitador({ maximo: 1, ventanaMs: 60_000 });

    expect(limitador.permitir('1.2.3.4').ok).toBe(true);
    expect(limitador.permitir('1.2.3.4').ok).toBe(false);
    limitador.reiniciar();
    expect(limitador.permitir('1.2.3.4').ok).toBe(true);
  });
});

describe('La IP del pedido', () => {
  function cabeceras(valores: Record<string, string>): Headers {
    return new Headers(valores);
  }

  it('toma la penúltima entrada: ni la del cliente ni la del balanceador', () => {
    // Las dos elecciones evidentes están mal, y esta prueba las descarta a la
    // vez. La primera (1.1.1.1) la escribe el cliente: apoyarse en ella es no
    // tener límite. La última (3.3.3.3) es la del balanceador de Google:
    // apoyarse en ella mete a todo el mundo en la misma cuenta.
    const ip = ipDelPedido(cabeceras({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2, 3.3.3.3' }));
    expect(ip).toBe('2.2.2.2');
  });

  it('con dos entradas, la del cliente es la primera', () => {
    // La forma normal detrás del balanceador: cliente y balanceador.
    expect(ipDelPedido(cabeceras({ 'x-forwarded-for': '8.8.8.8, 198.51.100.1' }))).toBe('8.8.8.8');
  });

  it('con una sola entrada, esa es', () => {
    expect(ipDelPedido(cabeceras({ 'x-forwarded-for': '9.9.9.9' }))).toBe('9.9.9.9');
  });

  it('aguanta los espacios y las entradas vacías', () => {
    expect(ipDelPedido(cabeceras({ 'x-forwarded-for': '  1.1.1.1 ,  , 4.4.4.4  ' }))).toBe('1.1.1.1');
  });

  it('cuenta las entradas sin mirar las direcciones', () => {
    expect(cuantasReenviadas(cabeceras({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2' }))).toBe(2);
    expect(cuantasReenviadas(cabeceras({ 'x-forwarded-for': '1.1.1.1, , 2.2.2.2, 3.3.3.3' }))).toBe(3);
    expect(cuantasReenviadas(cabeceras({}))).toBe(0);
  });

  it('si no hay x-forwarded-for usable, prueba x-real-ip', () => {
    expect(ipDelPedido(cabeceras({ 'x-forwarded-for': ' , ', 'x-real-ip': '7.7.7.7' }))).toBe('7.7.7.7');
    expect(ipDelPedido(cabeceras({ 'x-real-ip': '7.7.7.7' }))).toBe('7.7.7.7');
  });

  it('sin cabeceras no inventa una IP', () => {
    expect(ipDelPedido(cabeceras({}))).toBeNull();
  });
});
