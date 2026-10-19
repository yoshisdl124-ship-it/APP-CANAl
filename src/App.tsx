/**
 * EL CAUDALOSO - Hidráulica de Canales Abiertos
 * Escuela Profesional de Ingeniería Civil, UNCP
 * Aplicación Web Integral de Hidráulica de Canales
 */

import React, { useState, useEffect } from 'react';
import { 
  Waves, 
  Layers, 
  ArrowLeftRight, 
  Activity, 
  Compass, 
  TrendingUp, 
  ShieldAlert, 
  Sparkles, 
  FileText, 
  Copy, 
  RotateCcw, 
  Download, 
  Calculator, 
  Check, 
  AlertCircle, 
  ChevronRight, 
  Info,
  Maximize2,
  Bookmark,
  Trash2,
  Sliders,
  Plus,
  Minus,
  PenTool,
  ArrowDownRight,
  ArrowUpRight,
  ArrowRight,
  Table as TableIcon,
  SlidersHorizontal,
  RefreshCw,
  MoveUp,
  MoveDown
} from 'lucide-react';

import { 
  SectionType, 
  RoughnessMode, 
  FreeboardMode, 
  CowanState, 
  InverseUnknown, 
  CompoundMode,
  CompoundTerrace,
  CompoundSegment,
  HistoryRecord
} from './types/hydraulics';

import { 
  geometria, 
  caudalManning, 
  froude, 
  clasificarRegimen, 
  biseccion, 
  calcularBordeLibreVillon, 
  nHorton, 
  G, 
  calcularCowan,
  COWAN_DATA 
} from './utils/hydraulicsCore';

import { 
  resolverCalculoInverso, 
  obtenerIncognitasPorSeccion 
} from './utils/inverseSolvers';

import { 
  calcularSeccionCompuesta, 
  convertirTramosACoordenadas,
  ClassicCompoundParams, 
  MultiTerraceParams 
} from './utils/compoundSolvers';

import { SectionCanvas } from './components/SectionCanvas';
import { CowanModal } from './components/CowanModal';
import { ReportModal } from './components/ReportModal';

type ModuleKey = 
  | 'inicio' 
  | 'normal' 
  | 'critico' 
  | 'caudal' 
  | 'inverso' 
  | 'meh' 
  | 'minima' 
  | 'compuesta' 
  | 'resalto' 
  | 'remanso';

