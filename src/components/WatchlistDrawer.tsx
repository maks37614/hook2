import React, { useState } from 'react';
import { X, Trash2, Star, Zap, FolderPlus, ArrowUpDown, ChevronDown, ChevronUp } from 'lucide-react';
import { ScannedCoin } from '../types';
import { formatCryptoPrice } from '../utils/formatters';

interface WatchlistDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  watchlistSymbols: string[];
  allCoins: ScannedCoin[];
  onRemove: (symbol: string) => void;
  folders: Record<string, string[]>;
  onFoldersChange: (folders: Record<string, string[]>) => void;
  onSendMetaScalp?: (coin: ScannedCoin) => void;
  metaScalpBinding?: string;
}

export const WatchlistDrawer: React.FC<WatchlistDrawerProps> = ({
  isOpen,
  onClose,
  watchlistSymbols,
  allCoins,
  onRemove,
  folders,
  onFoldersChange,
  onSendMetaScalp,
  metaScalpBinding = '001',
}) => {
  const [newFolderName, setNewFolderName] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'price' | 'change' | 'volume'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});

  if (!isOpen) return null;

  const uniqueWatchlist = Array.from(new Set(watchlistSymbols));
  const watchlistedCoins = allCoins.filter((c) => uniqueWatchlist.includes(c.symbol));

  const folderNames = Object.keys(folders);
  const getFolderForSymbol = (symbol: string) => folderNames.find((folder) => folders[folder].includes(symbol)) || '';
  const sortCoins = (coins: ScannedCoin[]) => [...coins].sort((a, b) => {
    let result = 0;
    if (sortBy === 'name') result = a.baseAsset.localeCompare(b.baseAsset);
    if (sortBy === 'price') result = a.currentPrice - b.currentPrice;
    if (sortBy === 'change') result = a.priceChange24h - b.priceChange24h;
    if (sortBy === 'volume') result = a.volume24hUsd - b.volume24hUsd;
    return sortDirection === 'asc' ? result : -result;
  });
  const groups = folderNames.map((folder) => ({
    name: folder,
    coins: sortCoins(watchlistedCoins.filter((coin) => folders[folder].includes(coin.symbol))),
  }));
  const assignedSymbols = new Set(Object.values(folders).flat());
  groups.push({
    name: '',
    coins: sortCoins(watchlistedCoins.filter((coin) => !assignedSymbols.has(coin.symbol))),
  });

  const createFolder = () => {
    const name = newFolderName.trim();
    if (!name || folders[name]) return;
    onFoldersChange({ ...folders, [name]: [] });
    setNewFolderName('');
  };

  const moveCoin = (symbol: string, folder: string) => {
    const next: Record<string, string[]> = {};

    Object.entries(folders).forEach(([name, symbols]) => {
      const safeSymbols = Array.isArray(symbols) ? symbols : [];
      next[name] = safeSymbols.filter((item) => item !== symbol);
    });

    if (folder) {
      next[folder] = [...(next[folder] || []), symbol];
    }

    onFoldersChange(next);
  };

  const removeCoin = (symbol: string) => {
    onRemove(symbol);
    moveCoin(symbol, '');
  };

  const formatPrice = (price: number) => formatCryptoPrice(price);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-slate-900 border-l border-slate-800 h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/80">
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
            <h3 className="font-bold text-white text-sm">Обрані монети</h3>
            <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 text-xs font-mono">
              {uniqueWatchlist.length}
            </span>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/80 space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1">
              <FolderPlus className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <input
                value={newFolderName}
                onChange={(event) => setNewFolderName(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && createFolder()}
                placeholder="Нова папка"
                className="min-w-0 flex-1 bg-transparent text-xs text-slate-200 outline-none placeholder:text-slate-600"
              />
            </div>
            <button
              onClick={createFolder}
              className="px-2.5 py-1.5 rounded-lg bg-cyan-500/15 text-cyan-300 text-xs font-semibold hover:bg-cyan-500/25 transition-colors"
            >
              Додати
            </button>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as typeof sortBy)}
              className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-slate-300 outline-none"
            >
              <option value="name">За назвою</option>
              <option value="price">За ціною</option>
              <option value="change">За зміною 24г</option>
              <option value="volume">За об'ємом</option>
            </select>
            <button
              onClick={() => setSortDirection((direction) => direction === 'asc' ? 'desc' : 'asc')}
              className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 hover:text-white transition-colors"
              title="Змінити напрямок сортування"
            >
              {sortDirection === 'asc' ? '↑' : '↓'}
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto touch-scroll p-4 space-y-3">
          {watchlistedCoins.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs space-y-2">
              <Star className="w-8 h-8 text-slate-700 mx-auto" />
              <p>В обраному поки немає монет</p>
              <p className="text-[11px] text-slate-600">
                Натисніть на зірочку біля будь-якої монети в скринері, щоб додати її сюди.
              </p>
            </div>
          ) : (
            groups.filter((group) => group.coins.length > 0).map((group) => (
              <div key={group.name || 'unfiled'} className="space-y-2">
                <button
                  onClick={() => setCollapsedFolders((current) => ({
                    ...current,
                    [group.name || 'unfiled']: !current[group.name || 'unfiled'],
                  }))}
                  className="w-full flex items-center gap-2 text-[11px] font-semibold text-slate-400 hover:text-slate-200 transition-colors"
                >
                  <Star className="w-3.5 h-3.5 text-amber-400" />
                  {group.name || 'Без папки'}
                  <span className="text-slate-600 font-mono">{group.coins.length}</span>
                  <span className="ml-auto">
                    {collapsedFolders[group.name || 'unfiled'] ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                  </span>
                </button>
                {!collapsedFolders[group.name || 'unfiled'] && group.coins.map((coin, index) => (
              <div
                key={`${coin.exchange}-${coin.symbol}-${coin.marketType}-${index}`}
                className="bg-slate-950/70 border border-slate-800 hover:border-slate-700 rounded-xl p-3 space-y-2.5 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-sm text-white">{coin.baseAsset}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded font-semibold uppercase bg-slate-800 text-slate-400">
                      {coin.exchange}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold text-xs text-white">${formatPrice(coin.currentPrice)}</span>
                    {onSendMetaScalp && (
                      <button
                        onClick={() => onSendMetaScalp(coin)}
                        title={`Відкрити в MetaScalp [${metaScalpBinding}]`}
                        className="text-amber-400/80 hover:text-amber-300 p-1 rounded hover:bg-amber-500/10 transition-colors"
                      >
                        <Zap className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <select
                      value={getFolderForSymbol(coin.symbol)}
                      onChange={(event) => moveCoin(coin.symbol, event.target.value)}
                      className="max-w-[90px] bg-slate-900 border border-slate-800 rounded px-1 py-0.5 text-[10px] text-slate-400 outline-none"
                      title="Перемістити в папку"
                    >
                      <option value="">Без папки</option>
                      {folderNames.map((folder) => <option key={folder} value={folder}>{folder}</option>)}
                    </select>
                    <button
                      onClick={() => removeCoin(coin.symbol)}
                      title="Видалити з обраного"
                      className="text-slate-500 hover:text-rose-400 p-1 rounded hover:bg-slate-800 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

              </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
