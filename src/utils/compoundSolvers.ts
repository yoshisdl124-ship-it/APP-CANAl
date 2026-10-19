/**
 * EL CAUDALOSO - Constructor Universal de Secciones Compuestas
 * Soporta:
 * 1. Sección Compuesta Asimétrica (cotas de desborde hi, hd y taludes zi, zd independientes)
 * 2. Multi-Terrazas / Bermas Escalonadas (múltiples niveles de inundación a distintas alturas)
 * 3. Constructor Modular Libre de Subsecciones (con partición vertical ficticia sin fricción)
 * Cálculo directo de Q(y) y cálculo inverso de y(Q).
 */

import { CompoundCalculationResult, CompoundMode, CompoundSubsection, CompoundTerrace, CompoundSegment, SectionType } from '../types/hydraulics';
import { clasificarRegimen, froude, G, geometria, nHorton, nLotter, primeraRaiz } from './hydraulicsCore';

export interface ClassicCompoundParams {
  tipoCanal: SectionType; // Trapezoidal, Rectangular, Triangular, Semicircular
  b: number; // Ancho de solera canal principal (m)
  z: number; // Talud lateral canal principal (H:V)
  h_izq: number; // Profundidad/cota de desborde margen izquierda (m)
  h_der: number; // Profundidad/cota de desborde margen derecha (m)
  Bi: number; // Ancho de planicie izquierda (m)
  Bd: number; // Ancho de planicie derecha (m)
  zi_ext: number; // Talud exterior margen izquierda (H:V)
  zd_ext: number; // Talud exterior margen derecha (H:V)
  nc: number; // Rugosidad del canal principal
  ni: number; // Rugosidad de planicie izquierda
  nd: number; // Rugosidad de planicie derecha
  S: number;  // Pendiente longitudinal (m/m)
}

export interface MultiTerraceParams {
  tipoCanal: SectionType;
  b: number;
  z: number;
  h_canal: number;
  nc: number;
  terrazas: CompoundTerrace[];
  S: number;
}

export interface CustomStationElevationPoint {
  x: number;
  y: number;
  n: number;
}

