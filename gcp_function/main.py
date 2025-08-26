import functions_framework
from google.cloud import storage
from google.cloud import firestore
from google.cloud import vision
import vertexai
from vertexai.generative_models import GenerativeModel
import json
import mimetypes

# Inicializar clientes
storage_client = storage.Client()
db = firestore.Client()

# Inicializar Vertex AI
vertexai.init(project="myhomedoctorapp", location="us-central1")
model = GenerativeModel("gemini-pro")

vision_client = vision.ImageAnnotatorClient()

def extract_text_from_image(image_content):
    """Extrae texto de una imagen usando Cloud Vision API."""
    image = vision.Image(content=image_content)
    response = vision_client.text_detection(image=image)
    if response.error.message:
        raise Exception(
            '{}\nFor more info on error messages, check: '
            'https://cloud.google.com/apis/design/errors'.format(
                response.error.message))
    return response.text_annotations[0].description if response.text_annotations else ""

def process_document(content, content_type):
    """Procesa el contenido del documento usando Vision API y Vertex AI."""
    # Si es una imagen, primero extraer el texto
    if content_type.startswith('image/'):
        content = extract_text_from_image(content)
    elif not content_type.startswith('text/'):
        return {
            "error": f"Tipo de archivo no soportado: {content_type}",
            "raw_response": None
        }

    prompt = """Analiza este documento médico y extrae la siguiente información en formato JSON:
    - Diagnóstico principal
    - Medicamentos recetados
    - Recomendaciones
    - Próxima cita
    Si algún campo no está presente, déjalo como null.
    Si el texto no parece ser un documento médico, indica 'No es un documento médico válido' en el campo de error."""
    
    response = model.generate_content(prompt + "\n\nDocumento:\n" + content)
    try:
        return json.loads(response.text)
    except:
        return {
            "error": "No se pudo procesar el documento correctamente",
            "raw_response": response.text
        }
import vertexai
import json
from vertexai.generative_models import GenerativeModel, Part
from google.cloud import storage, firestore

# --- Configuración del Proyecto ---
PROJECT_ID = "myhomedoctorapp"
LOCATION = "us-central1"
BUCKET_NAME = "myhomedoctorapp-bucket-20250820"
FIRESTORE_COLLECTION = "medical_documents" # Colección para documentos médicos procesados

# --- Inicialización de Clientes (se reutilizan entre invocaciones) ---
vertexai.init(project=PROJECT_ID, location=LOCATION)
firestore_client = firestore.Client()

# Carga el modelo multimodal de Gemini
multimodal_model = GenerativeModel("gemini-1.0-pro-vision")

@functions_framework.cloud_event
def process_medical_document(cloud_event):
    """
    Cloud Function que se activa por la subida de un archivo a Cloud Storage,
    analiza el documento con Gemini y guarda el resultado en Firestore.
    """
    data = cloud_event.data
    bucket_name = data["bucket"]
    file_name = data["name"]
    content_type = data["contentType"]

    # 1. Filtrar para procesar solo archivos en la carpeta "documentos medicos/"
    if not file_name.startswith("documentos medicos/"):
        print(f"Archivo '{file_name}' ignorado por no estar en la carpeta 'documentos medicos/'.")
        return

    # Evitar procesar la carpeta misma si se crea
    if file_name.endswith('/'):
        print(f"Ignorando objeto de carpeta: {file_name}")
        return

    print(f"Procesando archivo: {file_name} del bucket: {bucket_name}")

    # 2. Preparar el contenido del archivo para Gemini
    # Gemini necesita el contenido del archivo como bytes y su tipo MIME.
    gcs_uri = f"gs://{bucket_name}/{file_name}"
    storage_client = storage.Client()
    bucket = storage_client.bucket(bucket_name)
    blob = bucket.blob(file_name)
    
    try:
        file_bytes = blob.download_as_bytes()
        document_part = Part.from_data(data=file_bytes, mime_type=content_type)
    except Exception as e:
        print(f"Error al descargar el archivo {file_name}: {e}")
        return

    # 3. Construir el Prompt para Gemini (Few-Shot Prompting)
    # Este prompt guía a Gemini para que extraiga la información y la devuelva en el formato JSON deseado.
    prompt = f"""
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
    """

    # 4. Enviar la solicitud a la API de Gemini
    try:
        print("Enviando solicitud a la API de Gemini...")
        response = multimodal_model.generate_content([document_part, prompt])
        
        # Extraer y limpiar la respuesta JSON
        json_response_text = response.text.strip().replace("```json", "").replace("```", "").strip()
        extracted_data = json.loads(json_response_text)
        
        print("Datos extraídos exitosamente:")
        print(json.dumps(extracted_data, indent=2))

        # 5. Guardar el resultado en Firestore
        # Usamos el nombre del archivo (sin la ruta) como ID del documento en Firestore para evitar duplicados.
        doc_id = file_name.split('/')[-1]
        doc_ref = firestore_client.collection(FIRESTORE_COLLECTION).document(doc_id)
        doc_ref.set(extracted_data)
        print(f"Datos guardados en Firestore en el documento: {doc_id}")

    except Exception as e:
        print(f"Error al procesar con Gemini o guardar en Firestore: {e}")
        # Opcional: Mover el archivo a una carpeta de 'errores' en el bucket
        # error_blob = bucket.copy_blob(blob, bucket, f"errores/{file_name.split('/')[-1]}")
        # blob.delete()
