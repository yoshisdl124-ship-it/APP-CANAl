/**
 * EL CAUDALOSO - Core Hidráulico
 * Fórmulas fundamentales de hidráulica de canales abiertos: Manning, Froude,
 * geometrías regulares, Cowan, Horton-Einstein y métodos numéricos de raíz.
 */

import { CowanState, FlowRegime, FreeboardMode, GeometryResult, SectionType } from '../types/hydraulics';

export const G = 9.81;

// ======================================================================
// GEOMETRÍA DE SECCIONES REGULARES
// ======================================================================
export function geometria(
  tipo: SectionType,
  y: number,
  b = 0,
  z = 0,
  d = 0
): GeometryResult {
  let A = 0;
  let P = 0;
  let T = 0;

  if (y <= 0) {
    return { A: 0, P: 0, T: 0, R: 0, D: 0 };
  }

  switch (tipo) {
    case 'Trapezoidal': {
      A = (b + z * y) * y;
      P = b + 2 * y * Math.sqrt(1 + z * z);
      T = b + 2 * z * y;
      break;
    }
    case 'Rectangular': {
      A = b * y;
      P = b + 2 * y;
      T = b;
      break;
    }
    case 'Triangular': {
      A = z * y * y;
      P = 2 * y * Math.sqrt(1 + z * z);
      T = 2 * z * y;
      break;
    }
    case 'Circular': {
      const r = d / 2.0;
      const yEff = Math.min(y, d);
      const val = Math.max(-1.0, Math.min(1.0, 1.0 - yEff / r));
      const theta = 2.0 * Math.acos(val);
      A = (r * r / 2.0) * (theta - Math.sin(theta));
      P = r * theta;
      T = 2.0 * r * Math.sin(theta / 2.0);
      break;
    }
    case 'Parabólica': {
      // y = c*x^2 o T = b0 * sqrt(y/y0)
      // Usamos el ancho b en la base o ancho superior T_base a profundidad y_ref=1m,
      // interpretando 'b' como el ancho del espejo de agua a 1 metro de tirante (T = b * sqrt(y)):
      const bEff = b > 0 ? b : 2.0;
      T = bEff * Math.sqrt(y);
      A = (2.0 / 3.0) * T * y;
      // Aproximación analítica del perímetro mojado parabólico de Chow
      if (T > 0) {
        const valP = (4.0 * y) / T;
        if (valP <= 1) {
          P = T + (8.0 * y * y) / (3.0 * T);
        } else {
          P = (T / 2.0) * Math.sqrt(1 + valP * valP) + 
              ((T * T) / (8.0 * y)) * Math.log(valP + Math.sqrt(1 + valP * valP));
        }
      } else {
        P = 0;
      }
      break;
    }
    case 'Semicircular': {
      // Canal abierto semicircular de radio r = d / 2 (o b si no se especifica d)
      const r = d > 0 ? d / 2.0 : (b > 0 ? b / 2.0 : 1.0);
      const yEff = Math.min(y, r);
      const val = Math.max(-1.0, Math.min(1.0, 1.0 - yEff / r));
      const theta = 2.0 * Math.acos(val);
      A = (r * r / 2.0) * (theta - Math.sin(theta));
      P = r * theta;
      T = 2.0 * r * Math.sin(theta / 2.0);
      break;
    }
  }

  const R = P > 0 ? A / P : 0;
  const D = T > 0 ? A / T : 0;

  return { A, P, T, R, D };
}

// ======================================================================
// FÓRMULA DE MANNING & HIDRÁULICA
// ======================================================================
export function caudalManning(
  tipo: SectionType,
  y: number,
  b: number,
  z: number,
  d: number,
  S: number,
  n: number
): number {
  if (n <= 0 || S <= 0 || y <= 0) return 0;
  const { A, P } = geometria(tipo, y, b, z, d);
  if (A <= 0 || P <= 0) return 0;
  const R = A / P;
  return (1.0 / n) * A * Math.pow(R, 2 / 3) * Math.sqrt(S);
}

