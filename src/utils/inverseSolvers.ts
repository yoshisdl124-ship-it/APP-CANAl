/**
 * EL CAUDALOSO - Módulo de Cálculo Inverso Multisección
 * Permite resolver cualquier incógnita (Pendiente S, Rugosidad n, Ancho b,
 * Talud lateral z, Diámetro D, Tirante y) para múltiples tipos de sección:
 * Trapezoidal, Rectangular, Triangular, Circular, Parabólica y Semicircular.
 */

import { HydraulicResult, InverseInputParams, InverseUnknown, SectionType } from '../types/hydraulics';
import { biseccion, calcularBordeLibreVillon, caudalManning, clasificarRegimen, froude, G, geometria, nHorton } from './hydraulicsCore';

export interface InverseResult {
  parametroResuelto: {
    clave: InverseUnknown;
    nombre: string;
    valor: number;
    unidad: string;
    formateado: string;
  };
  hidraulica: HydraulicResult;
  dibujoParams: {
    tipo: SectionType;
    y: number;
    b: number;
    z: number;
    d: number;
    bl?: number;
    revestido?: boolean | null;
  };
}

export function resolverCalculoInverso(params: InverseInputParams): InverseResult {
  const { tipo, incognita, Q, y: yIn, S: SIn, n: nIn, b: bIn, z: zIn, d: dIn, rugMode, nf, ni, nd, blMode } = params;

  if (Q <= 0) throw new Error('El caudal Q debe ser mayor a cero.');

  // Función para obtener la rugosidad n según el modo
  const obtenerN = (curY: number, curB: number, curZ: number): number => {
    if (rugMode === 'Compuesta (Horton-Einstein)' && tipo !== 'Circular' && tipo !== 'Semicircular') {
      const k = Math.sqrt(1 + curZ * curZ);
      const partes: { P: number; n: number }[] = [
        { P: curY * k, n: ni ?? 0.02 },
        { P: curY * k, n: nd ?? 0.03 }
      ];
      if (tipo !== 'Triangular') {
        partes.push({ P: curB, n: nf ?? 0.015 });
      }
      return nHorton(partes);
    }
    return nIn;
  };

  let S_final = SIn;
  let n_final = nIn;
  let b_final = tipo === 'Triangular' ? 0 : bIn;
  let z_final = (tipo === 'Rectangular' || tipo === 'Circular' || tipo === 'Semicircular') ? 0 : zIn;
  let d_final = dIn;
  let y_final = yIn;

  let valorResuelto = 0;
  let nombreParam = '';
  let unidadParam = '';
  let formato = '';

  switch (incognita) {
    case 'S': {
      if (y_final <= 0) throw new Error('El tirante y debe ser mayor a cero.');
      nombreParam = 'Pendiente requerida S';
      unidadParam = 'm/m';

      const nCalc = obtenerN(y_final, b_final, z_final);
      n_final = nCalc;
      const { A, P } = geometria(tipo, y_final, b_final, z_final, d_final);
      if (A <= 0 || P <= 0) throw new Error('Geometría inválida para calcular la pendiente.');
      const R = A / P;
      const K = (1.0 / nCalc) * A * Math.pow(R, 2 / 3);
      if (K <= 0) throw new Error('Conducción nula.');
      S_final = Math.pow(Q / K, 2);
      valorResuelto = S_final;
      formato = S_final < 0.0001 ? S_final.toExponential(4) : S_final.toFixed(6);
      break;
    }

    case 'n': {
      if (y_final <= 0) throw new Error('El tirante y debe ser mayor a cero.');
      if (S_final <= 0) throw new Error('La pendiente S debe ser mayor a cero.');
      nombreParam = 'Rugosidad requerida n (Manning)';
      unidadParam = '';

      const { A, P } = geometria(tipo, y_final, b_final, z_final, d_final);
      if (A <= 0 || P <= 0) throw new Error('Geometría inválida para calcular la rugosidad.');
      const R = A / P;
      n_final = (A * Math.pow(R, 2 / 3) * Math.sqrt(S_final)) / Q;
      valorResuelto = n_final;
      formato = n_final.toFixed(5);
      break;
    }

    case 'b': {
      if (tipo !== 'Trapezoidal' && tipo !== 'Rectangular' && tipo !== 'Parabólica') {
        throw new Error(`La sección ${tipo} no posee ancho de solera b.`);
      }
      if (y_final <= 0) throw new Error('El tirante y debe ser mayor a cero.');
      if (S_final <= 0) throw new Error('La pendiente S debe ser mayor a cero.');

      nombreParam = 'Ancho de solera requerido b';
      unidadParam = 'm';

      const f = (testB: number) => {
        const nCalc = obtenerN(y_final, testB, z_final);
        return caudalManning(tipo, y_final, testB, z_final, 0, S_final, nCalc) - Q;
      };

      b_final = biseccion(f, 0.001, 50.0);
      valorResuelto = b_final;
      formato = b_final.toFixed(4);
      n_final = obtenerN(y_final, b_final, z_final);
      break;
    }

    case 'z': {
      if (tipo !== 'Trapezoidal' && tipo !== 'Triangular') {
        throw new Error(`La sección ${tipo} no posee talud z libre.`);
      }
      if (y_final <= 0) throw new Error('El tirante y debe ser mayor a cero.');
      if (S_final <= 0) throw new Error('La pendiente S debe ser mayor a cero.');

      nombreParam = 'Talud lateral requerido z (H:V)';
      unidadParam = '';

      const f = (testZ: number) => {
        const nCalc = obtenerN(y_final, b_final, testZ);
        return caudalManning(tipo, y_final, b_final, testZ, 0, S_final, nCalc) - Q;
      };

      z_final = biseccion(f, 0.0, 30.0);
      valorResuelto = z_final;
      formato = z_final.toFixed(4);
      n_final = obtenerN(y_final, b_final, z_final);
      break;
    }

    case 'd': {
      if (tipo !== 'Circular' && tipo !== 'Semicircular') {
        throw new Error(`La sección ${tipo} no se define por diámetro D.`);
      }
      if (y_final <= 0) throw new Error('El tirante y debe ser mayor a cero.');
      if (S_final <= 0) throw new Error('La pendiente S debe ser mayor a cero.');

      nombreParam = tipo === 'Semicircular' ? 'Diámetro de conducto D (2·r)' : 'Diámetro de tubería D';
      unidadParam = 'm';

      // Para circular: D debe ser >= y_final / 0.938 para transportar el caudal
      const f = (testD: number) => {
        if (testD < y_final) return -Q; // no cabe
        return caudalManning(tipo, y_final, 0, 0, testD, S_final, n_final) - Q;
      };

      const minD = tipo === 'Semicircular' ? 2.0 * y_final : y_final * 1.01;
      d_final = biseccion(f, minD, 50.0);
      valorResuelto = d_final;
      formato = d_final.toFixed(4);
      break;
    }

    case 'y': {
      if (S_final <= 0) throw new Error('La pendiente S debe ser mayor a cero.');

      nombreParam = 'Tirante normal y';
      unidadParam = 'm';

      const isCirc = tipo === 'Circular';
      const isSemi = tipo === 'Semicircular';
      const maxHi = isCirc ? 0.938 * d_final : (isSemi ? (d_final > 0 ? d_final / 2 : 50) : 50.0);

      const f = (testY: number) => {
        const nCalc = obtenerN(testY, b_final, z_final);
        return caudalManning(tipo, testY, b_final, z_final, d_final, S_final, nCalc) - Q;
      };

      y_final = biseccion(f, 1e-4, maxHi, !isCirc && !isSemi);
      valorResuelto = y_final;
      formato = y_final.toFixed(4);
      n_final = obtenerN(y_final, b_final, z_final);
      break;
    }
  }

  // Cálculos hidráulicos completos finales con los valores resueltos
  const { A, P, T, R } = geometria(tipo, y_final, b_final, z_final, d_final);
  const V = A > 0 ? Q / A : 0;
  const Fr = froude(V, A, T);
  const reg = clasificarRegimen(Fr);
  const E = y_final + (V * V) / (2 * G);

  // Borde libre según Villón
  const blInfo = tipo !== 'Circular' ? calcularBordeLibreVillon(blMode, Q, b_final, y_final) : null;
  const bl = blInfo?.bl;
  const revestido = blInfo?.revestido;

  return {
    parametroResuelto: {
      clave: incognita,
      nombre: nombreParam,
      valor: valorResuelto,
      unidad: unidadParam,
      formateado: formato
    },
    hidraulica: {
      Q,
      V,
      A,
      P,
      R,
      T,
      Fr,
      regimen: reg,
      E,
      S: S_final,
      n: n_final,
      y: y_final,
      bl,
      H_total: bl ? y_final + bl : undefined,
      revestido
    },
    dibujoParams: {
      tipo,
      y: y_final,
      b: b_final,
      z: z_final,
      d: d_final,
      bl,
      revestido
    }
  };
}

