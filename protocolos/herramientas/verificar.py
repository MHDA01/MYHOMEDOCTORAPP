"""Verificador del borrador de un protocolo.

Uso:  python verificar.py borradores/<motivo>.<modelo>.raw.json [--juez gemini-3.5-flash]

1. Comprobación determinista (sin IA): cada cita literal tiene que existir en el
   PDF de la fuente declarada. Si no existe, el ítem se rechaza. Esto es lo que
   impide que pase una referencia inventada.
2. La calificación (p. ej. "Recomendación: Fuerte a favor") tiene que aparecer
   junto a la cita en la guía; si no, se quita y se marca.
3. Alertas por medicamentos, productos o dosis: nunca se aprueban solas.
4. Juez de fidelidad (IA distinta del redactor): señala cuando la frase para
   cuidadores dice algo que la cita no dice. Solo marca; decide el médico.
"""
from __future__ import annotations

import argparse
import json
import os
import re

from comun import BORRADORES, escribir_json, leer_json, llamar_gemini, normalizar, paginas, sin_espacios

MIN_CITA = 15  # la cita ya debe salir de UNA recomendación concreta: 15 caracteres no dan coincidencias casuales
VENTANA_CALIFICACION = 2500  # caracteres después de la cita donde debe estar su calificación

PATRONES_MEDICAMENTO = [
    r"\b\d+(?:[.,]\d+)?\s*(?:mg|ml|mcg|µg|ui|gotas|g)(?:/kg)?\b",
    r"\bdosis\b", r"\bmedicament", r"\bantibi[oó]tic", r"\bamoxicil", r"\bacetaminof",
    r"\bparacetam", r"\bibuprof", r"\bzinc\b", r"∫inc", r"\bondansetr", r"\bloperam",
    r"\bracecadotril", r"\bprobi[oó]tic", r"\bsuero\b", r"\bsales de rehidrataci", r"\bsro\b",
    r"\bjarabe\b", r"\bvitamina", r"\bsuplement", r"\bnebuliz", r"\bsalbutamol", r"\bcorticoid",
]


def ubicar_cita(fuente_id: str, cita: str, pagina: int) -> int | None:
    """Página (1..N) donde la cita existe literalmente, o None.

    Se busca primero en la página declarada y la siguiente (una cita puede cruzar
    el salto de página), luego en todo el documento para corregir un número de
    página equivocado. El texto nunca se flexibiliza: solo espacios, mayúsculas,
    ligaduras y guiones de corte.
    """
    texto = paginas(fuente_id)
    n = len(texto)
    objetivo, objetivo_sin = normalizar(cita), sin_espacios(cita)

    def contiene(tramo: str) -> bool:
        return objetivo in normalizar(tramo) or objetivo_sin in sin_espacios(tramo)

    orden = [pagina - 1] + [i for i in range(n) if i != pagina - 1]
    # Primero la cita completa dentro de una sola página; solo después, cruzando
    # un salto de página. Si no, una cita de la página 73 se atribuía a la 72.
    for i in orden:
        if 0 <= i < n and contiene(texto[i]):
            return i + 1
    for i in orden:
        if 0 <= i < n - 1 and contiene(texto[i] + "\n" + texto[i + 1]):
            return i + 1
    return None


ETIQUETA_CALIFICACION = re.compile(
    r"recomendaci[oó]n:?(?:fuerte|d[eé]bil)(?:afavor|encontra)|puntodebuenapr[aá]ctica"
)


def calificacion_junto_a_cita(fuente_id: str, pagina: int, cita: str, calificacion: str) -> bool:
    """La calificación debe ser la PRIMERA etiqueta de calificación después de la cita.

    Antes bastaba con que apareciera en los 2.500 caracteres siguientes, y eso podía
    aceptar la calificación de la recomendación vecina.
    """
    esperada = ETIQUETA_CALIFICACION.search(sin_espacios(calificacion))
    if not esperada:
        return False  # lo que el modelo puso no es una etiqueta de calificación de la guía
    texto = paginas(fuente_id)
    tramo = sin_espacios(" ".join(texto[pagina - 1: pagina + 1]))
    pos = tramo.find(sin_espacios(cita))
    if pos < 0:
        return False
    fin = pos + len(sin_espacios(cita))
    primera = ETIQUETA_CALIFICACION.search(tramo[fin: fin + VENTANA_CALIFICACION])
    return bool(primera) and primera.group(0) == esperada.group(0)


def alertas_medicamento(*textos: str) -> list[str]:
    encontrados = set()
    for t in textos:
        for p in PATRONES_MEDICAMENTO:
            m = re.search(p, t or "", re.I)
            if m:
                encontrados.add(m.group(0).strip())
    return sorted(encontrados)