// -------------------------------------------------------------
// EVALUACIÓN DE SECCIÓN COMPUESTA ASIMÉTRICA
// -------------------------------------------------------------
export function evaluarCompuestaAsimetrica(
  params: ClassicCompoundParams,
  y: number
): {
  QTotal: number;
  subsecciones: CompoundSubsection[];
  ATotal: number;
  PTotal: number;
  TTotal: number;
} {
  const { tipoCanal, b, z, h_izq, h_der, Bi, Bd, zi_ext, zd_ext, nc, ni, nd, S } = params;
  const raizS = Math.sqrt(S);

  // 1. Canal principal
  // Hasta el nivel mínimo de desborde h_min
  const h_min = Math.min(h_izq, h_der);
  const h_max = Math.max(h_izq, h_der);

  let A_canal = 0;
  let P_canal = 0;
  let T_canal = 0;

  if (y <= h_min) {
    const geo = geometria(tipoCanal, y, b, z, 2 * h_min);
    A_canal = geo.A;
    P_canal = geo.P;
    T_canal = geo.T;
  } else {
    // Si sobrepasa h_min, el canal principal lleva agua vertical hacia arriba sobre su ancho en h
    // Geometría en h_min:
    const geoH = geometria(tipoCanal, h_min, b, z, 2 * h_min);
    const ySobre = y - h_min;
    // Ancho del espejo en h_min
    const Th = geoH.T;
    A_canal = geoH.A + Th * ySobre;
    P_canal = geoH.P; // Las interfaces verticales NO suman perímetro mojado según la práctica estándar
    T_canal = Th;
  }

  const R_canal = P_canal > 0 ? A_canal / P_canal : 0;
  const K_canal = nc > 0 ? (1.0 / nc) * A_canal * Math.pow(R_canal, 2 / 3) : 0;
  const Q_canal = K_canal * raizS;

  const subs: CompoundSubsection[] = [
    {
      id: 'canal_principal',
      nombre: 'Canal Principal',
      xInicio: -b / 2,
      xFin: b / 2,
      cotaFondo: 0,
      tipo: 'Canal Central',
      A: A_canal,
      P: P_canal,
      R: R_canal,
      T: T_canal,
      n: nc,
      K: K_canal,
      Q: Q_canal,
      V: A_canal > 0 ? Q_canal / A_canal : 0,
      porcentajeQ: 0,
      activa: true
    }
  ];

  // 2. Planicie Izquierda
  if (y > h_izq && Bi > 0) {
    const y_pi = y - h_izq;
    const ki = Math.sqrt(1 + zi_ext * zi_ext);
    // Área trapezoidal sobre la planicie
    const A_pi = Bi * y_pi + (zi_ext * y_pi * y_pi) / 2.0;
    const P_pi = Bi + y_pi * ki;
    const T_pi = Bi + zi_ext * y_pi;
    const R_pi = P_pi > 0 ? A_pi / P_pi : 0;
    const K_pi = ni > 0 ? (1.0 / ni) * A_pi * Math.pow(R_pi, 2 / 3) : 0;
    const Q_pi = K_pi * raizS;

    subs.push({
      id: 'planicie_izq',
      nombre: `Planicie Izq. (cota +${h_izq.toFixed(2)}m)`,
      xInicio: -(b / 2 + z * h_izq + Bi),
      xFin: -(b / 2 + z * h_izq),
      cotaFondo: h_izq,
      tipo: 'Planicie Izquierda',
      A: A_pi,
      P: P_pi,
      R: R_pi,
      T: T_pi,
      n: ni,
      K: K_pi,
      Q: Q_pi,
      V: A_pi > 0 ? Q_pi / A_pi : 0,
      porcentajeQ: 0,
      activa: true
    });
  }

  // 3. Planicie Derecha
  if (y > h_der && Bd > 0) {
    const y_pd = y - h_der;
    const kd = Math.sqrt(1 + zd_ext * zd_ext);
    const A_pd = Bd * y_pd + (zd_ext * y_pd * y_pd) / 2.0;
    const P_pd = Bd + y_pd * kd;
    const T_pd = Bd + zd_ext * y_pd;
    const R_pd = P_pd > 0 ? A_pd / P_pd : 0;
    const K_pd = nd > 0 ? (1.0 / nd) * A_pd * Math.pow(R_pd, 2 / 3) : 0;
    const Q_pd = K_pd * raizS;

    subs.push({
      id: 'planicie_der',
      nombre: `Planicie Der. (cota +${h_der.toFixed(2)}m)`,
      xInicio: b / 2 + z * h_der,
      xFin: b / 2 + z * h_der + Bd,
      cotaFondo: h_der,
      tipo: 'Planicie Derecha',
      A: A_pd,
      P: P_pd,
      R: R_pd,
      T: T_pd,
      n: nd,
      K: K_pd,
      Q: Q_pd,
      V: A_pd > 0 ? Q_pd / A_pd : 0,
      porcentajeQ: 0,
      activa: true
    });
  }

  const ATotal = subs.reduce((acc, s) => acc + s.A, 0);
  const PTotal = subs.reduce((acc, s) => acc + s.P, 0);
  const TTotal = subs.reduce((acc, s) => acc + s.T, 0);
  const QTotal = subs.reduce((acc, s) => acc + s.Q, 0);

  // Asignar porcentajes
  subs.forEach((s) => {
    s.porcentajeQ = QTotal > 0 ? (s.Q / QTotal) * 100 : 0;
  });

  return { QTotal, subsecciones: subs, ATotal, PTotal, TTotal };
}

