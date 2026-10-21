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

  it('manda el esfuerzo de razonamiento y, si el modelo no lo acepta (400), reintenta sin él', async () => {
    let intento = 0;
    const { falso, llamadasGemini } = fetchFalso(() => (++intento === 1 ? new Response('bad request', { status: 400 }) : respuestaGemini('ok')));
    vi.stubGlobal('fetch', falso);

    expect(await generateWithGemini({ ...pedido, thinkingBudget: -1 })).toEqual({ ok: true, text: 'ok' });
    expect(llamadasGemini).toHaveLength(2);
    expect(llamadasGemini[0].cuerpo.reasoning_effort).toBe('medium');
    expect(llamadasGemini[1].cuerpo.reasoning_effort).toBeUndefined();
  });

  it('por defecto pide que no razone, para que maxTokens sea presupuesto de salida', async () => {
    const { falso, llamadasGemini } = fetchFalso(() => respuestaGemini('ok'));
    vi.stubGlobal('fetch', falso);
    await generateWithGemini(pedido);
    expect(llamadasGemini[0].cuerpo.reasoning_effort).toBe('none');
  });

  it('traduce los contents de Gemini a messages de OpenAI, con el sistema de primero', async () => {
    const { falso, llamadasGemini } = fetchFalso(() => respuestaGemini('ok'));
    vi.stubGlobal('fetch', falso);
    await generateWithGemini({
      system: 'Eres Hilda',
      contents: [
        { role: 'user', parts: [{ text: 'tengo fiebre' }] },
        { role: 'model', parts: [{ text: '¿desde cuándo?' }] },
        { role: 'user', parts: [{ text: 'mira esto' }, { inlineData: { mimeType: 'image/jpeg', data: 'QUJD' } }] },
      ],
    });

    const mensajes = llamadasGemini[0].cuerpo.messages;
    expect(mensajes[0]).toEqual({ role: 'system', content: 'Eres Hilda' });
    expect(mensajes[1]).toEqual({ role: 'user', content: 'tengo fiebre' });
    // El rol `model` de Gemini se llama `assistant` en este formato.
    expect(mensajes[2]).toEqual({ role: 'assistant', content: '¿desde cuándo?' });
    expect(mensajes[3].content).toEqual([
      { type: 'text', text: 'mira esto' },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,QUJD' } },
    ]);
  });

  it('distingue bloqueo, respuesta vacía y error HTTP', async () => {
    vi.stubGlobal(
      'fetch',
      fetchFalso(() => new Response(JSON.stringify({ choices: [{ finish_reason: 'content_filter', message: { content: '' } }] }))).falso
    );
    expect(await generateWithGemini(pedido)).toMatchObject({ ok: false, kind: 'blocked' });

    vi.stubGlobal('fetch', fetchFalso(() => new Response(JSON.stringify({ choices: [] }))).falso);
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

  it('con reintentos, repite ante saturación (429) o error del servicio (5xx)', async () => {
    let intento = 0;
    const { falso, llamadasGemini } = fetchFalso(() => (++intento === 1 ? new Response('quota', { status: 429 }) : respuestaGemini('ok')));
    vi.stubGlobal('fetch', falso);
    expect(await generateWithGemini({ ...pedido, reintentos: 1 })).toEqual({ ok: true, text: 'ok' });
    expect(llamadasGemini).toHaveLength(2);
  });

  it('sin reintentos, o ante errores que no son pasajeros, no repite', async () => {
    const saturado = fetchFalso(() => new Response('quota', { status: 429 }));
    vi.stubGlobal('fetch', saturado.falso);
    expect(await generateWithGemini(pedido)).toMatchObject({ ok: false, status: 429 });
    expect(saturado.llamadasGemini).toHaveLength(1);

    const prohibido = fetchFalso(() => new Response('forbidden', { status: 403 }));
    vi.stubGlobal('fetch', prohibido.falso);
    expect(await generateWithGemini({ ...pedido, reintentos: 2 })).toMatchObject({ ok: false, status: 403 });
    expect(prohibido.llamadasGemini).toHaveLength(1);
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
