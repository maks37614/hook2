import React from 'react';
import {
  RefreshCw,
  Bell,
  BellOff,
  Bookmark,
  BookOpen,
  Zap,
  Send,
  User,
  UserPlus,
  Layers,
  Activity,
  BarChart2,
  FolderArchive,
  Monitor,
  Radar,
  Globe,
} from 'lucide-react';
import { MetaScalpSettings } from '../utils/metaScalpService';
import { useAuth } from '../context/AuthContext';
import { ActivePageType } from '../types';
import { useLanguage, SupportedLanguage } from '../context/LanguageContext';

interface HeaderProps {
  isLoading: boolean;
  totalCoins: number;
  formationsCount: number;
  bullishCount: number;
  bearishCount: number;
  watchlistCount: number;
  archiveCount?: number;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onRefresh: () => void;
  onOpenWatchlist: () => void;
  onOpenArchive?: () => void;
  onOpenGuide: () => void;
  onOpenMetaScalp: () => void;
  metaScalpSettings: MetaScalpSettings;
  lastUpdated: number | null;
  telegramAlertsCount?: number;
  surveillanceCount?: number;
  onOpenTelegramAlerts: () => void;
  onOpenAuth?: () => void;
  onOpenProfile?: () => void;
  activePage: ActivePageType;
  onPageChange: (page: ActivePageType) => void;
}