/**
 * Devuelve las incógnitas admisibles según el tipo de sección seleccionada
 */
export function obtenerIncognitasPorSeccion(tipo: SectionType): { valor: InverseUnknown; etiqueta: string }[] {
  const base: { valor: InverseUnknown; etiqueta: string }[] = [
    { valor: 'S', etiqueta: 'Pendiente S (m/m)' },
    { valor: 'n', etiqueta: 'Rugosidad n de Manning' },
    { valor: 'y', etiqueta: 'Tirante normal y (m)' }
  ];

  switch (tipo) {
    case 'Trapezoidal':
      return [
        ...base,
        { valor: 'b', etiqueta: 'Ancho de solera b (m)' },
        { valor: 'z', etiqueta: 'Talud lateral z (H:V)' }
      ];
    case 'Rectangular':
      return [
        ...base,
        { valor: 'b', etiqueta: 'Ancho de solera b (m)' }
      ];
    case 'Triangular':
      return [
        ...base,
        { valor: 'z', etiqueta: 'Talud lateral z (H:V)' }
      ];
    case 'Circular':
    case 'Semicircular':
      return [
        ...base,
        { valor: 'd', etiqueta: 'Diámetro D (m)' }
      ];
    case 'Parabólica':
      return [
        ...base,
        { valor: 'b', etiqueta: 'Factor de ancho de espejo b (m)' }
      ];
  }
}
