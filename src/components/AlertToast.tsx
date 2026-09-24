import React from 'react';
import { Send, CheckCircle2, X } from 'lucide-react';

export interface AlertToastState {
  id: number;
  symbol: string;
  targetPrice: number;
  condition: 'gte' | 'lte';
  levelType?: string;
  message?: string;
}

interface AlertToastProps {
  toast: AlertToastState | null;
  onDismiss: () => void;
}

export const AlertToast: React.FC<AlertToastProps> = ({ toast, onDismiss }) => {
  if (!toast) return null;

  return (
    <div className="fixed bottom-5 left-5 z-50 max-w-sm w-full animate-in slide-in-from-bottom-5 duration-200">
      <div className="p-3.5 rounded-2xl shadow-2xl border backdrop-blur-md flex items-start justify-between gap-3 bg-slate-900/95 border-sky-500/40 text-slate-200 shadow-sky-950/20">
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 bg-sky-500/20 text-sky-400">
            <Send className="w-4 h-4" />
          </div>

          <div className="space-y-0.5 text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-white">
              <span>Сповіщення встановлено</span>
              <span className="font-mono text-[10px] bg-sky-500/20 text-sky-300 px-1.5 py-0.2 rounded border border-sky-500/30">
                Telegram
              </span>
            </div>
            <div className="font-mono text-[11px] text-cyan-300 font-bold">
              {toast.symbol} {toast.condition === 'gte' ? '≥' : '≤'} ${toast.targetPrice}
            </div>
            <p className="text-[11px] text-slate-400 leading-snug">
              {toast.message || 'Telegram надішле сповіщення при досягненні ціни'}
            </p>
          </div>
        </div>

        <button
          onClick={onDismiss}
          className="text-slate-500 hover:text-slate-300 p-1 rounded transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
