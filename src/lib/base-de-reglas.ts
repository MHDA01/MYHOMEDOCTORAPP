/**
 * La base de reglas del grafo: una sola casa, y hoy está vacía.
 *
 * El ejecutor (`grafo-ejecutor.ts`) solo sabe recorrer. Lo que recorre —alarmas,
 * síndromes, activadores, escalas, árboles— son datos, y estos datos son
 * **contenido clínico**: cada uno lleva su fuente documental y la firma del
 * médico responsable con su fecha, y `revisarBase()` lo exige.
 *
 * **Por qué está vacía y no se llenó con ejemplos.** La regla de la casa es que
 * nada clínico sin aprobar entra a `src/`. Las reglas de ejemplo que usan las
 * pruebas viven en el archivo de pruebas por eso mismo. Una base "provisional"
 * aquí sería contenido clínico sin firma decidiendo conducta en producción, que
 * es exactamente lo que el marco legal no permite y lo que `revisarBase()`
 * existe para impedir.
 *
 * Así que esto es la **toma de corriente**: el grafo ya está conectado al turno
 * de la consulta (`grafo-del-turno.ts`), corre en cada mensaje y no cuesta una
 * llamada al modelo. Mientras no haya nada aprobado corre en vacío, y eso es a
 * propósito: lo que no está aprobado no se comporta.
 *
 * ── DÓNDE ENTRA DE VERDAD UNA REGLA APROBADA (18-nov-2026) ──
 *
 * **No aquí.** La base que usa la consulta se lee de Firestore, de
 * `reglas_del_grafo/publicada`, con `leerBasePublicada()` en
 * `base-de-reglas-guardada.ts`. Aprobar un activador es publicar un documento,
 * no editar este archivo y volver a desplegar la aplicación: un despliegue de
 * código por cada regla clínica haría que la frecuencia con la que el médico
 * puede aprobar algo dependiera de la frecuencia con la que se despliega.
 *
 * Esta constante sigue siendo lo que corre **cuando no hay nada publicado, lo
 * publicado no pasa las revisiones o Firestore falla**, y por eso se queda
 * vacía: es el suelo al que se cae el grafo, y el suelo tiene que ser el estado
 * que no decide nada.
 *
 * **Lo que NO hay que hacer aquí.** Llenar esta base a mano desde una guía. El
 * camino es la fábrica de protocolos de `protocolos/` y la aprobación por
 * activador, que es la unidad que el médico revisa en medio minuto. Un atajo
 * desde aquí deja el expediente de validación sin la firma que lo sostiene —y,
 * además, se saltaría las dos revisiones que sí le hace la publicación a lo que
 * entra por datos.
 */

import { type BaseDeReglas, BASE_VACIA } from '@/lib/grafo-reglas';

/**
 * El suelo: la base con la que corre la consulta cuando no hay ninguna
 * publicada.
 *
 * `BASE_VACIA` no es un marcador de posición: es una base bien formada con cero
 * reglas. El ejecutor la recorre sin quejarse y no dispara nada, que es la
 * conducta correcta mientras no haya nada aprobado.
 */
export const BASE_DE_REGLAS: BaseDeReglas = BASE_VACIA;

/**
 * Si la base tiene algo que decidir.
 *
 * Quien corre el grafo lo usa para distinguir dos cosas que se parecen en el
 * log y no son lo mismo: "el grafo corrió y no encontró nada" y "el grafo no
 * tenía con qué encontrar nada". La segunda no es un resultado clínico.
 */
export function tieneReglas(base: BaseDeReglas = BASE_DE_REGLAS): boolean {
  return (
    base.alarmas.length > 0 ||
    base.sindromes.length > 0 ||
    base.activadores.length > 0 ||
    base.susceptibilidades.length > 0 ||
    base.escalas.length > 0 ||
    base.arboles.length > 0
  );
}
