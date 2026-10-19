/**
 * EL CAUDALOSO - Hidráulica de Canales Abiertos
 * Tipos de datos para hidráulica de canales, cálculo inverso y secciones compuestas.
 */

export type SectionType = 
  | 'Trapezoidal' 
  | 'Rectangular' 
  | 'Triangular' 
  | 'Circular' 
  | 'Parabólica' 
  | 'Semicircular';

export type FlowRegime = 'Subcrítico' | 'Crítico' | 'Supercrítico';

export type RoughnessMode = 'Valor único' | 'Cowan' | 'Compuesta (Horton-Einstein)';

export type FreeboardMode = 
  | 'No incluir'
  | 'Canal en tierra: y/3 (Villón)'
  | 'Canal revestido: y/5 (Villón)'
  | 'Según el caudal (Villón)'
  | 'Según el ancho de solera (Villón)';

export interface CowanState {
  n0: string;
  n1: string;
  n2: string;
  n3: string;
  n4: string;
  m5: string;
  t: number; // 0 a 1
}

export interface GeometryResult {
  A: number; // Área hidráulica (m²)
  P: number; // Perímetro mojado (m)
  T: number; // Espejo de agua (m)
  R: number; // Radio hidráulico (m)
  D: number; // Profundidad hidráulica A/T (m)
}

export interface HydraulicResult {
  Q: number; // Caudal (m³/s)
  V: number; // Velocidad media (m/s)
  A: number; // Área (m²)
  P: number; // Perímetro mojado (m)
  R: number; // Radio hidráulico (m)
  T: number; // Espejo de agua (m)
  Fr: number; // Número de Froude
  regimen: FlowRegime;
  E?: number; // Energía específica (m)
  S?: number; // Pendiente (m/m)
  n?: number; // Coeficiente de Manning
  y?: number; // Tirante (m)
  bl?: number; // Borde libre (m)
  H_total?: number; // Altura total canal = y + bl (m)
  revestido?: boolean | null;
}

// -------------------------------------------------------------
// Tipos para Cálculo Inverso Multisección
// -------------------------------------------------------------
export type InverseUnknown = 
  | 'S'       // Pendiente S
  | 'n'       // Rugosidad n
  | 'b'       // Ancho de solera b (Trapezoidal, Rectangular)
  | 'z'       // Talud lateral z (Trapezoidal, Triangular)
  | 'd'       // Diámetro D (Circular, Semicircular)
  | 'y';      // Tirante y (Cualquier sección)

export interface InverseInputParams {
  tipo: SectionType;
  incognita: InverseUnknown;
  Q: number;
  y: number;
  S: number;
  n: number;
  b: number;
  z: number;
  d: number;
  rugMode: RoughnessMode;
  nf?: number;
  ni?: number;
  nd?: number;
  blMode: FreeboardMode;
}

export type CompoundMode = 
  | 'clasica_asimetrica'  // Canal central + planicies izquierda y derecha con cotas y taludes independientes
  | 'multi_terrazas'      // Canal central + múltiples bermas/terrazas escalonadas
  | 'constructor_libre';  // Constructor libre ingresando distancias y taludes tramo a tramo

export type SegmentDirection = 'bajada' | 'horizontal' | 'subida';

export interface CompoundSegment {
  id: string;
  nombre: string;
  distanciaX: number; // Distancia horizontal delta X (m)
  taludZ: number;     // Talud lateral Z (H:V)
  direccion: SegmentDirection; // 'bajada' | 'horizontal' | 'subida'
  n: number;          // Coeficiente de rugosidad de Manning
}

export interface CompoundTerrace {
  id: string;
  nombre: string;
  lado: 'izq' | 'der';
  cotaPiso: number; // Altura desde el fondo del canal principal donde empieza esta planicie (m)
  ancho: number;    // Ancho de la berma/planicie (m)
  taludExterior: number; // Talud exterior z (H:V)
  n: number;        // Rugosidad de Manning
}

export interface CompoundSubsection {
  id: string;
  nombre: string;
  xInicio: number;
  xFin: number;
  cotaFondo: number;
  tipo: 'Canal Central' | 'Planicie Izquierda' | 'Planicie Derecha' | 'Berma / Terraza';
  A: number;
  P: number;
  R: number;
  T: number;
  n: number;
  K: number; // Transporte = 1/n * A * R^(2/3)
  Q: number;
  V: number;
  porcentajeQ: number;
  activa: boolean; // Si el agua alcanza esta sección
}

export interface CompoundCalculationResult {
  modo: CompoundMode;
  target: 'Q' | 'y'; // Si se calculó Q dado y, o y dado Q
  yTotal: number;
  QTotal: number;
  ATotal: number;
  PTotal: number;
  RTotal: number;
  TTotal: number;
  VMedia: number;
  FrGlobal: number;
  regimen: FlowRegime;
  nEquivalenteHorton: number;
  nEquivalenteLotter: number;
  subsecciones: CompoundSubsection[];
  advertencias: string[];
}

// -------------------------------------------------------------
// Historial de cálculos
// -------------------------------------------------------------
export interface HistoryRecord {
  id: string;
  timestamp: string;
  modulo: string;
  titulo: string;
  resumen: string;
  datosEntrada: Record<string, any>;
  resultados: Record<string, any>;
}
