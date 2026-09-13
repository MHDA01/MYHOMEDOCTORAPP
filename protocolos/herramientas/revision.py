"""Documento de revisión para el médico: cada frase junto a su cita y su página.

Uso:  python revision.py borradores/<motivo>.<modelo>.verificado.json
Salida: borradores/<motivo>.<modelo>.revision.html
"""
from __future__ import annotations

import html
import os
import sys

from comun import leer_json, manifest

TITULOS = {
    "preguntas_triage": "Preguntas de triage",
    "signos_de_alarma": "Signos de alarma → urgencias",
    "medidas_en_casa": "Cuidados en casa",
    "cuando_consultar": "Cuándo llevar a consulta",
    "que_no_hacer": "Qué no hacer",
    "prevencion": "Prevención",
}

RAZONES = {
    "dirigida_a_personal_de_salud": "Dirigida al personal de salud",
    "medicamento_o_dosis": "Medicamento o dosis (la teleorientación no prescribe)",
    "fuera_del_motivo": "Fuera del motivo de consulta",
    "definicion_o_contexto": "Definición o contexto",
    "duplicada": "Repite otra recomendación",
}

CSS = """
body{font-family:system-ui,Segoe UI,sans-serif;background:#f5f9fb;color:#16324a;margin:0;padding:24px;line-height:1.5}
main{max-width:860px;margin:0 auto}
h1{font-size:26px;margin:0 0 4px;color:#0b3b68} h2{font-size:19px;margin:32px 0 12px;color:#0b3b68}
.sub{color:#5b7084;margin:0 0 20px}
.metricas{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin:16px 0}
.metricas div{background:#fff;border:1px solid #dde7ee;border-radius:12px;padding:10px 12px}
.metricas b{display:block;font-size:22px;color:#0b3b68}
.item{background:#fff;border:1px solid #dde7ee;border-radius:14px;padding:14px 16px;margin:10px 0}
.item .id{font-weight:700;color:#12afa0;margin-right:6px}
.texto{font-size:16px;font-weight:600}
blockquote{margin:10px 0;padding:8px 12px;background:#f1f6f9;border-left:3px solid #12afa0;border-radius:0 8px 8px 0;font-size:14px;color:#33495c}
.meta{font-size:13px;color:#5b7084}
.meta a{color:#0b3b68}
.tag{display:inline-block;font-size:12px;font-weight:600;border-radius:999px;padding:2px 9px;margin:6px 6px 0 0}
.ok{background:#e3f6f3;color:#0a6e63}.gris{background:#eef2f5;color:#5b7084}
.aviso{background:#fff3dc;color:#8a5a00}.malo{background:#fde8e8;color:#9b1c1c}
details{margin-top:28px} summary{cursor:pointer;font-weight:700;color:#9b1c1c}
.nota{background:#fff;border:1px solid #dde7ee;border-radius:14px;padding:12px 16px}
"""


def e(t) -> str:
    return html.escape(str(t if t is not None else ""))


def tarjeta(it: dict, fuentes: dict) -> str:
    f = fuentes.get(it.get("fuente"), {})
    url = f"{f.get('url', '')}#page={it.get('pagina')}"
    tags = []
    if it.get("calificacion_verificada"):
        tags.append(f'<span class="tag ok">Calificación de la guía: {e(it["calificacion_literal"])}</span>')
    else:
        tags.append('<span class="tag gris">Sin calificación GRADE junto a esta cita</span>')
    if it.get("requiere_decision_medica"):
        tags.append('<span class="tag aviso">Requiere tu decisión: medicamento o producto</span>')
    for a in it["verificacion"]["alertas"]:
        if a.startswith("fidelidad"):
            clase = "malo"
        elif a.startswith("adaptación"):
            clase = "aviso"
        else:
            clase = "gris"
        tags.append(f'<span class="tag {clase}">{e(a)}</span>')
    return (
        f'<div class="item"><div class="texto"><span class="id">{e(it["id"])}</span>{e(it.get("texto"))}</div>'
        f'<blockquote>{e(it.get("cita_literal"))}</blockquote>'
        f'<div class="meta">{e(f.get("titulo", it.get("fuente")))} · '
        f'<a href="{e(url)}" target="_blank" rel="noreferrer">página {e(it.get("pagina"))} del PDF</a></div>'
        f'{"".join(tags)}</div>'
    )


