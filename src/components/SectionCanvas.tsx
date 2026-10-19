/**
 * EL CAUDALOSO - Visualizador Técnico de Secciones Transversales
 * Representación gráfica vectorial (SVG interactivo) con escala real proporcional,
 * simulación de flujo de agua animado, terreno estratificado, bermas/planicies,
 * cotas de ingeniería con flechas y cotas de borde libre.
 */

import React, { useEffect, useState } from 'react';
import { SectionType, CompoundSegment } from '../types/hydraulics';
import { convertirTramosACoordenadas } from '../utils/compoundSolvers';
import { Waves, Maximize2, Sparkles } from 'lucide-react';

interface SectionCanvasProps {
  tipo: SectionType | 'Compuesta_Asimetrica' | 'Compuesta_Terrazas' | 'Compuesta_Tramos';
  y: number;
  b?: number;
  z?: number;
  d?: number;
  bl?: number; // Borde libre
  revestido?: boolean | null;
  // Para sección compuesta
  h_izq?: number;
  h_der?: number;
  Bi?: number;
  Bd?: number;
  zi_ext?: number;
  zd_ext?: number;
  etiqueta?: string;
  width?: number;
  height?: number;
  terrazas?: Array<{
    nombre: string;
    lado: 'izq' | 'der';
    cotaPiso: number;
    ancho: number;
    taludExterior: number;
  }>;
  tramos?: CompoundSegment[];
}

