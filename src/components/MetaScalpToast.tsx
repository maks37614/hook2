import React from 'react';
import { Zap, CheckCircle2, AlertTriangle, X } from 'lucide-react';

export interface MetaScalpToastState {
  id: number;
  type: 'success' | 'warning' | 'error';
  title: string;
  ticker: string;
  binding: string;
  message?: string;
}

interface MetaScalpToastProps {
  toast: MetaScalpToastState | null;
  onDismiss: () => void;
}

export const MetaScalpToast: React.FC<MetaScalpToastProps> = ({ toast, onDismiss }) => {
  if (!toast) return null;

  const isSuccess = toast.type === 'success';

  return (
    <div className="fixed bottom-5 right-5 z-50 max-w-sm w-full animate-in slide-in-from-bottom-5 duration-200">
      <div
        className={`p-3.5 rounded-2xl shadow-2xl border backdrop-blur-md flex items-start justify-between gap-3 ${
          isSuccess
            ? 'bg-slate-900/95 border-amber-500/40 text-slate-200 shadow-amber-950/20'
            : 'bg-slate-900/95 border-amber-600/50 text-slate-200 shadow-slate-950/40'
        }`}
      >
        <div className="flex items-start gap-2.5">
          <div
            className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
              isSuccess ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-600/20 text-amber-400'
            }`}
          >
            <Zap className="w-4 h-4" />
          </div>

          <div className="space-y-0.5 text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-white">
              <span>{toast.title}</span>
              <span className="font-mono text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded border border-amber-500/30">
                Група {toast.binding}
              </span>
            </div>
            <div className="font-mono text-[11px] text-cyan-300 font-bold">{toast.ticker}</div>
            {toast.message && (
              <p className="text-[11px] text-slate-400 leading-snug">{toast.message}</p>
            )}
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
