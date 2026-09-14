import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateWithGemini } from '@/lib/gemini';
import { fetchFalso, respuestaGemini } from '../ayudas';

const pedido = { system: 'Sistema', contents: [{ role: 'user' as const, parts: [{ text: 'hola' }] }] };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Cliente de Gemini (generateWithGemini)', () => {
  it('devuelve el texto de la respuesta', async () => {
    const { falso } = fetchFalso(() => respuestaGemini('  Respuesta  '));
    vi.stubGlobal('fetch', falso);
    expect(await generateWithGemini(pedido)).toEqual({ ok: true, text: 'Respuesta' });
  });

  it('manda el presupuesto de razonamiento y, si el modelo no lo acepta (400), reintenta sin él', async () => {
    let intento = 0;
    const { falso, llamadasGemini } = fetchFalso(() => (++intento === 1 ? new Response('bad request', { status: 400 }) : respuestaGemini('ok')));
    vi.stubGlobal('fetch', falso);

    expect(await generateWithGemini({ ...pedido, thinkingBudget: -1 })).toEqual({ ok: true, text: 'ok' });
    expect(llamadasGemini).toHaveLength(2);
    expect(llamadasGemini[0].cuerpo.generationConfig.thinkingConfig).toEqual({ thinkingBudget: -1 });
    expect(llamadasGemini[1].cuerpo.generationConfig.thinkingConfig).toBeUndefined();
  });

  it('distingue bloqueo, respuesta vacía y error HTTP', async () => {
    vi.stubGlobal('fetch', fetchFalso(() => new Response(JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } }))).falso);
    expect(await generateWithGemini(pedido)).toMatchObject({ ok: false, kind: 'blocked' });

    vi.stubGlobal('fetch', fetchFalso(() => new Response(JSON.stringify({ candidates: [] }))).falso);
    expect(await generateWithGemini(pedido)).toMatchObject({ ok: false, kind: 'empty' });

    vi.stubGlobal('fetch', fetchFalso(() => new Response('quota', { status: 429 })).falso);
    expect(await generateWithGemini(pedido)).toMatchObject({ ok: false, kind: 'http', status: 429 });
  });

  it('corta la espera cuando se pasa del tiempo límite', async () => {
    const { falso } = fetchFalso(
      (_url, init) =>
        new Promise<Response>((_resolver, rechazar) => {
          init?.signal?.addEventListener('abort', () => rechazar(Object.assign(new Error('abortado'), { name: 'AbortError' })));
        })
    );
    vi.stubGlobal('fetch', falso);
    expect(await generateWithGemini({ ...pedido, timeoutMs: 50 })).toMatchObject({ ok: false, kind: 'timeout' });
  });

  it('sin clave configurada no intenta llamar', async () => {
    const clave = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    const { falso, llamadasGemini } = fetchFalso(() => respuestaGemini('no'));
    vi.stubGlobal('fetch', falso);
    expect(await generateWithGemini(pedido)).toMatchObject({ ok: false, kind: 'http' });
    expect(llamadasGemini).toHaveLength(0);
    process.env.GEMINI_API_KEY = clave;
  });
});