// -------------------------------------------------------------
// EVALUACIÓN DE SECCIÓN MULTI-TERRAZAS / BERMAS ESCALONADAS
// -------------------------------------------------------------
export function evaluarMultiTerrazas(
  params: MultiTerraceParams,
  y: number
): {
  QTotal: number;
  subsecciones: CompoundSubsection[];
  ATotal: number;
  PTotal: number;
  TTotal: number;
} {
  const { tipoCanal, b, z, h_canal, nc, terrazas, S } = params;
  const raizS = Math.sqrt(S);

  // 1. Canal principal
  let A_canal = 0;
  let P_canal = 0;
  let T_canal = 0;

  if (y <= h_canal) {
    const geo = geometria(tipoCanal, y, b, z, 2 * h_canal);
    A_canal = geo.A;
    P_canal = geo.P;
    T_canal = geo.T;
  } else {
    const geoH = geometria(tipoCanal, h_canal, b, z, 2 * h_canal);
    const ySobre = y - h_canal;
    A_canal = geoH.A + geoH.T * ySobre;
    P_canal = geoH.P;
    T_canal = geoH.T;
  }

  const R_canal = P_canal > 0 ? A_canal / P_canal : 0;
  const K_canal = nc > 0 ? (1.0 / nc) * A_canal * Math.pow(R_canal, 2 / 3) : 0;
  const Q_canal = K_canal * raizS;

  const subs: CompoundSubsection[] = [
    {
      id: 'canal_principal',
      nombre: 'Canal Principal',
      xInicio: -b / 2,
      xFin: b / 2,
      cotaFondo: 0,
      tipo: 'Canal Central',
      A: A_canal,
      P: P_canal,
      R: R_canal,
      T: T_canal,
      n: nc,
      K: K_canal,
      Q: Q_canal,
      V: A_canal > 0 ? Q_canal / A_canal : 0,
      porcentajeQ: 0,
      activa: true
    }
  ];

  // 2. Terrazas ordenadas
  for (const t of terrazas) {
    if (y > t.cotaPiso && t.ancho > 0) {
      const y_t = y - t.cotaPiso;
      const k = Math.sqrt(1 + t.taludExterior * t.taludExterior);
      const A_t = t.ancho * y_t + (t.taludExterior * y_t * y_t) / 2.0;
      const P_t = t.ancho + y_t * k;
      const T_t = t.ancho + t.taludExterior * y_t;
      const R_t = P_t > 0 ? A_t / P_t : 0;
      const K_t = t.n > 0 ? (1.0 / t.n) * A_t * Math.pow(R_t, 2 / 3) : 0;
      const Q_t = K_t * raizS;

      subs.push({
        id: t.id,
        nombre: `${t.nombre} (+${t.cotaPiso.toFixed(2)}m)`,
        xInicio: 0,
        xFin: 0,
        cotaFondo: t.cotaPiso,
        tipo: 'Berma / Terraza',
        A: A_t,
        P: P_t,
        R: R_t,
        T: T_t,
        n: t.n,
        K: K_t,
        Q: Q_t,
        V: A_t > 0 ? Q_t / A_t : 0,
        porcentajeQ: 0,
        activa: true
      });
    }
  }

  const ATotal = subs.reduce((acc, s) => acc + s.A, 0);
  const PTotal = subs.reduce((acc, s) => acc + s.P, 0);
  const TTotal = subs.reduce((acc, s) => acc + s.T, 0);
  const QTotal = subs.reduce((acc, s) => acc + s.Q, 0);

  subs.forEach((s) => {
    s.porcentajeQ = QTotal > 0 ? (s.Q / QTotal) * 100 : 0;
  });

  return { QTotal, subsecciones: subs, ATotal, PTotal, TTotal };
}

// -------------------------------------------------------------
// EVALUACIÓN DE SECCIÓN LIBRE POR TRAMOS (DISTANCIAS Y TALUDES)
// -------------------------------------------------------------
export interface PolylinePoint {
  x: number;
  y: number;
}

export function convertirTramosACoordenadas(tramos: CompoundSegment[]): {
  puntos: PolylinePoint[];
  tramosConExtremos: Array<CompoundSegment & { pInicio: PolylinePoint; pFin: PolylinePoint }>;
  yMin: number;
  yMax: number;
  xMin: number;
  xMax: number;
} {
  if (!tramos || tramos.length === 0) {
    return {
      puntos: [{ x: 0, y: 0 }],
      tramosConExtremos: [],
      yMin: 0,
      yMax: 0,
      xMin: 0,
      xMax: 0
    };
  }

  const rawPoints: PolylinePoint[] = [{ x: 0, y: 0 }];
  const tramosRaw: Array<CompoundSegment & { pInicio: PolylinePoint; pFin: PolylinePoint }> = [];

  let curX = 0;
  let curY = 0;

  for (const seg of tramos) {
    const pIni = { x: curX, y: curY };
    const dx = Math.max(0, seg.distanciaX);
    let dy = 0;

    if (seg.direccion === 'horizontal') {
      dy = 0;
    } else if (seg.direccion === 'bajada') {
      dy = seg.taludZ > 0 ? -(dx / seg.taludZ) : -dx;
    } else if (seg.direccion === 'subida') {
      dy = seg.taludZ > 0 ? (dx / seg.taludZ) : dx;
    }

    curX += dx;
    curY += dy;
    const pFin = { x: curX, y: curY };

    rawPoints.push(pFin);
    tramosRaw.push({ ...seg, pInicio: pIni, pFin });
  }

  // Normalizar para que la cota mínima de fondo sea Y = 0
  let minY = Infinity;
  let maxY = -Infinity;
  let minX = Infinity;
  let maxX = -Infinity;

  for (const p of rawPoints) {
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
  }

  const puntosNorm = rawPoints.map(p => ({ x: p.x, y: p.y - minY }));
  const tramosNorm = tramosRaw.map(t => ({
    ...t,
    pInicio: { x: t.pInicio.x, y: t.pInicio.y - minY },
    pFin: { x: t.pFin.x, y: t.pFin.y - minY }
  }));

  return {
    puntos: puntosNorm,
    tramosConExtremos: tramosNorm,
    yMin: 0,
    yMax: maxY - minY,
    xMin: minX,
    xMax: maxX
  };
}

