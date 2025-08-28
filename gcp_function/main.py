# gcp_function/main.py

import functions_framework
import vertexai
import json
from vertexai.generative_models import GenerativeModel, Part
from google.cloud import storage, firestore

# --- Configuración del Proyecto ---
# Es una buena práctica definir estas variables como constantes en la parte superior.
PROJECT_ID = "myhomedoctorapp"
LOCATION = "us-central1"
BUCKET_NAME = "myhomedoctorapp-bucket-20250820"
FIRESTORE_COLLECTION = "medical_documents" # Colección para los metadatos extraídos

# --- Inicialización de Clientes ---
# Inicializar los clientes fuera de la función permite su reutilización en ejecuciones posteriores (hot starts),
# lo cual es más eficiente.
vertexai.init(project=PROJECT_ID, location=LOCATION)
firestore_client = firestore.Client()
storage_client = storage.Client()
multimodal_model = GenerativeModel("gemini-1.0-pro-vision")

@functions_framework.cloud_event
def process_medical_document(cloud_event):
    """
    Cloud Function que se activa por la subida de un archivo a Cloud Storage,
    analiza el documento con Gemini y guarda el resultado en Firestore.
    """
    data = cloud_event.data
    bucket_name = data.get("bucket")
    file_name = data.get("name")
    content_type = data.get("contentType")

    if not all([bucket_name, file_name, content_type]):
        print("Error: Evento de Cloud Storage incompleto. Faltan 'bucket', 'name' o 'contentType'.")
        return

    # 1. Filtrar para procesar solo archivos en la carpeta de documentos médicos.
    # Esto evita que la función se ejecute en bucles si mueve archivos a otras carpetas.
    if not file_name.startswith("documentos medicos/"):
        print(f"Archivo '{file_name}' ignorado por no estar en la carpeta 'documentos medicos/'.")
        return

    # Ignorar la creación de pseudo-carpetas en GCS.
    if file_name.endswith('/'):
        print(f"Ignorando objeto de carpeta: {file_name}")
        return

    print(f"Procesando archivo: {file_name} del bucket: {bucket_name}")

    # 2. Preparar el contenido del archivo para Gemini.
    gcs_uri = f"gs://{bucket_name}/{file_name}"
    bucket = storage_client.bucket(bucket_name)
    blob = bucket.blob(file_name)
    
    try:
        # Se recomienda establecer un timeout para la descarga.
        file_bytes = blob.download_as_bytes(timeout=60)
        document_part = Part.from_data(data=file_bytes, mime_type=content_type)
    except Exception as e:
        print(f"Error al descargar el archivo {file_name}: {e}")
        return

    # 3. Construir el Prompt para Gemini (Few-Shot Prompting).
    prompt = f'''
    Analiza el siguiente documento médico ({content_type}) y extrae la información clave en formato JSON.
    El JSON debe contener: fileName, studyDate (en formato YYYY-MM-DD), studyName, resultsType ('lab_values' o 'conclusions'), y data.

    Ejemplo para un informe de laboratorio:
    {{
      "fileName": "laboratorio_juan_perez_ago25.pdf",
      "studyDate": "2025-08-15",
      "studyName": "Perfil Lipídico",
      "resultsType": "lab_values",
      "data": {{
        "Colesterol Total": "210 mg/dL",
        "HDL": "55 mg/dL",
        "LDL": "130 mg/dL",
        "Triglicéridos": "150 mg/dL"
      }}
    }}

    Ejemplo para un informe de imagenología:
    {{
      "fileName": "rx_torax_ana_gomez_ago25.jpg",
      "studyDate": "2025-08-18",
      "studyName": "Radiografía de Tórax",
      "resultsType": "conclusions",
      "data": "No se observan consolidaciones, derrames pleurales ni neumotórax. Índice cardiotorácico dentro de límites normales."
    }}

    Ahora, analiza el documento proporcionado y genera únicamente el objeto JSON correspondiente.
    El nombre del archivo es: {file_name.split('/')[-1]}
    '''

    # 4. Enviar la solicitud a la API de Gemini.
    try:
        print("Enviando solicitud a la API de Gemini...")
        response = multimodal_model.generate_content([document_part, prompt])
        
        # Extraer y limpiar la respuesta JSON de manera robusta.
        json_response_text = response.text.strip().replace("```json", "").replace("```", "").strip()
        extracted_data = json.loads(json_response_text)
        
        print("Datos extraídos exitosamente:")
        print(json.dumps(extracted_data, indent=2))

        # 5. Guardar el resultado en Firestore.
        # Usar el nombre del archivo como ID del documento previene duplicados si el archivo se sube de nuevo.
        doc_id = file_name.split('/')[-1]
        doc_ref = firestore_client.collection(FIRESTORE_COLLECTION).document(doc_id)
        
        # Agregar metadatos adicionales para trazabilidad.
        extracted_data['gcsUri'] = gcs_uri
        extracted_data['processedAt'] = firestore.SERVER_TIMESTAMP

        doc_ref.set(extracted_data, merge=True)
        print(f"Datos guardados en Firestore en el documento: {doc_id}")

    except Exception as e:
        print(f"Error al procesar con Gemini o guardar en Firestore: {e}")
        # Considera una estrategia de reintentos o mover a una carpeta de errores aquí.