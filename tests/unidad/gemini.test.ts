import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateWithGemini } from '@/lib/gemini';
import { olvidarCaches } from '@/lib/gemini-cache';
import { fetchFalso, respuestaGemini, respuestaGeminiNativa } from '../ayudas';

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

  it('por el camino nativo manda la instrucción de sistema aparte y los contents tal cual', async () => {
    let cabeceras: Record<string, string> = {};
    const { falso, llamadasGemini } = fetchFalso((_url, init) => {
      cabeceras = (init?.headers ?? {}) as Record<string, string>;
      return respuestaGeminiNativa('ok');
    });
    vi.stubGlobal('fetch', falso);

    const contents = [
      { role: 'user' as const, parts: [{ text: 'tengo fiebre' }] },
      { role: 'model' as const, parts: [{ text: '¿desde cuándo?' }] },
    ];
    expect(await generateWithGemini({ system: 'Eres Hilda', contents, nativo: true, thinkingBudget: -1 })).toEqual({
      ok: true,
      text: 'ok',
      uso: { entrada: 0, salida: 0, cacheados: 0, razonamiento: 0 },
    });

    const llamada = llamadasGemini[0];
    expect(llamada.url).toContain(':generateContent');
    // La clave va en su cabecera, no en Bearer: con Bearer este endpoint da 401.
    expect(cabeceras['x-goog-api-key']).toBeTruthy();
    expect(cabeceras['Authorization']).toBeUndefined();
    expect(llamada.cuerpo.systemInstruction).toEqual({ parts: [{ text: 'Eres Hilda' }] });
    // Los roles de Gemini no se traducen aquí: `model` sigue siendo `model`.
    expect(llamada.cuerpo.contents).toEqual(contents);
    expect(llamada.cuerpo.generationConfig.thinkingConfig).toEqual({ thinkingBudget: -1 });
  });

  it('por el camino nativo trae los cacheados y lo que el modelo pensó', async () => {
    const { falso } = fetchFalso(() =>
      respuestaGeminiNativa('ok', { entrada: 5000, salida: 70, cacheados: 4500, pensados: 890 })
    );
    vi.stubGlobal('fetch', falso);

    expect(await generateWithGemini({ ...pedido, nativo: true })).toMatchObject({
      uso: { entrada: 5000, salida: 70, cacheados: 4500, razonamiento: 890 },
    });
  });

  it('por el camino nativo, una respuesta sin texto dice por qué se quedó sin texto', async () => {
    // El caso que avisa el comentario de THINKING_BUDGET: el razonamiento se
    // gasta el presupuesto de salida y no queda nada que decirle al paciente.
    const { falso } = fetchFalso(
      () =>
        new Response(JSON.stringify({ candidates: [{ content: { parts: [] }, finishReason: 'MAX_TOKENS' }] }), {
          status: 200,
        })
    );
    vi.stubGlobal('fetch', falso);

    expect(await generateWithGemini({ ...pedido, nativo: true })).toMatchObject({
      ok: false,
      kind: 'empty',
      detail: 'Respuesta sin texto (MAX_TOKENS)',
    });
  });

  it('por el camino nativo distingue el bloqueo de entrada del de salida', async () => {
    vi.stubGlobal(
      'fetch',
      fetchFalso(() => new Response(JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } }), { status: 200 })).falso
    );
    expect(await generateWithGemini({ ...pedido, nativo: true })).toMatchObject({ ok: false, kind: 'blocked' });

    vi.stubGlobal(
      'fetch',
      fetchFalso(() => new Response(JSON.stringify({ candidates: [{ finishReason: 'SAFETY' }] }), { status: 200 })).falso
    );
    expect(await generateWithGemini({ ...pedido, nativo: true })).toMatchObject({ ok: false, kind: 'blocked' });
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