export function evaluarTramosLibres(
  tramos: CompoundSegment[],
  S: number,
  y: number
): {
  QTotal: number;
  subsecciones: CompoundSubsection[];
  ATotal: number;
  PTotal: number;
  TTotal: number;
} {
  const raizS = Math.sqrt(Math.max(1e-6, S));
  const { tramosConExtremos } = convertirTramosACoordenadas(tramos);

  const subs: CompoundSubsection[] = [];

  for (let i = 0; i < tramosConExtremos.length; i++) {
    const t = tramosConExtremos[i];
    const { pInicio, pFin, n } = t;

    const x1 = pInicio.x;
    const y1 = pInicio.y;
    const x2 = pFin.x;
    const y2 = pFin.y;

    const dx = Math.abs(x2 - x1);
    let A_seg = 0;
    let P_seg = 0;
    let T_seg = 0;

    // Caso 1: Todo el tramo está por encima del agua
    if (y1 >= y && y2 >= y) {
      A_seg = 0;
      P_seg = 0;
      T_seg = 0;
    }
    // Caso 2: Todo el tramo está sumergido
    else if (y1 <= y && y2 <= y) {
      const d1 = y - y1;
      const d2 = y - y2;
      A_seg = ((d1 + d2) / 2) * dx;
      P_seg = Math.sqrt(dx * dx + (y2 - y1) * (y2 - y1));
      T_seg = dx;
    }
    // Caso 3: El tramo cruza la superficie del agua
    else {
      // Intersección con el nivel de agua
      const fraction = (y - y1) / (y2 - y1);
      const xInt = x1 + fraction * (x2 - x1);

      if (y1 < y && y2 >= y) {
        // Parte izquierda sumergida
        const subDx = Math.abs(xInt - x1);
        const subDy = y - y1;
        A_seg = (subDy / 2) * subDx;
        P_seg = Math.sqrt(subDx * subDx + subDy * subDy);
        T_seg = subDx;
      } else {
        // Parte derecha sumergida
        const subDx = Math.abs(x2 - xInt);
        const subDy = y - y2;
        A_seg = (subDy / 2) * subDx;
        P_seg = Math.sqrt(subDx * subDx + subDy * subDy);
        T_seg = subDx;
      }
    }

    const R_seg = P_seg > 0 ? A_seg / P_seg : 0;
    const nSeg = n > 0 ? n : 0.025;
    const K_seg = nSeg > 0 && A_seg > 0 ? (1.0 / nSeg) * A_seg * Math.pow(R_seg, 2 / 3) : 0;
    const Q_seg = K_seg * raizS;
    const V_seg = A_seg > 0 ? Q_seg / A_seg : 0;

    subs.push({
      id: t.id,
      nombre: t.nombre || `Tramo ${i + 1}`,
      xInicio: Math.min(x1, x2),
      xFin: Math.max(x1, x2),
      cotaFondo: Math.min(y1, y2),
      tipo: 'Berma / Terraza',
      A: A_seg,
      P: P_seg,
      R: R_seg,
      T: T_seg,
      n: nSeg,
      K: K_seg,
      Q: Q_seg,
      V: V_seg,
      porcentajeQ: 0,
      activa: A_seg > 0
    });
  }

  const ATotal = subs.reduce((acc, s) => acc + s.A, 0);
  const PTotal = subs.reduce((acc, s) => acc + s.P, 0);
  const TTotal = subs.reduce((acc, s) => acc + s.T, 0);
  const QTotal = subs.reduce((acc, s) => acc + s.Q, 0);

  subs.forEach((s) => {
    s.porcentajeQ = QTotal > 0 ? (s.Q / QTotal) * 100 : 0;
  });

  return { QTotal, subsecciones: subs, ATotal, PTotal, TTotal };
}

