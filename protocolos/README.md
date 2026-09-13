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

## Requisitos

Python 3 con `pymupdf`. La llave de Gemini se lee de `functions/.env`.