export function froude(V: number, A: number, T: number): number {
  const D = T > 0 ? A / T : 0;
  return D > 0 ? V / Math.sqrt(G * D) : 0;
}

export function clasificarRegimen(Fr: number): FlowRegime {
  if (Fr < 0.99) return 'Subcrítico';
  if (Fr > 1.01) return 'Supercrítico';
  return 'Crítico';
}

// ======================================================================
// MÉTODOS NUMÉRICOS DE BÚSQUEDA DE RAÍCES
// ======================================================================
export function biseccion(
  func: (x: number) => number,
  lo: number,
  hi: number,
  expandir = true,
  tol = 1e-8,
  maxIter = 350
): number {
  let flo = func(lo);
  let fhi = func(hi);

  let intentos = 0;
  while (flo * fhi > 0 && expandir && intentos < 12) {
    hi *= 2.0;
    fhi = func(hi);
    intentos++;
  }

  if (flo * fhi > 0) {
    throw new Error(
      'No se encontró una solución en el rango analizado con los datos proporcionados. Verifique que el caudal o las dimensiones sean físicamente admisibles.'
    );
  }

  for (let iter = 0; iter < maxIter; iter++) {
    const mid = (lo + hi) / 2.0;
    const fm = func(mid);
    if (Math.abs(fm) < tol || (hi - lo) < 1e-11) {
      return mid;
    }
    if (flo * fm < 0) {
      hi = mid;
      fhi = fm;
    } else {
      lo = mid;
      flo = fm;
    }
  }

  return (lo + hi) / 2.0;
}

export function primeraRaiz(
  func: (x: number) => number,
  lo: number,
  hi: number,
  pasos = 3000
): number {
  let a = lo;
  let fa = func(lo);

  for (let i = 1; i <= pasos; i++) {
    const c = lo + ((hi - lo) * i) / pasos;
    const fc = func(c);
    if (fa * fc <= 0) {
      return biseccion(func, a, c, false);
    }
    a = c;
    fa = fc;
  }

  throw new Error('No se encontró un tirante que conduzca ese caudal.');
}

// ======================================================================
// RUGOSIDAD DE COWAN
// ======================================================================
export interface CowanItem {
  nombre: string;
  lo: number;
  hi: number;
}

export const COWAN_DATA: Record<string, CowanItem[]> = {
  n0: [
    { nombre: 'Tierra', lo: 0.020, hi: 0.020 },
    { nombre: 'Roca cortada lisa', lo: 0.025, hi: 0.025 },
    { nombre: 'Grava fina', lo: 0.024, hi: 0.024 },
    { nombre: 'Grava gruesa / cantos', lo: 0.028, hi: 0.028 },
    { nombre: 'Concreto encofrado', lo: 0.014, hi: 0.016 },
  ],
  n1: [
    { nombre: 'Suave / Liso', lo: 0.000, hi: 0.000 },
    { nombre: 'Menor', lo: 0.005, hi: 0.005 },
    { nombre: 'Moderado', lo: 0.010, hi: 0.010 },
    { nombre: 'Severo', lo: 0.020, hi: 0.020 },
  ],
  n2: [
    { nombre: 'Gradual / Uniforme', lo: 0.000, hi: 0.000 },
    { nombre: 'Alternante ocasional', lo: 0.005, hi: 0.005 },
    { nombre: 'Alternante frecuente', lo: 0.010, hi: 0.015 },
  ],
  n3: [
    { nombre: 'Despreciable', lo: 0.000, hi: 0.000 },
    { nombre: 'Menor', lo: 0.010, hi: 0.015 },
    { nombre: 'Apreciable', lo: 0.020, hi: 0.030 },
    { nombre: 'Severo', lo: 0.040, hi: 0.060 },
  ],
  n4: [
    { nombre: 'Baja (pastos cortos)', lo: 0.005, hi: 0.010 },
    { nombre: 'Media (pastos altos y maleza)', lo: 0.010, hi: 0.025 },
    { nombre: 'Alta (arbustos densos)', lo: 0.025, hi: 0.050 },
    { nombre: 'Muy alta (bosque tupido)', lo: 0.050, hi: 0.100 },
  ],
  m5: [
    { nombre: 'Menor / Rectilíneo (1.00)', lo: 1.00, hi: 1.00 },
    { nombre: 'Apreciable (1.15)', lo: 1.15, hi: 1.15 },
    { nombre: 'Severa / Meandros (1.30)', lo: 1.30, hi: 1.30 },
  ],
};