export const SectionCanvas: React.FC<SectionCanvasProps> = ({
  tipo,
  y,
  b = 1.5,
  z = 1.0,
  d = 2.0,
  bl,
  revestido,
  h_izq = 1.5,
  h_der = 1.5,
  Bi = 6.0,
  Bd = 8.0,
  zi_ext = 0.0,
  zd_ext = 0.0,
  etiqueta = 'y',
  width = 640,
  height = 320,
  terrazas,
  tramos
}) => {
  const [animOffset, setAnimOffset] = useState(0);
  const [animActive, setAnimActive] = useState(true);

  // Animación suave de ola
  useEffect(() => {
    if (!animActive) return;
    let animId: number;
    let start = performance.now();
    const animate = (time: number) => {
      const elapsed = time - start;
      setAnimOffset((elapsed / 1000) % 1);
      animId = requestAnimationFrame(animate);
    };
    animId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animId);
  }, [animActive]);

  // Si y es inválido o 0
  const yVal = Math.max(0, y || 0);
  const blVal = bl && bl > 0 ? bl : 0;
  const isCirc = tipo === 'Circular';
  const isSemi = tipo === 'Semicircular';
  const isCompound = tipo === 'Compuesta_Asimetrica' || tipo === 'Compuesta_Terrazas';

  // Configuración de vista y coordenadas
  const padX = 40;
  const padTop = 35;
  const padBot = 40;
  const viewW = width;
  const viewH = height;

  // Cálculo de contornos según tipo
  let pathSuelo = '';
  let pathAgua = '';
  let lineaAguaY = 0;
  let aguaX1 = 0;
  let aguaX2 = 0;
  let bottomY = 0;
  let topY = 0;
  let canalTopWidth = 0;

  // Escala
  let esc = 1;
  let offsetX = viewW / 2;
  let offsetY = viewH - padBot;

  if (isCirc) {
    const diam = d > 0 ? d : 2.0;
    const r = diam / 2;
    esc = Math.min((viewW - 2 * padX) / diam, (viewH - padTop - padBot) / diam);
    const cx = viewW / 2;
    const cy = viewH / 2;
    const rPx = r * esc;
    const yPx = yVal * esc;

    // Agua circular
    const yTopAgua = Math.min(yVal, diam);
    const thetaAgua = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - yTopAgua / r)));
    const hwAgua = r * Math.sin(thetaAgua / 2) * esc;
    const waterLevelSvgY = cy + rPx - yPx;

    lineaAguaY = waterLevelSvgY;
    aguaX1 = cx - hwAgua;
    aguaX2 = cx + hwAgua;

    return (
      <div className="relative rounded-xl overflow-hidden bg-slate-900 border border-slate-800 shadow-inner">
        <svg viewBox={`0 0 ${viewW} ${viewH}`} className="w-full h-auto select-none">
          <defs>
            <linearGradient id="circWaterGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8BE0EE" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#17708A" stopOpacity="0.95" />
            </linearGradient>
            <clipPath id="circleClip">
              <circle cx={cx} cy={cy} r={rPx} />
            </clipPath>
          </defs>

          {/* Fondo tubería */}
          <circle cx={cx} cy={cy} r={rPx} fill="#162534" stroke="#25405A" strokeWidth="2" />
          <circle cx={cx} cy={cy} r={rPx + 7} fill="none" stroke="#6F7F8C" strokeWidth="8" />
          <circle cx={cx} cy={cy} r={rPx + 11} fill="none" stroke="#25405A" strokeWidth="1.5" />

          {/* Agua con clip */}
          <g clipPath="url(#circleClip)">
            {yVal > 0 && (
              <>
                <rect
                  x={cx - rPx - 5}
                  y={waterLevelSvgY}
                  width={2 * rPx + 10}
                  height={cy + rPx - waterLevelSvgY + 5}
                  fill="url(#circWaterGrad)"
                />
                {/* Ondas superficiales */}
                <path
                  d={`M ${cx - hwAgua} ${waterLevelSvgY} Q ${cx - hwAgua / 2 + Math.sin(animOffset * Math.PI * 2) * 5} ${waterLevelSvgY - 1.5}, ${cx} ${waterLevelSvgY} T ${cx + hwAgua} ${waterLevelSvgY}`}
                  fill="none"
                  stroke="#D4F6FB"
                  strokeWidth="2.5"
                />
              </>
            )}
          </g>

          {/* Cotas */}
          {/* Cota Tirante y */}
          <line x1={cx} y1={cy + rPx} x2={cx} y2={waterLevelSvgY} stroke="#E6EEF4" strokeWidth="1.5" strokeDasharray="3,3" />
          <circle cx={cx} cy={cy + rPx} r="3" fill="#E6EEF4" />
          <circle cx={cx} cy={waterLevelSvgY} r="3" fill="#E6EEF4" />
          
          <rect x={cx + 12} y={(cy + rPx + waterLevelSvgY) / 2 - 12} width="95" height="24" rx="6" fill="#0D1923" stroke="#25405A" />
          <text x={cx + 59} y={(cy + rPx + waterLevelSvgY) / 2 + 4} fill="#56CBE0" fontSize="12" fontWeight="bold" textAnchor="middle">
            {etiqueta} = {yVal.toFixed(3)} m
          </text>

          {/* Cota Diámetro D */}
          <line x1={cx - rPx} y1={cy + rPx + 18} x2={cx + rPx} y2={cy + rPx + 18} stroke="#8DA4B6" strokeWidth="1.2" />
          <line x1={cx - rPx} y1={cy + rPx + 12} x2={cx - rPx} y2={cy + rPx + 24} stroke="#8DA4B6" strokeWidth="1.2" />
          <line x1={cx + rPx} y1={cy + rPx + 12} x2={cx + rPx} y2={cy + rPx + 24} stroke="#8DA4B6" strokeWidth="1.2" />
          <rect x={cx - 45} y={cy + rPx + 8} width="90" height="20" rx="4" fill="#0D1923" stroke="#25405A" />
          <text x={cx} y={cy + rPx + 22} fill="#B7CAD8" fontSize="11" textAnchor="middle">
            D = {diam.toFixed(2)} m
          </text>
        </svg>

        <div className="absolute top-2 right-2 flex items-center gap-2">
          <button
            onClick={() => setAnimActive(!animActive)}
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors"
            title={animActive ? 'Pausar oleaje' : 'Reanudar oleaje'}
          >
            <Waves className="w-4 h-4 text-cyan-400" />
          </button>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------
  // SECCIÓN COMPUESTA (Clásica Asimétrica o Multi-Terrazas)
  // -----------------------------------------------------------------
  if (isCompound) {
    const maxH = Math.max(yVal, h_izq, h_der, 1.0);
    const altTotal = maxH * 1.35;
    const bEff = tipo === 'Compuesta_Asimetrica' ? b : (b || 2.0);
    const zEff = tipo === 'Compuesta_Asimetrica' ? z : (z || 1.0);

    const xCanalIzq = -(bEff / 2 + zEff * h_izq);
    const xCanalDer = bEff / 2 + zEff * h_der;

    const xExtIzq = xCanalIzq - Bi - zi_ext * (altTotal - h_izq);
    const xExtDer = xCanalDer + Bd + zd_ext * (altTotal - h_der);

    const spanX = (xExtDer - xExtIzq) * 1.15;
    esc = Math.min((viewW - 2 * padX) / spanX, (viewH - padTop - padBot) / (altTotal * 1.2));
    
    const midX = (xExtIzq + xExtDer) / 2;
    const X = (valX: number) => viewW / 2 + (valX - midX) * esc;
    const Y = (valY: number) => (viewH - padBot) - valY * esc;

    // Puntos del terreno
    const ptsTerreno: [number, number][] = [
      [xExtIzq, altTotal],
      [xCanalIzq - Bi, h_izq],
      [xCanalIzq, h_izq],
      [-bEff / 2, 0],
      [bEff / 2, 0],
      [xCanalDer, h_der],
      [xCanalDer + Bd, h_der],
      [xExtDer, altTotal]
    ];

    const dTerreno = `M ${X(ptsTerreno[0][0])} ${Y(ptsTerreno[0][1])} ` +
      ptsTerreno.slice(1).map(p => `L ${X(p[0])} ${Y(p[1])}`).join(' ') +
      ` L ${X(xExtDer)} ${viewH} L ${X(xExtIzq)} ${viewH} Z`;

    // Polígono de agua según tirante y
    let dAgua = '';
    const yNivel = yVal;
    const ySvg = Y(yNivel);

    if (yNivel > 0) {
      if (yNivel <= Math.min(h_izq, h_der)) {
        // Agua sólo en canal principal
        const xAguaIzq = -(bEff / 2 + zEff * yNivel);
        const xAguaDer = bEff / 2 + zEff * yNivel;
        dAgua = `M ${X(xAguaIzq)} ${ySvg} L ${X(-bEff / 2)} ${Y(0)} L ${X(bEff / 2)} ${Y(0)} L ${X(xAguaDer)} ${ySvg} Z`;
        aguaX1 = X(xAguaIzq);
        aguaX2 = X(xAguaDer);
      } else {
        // Agua desborda
        let xAguaIzq = -(bEff / 2 + zEff * h_izq);
        if (yNivel > h_izq) {
          xAguaIzq = -(bEff / 2 + zEff * h_izq + Bi + zi_ext * (yNivel - h_izq));
        }
        let xAguaDer = bEff / 2 + zEff * h_der;
        if (yNivel > h_der) {
          xAguaDer = bEff / 2 + zEff * h_der + Bd + zd_ext * (yNivel - h_der);
        }

        // Construir contorno mojado
        const ptsAgua: [number, number][] = [[xAguaIzq, yNivel]];
        if (yNivel > h_izq) {
          ptsAgua.push([-(bEff / 2 + zEff * h_izq + Bi), h_izq]);
          ptsAgua.push([-(bEff / 2 + zEff * h_izq), h_izq]);
        } else {
          ptsAgua.push([-(bEff / 2 + zEff * yNivel), yNivel]);
        }
        ptsAgua.push([-bEff / 2, 0]);
        ptsAgua.push([bEff / 2, 0]);
        if (yNivel > h_der) {
          ptsAgua.push([bEff / 2 + zEff * h_der, h_der]);
          ptsAgua.push([bEff / 2 + zEff * h_der + Bd, h_der]);
        } else {
          ptsAgua.push([bEff / 2 + zEff * yNivel, yNivel]);
        }
        ptsAgua.push([xAguaDer, yNivel]);

        dAgua = `M ${X(ptsAgua[0][0])} ${Y(ptsAgua[0][1])} ` +
          ptsAgua.slice(1).map(p => `L ${X(p[0])} ${Y(p[1])}`).join(' ') + ' Z';

        aguaX1 = X(xAguaIzq);
        aguaX2 = X(xAguaDer);
      }
    }

    return (
      <div className="relative rounded-xl overflow-hidden bg-slate-900 border border-slate-800 shadow-inner">
        <svg viewBox={`0 0 ${viewW} ${viewH}`} className="w-full h-auto select-none">
          <defs>
            <linearGradient id="soilGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4A3D2D" />
              <stop offset="100%" stopColor="#2D241A" />
            </linearGradient>
            <linearGradient id="compWaterGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8BE0EE" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#17708A" stopOpacity="0.95" />
            </linearGradient>
            <pattern id="soilDots" x="0" y="0" width="16" height="16" patternUnits="userSpaceOnUse">
              <circle cx="3" cy="3" r="1.2" fill="#8E7755" opacity="0.3" />
              <circle cx="11" cy="9" r="1.5" fill="#A88E66" opacity="0.25" />
              <circle cx="7" cy="14" r="1" fill="#8E7755" opacity="0.2" />
            </pattern>
          </defs>

          {/* Terreno */}
          <path d={dTerreno} fill="url(#soilGrad)" stroke="#B39A70" strokeWidth="2.5" />
          <path d={dTerreno} fill="url(#soilDots)" />

          {/* Pasto en planicies */}
          <line x1={X(xCanalIzq - Bi)} y1={Y(h_izq)} x2={X(xCanalIzq)} y2={Y(h_izq)} stroke="#78A25A" strokeWidth="4" />
          <line x1={X(xCanalDer)} y1={Y(h_der)} x2={X(xCanalDer + Bd)} y2={Y(h_der)} stroke="#78A25A" strokeWidth="4" />

          {/* Agua */}
          {yVal > 0 && (
            <>
              <path d={dAgua} fill="url(#compWaterGrad)" />
              {/* Línea de espejo y onda */}
              <line x1={aguaX1} y1={ySvg} x2={aguaX2} y2={ySvg} stroke="#56CBE0" strokeWidth="2.5" />
              <path
                d={`M ${aguaX1} ${ySvg} Q ${(aguaX1 + aguaX2) / 2 + Math.sin(animOffset * Math.PI * 2) * 12} ${ySvg - 1.8}, ${aguaX2} ${ySvg}`}
                fill="none"
                stroke="#FFFFFF"
                strokeWidth="1.2"
                opacity="0.75"
              />
            </>
          )}

          {/* Interfaces verticales ficticias de cortante cuando desborda */}
          {yVal > h_izq && (
            <line x1={X(xCanalIzq)} y1={Y(h_izq)} x2={X(xCanalIzq)} y2={ySvg} stroke="#E6EEF4" strokeWidth="1.5" strokeDasharray="4,3" opacity="0.8" />
          )}
          {yVal > h_der && (
            <line x1={X(xCanalDer)} y1={Y(h_der)} x2={X(xCanalDer)} y2={ySvg} stroke="#E6EEF4" strokeWidth="1.5" strokeDasharray="4,3" opacity="0.8" />
          )}

          {/* Cotas */}
          {/* Cota Tirante Central */}
          <line x1={X(0)} y1={Y(0)} x2={X(0)} y2={ySvg} stroke="#E6EEF4" strokeWidth="1.5" />
          <circle cx={X(0)} cy={Y(0)} r="3" fill="#E6EEF4" />
          <circle cx={X(0)} cy={ySvg} r="3" fill="#E6EEF4" />
          <rect x={X(0) + 10} y={(Y(0) + ySvg) / 2 - 12} width="95" height="24" rx="6" fill="#0D1923" stroke="#25405A" />
          <text x={X(0) + 57} y={(Y(0) + ySvg) / 2 + 4} fill="#56CBE0" fontSize="12" fontWeight="bold" textAnchor="middle">
            {etiqueta} = {yVal.toFixed(3)} m
          </text>

          {/* Ancho solera b */}
          <line x1={X(-bEff / 2)} y1={Y(0) + 14} x2={X(bEff / 2)} y2={Y(0) + 14} stroke="#8DA4B6" strokeWidth="1.2" />
          <line x1={X(-bEff / 2)} y1={Y(0) + 8} x2={X(-bEff / 2)} y2={Y(0) + 20} stroke="#8DA4B6" strokeWidth="1.2" />
          <line x1={X(bEff / 2)} y1={Y(0) + 8} x2={X(bEff / 2)} y2={Y(0) + 20} stroke="#8DA4B6" strokeWidth="1.2" />
          <rect x={X(0) - 40} y={Y(0) + 4} width="80" height="20" rx="4" fill="#0D1923" stroke="#25405A" />
          <text x={X(0)} y={Y(0) + 18} fill="#B7CAD8" fontSize="11" textAnchor="middle">
            b = {bEff.toFixed(2)} m
          </text>

          {/* Cotas de planicies */}
          <text x={X(xCanalIzq - Bi / 2)} y={Y(h_izq) - 8} fill="#8DA4B6" fontSize="10" textAnchor="middle" fontWeight="bold">
            Bi = {Bi.toFixed(2)}m (h={h_izq.toFixed(2)}m)
          </text>
          <text x={X(xCanalDer + Bd / 2)} y={Y(h_der) - 8} fill="#8DA4B6" fontSize="10" textAnchor="middle" fontWeight="bold">
            Bd = {Bd.toFixed(2)}m (h={h_der.toFixed(2)}m)
          </text>
        </svg>

        <div className="absolute top-2 right-2 flex items-center gap-2">
          <button
            onClick={() => setAnimActive(!animActive)}
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors"
            title={animActive ? 'Pausar oleaje' : 'Reanudar oleaje'}
          >
            <Waves className="w-4 h-4 text-cyan-400" />
          </button>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------
  // SECCIÓN COMPUESTA LIBRE POR TRAMOS (DISTANCIAS Y TALUDES)
  // -----------------------------------------------------------------
  if (tipo === 'Compuesta_Tramos' && tramos && tramos.length > 0) {
    const { puntos, tramosConExtremos, yMax, xMin, xMax } = convertirTramosACoordenadas(tramos);
    const anchoTotal = Math.max(xMax - xMin, 1.0);
    const altoFisico = Math.max(yVal * 1.3, yMax * 1.25, 1.5);
    const th = altoFisico * 0.2;

    const esc = Math.min(
      (viewW - 2 * padX) / (anchoTotal * 1.15),
      (viewH - padTop - padBot) / (altoFisico + th)
    );

    const midX = (xMin + xMax) / 2;
    const X = (valX: number) => viewW / 2 + (valX - midX) * esc;
    const Y = (valY: number) => (viewH - padBot - th * esc) - valY * esc;

    // Polígono del terreno bajo los tramos
    const pFirst = puntos[0];
    const pLast = puntos[puntos.length - 1];
    const dTerreno = `M ${X(pFirst.x)} ${Y(pFirst.y)} ` +
      puntos.slice(1).map(p => `L ${X(p.x)} ${Y(p.y)}`).join(' ') +
      ` L ${X(pLast.x)} ${viewH} L ${X(pFirst.x)} ${viewH} Z`;

    // Polígono de agua sumergida (cortada a la cota Y = yVal)
    const waterLevelSvgY = Y(yVal);
    let ptsAgua: [number, number][] = [];
    let xMinAgua = Infinity;
    let xMaxAgua = -Infinity;

    if (yVal > 0) {
      for (let i = 0; i < tramosConExtremos.length; i++) {
        const seg = tramosConExtremos[i];
        const p1 = seg.pInicio;
        const p2 = seg.pFin;

        if (p1.y <= yVal && p2.y <= yVal) {
          if (ptsAgua.length === 0) ptsAgua.push([p1.x, p1.y]);
          ptsAgua.push([p2.x, p2.y]);
          xMinAgua = Math.min(xMinAgua, p1.x, p2.x);
          xMaxAgua = Math.max(xMaxAgua, p1.x, p2.x);
        } else if (p1.y < yVal && p2.y > yVal) {
          if (ptsAgua.length === 0) ptsAgua.push([p1.x, p1.y]);
          const frac = (yVal - p1.y) / (p2.y - p1.y);
          const xInt = p1.x + frac * (p2.x - p1.x);
          ptsAgua.push([xInt, yVal]);
          xMinAgua = Math.min(xMinAgua, p1.x, xInt);
          xMaxAgua = Math.max(xMaxAgua, p1.x, xInt);
        } else if (p1.y > yVal && p2.y <= yVal) {
          const frac = (yVal - p1.y) / (p2.y - p1.y);
          const xInt = p1.x + frac * (p2.x - p1.x);
          ptsAgua.push([xInt, yVal]);
          ptsAgua.push([p2.x, p2.y]);
          xMinAgua = Math.min(xMinAgua, xInt, p2.x);
          xMaxAgua = Math.max(xMaxAgua, xInt, p2.x);
        }
      }
    }

    let dAgua = '';
    if (ptsAgua.length >= 2) {
      dAgua = `M ${X(ptsAgua[0][0])} ${Y(ptsAgua[0][1])} ` +
        ptsAgua.slice(1).map(p => `L ${X(p[0])} ${Y(p[1])}`).join(' ') +
        ` L ${X(ptsAgua[ptsAgua.length - 1][0])} ${waterLevelSvgY} L ${X(ptsAgua[0][0])} ${waterLevelSvgY} Z`;
    }

    return (
      <div className="relative rounded-xl overflow-hidden bg-slate-900 border border-slate-800 shadow-inner">
        <svg viewBox={`0 0 ${viewW} ${viewH}`} className="w-full h-auto select-none">
          <defs>
            <linearGradient id="customSoilGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4A3D2D" />
              <stop offset="100%" stopColor="#251C13" />
            </linearGradient>
            <linearGradient id="customWaterGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8BE0EE" stopOpacity="0.88" />
              <stop offset="100%" stopColor="#17708A" stopOpacity="0.96" />
            </linearGradient>
            <pattern id="soilDotsCustom" x="0" y="0" width="16" height="16" patternUnits="userSpaceOnUse">
              <circle cx="3" cy="3" r="1.1" fill="#8E7755" opacity="0.3" />
              <circle cx="11" cy="9" r="1.4" fill="#A88E66" opacity="0.25" />
            </pattern>
          </defs>

          {/* Terreno base */}
          <path d={dTerreno} fill="url(#customSoilGrad)" stroke="#B39A70" strokeWidth="2" />
          <path d={dTerreno} fill="url(#soilDotsCustom)" />

          {/* Agua */}
          {dAgua && (
            <>
              <path d={dAgua} fill="url(#customWaterGrad)" />
              {/* Línea de espejo de agua con oleaje */}
              <line
                x1={X(xMinAgua)}
                y1={waterLevelSvgY}
                x2={X(xMaxAgua)}
                y2={waterLevelSvgY}
                stroke="#56CBE0"
                strokeWidth="2.5"
              />
              <path
                d={`M ${X(xMinAgua)} ${waterLevelSvgY} Q ${(X(xMinAgua) + X(xMaxAgua)) / 2 + Math.sin(animOffset * Math.PI * 2) * 12} ${waterLevelSvgY - 1.8}, ${X(xMaxAgua)} ${waterLevelSvgY}`}
                fill="none"
                stroke="#FFFFFF"
                strokeWidth="1.2"
                opacity="0.75"
              />
            </>
          )}

          {/* Líneas de tramos con colores y etiquetas */}
          {tramosConExtremos.map((seg, idx) => {
            const x1 = X(seg.pInicio.x);
            const y1 = Y(seg.pInicio.y);
            const x2 = X(seg.pFin.x);
            const y2 = Y(seg.pFin.y);
            const xMid = (x1 + x2) / 2;
            const yMid = (y1 + y2) / 2;

            return (
              <g key={seg.id || idx}>
                {/* Línea gruesa del lecho */}
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={seg.direccion === 'horizontal' ? '#78A25A' : '#C7D1D8'}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                />
                {/* Vértice */}
                <circle cx={x1} cy={y1} r="2.5" fill="#E6EEF4" />
                {idx === tramosConExtremos.length - 1 && <circle cx={x2} cy={y2} r="2.5" fill="#E6EEF4" />}

                {/* Etiqueta flotante con ΔX y Z */}
                <rect
                  x={xMid - 28}
                  y={yMid - 18}
                  width="56"
                  height="16"
                  rx="3"
                  fill="#0D1923"
                  stroke="#25405A"
                  opacity="0.85"
                />
                <text
                  x={xMid}
                  y={yMid - 6}
                  fill="#56CBE0"
                  fontSize="8.5"
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  {seg.direccion === 'horizontal'
                    ? `L=${seg.distanciaX}m`
                    : `Δx=${seg.distanciaX}m z=${seg.taludZ}`}
                </text>
              </g>
            );
          })}

          {/* Cota Tirante Central y */}
          {yVal > 0 && (() => {
            const lowestPoint = puntos.find(p => Math.abs(p.y) < 1e-4) || puntos[0];
            const xBottom = lowestPoint ? lowestPoint.x : (xMin + xMax) / 2;
            return (
              <>
                <line x1={X(xBottom)} y1={Y(0)} x2={X(xBottom)} y2={waterLevelSvgY} stroke="#E6EEF4" strokeWidth="1.5" />
                <circle cx={X(xBottom)} cy={Y(0)} r="3" fill="#E6EEF4" />
                <circle cx={X(xBottom)} cy={waterLevelSvgY} r="3" fill="#E6EEF4" />
                <rect x={X(xBottom) + 10} y={(Y(0) + waterLevelSvgY) / 2 - 12} width="105" height="24" rx="6" fill="#0D1923" stroke="#25405A" />
                <text x={X(xBottom) + 62} y={(Y(0) + waterLevelSvgY) / 2 + 4} fill="#56CBE0" fontSize="12" fontWeight="bold" textAnchor="middle">
                  {etiqueta} = {yVal.toFixed(3)} m
                </text>
              </>
            );
          })()}

          {/* Vértices con etiquetas Vi */}
          {puntos.map((p, pIdx) => (
            <g key={pIdx}>
              <circle cx={X(p.x)} cy={Y(p.y)} r="3.5" fill="#38BDF8" stroke="#0F172A" strokeWidth="1.5" />
              <text
                x={X(p.x)}
                y={Y(p.y) + (p.y <= 0.1 ? 14 : -8)}
                fill="#94A3B8"
                fontSize="8"
                fontWeight="bold"
                textAnchor="middle"
              >
                V{pIdx} ({p.x.toFixed(1)}, {p.y.toFixed(1)})
              </text>
            </g>
          ))}

          {/* Espejo de agua T */}
          {xMaxAgua > xMinAgua && (
            <text x={X((xMinAgua + xMaxAgua) / 2)} y={waterLevelSvgY - 6} fill="#B7CAD8" fontSize="10" textAnchor="middle" fontWeight="bold">
              Espejo T = {(xMaxAgua - xMinAgua).toFixed(2)} m
            </text>
          )}
        </svg>

        <div className="absolute top-2 right-2 flex items-center gap-2">
          <button
            onClick={() => setAnimActive(!animActive)}
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors"
            title={animActive ? 'Pausar oleaje' : 'Reanudar oleaje'}
          >
            <Waves className="w-4 h-4 text-cyan-400" />
          </button>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------
  // SECCIONES REGULARES DE CANAL ABIERTO (Trapezoidal, Rectangular, Triangular, Parabólica)
  // -----------------------------------------------------------------
  const altoFisico = (blVal > 0 ? yVal + blVal : yVal * 1.35) || 1.5;
  const bEff = tipo === 'Triangular' ? 0 : (tipo === 'Parabólica' ? (b || 2.0) : (b || 1.5));
  const zEff = (tipo === 'Rectangular' || tipo === 'Parabólica') ? 0 : (z || 1.0);

  const getHalfW = (h: number) => {
    if (tipo === 'Parabólica') {
      return (bEff / 2) * Math.sqrt(Math.max(0, h));
    }
    return bEff / 2 + zEff * h;
  };

  const topW = getHalfW(altoFisico);
  const extX = topW * 0.4 + altoFisico * 0.15;
  const th = altoFisico * 0.22;
  const spanX = 2 * (topW + extX);

  esc = Math.min((viewW - 2 * padX) / spanX, (viewH - padTop - padBot) / (altoFisico + th));
  const X = (valX: number) => viewW / 2 + valX * esc;
  const Y = (valY: number) => (viewH - padBot - th * esc) - valY * esc;

  // Curvas según sección
  let ptsBorde: [number, number][] = [];
  if (tipo === 'Parabólica') {
    const steps = 30;
    for (let i = 0; i <= steps; i++) {
      const h_i = altoFisico * (1 - i / steps);
      ptsBorde.push([-getHalfW(h_i), h_i]);
    }
    for (let i = 1; i <= steps; i++) {
      const h_i = altoFisico * (i / steps);
      ptsBorde.push([getHalfW(h_i), h_i]);
    }
  } else {
    ptsBorde = [
      [-topW, altoFisico],
      [-bEff / 2, 0],
      [bEff / 2, 0],
      [topW, altoFisico]
    ];
  }

  const xo = topW + extX;
  const ptsTerreno = [
    [-xo, altoFisico],
    ...ptsBorde,
    [xo, altoFisico],
    [xo, -th],
    [-xo, -th]
  ];

  const dTerreno = `M ${X(ptsTerreno[0][0])} ${Y(ptsTerreno[0][1])} ` +
    ptsTerreno.slice(1).map(p => `L ${X(p[0])} ${Y(p[1])}`).join(' ') + ' Z';

  // Agua
  let dAgua = '';
  const yAgua = yVal;
  const hwAgua = getHalfW(yAgua);
  const waterLevelSvgY = Y(yAgua);

  if (yAgua > 0) {
    let ptsAgua: [number, number][] = [];
    if (tipo === 'Parabólica') {
      const steps = 25;
      for (let i = 0; i <= steps; i++) {
        const h_i = yAgua * (1 - i / steps);
        ptsAgua.push([-getHalfW(h_i), h_i]);
      }
      for (let i = 1; i <= steps; i++) {
        const h_i = yAgua * (i / steps);
        ptsAgua.push([getHalfW(h_i), h_i]);
      }
    } else {
      ptsAgua = [
        [-hwAgua, yAgua],
        [-bEff / 2, 0],
        [bEff / 2, 0],
        [hwAgua, yAgua]
      ];
    }
    dAgua = `M ${X(ptsAgua[0][0])} ${Y(ptsAgua[0][1])} ` +
      ptsAgua.slice(1).map(p => `L ${X(p[0])} ${Y(p[1])}`).join(' ') + ' Z';
  }

  return (
    <div className="relative rounded-xl overflow-hidden bg-slate-900 border border-slate-800 shadow-inner">
      <svg viewBox={`0 0 ${viewW} ${viewH}`} className="w-full h-auto select-none">
        <defs>
          <linearGradient id="channelSoilGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4A3D2D" />
            <stop offset="100%" stopColor="#282015" />
          </linearGradient>
          <linearGradient id="regularWaterGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8BE0EE" stopOpacity="0.88" />
            <stop offset="100%" stopColor="#17708A" stopOpacity="0.96" />
          </linearGradient>
          <pattern id="soilDotsRegular" x="0" y="0" width="16" height="16" patternUnits="userSpaceOnUse">
            <circle cx="3" cy="3" r="1.1" fill="#8E7755" opacity="0.3" />
            <circle cx="11" cy="9" r="1.4" fill="#A88E66" opacity="0.25" />
          </pattern>
        </defs>

        {/* Terreno */}
        <path d={dTerreno} fill="url(#channelSoilGrad)" />
        <path d={dTerreno} fill="url(#soilDotsRegular)" />

        {/* Línea de contorno de paredes del canal */}
        <path
          d={`M ${X(ptsBorde[0][0])} ${Y(ptsBorde[0][1])} ` + ptsBorde.slice(1).map(p => `L ${X(p[0])} ${Y(p[1])}`).join(' ')}
          fill="none"
          stroke={revestido ? '#7E8D99' : '#B8A074'}
          strokeWidth={revestido ? '8' : '3.5'}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {revestido && (
          <path
            d={`M ${X(ptsBorde[0][0])} ${Y(ptsBorde[0][1])} ` + ptsBorde.slice(1).map(p => `L ${X(p[0])} ${Y(p[1])}`).join(' ')}
            fill="none"
            stroke="#E4EBF0"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Borde pasto */}
        <line x1={X(-xo)} y1={Y(altoFisico)} x2={X(-topW)} y2={Y(altoFisico)} stroke="#78A25A" strokeWidth="4" />
        <line x1={X(topW)} y1={Y(altoFisico)} x2={X(xo)} y2={Y(altoFisico)} stroke="#78A25A" strokeWidth="4" />

        {/* Agua */}
        {yAgua > 0 && (
          <>
            <path d={dAgua} fill="url(#regularWaterGrad)" />
            {/* Espejo de agua */}
            <line x1={X(-hwAgua)} y1={waterLevelSvgY} x2={X(hwAgua)} y2={waterLevelSvgY} stroke="#56CBE0" strokeWidth="2.5" />
            {/* Olas */}
            <path
              d={`M ${X(-hwAgua)} ${waterLevelSvgY} Q ${X(0) + Math.sin(animOffset * Math.PI * 2) * 10} ${waterLevelSvgY - 1.6}, ${X(hwAgua)} ${waterLevelSvgY}`}
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="1.2"
              opacity="0.75"
            />
          </>
        )}

        {/* Línea de borde libre */}
        {blVal > 0 && (
          <line
            x1={X(-topW)}
            y1={Y(altoFisico)}
            x2={X(topW)}
            y2={Y(altoFisico)}
            stroke="#F0A94B"
            strokeWidth="2"
            strokeDasharray="6,3"
          />
        )}

        {/* Cotas */}
        {/* Cota Tirante y */}
        <line x1={X(0)} y1={Y(0)} x2={X(0)} y2={waterLevelSvgY} stroke="#E6EEF4" strokeWidth="1.5" />
        <circle cx={X(0)} cy={Y(0)} r="3" fill="#E6EEF4" />
        <circle cx={X(0)} cy={waterLevelSvgY} r="3" fill="#E6EEF4" />
        <rect x={X(0) + 12} y={(Y(0) + waterLevelSvgY) / 2 - 12} width="95" height="24" rx="6" fill="#0D1923" stroke="#25405A" />
        <text x={X(0) + 59} y={(Y(0) + waterLevelSvgY) / 2 + 4} fill="#56CBE0" fontSize="12" fontWeight="bold" textAnchor="middle">
          {etiqueta} = {yVal.toFixed(3)} m
        </text>

        {/* Cota Borde Libre si existe */}
        {blVal > 0 && (
          <>
            <line x1={X(0)} y1={waterLevelSvgY} x2={X(0)} y2={Y(altoFisico)} stroke="#F0A94B" strokeWidth="1.5" />
            <circle cx={X(0)} cy={Y(altoFisico)} r="3" fill="#F0A94B" />
            <rect x={X(0) - 105} y={(waterLevelSvgY + Y(altoFisico)) / 2 - 12} width="95" height="24" rx="6" fill="#0D1923" stroke="#7A5A2E" />
            <text x={X(0) - 57} y={(waterLevelSvgY + Y(altoFisico)) / 2 + 4} fill="#F0A94B" fontSize="11" fontWeight="bold" textAnchor="middle">
              BL = {blVal.toFixed(2)} m
            </text>
          </>
        )}

        {/* Cota ancho solera b si aplica */}
        {bEff > 0 && tipo !== 'Triangular' && (
          <>
            <line x1={X(-bEff / 2)} y1={Y(0) + 14} x2={X(bEff / 2)} y2={Y(0) + 14} stroke="#8DA4B6" strokeWidth="1.2" />
            <line x1={X(-bEff / 2)} y1={Y(0) + 8} x2={X(-bEff / 2)} y2={Y(0) + 20} stroke="#8DA4B6" strokeWidth="1.2" />
            <line x1={X(bEff / 2)} y1={Y(0) + 8} x2={X(bEff / 2)} y2={Y(0) + 20} stroke="#8DA4B6" strokeWidth="1.2" />
            <rect x={X(0) - 40} y={Y(0) + 4} width="80" height="20" rx="4" fill="#0D1923" stroke="#25405A" />
            <text x={X(0)} y={Y(0) + 18} fill="#B7CAD8" fontSize="11" textAnchor="middle">
              b = {bEff.toFixed(2)} m
            </text>
          </>
        )}

        {/* Talud z si aplica */}
        {zEff > 0 && (
          <text x={X(topW) - 15} y={Y(altoFisico / 2)} fill="#8DA4B6" fontSize="11" fontWeight="bold">
            z = {zEff.toFixed(2)}
          </text>
        )}
      </svg>

      <div className="absolute top-2 right-2 flex items-center gap-2">
        <button
          onClick={() => setAnimActive(!animActive)}
          className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors"
          title={animActive ? 'Pausar oleaje' : 'Reanudar oleaje'}
        >
          <Waves className="w-4 h-4 text-cyan-400" />
        </button>
      </div>
    </div>
  );
};
