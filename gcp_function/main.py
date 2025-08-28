# gcp_function/main.py
# Lógica unificada del backend en Python

import functions_framework
import vertexai
import json
from vertexai.generative_models import GenerativeModel, Part
from google.cloud import storage, firestore

# --- Configuración del Proyecto ---
PROJECT_ID = "myhomedoctorapp"
LOCATION = "us-central1"
BUCKET_NAME = "myhomedoctorapp-bucket-20250820"

# --- Inicialización de Clientes (reutilizados para todas las funciones) ---
vertexai.init(project=PROJECT_ID, location=LOCATION)
firestore_client = firestore.Client()
storage_client = storage.Client()
multimodal_model = GenerativeModel("gemini-1.0-pro-vision")

# --- Función #1: Procesamiento de Documentos Médicos ---
@functions_framework.cloud_event
def process_medical_document(cloud_event):
    """
    Se activa por la subida de un archivo a Cloud Storage,
    analiza el documento con Gemini y guarda el resultado en Firestore.
    """
    data = cloud_event.data
    bucket_name = data.get("bucket")
    file_name = data.get("name")
    content_type = data.get("contentType")

    if not all([bucket_name, file_name, content_type]):
        print("Error: Evento de Cloud Storage incompleto.")
        return

    if not file_name.startswith("documentos medicos/"):
        print(f"Archivo '{file_name}' ignorado.")
        return

    if file_name.endswith('/'):
        print(f"Ignorando objeto de carpeta: {file_name}")
        return

    print(f"Procesando archivo: {file_name}")
    bucket = storage_client.bucket(bucket_name)
    blob = bucket.blob(file_name)
    
    try:
        file_bytes = blob.download_as_bytes(timeout=60)
        document_part = Part.from_data(data=file_bytes, mime_type=content_type)
    except Exception as e:
        print(f"Error al descargar el archivo {file_name}: {e}")
        return

    prompt = f'''
    Analiza el siguiente documento médico ({content_type}) y extrae la información clave en formato JSON.
    El JSON debe contener: fileName, studyDate (YYYY-MM-DD), studyName, resultsType ('lab_values' o 'conclusions'), y data.
    Ejemplo para un informe de laboratorio:
    {{
      "fileName": "laboratorio.pdf", "studyDate": "2025-08-15", "studyName": "Perfil Lipídico",
      "resultsType": "lab_values", "data": {{"Colesterol Total": "210 mg/dL"}}
    }}
    Ejemplo para un informe de imagenología:
    {{
      "fileName": "rx_torax.jpg", "studyDate": "2025-08-18", "studyName": "Radiografía de Tórax",
      "resultsType": "conclusions", "data": "No se observan consolidaciones."
    }}
    Ahora, analiza el documento y genera únicamente el JSON. El nombre del archivo es: {file_name.split('/')[-1]}
    '''

    try:
        print("Enviando solicitud a Gemini API...")
        response = multimodal_model.generate_content([document_part, prompt])
        json_response_text = response.text.strip().replace("```json", "").replace("```", "").strip()
        extracted_data = json.loads(json_response_text)
        
        print(f"Datos extraídos: {json.dumps(extracted_data, indent=2)}")

        doc_id = file_name.split('/')[-1]
        doc_ref = firestore_client.collection("medical_documents").document(doc_id)
        
        extracted_data['gcsUri'] = f"gs://{bucket_name}/{file_name}"
        extracted_data['processedAt'] = firestore.SERVER_TIMESTAMP

        doc_ref.set(extracted_data, merge=True)
        print(f"Datos guardados en Firestore: {doc_id}")

    except Exception as e:
        print(f"Error al procesar con Gemini o guardar en Firestore: {e}")


# --- Función #2: Creación de Recursos para Nuevos Usuarios ---
@functions_framework.cloud_event
def on_user_create(cloud_event):
    """
    Se activa al crear un nuevo usuario en Firebase Authentication y prepara
    su estructura inicial en Firestore y Cloud Storage.
    """
    user_data = cloud_event.data.get('metadata', {})
    user_id = cloud_event.data.get('uid')
    email = cloud_event.data.get('email')

    if not user_id:
        print("Error: No se encontró el UID en el evento de creación de usuario.")
        return

    print(f"Creando recursos para el nuevo usuario: {user_id} ({email})")

    # 1. Inicializar estructura en Firestore
    try:
        user_doc_ref = firestore_client.collection('users').document(user_id)
        user_doc_ref.set({
            'email': email,
            'createdAt': firestore.SERVER_TIMESTAMP,
            'personalInfo': {},
            'healthInfo': {},
        }, merge=True)
        print(f"Documento de usuario creado en Firestore para {user_id}")
    except Exception as e:
        print(f"Error al crear documento en Firestore para {user_id}: {e}")
        return # Detener si falla Firestore

    # 2. Crear carpeta placeholder en Cloud Storage
    try:
        bucket = storage_client.bucket(BUCKET_NAME)
        folder_path = f"documentos medicos/{user_id}/.placeholder"
        blob = bucket.blob(folder_path)
        blob.upload_from_string('', content_type='application/x-empty')
        print(f"Carpeta creada en Cloud Storage para {user_id}")
    except Exception as e:
        print(f"Error al crear carpeta en Cloud Storage para {user_id}: {e}")

    print(f"Recursos creados exitosamente para el usuario {user_id}")
