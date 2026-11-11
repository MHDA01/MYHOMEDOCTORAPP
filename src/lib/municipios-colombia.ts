/**
 * Dónde vive la persona, para poder decirle a dónde ir y no solo a quién llamar.
 *
 * No es el registro oficial de municipios de Colombia (son más de mil): son las
 * 32 capitales de departamento, Bogotá, y los municipios grandes donde vive la
 * mayor parte de la gente que no está en una capital. La última opción es siempre
 * "Otro municipio", y elegirla no es un error: es una respuesta, y la pantalla de
 * urgencias se comporta distinto cuando no sabe la ciudad en vez de suponerla.
 *
 * Esto es geografía, no clínica: no hay aquí un solo texto que oriente a nadie.
 * La lista se usa para dos cosas y nada más: ordenar el directorio de urgencias
 * por ciudad y mostrar de dónde es cada integrante.
 */

export type Municipio = {
  /** Identificador estable que se guarda en la ficha. */
  id: string;
  nombre: string;
  departamento: string;
  /** Capital de departamento (o distrito capital). */
  capital: boolean;
};

/** El valor que se guarda cuando el municipio no está en la lista. */
export const MUNICIPIO_OTRO = 'otro';

export const MUNICIPIOS_COLOMBIA: readonly Municipio[] = [
  // Capitales de departamento y Bogotá
  { id: 'bogota', nombre: 'Bogotá D.C.', departamento: 'Bogotá D.C.', capital: true },
  { id: 'medellin', nombre: 'Medellín', departamento: 'Antioquia', capital: true },
  { id: 'cali', nombre: 'Cali', departamento: 'Valle del Cauca', capital: true },
  { id: 'barranquilla', nombre: 'Barranquilla', departamento: 'Atlántico', capital: true },
  { id: 'cartagena', nombre: 'Cartagena', departamento: 'Bolívar', capital: true },
  { id: 'cucuta', nombre: 'Cúcuta', departamento: 'Norte de Santander', capital: true },
  { id: 'bucaramanga', nombre: 'Bucaramanga', departamento: 'Santander', capital: true },
  { id: 'pereira', nombre: 'Pereira', departamento: 'Risaralda', capital: true },
  { id: 'santa-marta', nombre: 'Santa Marta', departamento: 'Magdalena', capital: true },
  { id: 'ibague', nombre: 'Ibagué', departamento: 'Tolima', capital: true },
  { id: 'villavicencio', nombre: 'Villavicencio', departamento: 'Meta', capital: true },
  { id: 'manizales', nombre: 'Manizales', departamento: 'Caldas', capital: true },
  { id: 'pasto', nombre: 'Pasto', departamento: 'Nariño', capital: true },
  { id: 'neiva', nombre: 'Neiva', departamento: 'Huila', capital: true },
  { id: 'armenia', nombre: 'Armenia', departamento: 'Quindío', capital: true },
  { id: 'monteria', nombre: 'Montería', departamento: 'Córdoba', capital: true },
  { id: 'sincelejo', nombre: 'Sincelejo', departamento: 'Sucre', capital: true },
  { id: 'valledupar', nombre: 'Valledupar', departamento: 'Cesar', capital: true },
  { id: 'popayan', nombre: 'Popayán', departamento: 'Cauca', capital: true },
  { id: 'tunja', nombre: 'Tunja', departamento: 'Boyacá', capital: true },
  { id: 'riohacha', nombre: 'Riohacha', departamento: 'La Guajira', capital: true },
  { id: 'quibdo', nombre: 'Quibdó', departamento: 'Chocó', capital: true },
  { id: 'florencia', nombre: 'Florencia', departamento: 'Caquetá', capital: true },
  { id: 'yopal', nombre: 'Yopal', departamento: 'Casanare', capital: true },
  { id: 'mocoa', nombre: 'Mocoa', departamento: 'Putumayo', capital: true },
  { id: 'arauca', nombre: 'Arauca', departamento: 'Arauca', capital: true },
  { id: 'leticia', nombre: 'Leticia', departamento: 'Amazonas', capital: true },
  { id: 'san-andres', nombre: 'San Andrés', departamento: 'San Andrés y Providencia', capital: true },
  { id: 'inirida', nombre: 'Inírida', departamento: 'Guainía', capital: true },
  { id: 'mitu', nombre: 'Mitú', departamento: 'Vaupés', capital: true },
  { id: 'puerto-carreno', nombre: 'Puerto Carreño', departamento: 'Vichada', capital: true },
  { id: 'san-jose-del-guaviare', nombre: 'San José del Guaviare', departamento: 'Guaviare', capital: true },

  // Municipios grandes que no son capital
  { id: 'soacha', nombre: 'Soacha', departamento: 'Cundinamarca', capital: false },
  { id: 'bello', nombre: 'Bello', departamento: 'Antioquia', capital: false },
  { id: 'itagui', nombre: 'Itagüí', departamento: 'Antioquia', capital: false },
  { id: 'envigado', nombre: 'Envigado', departamento: 'Antioquia', capital: false },
  { id: 'rionegro', nombre: 'Rionegro', departamento: 'Antioquia', capital: false },
  { id: 'apartado', nombre: 'Apartadó', departamento: 'Antioquia', capital: false },
  { id: 'turbo', nombre: 'Turbo', departamento: 'Antioquia', capital: false },
  { id: 'soledad', nombre: 'Soledad', departamento: 'Atlántico', capital: false },
  { id: 'malambo', nombre: 'Malambo', departamento: 'Atlántico', capital: false },
  { id: 'sabanalarga', nombre: 'Sabanalarga', departamento: 'Atlántico', capital: false },
  { id: 'magangue', nombre: 'Magangué', departamento: 'Bolívar', capital: false },
  { id: 'palmira', nombre: 'Palmira', departamento: 'Valle del Cauca', capital: false },
  { id: 'buenaventura', nombre: 'Buenaventura', departamento: 'Valle del Cauca', capital: false },
  { id: 'tulua', nombre: 'Tuluá', departamento: 'Valle del Cauca', capital: false },
  { id: 'cartago', nombre: 'Cartago', departamento: 'Valle del Cauca', capital: false },
  { id: 'buga', nombre: 'Guadalajara de Buga', departamento: 'Valle del Cauca', capital: false },
  { id: 'floridablanca', nombre: 'Floridablanca', departamento: 'Santander', capital: false },
  { id: 'giron', nombre: 'Girón', departamento: 'Santander', capital: false },
  { id: 'piedecuesta', nombre: 'Piedecuesta', departamento: 'Santander', capital: false },
  { id: 'barrancabermeja', nombre: 'Barrancabermeja', departamento: 'Santander', capital: false },
  { id: 'dosquebradas', nombre: 'Dosquebradas', departamento: 'Risaralda', capital: false },
  { id: 'zipaquira', nombre: 'Zipaquirá', departamento: 'Cundinamarca', capital: false },
  { id: 'facatativa', nombre: 'Facatativá', departamento: 'Cundinamarca', capital: false },
  { id: 'chia', nombre: 'Chía', departamento: 'Cundinamarca', capital: false },
  { id: 'fusagasuga', nombre: 'Fusagasugá', departamento: 'Cundinamarca', capital: false },
  { id: 'girardot', nombre: 'Girardot', departamento: 'Cundinamarca', capital: false },
  { id: 'sogamoso', nombre: 'Sogamoso', departamento: 'Boyacá', capital: false },
  { id: 'duitama', nombre: 'Duitama', departamento: 'Boyacá', capital: false },
  { id: 'maicao', nombre: 'Maicao', departamento: 'La Guajira', capital: false },
  { id: 'ipiales', nombre: 'Ipiales', departamento: 'Nariño', capital: false },
  { id: 'tumaco', nombre: 'Tumaco', departamento: 'Nariño', capital: false },
] as const;

export function municipioPorId(id: string | undefined): Municipio | null {
  if (!id) return null;
  return MUNICIPIOS_COLOMBIA.find((m) => m.id === id) ?? null;
}

/** Para el selector: capitales primero y el resto después, cada grupo alfabético. */
export function municipiosOrdenados(): readonly Municipio[] {
  const porNombre = (a: Municipio, b: Municipio) => a.nombre.localeCompare(b.nombre, 'es');
  return [
    ...MUNICIPIOS_COLOMBIA.filter((m) => m.capital).sort(porNombre),
    ...MUNICIPIOS_COLOMBIA.filter((m) => !m.capital).sort(porNombre),
  ];
}