export default function App() {
  const [activeModule, setActiveModule] = useState<ModuleKey>('inverso');
  const [activeTab, setActiveTab] = useState<'datos' | 'rugosidad' | 'borde_libre'>('datos');

  // Modales
  const [cowanOpen, setCowanOpen] = useState(false);
  const [cowanFieldKey, setCowanFieldKey] = useState<string>('n');
  const [reportOpen, setReportOpen] = useState(false);
  const [cowanStates, setCowanStates] = useState<Record<string, CowanState>>({});
  const [copiedNotification, setCopiedNotification] = useState(false);

  // Historial de cálculos
  const [history, setHistory] = useState<HistoryRecord[]>(() => {
    try {
      const saved = localStorage.getItem('el_caudaloso_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('el_caudaloso_history', JSON.stringify(history));
    } catch {}
  }, [history]);

  const saveToHistory = (
    modulo: string, 
    titulo: string, 
    resumen: string, 
    datosEntrada: Record<string, any>, 
    resultados: Record<string, any>
  ) => {
    const item: HistoryRecord = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }),
      modulo,
      titulo,
      resumen,
      datosEntrada,
      resultados
    };
    setHistory((prev) => [item, ...prev.slice(0, 19)]);
  };

  // -------------------------------------------------------------
  // ESTADOS DE DATOS - MÓDULO CÁLCULO INVERSO (MULTISECCIÓN)
  // -------------------------------------------------------------
  const [invTipo, setInvTipo] = useState<SectionType>('Trapezoidal');
  const [invIncognita, setInvIncognita] = useState<InverseUnknown>('S');
  const [invQ, setInvQ] = useState<number>(5.0);
  const [invY, setInvY] = useState<number>(1.2);
  const [invS, setInvS] = useState<number>(0.001);
  const [invN, setInvN] = useState<number>(0.015);
  const [invB, setInvB] = useState<number>(1.5);
  const [invZ, setInvZ] = useState<number>(1.0);
  const [invD, setInvD] = useState<number>(2.0);
  const [invRugMode, setInvRugMode] = useState<RoughnessMode>('Valor único');
  const [invNf, setInvNf] = useState<number>(0.015);
  const [invNi, setInvNi] = useState<number>(0.020);
  const [invNd, setInvNd] = useState<number>(0.030);
  const [invBlMode, setInvBlMode] = useState<FreeboardMode>('No incluir');

  const [invResult, setInvResult] = useState<ReturnType<typeof resolverCalculoInverso> | null>(null);
  const [invError, setInvError] = useState<string | null>(null);

  // Al cambiar de sección en cálculo inverso, validar que la incógnita sea válida
  useEffect(() => {
    const opcionesValidas = obtenerIncognitasPorSeccion(invTipo).map(o => o.valor);
    if (!opcionesValidas.includes(invIncognita)) {
      setInvIncognita('S');
    }
  }, [invTipo]);

  const handleCalcularInverso = () => {
    setInvError(null);
    try {
      const res = resolverCalculoInverso({
        tipo: invTipo,
        incognita: invIncognita,
        Q: invQ,
        y: invY,
        S: invS,
        n: invN,
        b: invB,
        z: invZ,
        d: invD,
        rugMode: invRugMode,
        nf: invNf,
        ni: invNi,
        nd: invNd,
        blMode: invBlMode
      });
      setInvResult(res);
      saveToHistory(
        'inverso',
        `Cálculo Inverso (${invTipo})`,
        `${res.parametroResuelto.nombre}: ${res.parametroResuelto.formateado} ${res.parametroResuelto.unidad}`,
        { tipo: invTipo, incognita: invIncognita, Q: invQ, y: invY, S: invS, n: invN, b: invB, z: invZ, d: invD },
        res.hidraulica
      );
    } catch (err: any) {
      setInvError(err.message || 'Error en el cálculo inverso.');
      setInvResult(null);
    }
  };

  // -------------------------------------------------------------
  // ESTADOS DE DATOS - MÓDULO SECCIÓN COMPUESTA (UNIVERSAL)
  // -------------------------------------------------------------
  const [compModo, setCompModo] = useState<CompoundMode>('clasica_asimetrica');
  const [compTarget, setCompTarget] = useState<'Q' | 'y'>('Q'); // 'Q' = calcular Q dado y; 'y' = calcular y dado Q
  const [compTipoCanal, setCompTipoCanal] = useState<SectionType>('Trapezoidal');
  const [compQ, setCompQ] = useState<number>(25.0);
  const [compY, setCompY] = useState<number>(2.2);
  const [compB, setCompB] = useState<number>(4.0);
  const [compZ, setCompZ] = useState<number>(1.0);
  const [compS, setCompS] = useState<number>(0.001);
  const [compNc, setCompNc] = useState<number>(0.025);
  // Planicies independientes (Asimétrica)
  const [compHIzq, setCompHIzq] = useState<number>(1.5);
  const [compHDer, setCompHDer] = useState<number>(1.8);
  const [compBi, setCompBi] = useState<number>(6.0);
  const [compBd, setCompBd] = useState<number>(8.0);
  const [compZiExt, setCompZiExt] = useState<number>(0.0);
  const [compZdExt, setCompZdExt] = useState<number>(0.5);
  const [compNi, setCompNi] = useState<number>(0.045);
  const [compNd, setCompNd] = useState<number>(0.050);

  // Multi-Terrazas / Bermas
  const [compHCanal, setCompHCanal] = useState<number>(1.5);
  const [compTerrazas, setCompTerrazas] = useState<CompoundTerrace[]>([
    { id: '1', nombre: 'Berma Izquierda 1', lado: 'izq', cotaPiso: 1.5, ancho: 5.0, taludExterior: 0.5, n: 0.040 },
    { id: '2', nombre: 'Planicie Mayor Izquierda 2', lado: 'izq', cotaPiso: 2.5, ancho: 12.0, taludExterior: 1.0, n: 0.060 },
    { id: '3', nombre: 'Berma Derecha 1', lado: 'der', cotaPiso: 1.8, ancho: 7.0, taludExterior: 0.0, n: 0.045 }
  ]);

  // Constructor Libre por Tramos (Distancias y Taludes)
  const [compTramos, setCompTramos] = useState<CompoundSegment[]>([
    { id: '1', nombre: 'Talud Ext. Izq.', distanciaX: 3.0, taludZ: 1.5, direccion: 'bajada', n: 0.045 },
    { id: '2', nombre: 'Berma / Banqueta Izq.', distanciaX: 4.0, taludZ: 0.0, direccion: 'horizontal', n: 0.035 },
    { id: '3', nombre: 'Talud Cauce Principal', distanciaX: 2.0, taludZ: 1.0, direccion: 'bajada', n: 0.025 },
    { id: '4', nombre: 'Solera / Fondo Canal', distanciaX: 4.0, taludZ: 0.0, direccion: 'horizontal', n: 0.020 },
    { id: '5', nombre: 'Talud Subida Derecha', distanciaX: 2.0, taludZ: 1.0, direccion: 'subida', n: 0.025 },
    { id: '6', nombre: 'Berma Derecha', distanciaX: 5.0, taludZ: 0.0, direccion: 'horizontal', n: 0.035 },
    { id: '7', nombre: 'Talud Ext. Der.', distanciaX: 4.0, taludZ: 2.0, direccion: 'subida', n: 0.050 }
  ]);

  const presetsTramos = [
    {
      nombre: 'Canal con Banqueta Izq. y Der. (Estándar)',
      tramos: [
        { id: '1', nombre: 'Talud Ext. Izq.', distanciaX: 2.5, taludZ: 1.0, direccion: 'bajada' as const, n: 0.040 },
        { id: '2', nombre: 'Berma Izquierda', distanciaX: 3.5, taludZ: 0.0, direccion: 'horizontal' as const, n: 0.030 },
        { id: '3', nombre: 'Talud Cauce Izq.', distanciaX: 1.5, taludZ: 1.0, direccion: 'bajada' as const, n: 0.022 },
        { id: '4', nombre: 'Solera Central', distanciaX: 3.0, taludZ: 0.0, direccion: 'horizontal' as const, n: 0.018 },
        { id: '5', nombre: 'Talud Cauce Der.', distanciaX: 1.5, taludZ: 1.0, direccion: 'subida' as const, n: 0.022 },
        { id: '6', nombre: 'Berma Derecha', distanciaX: 3.5, taludZ: 0.0, direccion: 'horizontal' as const, n: 0.030 },
        { id: '7', nombre: 'Talud Ext. Der.', distanciaX: 2.5, taludZ: 1.0, direccion: 'subida' as const, n: 0.040 }
      ]
    },
    {
      nombre: 'Canal Asimétrico (Muro Vertical + Planicie Tendida)',
      tramos: [
        { id: '1', nombre: 'Muro vertical izquierdo', distanciaX: 0.05, taludZ: 0.05, direccion: 'bajada' as const, n: 0.015 },
        { id: '2', nombre: 'Fondo de canal', distanciaX: 3.0, taludZ: 0.0, direccion: 'horizontal' as const, n: 0.018 },
        { id: '3', nombre: 'Talud medio derecho', distanciaX: 1.5, taludZ: 1.5, direccion: 'subida' as const, n: 0.025 },
        { id: '4', nombre: 'Planicie de inundación', distanciaX: 8.0, taludZ: 0.0, direccion: 'horizontal' as const, n: 0.045 },
        { id: '5', nombre: 'Talud exterior derecho', distanciaX: 3.0, taludZ: 2.0, direccion: 'subida' as const, n: 0.050 }
      ]
    },
    {
      nombre: 'Cauce Escalonado de 3 Niveles de Crecidas',
      tramos: [
        { id: '1', nombre: 'Talud Terraza Alta Izq.', distanciaX: 3.0, taludZ: 1.5, direccion: 'bajada' as const, n: 0.050 },
        { id: '2', nombre: 'Terraza Alta Izq.', distanciaX: 5.0, taludZ: 0.0, direccion: 'horizontal' as const, n: 0.045 },
        { id: '3', nombre: 'Talud Terraza Media Izq.', distanciaX: 1.5, taludZ: 1.0, direccion: 'bajada' as const, n: 0.035 },
        { id: '4', nombre: 'Terraza Media Izq.', distanciaX: 3.0, taludZ: 0.0, direccion: 'horizontal' as const, n: 0.030 },
        { id: '5', nombre: 'Talud Cauce Menor Izq.', distanciaX: 1.0, taludZ: 1.0, direccion: 'bajada' as const, n: 0.025 },
        { id: '6', nombre: 'Fondo Cauce Menor (Estiaje)', distanciaX: 2.5, taludZ: 0.0, direccion: 'horizontal' as const, n: 0.022 },
        { id: '7', nombre: 'Talud Cauce Menor Der.', distanciaX: 1.0, taludZ: 1.0, direccion: 'subida' as const, n: 0.025 },
        { id: '8', nombre: 'Terraza Media Der.', distanciaX: 4.0, taludZ: 0.0, direccion: 'horizontal' as const, n: 0.030 },
        { id: '9', nombre: 'Talud Terraza Alta Der.', distanciaX: 2.0, taludZ: 1.0, direccion: 'subida' as const, n: 0.035 },
        { id: '10', nombre: 'Terraza Alta Der.', distanciaX: 6.0, taludZ: 0.0, direccion: 'horizontal' as const, n: 0.045 },
        { id: '11', nombre: 'Talud de Cierre Der.', distanciaX: 3.0, taludZ: 1.5, direccion: 'subida' as const, n: 0.050 }
      ]
    }
  ];

  const [compActiveView, setCompActiveView] = useState<'grafico' | 'coordenadas' | 'hidraulica'>('grafico');
  const [compSelectedTramoId, setCompSelectedTramoId] = useState<string | null>(null);

  // Duplicar simétricamente la sección (Espejo)
  const handleReflejarSimetrico = () => {
    if (compTramos.length === 0) return;
    const copia = [...compTramos];
    const tieneSoleraAlFinal = copia[copia.length - 1].direccion === 'horizontal';
    const tramosParaEspejo = tieneSoleraAlFinal ? copia.slice(0, copia.length - 1).reverse() : copia.slice().reverse();
    
    const nuevosTramos: CompoundSegment[] = tramosParaEspejo.map((t) => ({
      id: 'espejo_' + Math.random().toString(36).substring(2, 9),
      nombre: `${t.nombre.replace(' (Simétrico)', '')} (Simétrico)`,
      distanciaX: t.distanciaX,
      taludZ: t.taludZ,
      direccion: t.direccion === 'bajada' ? 'subida' : t.direccion === 'subida' ? 'bajada' : 'horizontal',
      n: t.n
    }));
    setCompTramos([...copia, ...nuevosTramos]);
  };

  // Restablecer tramos a sección básica
  const handleLimpiarTramos = () => {
    setCompTramos([
      { id: '1', nombre: 'Talud Izquierdo', distanciaX: 2.0, taludZ: 1.0, direccion: 'bajada', n: 0.025 },
      { id: '2', nombre: 'Solera Central', distanciaX: 3.0, taludZ: 0.0, direccion: 'horizontal', n: 0.020 },
      { id: '3', nombre: 'Talud Derecho', distanciaX: 2.0, taludZ: 1.0, direccion: 'subida', n: 0.025 }
    ]);
  };

  // Copiar tabla de coordenadas al portapapeles
  const handleCopiarCoordenadas = () => {
    const { puntos, tramosConExtremos } = convertirTramosACoordenadas(compTramos);
    let txt = "Vértice\tX_Estación (m)\tY_Cota (m)\tTramo\tLongitud (m)\tTalud Z\n";
    puntos.forEach((p, idx) => {
      const tramo = idx > 0 && tramosConExtremos[idx - 1] ? tramosConExtremos[idx - 1] : null;
      const nombreTramo = tramo ? tramo.nombre : "Vértice Inicial";
      const dx = tramo ? Math.abs(tramo.pFin.x - tramo.pInicio.x) : 0;
      const dy = tramo ? Math.abs(tramo.pFin.y - tramo.pInicio.y) : 0;
      const len = Math.sqrt(dx * dx + dy * dy);
      const taludStr = tramo ? (tramo.direccion === 'horizontal' ? 'Horizontal (Z=0)' : `Z=${tramo.taludZ} (${tramo.direccion})`) : '-';
      txt += `V${idx}\t${p.x.toFixed(3)}\t${p.y.toFixed(3)}\t${nombreTramo}\t${len.toFixed(3)}\t${taludStr}\n`;
    });
    navigator.clipboard.writeText(txt);
    setCopiedNotification(true);
    setTimeout(() => setCopiedNotification(false), 2500);
  };

  // Mover tramo arriba o abajo
  const handleMoverTramo = (idx: number, direccion: 'arriba' | 'abajo') => {
    if (direccion === 'arriba' && idx === 0) return;
    if (direccion === 'abajo' && idx === compTramos.length - 1) return;
    const targetIdx = direccion === 'arriba' ? idx - 1 : idx + 1;
    const copia = [...compTramos];
    const temp = copia[idx];
    copia[idx] = copia[targetIdx];
    copia[targetIdx] = temp;
    setCompTramos(copia);
  };

  // Duplicar un tramo
  const handleDuplicarTramo = (idx: number) => {
    const orig = compTramos[idx];
    const dup: CompoundSegment = {
      ...orig,
      id: Math.random().toString(36).substring(2, 9),
      nombre: `${orig.nombre} (Copia)`
    };
    const copia = [...compTramos];
    copia.splice(idx + 1, 0, dup);
    setCompTramos(copia);
  };

  const [compResult, setCompResult] = useState<ReturnType<typeof calcularSeccionCompuesta> | null>(null);
  const [compError, setCompError] = useState<string | null>(null);

  const handleCalcularCompuesta = () => {
    setCompError(null);
    try {
      let res;
      if (compModo === 'clasica_asimetrica') {
        const paramsAsim: ClassicCompoundParams = {
          tipoCanal: compTipoCanal,
          b: compB,
          z: compZ,
          h_izq: compHIzq,
          h_der: compHDer,
          Bi: compBi,
          Bd: compBd,
          zi_ext: compZiExt,
          zd_ext: compZdExt,
          nc: compNc,
          ni: compNi,
          nd: compNd,
          S: compS
        };
        res = calcularSeccionCompuesta('clasica_asimetrica', compTarget, compTarget === 'Q' ? compY : compQ, paramsAsim);
      } else if (compModo === 'multi_terrazas') {
        const paramsMulti: MultiTerraceParams = {
          tipoCanal: compTipoCanal,
          b: compB,
          z: compZ,
          h_canal: compHCanal,
          nc: compNc,
          terrazas: compTerrazas,
          S: compS
        };
        res = calcularSeccionCompuesta('multi_terrazas', compTarget, compTarget === 'Q' ? compY : compQ, undefined, paramsMulti);
      } else {
        // Modo 'constructor_libre'
        res = calcularSeccionCompuesta(
          'constructor_libre',
          compTarget,
          compTarget === 'Q' ? compY : compQ,
          undefined,
          undefined,
          { tramos: compTramos, S: compS }
        );
      }

      setCompResult(res);

      const descModo = compModo === 'clasica_asimetrica'
        ? 'Asimétrica'
        : compModo === 'multi_terrazas'
        ? 'Multi-Terrazas'
        : 'Por Tramos (Distancias y Talud)';

      saveToHistory(
        'compuesta',
        `Sección Compuesta (${descModo})`,
        compTarget === 'Q' ? `Caudal Total: ${res.QTotal.toFixed(3)} m³/s` : `Tirante Total: ${res.yTotal.toFixed(3)} m`,
        { modo: compModo, target: compTarget, Q: compQ, y: compY, S: compS },
        { Q: res.QTotal, y: res.yTotal, A: res.ATotal, P: res.PTotal, V: res.VMedia }
      );
    } catch (err: any) {
      setCompError(err.message || 'Error en el cálculo de sección compuesta.');
      setCompResult(null);
    }
  };

  // -------------------------------------------------------------
  // ESTADOS DE DATOS - MÓDULO TIRANTE NORMAL
  // -------------------------------------------------------------
  const [normTipo, setNormTipo] = useState<SectionType>('Trapezoidal');
  const [normQ, setNormQ] = useState<number>(5.0);
  const [normS, setNormS] = useState<number>(0.001);
  const [normN, setNormN] = useState<number>(0.015);
  const [normB, setNormB] = useState<number>(1.5);
  const [normZ, setNormZ] = useState<number>(1.0);
  const [normD, setNormD] = useState<number>(2.0);
  const [normBlMode, setNormBlMode] = useState<FreeboardMode>('No incluir');

  const [normResult, setNormResult] = useState<{
    yn: number;
    A: number;
    P: number;
    R: number;
    T: number;
    V: number;
    Fr: number;
    regimen: string;
    bl?: number;
    revestido?: boolean | null;
  } | null>(null);
  const [normError, setNormError] = useState<string | null>(null);

  const handleCalcularNormal = () => {
    setNormError(null);
    try {
      const isCirc = normTipo === 'Circular';
      const bEff = normTipo in ['Trapezoidal', 'Rectangular'] ? normB : 0;
      const zEff = normTipo in ['Trapezoidal', 'Triangular'] ? normZ : 0;
      const dEff = normTipo === 'Circular' ? normD : 0;

      const f = (yTest: number) => caudalManning(normTipo, yTest, bEff, zEff, dEff, normS, normN) - normQ;
      const hi = isCirc ? 0.938 * dEff : 50.0;
      const yn = biseccion(f, 1e-4, hi, !isCirc);

      const geo = geometria(normTipo, yn, bEff, zEff, dEff);
      const V = geo.A > 0 ? normQ / geo.A : 0;
      const Fr = froude(V, geo.A, geo.T);
      const reg = clasificarRegimen(Fr);

      const blInfo = !isCirc ? calcularBordeLibreVillon(normBlMode, normQ, bEff, yn) : null;

      const res = {
        yn,
        A: geo.A,
        P: geo.P,
        R: geo.R,
        T: geo.T,
        V,
        Fr,
        regimen: reg,
        bl: blInfo?.bl,
        revestido: blInfo?.revestido
      };
      setNormResult(res);
      saveToHistory(
        'normal',
        `Tirante Normal (${normTipo})`,
        `yn = ${yn.toFixed(4)} m`,
        { tipo: normTipo, Q: normQ, S: normS, n: normN, b: normB, z: normZ },
        res
      );
    } catch (err: any) {
      setNormError(err.message || 'Error al calcular el tirante normal.');
      setNormResult(null);
    }
  };

  // -------------------------------------------------------------
  // ESTADOS DE DATOS - MÓDULO TIRANTE CRÍTICO
  // -------------------------------------------------------------
  const [critTipo, setCritTipo] = useState<SectionType>('Trapezoidal');
  const [critQ, setCritQ] = useState<number>(5.0);
  const [critB, setCritB] = useState<number>(1.5);
  const [critZ, setCritZ] = useState<number>(1.0);
  const [critD, setCritD] = useState<number>(2.0);

  const [critResult, setCritResult] = useState<{
    yc: number;
    Ac: number;
    Tc: number;
    Vc: number;
    Emin: number;
  } | null>(null);
  const [critError, setCritError] = useState<string | null>(null);

  const handleCalcularCritico = () => {
    setCritError(null);
    try {
      const isCirc = critTipo === 'Circular';
      const bEff = critTipo in ['Trapezoidal', 'Rectangular'] ? critB : 0;
      const zEff = critTipo in ['Trapezoidal', 'Triangular'] ? critZ : 0;
      const dEff = critTipo === 'Circular' ? critD : 0;

      const f = (y: number) => {
        const { A, T } = geometria(critTipo, y, bEff, zEff, dEff);
        return A > 0 ? (critQ * critQ * T) / (G * Math.pow(A, 3)) - 1.0 : 1e9;
      };

      const yc = biseccion(f, 1e-4, isCirc ? 0.999 * dEff : 50.0, !isCirc);
      const { A, T } = geometria(critTipo, yc, bEff, zEff, dEff);
      const Vc = critQ / A;
      const Emin = yc + (Vc * Vc) / (2 * G);

      setCritResult({ yc, Ac: A, Tc: T, Vc, Emin });
    } catch (err: any) {
      setCritError(err.message || 'Error al calcular el tirante crítico.');
      setCritResult(null);
    }
  };

  // -------------------------------------------------------------
  // ESTADOS DE DATOS - MÓDULO RESALTO HIDRÁULICO
  // -------------------------------------------------------------
  const [resQ, setResQ] = useState<number>(5.0);
  const [resB, setResB] = useState<number>(1.5);
  const [resY1, setResY1] = useState<number>(0.3);
  const [resResult, setResResult] = useState<{
    y2: number;
    v1: number;
    fr1: number;
    v2: number;
    fr2: number;
    dE: number;
    porcPerdida: number;
  } | null>(null);
  const [resError, setResError] = useState<string | null>(null);

  const handleCalcularResalto = () => {
    setResError(null);
    try {
      const v1 = resQ / (resB * resY1);
      const fr1 = v1 / Math.sqrt(G * resY1);
      if (fr1 <= 1.0) {
        throw new Error(`El flujo aguas arriba es subcrítico (Fr1 = ${fr1.toFixed(3)}). El resalto hidráulico requiere Fr1 > 1.0.`);
      }
      const y2 = (resY1 / 2.0) * (Math.sqrt(1 + 8 * fr1 * fr1) - 1);
      const v2 = resQ / (resB * y2);
      const fr2 = v2 / Math.sqrt(G * y2);
      const dE = Math.pow(y2 - resY1, 3) / (4 * resY1 * y2);
      const E1 = resY1 + (v1 * v1) / (2 * G);
      const porcPerdida = (dE / E1) * 100;

      setResResult({ y2, v1, fr1, v2, fr2, dE, porcPerdida });
    } catch (err: any) {
      setResError(err.message || 'Error al calcular el resalto hidráulico.');
      setResResult(null);
    }
  };

  // -------------------------------------------------------------
  // ESTADOS DE DATOS - CURVAS DE REMANSO
  // -------------------------------------------------------------
  const [remYn, setRemYn] = useState<number>(1.2);
  const [remYc, setRemYc] = useState<number>(0.8);
  const [remY, setRemY] = useState<number>(1.5);
  const [remResult, setRemResult] = useState<{
    tipoPendiente: string;
    perfil: string;
    descripcion: string;
  } | null>(null);

  const handleCalcularRemanso = () => {
    let tipoPendiente = '';
    let perfil = '';
    let descripcion = '';

    if (remYn > remYc) {
      tipoPendiente = 'Suave (M - Mild)';
      if (remY > remYn) {
        perfil = 'M1';
        descripcion = 'Curva de remanso: Tirante superior al normal (flujo subcrítico). El agua se eleva gradualmente hacia aguas abajo (ej. presa o embalse).';
      } else if (remY > remYc) {
        perfil = 'M2';
        descripcion = 'Curva de caída: Tirante entre yc e yn con flujo subcrítico. El agua acelera y desciende hacia aguas abajo (ej. vertedero o caída libre).';
      } else {
        perfil = 'M3';
        descripcion = 'Curva de resalto: Tirante inferior a yc con flujo supercrítico. El tirante se eleva hacia aguas abajo y formará un resalto hidráulico.';
      }
    } else if (remYn < remYc) {
      tipoPendiente = 'Empinada (S - Steep)';
      if (remY > remYc) {
        perfil = 'S1';
        descripcion = 'Tirante sobre yc con flujo subcrítico en pendiente fuerte. Curva de remanso retardado con resalto aguas arriba.';
      } else if (remY > remYn) {
        perfil = 'S2';
        descripcion = 'Tirante entre yn e yc (flujo supercrítico). Curva de caída que se acerca asintóticamente a yn.';
      } else {
        perfil = 'S3';
        descripcion = 'Tirante bajo yn (flujo supercrítico). Curva de aceleración que asciende hacia yn.';
      }
    } else {
      tipoPendiente = 'Crítica (C - Critical)';
      perfil = remY > remYn ? 'C1' : 'C3';
      descripcion = 'Con pendiente crítica (yn = yc), la superficie es inestable con perfiles C1 o C3.';
    }

    if (Math.abs(remY - remYn) < 1e-4) {
      perfil = 'Flujo Uniforme';
      descripcion = 'El tirante actual coincide con el tirante normal yn: el flujo es estrictamente paralelo a la solera.';
    }

    setRemResult({ tipoPendiente, perfil, descripcion });
  };

  // Copiar resultados al portapapeles
  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedNotification(true);
    setTimeout(() => setCopiedNotification(false), 2000);
  };

  // Cálculo inicial al montar
  useEffect(() => {
    handleCalcularInverso();
  }, []);

  return (
    <div className="flex h-screen bg-[#0F1B27] text-slate-100 font-sans overflow-hidden">
      {/* ----------------------------------------------------------- */}
      {/* BARRA LATERAL (SIDEBAR) */}
      {/* ----------------------------------------------------------- */}
      <aside className="w-64 bg-[#09131C] border-r border-[#1B2F42] flex flex-col shrink-0 select-none">
        {/* Cabecera / Marca */}
        <div className="p-4 border-b border-[#1B2F42] flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-teal-700 flex items-center justify-center shadow-lg shadow-cyan-900/30">
            <Waves className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="text-sm font-black tracking-tight text-white flex items-center gap-1.5">
              <span>EL CAUDALOSO</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-900/80 text-cyan-300 font-mono font-bold">2.0</span>
            </div>
            <div className="text-[11px] text-slate-400">Hidráulica de Canales · UNCP</div>
          </div>
        </div>

        {/* Navegación por módulos */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-6">
          {/* Grupo 1: Tirantes y Caudales */}
          <div className="space-y-1">
            <div className="px-3 text-[10px] uppercase font-bold tracking-wider text-cyan-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
              <span>Tirantes y Caudales</span>
            </div>
            <button
              onClick={() => setActiveModule('inverso')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeModule === 'inverso'
                  ? 'bg-[#152B3D] text-cyan-300 border border-cyan-800/60 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#122230]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <ArrowLeftRight className="w-4 h-4 text-cyan-400" />
                <span>Cálculo Inverso</span>
              </div>
              <span className="text-[9px] px-1 rounded bg-cyan-950 text-cyan-300 font-bold border border-cyan-800/40">Multi</span>
            </button>
            <button
              onClick={() => setActiveModule('normal')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeModule === 'normal'
                  ? 'bg-[#152B3D] text-cyan-300 border border-cyan-800/60'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#122230]'
              }`}
            >
              <Layers className="w-4 h-4 text-cyan-400" />
              <span>Tirante Normal</span>
            </button>
            <button
              onClick={() => setActiveModule('critico')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeModule === 'critico'
                  ? 'bg-[#152B3D] text-cyan-300 border border-cyan-800/60'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#122230]'
              }`}
            >
              <Activity className="w-4 h-4 text-cyan-400" />
              <span>Tirante Crítico</span>
            </button>
          </div>

          {/* Grupo 2: Diseño de Secciones */}
          <div className="space-y-1">
            <div className="px-3 text-[10px] uppercase font-bold tracking-wider text-indigo-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
              <span>Diseño de Secciones</span>
            </div>
            <button
              onClick={() => setActiveModule('compuesta')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeModule === 'compuesta'
                  ? 'bg-[#18233C] text-indigo-300 border border-indigo-800/60 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#122230]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Compass className="w-4 h-4 text-indigo-400" />
                <span>Sección Compuesta</span>
              </div>
              <span className="text-[9px] px-1 rounded bg-indigo-950 text-indigo-300 font-bold border border-indigo-800/40">Universal</span>
            </button>
            <button
              onClick={() => setActiveModule('meh')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeModule === 'meh'
                  ? 'bg-[#18233C] text-indigo-300 border border-indigo-800/60'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#122230]'
              }`}
            >
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <span>Máxima Eficiencia (MEH)</span>
            </button>
            <button
              onClick={() => setActiveModule('minima')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeModule === 'minima'
                  ? 'bg-[#18233C] text-indigo-300 border border-indigo-800/60'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#122230]'
              }`}
            >
              <ShieldAlert className="w-4 h-4 text-indigo-400" />
              <span>Mínima Infiltración</span>
            </button>
          </div>

          {/* Grupo 3: Flujo Variado */}
          <div className="space-y-1">
            <div className="px-3 text-[10px] uppercase font-bold tracking-wider text-emerald-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              <span>Flujo Variado</span>
            </div>
            <button
              onClick={() => setActiveModule('resalto')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeModule === 'resalto'
                  ? 'bg-[#112D27] text-emerald-300 border border-emerald-800/60'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#122230]'
              }`}
            >
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <span>Resalto Hidráulico</span>
            </button>
            <button
              onClick={() => setActiveModule('remanso')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeModule === 'remanso'
                  ? 'bg-[#112D27] text-emerald-300 border border-emerald-800/60'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#122230]'
              }`}
            >
              <Waves className="w-4 h-4 text-emerald-400" />
              <span>Curvas de Remanso</span>
            </button>
          </div>
        </nav>

        {/* Pie de Sidebar: Escuela Profesional de Ingeniería Civil, UNCP */}
        <div className="p-3 border-t border-[#1B2F42] bg-[#070E14] text-[11px] text-slate-400 space-y-1.5">
          <div className="font-semibold text-slate-300 flex items-center justify-between">
            <span>UNCP Civil</span>
            <span className="text-[10px] text-cyan-400">v2.0 Build</span>
          </div>
          <div className="text-[10px] text-slate-500 leading-tight">
            Escuela Profesional de Ingeniería Civil · Huancayo, Perú
          </div>
          <a
            href="/assets/aistudio/el_caudaloso_23b1a79c.PY"
            download="el_caudaloso_actualizado.py"
            className="mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-cyan-400 text-[11px] font-medium transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Descargar Python (.py)
          </a>
        </div>
      </aside>

      {/* ----------------------------------------------------------- */}
      {/* ÁREA PRINCIPAL */}
      {/* ----------------------------------------------------------- */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Banner Superior con Olas */}
        <header className="relative bg-gradient-to-r from-[#0A1C2B] via-[#123647] to-[#165668] border-b border-[#25405A] p-6 shrink-0 overflow-hidden">
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase font-extrabold tracking-wider text-cyan-300">
                  {activeModule === 'inverso' && 'Cálculo Inverso Multisección'}
                  {activeModule === 'compuesta' && 'Constructor Universal de Secciones Compuestas'}
                  {activeModule === 'normal' && 'Flujo Uniforme · Manning'}
                  {activeModule === 'critico' && 'Régimen Crítico · Fr = 1.0'}
                  {activeModule === 'meh' && 'Máxima Eficiencia Hidráulica'}
                  {activeModule === 'minima' && 'Mínima Infiltración'}
                  {activeModule === 'resalto' && 'Fenómeno de Resalto Hidráulico'}
                  {activeModule === 'remanso' && 'Curvas de Remanso y Perfiles'}
                </span>
                <span className="text-slate-400">·</span>
                <span className="text-xs text-slate-300">UNCP Civil</span>
              </div>
              <h1 className="text-2xl font-black text-white mt-1 tracking-tight">
                {activeModule === 'inverso' && 'Cálculo Inverso Multisección'}
                {activeModule === 'compuesta' && 'Sección Compuesta Multi-Terrazas'}
                {activeModule === 'normal' && 'Tirante Normal de Flujo Uniforme'}
                {activeModule === 'critico' && 'Tirante Crítico y Energía Mínima'}
                {activeModule === 'meh' && 'Secciones de Máxima Eficiencia Hidráulica'}
                {activeModule === 'minima' && 'Secciones de Mínima Infiltración'}
                {activeModule === 'resalto' && 'Resalto Hidráulico en Canales'}
                {activeModule === 'remanso' && 'Clasificación de Perfiles de Remanso'}
              </h1>
              <p className="text-xs text-cyan-100/80 mt-1 max-w-2xl">
                {activeModule === 'inverso' && 'Resuelve cualquier incógnita (S, n, b, z, D, y) para secciones Trapezoidal, Rectangular, Triangular, Circular, Parabólica y Semicircular.'}
                {activeModule === 'compuesta' && 'Construye secciones asimétricas y con múltiples niveles de bermas o planicies de inundación sin límites.'}
                {activeModule === 'normal' && 'Determina la profundidad normal yn para caudal y pendiente conocidas con la ecuación de Manning.'}
                {activeModule === 'critico' && 'Halla el tirante yc donde el número de Froude es exactamente 1.0 y la energía específica es mínima.'}
                {activeModule === 'meh' && 'Calcula las dimensiones que conducen el máximo caudal para un área hidráulica determinada.'}
                {activeModule === 'minima' && 'Optimiza la sección para minimizar el perímetro mojado y las pérdidas de agua por infiltración.'}
                {activeModule === 'resalto' && 'Determina los tirantes conjugados y1, y2, Froude y disipación de energía ΔE en saltos de régimen.'}
                {activeModule === 'remanso' && 'Determina la curva de flujo gradual (M, S, C) evaluando la relación entre yn, yc y el tirante de control.'}
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                onClick={() => setReportOpen(true)}
                className="px-4 py-2 text-xs font-bold rounded-lg bg-slate-900/60 hover:bg-slate-900 text-cyan-300 border border-cyan-700/50 flex items-center gap-2 shadow-sm transition-all"
              >
                <FileText className="w-4 h-4" />
                Informe Técnico PDF
              </button>
            </div>
          </div>
        </header>

        {/* ----------------------------------------------------------- */}
        {/* CONTENIDO DEL MÓDULO ACTIVO */}
        {/* ----------------------------------------------------------- */}
        <div className="flex-1 p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* ========================================================= */}
          {/* MÓDULO: CÁLCULO INVERSO MULTISECCIÓN */}
          {/* ========================================================= */}
          {activeModule === 'inverso' && (
            <>
              {/* Panel de Entradas (Izq) */}
              <div className="lg:col-span-5 bg-[#162534] border border-[#25405A] rounded-2xl shadow-xl overflow-hidden flex flex-col">
                {/* Pestañas de entrada */}
                <div className="flex border-b border-[#25405A] bg-[#1B2F42]">
                  <button
                    onClick={() => setActiveTab('datos')}
                    className={`flex-1 py-3 text-xs font-bold border-b-2 transition-colors ${
                      activeTab === 'datos'
                        ? 'border-cyan-400 text-cyan-300 bg-[#162534]'
                        : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Datos Geométricos
                  </button>
                  <button
                    onClick={() => setActiveTab('rugosidad')}
                    className={`flex-1 py-3 text-xs font-bold border-b-2 transition-colors ${
                      activeTab === 'rugosidad'
                        ? 'border-cyan-400 text-cyan-300 bg-[#162534]'
                        : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Rugosidad n
                  </button>
                  <button
                    onClick={() => setActiveTab('borde_libre')}
                    className={`flex-1 py-3 text-xs font-bold border-b-2 transition-colors ${
                      activeTab === 'borde_libre'
                        ? 'border-cyan-400 text-cyan-300 bg-[#162534]'
                        : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Borde Libre
                  </button>
                </div>

                <div className="p-5 space-y-4">
                  {activeTab === 'datos' && (
                    <>
                      {/* Selector de Tipo de Sección */}
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-300">Tipo de Sección Transversal:</label>
                        <select
                          value={invTipo}
                          onChange={(e) => setInvTipo(e.target.value as SectionType)}
                          className="w-full bg-[#0D1923] border border-[#25405A] rounded-lg px-3 py-2 text-sm text-cyan-300 font-bold focus:outline-none focus:border-cyan-400"
                        >
                          <option value="Trapezoidal">Trapezoidal</option>
                          <option value="Rectangular">Rectangular</option>
                          <option value="Triangular">Triangular</option>
                          <option value="Circular">Circular (Tubería)</option>
                          <option value="Parabólica">Parabólica</option>
                          <option value="Semicircular">Semicircular</option>
                        </select>
                      </div>

                      {/* Selector de Incógnita */}
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-cyan-300 flex items-center justify-between">
                          <span>¿Qué incógnita desea despejar?</span>
                          <span className="text-[10px] text-slate-400 font-normal">Fórmula de Manning</span>
                        </label>
                        <select
                          value={invIncognita}
                          onChange={(e) => setInvIncognita(e.target.value as InverseUnknown)}
                          className="w-full bg-[#0B2130] border border-cyan-600/70 rounded-lg px-3 py-2 text-sm text-white font-black focus:outline-none"
                        >
                          {obtenerIncognitasPorSeccion(invTipo).map((opt) => (
                            <option key={opt.valor} value={opt.valor}>
                              {opt.etiqueta}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Campos numéricos con activación dinámica según incógnita */}
                      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800">
                        {/* Caudal Q */}
                        <div className="space-y-1">
                          <label className="text-xs text-slate-300">Caudal Q (m³/s):</label>
                          <input
                            type="number"
                            step="0.01"
                            value={invQ}
                            onChange={(e) => setInvQ(parseFloat(e.target.value) || 0)}
                            className="w-full bg-[#0D1923] border border-[#25405A] rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-100"
                          />
                        </div>

                        {/* Tirante y */}
                        <div className="space-y-1">
                          <label className={`text-xs ${invIncognita === 'y' ? 'text-cyan-400 font-bold' : 'text-slate-300'}`}>
                            Tirante y (m) {invIncognita === 'y' && '(Incógnita)'}:
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            disabled={invIncognita === 'y'}
                            value={invY}
                            onChange={(e) => setInvY(parseFloat(e.target.value) || 0)}
                            className={`w-full border rounded-lg px-3 py-1.5 text-sm font-semibold ${
                              invIncognita === 'y'
                                ? 'bg-cyan-950/40 border-cyan-700/50 text-cyan-400 cursor-not-allowed'
                                : 'bg-[#0D1923] border-[#25405A] text-slate-100'
                            }`}
                          />
                        </div>

                        {/* Pendiente S */}
                        <div className="space-y-1">
                          <label className={`text-xs ${invIncognita === 'S' ? 'text-cyan-400 font-bold' : 'text-slate-300'}`}>
                            Pendiente S (m/m) {invIncognita === 'S' && '(Incógnita)'}:
                          </label>
                          <input
                            type="number"
                            step="0.0001"
                            disabled={invIncognita === 'S'}
                            value={invS}
                            onChange={(e) => setInvS(parseFloat(e.target.value) || 0)}
                            className={`w-full border rounded-lg px-3 py-1.5 text-sm font-semibold ${
                              invIncognita === 'S'
                                ? 'bg-cyan-950/40 border-cyan-700/50 text-cyan-400 cursor-not-allowed'
                                : 'bg-[#0D1923] border-[#25405A] text-slate-100'
                            }`}
                          />
                        </div>

                        {/* Rugosidad n */}
                        <div className="space-y-1">
                          <label className={`text-xs ${invIncognita === 'n' ? 'text-cyan-400 font-bold' : 'text-slate-300'}`}>
                            Rugosidad n {invIncognita === 'n' && '(Incógnita)'}:
                          </label>
                          <input
                            type="number"
                            step="0.001"
                            disabled={invIncognita === 'n'}
                            value={invN}
                            onChange={(e) => setInvN(parseFloat(e.target.value) || 0)}
                            className={`w-full border rounded-lg px-3 py-1.5 text-sm font-semibold ${
                              invIncognita === 'n'
                                ? 'bg-cyan-950/40 border-cyan-700/50 text-cyan-400 cursor-not-allowed'
                                : 'bg-[#0D1923] border-[#25405A] text-slate-100'
                            }`}
                          />
                        </div>

                        {/* Ancho de solera b (si aplica) */}
                        {(invTipo === 'Trapezoidal' || invTipo === 'Rectangular' || invTipo === 'Parabólica') && (
                          <div className="space-y-1">
                            <label className={`text-xs ${invIncognita === 'b' ? 'text-cyan-400 font-bold' : 'text-slate-300'}`}>
                              {invTipo === 'Parabólica' ? 'Ancho de corona b (m)' : 'Ancho solera b (m)'} {invIncognita === 'b' && '(Incógnita)'}:
                            </label>
                            <input
                              type="number"
                              step="0.05"
                              disabled={invIncognita === 'b'}
                              value={invB}
                              onChange={(e) => setInvB(parseFloat(e.target.value) || 0)}
                              className={`w-full border rounded-lg px-3 py-1.5 text-sm font-semibold ${
                                invIncognita === 'b'
                                  ? 'bg-cyan-950/40 border-cyan-700/50 text-cyan-400 cursor-not-allowed'
                                  : 'bg-[#0D1923] border-[#25405A] text-slate-100'
                              }`}
                            />
                          </div>
                        )}

                        {/* Talud z (si aplica) */}
                        {(invTipo === 'Trapezoidal' || invTipo === 'Triangular') && (
                          <div className="space-y-1">
                            <label className={`text-xs ${invIncognita === 'z' ? 'text-cyan-400 font-bold' : 'text-slate-300'}`}>
                              Talud lateral z (H:V) {invIncognita === 'z' && '(Incógnita)'}:
                            </label>
                            <input
                              type="number"
                              step="0.1"
                              disabled={invIncognita === 'z'}
                              value={invZ}
                              onChange={(e) => setInvZ(parseFloat(e.target.value) || 0)}
                              className={`w-full border rounded-lg px-3 py-1.5 text-sm font-semibold ${
                                invIncognita === 'z'
                                  ? 'bg-cyan-950/40 border-cyan-700/50 text-cyan-400 cursor-not-allowed'
                                  : 'bg-[#0D1923] border-[#25405A] text-slate-100'
                              }`}
                            />
                          </div>
                        )}

                        {/* Diámetro D (si aplica) */}
                        {(invTipo === 'Circular' || invTipo === 'Semicircular') && (
                          <div className="space-y-1">
                            <label className={`text-xs ${invIncognita === 'd' ? 'text-cyan-400 font-bold' : 'text-slate-300'}`}>
                              Diámetro D (m) {invIncognita === 'd' && '(Incógnita)'}:
                            </label>
                            <input
                              type="number"
                              step="0.05"
                              disabled={invIncognita === 'd'}
                              value={invD}
                              onChange={(e) => setInvD(parseFloat(e.target.value) || 0)}
                              className={`w-full border rounded-lg px-3 py-1.5 text-sm font-semibold ${
                                invIncognita === 'd'
                                  ? 'bg-cyan-950/40 border-cyan-700/50 text-cyan-400 cursor-not-allowed'
                                  : 'bg-[#0D1923] border-[#25405A] text-slate-100'
                              }`}
                            />
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {activeTab === 'rugosidad' && (
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-300">Método de Determinación de Rugosidad:</label>
                        <select
                          value={invRugMode}
                          onChange={(e) => setInvRugMode(e.target.value as RoughnessMode)}
                          className="w-full bg-[#0D1923] border border-[#25405A] rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none"
                        >
                          <option value="Valor único">Valor numérico directo</option>
                          <option value="Cowan">Método de Cowan (1956)</option>
                          <option value="Compuesta (Horton-Einstein)">Rugosidad Compuesta (Fondo y Taludes)</option>
                        </select>
                      </div>

                      {invRugMode === 'Cowan' && (
                        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-300">n calculado por Cowan:</span>
                            <span className="text-base font-bold text-cyan-400">n = {invN.toFixed(4)}</span>
                          </div>
                          <button
                            onClick={() => {
                              setCowanFieldKey('invN');
                              setCowanOpen(true);
                            }}
                            className="w-full py-2 text-xs font-semibold rounded-lg bg-cyan-700 hover:bg-cyan-600 text-white flex items-center justify-center gap-2 transition-colors"
                          >
                            <Calculator className="w-4 h-4" />
                            Configurar factores de Cowan...
                          </button>
                        </div>
                      )}

                      {invRugMode === 'Compuesta (Horton-Einstein)' && (
                        <div className="space-y-3 p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs">
                          <p className="text-slate-400">Distribución de rugosidad en el perímetro:</p>
                          <div className="space-y-2">
                            {invTipo !== 'Triangular' && (
                              <div className="flex items-center justify-between">
                                <span className="text-slate-300">n del Fondo (nf):</span>
                                <input
                                  type="number"
                                  step="0.001"
                                  value={invNf}
                                  onChange={(e) => setInvNf(parseFloat(e.target.value) || 0.015)}
                                  className="w-24 bg-[#0D1923] border border-slate-700 rounded px-2 py-1 text-right text-cyan-300 font-bold"
                                />
                              </div>
                            )}
                            <div className="flex items-center justify-between">
                              <span className="text-slate-300">n Talud Izquierdo (ni):</span>
                              <input
                                type="number"
                                step="0.001"
                                value={invNi}
                                onChange={(e) => setInvNi(parseFloat(e.target.value) || 0.02)}
                                className="w-24 bg-[#0D1923] border border-slate-700 rounded px-2 py-1 text-right text-cyan-300 font-bold"
                              />
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-slate-300">n Talud Derecho (nd):</span>
                              <input
                                type="number"
                                step="0.001"
                                value={invNd}
                                onChange={(e) => setInvNd(parseFloat(e.target.value) || 0.03)}
                                className="w-24 bg-[#0D1923] border border-slate-700 rounded px-2 py-1 text-right text-cyan-300 font-bold"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === 'borde_libre' && (
                    <div className="space-y-3">
                      <label className="text-xs font-semibold text-slate-300">Criterio de Borde Libre (BL):</label>
                      <select
                        value={invBlMode}
                        onChange={(e) => setInvBlMode(e.target.value as FreeboardMode)}
                        className="w-full bg-[#0D1923] border border-[#25405A] rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none"
                      >
                        <option value="No incluir">No incluir en el cálculo</option>
                        <option value="Canal en tierra: y/3 (Villón)">Canal en tierra: y/3 (Pedro Rodríguez Villón)</option>
                        <option value="Canal revestido: y/5 (Villón)">Canal revestido: y/5 (Pedro Rodríguez Villón)</option>
                        <option value="Según el caudal (Villón)">Según el caudal conducido Q (Villón)</option>
                        <option value="Según el ancho de solera (Villón)">Según el ancho de solera b (Villón)</option>
                      </select>
                      <p className="text-[11px] text-slate-400">
                        El borde libre se calcula según las recomendaciones de diseño del Ing. Pedro Rodríguez Villón (Hidráulica de Canales, UNCP).
                      </p>
                    </div>
                  )}

                  {/* Mensaje de error si falla la convergencia */}
                  {invError && (
                    <div className="p-3 rounded-lg bg-red-950/60 border border-red-800 text-xs text-red-300 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                      <span>{invError}</span>
                    </div>
                  )}

                  {/* Botón de Cálculo */}
                  <button
                    onClick={handleCalcularInverso}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white font-bold text-sm shadow-lg shadow-cyan-950/50 flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-[0.99]"
                  >
                    <Calculator className="w-4 h-4" />
                    Calcular {obtenerIncognitasPorSeccion(invTipo).find(o => o.valor === invIncognita)?.etiqueta.split(' ')[0]}
                  </button>
                </div>
              </div>

              {/* Panel de Gráfico y Resultados (Der) */}
              <div className="lg:col-span-7 space-y-6">
                {/* Visualizador de Sección */}
                <div className="bg-[#162534] border border-[#25405A] rounded-2xl p-4 shadow-xl">
                  <div className="flex items-center justify-between mb-3 px-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-300">Geometría Transversal Calculada:</span>
                      <span className="text-xs text-cyan-400 font-mono">({invTipo})</span>
                    </div>
                    {invResult?.hidraulica.bl && (
                      <span className="text-[11px] px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800/60 font-semibold">
                        Borde Libre: {invResult.hidraulica.bl.toFixed(2)} m
                      </span>
                    )}
                  </div>

                  <SectionCanvas
                    tipo={invTipo}
                    y={invResult ? invResult.hidraulica.y || invY : invY}
                    b={invResult ? invResult.dibujoParams.b : invB}
                    z={invResult ? invResult.dibujoParams.z : invZ}
                    d={invResult ? invResult.dibujoParams.d : invD}
                    bl={invResult?.hidraulica.bl}
                    revestido={invResult?.hidraulica.revestido}
                    etiqueta={invIncognita === 'y' ? 'y (calc)' : 'y'}
                    height={280}
                  />
                </div>

                {/* Tarjetas de Resultados */}
                {invResult && (
                  <div className="bg-[#162534] border border-[#25405A] rounded-2xl p-5 shadow-xl space-y-4">
                    {/* Tarjeta Principal destacada */}
                    <div className="p-4 rounded-xl bg-gradient-to-r from-[#123447] to-[#162534] border border-cyan-800/60 flex items-center justify-between">
                      <div>
                        <span className="text-xs font-semibold text-cyan-300">
                          {invResult.parametroResuelto.nombre}:
                        </span>
                        <div className="text-3xl font-black text-cyan-400 mt-1">
                          {invResult.parametroResuelto.formateado}{' '}
                          <span className="text-sm font-normal text-slate-300">{invResult.parametroResuelto.unidad}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleCopyText(`${invResult.parametroResuelto.nombre}: ${invResult.parametroResuelto.formateado} ${invResult.parametroResuelto.unidad}`)}
                        className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors"
                        title="Copiar resultado"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Mosaico de propiedades hidráulicas */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="p-3 rounded-xl bg-[#1B2F42] border border-slate-800">
                        <div className="text-[11px] text-slate-400">Área Hidráulica (A)</div>
                        <div className="text-base font-bold text-slate-100 mt-0.5">{invResult.hidraulica.A.toFixed(4)} m²</div>
                      </div>
                      <div className="p-3 rounded-xl bg-[#1B2F42] border border-slate-800">
                        <div className="text-[11px] text-slate-400">Perímetro Mojado (P)</div>
                        <div className="text-base font-bold text-slate-100 mt-0.5">{invResult.hidraulica.P.toFixed(4)} m</div>
                      </div>
                      <div className="p-3 rounded-xl bg-[#1B2F42] border border-slate-800">
                        <div className="text-[11px] text-slate-400">Radio Hidráulico (R)</div>
                        <div className="text-base font-bold text-slate-100 mt-0.5">{invResult.hidraulica.R.toFixed(4)} m</div>
                      </div>
                      <div className="p-3 rounded-xl bg-[#1B2F42] border border-slate-800">
                        <div className="text-[11px] text-slate-400">Espejo de Agua (T)</div>
                        <div className="text-base font-bold text-slate-100 mt-0.5">{invResult.hidraulica.T.toFixed(4)} m</div>
                      </div>
                      <div className="p-3 rounded-xl bg-[#1B2F42] border border-slate-800">
                        <div className="text-[11px] text-slate-400">Velocidad Media (V)</div>
                        <div className="text-base font-bold text-slate-100 mt-0.5">{invResult.hidraulica.V.toFixed(3)} m/s</div>
                      </div>
                      <div className="p-3 rounded-xl bg-[#1B2F42] border border-slate-800">
                        <div className="text-[11px] text-slate-400">Número de Froude (Fr)</div>
                        <div className="text-base font-bold text-cyan-300 mt-0.5">
                          {invResult.hidraulica.Fr.toFixed(3)} ({invResult.hidraulica.regimen})
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-[#1B2F42] border border-slate-800">
                        <div className="text-[11px] text-slate-400">Energía Específica (E)</div>
                        <div className="text-base font-bold text-slate-100 mt-0.5">{invResult.hidraulica.E?.toFixed(3)} m</div>
                      </div>
                      <div className="p-3 rounded-xl bg-[#1B2F42] border border-slate-800">
                        <div className="text-[11px] text-slate-400">Rugosidad n aplicada</div>
                        <div className="text-base font-bold text-slate-100 mt-0.5">{invResult.hidraulica.n?.toFixed(4)}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ========================================================= */}
          {/* MÓDULO: SECCIÓN COMPUESTA (UNIVERSAL) */}
          {/* ========================================================= */}
          {activeModule === 'compuesta' && (
            <>
              {/* Formulario Izquierda */}
              <div className="lg:col-span-5 bg-[#162534] border border-[#25405A] rounded-2xl shadow-xl overflow-hidden flex flex-col">
                <div className="p-4 bg-[#1B2F42] border-b border-[#25405A] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2">
                    <Compass className="w-5 h-5 text-indigo-400 shrink-0" />
                    <span className="text-xs font-bold text-slate-100">Configuración de Sección Compuesta</span>
                  </div>
                  <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-lg border border-slate-800 shrink-0">
                    <button
                      onClick={() => setCompModo('clasica_asimetrica')}
                      className={`px-2 py-1 text-[11px] font-semibold rounded transition-colors ${
                        compModo === 'clasica_asimetrica'
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Asimétrica
                    </button>
                    <button
                      onClick={() => setCompModo('multi_terrazas')}
                      className={`px-2 py-1 text-[11px] font-semibold rounded transition-colors ${
                        compModo === 'multi_terrazas'
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Multi-Bermas
                    </button>
                    <button
                      onClick={() => setCompModo('constructor_libre')}
                      className={`px-2 py-1 text-[11px] font-bold rounded flex items-center gap-1 transition-colors ${
                        compModo === 'constructor_libre'
                          ? 'bg-cyan-600 text-white shadow-sm'
                          : 'text-cyan-300 hover:text-cyan-100'
                      }`}
                    >
                      <Sliders className="w-3 h-3" />
                      <span>Por Tramos (ΔX y Talud)</span>
                    </button>
                  </div>
                </div>

                <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
                  {/* Selector de cálculo: Caudal Q o Tirante y */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">¿Qué desea calcular?</label>
                    <select
                      value={compTarget}
                      onChange={(e) => setCompTarget(e.target.value as 'Q' | 'y')}
                      className="w-full bg-[#0D1923] border border-[#25405A] rounded-lg px-3 py-2 text-sm text-cyan-300 font-bold focus:outline-none"
                    >
                      <option value="Q">Calcular Caudal total Q (conocido el Tirante y)</option>
                      <option value="y">Calcular Tirante normal y (conocido el Caudal de diseño Q)</option>
                    </select>
                  </div>

                  {/* Parámetros Básicos */}
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800">
                    <div className="space-y-1">
                      <label className="text-xs text-slate-300">Pendiente S (m/m):</label>
                      <input
                        type="number"
                        step="0.0001"
                        value={compS}
                        onChange={(e) => setCompS(parseFloat(e.target.value) || 0)}
                        className="w-full bg-[#0D1923] border border-[#25405A] rounded px-3 py-1.5 text-sm font-semibold"
                      />
                    </div>
                    {compTarget === 'Q' ? (
                      <div className="space-y-1">
                        <label className="text-xs text-cyan-400 font-bold">Tirante total y (m):</label>
                        <input
                          type="number"
                          step="0.05"
                          value={compY}
                          onChange={(e) => setCompY(parseFloat(e.target.value) || 0)}
                          className="w-full bg-[#0D1923] border border-cyan-700/60 rounded px-3 py-1.5 text-sm font-bold text-cyan-300"
                        />
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <label className="text-xs text-cyan-400 font-bold">Caudal Q diseño (m³/s):</label>
                        <input
                          type="number"
                          step="0.5"
                          value={compQ}
                          onChange={(e) => setCompQ(parseFloat(e.target.value) || 0)}
                          className="w-full bg-[#0D1923] border border-cyan-700/60 rounded px-3 py-1.5 text-sm font-bold text-cyan-300"
                        />
                      </div>
                    )}
                  </div>

                  {/* -------------------------------------------------------- */}
                  {/* MODO 3: CONSTRUCTOR LIBRE POR TRAMOS (DISTANCIAS Y TALUDES) */}
                  {/* -------------------------------------------------------- */}
                  {compModo === 'constructor_libre' ? (() => {
                    const coords = convertirTramosACoordenadas(compTramos);
                    const anchoTotal = coords.xMax - coords.xMin;
                    const altoTotal = coords.yMax;

                    return (
                      <div className="space-y-4">
                        {/* Cabecera Técnica del Dibujo */}
                        <div className="p-3.5 rounded-xl bg-gradient-to-r from-[#0C2436] to-[#122A3E] border border-cyan-800/60 shadow-inner space-y-2.5">
                          <div className="flex items-center justify-between">
                            <div className="font-bold text-cyan-300 flex items-center gap-2 text-xs">
                              <PenTool className="w-4 h-4 text-cyan-400" />
                              <span>Panel de Dibujo: Sección por Distancias y Talud</span>
                            </div>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800/60 font-mono font-bold">
                              {compTramos.length} Tramos
                            </span>
                          </div>
                          
                          <p className="text-slate-300 text-[11px] leading-relaxed">
                            Dibuje cualquier sección transversal arbitraria ingresando únicamente la distancia horizontal <strong>ΔX (m)</strong> y el talud lateral <strong>Z (H:V)</strong> o desnivel <strong>ΔY</strong> para cada tramo consecutivo de izquierda a derecha.
                          </p>

                          {/* Estadísticas en vivo de la geometría */}
                          <div className="grid grid-cols-3 gap-2 pt-1 border-t border-cyan-900/40 text-[11px] font-mono">
                            <div className="bg-[#091522] p-1.5 rounded border border-cyan-900/50">
                              <span className="text-slate-400 block text-[9px] uppercase font-sans">Ancho Total B:</span>
                              <strong className="text-cyan-300">{anchoTotal.toFixed(2)} m</strong>
                            </div>
                            <div className="bg-[#091522] p-1.5 rounded border border-cyan-900/50">
                              <span className="text-slate-400 block text-[9px] uppercase font-sans">Profundidad H:</span>
                              <strong className="text-emerald-400">{altoTotal.toFixed(2)} m</strong>
                            </div>
                            <div className="bg-[#091522] p-1.5 rounded border border-cyan-900/50">
                              <span className="text-slate-400 block text-[9px] uppercase font-sans">Vértices Poligonal:</span>
                              <strong className="text-indigo-300">{coords.puntos.length} puntos</strong>
                            </div>
                          </div>
                        </div>

                        {/* Barra de Herramientas de Dibujo y Acciones Rápidas */}
                        <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-xl bg-slate-900/90 border border-slate-800">
                          <button
                            onClick={() => {
                              const newId = Math.random().toString(36).substring(2, 9);
                              const newSeg: CompoundSegment = {
                                id: newId,
                                nombre: `Tramo ${compTramos.length + 1}`,
                                distanciaX: 2.0,
                                taludZ: 1.0,
                                direccion: 'subida',
                                n: 0.030
                              };
                              setCompTramos([...compTramos, newSeg]);
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-cyan-700 hover:bg-cyan-600 text-white text-[11px] font-bold flex items-center gap-1 shadow-sm transition-all cursor-pointer"
                            title="Agregar un nuevo tramo consecutivo"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Agregar Tramo</span>
                          </button>

                          <button
                            onClick={handleReflejarSimetrico}
                            className="px-2.5 py-1.5 rounded-lg bg-indigo-700/80 hover:bg-indigo-600 text-indigo-100 text-[11px] font-bold flex items-center gap-1 shadow-sm transition-all cursor-pointer"
                            title="Duplica los tramos hacia la derecha de manera simétrica"
                          >
                            <RefreshCw className="w-3.5 h-3.5 text-indigo-300" />
                            <span>Reflejar Simetría</span>
                          </button>

                          <button
                            onClick={handleCopiarCoordenadas}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium flex items-center gap-1 transition-all cursor-pointer"
                            title="Copiar estaciones (X, Y) para AutoCAD / Civil 3D / Excel"
                          >
                            <Copy className="w-3.5 h-3.5 text-cyan-400" />
                            <span>Copiar (X,Y)</span>
                          </button>

                          <button
                            onClick={handleLimpiarTramos}
                            className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-red-950/60 text-slate-400 hover:text-red-300 text-[11px] transition-all ml-auto cursor-pointer"
                            title="Restablecer a sección trapezoidal estándar"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Selector de Plantillas de Ingeniería */}
                        <div className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-900/60 border border-slate-800/80">
                          <span className="text-slate-400 text-[11px] font-medium flex items-center gap-1.5">
                            <Bookmark className="w-3.5 h-3.5 text-amber-400" />
                            <span>Plantilla Rápida:</span>
                          </span>
                          <select
                            onChange={(e) => {
                              const found = presetsTramos.find(p => p.nombre === e.target.value);
                              if (found) {
                                setCompTramos(found.tramos.map(t => ({ ...t, id: Math.random().toString(36).substring(2, 9) })));
                              }
                            }}
                            className="bg-[#0D1923] border border-slate-700 text-cyan-300 text-[11px] rounded px-2 py-1 focus:outline-none max-w-[210px]"
                            defaultValue=""
                          >
                            <option value="" disabled>Cargar plantilla predefinida...</option>
                            {presetsTramos.map((p, idx) => (
                              <option key={idx} value={p.nombre}>{p.nombre}</option>
                            ))}
                          </select>
                        </div>

                        {/* Lista interactiva de Tramos con controles avanzados */}
                        <div className="space-y-2.5 max-h-[46vh] overflow-y-auto pr-1">
                          {compTramos.map((seg, idx) => {
                            // Cálculo exacto del desnivel vertical ΔY
                            let dyNum = 0;
                            let deltaYStr = '0.00 m';
                            if (seg.direccion === 'bajada') {
                              dyNum = seg.taludZ > 0 ? (seg.distanciaX / seg.taludZ) : seg.distanciaX;
                              deltaYStr = `-${dyNum.toFixed(2)} m`;
                            } else if (seg.direccion === 'subida') {
                              dyNum = seg.taludZ > 0 ? (seg.distanciaX / seg.taludZ) : seg.distanciaX;
                              deltaYStr = `+${dyNum.toFixed(2)} m`;
                            }
                            const lenTramo = Math.sqrt(seg.distanciaX * seg.distanciaX + dyNum * dyNum);

                            return (
                              <div
                                key={seg.id || idx}
                                onClick={() => setCompSelectedTramoId(seg.id)}
                                className={`p-3 rounded-xl border transition-all ${
                                  compSelectedTramoId === seg.id
                                    ? 'bg-[#132537] border-cyan-500 shadow-md ring-1 ring-cyan-500/30'
                                    : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                                }`}
                              >
                                {/* Fila Superior: Título, Desnivel, Herramientas de orden */}
                                <div className="flex items-center justify-between text-xs font-semibold text-slate-200 mb-2">
                                  <div className="flex items-center gap-2">
                                    <span className="w-5 h-5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800/80 flex items-center justify-center text-[10px] font-mono font-bold">
                                      {idx + 1}
                                    </span>
                                    <input
                                      type="text"
                                      value={seg.nombre}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setCompTramos(compTramos.map(s => s.id === seg.id ? { ...s, nombre: val } : s));
                                      }}
                                      className="bg-transparent border-b border-transparent hover:border-slate-700 focus:border-cyan-400 px-1 text-slate-100 text-xs font-semibold focus:outline-none max-w-[150px]"
                                    />
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-950 text-slate-300 border border-slate-800">
                                      L={lenTramo.toFixed(2)}m
                                    </span>
                                    <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                                      seg.direccion === 'bajada'
                                        ? 'bg-blue-950/80 text-blue-300 border border-blue-800/60'
                                        : seg.direccion === 'subida'
                                        ? 'bg-purple-950/80 text-purple-300 border border-purple-800/60'
                                        : 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
                                    }`}>
                                      ΔY: {deltaYStr}
                                    </span>

                                    {/* Mover y duplicar */}
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleMoverTramo(idx, 'arriba'); }}
                                      disabled={idx === 0}
                                      className="p-1 text-slate-400 hover:text-slate-100 disabled:opacity-30 cursor-pointer"
                                      title="Subir posición"
                                    >
                                      <MoveUp className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleMoverTramo(idx, 'abajo'); }}
                                      disabled={idx === compTramos.length - 1}
                                      className="p-1 text-slate-400 hover:text-slate-100 disabled:opacity-30 cursor-pointer"
                                      title="Bajar posición"
                                    >
                                      <MoveDown className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleDuplicarTramo(idx); }}
                                      className="p-1 text-slate-400 hover:text-cyan-300 cursor-pointer"
                                      title="Duplicar este tramo"
                                    >
                                      <Copy className="w-3.5 h-3.5" />
                                    </button>
                                    {compTramos.length > 2 && (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); setCompTramos(compTramos.filter(s => s.id !== seg.id)); }}
                                        className="p-1 text-slate-400 hover:text-red-400 cursor-pointer"
                                        title="Eliminar tramo"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {/* Formulario de Entrada: Sentido, Distancia ΔX, Talud Z, Desnivel ΔY, Rugosidad n */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                                  {/* Sentido / Inclinación */}
                                  <div>
                                    <span className="text-[10px] text-slate-400 block font-medium">Inclinación:</span>
                                    <select
                                      value={seg.direccion}
                                      onChange={(e) => {
                                        const dir = e.target.value as 'bajada' | 'horizontal' | 'subida';
                                        setCompTramos(compTramos.map(s => s.id === seg.id ? {
                                          ...s,
                                          direccion: dir,
                                          taludZ: dir === 'horizontal' ? 0 : (s.taludZ > 0 ? s.taludZ : 1.0)
                                        } : s));
                                      }}
                                      className={`w-full mt-1 border rounded px-1.5 py-1 text-[11px] font-bold focus:outline-none ${
                                        seg.direccion === 'bajada'
                                          ? 'bg-blue-950/60 border-blue-700/80 text-blue-200'
                                          : seg.direccion === 'subida'
                                          ? 'bg-purple-950/60 border-purple-700/80 text-purple-200'
                                          : 'bg-emerald-950/60 border-emerald-700/80 text-emerald-200'
                                      }`}
                                    >
                                      <option value="bajada">↘ Bajada</option>
                                      <option value="horizontal">➔ Horizontal</option>
                                      <option value="subida">↗ Subida</option>
                                    </select>
                                  </div>

                                  {/* Distancia horizontal ΔX */}
                                  <div>
                                    <span className="text-[10px] text-slate-400 block font-medium">Distancia ΔX (m):</span>
                                    <input
                                      type="number"
                                      step="0.25"
                                      min="0"
                                      value={seg.distanciaX}
                                      onChange={(e) => {
                                        const val = Math.max(0, parseFloat(e.target.value) || 0);
                                        setCompTramos(compTramos.map(s => s.id === seg.id ? { ...s, distanciaX: val } : s));
                                      }}
                                      className="w-full mt-1 bg-[#0D1923] border border-slate-700 rounded px-2 py-1 font-bold text-slate-100 text-xs focus:border-cyan-400"
                                    />
                                  </div>

                                  {/* Talud Z (H:V) */}
                                  <div>
                                    <span className="text-[10px] text-slate-400 block font-medium">Talud Z (H:1V):</span>
                                    <input
                                      type="number"
                                      step="0.1"
                                      min="0"
                                      disabled={seg.direccion === 'horizontal'}
                                      value={seg.direccion === 'horizontal' ? 0 : seg.taludZ}
                                      onChange={(e) => {
                                        const val = Math.max(0, parseFloat(e.target.value) || 0);
                                        setCompTramos(compTramos.map(s => s.id === seg.id ? { ...s, taludZ: val } : s));
                                      }}
                                      className={`w-full mt-1 border rounded px-2 py-1 font-bold text-xs focus:outline-none ${
                                        seg.direccion === 'horizontal'
                                          ? 'bg-slate-950 border-slate-800 text-slate-600 cursor-not-allowed'
                                          : 'bg-[#0D1923] border-cyan-800/80 text-cyan-300 focus:border-cyan-400'
                                      }`}
                                    />
                                  </div>

                                  {/* Rugosidad Manning n */}
                                  <div>
                                    <span className="text-[10px] text-slate-400 block font-medium">Manning n:</span>
                                    <input
                                      type="number"
                                      step="0.001"
                                      min="0.008"
                                      value={seg.n}
                                      onChange={(e) => {
                                        const val = Math.max(0.005, parseFloat(e.target.value) || 0.025);
                                        setCompTramos(compTramos.map(s => s.id === seg.id ? { ...s, n: val } : s));
                                      }}
                                      className="w-full mt-1 bg-[#0D1923] border border-slate-700 rounded px-2 py-1 font-semibold text-slate-100 text-xs focus:border-cyan-400"
                                    />
                                  </div>
                                </div>

                                {/* Chips de Talud Rápido y Rugosidades Rápidas */}
                                {seg.direccion !== 'horizontal' && (
                                  <div className="flex flex-wrap items-center gap-1 mt-2 pt-1.5 border-t border-slate-800/60 text-[10px]">
                                    <span className="text-slate-500 font-medium">Taludes típicos:</span>
                                    {[
                                      { label: '0.0 (Vert)', z: 0.01 },
                                      { label: '0.5 (Roca)', z: 0.5 },
                                      { label: '1.0 (45°)', z: 1.0 },
                                      { label: '1.5 (Tierra)', z: 1.5 },
                                      { label: '2.0 (Arcilla)', z: 2.0 }
                                    ].map((chip) => (
                                      <button
                                        key={chip.label}
                                        type="button"
                                        onClick={() => {
                                          setCompTramos(compTramos.map(s => s.id === seg.id ? { ...s, taludZ: chip.z } : s));
                                        }}
                                        className={`px-1.5 py-0.5 rounded text-[10px] transition-colors cursor-pointer ${
                                          Math.abs(seg.taludZ - chip.z) < 0.05
                                            ? 'bg-cyan-900 text-cyan-200 border border-cyan-700 font-bold'
                                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                                        }`}
                                      >
                                        {chip.label}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })() : (
                    <>
                      {/* Sección del Canal Central (Modo 1 y 2) */}
                      <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
                        <div className="text-xs font-bold text-cyan-400">Canal Principal Central:</div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-slate-400">Ancho solera b (m):</span>
                            <input
                              type="number"
                              step="0.1"
                              value={compB}
                              onChange={(e) => setCompB(parseFloat(e.target.value) || 0)}
                              className="w-full mt-1 bg-[#0D1923] border border-slate-700 rounded px-2 py-1 text-slate-100 font-semibold"
                            />
                          </div>
                          <div>
                            <span className="text-slate-400">Talud lateral z (H:V):</span>
                            <input
                              type="number"
                              step="0.1"
                              value={compZ}
                              onChange={(e) => setCompZ(parseFloat(e.target.value) || 0)}
                              className="w-full mt-1 bg-[#0D1923] border border-slate-700 rounded px-2 py-1 text-slate-100 font-semibold"
                            />
                          </div>
                          <div className="col-span-2">
                            <span className="text-slate-400">Manning canal nc:</span>
                            <input
                              type="number"
                              step="0.001"
                              value={compNc}
                              onChange={(e) => setCompNc(parseFloat(e.target.value) || 0.025)}
                              className="w-full mt-1 bg-[#0D1923] border border-slate-700 rounded px-2 py-1 text-slate-100 font-semibold"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Configuración Modo 1: Asimétrica */}
                      {compModo === 'clasica_asimetrica' && (
                        <div className="space-y-3">
                          {/* Planicie Izquierda */}
                          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                            <div className="text-xs font-bold text-slate-200 flex items-center justify-between">
                              <span>Margen / Planicie Izquierda:</span>
                              <span className="text-[10px] text-cyan-400">Desborde: +{compHIzq.toFixed(2)}m</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <span className="text-slate-400">Cota desborde hi (m):</span>
                                <input
                                  type="number"
                                  step="0.05"
                                  value={compHIzq}
                                  onChange={(e) => setCompHIzq(parseFloat(e.target.value) || 0)}
                                  className="w-full mt-1 bg-[#0D1923] border border-slate-700 rounded px-2 py-1 font-semibold"
                                />
                              </div>
                              <div>
                                <span className="text-slate-400">Ancho Bi (m):</span>
                                <input
                                  type="number"
                                  step="0.5"
                                  value={compBi}
                                  onChange={(e) => setCompBi(parseFloat(e.target.value) || 0)}
                                  className="w-full mt-1 bg-[#0D1923] border border-slate-700 rounded px-2 py-1 font-semibold"
                                />
                              </div>
                              <div>
                                <span className="text-slate-400">Talud ext. zi:</span>
                                <input
                                  type="number"
                                  step="0.1"
                                  value={compZiExt}
                                  onChange={(e) => setCompZiExt(parseFloat(e.target.value) || 0)}
                                  className="w-full mt-1 bg-[#0D1923] border border-slate-700 rounded px-2 py-1 font-semibold"
                                />
                              </div>
                              <div>
                                <span className="text-slate-400">Manning ni:</span>
                                <input
                                  type="number"
                                  step="0.001"
                                  value={compNi}
                                  onChange={(e) => setCompNi(parseFloat(e.target.value) || 0.045)}
                                  className="w-full mt-1 bg-[#0D1923] border border-slate-700 rounded px-2 py-1 font-semibold"
                                />
                              </div>
                            </div>
                          </div>

                          {/* Planicie Derecha */}
                          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                            <div className="text-xs font-bold text-slate-200 flex items-center justify-between">
                              <span>Margen / Planicie Derecha:</span>
                              <span className="text-[10px] text-cyan-400">Desborde: +{compHDer.toFixed(2)}m</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <span className="text-slate-400">Cota desborde hd (m):</span>
                                <input
                                  type="number"
                                  step="0.05"
                                  value={compHDer}
                                  onChange={(e) => setCompHDer(parseFloat(e.target.value) || 0)}
                                  className="w-full mt-1 bg-[#0D1923] border border-slate-700 rounded px-2 py-1 font-semibold"
                                />
                              </div>
                              <div>
                                <span className="text-slate-400">Ancho Bd (m):</span>
                                <input
                                  type="number"
                                  step="0.5"
                                  value={compBd}
                                  onChange={(e) => setCompBd(parseFloat(e.target.value) || 0)}
                                  className="w-full mt-1 bg-[#0D1923] border border-slate-700 rounded px-2 py-1 font-semibold"
                                />
                              </div>
                              <div>
                                <span className="text-slate-400">Talud ext. zd:</span>
                                <input
                                  type="number"
                                  step="0.1"
                                  value={compZdExt}
                                  onChange={(e) => setCompZdExt(parseFloat(e.target.value) || 0)}
                                  className="w-full mt-1 bg-[#0D1923] border border-slate-700 rounded px-2 py-1 font-semibold"
                                />
                              </div>
                              <div>
                                <span className="text-slate-400">Manning nd:</span>
                                <input
                                  type="number"
                                  step="0.001"
                                  value={compNd}
                                  onChange={(e) => setCompNd(parseFloat(e.target.value) || 0.050)}
                                  className="w-full mt-1 bg-[#0D1923] border border-slate-700 rounded px-2 py-1 font-semibold"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Configuración Modo 2: Multi-Terrazas */}
                      {compModo === 'multi_terrazas' && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between text-xs font-bold text-slate-200">
                            <span>Terrazas / Bermas Escalonadas ({compTerrazas.length}):</span>
                            <button
                              onClick={() => {
                                const newT: CompoundTerrace = {
                                  id: Math.random().toString(),
                                  nombre: `Berma ${compTerrazas.length + 1}`,
                                  lado: 'der',
                                  cotaPiso: 2.0,
                                  ancho: 5.0,
                                  taludExterior: 0.5,
                                  n: 0.045
                                };
                                setCompTerrazas([...compTerrazas, newT]);
                              }}
                              className="px-2 py-1 rounded bg-indigo-700 hover:bg-indigo-600 text-white flex items-center gap-1 text-[11px]"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              Agregar Berma
                            </button>
                          </div>

                          <div className="space-y-2">
                            {compTerrazas.map((t) => (
                              <div key={t.id} className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs space-y-2">
                                <div className="flex items-center justify-between font-semibold text-cyan-300">
                                  <span>{t.nombre}</span>
                                  <button
                                    onClick={() => setCompTerrazas(compTerrazas.filter(item => item.id !== t.id))}
                                    className="text-red-400 hover:text-red-300"
                                  >
                                    <Minus className="w-4 h-4" />
                                  </button>
                                </div>
                                <div className="grid grid-cols-4 gap-1.5 text-[11px]">
                                  <div>
                                    <span className="text-slate-400">Cota (m):</span>
                                    <input
                                      type="number"
                                      step="0.1"
                                      value={t.cotaPiso}
                                      onChange={(e) => {
                                        const val = parseFloat(e.target.value) || 0;
                                        setCompTerrazas(compTerrazas.map(item => item.id === t.id ? { ...item, cotaPiso: val } : item));
                                      }}
                                      className="w-full bg-[#0D1923] border border-slate-700 rounded px-1.5 py-0.5 text-slate-100"
                                    />
                                  </div>
                                  <div>
                                    <span className="text-slate-400">Ancho (m):</span>
                                    <input
                                      type="number"
                                      step="0.5"
                                      value={t.ancho}
                                      onChange={(e) => {
                                        const val = parseFloat(e.target.value) || 0;
                                        setCompTerrazas(compTerrazas.map(item => item.id === t.id ? { ...item, ancho: val } : item));
                                      }}
                                      className="w-full bg-[#0D1923] border border-slate-700 rounded px-1.5 py-0.5 text-slate-100"
                                    />
                                  </div>
                                  <div>
                                    <span className="text-slate-400">Talud z:</span>
                                    <input
                                      type="number"
                                      step="0.1"
                                      value={t.taludExterior}
                                      onChange={(e) => {
                                        const val = parseFloat(e.target.value) || 0;
                                        setCompTerrazas(compTerrazas.map(item => item.id === t.id ? { ...item, taludExterior: val } : item));
                                      }}
                                      className="w-full bg-[#0D1923] border border-slate-700 rounded px-1.5 py-0.5 text-slate-100"
                                    />
                                  </div>
                                  <div>
                                    <span className="text-slate-400">Manning n:</span>
                                    <input
                                      type="number"
                                      step="0.001"
                                      value={t.n}
                                      onChange={(e) => {
                                        const val = parseFloat(e.target.value) || 0.045;
                                        setCompTerrazas(compTerrazas.map(item => item.id === t.id ? { ...item, n: val } : item));
                                      }}
                                      className="w-full bg-[#0D1923] border border-slate-700 rounded px-1.5 py-0.5 text-slate-100"
                                    />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {compError && (
                    <div className="p-3 rounded-lg bg-red-950/60 border border-red-800 text-xs text-red-300 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                      <span>{compError}</span>
                    </div>
                  )}

                  <button
                    onClick={handleCalcularCompuesta}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white font-bold text-sm shadow-lg shadow-indigo-950/50 flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <Calculator className="w-4 h-4" />
                    Calcular Sección Compuesta
                  </button>
                </div>
              </div>

              {/* Panel de Gráfico y Tabla de Subsecciones (Der) */}
              <div className="lg:col-span-7 space-y-6">
                {/* Visualizador de la sección compuesta */}
                <div className="bg-[#162534] border border-[#25405A] rounded-2xl p-4 shadow-xl">
                  <div className="flex items-center justify-between mb-3 px-1">
                    <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                      <Compass className="w-4 h-4 text-cyan-400" />
                      <span>Geometría y Niveles de Inundación:</span>
                    </span>

                    {compModo === 'constructor_libre' ? (
                      <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-lg border border-slate-800 text-xs">
                        <button
                          onClick={() => setCompActiveView('grafico')}
                          className={`px-2.5 py-1 rounded font-bold transition-colors ${
                            compActiveView === 'grafico'
                              ? 'bg-cyan-600 text-white shadow-sm'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          📐 Dibujo
                        </button>
                        <button
                          onClick={() => setCompActiveView('coordenadas')}
                          className={`px-2.5 py-1 rounded font-bold transition-colors ${
                            compActiveView === 'coordenadas'
                              ? 'bg-cyan-600 text-white shadow-sm'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          📋 Puntos (X, Y)
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-indigo-400 font-mono">
                        (Canal Central + Planicies)
                      </span>
                    )}
                  </div>

                  {compModo === 'constructor_libre' && compActiveView === 'coordenadas' ? (
                    (() => {
                      const { puntos, tramosConExtremos, yMax, xMin, xMax } = convertirTramosACoordenadas(compTramos);
                      const curY = compResult ? compResult.yTotal : compY;

                      return (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs">
                            <span className="text-slate-300 font-semibold">
                              Estaciones y Cotas de la Sección Transversal:
                            </span>
                            <button
                              onClick={handleCopiarCoordenadas}
                              className="px-2.5 py-1 rounded-lg bg-cyan-700 hover:bg-cyan-600 text-white text-xs font-bold flex items-center gap-1.5 shadow transition-all cursor-pointer"
                            >
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copiar Tabla (AutoCAD / Excel)</span>
                            </button>
                          </div>

                          <div className="overflow-x-auto border border-slate-800 rounded-xl max-h-[380px] overflow-y-auto">
                            <table className="w-full text-left text-xs border-collapse font-mono">
                              <thead>
                                <tr className="bg-[#1B2F42] text-slate-300 border-b border-slate-700 text-[11px]">
                                  <th className="p-2">Vértice</th>
                                  <th className="p-2 text-cyan-300">Estación X (m)</th>
                                  <th className="p-2 text-emerald-300">Cota Y (m)</th>
                                  <th className="p-2">Tramo</th>
                                  <th className="p-2">ΔX (m)</th>
                                  <th className="p-2">Talud Z</th>
                                  <th className="p-2">Longitud</th>
                                  <th className="p-2">Estado</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-800 text-slate-200 text-xs">
                                {puntos.map((p, idx) => {
                                  const tramo = idx > 0 && tramosConExtremos[idx - 1] ? tramosConExtremos[idx - 1] : null;
                                  const dx = tramo ? Math.abs(tramo.pFin.x - tramo.pInicio.x) : 0;
                                  const dy = tramo ? Math.abs(tramo.pFin.y - tramo.pInicio.y) : 0;
                                  const len = Math.sqrt(dx * dx + dy * dy);
                                  const estaSumergido = p.y <= curY;

                                  return (
                                    <tr key={idx} className="hover:bg-slate-800/60">
                                      <td className="p-2 font-bold text-cyan-400">V{idx}</td>
                                      <td className="p-2 font-bold text-slate-100">{p.x.toFixed(3)}</td>
                                      <td className="p-2 font-bold text-slate-100">{p.y.toFixed(3)}</td>
                                      <td className="p-2 font-sans text-slate-300 text-[11px]">
                                        {tramo ? tramo.nombre : 'Vértice Inicial'}
                                      </td>
                                      <td className="p-2">{tramo ? dx.toFixed(2) : '-'}</td>
                                      <td className="p-2">
                                        {tramo
                                          ? tramo.direccion === 'horizontal'
                                            ? 'Horizontal'
                                            : `Z=${tramo.taludZ}`
                                          : '-'}
                                      </td>
                                      <td className="p-2">{tramo ? len.toFixed(2) + 'm' : '-'}</td>
                                      <td className="p-2">
                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-sans font-bold ${
                                          estaSumergido
                                            ? 'bg-cyan-950 text-cyan-300 border border-cyan-800/60'
                                            : 'bg-slate-800 text-slate-400'
                                        }`}>
                                          {estaSumergido ? 'Bajo agua' : 'Seco'}
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })()
                  ) : (
                    <>
                      <SectionCanvas
                        tipo={compModo === 'constructor_libre' ? 'Compuesta_Tramos' : 'Compuesta_Asimetrica'}
                        tramos={compTramos}
                        y={compResult ? compResult.yTotal : compY}
                        b={compB}
                        z={compZ}
                        h_izq={compHIzq}
                        h_der={compHDer}
                        Bi={compBi}
                        Bd={compBd}
                        zi_ext={compZiExt}
                        zd_ext={compZdExt}
                        etiqueta="y_total"
                        height={320}
                      />

                      {/* Simulador de Llenado en Vivo de Tirante y */}
                      {compModo === 'constructor_libre' && (() => {
                        const coords = convertirTramosACoordenadas(compTramos);
                        return (
                          <div className="mt-3 p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1.5">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-bold text-cyan-300 flex items-center gap-1.5">
                                <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
                                <span>Simular Llenado en Vivo (Tirante de Agua):</span>
                              </span>
                              <span className="font-mono font-bold text-cyan-300 text-sm">
                                y = {(compResult ? compResult.yTotal : compY).toFixed(3)} m
                              </span>
                            </div>
                            <input
                              type="range"
                              min="0.05"
                              max={Math.max(2.5, coords.yMax * 1.2)}
                              step="0.05"
                              value={compResult ? compResult.yTotal : compY}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0.1;
                                setCompY(val);
                                if (compResult && compTarget === 'Q') {
                                  try {
                                    const res = calcularSeccionCompuesta(
                                      'constructor_libre',
                                      'Q',
                                      val,
                                      undefined,
                                      undefined,
                                      { tramos: compTramos, S: compS }
                                    );
                                    setCompResult(res);
                                  } catch {}
                                }
                              }}
                              className="w-full accent-cyan-400 cursor-pointer h-2 bg-slate-800 rounded-lg"
                            />
                            <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                              <span>Fondo del canal (0.00 m)</span>
                              <span>Borde superior ({coords.yMax.toFixed(2)} m)</span>
                            </div>
                          </div>
                        );
                      })()}
                    </>
                  )}
                </div>

                {/* Resultados Hidráulicos y Tabla */}
                {compResult && (
                  <div className="bg-[#162534] border border-[#25405A] rounded-2xl p-5 shadow-xl space-y-4">
                    {/* Tarjeta Principal */}
                    <div className="p-4 rounded-xl bg-gradient-to-r from-[#18233C] to-[#162534] border border-indigo-800/60 flex items-center justify-between">
                      <div>
                        <span className="text-xs font-semibold text-indigo-300">
                          {compResult.target === 'Q' ? 'Caudal Total Conducido (Q):' : 'Tirante Total Requerido (y):'}
                        </span>
                        <div className="text-3xl font-black text-indigo-300 mt-1">
                          {compResult.target === 'Q' ? compResult.QTotal.toFixed(4) : compResult.yTotal.toFixed(4)}{' '}
                          <span className="text-sm font-normal text-slate-300">
                            {compResult.target === 'Q' ? 'm³/s' : 'm'}
                          </span>
                        </div>
                      </div>
                      <div className="text-right text-xs text-slate-400 space-y-1">
                        <div>Velocidad media: <span className="font-bold text-slate-100">{compResult.VMedia.toFixed(3)} m/s</span></div>
                        <div>Froude global: <span className="font-bold text-cyan-300">{compResult.FrGlobal.toFixed(3)} ({compResult.regimen})</span></div>
                      </div>
                    </div>

                    {/* Alertas de inundación */}
                    {compResult.advertencias.map((adv, idx) => (
                      <div key={idx} className="p-2.5 rounded-lg bg-amber-950/40 border border-amber-800/60 text-xs text-amber-300 flex items-start gap-2">
                        <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <span>{adv}</span>
                      </div>
                    ))}

                    {/* Tabla de Subsecciones */}
                    <div className="space-y-2">
                      <div className="text-xs font-bold text-slate-300">Desglose Hidráulico por Subsección:</div>
                      <div className="overflow-x-auto border border-slate-800 rounded-xl">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-[#1B2F42] text-slate-300 border-b border-slate-700">
                              <th className="p-2.5 font-bold">Subsección</th>
                              <th className="p-2.5 font-bold">Área (m²)</th>
                              <th className="p-2.5 font-bold">Perím. (m)</th>
                              <th className="p-2.5 font-bold">Radio R (m)</th>
                              <th className="p-2.5 font-bold">n</th>
                              <th className="p-2.5 font-bold text-cyan-300">Caudal (m³/s)</th>
                              <th className="p-2.5 font-bold">Veloc. (m/s)</th>
                              <th className="p-2.5 font-bold text-indigo-300">% Q</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800 text-slate-200">
                            {compResult.subsecciones.map((s, idx) => (
                              <tr key={idx} className="hover:bg-slate-800/50">
                                <td className="p-2.5 font-semibold text-slate-100">{s.nombre}</td>
                                <td className="p-2.5">{s.A.toFixed(4)}</td>
                                <td className="p-2.5">{s.P.toFixed(4)}</td>
                                <td className="p-2.5">{s.R.toFixed(4)}</td>
                                <td className="p-2.5">{s.n.toFixed(4)}</td>
                                <td className="p-2.5 font-bold text-cyan-300">{s.Q.toFixed(4)}</td>
                                <td className="p-2.5">{s.V.toFixed(3)}</td>
                                <td className="p-2.5 font-semibold text-indigo-300">{s.porcentajeQ.toFixed(1)}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Rugosidades globales */}
                    <div className="grid grid-cols-2 gap-3 text-xs pt-2 border-t border-slate-800">
                      <div className="p-2.5 rounded-lg bg-[#1B2F42] border border-slate-800">
                        <span className="text-slate-400">n equivalente (Horton-Einstein):</span>
                        <div className="text-base font-bold text-slate-100 mt-0.5">{compResult.nEquivalenteHorton.toFixed(4)}</div>
                      </div>
                      <div className="p-2.5 rounded-lg bg-[#1B2F42] border border-slate-800">
                        <span className="text-slate-400">n equivalente (Lotter):</span>
                        <div className="text-base font-bold text-slate-100 mt-0.5">{compResult.nEquivalenteLotter.toFixed(4)}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ========================================================= */}
          {/* MÓDULO: TIRANTE NORMAL */}
          {/* ========================================================= */}
          {activeModule === 'normal' && (
            <>
              <div className="lg:col-span-5 bg-[#162534] border border-[#25405A] rounded-2xl p-5 shadow-xl space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Tipo de Sección:</label>
                  <select
                    value={normTipo}
                    onChange={(e) => setNormTipo(e.target.value as SectionType)}
                    className="w-full bg-[#0D1923] border border-[#25405A] rounded-lg px-3 py-2 text-sm text-cyan-300 font-bold focus:outline-none"
                  >
                    <option value="Trapezoidal">Trapezoidal</option>
                    <option value="Rectangular">Rectangular</option>
                    <option value="Triangular">Triangular</option>
                    <option value="Circular">Circular (Tubería)</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-slate-300">Caudal Q (m³/s):</label>
                    <input
                      type="number"
                      step="0.1"
                      value={normQ}
                      onChange={(e) => setNormQ(parseFloat(e.target.value) || 0)}
                      className="w-full bg-[#0D1923] border border-[#25405A] rounded px-3 py-1.5 text-sm font-semibold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-300">Pendiente S (m/m):</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={normS}
                      onChange={(e) => setNormS(parseFloat(e.target.value) || 0)}
                      className="w-full bg-[#0D1923] border border-[#25405A] rounded px-3 py-1.5 text-sm font-semibold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-300">Rugosidad n:</label>
                    <input
                      type="number"
                      step="0.001"
                      value={normN}
                      onChange={(e) => setNormN(parseFloat(e.target.value) || 0)}
                      className="w-full bg-[#0D1923] border border-[#25405A] rounded px-3 py-1.5 text-sm font-semibold"
                    />
                  </div>
                  {normTipo !== 'Triangular' && normTipo !== 'Circular' && (
                    <div className="space-y-1">
                      <label className="text-xs text-slate-300">Ancho solera b (m):</label>
                      <input
                        type="number"
                        step="0.1"
                        value={normB}
                        onChange={(e) => setNormB(parseFloat(e.target.value) || 0)}
                        className="w-full bg-[#0D1923] border border-[#25405A] rounded px-3 py-1.5 text-sm font-semibold"
                      />
                    </div>
                  )}
                  {(normTipo === 'Trapezoidal' || normTipo === 'Triangular') && (
                    <div className="space-y-1">
                      <label className="text-xs text-slate-300">Talud z (H:V):</label>
                      <input
                        type="number"
                        step="0.1"
                        value={normZ}
                        onChange={(e) => setNormZ(parseFloat(e.target.value) || 0)}
                        className="w-full bg-[#0D1923] border border-[#25405A] rounded px-3 py-1.5 text-sm font-semibold"
                      />
                    </div>
                  )}
                  {normTipo === 'Circular' && (
                    <div className="space-y-1">
                      <label className="text-xs text-slate-300">Diámetro D (m):</label>
                      <input
                        type="number"
                        step="0.1"
                        value={normD}
                        onChange={(e) => setNormD(parseFloat(e.target.value) || 0)}
                        className="w-full bg-[#0D1923] border border-[#25405A] rounded px-3 py-1.5 text-sm font-semibold"
                      />
                    </div>
                  )}
                </div>

                {normError && (
                  <div className="p-3 rounded bg-red-950/60 border border-red-800 text-xs text-red-300 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                    <span>{normError}</span>
                  </div>
                )}

                <button
                  onClick={handleCalcularNormal}
                  className="w-full py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-sm shadow-lg shadow-cyan-950/50 flex items-center justify-center gap-2"
                >
                  <Calculator className="w-4 h-4" />
                  Calcular Tirante Normal
                </button>
              </div>

              <div className="lg:col-span-7 space-y-6">
                <div className="bg-[#162534] border border-[#25405A] rounded-2xl p-4 shadow-xl">
                  <SectionCanvas
                    tipo={normTipo}
                    y={normResult ? normResult.yn : 1.2}
                    b={normB}
                    z={normZ}
                    d={normD}
                    etiqueta="yn"
                    height={280}
                  />
                </div>

                {normResult && (
                  <div className="bg-[#162534] border border-[#25405A] rounded-2xl p-5 shadow-xl space-y-4">
                    <div className="p-4 rounded-xl bg-gradient-to-r from-cyan-950/80 to-[#162534] border border-cyan-800/60 flex items-center justify-between">
                      <div>
                        <span className="text-xs font-semibold text-cyan-300">Tirante Normal (yn):</span>
                        <div className="text-3xl font-black text-cyan-400 mt-1">{normResult.yn.toFixed(4)} m</div>
                      </div>
                      <div className="text-right text-xs text-slate-300">
                        <div>Velocidad: <span className="font-bold">{normResult.V.toFixed(3)} m/s</span></div>
                        <div>Froude: <span className="font-bold text-cyan-300">{normResult.Fr.toFixed(3)} ({normResult.regimen})</span></div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div className="p-2.5 rounded-lg bg-[#1B2F42] border border-slate-800">
                        <span className="text-slate-400">Área (A):</span>
                        <div className="text-base font-bold text-slate-100 mt-0.5">{normResult.A.toFixed(4)} m²</div>
                      </div>
                      <div className="p-2.5 rounded-lg bg-[#1B2F42] border border-slate-800">
                        <span className="text-slate-400">Perímetro (P):</span>
                        <div className="text-base font-bold text-slate-100 mt-0.5">{normResult.P.toFixed(4)} m</div>
                      </div>
                      <div className="p-2.5 rounded-lg bg-[#1B2F42] border border-slate-800">
                        <span className="text-slate-400">Radio Hidráulico (R):</span>
                        <div className="text-base font-bold text-slate-100 mt-0.5">{normResult.R.toFixed(4)} m</div>
                      </div>
                      <div className="p-2.5 rounded-lg bg-[#1B2F42] border border-slate-800">
                        <span className="text-slate-400">Espejo Agua (T):</span>
                        <div className="text-base font-bold text-slate-100 mt-0.5">{normResult.T.toFixed(4)} m</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ========================================================= */}
          {/* MÓDULO: TIRANTE CRÍTICO */}
          {/* ========================================================= */}
          {activeModule === 'critico' && (
            <>
              <div className="lg:col-span-5 bg-[#162534] border border-[#25405A] rounded-2xl p-5 shadow-xl space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Tipo de Sección:</label>
                  <select
                    value={critTipo}
                    onChange={(e) => setCritTipo(e.target.value as SectionType)}
                    className="w-full bg-[#0D1923] border border-[#25405A] rounded-lg px-3 py-2 text-sm text-cyan-300 font-bold focus:outline-none"
                  >
                    <option value="Trapezoidal">Trapezoidal</option>
                    <option value="Rectangular">Rectangular</option>
                    <option value="Triangular">Triangular</option>
                    <option value="Circular">Circular (Tubería)</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 space-y-1">
                    <label className="text-xs text-slate-300">Caudal Q (m³/s):</label>
                    <input
                      type="number"
                      step="0.1"
                      value={critQ}
                      onChange={(e) => setCritQ(parseFloat(e.target.value) || 0)}
                      className="w-full bg-[#0D1923] border border-[#25405A] rounded px-3 py-1.5 text-sm font-semibold"
                    />
                  </div>
                  {critTipo !== 'Triangular' && critTipo !== 'Circular' && (
                    <div className="space-y-1">
                      <label className="text-xs text-slate-300">Ancho solera b (m):</label>
                      <input
                        type="number"
                        step="0.1"
                        value={critB}
                        onChange={(e) => setCritB(parseFloat(e.target.value) || 0)}
                        className="w-full bg-[#0D1923] border border-[#25405A] rounded px-3 py-1.5 text-sm font-semibold"
                      />
                    </div>
                  )}
                  {(critTipo === 'Trapezoidal' || critTipo === 'Triangular') && (
                    <div className="space-y-1">
                      <label className="text-xs text-slate-300">Talud z (H:V):</label>
                      <input
                        type="number"
                        step="0.1"
                        value={critZ}
                        onChange={(e) => setCritZ(parseFloat(e.target.value) || 0)}
                        className="w-full bg-[#0D1923] border border-[#25405A] rounded px-3 py-1.5 text-sm font-semibold"
                      />
                    </div>
                  )}
                  {critTipo === 'Circular' && (
                    <div className="space-y-1">
                      <label className="text-xs text-slate-300">Diámetro D (m):</label>
                      <input
                        type="number"
                        step="0.1"
                        value={critD}
                        onChange={(e) => setCritD(parseFloat(e.target.value) || 0)}
                        className="w-full bg-[#0D1923] border border-[#25405A] rounded px-3 py-1.5 text-sm font-semibold"
                      />
                    </div>
                  )}
                </div>

                {critError && (
                  <div className="p-3 rounded bg-red-950/60 border border-red-800 text-xs text-red-300">
                    {critError}
                  </div>
                )}

                <button
                  onClick={handleCalcularCritico}
                  className="w-full py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-sm shadow-lg shadow-cyan-950/50 flex items-center justify-center gap-2"
                >
                  <Calculator className="w-4 h-4" />
                  Calcular Tirante Crítico
                </button>
              </div>

              <div className="lg:col-span-7 space-y-6">
                <div className="bg-[#162534] border border-[#25405A] rounded-2xl p-4 shadow-xl">
                  <SectionCanvas
                    tipo={critTipo}
                    y={critResult ? critResult.yc : 0.8}
                    b={critB}
                    z={critZ}
                    d={critD}
                    etiqueta="yc"
                    height={280}
                  />
                </div>

                {critResult && (
                  <div className="bg-[#162534] border border-[#25405A] rounded-2xl p-5 shadow-xl space-y-4">
                    <div className="p-4 rounded-xl bg-gradient-to-r from-cyan-950/80 to-[#162534] border border-cyan-800/60 flex items-center justify-between">
                      <div>
                        <span className="text-xs font-semibold text-cyan-300">Tirante Crítico (yc):</span>
                        <div className="text-3xl font-black text-cyan-400 mt-1">{critResult.yc.toFixed(4)} m</div>
                      </div>
                      <div className="text-right text-xs text-slate-300">
                        <div>Velocidad crítica: <span className="font-bold">{critResult.Vc.toFixed(3)} m/s</span></div>
                        <div>Froude: <span className="font-bold text-cyan-300">1.000 (Crítico)</span></div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3 text-xs">
                      <div className="p-2.5 rounded-lg bg-[#1B2F42] border border-slate-800">
                        <span className="text-slate-400">Área Crítica (Ac):</span>
                        <div className="text-base font-bold text-slate-100 mt-0.5">{critResult.Ac.toFixed(4)} m²</div>
                      </div>
                      <div className="p-2.5 rounded-lg bg-[#1B2F42] border border-slate-800">
                        <span className="text-slate-400">Espejo Crítico (Tc):</span>
                        <div className="text-base font-bold text-slate-100 mt-0.5">{critResult.Tc.toFixed(4)} m</div>
                      </div>
                      <div className="p-2.5 rounded-lg bg-[#1B2F42] border border-slate-800">
                        <span className="text-slate-400">Energía Mínima (Emin):</span>
                        <div className="text-base font-bold text-slate-100 mt-0.5">{critResult.Emin.toFixed(4)} m</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ========================================================= */}
          {/* MÓDULO: RESALTO HIDRÁULICO */}
          {/* ========================================================= */}
          {activeModule === 'resalto' && (
            <div className="lg:col-span-12 grid grid-cols-1 md:grid-cols-12 gap-6">
              <div className="md:col-span-5 bg-[#162534] border border-[#25405A] rounded-2xl p-5 shadow-xl space-y-4">
                <div className="space-y-1">
                  <div className="text-xs font-bold text-emerald-400">Canal Rectangular:</div>
                  <p className="text-[11px] text-slate-400">Cálculo de tirante conjugado y2 y disipación de energía mediante las ecuaciones de Bélanger.</p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-slate-300">Caudal Q (m³/s):</label>
                    <input
                      type="number"
                      step="0.1"
                      value={resQ}
                      onChange={(e) => setResQ(parseFloat(e.target.value) || 0)}
                      className="w-full mt-1 bg-[#0D1923] border border-[#25405A] rounded px-3 py-1.5 text-sm font-semibold"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-300">Ancho del canal b (m):</label>
                    <input
                      type="number"
                      step="0.1"
                      value={resB}
                      onChange={(e) => setResB(parseFloat(e.target.value) || 0)}
                      className="w-full mt-1 bg-[#0D1923] border border-[#25405A] rounded px-3 py-1.5 text-sm font-semibold"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-emerald-300 font-bold">Tirante inicial supercrítico y1 (m):</label>
                    <input
                      type="number"
                      step="0.05"
                      value={resY1}
                      onChange={(e) => setResY1(parseFloat(e.target.value) || 0)}
                      className="w-full mt-1 bg-[#0D1923] border border-emerald-700/60 rounded px-3 py-1.5 text-sm font-bold text-emerald-300"
                    />
                  </div>
                </div>

                {resError && (
                  <div className="p-3 rounded bg-red-950/60 border border-red-800 text-xs text-red-300">
                    {resError}
                  </div>
                )}

                <button
                  onClick={handleCalcularResalto}
                  className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2"
                >
                  <Calculator className="w-4 h-4" />
                  Calcular Resalto Hidráulico
                </button>
              </div>

              <div className="md:col-span-7 space-y-4">
                {resResult ? (
                  <div className="bg-[#162534] border border-[#25405A] rounded-2xl p-6 shadow-xl space-y-4">
                    <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-950/80 to-[#162534] border border-emerald-800/60 flex items-center justify-between">
                      <div>
                        <span className="text-xs font-semibold text-emerald-300">Tirante Conjugado (y2):</span>
                        <div className="text-3xl font-black text-emerald-300 mt-1">{resResult.y2.toFixed(4)} m</div>
                      </div>
                      <div className="text-right text-xs text-slate-300">
                        <div>Pérdida ΔE: <span className="font-bold text-amber-400">{resResult.dE.toFixed(4)} m</span></div>
                        <div>Disipación: <span className="font-bold text-emerald-400">{resResult.porcPerdida.toFixed(1)}%</span></div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div className="p-3 rounded-xl bg-[#1B2F42] border border-slate-800">
                        <span className="text-slate-400">Velocidad inicial (v1):</span>
                        <div className="text-base font-bold text-slate-100 mt-0.5">{resResult.v1.toFixed(3)} m/s</div>
                      </div>
                      <div className="p-3 rounded-xl bg-[#1B2F42] border border-slate-800">
                        <span className="text-slate-400">Froude inicial (Fr1):</span>
                        <div className="text-base font-bold text-emerald-400 mt-0.5">{resResult.fr1.toFixed(3)}</div>
                      </div>
                      <div className="p-3 rounded-xl bg-[#1B2F42] border border-slate-800">
                        <span className="text-slate-400">Velocidad final (v2):</span>
                        <div className="text-base font-bold text-slate-100 mt-0.5">{resResult.v2.toFixed(3)} m/s</div>
                      </div>
                      <div className="p-3 rounded-xl bg-[#1B2F42] border border-slate-800">
                        <span className="text-slate-400">Froude final (Fr2):</span>
                        <div className="text-base font-bold text-slate-100 mt-0.5">{resResult.fr2.toFixed(3)}</div>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-400 space-y-1">
                      <div className="font-semibold text-slate-200">Tipo de Resalto según Fr1 ({resResult.fr1.toFixed(2)}):</div>
                      <p>
                        {resResult.fr1 < 1.7 && 'Resalto ondular (Fr1 = 1.0 a 1.7): La superficie del agua muestra ondulaciones suaves.'}
                        {resResult.fr1 >= 1.7 && resResult.fr1 < 2.5 && 'Resalto débil (Fr1 = 1.7 a 2.5): Se forman pequeños remolinos y la pérdida de energía es moderada.'}
                        {resResult.fr1 >= 2.5 && resResult.fr1 < 4.5 && 'Resalto oscilante (Fr1 = 2.5 a 4.5): El chorro entra y oscila del fondo a la superficie, generando olas que viajan aguas abajo.'}
                        {resResult.fr1 >= 4.5 && resResult.fr1 < 9.0 && 'Resalto estable (Fr1 = 4.5 a 9.0): El mejor resalto para disipadores de energía, bien balanceado y eficiente (45% a 70% de disipación).'}
                        {resResult.fr1 >= 9.0 && 'Resalto fuerte (Fr1 > 9.0): Flujo de alta energía con gran oleaje y turbulencia violenta.'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="bg-[#162534] border border-[#25405A] rounded-2xl p-8 text-center text-slate-400">
                    Ingrese el tirante inicial supercrítico y1 y presione Calcular.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* MÓDULO: CURVAS DE REMANSO */}
          {/* ========================================================= */}
          {activeModule === 'remanso' && (
            <div className="lg:col-span-12 grid grid-cols-1 md:grid-cols-12 gap-6">
              <div className="md:col-span-5 bg-[#162534] border border-[#25405A] rounded-2xl p-5 shadow-xl space-y-4">
                <div className="space-y-1">
                  <div className="text-xs font-bold text-cyan-400">Clasificación de Perfiles:</div>
                  <p className="text-[11px] text-slate-400">Determina el tipo de curva de flujo gradualmente variado según la cota de yn, yc y el tirante actual y.</p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-slate-300">Tirante normal yn (m):</label>
                    <input
                      type="number"
                      step="0.05"
                      value={remYn}
                      onChange={(e) => setRemYn(parseFloat(e.target.value) || 0)}
                      className="w-full mt-1 bg-[#0D1923] border border-[#25405A] rounded px-3 py-1.5 text-sm font-semibold"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-300">Tirante crítico yc (m):</label>
                    <input
                      type="number"
                      step="0.05"
                      value={remYc}
                      onChange={(e) => setRemYc(parseFloat(e.target.value) || 0)}
                      className="w-full mt-1 bg-[#0D1923] border border-[#25405A] rounded px-3 py-1.5 text-sm font-semibold"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-cyan-300 font-bold">Tirante real en la sección y (m):</label>
                    <input
                      type="number"
                      step="0.05"
                      value={remY}
                      onChange={(e) => setRemY(parseFloat(e.target.value) || 0)}
                      className="w-full mt-1 bg-[#0D1923] border border-cyan-700/60 rounded px-3 py-1.5 text-sm font-bold text-cyan-300"
                    />
                  </div>
                </div>

                <button
                  onClick={handleCalcularRemanso}
                  className="w-full py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-sm shadow-lg shadow-cyan-950/50 flex items-center justify-center gap-2"
                >
                  <Calculator className="w-4 h-4" />
                  Identificar Perfil de Remanso
                </button>
              </div>

              <div className="md:col-span-7 space-y-4">
                {remResult ? (
                  <div className="bg-[#162534] border border-[#25405A] rounded-2xl p-6 shadow-xl space-y-4">
                    <div className="p-4 rounded-xl bg-gradient-to-r from-cyan-950/80 to-[#162534] border border-cyan-800/60 flex items-center justify-between">
                      <div>
                        <span className="text-xs font-semibold text-cyan-300">Perfil Hidráulico Identificado:</span>
                        <div className="text-4xl font-black text-cyan-400 mt-1">{remResult.perfil}</div>
                      </div>
                      <div className="text-right">
                        <span className="text-xs px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-slate-200 font-bold">
                          Pendiente {remResult.tipoPendiente}
                        </span>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300 leading-relaxed">
                      <div className="font-bold text-cyan-300 mb-1">Descripción del Comportamiento Hidráulico:</div>
                      {remResult.descripcion}
                    </div>
                  </div>
                ) : (
                  <div className="bg-[#162534] border border-[#25405A] rounded-2xl p-8 text-center text-slate-400">
                    Ingrese los tirantes yn, yc e y, y presione Identificar Perfil de Remanso.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* MÓDULOS DE DISEÑO ÓPTIMO (MEH & MÍNIMA INFILTRACIÓN) */}
          {/* ========================================================= */}
          {(activeModule === 'meh' || activeModule === 'minima') && (
            <div className="lg:col-span-12 bg-[#162534] border border-[#25405A] rounded-2xl p-6 shadow-xl space-y-4">
              <div className="text-xs font-bold text-indigo-400">
                {activeModule === 'meh' ? 'Máxima Eficiencia Hidráulica (MEH)' : 'Mínima Infiltración'}
              </div>
              <p className="text-xs text-slate-300 max-w-3xl">
                {activeModule === 'meh'
                  ? 'Diseño de la sección geométrica que conduce el máximo caudal Q posible con la mínima área hidráulica A (menor costo de excavación). Cumple la relación b/y = 2·(√(1+z²) - z).'
                  : 'Diseño para minimizar el perímetro mojado P y reducir al mínimo las pérdidas por filtración en canales en tierra sin revestir. Cumple la relación b/y = 4·(√(1+z²) - z).'}
              </p>
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-400">
                Puede calcular los parámetros óptimos utilizando el módulo de <strong className="text-cyan-300">Cálculo Inverso</strong> eligiendo la sección trapezoidal o rectangular correspondiente.
              </div>
            </div>
          )}

        </div>

        {/* ----------------------------------------------------------- */}
        {/* HISTORIAL RECIENTE INFERIOR */}
        {/* ----------------------------------------------------------- */}
        {history.length > 0 && (
          <footer className="p-4 bg-[#09131C] border-t border-[#1B2F42] shrink-0">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
                <Bookmark className="w-3.5 h-3.5 text-cyan-400" />
                <span>Cálculos Recientes ({history.length}):</span>
              </div>
              <button
                onClick={() => setHistory([])}
                className="text-[11px] text-slate-500 hover:text-slate-300 flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" />
                Limpiar historial
              </button>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {history.slice(0, 6).map((h) => (
                <div
                  key={h.id}
                  className="px-3 py-1.5 rounded-lg bg-[#162534] border border-[#25405A] text-xs shrink-0 flex items-center gap-2 hover:border-cyan-600/50 transition-colors cursor-pointer"
                  onClick={() => {
                    if (h.modulo === 'inverso' && h.datosEntrada.tipo) {
                      setActiveModule('inverso');
                      setInvTipo(h.datosEntrada.tipo);
                      setInvIncognita(h.datosEntrada.incognita || 'S');
                    } else if (h.modulo === 'compuesta') {
                      setActiveModule('compuesta');
                    }
                  }}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                  <span className="font-semibold text-slate-200">{h.titulo}</span>
                  <span className="text-slate-400 font-mono text-[11px]">{h.resumen}</span>
                </div>
              ))}
            </div>
          </footer>
        )}
      </main>

      {/* ----------------------------------------------------------- */}
      {/* DIÁLOGO MODAL DE COWAN */}
      {/* ----------------------------------------------------------- */}
      <CowanModal
        isOpen={cowanOpen}
        onClose={() => setCowanOpen(false)}
        initialState={cowanStates[cowanFieldKey]}
        onApply={(nVal, newState) => {
          setCowanStates((prev) => ({ ...prev, [cowanFieldKey]: newState }));
          if (cowanFieldKey === 'invN') {
            setInvN(nVal);
          }
        }}
      />

      {/* ----------------------------------------------------------- */}
      {/* MODAL DE INFORME TÉCNICO FORMAL A4 */}
      {/* ----------------------------------------------------------- */}
      <ReportModal
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
        titulo={
          activeModule === 'inverso'
            ? `Cálculo Inverso - Sección ${invTipo}`
            : activeModule === 'compuesta'
            ? `Sección Compuesta Universal`
            : `Cálculo Hidráulico de Canales`
        }
        descripcion="Memoria de cálculo y verificación de diseño hidráulico conforme a la formulación de Manning y criterios de la Escuela Profesional de Ingeniería Civil, UNCP."
        entradas={
          activeModule === 'inverso'
            ? [
                { etiqueta: 'Tipo de Sección', valor: invTipo },
                { etiqueta: 'Incógnita Resuelta', valor: invIncognita },
                { etiqueta: 'Caudal Q', valor: invQ.toFixed(3), unidad: 'm³/s' },
                { etiqueta: 'Tirante y', valor: invY.toFixed(3), unidad: 'm' },
                { etiqueta: 'Pendiente S', valor: invS.toFixed(5), unidad: 'm/m' },
                { etiqueta: 'Rugosidad n', valor: invN.toFixed(4) }
              ]
            : [
                { etiqueta: 'Pendiente S', valor: compS.toFixed(5), unidad: 'm/m' },
                { etiqueta: 'Caudal Q', valor: compQ.toFixed(3), unidad: 'm³/s' },
                { etiqueta: 'Tirante Total y', valor: compY.toFixed(3), unidad: 'm' }
              ]
        }
        resultados={
          activeModule === 'inverso' && invResult
            ? [
                { etiqueta: invResult.parametroResuelto.nombre, valor: invResult.parametroResuelto.formateado, unidad: invResult.parametroResuelto.unidad },
                { etiqueta: 'Área Hidráulica A', valor: invResult.hidraulica.A.toFixed(4), unidad: 'm²' },
                { etiqueta: 'Perímetro Mojado P', valor: invResult.hidraulica.P.toFixed(4), unidad: 'm' },
                { etiqueta: 'Radio Hidráulico R', valor: invResult.hidraulica.R.toFixed(4), unidad: 'm' },
                { etiqueta: 'Velocidad Media V', valor: invResult.hidraulica.V.toFixed(3), unidad: 'm/s' },
                { etiqueta: 'Froude y Régimen', valor: `${invResult.hidraulica.Fr.toFixed(3)} (${invResult.hidraulica.regimen})` }
              ]
            : activeModule === 'compuesta' && compResult
            ? [
                { etiqueta: 'Caudal Total Q', valor: compResult.QTotal.toFixed(4), unidad: 'm³/s' },
                { etiqueta: 'Tirante Total y', valor: compResult.yTotal.toFixed(4), unidad: 'm' },
                { etiqueta: 'Área Total A', valor: compResult.ATotal.toFixed(4), unidad: 'm²' },
                { etiqueta: 'Perímetro Mojado P', valor: compResult.PTotal.toFixed(4), unidad: 'm' },
                { etiqueta: 'Velocidad Media V', valor: compResult.VMedia.toFixed(3), unidad: 'm/s' },
                { etiqueta: 'n equiv. Horton', valor: compResult.nEquivalenteHorton.toFixed(4) }
              ]
            : []
        }
        subsecciones={activeModule === 'compuesta' && compResult ? compResult.subsecciones : undefined}
        notas={
          activeModule === 'compuesta' && compResult?.advertencias.length
            ? compResult.advertencias
            : ['Los cálculos asumen flujo uniforme unidimensional y distribución de presiones hidrostática.']
        }
      />
    </div>
  );
}