export function calcularCowan(state: CowanState): number {
  let suma = 0.0;
  const t = Math.max(0, Math.min(1, state.t));

  for (const key of ['n0', 'n1', 'n2', 'n3', 'n4'] as const) {
    const list = COWAN_DATA[key];
    const item = list.find((it) => it.nombre === state[key]) || list[0];
    suma += item.lo + t * (item.hi - item.lo);
  }

  const m5List = COWAN_DATA.m5;
  const m5Item = m5List.find((it) => it.nombre === state.m5) || m5List[0];
  const m5 = m5Item.lo;

  return suma * m5;
}

// ======================================================================
// RUGOSIDADES COMPUESTAS EQUIVALENTES
// ======================================================================
/**
 * Horton-Einstein: asume igual velocidad media en todas las partes del perímetro
 */
export function nHorton(partes: { P: number; n: number }[]): number {
  const PTotal = partes.reduce((acc, p) => acc + p.P, 0);
  if (PTotal <= 0) return 0.015;
  const num = partes.reduce((acc, p) => acc + p.P * Math.pow(p.n, 1.5), 0);
  return Math.pow(num / PTotal, 2 / 3);
}

/**
 * Pavlovskij: asume igual fuerza tractiva
 */
export function nPavlovskij(partes: { P: number; n: number }[]): number {
  const PTotal = partes.reduce((acc, p) => acc + p.P, 0);
  if (PTotal <= 0) return 0.015;
  const num = partes.reduce((acc, p) => acc + p.P * p.n * p.n, 0);
  return Math.sqrt(num / PTotal);
}

/**
 * Lotter: igual suma de caudales
 */
export function nLotter(
  subsecciones: { A: number; P: number; R: number; n: number }[],
  ATotal: number,
  PTotal: number
): number {
  const RTotal = PTotal > 0 ? ATotal / PTotal : 0;
  const num = PTotal * Math.pow(RTotal, 5 / 3);
  const den = subsecciones.reduce((acc, s) => {
    if (s.n <= 0 || s.P <= 0 || s.R <= 0) return acc;
    return acc + (s.P * Math.pow(s.R, 5 / 3)) / s.n;
  }, 0);
  return den > 0 ? num / den : 0.015;
}

// ======================================================================
// BORDE LIBRE SEGÚN CRITERIOS DE PEDRO RODRÍGUEZ VILLÓN
// ======================================================================
export const BL_SOLERA_RANGOS = [
  { bMax: 0.8, bl: 0.4 },
  { bMax: 1.5, bl: 0.5 },
  { bMax: 3.0, bl: 0.6 },
  { bMax: 20.0, bl: 1.0 },
];

export function calcularBordeLibreVillon(
  modo: FreeboardMode,
  Q: number,
  b: number,
  y: number
): { bl: number; revestido: boolean | null } | null {
  if (modo === 'No incluir') return null;

  if (modo === 'Canal en tierra: y/3 (Villón)') {
    return { bl: y / 3.0, revestido: false };
  }
  if (modo === 'Canal revestido: y/5 (Villón)') {
    return { bl: y / 5.0, revestido: true };
  }
  if (modo === 'Según el caudal (Villón)') {
    return { bl: Q < 0.5 ? 0.3 : 0.4, revestido: null };
  }
  if (modo === 'Según el ancho de solera (Villón)') {
    if (b <= 0) {
      throw new Error(
        'El criterio por ancho de solera requiere b > 0. Elija otro criterio para secciones sin solera.'
      );
    }
    for (const r of BL_SOLERA_RANGOS) {
      if (b <= r.bMax) {
        return { bl: r.bl, revestido: null };
      }
    }
    return { bl: 1.0, revestido: null };
  }

  return null;
}
