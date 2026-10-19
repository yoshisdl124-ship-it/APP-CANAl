/**
 * EL CAUDALOSO - Diálogo de Rugosidad de Cowan
 * n = (n0 + n1 + n2 + n3 + n4) * m5
 */

import React, { useState } from 'react';
import { COWAN_DATA, CowanItem, calcularCowan } from '../utils/hydraulicsCore';
import { CowanState } from '../types/hydraulics';
import { X, Check, Calculator, Info } from 'lucide-react';

interface CowanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (n: number, state: CowanState) => void;
  initialState?: CowanState;
}

export const CowanModal: React.FC<CowanModalProps> = ({
  isOpen,
  onClose,
  onApply,
  initialState
}) => {
  const [state, setState] = useState<CowanState>(() => {
    return (
      initialState || {
        n0: COWAN_DATA.n0[0].nombre,
        n1: COWAN_DATA.n1[0].nombre,
        n2: COWAN_DATA.n2[0].nombre,
        n3: COWAN_DATA.n3[0].nombre,
        n4: COWAN_DATA.n4[0].nombre,
        m5: COWAN_DATA.m5[0].nombre,
        t: 0.5
      }
    );
  });

  if (!isOpen) return null;

  const nCalculado = calcularCowan(state);

  const handleChange = (key: keyof CowanState, val: string | number) => {
    setState((prev) => ({ ...prev, [key]: val }));
  };

  const labels: { key: keyof Omit<CowanState, 't'>; titulo: string; desc: string }[] = [
    { key: 'n0', titulo: 'Material del cauce (n0)', desc: 'Suelo básico, roca o revestimiento' },
    { key: 'n1', titulo: 'Grado de irregularidad (n1)', desc: 'Rugosidad y aspereza de las paredes' },
    { key: 'n2', titulo: 'Variación de la sección (n2)', desc: 'Cambios de ancho y forma a lo largo del canal' },
    { key: 'n3', titulo: 'Efecto relativo de obstrucciones (n3)', desc: 'Troncos, restos, sedimentos y pilas' },
    { key: 'n4', titulo: 'Vegetación en el cauce (n4)', desc: 'Pastos, matorrales, arbustos o árboles' },
    { key: 'm5', titulo: 'Factor de sinuosidad (m5)', desc: 'Multiplicador según meandros en planta' }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#162534] border border-[#25405A] rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Encabezado */}
        <div className="p-5 border-b border-[#25405A] flex items-center justify-between bg-[#1B2F42]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-900/50 text-cyan-400 border border-cyan-700/50">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">Método de Cowan (1956)</h2>
              <p className="text-xs text-slate-400">n = (n₀ + n₁ + n₂ + n₃ + n₄) · m₅</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cuerpo desplazable */}
        <div className="p-6 overflow-y-auto space-y-4">
          <div className="flex items-center gap-2 text-xs text-slate-300 bg-[#0F1B27] p-3 rounded-xl border border-slate-800">
            <Info className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>Seleccione los factores correspondientes a las condiciones físicas del cauce.</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {labels.map(({ key, titulo, desc }) => (
              <div key={key} className="space-y-1">
                <label className="text-xs font-semibold text-slate-300 block">{titulo}</label>
                <select
                  value={state[key]}
                  onChange={(e) => handleChange(key, e.target.value)}
                  className="w-full bg-[#0D1923] border border-[#25405A] rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors"
                >
                  {COWAN_DATA[key].map((item: CowanItem) => (
                    <option key={item.nombre} value={item.nombre}>
                      {item.nombre} ({item.lo === item.hi ? item.lo.toFixed(3) : `${item.lo.toFixed(3)} - ${item.hi.toFixed(3)}`})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400">{desc}</p>
              </div>
            ))}
          </div>

          {/* Slider de posición t dentro del rango */}
          <div className="pt-2 border-t border-[#25405A] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300 font-medium">Posición dentro del rango (t):</span>
              <span className="text-cyan-400 font-bold">{(state.t * 100).toFixed(0)}% (t = {state.t.toFixed(2)})</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={state.t}
              onChange={(e) => handleChange('t', parseFloat(e.target.value))}
              className="w-full accent-cyan-400 bg-slate-800 h-2 rounded-lg cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>Mínimo del rango (t=0)</span>
              <span>Medio (t=0.5)</span>
              <span>Máximo del rango (t=1)</span>
            </div>
          </div>

          {/* Resultado destacado */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-cyan-950/60 to-slate-900 border border-cyan-800/40 flex items-center justify-between">
            <div>
              <span className="text-xs text-cyan-300 font-medium block">Rugosidad n resultante:</span>
              <span className="text-2xl font-black text-cyan-300">n = {nCalculado.toFixed(4)}</span>
            </div>
            <div className="text-right text-xs text-slate-400">
              <span>Norma USBR / Chow</span>
            </div>
          </div>
        </div>

        {/* Pie de botones */}
        <div className="p-4 border-t border-[#25405A] flex items-center justify-end gap-3 bg-[#1B2F42]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-300 hover:text-white rounded-lg hover:bg-slate-700/50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => {
              onApply(nCalculado, state);
              onClose();
            }}
            className="px-5 py-2 text-sm font-semibold rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-900/40 flex items-center gap-2 transition-colors"
          >
            <Check className="w-4 h-4" />
            Usar este valor
          </button>
        </div>
      </div>
    </div>
  );
};
