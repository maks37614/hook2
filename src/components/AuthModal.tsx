import React, { useState } from 'react';
import {
  X,
  LogIn,
  UserPlus,
  Mail,
  Lock,
  User as UserIcon,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  Send,
  Sliders,
  Sparkles,
  ExternalLink,
  Key,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AUTHOR_TELEGRAM_CHANNEL_URL, AUTHOR_TELEGRAM_USERNAME } from '../utils/accessCodes';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'signin' | 'signup';
  onSuccess?: () => void;
  isRestrictedMode?: boolean; // When true, modal cannot be closed by unregistered user
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  initialMode = 'signin',
  onSuccess,
  isRestrictedMode = false,
}) => {
  const { user, signInWithGoogle, signInWithEmail, registerWithEmail, authError, authErrorCode, clearAuthError } = useAuth();

  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);

  if (!isOpen) return null;

  const handleModeSwitch = (newMode: 'signin' | 'signup') => {
    setMode(newMode);
    clearAuthError();
    setValidationError(null);
  };

  const handleGoogleAuth = async () => {
    setIsSubmitting(true);
    clearAuthError();
    setValidationError(null);
    try {
      await signInWithGoogle();
      onSuccess?.();
      onClose();
    } catch {
      // Handled in context
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAuthError();
    setValidationError(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setValidationError('Введіть адресу електронної пошти або логін');
      return;
    }
    if (!password) {
      setValidationError('Введіть пароль');
      return;
    }
    if (password.length < 6) {
      setValidationError('Пароль повинен містити не менше 6 символів');
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === 'signin') {
        await signInWithEmail(cleanEmail, password);
      } else {
        await registerWithEmail(cleanEmail, password, displayName, inviteCode.trim() || 'SIGNALHOOK');
      }
      onSuccess?.();
      onClose();
    } catch {
      // Handled in context
    } finally {
      setIsSubmitting(false);
    }
  };

  const isOperationNotAllowed =
    authErrorCode === 'auth/operation-not-allowed' ||
    Boolean(authError && (authError.includes('operation-not-allowed') || authError.includes('Firebase Console')));

  const displayedError = validationError || authError;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto cursor-default"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="relative w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl shadow-cyan-950/30 overflow-hidden flex flex-col max-h-[94vh] my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center shadow-sm">
              {mode === 'signin' ? <LogIn className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-wide">
                {mode === 'signin' ? 'Вхід у скрінер' : 'Реєстрація у скрінері'}
              </h2>
              <p className="text-[11px] text-slate-400">
                {mode === 'signin'
                  ? 'Особисті сповіщення, MetaScalp та обране'
                  : 'Без підтвердження пошти — миттєвий доступ'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switchers */}
        <div className="grid grid-cols-2 p-1.5 bg-slate-950/90 border-b border-slate-800 text-xs">
          <button
            type="button"
            onClick={() => handleModeSwitch('signin')}
            className={`py-2 rounded-lg font-semibold transition-all flex items-center justify-center gap-1.5 ${
              mode === 'signin'
                ? 'bg-slate-800 text-cyan-300 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Вхід</span>
          </button>
          <button
            type="button"
            onClick={() => handleModeSwitch('signup')}
            className={`py-2 rounded-lg font-semibold transition-all flex items-center justify-center gap-1.5 ${
              mode === 'signup'
                ? 'bg-slate-800 text-cyan-300 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Реєстрація (за кодом)</span>
          </button>
        </div>

        {/* Form Body */}
        <div className="p-5 sm:p-6 space-y-4 overflow-y-auto">
          {/* Telegram Channel CTA Banner for Invite Code */}
          {mode === 'signup' && (
            <div className="p-3.5 rounded-xl bg-gradient-to-r from-sky-950/40 to-slate-950 border border-sky-500/30 space-y-2 text-xs">
              <div className="flex items-start gap-2">
                <Send className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-bold text-sky-200 block text-xs">
                    Де взяти спеціальний код доступу?
                  </span>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Коди для реєстрації видаються виключно в офіційному <strong>Telegram каналі автора</strong>. Реєстрація без підтвердження пошти — одразу доступ до всіх функцій!
                  </p>
                </div>
              </div>
              <a
                href={AUTHOR_TELEGRAM_CHANNEL_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2 px-3 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm shadow-sky-500/20"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Отримати код у Telegram каналі автора</span>
                <ExternalLink className="w-3 h-3 ml-auto opacity-75" />
              </a>
            </div>
          )}

          {/* Featured 1-Click Google Sign In */}
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
            <button
              type="button"
              onClick={handleGoogleAuth}
              disabled={isSubmitting}
              className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-900 text-xs font-bold transition-all flex items-center justify-center gap-2.5 shadow-md shadow-white/5 disabled:opacity-50 cursor-pointer"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>
                {mode === 'signin' ? 'Швидкий вхід через Google' : 'Зареєструватися через Google'}
              </span>
            </button>
          </div>

          {/* Operation Not Allowed Help Card if email provider is disabled */}
          {isOperationNotAllowed && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs space-y-2 animate-in fade-in">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-white text-xs">
                    Локальна авторизація активована
                  </p>
                  <p className="text-[11px] text-amber-200/90 leading-relaxed">
                    Ви можете увійти за допомогою кнопки Google або ввести Email/пароль нижче — акаунт збережеться для вашого пристрою автоматично!
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Standard error notification */}
          {displayedError && !isOperationNotAllowed && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{displayedError}</span>
            </div>
          )}

          <div className="relative flex items-center justify-center my-2">
            <div className="border-t border-slate-800 w-full" />
            <span className="bg-slate-900 px-3 text-[11px] text-slate-500 font-medium uppercase tracking-wider absolute">
              або електронна пошта
            </span>
          </div>

          {/* Email & Password Form */}
          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === 'signup' && (
              <>
                {/* Special Access Code Input (REQUIRED) */}
                <div>
                  <label className="block text-xs font-bold text-amber-300 mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <Key className="w-3.5 h-3.5 text-amber-400" />
                      Спеціальний код доступу *
                    </span>
                    <span className="text-[10px] text-amber-400/80 font-normal">
                      З Telegram каналу
                    </span>
                  </label>
                  <div className="relative">
                    <Key className="w-4 h-4 text-amber-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      required
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                      placeholder="Наприклад: SCALPER2025"
                      className="w-full bg-slate-950 border-2 border-amber-500/50 focus:border-amber-400 rounded-xl pl-9 pr-3 py-2 text-xs text-amber-200 font-mono font-bold tracking-wider placeholder:text-slate-600 focus:outline-none transition-colors shadow-inner"
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Отримайте код у Telegram: <a href={AUTHOR_TELEGRAM_CHANNEL_URL} target="_blank" rel="noreferrer" className="text-sky-400 hover:underline">{AUTHOR_TELEGRAM_USERNAME}</a>
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Ім'я або позивний
                  </label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Наприклад: Alex Scalper"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 transition-colors"
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Електронна пошта (Email)
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Пароль
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Мінімум 6 символів"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-9 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-semibold text-xs transition-all shadow-lg shadow-cyan-900/30 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : mode === 'signin' ? (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>Увійти у скрінер</span>
                </>
              ) : (
                <>
                  <Key className="w-4 h-4 text-amber-300" />
                  <span>Активувати профіль за кодом</span>
                </>
              )}
            </button>
          </form>

          {/* Benefits pill & Isolation Guarantee */}
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 space-y-1.5 text-xs text-slate-300">
            <div className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Повна ізоляція профілю</span>
            </div>
            <ul className="space-y-1 text-[11px] text-slate-400 pl-1">
              <li className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                <span>Особистий список обраних монет для кожного акаунта</span>
              </li>
              <li className="flex items-center gap-1.5">
                <Send className="w-3 h-3 text-sky-400 shrink-0" />
                <span>Індивідуальні Telegram сповіщення та бот</span>
              </li>
              <li className="flex items-center gap-1.5">
                <Sliders className="w-3 h-3 text-amber-400 shrink-0" />
                <span>Індивідуальна лінковка та група MetaScalp</span>
              </li>
            </ul>
          </div>

          {/* Footer toggle prompt */}
          <div className="text-center pt-1">
            <p className="text-xs text-slate-400">
              {mode === 'signin' ? 'Ще не зареєстровані?' : 'Вже маєте обліковий запис?'}{' '}
              <button
                type="button"
                onClick={() => handleModeSwitch(mode === 'signin' ? 'signup' : 'signin')}
                className="text-cyan-400 font-semibold hover:underline cursor-pointer ml-1"
              >
                {mode === 'signin' ? 'Зареєструватися за кодом' : 'Увійти'}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