export const Header: React.FC<HeaderProps> = ({
  isLoading,
  totalCoins,
  formationsCount,
  bullishCount,
  bearishCount,
  watchlistCount,
  archiveCount = 0,
  soundEnabled,
  onToggleSound,
  onRefresh,
  onOpenWatchlist,
  onOpenArchive,
  onOpenGuide,
  onOpenMetaScalp,
  metaScalpSettings,
  lastUpdated,
  telegramAlertsCount = 0,
  surveillanceCount = 0,
  onOpenTelegramAlerts,
  onOpenAuth,
  onOpenProfile,
  activePage,
  onPageChange,
}) => {
  const { user, profile } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  return (
    <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md sticky top-0 z-30">
      <div className="max-w-[1720px] mx-auto px-2.5 sm:px-4 lg:px-6 py-1.5 sm:py-2">
        <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Brand Title */}
            <div className="flex items-center">
              <span className="font-bold text-base sm:text-lg tracking-tight text-white font-mono">
                signal<span className="text-cyan-400">hook</span>
              </span>
            </div>

            {/* Navigation Category Tabs */}
            <div className="flex items-center p-0.5 sm:p-1 rounded-xl bg-slate-900/90 border border-slate-800 text-xs shadow-inner">
              <button
                id="nav-category-screener-btn"
                onClick={() => onPageChange('screener')}
                className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                  activePage === 'screener'
                    ? 'bg-gradient-to-r from-indigo-600 to-cyan-600 text-white shadow-sm shadow-indigo-900/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Activity className="w-3.5 h-3.5 text-cyan-400" />
                <span>{t('screener')}</span>
              </button>

              <button
                id="nav-category-patterns-btn"
                onClick={() => onPageChange('patterns')}
                className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                  activePage === 'patterns'
                    ? 'bg-gradient-to-r from-cyan-600 to-cyan-500 text-white shadow-sm shadow-cyan-900/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>{t('patterns')}</span>
                {formationsCount > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                      activePage === 'patterns'
                        ? 'bg-cyan-950/70 text-cyan-200'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {formationsCount}
                  </span>
                )}
              </button>



              <button
                id="nav-category-terminal-btn"
                onClick={() => onPageChange('terminal')}
                className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                  activePage === 'terminal'
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-500 text-white shadow-sm shadow-emerald-900/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
                title="Термінал трейдера"
              >
                <Monitor className="w-3.5 h-3.5 text-emerald-400" />
                <span>{t('terminal')}</span>
              </button>
            </div>
          </div>

          {/* Quick Stats Bar */}
          <div className="hidden xl:flex items-center gap-2.5 sm:gap-4 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-slate-400">Біржі:</span>
              <span className="text-amber-300 font-semibold">Binance</span>
              <span className="text-slate-600">•</span>
              <span className="text-orange-400 font-semibold">Bybit</span>
            </div>
            <div className="h-3.5 w-px bg-slate-800" />
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Формацій:</span>
              <span className="font-bold text-white font-mono bg-slate-800 px-1.5 py-0.5 rounded">
                {formationsCount}
              </span>
            </div>
            <div className="h-3.5 w-px bg-slate-800" />
            <div className="flex items-center gap-2">
              <span className="text-emerald-400 font-semibold">▲ {bullishCount}</span>
              <span className="text-slate-600">/</span>
              <span className="text-rose-400 font-semibold">▼ {bearishCount}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              id="refresh-screener-btn"
              onClick={onRefresh}
              disabled={isLoading}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-sm ${
                isLoading
                  ? 'bg-slate-800 text-slate-400 cursor-not-allowed'
                  : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-900/30'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
             
            </button>

            <button
              id="toggle-sound-btn"
              onClick={onToggleSound}
              title={soundEnabled ? 'Звук сповіщень увімкнено' : 'Звук сповіщень вимкнено'}
              className={`p-1.5 sm:p-2 rounded-lg text-xs border transition-colors ${
                soundEnabled
                  ? 'bg-slate-900 border-slate-700 text-cyan-400 hover:bg-slate-800'
                  : 'bg-slate-900/50 border-slate-800 text-slate-500 hover:text-slate-400'
              }`}
            >
              {soundEnabled ? <Bell className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <BellOff className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
            </button>

            {/* Language Switcher */}
            <div className="relative">
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as SupportedLanguage)}
                className="bg-slate-900 border border-slate-800 text-xs font-mono font-bold text-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-cyan-500 cursor-pointer"
                title={t('language')}
              >
                <option value="uk">🇺🇦 UA</option>
                <option value="en">🇬🇧 EN</option>
                <option value="ru">🇷🇺 RU</option>
                <option value="pl">🇵🇱 PL</option>
              </select>
            </div>

            <button
              id="open-telegram-btn"
              onClick={onOpenTelegramAlerts}
              className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg text-xs bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/40 text-sky-300 transition-all shadow-sm cursor-pointer"
              title="Сповіщення ціни в Telegram"
            >
              <Send className="w-3.5 h-3.5 text-sky-400" />
              <span className="font-semibold hidden md:inline">Telegram</span>
              {telegramAlertsCount > 0 && (
                <span className="min-w-[16px] h-4 px-1 rounded-full bg-sky-500 text-slate-950 font-bold text-[10px] flex items-center justify-center">
                  {telegramAlertsCount}
                </span>
              )}
            </button>

            <button
              id="open-surveillance-btn"
              onClick={() => onPageChange('surveillance')}
              className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg text-xs border transition-all shadow-sm cursor-pointer ${
                activePage === 'surveillance'
                  ? 'bg-gradient-to-r from-violet-600 to-indigo-600 border-violet-500 text-white shadow-violet-900/30'
                  : 'bg-violet-500/15 hover:bg-violet-500/25 border-violet-500/40 text-violet-300'
              }`}
              title="Стеження за Монетою (Системний нагляд SignalHook)"
            >
              <Radar className="w-3.5 h-3.5 text-violet-400" />
              <span className="font-semibold hidden lg:inline">Стеження за Монетою</span>
              <span className="font-semibold hidden sm:inline lg:hidden">Стеження</span>
              {surveillanceCount > 0 && (
                <span className="min-w-[16px] h-4 px-1 rounded-full bg-violet-500 text-slate-950 font-bold text-[10px] flex items-center justify-center">
                  {surveillanceCount}
                </span>
              )}
            </button>

            <button
              id="open-metascalp-btn"
              onClick={onOpenMetaScalp}
              className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg text-xs border transition-all ${
                metaScalpSettings.enabled
                  ? 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/40 text-amber-300 shadow-sm'
                  : 'bg-slate-900/60 hover:bg-slate-800 border-slate-800 text-slate-400'
              }`}
              title="Налаштування лінковки з терміналом MetaScalp"
            >
              <Zap className={`w-3.5 h-3.5 ${metaScalpSettings.enabled ? 'text-amber-400 fill-amber-400/20' : 'text-slate-500'}`} />
              <span className="font-semibold hidden md:inline">MetaScalp</span>
              {metaScalpSettings.enabled && (
                <span className="text-[10px] font-mono font-bold px-1 rounded bg-amber-500/20 text-amber-200 border border-amber-500/30">
                  {metaScalpSettings.binding}
                </span>
              )}
            </button>

            <button
              id="open-watchlist-btn"
              onClick={onOpenWatchlist}
              className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg text-xs bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 transition-colors"
              title="Список обраних монет"
            >
              <Bookmark className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden lg:inline">Обране</span>
              {watchlistCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-amber-500 text-slate-950 font-bold text-[10px] flex items-center justify-center">
                  {watchlistCount}
                </span>
              )}
            </button>

            <button
              id="open-archive-btn"
              onClick={onOpenArchive}
              className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg text-xs bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/40 text-purple-300 transition-all shadow-sm cursor-pointer"
              title="Архів збережених формацій та графіків"
            >
              <FolderArchive className="w-3.5 h-3.5 text-purple-400" />
              <span className="font-semibold hidden lg:inline">Архів</span>
              {archiveCount > 0 && (
                <span className="min-w-[16px] h-4 px-1 rounded-full bg-purple-500 text-slate-950 font-bold text-[10px] flex items-center justify-center">
                  {archiveCount}
                </span>
              )}
            </button>

            <button
              id="open-guide-btn"
              onClick={onOpenGuide}
              className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg text-xs bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 transition-colors"
              title="Довідник формацій"
            >
              <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden lg:inline">Довідник</span>
            </button>

            {/* Profile / Auth Button */}
            {user ? (
              <button
                id="user-profile-btn"
                onClick={onOpenProfile}
                className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg text-xs bg-cyan-950/40 hover:bg-cyan-900/50 border border-cyan-500/30 text-cyan-200 transition-colors cursor-pointer"
                title="Особистий профіль та налаштування"
              >
                <div className="w-4 h-4 rounded-full bg-cyan-500/30 text-cyan-300 font-bold text-[9px] flex items-center justify-center border border-cyan-400/40">
                  {(profile?.displayName || user.email || 'U')[0].toUpperCase()}
                </div>
                <span className="hidden sm:inline font-medium max-w-[90px] truncate">
                  {profile?.displayName || user.email?.split('@')[0]}
                </span>
              </button>
            ) : (
              <button
                id="auth-login-btn"
                onClick={onOpenAuth}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs bg-emerald-950/40 hover:bg-emerald-900/50 border border-emerald-500/40 text-emerald-300 transition-colors cursor-pointer font-medium"
                title="Увійти або створити профіль"
              >
                <UserPlus className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden xs:inline">Увійти</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
