import React, { useState, useMemo } from 'react';
import {
  X,
  FolderArchive,
  Search,
  Trash2,
  ExternalLink,
  Clock,
  TrendingUp,
  TrendingDown,
  Shield,
  Target,
  LogIn,
  SlidersHorizontal,
  CheckCircle2,
  Sparkles,
  MapPin,
  Calendar,
  Layers,
  Download,
  AlertTriangle,
  Lock,
} from 'lucide-react';
import { useArchive } from '../context/ArchiveContext';
import { useAuth } from '../context/AuthContext';
import { ArchivedFormation, ExchangeId, PatternBias } from '../types';
import { formatCryptoPrice } from '../utils/formatters';

interface ArchiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectFormation: (archived: ArchivedFormation) => void;
  onOpenAuth?: () => void;
}

export const ArchiveModal: React.FC<ArchiveModalProps> = ({
  isOpen,
  onClose,
  onSelectFormation,
  onOpenAuth,
}) => {
  const { archivedFormations, removeFromArchive, clearUserArchive, loading } = useArchive();
  const { user, profile } = useAuth();

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [exchangeFilter, setExchangeFilter] = useState<'all' | ExchangeId>('all');
  const [biasFilter, setBiasFilter] = useState<'all' | PatternBias>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);
  const [isClearing, setIsClearing] = useState<boolean>(false);

  const filteredFormations = useMemo(() => {
    return archivedFormations.filter((item) => {
      // Search
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesSymbol = item.symbol.toLowerCase().includes(query);
        const matchesName = item.formationName.toLowerCase().includes(query);
        const matchesBase = item.baseAsset.toLowerCase().includes(query);
        if (!matchesSymbol && !matchesName && !matchesBase) {
          return false;
        }
      }

      // Exchange
      if (exchangeFilter !== 'all' && item.exchange !== exchangeFilter) {
        return false;
      }

      // Bias
      if (biasFilter !== 'all' && item.bias !== biasFilter) {
        return false;
      }

      return true;
    });
  }, [archivedFormations, searchQuery, exchangeFilter, biasFilter]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingId(id);
    try {
      await removeFromArchive(id);
    } catch (err) {
      console.error('Failed to delete archived item:', err);
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  const handleClearAll = async () => {
    if (isClearing) return;
    setIsClearing(true);
    try {
      await clearUserArchive();
      setShowClearConfirm(false);
    } catch (err) {
      console.error('Failed to clear user archive:', err);
    } finally {
      setIsClearing(false);
    }
  };

  const handleExportJson = () => {
    try {
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(archivedFormations, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `signalhook_archive_${user?.uid || 'user'}_${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } catch (err) {
      console.error('Failed to export archive:', err);
    }
  };

  const formatDate = (isoStringOrTimestamp: string | number) => {
    try {
      const d = new Date(isoStringOrTimestamp);
      return d.toLocaleString('uk-UA', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'Нещодавно';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-5xl bg-slate-900 border border-slate-800 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-800 bg-slate-950/80 sticky top-0 z-10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-purple-500/15 border border-purple-500/40 text-purple-400 flex items-center justify-center shrink-0 shadow-sm">
              <FolderArchive className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
                  Особистий архів формацій
                  <span className="text-xs px-2 py-0.5 rounded-full font-mono bg-purple-950/80 text-purple-300 border border-purple-800/60 font-semibold">
                    {archivedFormations.length}
                  </span>
                </h3>
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Lock className="w-2.5 h-2.5" />
                  <span>Приватне сховище</span>
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate">
                {user ? (
                  <span className="flex items-center gap-1.5 text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 inline" />
                    Прив'язано до вашого профілю: <strong className="text-white font-medium">{profile?.displayName || user.email}</strong>
                  </span>
                ) : (
                  <span className="text-amber-400 flex items-center gap-1">
                    <span>Збережено локально. Увійдіть для збереження у ваш хмарний профіль</span>
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {archivedFormations.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleExportJson}
                  className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/60 text-xs font-semibold transition-all cursor-pointer"
                  title="Завантажити копію мого архіву (JSON)"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Експорт</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowClearConfirm(true)}
                  className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 hover:text-rose-200 border border-rose-500/30 text-xs font-semibold transition-all cursor-pointer"
                  title="Очистити всі мої збережені формації"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Очистити мій архів</span>
                </button>
              </>
            )}

            {!user && onOpenAuth && (
              <button
                type="button"
                onClick={onOpenAuth}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-xs font-semibold transition-all cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Увійти</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="p-1.5 sm:p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="Закрити"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Clear All Confirmation Banner */}
        {showClearConfirm && (
          <div className="p-3 sm:px-6 bg-rose-950/40 border-b border-rose-800/60 flex flex-wrap items-center justify-between gap-2 animate-in fade-in">
            <div className="flex items-center gap-2 text-xs text-rose-200">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>
                Видалити всі <strong>{archivedFormations.length}</strong> формацій з вашого особистого архіву? Інші користувачі не будуть зачеплені.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleClearAll}
                disabled={isClearing}
                className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
              >
                {isClearing ? 'Очищення...' : 'Так, очистити мій архів'}
              </button>
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors cursor-pointer"
              >
                Скасувати
              </button>
            </div>
          </div>
        )}

        {/* Search & Filter Toolbar */}
        <div className="px-4 sm:px-6 py-3 bg-slate-950/60 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-2.5">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Пошук за монетою (BTC, SOL...) чи патерном..."
              className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-purple-500/60 transition-colors"
            />
          </div>

          <div className="flex items-center flex-wrap gap-2 text-xs">
            {/* Exchange Filter */}
            <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-800">
              {(['all', 'binance', 'bybit'] as const).map((ex) => (
                <button
                  key={ex}
                  onClick={() => setExchangeFilter(ex)}
                  className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                    exchangeFilter === ex
                      ? 'bg-purple-600 text-white font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {ex === 'all' ? 'Всі біржі' : ex === 'binance' ? 'Binance' : 'Bybit'}
                </button>
              ))}
            </div>

            {/* Bias Filter */}
            <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-800">
              {(['all', 'bullish', 'bearish'] as const).map((b) => (
                <button
                  key={b}
                  onClick={() => setBiasFilter(b)}
                  className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                    biasFilter === b
                      ? 'bg-purple-600 text-white font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {b === 'all' ? 'Всі типи' : b === 'bullish' ? 'Бичачі ▲' : 'Ведмежі ▼'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Formations List Container */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-3 sm:space-y-4 min-h-[300px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
              <p className="text-xs">Завантаження збережених формацій...</p>
            </div>
          ) : filteredFormations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 sm:py-16 text-center max-w-md mx-auto space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center">
                <FolderArchive className="w-7 h-7" />
              </div>
              <h4 className="text-base font-bold text-white">
                {archivedFormations.length === 0 ? 'Архів формацій порожній' : 'Нічого не знайдено'}
              </h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                {archivedFormations.length === 0
                  ? 'Щоб зберегти формацію в архів, відкрийте будь-яку монету та натисніть кнопку «Додати в архів» прямо над графіком.'
                  : 'За вибраними критеріями пошуку формацій не знайдено. Спробуйте змінити фільтр або очистити пошуковий запит.'}
              </p>
            </div>
          ) : (
            filteredFormations.map((item) => {
              const isBull = item.bias === 'bullish';
              const isBear = item.bias === 'bearish';
              const profitPct = item.formation?.potentialProfitPct || 0;
              const riskPct = item.formation?.potentialRiskPct || 0;

              return (
                <div
                  key={item.id}
                  onClick={() => onSelectFormation(item)}
                  className="group relative rounded-2xl bg-slate-950/70 hover:bg-slate-950 border border-slate-800 hover:border-purple-500/50 p-4 transition-all shadow-md hover:shadow-purple-500/10 cursor-pointer space-y-3"
                >
                  {/* Top Bar: Coin Info, Badges, and Action Buttons */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center flex-wrap gap-2">
                      <span className="font-mono font-extrabold text-white text-sm sm:text-base">
                        {item.baseAsset}/{item.quoteAsset}
                      </span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${
                          item.exchange === 'binance'
                            ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                            : 'bg-orange-500/10 text-orange-300 border border-orange-500/30'
                        }`}
                      >
                        {item.exchange}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                        {item.marketType === 'futures' ? 'USDT-M' : 'Spot'}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 font-mono font-bold">
                        {item.timeframe}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-500 flex items-center gap-1 font-mono">
                        <Calendar className="w-3 h-3 text-slate-500" />
                        {formatDate(item.savedAtTimestamp || item.createdAt)}
                      </span>

                      {/* Delete Button with quick confirmation */}
                      {confirmDeleteId === item.id ? (
                        <div
                          className="flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="text-[10px] text-rose-300">Видалити?</span>
                          <button
                            type="button"
                            onClick={(e) => handleDelete(item.id, e)}
                            disabled={deletingId === item.id}
                            className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold transition-colors cursor-pointer"
                          >
                            Так
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteId(null);
                            }}
                            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] transition-colors cursor-pointer"
                          >
                            Ні
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteId(item.id);
                          }}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                          title="Видалити з архіву"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Formation Name & Direction Badge */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-200">{item.formationName}</span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-semibold flex items-center gap-1 ${
                          isBull
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                            : isBear
                            ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                            : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                        }`}
                      >
                        {isBull ? (
                          <TrendingUp className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <TrendingDown className="w-3 h-3 text-rose-400" />
                        )}
                        <span>{isBull ? 'Бичачий' : isBear ? 'Ведмежий' : 'Нейтральний'}</span>
                      </span>

                      {item.confidence && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 font-mono">
                          {item.confidence}% вірогідність
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => onSelectFormation(item)}
                      className="flex items-center gap-1 px-3 py-1 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 group-hover:text-purple-100 border border-purple-500/40 text-xs font-semibold transition-all cursor-pointer active:scale-95"
                    >
                      <span>Відкрити графік</span>
                      <ExternalLink className="w-3 h-3 text-purple-400" />
                    </button>
                  </div>

                  {/* Saved Entry Points Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-900 text-xs font-mono">
                    <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-800/80">
                      <span className="text-[10px] text-slate-400 block font-sans">Точка входу:</span>
                      <span className="text-sky-300 font-bold text-xs sm:text-sm">
                        ${formatCryptoPrice(item.entryPrice)}
                      </span>
                    </div>

                    <div className="p-2 rounded-xl bg-emerald-950/20 border border-emerald-800/30">
                      <span className="text-[10px] text-emerald-400 block font-sans">
                        Ціль (Тейк):
                      </span>
                      <span className="text-emerald-300 font-bold text-xs sm:text-sm">
                        ${formatCryptoPrice(item.targetPrice)}
                        {profitPct > 0 && (
                          <span className="text-[10px] ml-1 font-normal text-emerald-400">
                            (+{Math.abs(profitPct)}%)
                          </span>
                        )}
                      </span>
                    </div>

                    <div className="p-2 rounded-xl bg-rose-950/20 border border-rose-800/30">
                      <span className="text-[10px] text-rose-400 block font-sans">Стоп-лосс:</span>
                      <span className="text-rose-300 font-bold text-xs sm:text-sm">
                        ${formatCryptoPrice(item.stopLossPrice)}
                        {riskPct !== 0 && (
                          <span className="text-[10px] ml-1 font-normal text-rose-400">
                            (-{Math.abs(riskPct)}%)
                          </span>
                        )}
                      </span>
                    </div>

                    <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-800/80">
                      <span className="text-[10px] text-slate-400 block font-sans">
                        Ціна збереження:
                      </span>
                      <span className="text-slate-200 font-bold text-xs sm:text-sm">
                        ${formatCryptoPrice(item.savedPrice)}
                      </span>
                    </div>
                  </div>

                  {/* Markers & Chart Coordinates Info Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-slate-400">
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1 text-purple-300">
                        <MapPin className="w-3 h-3 text-purple-400" />
                        <span>Міток збережено: {item.markers?.length || 3}</span>
                      </span>
                      {item.necklinePrice && (
                        <span className="text-[10px] font-mono text-amber-400 bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-900/40">
                          Шия: ${formatCryptoPrice(item.necklinePrice)}
                        </span>
                      )}
                      {item.supportPrice && (
                        <span className="text-[10px] font-mono text-purple-400 bg-purple-950/40 px-1.5 py-0.5 rounded border border-purple-900/40">
                          Підтримка: ${formatCryptoPrice(item.supportPrice)}
                        </span>
                      )}
                      {item.resistancePrice && (
                        <span className="text-[10px] font-mono text-orange-400 bg-orange-950/40 px-1.5 py-0.5 rounded border border-orange-900/40">
                          Опір: ${formatCryptoPrice(item.resistancePrice)}
                        </span>
                      )}
                    </div>

                    <span className="text-[10px] text-slate-500 font-mono">
                      ID: {item.id.slice(0, 18)}...
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3 border-t border-slate-800 bg-slate-950/90 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span>
              Всього в особистому архіві: <strong className="text-white font-mono">{archivedFormations.length}</strong>
            </span>
            {user && (
              <span className="text-slate-600 hidden sm:inline">•</span>
            )}
            {user && (
              <span className="text-[11px] text-slate-400 hidden sm:inline">
                Всі збереження ізольовані та захищені правилами безпеки
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {archivedFormations.length > 0 && (
              <button
                type="button"
                onClick={handleExportJson}
                className="md:hidden flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Експорт</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
            >
              Закрити
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
