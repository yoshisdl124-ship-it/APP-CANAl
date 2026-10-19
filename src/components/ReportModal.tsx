/**
 * EL CAUDALOSO - Memoria de Cálculo & Exportación de Informes
 * Genera una memoria técnica formal estilo A4 para imprimir o guardar como PDF.
 */

import React from 'react';
import { Printer, Download, X, FileText, CheckCircle2 } from 'lucide-react';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  titulo: string;
  descripcion: string;
  entradas: Array<{ etiqueta: string; valor: string | number; unidad?: string }>;
  resultados: Array<{ etiqueta: string; valor: string | number; unidad?: string }>;
  notas?: string[];
  subsecciones?: Array<{
    nombre: string;
    A: number;
    P: number;
    R: number;
    n: number;
    Q: number;
    V: number;
    porcentajeQ: number;
  }>;
}

export const ReportModal: React.FC<ReportModalProps> = ({
  isOpen,
  onClose,
  titulo,
  descripcion,
  entradas,
  resultados,
  notas,
  subsecciones
}) => {
  if (!isOpen) return null;

  const fechaHora = new Date().toLocaleString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto print:p-0 print:bg-white">
      <div className="bg-white text-slate-900 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden print:max-h-none print:shadow-none print:w-full print:rounded-none">
        {/* Barra superior de acciones (oculta al imprimir) */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-100 print:hidden">
          <div className="flex items-center gap-2 text-slate-800 font-bold">
            <FileText className="w-5 h-5 text-cyan-600" />
            <span>Memoria de Cálculo Técnico - EL CAUDALOSO</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-cyan-700 hover:bg-cyan-800 text-white flex items-center gap-2 shadow-sm transition-colors"
            >
              <Printer className="w-4 h-4" />
              Imprimir / Guardar PDF
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-200 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Hoja A4 formal */}
        <div className="p-8 md:p-12 overflow-y-auto space-y-6 print:p-6 print:space-y-4 font-sans text-sm">
          {/* Cabecera institucional */}
          <div className="flex items-start justify-between border-b-2 border-slate-800 pb-4">
            <div>
              <div className="text-xs uppercase font-extrabold tracking-wider text-cyan-800">
                UNIVERSIDAD NACIONAL DEL CENTRO DEL PERÚ
              </div>
              <div className="text-xs font-semibold text-slate-600">
                Facultad de Ingeniería Civil · Laboratorio de Hidráulica
              </div>
              <h1 className="text-2xl font-black text-slate-900 mt-1 tracking-tight">
                EL CAUDALOSO <span className="text-sm font-normal text-slate-500">v2.0</span>
              </h1>
            </div>
            <div className="text-right text-xs text-slate-500 space-y-1">
              <div>Fecha: <span className="font-semibold text-slate-700">{fechaHora}</span></div>
              <div>Módulo: <span className="font-semibold text-slate-700">{titulo}</span></div>
              <div className="text-cyan-800 font-mono text-[11px]">g = 9.81 m/s² · Manning</div>
            </div>
          </div>

          {/* Título de la memoria */}
          <div>
            <h2 className="text-xl font-bold text-slate-900">{titulo}</h2>
            <p className="text-xs text-slate-600 mt-1">{descripcion}</p>
          </div>

          {/* 1. Datos de Entrada */}
          <div className="space-y-2">
            <h3 className="text-xs uppercase tracking-wider font-extrabold text-slate-700 border-b border-slate-300 pb-1 flex items-center gap-1.5">
              <span>1. Parámetros y Datos de Entrada</span>
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
              {entradas.map((e, idx) => (
                <div key={idx} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="text-[11px] text-slate-500 font-medium">{e.etiqueta}</div>
                  <div className="text-base font-bold text-slate-900 mt-0.5">
                    {e.valor} <span className="text-xs font-normal text-slate-500">{e.unidad}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 2. Resultados Principales */}
          <div className="space-y-2">
            <h3 className="text-xs uppercase tracking-wider font-extrabold text-slate-700 border-b border-slate-300 pb-1 flex items-center gap-1.5">
              <span>2. Resultados Hidráulicos del Flujo</span>
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {resultados.map((r, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-lg border ${
                    idx === 0
                      ? 'bg-cyan-50/80 border-cyan-300 col-span-2 md:col-span-3'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className={`text-xs font-medium ${idx === 0 ? 'text-cyan-800 font-bold' : 'text-slate-500'}`}>
                    {r.etiqueta}
                  </div>
                  <div className={`font-black mt-0.5 ${idx === 0 ? 'text-2xl text-cyan-950' : 'text-lg text-slate-900'}`}>
                    {r.valor} <span className="text-xs font-normal text-slate-600">{r.unidad}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 3. Desglose por subsecciones si existen (para secciones compuestas) */}
          {subsecciones && subsecciones.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs uppercase tracking-wider font-extrabold text-slate-700 border-b border-slate-300 pb-1">
                3. Distribución de Caudales por Subsección
              </h3>
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 font-bold">
                      <th className="p-2">Subsección</th>
                      <th className="p-2">Área A (m²)</th>
                      <th className="p-2">Perím. P (m)</th>
                      <th className="p-2">Radio R (m)</th>
                      <th className="p-2">Manning n</th>
                      <th className="p-2">Caudal Q (m³/s)</th>
                      <th className="p-2">Veloc. V (m/s)</th>
                      <th className="p-2">% Caudal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-slate-800">
                    {subsecciones.map((s, idx) => (
                      <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'}>
                        <td className="p-2 font-semibold text-cyan-900">{s.nombre}</td>
                        <td className="p-2">{s.A.toFixed(4)}</td>
                        <td className="p-2">{s.P.toFixed(4)}</td>
                        <td className="p-2">{s.R.toFixed(4)}</td>
                        <td className="p-2">{s.n.toFixed(4)}</td>
                        <td className="p-2 font-bold text-slate-900">{s.Q.toFixed(4)}</td>
                        <td className="p-2">{s.V.toFixed(3)}</td>
                        <td className="p-2 font-semibold text-cyan-700">{s.porcentajeQ.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 4. Notas y observaciones */}
          {notas && notas.length > 0 && (
            <div className="space-y-1.5 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-950 text-xs">
              <div className="font-bold flex items-center gap-1.5 text-amber-900">
                <CheckCircle2 className="w-4 h-4 text-amber-700" />
                <span>Observaciones de Ingeniería:</span>
              </div>
              <ul className="list-disc list-inside space-y-0.5 text-slate-700 pl-1">
                {notas.map((n, idx) => (
                  <li key={idx}>{n}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Pie de firma / certificación */}
          <div className="pt-8 mt-6 border-t border-slate-300 flex items-center justify-between text-xs text-slate-500">
            <div>
              Software: <span className="font-semibold text-slate-700">EL CAUDALOSO</span> · UNCP Civil Engineering
            </div>
            <div className="text-right">
              Página 1 de 1 · Generado electrónicamente
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
