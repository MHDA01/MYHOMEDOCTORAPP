/**
 * Sube la biblioteca cerrada a la nube para que el panel de administración pueda
 * generar protocolos sin depender de este computador.
 *
 * Uso (desde la raíz de mhda):
 *   node protocolos/herramientas/sincronizar-biblioteca.js                 → solo muestra qué haría
 *   node protocolos/herramientas/sincronizar-biblioteca.js --escribir      → sube la biblioteca
 *   node protocolos/herramientas/sincronizar-biblioteca.js --escribir --importar-piloto
 *        → además carga el borrador del piloto de diarrea para revisarlo en el panel
 *
 * Por cada fuente del manifest con texto e inventario ya extraídos:
 *   - comprueba que el PDF local siga teniendo el sha256 registrado,
 *   - sube texto e inventario a Storage (protocolos/biblioteca/...),
 *   - guarda en Firestore (protocolos_fuentes) la ficha y el sha256 de lo subido.
 * La función que genera borradores rechaza cualquier archivo cuyo sha256 no coincida.
 *
 * Credenciales: las de Firebase Admin en .env.local (nunca se imprimen).
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..', '..');
const PROTOCOLOS = path.join(RAIZ, 'protocolos');
const FUENTES = path.join(PROTOCOLOS, 'fuentes');
const BUCKET = 'myhomedoctorapp.firebasestorage.app';
const PROYECTO = 'myhomedoctorapp';
const PILOTO = {
  motivoId: 'diarrea-primera-infancia',
  borradorId: 'piloto-diarrea-primera-infancia',
  verificado: 'diarrea-primera-infancia.gemini-pro-latest.verificado.json',
  raw: 'diarrea-primera-infancia.gemini-pro-latest.raw.json',
};

const escribir = process.argv.includes('--escribir');
const importarPiloto = process.argv.includes('--importar-piloto');
const leer = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

function credenciales() {
  const texto = fs.readFileSync(path.join(RAIZ, '.env.local'), 'utf8');
  const env = {};
  for (const m of texto.matchAll(/^([A-Z0-9_]+)=("([\s\S]*?)"|(.*))$/gm)) env[m[1]] = m[3] !== undefined ? m[3] : m[4];
  if (env.FIREBASE_PROJECT_ID !== PROYECTO) throw new Error(`.env.local apunta a ${env.FIREBASE_PROJECT_ID}, no a ${PROYECTO}`);
  return { projectId: env.FIREBASE_PROJECT_ID, clientEmail: env.FIREBASE_CLIENT_EMAIL, privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') };
}

// Mismos campos que guarda functions/src/protocolos/index.ts.
const CAMPOS_ITEM = [
  'id', 'rec_id', 'fuente', 'seccion', 'texto', 'citas_literales', 'cita_literal', 'adaptacion',
  'requiere_decision_medica', 'calificacion_literal', 'calificacion_verificada', 'pagina',
  'revisar_fidelidad', 'verificacion',
];

async function main() {
  const manifest = leer(path.join(FUENTES, 'manifest.json')).fuentes;
  const plan = [];
  for (const f of manifest) {
    const rutaTexto = path.join(FUENTES, 'texto', `${f.id}.json`);
    const rutaInventario = path.join(FUENTES, 'inventario', `${f.id}.json`);
    const rutaPdf = path.join(FUENTES, 'pdf', f.archivo);
    const tieneTexto = fs.existsSync(rutaTexto);
    const tieneInventario = fs.existsSync(rutaInventario);
    if (fs.existsSync(rutaPdf) && sha256(fs.readFileSync(rutaPdf)) !== f.sha256) {
      throw new Error(`${f.id}: el PDF local no coincide con el sha256 del manifest. No se sube nada.`);
    }
    const texto = tieneTexto ? fs.readFileSync(rutaTexto) : null;
    const inventario = tieneInventario ? fs.readFileSync(rutaInventario) : null;
    plan.push({
      fuente: f,
      texto,
      inventario,
      ficha: {
        titulo: f.titulo,
        entidad: f.entidad ?? null,
        anio: f.anio ?? null,
        metodologia_calificacion: f.metodologia_calificacion ?? null,
        url: f.url,
        archivo: f.archivo,
        pdf_sha256: f.sha256,
        nota: f.nota ?? null,
        texto_sha256: texto && inventario ? sha256(texto) : null,
        inventario_sha256: texto && inventario ? sha256(inventario) : null,
        inventario_total: texto && inventario ? JSON.parse(inventario.toString('utf8')).total : null,
        paginas: texto ? JSON.parse(texto.toString('utf8')).length : null,
      },
    });
  }

  for (const p of plan) {
    const estado = p.ficha.inventario_total ? `${p.ficha.inventario_total} recomendaciones, ${p.ficha.paginas} páginas` : 'sin texto o inventario: queda como no disponible';
    console.log(`- ${p.fuente.id}: ${estado}`);
  }
  if (importarPiloto) console.log(`- piloto: borrador ${PILOTO.borradorId} para el motivo ${PILOTO.motivoId}`);
  if (!escribir) {
    console.log('\nSolo lectura. Agrega --escribir para subirlo.');
    return;
  }

  const admin = require(path.join(RAIZ, 'node_modules', 'firebase-admin'));
  admin.initializeApp({ credential: admin.credential.cert(credenciales()), storageBucket: BUCKET });
  const db = admin.firestore();
  const bucket = admin.storage().bucket();
  const ahora = admin.firestore.FieldValue.serverTimestamp();

  for (const p of plan) {
    if (p.texto && p.inventario) {
      await bucket.file(`protocolos/biblioteca/texto/${p.fuente.id}.json`).save(p.texto, { contentType: 'application/json', resumable: false });
      await bucket.file(`protocolos/biblioteca/inventario/${p.fuente.id}.json`).save(p.inventario, { contentType: 'application/json', resumable: false });
    }
    await db.collection('protocolos_fuentes').doc(p.fuente.id).set({ ...p.ficha, sincronizado_en: ahora });
    console.log(`subida ${p.fuente.id}`);
  }

  if (importarPiloto) {
    const borradorRef = db.collection('protocolos_borradores').doc(PILOTO.borradorId);
    if ((await borradorRef.get()).exists) {
      console.log('el borrador del piloto ya estaba cargado: no se toca (conserva las decisiones de revisión).');
    } else {
      const motivos = leer(path.join(PROTOCOLOS, 'motivos.json')).motivos;
      const motivo = motivos.find((m) => m.id === PILOTO.motivoId);
      const v = leer(path.join(PROTOCOLOS, 'borradores', PILOTO.verificado));
      const raw = leer(path.join(PROTOCOLOS, 'borradores', PILOTO.raw));
      const items = v.items.map((it) => Object.fromEntries(CAMPOS_ITEM.filter((c) => it[c] !== undefined).map((c) => [c, it[c]])));
      const motivoDoc = { id: motivo.id, motivo: motivo.motivo, curso_de_vida: motivo.curso_de_vida, edad: motivo.edad, fuentes: motivo.fuentes };
      const lote = db.batch();
      lote.set(borradorRef, {
        motivo_id: motivo.id,
        motivo: motivoDoc,
        estado: 'listo',
        error: null,
        importado: true,
        creado_por: 'piloto (generado el 13-sep-2026 con las herramientas locales)',
        creado_en: ahora,
        actualizado_en: ahora,
        terminado_en: ahora,
        generado: v.generado,
        modelo_redactor: v.uso_redactor?.modelo ?? null,
        modelo_juez: v.uso_juez?.modelo ?? null,
        uso_redactor: v.uso_redactor,
        uso_juez: v.uso_juez,
        metricas: v.metricas,
        vacios: v.vacios,
        items,
        excluidas: v.excluidas,
        sin_decision: v.sin_decision,
        partes_no_usadas: v.partes_no_usadas,
        decisiones_invalidas: v.decisiones_invalidas,
        revision: {},
      });
      lote.set(borradorRef.collection('crudo').doc('redactor'), { respuesta: raw.respuesta, uso: raw.uso, guardado_en: ahora });
      lote.set(
        db.collection('protocolos_motivos').doc(motivo.id),
        { motivo: motivo.motivo, curso_de_vida: motivo.curso_de_vida, edad: motivo.edad, fuentes: motivo.fuentes, creado_por: 'piloto', creado_en: ahora, borrador_actual: PILOTO.borradorId, publicado: null },
        { merge: true }
      );
      await lote.commit();
      console.log('piloto cargado');
    }
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
