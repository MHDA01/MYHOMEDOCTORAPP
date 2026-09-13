# Protocolos de la Dra. Hilda

Base de conocimiento clínica de la teleorientación, construida para cerrar el riesgo
de alucinaciones: **la IA no es la fuente**. Solo extrae y redacta a partir de guías
oficiales, y cada frase lleva una cita literal que se comprueba contra el PDF sin
intervención de la IA. Ningún protocolo llega a pacientes sin la aprobación del
médico responsable.

## Proceso

1. **Biblioteca cerrada** — `fuentes/manifest.json`. Solo cuenta lo que esté aquí,
   con su URL oficial y el sha256 del PDF. Los PDF (`fuentes/pdf/`) no se suben a git.
2. **Motivo de consulta** — `motivos.json`: motivo, curso de vida (Resolución 3280 de
   2018) y fuentes permitidas. Los elige el médico.
3. **Inventario** — `herramientas/inventario.py <fuente_id>`. Sin IA: extrae todas las
   recomendaciones que la guía cierra con su calificación ("Recomendación: Fuerte a
   favor"...). La lista de candidatas sale del documento, no de lo que la IA elija.
4. **Redactor** — `herramientas/redactar.py <motivo_id>`. Decide sobre CADA
   recomendación del inventario (incluir o excluir con razón) y la traduce a frases
   para cuidadores en seis secciones. Tiene prohibido proponer medicamentos o dosis,
   usar conocimiento propio y adaptar una recomendación sin declararlo.
5. **Verificador** — `herramientas/verificar.py borradores/<...>.raw.json`.
   - Sin IA: cada cita debe ser un fragmento literal de su recomendación y existir en
     el PDF; si no, la frase se descarta. La calificación viene del inventario.
   - Lista las recomendaciones que la IA excluyó (con razón) o no evaluó.
   - Marca medicamentos, productos o dosis para decisión del médico.
   - Juez de fidelidad (otro modelo): marca frases que dicen más que su cita.
6. **Revisión médica** — `herramientas/revision.py borradores/<...>.verificado.json`
   genera el documento con cada frase, su cita y el enlace a la página del PDF.
7. **Aprobado** — solo las frases aprobadas pasan a la base que usa la Dra. Hilda.

## Calificación de la evidencia

Se usa la calificación **que la guía de origen ya asignó** (las GPC del Ministerio de
Salud / IETS usan GRADE). La IA nunca asigna niveles. Los signos de alarma sin
calificación se muestran como tales para que el médico decida.

## En la nube: panel de administración

Los pasos 4 a 7 corren sin este computador desde **Administración → Protocolos**
(`/dashboard/admin/protocolos`, solo para las cuentas de `ADMIN_EMAILS`):

- El panel crea el motivo (`protocolos_motivos`) y pide un borrador
  (`protocolos_borradores`, estado `en_cola`).
- `functions/src/protocolos` redacta y verifica: es una traducción exacta de
  `redactar.py` y `verificar.py`. Cualquier cambio en uno se hace en el otro y se
  vuelve a correr la prueba de paridad (misma salida sobre los borradores del piloto,
  mismo prompt, y citas alteradas rechazadas).
- El médico aprueba, corrige o rechaza cada frase; publicar guarda solo lo aprobado en
  `protocolos_publicados/{motivo}` con su versión. La Dra. Hilda **todavía no** lee
  protocolos publicados: activarlo es un paso aparte.

La biblioteca de la nube se sube desde aquí, porque agregar una guía exige revisar su
inventario (pasos 1 a 3):

    node protocolos/herramientas/sincronizar-biblioteca.js             # muestra qué subiría
    node protocolos/herramientas/sincronizar-biblioteca.js --escribir  # lo sube

Solo se sube una guía con texto e inventario. Cada archivo queda con su sha256 en
`protocolos_fuentes` y la función rechaza cualquier texto que no coincida.

**Ojo con guías de otro formato:** `inventario.py` reconoce las etiquetas de la GPC de
EDA 2013. Con la GPC de neumonía y bronquiolitis 2014 encontró 36 "puntos de buena
práctica" con bloques de hasta 150.000 caracteres: no reconoce su formato. Antes de
subir una guía nueva hay que comprobar que el inventario coincide con la guía.

## Requisitos

Python 3 con `pymupdf`. La llave de Gemini se lee de `functions/.env`.