def juez_fidelidad(items: list[dict], modelo: str, motivo: dict) -> tuple[dict, dict]:
    sistema = (
        "Eres un revisor clínico estricto. Para cada ítem decide si el TEXTO dice algo que la CITA no sostiene: "
        "una afirmación extra, una generalización, una condición omitida (p. ej. 'sin deshidratación'), un cambio "
        "de conjunción ('y' por 'o'), una cifra o límite de edad distinto, o una instrucción que la cita no da. "
        "Si el ítem trae una ADAPTACIÓN declarada (p. ej. un criterio de hospitalización presentado como signo para "
        "ir a urgencias), esa adaptación concreta ya está a la vista del médico: no la marques, pero sí cualquier "
        "otra diferencia. "
        f"CONTEXTO: todas las frases forman parte de un protocolo sobre {motivo['motivo'].lower()} en "
        f"{motivo['edad']}; no marques como problema que la frase no repita esa población. "
        "No uses conocimiento propio: juzga solo contra la cita. "
        'Responde JSON: {"items": [{"id": "...", "fiel": true|false, "problema": "texto breve o null"}]}'
    )
    pares = [{"id": it["id"], "texto": it["texto"], "cita": it["cita_literal"], "adaptacion": it.get("adaptacion")}
             for it in items]
    # Frases trampa: una fiel y una que cambia "y" por "o" (error real del primer piloto).
    # Si el juez no marca la mala, su revisión de esta corrida no es confiable.
    pares += [
        {"id": "canario-fiel", "texto": "Lávese las manos con agua y jabón antes de preparar los alimentos del niño.",
         "cita": "Se recomienda el lavado de manos con agua y jabón antes de preparar los alimentos del niño.", "adaptacion": None},
        {"id": "canario-infiel", "texto": "Acuda si tiene 10 o más deposiciones en 24 horas o 5 o más vómitos en 4 horas.",
         "cita": "factores de riesgo para muerte (diez o más deposiciones diarreicas en las últimas 24 horas y cinco o más vómitos en las últimas 4 horas)",
         "adaptacion": None},
    ]
    respuesta, uso = llamar_gemini(modelo, sistema, json.dumps(pares, ensure_ascii=False), temperatura=0.0)
    veredictos = {r["id"]: r for r in json.loads(respuesta).get("items", [])}
    uso["juez_confiable"] = (veredictos.get("canario-infiel", {}).get("fiel") is False
                             and veredictos.get("canario-fiel", {}).get("fiel") is True)
    return veredictos, uso