// -------------------------------------------------------------
// CONTROLADOR MAESTRO DE CÁLCULO DE SECCIÓN COMPUESTA
// -------------------------------------------------------------
export function calcularSeccionCompuesta(
  modo: CompoundMode,
  target: 'Q' | 'y',
  valorTarget: number, // Q si target === 'y', o y si target === 'Q'
  paramsAsimetrica?: ClassicCompoundParams,
  paramsMulti?: MultiTerraceParams,
  paramsTramos?: { tramos: CompoundSegment[]; S: number }
): CompoundCalculationResult {
  let yFinal = 0;
  let QFinal = 0;
  let subsFinal: CompoundSubsection[] = [];
  let AFinal = 0;
  let PFinal = 0;
  let TFinal = 0;

  const advertencias: string[] = [];

  const evaluar = (curY: number) => {
    if (modo === 'clasica_asimetrica' && paramsAsimetrica) {
      return evaluarCompuestaAsimetrica(paramsAsimetrica, curY);
    }
    if (modo === 'multi_terrazas' && paramsMulti) {
      return evaluarMultiTerrazas(paramsMulti, curY);
    }
    if (modo === 'constructor_libre' && paramsTramos) {
      return evaluarTramosLibres(paramsTramos.tramos, paramsTramos.S, curY);
    }
    throw new Error('Parámetros de sección compuesta incompletos.');
  };

  if (target === 'Q') {
    // Calcular Q conocido el tirante y
    yFinal = valorTarget;
    if (yFinal <= 0) throw new Error('El tirante y debe ser mayor a cero.');
    const res = evaluar(yFinal);
    QFinal = res.QTotal;
    subsFinal = res.subsecciones;
    AFinal = res.ATotal;
    PFinal = res.PTotal;
    TFinal = res.TTotal;
  } else {
    // Calcular el tirante y conocido el caudal Q
    QFinal = valorTarget;
    if (QFinal <= 0) throw new Error('El caudal Q debe ser mayor a cero.');

    // Usamos primeraRaiz para manejar la posible no-monotonía de la curva de gasto al desbordar
    const fObj = (testY: number) => evaluar(testY).QTotal - QFinal;

    yFinal = primeraRaiz(fObj, 1e-4, 50.0);
    const res = evaluar(yFinal);
    subsFinal = res.subsecciones;
    AFinal = res.ATotal;
    PFinal = res.PTotal;
    TFinal = res.TTotal;
  }

  // Notificaciones y advertencias de ingeniería
  if (modo === 'clasica_asimetrica' && paramsAsimetrica) {
    const h_min = Math.min(paramsAsimetrica.h_izq, paramsAsimetrica.h_der);
    if (yFinal <= h_min) {
      advertencias.push(
        'El tirante de agua no sobrepasa la profundidad de las planicies; el flujo queda confinado únicamente al cauce principal.'
      );
    } else if (yFinal > paramsAsimetrica.h_izq && yFinal <= paramsAsimetrica.h_der) {
      advertencias.push(
        `Flujo asimétrico: Se ha inundado la planicie izquierda (+${paramsAsimetrica.h_izq.toFixed(2)}m) pero la derecha (+${paramsAsimetrica.h_der.toFixed(2)}m) aún permanece seca.`
      );
    } else if (yFinal > paramsAsimetrica.h_der && yFinal <= paramsAsimetrica.h_izq) {
      advertencias.push(
        `Flujo asimétrico: Se ha inundado la planicie derecha (+${paramsAsimetrica.h_der.toFixed(2)}m) pero la izquierda (+${paramsAsimetrica.h_izq.toFixed(2)}m) aún permanece seca.`
      );
    }
  }

  const VMedia = AFinal > 0 ? QFinal / AFinal : 0;
  const RTotal = PFinal > 0 ? AFinal / PFinal : 0;
  const FrGlobal = froude(VMedia, AFinal, TFinal);
  const reg = clasificarRegimen(FrGlobal);

  // Rugosidades globales equivalentes
  const partesHorton = subsFinal.map((s) => ({ P: s.P, n: s.n }));
  const nEquivHorton = nHorton(partesHorton);
  const nEquivLotter = nLotter(subsFinal, AFinal, PFinal);

  return {
    modo,
    target,
    yTotal: yFinal,
    QTotal: QFinal,
    ATotal: AFinal,
    PTotal: PFinal,
    RTotal,
    TTotal: TFinal,
    VMedia,
    FrGlobal,
    regimen: reg,
    nEquivalenteHorton: nEquivHorton,
    nEquivalenteLotter: nEquivLotter,
    subsecciones: subsFinal,
    advertencias
  };
}
