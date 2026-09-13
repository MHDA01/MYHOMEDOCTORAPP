"""Agente redactor: arma el borrador de un protocolo SOLO desde las guías de la biblioteca.

Uso:  python redactar.py <motivo_id> [--modelo gemini-pro-latest]

Trabaja sobre el inventario de recomendaciones calificadas de cada fuente
(inventario.py): la IA no elige qué mirar, tiene que decidir sobre TODAS y
justificar cada exclusión. La calificación no la escribe la IA: sale del inventario.

Salida: borradores/<motivo_id>.<modelo>.raw.json (respuesta cruda + tokens medidos).
El borrador todavía no vale nada: pasa por verificar.py y por el médico.
"""
from __future__ import annotations

import argparse
import datetime
import json
import os
import sys

from comun import BORRADORES, FUENTES, RAIZ, escribir_json, leer_json, llamar_gemini, manifest

SECCIONES = {
    "preguntas_triage": "Preguntas que la Dra. Hilda debe hacer al cuidador para clasificar la gravedad.",
    "signos_de_alarma": "Signos que obligan a acudir a urgencias de inmediato.",
    "medidas_en_casa": "Cuidados que la guía indica para el hogar.",
    "cuando_consultar": "Situaciones en que debe llevarse a consulta médica (no urgente).",
    "que_no_hacer": "Prácticas que la guía desaconseja.",
    "prevencion": "Medidas para prevenir nuevos episodios.",
}

RAZONES_EXCLUSION = [
    "dirigida_a_personal_de_salud",  # exámenes, procedimientos, manejo hospitalario sin traducción útil para el hogar
    "medicamento_o_dosis",           # la teleorientación no prescribe
    "fuera_del_motivo",
    "definicion_o_contexto",         # definiciones, factores de riesgo, metodología
    "duplicada",                     # la guía repite otra recomendación ya incluida
]

SISTEMA = f"""Eres un asistente de extracción documental para un equipo médico. NO eres una fuente de conocimiento.

Recibes el INVENTARIO completo de recomendaciones calificadas de una guía oficial. Tu tarea es construir el borrador de un protocolo de teleorientación para cuidadores.

REGLAS ABSOLUTAS
1. Decide sobre CADA recomendación del inventario, sin saltarte ninguna: "incluir": true o false.
2. Si la excluyes, "razon" debe ser una de: {", ".join(RAZONES_EXCLUSION)}.
3. Si la incluyes, genera uno o más ítems. Cada ítem:
   - "seccion": una de {", ".join(SECCIONES)}.
   - "citas_literales": lista de 1 a 3 fragmentos, cada uno copiado carácter por carácter del texto de ESA recomendación (cada fragmento de 40 a 400 caracteres), incluidas sus rarezas de extracción. Si la frase necesita partes separadas de la recomendación, usa varios fragmentos; nunca los unas con "..." dentro de un mismo fragmento.
   - "texto": reformulación en español sencillo para madres, padres y cuidadores. No puede decir nada que la cita no diga: conserva conjunciones ("y" no es "o"), condiciones ("sin deshidratación"), límites de edad y cifras exactamente.
   - "adaptacion": null, o una frase que declare honestamente cómo trasladaste la recomendación al contexto de teleorientación (p. ej. "la guía lo plantea como criterio de hospitalización; aquí se presenta como signo para acudir a urgencias"). Nunca hagas una adaptación sin declararla.
   - "requiere_decision_medica": true si menciona un medicamento, suplemento, producto (p. ej. sales de rehidratación oral) o cantidades.
4. PROHIBIDO proponer medicamentos, dosis o esquemas farmacológicos como indicación: la teleorientación no prescribe (Resolución 2654 de 2019, art. 19). Esas recomendaciones se excluyen con "medicamento_o_dosis".
5. Cuando una recomendación enumera criterios de gravedad, de manejo en el hogar o de remisión a urgencias, no omitas ninguno que un cuidador pueda reconocer: crea un ítem por criterio o grupo de criterios. Omitir un signo de gravedad es un error más grave que incluir uno de más.
6. No uses conocimiento propio ni agregues contenido que no esté en el inventario. Es preferible un protocolo incompleto a una frase sin respaldo. En "vacios" anota lo que un protocolo de este motivo necesitaría y el inventario no trae.
7. Responde solo con el JSON pedido."""


def cargar_inventario(fuente_id: str) -> list[dict]:
    ruta = os.path.join(FUENTES, "inventario", f"{fuente_id}.json")
    if not os.path.exists(ruta):
        sys.exit(f"Falta el inventario de {fuente_id}: corre primero  python inventario.py {fuente_id}")
    return leer_json(ruta)["recomendaciones"]


def construir_usuario(motivo: dict, recs: list[dict]) -> str:
    esquema = {
        "decisiones": [{
            "rec_id": "id del inventario",
            "incluir": True,
            "razon": "null si se incluye; si no, una razón válida",
            "items": [{
                "seccion": "una sección válida",
                "texto": "frase para cuidadores",
                "citas_literales": ["fragmento exacto de la recomendación"],
                "adaptacion": None,
                "requiere_decision_medica": False,
            }],
        }],
        "vacios": ["lo que falta en el inventario para este motivo"],
    }
    secciones = "\n".join(f"- {k}: {v}" for k, v in SECCIONES.items())
    inventario = "\n\n".join(f"[{r['rec_id']}] (página {r['pagina']}) {r['texto']}" for r in recs)
    return (
        f"MOTIVO DE CONSULTA: {motivo['motivo']} en {motivo['edad']} (curso de vida: {motivo['curso_de_vida']}).\n\n"
        f"SECCIONES DEL PROTOCOLO:\n{secciones}\n\n"
        f"FORMATO DE SALIDA (JSON):\n{json.dumps(esquema, ensure_ascii=False, indent=2)}\n\n"
        f"INVENTARIO ({len(recs)} recomendaciones):\n{inventario}"
    )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("motivo_id")
    ap.add_argument("--modelo", default="gemini-pro-latest")
    args = ap.parse_args()

    motivos = {m["id"]: m for m in leer_json(os.path.join(RAIZ, "motivos.json"))["motivos"]}
    motivo = motivos[args.motivo_id]
    catalogo = manifest()
    recs = []
    for f in motivo["fuentes"]:
        if f not in catalogo:
            sys.exit(f"Fuente {f} no está en el manifest")
        recs += cargar_inventario(f)

    texto, uso = llamar_gemini(args.modelo, SISTEMA, construir_usuario(motivo, recs))
    salida = os.path.join(BORRADORES, f"{args.motivo_id}.{args.modelo}.raw.json")
    escribir_json(salida, {
        "motivo": motivo,
        "generado": datetime.datetime.now().isoformat(timespec="seconds"),
        "uso": uso,
        "respuesta": texto,
    })
    print(json.dumps(uso, ensure_ascii=False))
    print("guardado", salida)


if __name__ == "__main__":
    main()
