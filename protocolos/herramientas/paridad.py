"""Prueba de paridad, parte 1 (Python): corre verificar.py sin IA y sin tocar protocolos/borradores.

El juez se simula repitiendo los veredictos guardados, así la salida es determinista.
Uso (desde la raíz de mhda):
    python protocolos/herramientas/paridad.py
    cd functions && npm run build && cd .. && node protocolos/herramientas/paridad.js

Salida en protocolos/.paridad/ (ignorada por git).
"""
import json
import os
import sys

HERR = os.path.dirname(os.path.abspath(__file__))
SALIDA = os.path.join(os.path.dirname(HERR), ".paridad")
os.makedirs(SALIDA, exist_ok=True)
sys.path.insert(0, HERR)

import comun  # noqa: E402
import redactar  # noqa: E402
import verificar  # noqa: E402

BORR = os.path.join(os.path.dirname(HERR), "borradores")


def juez_desde_verificado(verificado_path):
    """Repite los veredictos del juez que quedaron guardados en un verificado.json."""
    previos = {}
    if verificado_path and os.path.exists(verificado_path):
        for it in comun.leer_json(verificado_path)["items"]:
            for a in it["verificacion"]["alertas"]:
                if a.startswith("fidelidad: ") and "JUNTO con" not in a:
                    previos[it["id"]] = {"id": it["id"], "fiel": False, "problema": a[len("fidelidad: "):]}

    def juez(items, modelo, motivo):
        return previos, {"simulado": True, "juez_confiable": True}
    return juez


escritos = {}
verificar.escribir_json = lambda ruta, datos: escritos.__setitem__("ultimo", datos)

casos = {
    "final": ("diarrea-primera-infancia.gemini-pro-latest.raw.json", "diarrea-primera-infancia.gemini-pro-latest.verificado.json"),
    "v2": ("diarrea-primera-infancia.v2-una-cita.raw.json", None),
    "v1": ("diarrea-primera-infancia.v1-sin-inventario.raw.json", None),
}
for nombre, (raw, previo) in casos.items():
    verificar.juez_fidelidad = juez_desde_verificado(os.path.join(BORR, previo) if previo else None)
    sys.argv = ["verificar.py", os.path.join(BORR, raw)]
    verificar.main()
    comun.escribir_json(os.path.join(SALIDA, f"{nombre}.py.json"), escritos["ultimo"])
    if previo:
        # El juez simulado repite el real: la salida debe ser idéntica a la guardada.
        guardado = comun.leer_json(os.path.join(BORR, previo))
        actual = escritos["ultimo"]
        for campo in ("metricas", "items", "excluidas", "sin_decision", "decisiones_invalidas", "vacios"):
            print(nombre, campo, "igual al guardado" if guardado[campo] == actual[campo] else "DISTINTO al guardado")

# Prompt del redactor para el motivo piloto
motivo = {m["id"]: m for m in comun.leer_json(os.path.join(os.path.dirname(HERR), "motivos.json"))["motivos"]}["diarrea-primera-infancia"]
recs = redactar.cargar_inventario("gpc-eda-2013")
comun.escribir_json(os.path.join(SALIDA, "prompt.py.json"), {"sistema": redactar.SISTEMA, "usuario": redactar.construir_usuario(motivo, recs)})

# ¿Hay caracteres donde casefold() y lower() difieren? (la versión TS solo cubre unos pocos)
textos = comun.paginas("gpc-eda-2013")
for raw, _ in casos.values():
    textos.append(comun.leer_json(os.path.join(BORR, raw))["respuesta"])
raros = sorted({c for t in textos for c in t if c.casefold() != c.lower() and c not in "ßẞſς"})
print("caracteres casefold != lower no cubiertos:", [hex(ord(c)) for c in raros])