def main() -> None:
    ruta = sys.argv[1]
    d = leer_json(ruta)
    fuentes = manifest()
    m, met = d["motivo"], d["metricas"]
    items = d["items"]
    verificados = [i for i in items if i["verificacion"]["estado"] == "verificado"]
    rechazados = [i for i in items if i["verificacion"]["estado"] != "verificado"]

    partes = [
        f"<title>Revisión: {e(m['motivo'])} ({e(m['edad'])})</title><style>{CSS}</style><main>",
        f"<h1>{e(m['motivo'])} · {e(m['edad'])}</h1>",
        f'<p class="sub">Borrador para revisión médica. Nada de esto llega a pacientes sin tu aprobación. '
        f"Generado {e(d['generado'])} con {e(d['uso_redactor'].get('modelo'))}.</p>",
        '<div class="metricas">'
        f"<div><b>{met['recomendaciones_en_inventario']}</b>recomendaciones calificadas en la guía</div>"
        f"<div><b>{met['recomendaciones_incluidas']}</b>usadas en el protocolo</div>"
        f"<div><b>{met['verificados']}</b>frases con cita verificada</div>"
        f"<div><b>{met['rechazados_por_cita']}</b>descartadas: la cita no está en la guía</div>"
        f"<div><b>{met['marcados_por_fidelidad']}</b>posible infidelidad a la cita</div>"
        f"<div><b>{met['con_adaptacion_declarada']}</b>adaptaciones a teleorientación</div>"
        f"<div><b>{met['requieren_decision_medica']}</b>requieren tu decisión (producto o cantidad)</div>"
        f"<div><b>{met['sin_decision']}</b>recomendaciones que la IA no evaluó</div>"
        "</div>",
        '<div class="nota"><b>Cómo revisar:</b> lee cada frase contra su cita. Si la frase dice algo que la cita no dice, '
        "recházala. Abre la página del PDF cuando dudes del contexto. Respóndeme con los números: "
        "<i>aprobar i1, i4… · corregir i7: … · rechazar i9</i>.</div>",
        "<h2>Fuentes</h2><ul>" + "".join(
            f'<li><a href="{e(fuentes[f]["url"])}" target="_blank" rel="noreferrer">{e(fuentes[f]["titulo"])}</a> '
            f'({e(fuentes[f]["anio"])}). {e(fuentes[f].get("nota", ""))}</li>' for f in m["fuentes"]) + "</ul>",
    ]
    for clave, titulo in TITULOS.items():
        del_seccion = [i for i in verificados if i["seccion"] == clave]
        partes.append(f"<h2>{e(titulo)} ({len(del_seccion)})</h2>")
        partes.append("".join(tarjeta(i, fuentes) for i in del_seccion) or '<p class="sub">La guía no cubre esta sección.</p>')
    if d.get("partes_no_usadas"):
        partes.append(f"<h2>Partes de recomendaciones incluidas que no se usaron ({len(d['partes_no_usadas'])})</h2>"
                      "<p class='sub'>La IA tomó estas recomendaciones pero no convirtió estas partes en frases. "
                      "Revisa si alguna debería estar en el protocolo.</p>" + "".join(
            f"<div class='item'><div class='meta'>página {e(x['pagina'])} · {e(x['calificacion'])}</div>"
            + "".join(f"<blockquote>{e(seg)}</blockquote>" for seg in x["segmentos"]) + "</div>"
            for x in d["partes_no_usadas"]))
    excluidas = d.get("excluidas", [])
    if excluidas:
        filas = "".join(
            f'<div class="item"><div class="meta"><b>{e(x["rec_id"].split("#")[-1])}</b> · página {e(x["pagina"])} · '
            f'{e(x["calificacion"])} · <span class="tag gris">{e(RAZONES.get(x["razon"], x["razon"]))}</span></div>'
            f'<blockquote>{e(x["texto"][:600])}{"…" if len(x["texto"]) > 600 else ""}</blockquote></div>'
            for x in excluidas)
        partes.append(
            f"<details><summary style='color:#0b3b68'>Recomendaciones de la guía que la IA dejó fuera ({len(excluidas)}) — "
            "revisa que no falte ninguna importante</summary>" + filas + "</details>")
    if d.get("sin_decision"):
        partes.append(f"<h2>Sin evaluar ({len(d['sin_decision'])})</h2><p class='sub'>La IA no tomó decisión sobre estas "
                      "recomendaciones; hay que volver a correr el redactor o decidirlas a mano.</p>" + "".join(
            f"<div class='item'><div class='meta'>página {e(x['pagina'])} · {e(x['calificacion'])}</div>"
            f"<blockquote>{e(x['texto'][:400])}</blockquote></div>" for x in d["sin_decision"]))
    if d.get("vacios"):
        partes.append("<h2>Lo que la guía no cubre</h2><ul>" + "".join(f"<li>{e(v)}</li>" for v in d["vacios"]) + "</ul>")
    if rechazados:
        partes.append(f"<details><summary>Descartadas automáticamente ({len(rechazados)})</summary>" + "".join(
            f'<div class="item"><div class="texto"><span class="id">{e(i["id"])}</span>{e(i.get("texto"))}</div>'
            f'<blockquote>{e(i.get("cita_literal"))}</blockquote>'
            f'<span class="tag malo">{e("; ".join(i["verificacion"]["razones"]))}</span></div>' for i in rechazados) + "</details>")
    partes.append("</main>")

    salida = ruta.replace(".verificado.json", ".revision.html")
    open(salida, "w", encoding="utf-8").write("<!doctype html><meta charset='utf-8'>" + "".join(partes))
    print("guardado", salida)


if __name__ == "__main__":
    main()