def main() -> None:
    from redactar import RAZONES_EXCLUSION, SECCIONES, cargar_inventario

    ap = argparse.ArgumentParser()
    ap.add_argument("raw")
    ap.add_argument("--juez", default="gemini-3.5-flash")
    args = ap.parse_args()

    raw = leer_json(args.raw)
    motivo = raw["motivo"]
    borrador = json.loads(raw["respuesta"])
    recs = {r["rec_id"]: r for f in motivo["fuentes"] for r in cargar_inventario(f)}

    items, excluidas, invalidas, vistas = [], [], [], set()
    for d in borrador.get("decisiones") or []:
        rec_id = d.get("rec_id")
        if rec_id not in recs or rec_id in vistas:
            invalidas.append({"rec_id": rec_id, "problema": "no existe en el inventario" if rec_id not in recs else "decisión repetida"})
            continue
        vistas.add(rec_id)
        rec, fuente = recs[rec_id], rec_id.split("#")[0]

        if not d.get("incluir"):
            razon = d.get("razon") if d.get("razon") in RAZONES_EXCLUSION else f"razón no válida: {d.get('razon')}"
            excluidas.append({**rec, "razon": razon})
            continue

        for it in d.get("items") or []:
            it = dict(it, id=f"i{len(items) + 1}", rec_id=rec_id, fuente=fuente,
                      calificacion_literal=rec["calificacion"], calificacion_verificada=True)
            razones, alertas = [], []
            citas = it.get("citas_literales") or ([it["cita_literal"]] if it.get("cita_literal") else [])
            it["citas_literales"] = citas
            it["cita_literal"] = " … ".join(citas)  # para mostrar y para el juez
            if it.get("seccion") not in SECCIONES:
                razones.append(f"sección no válida: {it.get('seccion')}")
            if not citas:
                razones.append("sin cita")
            for n, cita in enumerate(citas, start=1):
                if len(normalizar(cita)) < MIN_CITA:
                    razones.append(f"fragmento {n} demasiado corto para verificarlo")
                elif not (normalizar(cita) in normalizar(rec["texto"]) or sin_espacios(cita) in sin_espacios(rec["texto"])):
                    razones.append(f"el fragmento {n} no es literal de la recomendación que dice usar")
                else:
                    pagina = ubicar_cita(fuente, cita, rec["pagina"])
                    if pagina is None:
                        razones.append(f"el fragmento {n} no existe literalmente en el PDF")
                    elif n == 1:
                        it["pagina"] = pagina

            if it.get("adaptacion"):
                alertas.append("adaptación declarada: " + it["adaptacion"])
            meds = alertas_medicamento(it.get("texto", ""), it["cita_literal"])
            if meds:
                alertas.append("menciona medicamento, producto o dosis: " + ", ".join(meds))
            if meds or it.get("requiere_decision_medica"):
                it["requiere_decision_medica"] = True

            it["verificacion"] = {"estado": "rechazado" if razones else "verificado", "razones": razones, "alertas": alertas}
            items.append(it)

    sin_decision = [r for rid, r in recs.items() if rid not in vistas]

    # Criterios que la guía une con "y" y la IA separó en frases independientes: cada
    # frase es fiel a su fragmento, pero el criterio clínico cambia (piloto: "diez o más
    # deposiciones Y cinco o más vómitos" quedó como dos signos de alarma sueltos).
    verificables = [i for i in items if i["verificacion"]["estado"] == "verificado"]
    for a in verificables:
        for b in verificables:
            if a is b or a["rec_id"] != b["rec_id"]:
                continue
            texto_rec = normalizar(recs[a["rec_id"]]["texto"])
            for ca in a["citas_literales"]:
                for cb in b["citas_literales"]:
                    if f"{normalizar(ca)} y {normalizar(cb)}" in texto_rec:
                        for it, otro in ((a, b), (b, a)):
                            aviso = f"fidelidad: la guía exige este criterio JUNTO con {otro['id']} (los une con 'y'); aquí quedaron separados"
                            if aviso not in it["verificacion"]["alertas"]:
                                it["verificacion"]["alertas"].append(aviso)
                                it["revisar_fidelidad"] = True

    # Partes de cada recomendación INCLUIDA que ninguna frase usó: así se ve si la
    # IA tomó una parte y omitió otra (p. ej. "algún grado de deshidratación → urgencias").
    partes_no_usadas = []
    for rid in {i["rec_id"] for i in items}:
        usadas = [sin_espacios(c) for i in items if i["rec_id"] == rid and i["verificacion"]["estado"] == "verificado"
                  for c in i["citas_literales"]]
        continuo = re.sub(r"\s+", " ", recs[rid]["texto"])  # los saltos de línea del PDF no son frases
        segmentos = [s.strip() for s in re.split(r"(?<=[.:;])\s+", continuo) if len(s.strip()) >= 30]

        def cubierto(seg: str) -> bool:
            # Ventanas de 30 caracteres cada 10; el segmento cuenta como usado si al
            # menos la mitad de sus ventanas aparece en alguna cita.
            s = sin_espacios(seg)
            ventanas = [s[k:k + 30] for k in range(0, max(1, len(s) - 29), 10)]
            return sum(1 for v in ventanas if any(v in u for u in usadas)) >= len(ventanas) * 0.4

        faltan = [seg for seg in segmentos if not cubierto(seg)]
        if faltan:
            partes_no_usadas.append({"rec_id": rid, "pagina": recs[rid]["pagina"], "calificacion": recs[rid]["calificacion"], "segmentos": faltan})
    verificados = [i for i in items if i["verificacion"]["estado"] == "verificado"]
    uso_juez = None
    if verificados:
        veredictos, uso_juez = juez_fidelidad(verificados, args.juez, motivo)
        for it in verificados:
            v = veredictos.get(it["id"])
            if v and v.get("fiel") is False:
                it["verificacion"]["alertas"].append("fidelidad: " + (v.get("problema") or "el texto va más allá de la cita"))
                it["revisar_fidelidad"] = True

    razones = {}
    for e in excluidas:
        razones[e["razon"]] = razones.get(e["razon"], 0) + 1
    metricas = {
        "recomendaciones_en_inventario": len(recs),
        "con_decision": len(vistas),
        "sin_decision": len(sin_decision),
        "decisiones_invalidas": len(invalidas),
        "recomendaciones_incluidas": len({i["rec_id"] for i in items}),
        "recomendaciones_excluidas": len(excluidas),
        "exclusiones_por_razon": razones,
        "items_propuestos": len(items),
        "rechazados_por_cita": sum(1 for i in items if i["verificacion"]["estado"] == "rechazado"),
        "verificados": len(verificados),
        "con_adaptacion_declarada": sum(1 for i in verificados if i.get("adaptacion")),
        "requieren_decision_medica": sum(1 for i in verificados if i.get("requiere_decision_medica")),
        "marcados_por_fidelidad": sum(1 for i in verificados if i.get("revisar_fidelidad")),
        "recomendaciones_incluidas_con_partes_sin_usar": len(partes_no_usadas),
    }
    base = os.path.basename(args.raw).replace(".raw.json", "")
    salida = os.path.join(BORRADORES, f"{base}.verificado.json")
    escribir_json(salida, {
        "motivo": motivo,
        "estado": "borrador",
        "generado": raw["generado"],
        "uso_redactor": raw["uso"],
        "uso_juez": uso_juez,
        "metricas": metricas,
        "vacios": borrador.get("vacios", []),
        "items": items,
        "excluidas": excluidas,
        "sin_decision": sin_decision,
        "partes_no_usadas": sorted(partes_no_usadas, key=lambda x: x["pagina"]),
        "decisiones_invalidas": invalidas,
    })
    print(json.dumps(metricas, ensure_ascii=False, indent=2))
    print("guardado", salida)


if __name__ == "__main__":
    main()
