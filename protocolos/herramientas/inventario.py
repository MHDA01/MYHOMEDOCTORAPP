"""Inventario de las recomendaciones calificadas de una guía, sin IA.

Uso:  python inventario.py <fuente_id>
Salida: fuentes/inventario/<fuente_id>.json

Recorre el texto del PDF y toma cada bloque que la guía cierra con su etiqueta
de calificación ("Recomendación: Fuerte a favor", "Punto de buena práctica"...).
Así la lista de recomendaciones candidatas sale de la estructura del documento y
no de lo que la IA decida mirar: en el primer piloto el redactor omitió una
recomendación fuerte clave ("algún grado de deshidratación → urgencias").
"""
from __future__ import annotations

import json
import os
import re
import sys

from comun import FUENTES, escribir_json, paginas

ETIQUETA = re.compile(r"Recomendaci[oó]n\s*:\s*(?:Fuerte|D[eé]bil)\s+(?:a favor|en contra)|Punto de buena pr[aá]ctica", re.I)
ENCABEZADO = re.compile(r"^\s*Recomendaci[oó]n(?:es)?\s*$", re.I | re.M)


def inventariar(fuente_id: str) -> list[dict]:
    P = paginas(fuente_id)
    # Texto continuo con el desplazamiento donde empieza cada página, para que un
    # bloque que cruza el salto de página no se pierda ni se duplique.
    inicios, partes, pos = [], [], 0
    for t in P:
        inicios.append(pos)
        partes.append(t)
        pos += len(t) + 1
    todo = "\n".join(partes)

    def pagina_de(offset: int) -> int:
        n = 0
        for i, ini in enumerate(inicios):
            if ini <= offset:
                n = i
        return n + 1

    recs, fin_anterior = [], 0
    for m in ETIQUETA.finditer(todo):
        tramo = todo[fin_anterior:m.start()]
        cabeceras = list(ENCABEZADO.finditer(tramo))
        ini = fin_anterior + (cabeceras[-1].end() if cabeceras else 0)
        cuerpo = todo[ini:m.start()]
        # Un bloque sin encabezado y muy largo es texto corrido, no una recomendación.
        if not cabeceras and len(cuerpo) > 1500:
            fin_anterior = m.end()
            continue
        recs.append({
            "rec_id": f"{fuente_id}#r{len(recs) + 1}",
            "pagina": pagina_de(ini + len(cuerpo) - len(cuerpo.lstrip())),
            "calificacion": re.sub(r"\s+", " ", m.group(0)).strip(),
            "texto": cuerpo.strip(),
        })
        fin_anterior = m.end()
    return recs


def main() -> None:
    fuente_id = sys.argv[1]
    recs = inventariar(fuente_id)
    salida = os.path.join(FUENTES, "inventario", f"{fuente_id}.json")
    escribir_json(salida, {"fuente": fuente_id, "total": len(recs), "recomendaciones": recs})
    largos = sorted(len(r["texto"]) for r in recs)
    print(json.dumps({"total": len(recs), "texto_min": largos[0] if largos else 0, "texto_max": largos[-1] if largos else 0}))
    print("guardado", salida)


if __name__ == "__main__":
    main()
