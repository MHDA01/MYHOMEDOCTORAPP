/** Tipos compartidos del agente de protocolos. */

export interface Motivo {
  id: string;
  motivo: string;
  curso_de_vida: string;
  edad: string;
  fuentes: string[];
}

/** Una recomendación calificada del inventario de una guía (inventario.py). */
export interface Recomendacion {
  rec_id: string;
  pagina: number;
  calificacion: string;
  texto: string;
}

/** De dónde sale el texto de las guías: Cloud Storage en producción, disco en la prueba de paridad. */
export interface Biblioteca {
  paginas(fuenteId: string): Promise<string[]>;
  inventario(fuenteId: string): Promise<Recomendacion[]>;
}