describe('Caché explícito del prompt de sistema', () => {
  const nativo = { ...pedido, nativo: true as const, cacheSistema: true };
  const CACHE = 'cachedContents/abc123';

  /** El caché vive en memoria del módulo: sin esto, una prueba contamina la otra. */
  beforeEach(() => olvidarCaches());

  const esCreacion = (l: { url: string }) => l.url.endsWith('/cachedContents');

  it('sube el prompt una vez y después lo cita en vez de reenviarlo', async () => {
    const { falso, llamadasGemini } = fetchFalso((url) =>
      url.endsWith('/cachedContents')
        ? new Response(JSON.stringify({ name: CACHE }), { status: 200 })
        : respuestaGeminiNativa('ok')
    );
    vi.stubGlobal('fetch', falso);

    expect(await generateWithGemini(nativo)).toMatchObject({ ok: true, text: 'ok' });
    expect(await generateWithGemini(nativo)).toMatchObject({ ok: true, text: 'ok' });

    // Una sola creación para los dos turnos: lo que se paga una vez no se
    // vuelve a pagar mientras el caché viva.
    expect(llamadasGemini.filter(esCreacion)).toHaveLength(1);

    const turnos = llamadasGemini.filter((l) => !esCreacion(l));
    expect(turnos).toHaveLength(2);
    for (const turno of turnos) {
      expect(turno.cuerpo.cachedContent).toBe(CACHE);
      // Lo importante: el prompt ya NO viaja en la petición. Si volviera a
      // viajar, se estaría pagando dos veces y el caché no serviría de nada.
      expect(turno.cuerpo.systemInstruction).toBeUndefined();
    }
  });

  it('si el caché no se puede crear, manda el prompt como siempre', async () => {
    const { falso, llamadasGemini } = fetchFalso((url) =>
      url.endsWith('/cachedContents')
        ? new Response('too few tokens to cache', { status: 400 })
        : respuestaGeminiNativa('ok')
    );
    vi.stubGlobal('fetch', falso);

    // El turno sale más caro, pero sale: el caché es un ahorro, no un requisito.
    expect(await generateWithGemini(nativo)).toMatchObject({ ok: true, text: 'ok' });

    const turno = llamadasGemini.filter((l) => !esCreacion(l))[0];
    expect(turno.cuerpo.cachedContent).toBeUndefined();
    expect(turno.cuerpo.systemInstruction).toEqual({ parts: [{ text: 'Sistema' }] });
  });

  it('no reintenta crearlo en cada turno cuando ya falló', async () => {
    const { falso, llamadasGemini } = fetchFalso((url) =>
      url.endsWith('/cachedContents')
        ? new Response('no', { status: 400 })
        : respuestaGeminiNativa('ok')
    );
    vi.stubGlobal('fetch', falso);

    await generateWithGemini(nativo);
    await generateWithGemini(nativo);
    await generateWithGemini(nativo);

    // Cada intento es una llamada que se paga: si el prompt no se puede
    // cachear, no se va a poder dentro de un segundo tampoco.
    expect(llamadasGemini.filter(esCreacion)).toHaveLength(1);
  });

  it('si el caché se evaporó, repite el turno sin él en vez de fallar', async () => {
    let turnos = 0;
    const { falso, llamadasGemini } = fetchFalso((url) => {
      if (url.endsWith('/cachedContents')) {
        return new Response(JSON.stringify({ name: CACHE }), { status: 200 });
      }
      // El primer turno cita un caché que ya no existe; el reintento no lo cita.
      return ++turnos === 1
        ? new Response('CachedContent not found: cachedContents/abc123', { status: 403 })
        : respuestaGeminiNativa('ok');
    });
    vi.stubGlobal('fetch', falso);

    expect(await generateWithGemini(nativo)).toMatchObject({ ok: true, text: 'ok' });

    const peticiones = llamadasGemini.filter((l) => !esCreacion(l));
    expect(peticiones).toHaveLength(2);
    expect(peticiones[0].cuerpo.cachedContent).toBe(CACHE);
    expect(peticiones[1].cuerpo.cachedContent).toBeUndefined();
    expect(peticiones[1].cuerpo.systemInstruction).toEqual({ parts: [{ text: 'Sistema' }] });
  });

  it('un error que no es del caché se devuelve tal cual, sin reintentar', async () => {
    const { falso, llamadasGemini } = fetchFalso((url) =>
      url.endsWith('/cachedContents')
        ? new Response(JSON.stringify({ name: CACHE }), { status: 200 })
        : new Response('quota exceeded', { status: 429 })
    );
    vi.stubGlobal('fetch', falso);

    expect(await generateWithGemini(nativo)).toMatchObject({ ok: false, kind: 'http', status: 429 });
    expect(llamadasGemini.filter((l) => !esCreacion(l))).toHaveLength(1);
  });

  it('sin pedirlo, no se crea ningún caché', async () => {
    const { falso, llamadasGemini } = fetchFalso(() => respuestaGeminiNativa('ok'));
    vi.stubGlobal('fetch', falso);

    await generateWithGemini({ ...pedido, nativo: true });
    expect(llamadasGemini.filter(esCreacion)).toHaveLength(0);
    expect(llamadasGemini[0].cuerpo.systemInstruction).toEqual({ parts: [{ text: 'Sistema' }] });
  });

  it('por el camino compatible con OpenAI no se intenta cachear', async () => {
    const { falso, llamadasGemini } = fetchFalso(() => respuestaGemini('ok'));
    vi.stubGlobal('fetch', falso);

    await generateWithGemini({ ...pedido, cacheSistema: true });
    expect(llamadasGemini.filter(esCreacion)).toHaveLength(0);
  });

  it('turnos a la vez crean un solo caché, no uno cada uno', async () => {
    const { falso, llamadasGemini } = fetchFalso((url) =>
      url.endsWith('/cachedContents')
        ? new Response(JSON.stringify({ name: CACHE }), { status: 200 })
        : respuestaGeminiNativa('ok')
    );
    vi.stubGlobal('fetch', falso);

    await Promise.all([generateWithGemini(nativo), generateWithGemini(nativo), generateWithGemini(nativo)]);

    // Sin esto se pagaría el almacenamiento de tres cachés idénticos.
    expect(llamadasGemini.filter(esCreacion)).toHaveLength(1);
  });
});
