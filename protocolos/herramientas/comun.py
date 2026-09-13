"""Piezas compartidas del agente de protocolos.

Principio de todo el proceso: el modelo NO es la fuente. Solo redacta a partir
del texto de las guías de la biblioteca cerrada, y cada afirmación debe traer una
cita literal que este código comprueba contra el PDF, sin intervención de la IA.
"""
from __future__ import annotations

import hashlib
import io
import json
import os
import re
import time
import unicodedata
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROYECTO = os.path.dirname(RAIZ)
FUENTES = os.path.join(RAIZ, "fuentes")
BORRADORES = os.path.join(RAIZ, "borradores")


def leer_json(ruta: str):
    return json.load(io.open(ruta, encoding="utf-8"))


def escribir_json(ruta: str, datos) -> None:
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    io.open(ruta, "w", encoding="utf-8").write(json.dumps(datos, ensure_ascii=False, indent=2))


def manifest() -> dict[str, dict]:
    return {f["id"]: f for f in leer_json(os.path.join(FUENTES, "manifest.json"))["fuentes"]}


def paginas(fuente_id: str) -> list[str]:
    """Texto de cada página del PDF (índice 0 = página 1 del PDF).

    Se extrae una sola vez y se guarda; antes se comprueba el sha256 para no
    citar un PDF distinto del registrado en el manifest.
    """
    fuente = manifest()[fuente_id]
    cache = os.path.join(FUENTES, "texto", f"{fuente_id}.json")
    if os.path.exists(cache):
        return leer_json(cache)

    pdf = os.path.join(FUENTES, "pdf", fuente["archivo"])
    sha = hashlib.sha256(open(pdf, "rb").read()).hexdigest()
    if sha != fuente["sha256"]:
        raise RuntimeError(f"{fuente_id}: el PDF no coincide con el sha256 del manifest")

    import pymupdf  # solo hace falta al extraer

    doc = pymupdf.open(pdf)
    texto = [doc[i].get_text() for i in range(doc.page_count)]
    escribir_json(cache, texto)
    return texto


def texto_con_marcas(fuente_id: str) -> str:
    """El documento entero con un marcador por página, que es lo que ve el modelo."""
    partes = []
    for i, t in enumerate(paginas(fuente_id), start=1):
        partes.append(f"<<<FUENTE {fuente_id} | PÁGINA {i}>>>\n{t}")
    return "\n".join(partes)


# Rarezas de extracción observadas en estas guías (glifos y ligaduras).
_SUSTITUCIONES = {"∫": "z", "­": "", "’": "'", "“": '"', "”": '"'}


def normalizar(texto: str) -> str:
    """Normaliza para comparar citas: ligaduras, guiones de corte, espacios y mayúsculas.

    No borra ni cambia palabras: una cita inventada sigue sin coincidir.
    """
    t = unicodedata.normalize("NFKC", texto)
    for a, b in _SUSTITUCIONES.items():
        t = t.replace(a, b)
    t = re.sub(r"-\s*\n\s*", "", t)  # palabra partida al final de línea
    t = re.sub(r"\s+", " ", t)
    return t.strip().casefold()


def sin_espacios(texto: str) -> str:
    return re.sub(r"\s+", "", normalizar(texto))


def clave_gemini() -> str:
    for linea in io.open(os.path.join(PROYECTO, "functions", ".env"), encoding="utf-8"):
        if linea.startswith("GEMINI_API_KEY="):
            return linea.split("=", 1)[1].strip().strip('"')
    raise RuntimeError("No hay GEMINI_API_KEY en functions/.env")


def llamar_gemini(modelo: str, sistema: str, usuario: str, *, temperatura: float = 0.2,
                  max_tokens: int = 32768, json_salida: bool = True) -> tuple[str, dict]:
    """Devuelve (texto, uso). `uso` trae los tokens medidos por la API."""
    cuerpo = {
        "systemInstruction": {"parts": [{"text": sistema}]},
        "contents": [{"role": "user", "parts": [{"text": usuario}]}],
        "generationConfig": {"temperature": temperatura, "maxOutputTokens": max_tokens},
    }
    if json_salida:
        cuerpo["generationConfig"]["responseMimeType"] = "application/json"
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent?key={clave_gemini()}"
    inicio = time.time()
    req = urllib.request.Request(url, data=json.dumps(cuerpo).encode(), headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=900) as r:
            datos = json.load(r)
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Gemini HTTP {e.code}: {e.read()[:500]!r}") from None
    cand = datos["candidates"][0]
    texto = "".join(p.get("text", "") for p in cand["content"]["parts"] if not p.get("thought"))
    uso = dict(datos.get("usageMetadata", {}))
    uso["segundos"] = round(time.time() - inicio, 1)
    uso["finishReason"] = cand.get("finishReason")
    uso["modelo"] = modelo
    return texto, uso
