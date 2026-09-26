import React, { useState } from 'react';
import { X, BookOpen, ChevronRight, CheckCircle2, AlertCircle } from 'lucide-react';

interface GuideItem {
  id: string;
  name: string;
  nameEn: string;
  category: string;
  bias: 'bullish' | 'bearish' | 'neutral';
  description: string;
  entryRule: string;
  stopLossRule: string;
  targetRule: string;
  volumeRule: string;
}

const GUIDE_ITEMS: GuideItem[] = [
  {
    id: 'double_bottom',
    name: 'Подвійне дно (W-патерн)',
    nameEn: 'Double Bottom',
    category: 'Розворотна формація',
    bias: 'bullish',
    description: 'Один із найнадійніших бичачих розворотних патернів. Утворює два дна на одному горизонтальному рівні цін із проміжною вершиною (лінія шиї).',
    entryRule: 'Вхід здійснюється при пробої лінії шиї знизу вгору або на консервативному ретесті лінії шиї зверху.',
    stopLossRule: 'Стоп-лос розміщується за друге дно або трохи нижче локального мінімуму консолідації.',
    targetRule: 'Тейк-профіт дорівнює висоті від мінімумів дна до лінії шиї, відкладеній вгору від точки пробою.',
    volumeRule: 'Обсяг на формуванні першого дна високий, на другому дні знижується, а на пробої лінії шиї різко зростає.',
  },
  {
    id: 'double_top',
    name: 'Подвійна вершина (M-патерн)',
    nameEn: 'Double Top',
    category: 'Розворотна формація',
    bias: 'bearish',
    description: 'Ведмежий розворотний патерн, що сигналізує про вичерпання сил покупців після двох невдалих спроб оновити максимум.',
    entryRule: 'Вхід у шорт при пробої лінії шиї (западини між вершинами) вниз або на зворотному ретесті знизу.',
    stopLossRule: 'Стоп-лос ставиться за другу вершину або за максимальний шип.',
    targetRule: 'Ціль дорівнює висоті від вершин до лінії шиї, відкладеній униз.',
    volumeRule: 'Сплеск обсягу продавців при пробої лінії шиї вниз.',
  },
  {
    id: 'asc_triangle',
    name: 'Висхідний трикутник',
    nameEn: 'Ascending Triangle',
    category: 'Пробійна формація',
    bias: 'bullish',
    description: 'Характеризується горизонтальним опором і серією підвищуваних мінімумів (Higher Lows). Показує пресинг покупців.',
    entryRule: 'Вхід у лонг при імпульсному пробої горизонтального рівня опору або на його ретесті.',
    stopLossRule: 'Стоп-лос розміщується під останній локальний підвищуваний мінімум.',
    targetRule: 'Ціль дорівнює максимальній висоті трикутника (від основи до опору), відкладеній вгору.',
    volumeRule: 'Обсяг падає під час формування трикутника і вибухає на пробої опору.',
  },
  {
    id: 'desc_triangle',
    name: 'Спадний трикутник',
    nameEn: 'Descending Triangle',
    category: 'Пробійна формація',
    bias: 'bearish',
    description: 'Горизонтальна лінія підтримки і серія знижуваних максимумів (Lower Highs). Продавці методично вибивають лімітні заявки покупців.',
    entryRule: 'Вхід у шорт при закритті свічки нижче рівня підтримки.',
    stopLossRule: 'Стоп-лос ставиться за останній знижуваний максимум.',
    targetRule: 'Ціль дорівнює висоті основи трикутника, відкладеній униз від рівня підтримки.',
    volumeRule: 'Збільшення обсягу на пробої рівня підтримки.',
  },
  {
    id: 'bull_flag',
    name: 'Бичачий прапор (Bull Flag)',
    nameEn: 'Bull Flag',
    category: 'Продовження тренду',
    bias: 'bullish',
    description: 'Потужне вертикальне імпульсне зростання (флагшток) змінюється компактною спадною або бічною консолідацією зі згасанням обсягу.',
    entryRule: 'Вхід при пробої верхньої похилої лінії полотна прапора.',
    stopLossRule: 'Стоп-лос ставиться під нижню межу полотна прапора.',
    targetRule: 'Довжина нового імпульсу часто дорівнює довжині попереднього флагштока.',
    volumeRule: 'Величезний обсяг на флагштоку, спадний обсяг у полотні та новий сплеск обсягу на виході з прапора.',
  },
  {
    id: 'bear_flag',
    name: 'Ведмежий прапор (Bear Flag)',
    nameEn: 'Bear Flag',
    category: 'Продовження тренду',
    bias: 'bearish',
    description: 'Різкий обвал ціни (флагшток) з подальшим слабким висхідним відкатом. Попереджає про швидке продовження розпродажу.',
    entryRule: 'Вхід у шорт при пробої нижньої межі висхідного каналу.',
    stopLossRule: 'Стоп-лос за верхню межу каналу відкату.',
    targetRule: 'Висота флагштока, відкладена вниз від точки пробою.',
    volumeRule: 'Високий обсяг на падінні, спад обсягу на відкаті.',
  },
  {
    id: 'volatility_squeeze',
    name: 'Стиснення діапазону (Squeeze)',
    nameEn: 'Volatility Squeeze',
    category: 'Накопичення / Стиснення',
    bias: 'neutral',
    description: 'Критичне звуження торгового діапазону та падіння ATR. Фаза накопичення великого гравця перед потужним пострілом ціни.',
    entryRule: 'Вхід за напрямком імпульсного виходу з меж діапазону накопичення.',
    stopLossRule: 'Стоп-лос за протилежну межу діапазону накопичення.',
    targetRule: 'Мінімум 2-3 величини діапазону стиснення.',
    volumeRule: 'Аномально низький обсяг у період стиснення з різким вибуховим зростанням на старті руху.',
  },
  {
    id: 'candlestick_pa',
    name: 'Свічкові формації (Пін-бар, Поглинання)',
    nameEn: 'Price Action Candlesticks',
    category: 'Свічковий Price Action',
    bias: 'bullish',
    description: 'Відображають миттєву боротьбу попиту та пропозиції на ключових рівнях: Молот/Пін-бар (хибний пробій і різкий викуп) та Поглинання (зміна контролю).',
    entryRule: 'Вхід на закритті свічки або на 50% відкаті довгої тіні пін-бара.',
    stopLossRule: 'За тінь пін-бара або за екстремум свічки поглинання.',
    targetRule: 'Найближчий рівень опору/підтримки з R:R від 1:2.',
    volumeRule: 'Розворотні свічки на підвищеному обсязі мають максимальну силу.',
  },
];

interface FormationGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FormationGuideModal: React.FC<FormationGuideModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const [selectedId, setSelectedId] = useState<string>(GUIDE_ITEMS[0].id);
  const activeItem = GUIDE_ITEMS.find((item) => item.id === selectedId) || GUIDE_ITEMS[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-6 bg-black/80 backdrop-blur-sm overflow-y-auto touch-scroll">
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-800 bg-slate-950/70">
          <div className="flex items-center gap-2 sm:gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30 shrink-0">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-extrabold text-white">Енциклопедія формацій & Патернів</h2>
              <p className="text-[11px] sm:text-xs text-slate-400">Правила входу, встановлення стоп-лосу та цілей</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body: Sidebar list + Detail panel */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-3 overflow-y-auto md:overflow-hidden divide-y md:divide-y-0">
          {/* List */}
          <div className="md:border-r border-slate-800 bg-slate-950/40 p-2 sm:p-3 space-y-1 overflow-y-auto max-h-[160px] md:max-h-[550px] touch-scroll">
            {GUIDE_ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                className={`w-full text-left px-2.5 sm:px-3 py-2 sm:py-2.5 rounded-xl text-xs transition-all flex items-center justify-between ${
                  selectedId === item.id
                    ? 'bg-slate-800 text-white font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                }`}
              >
                <div>
                  <div className="font-semibold text-xs">{item.name}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{item.category}</div>
                </div>
                <ChevronRight className={`w-3.5 h-3.5 shrink-0 ${selectedId === item.id ? 'text-cyan-400' : 'text-slate-600'}`} />
              </button>
            ))}
          </div>

          {/* Details */}
          <div className="md:col-span-2 p-4 sm:p-6 overflow-y-auto max-h-[420px] md:max-h-[550px] space-y-4 touch-scroll">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                  {activeItem.category}
                </span>
                <h3 className="text-lg font-extrabold text-white mt-0.5">{activeItem.name}</h3>
              </div>
              <span
                className={`text-xs px-2.5 py-1 rounded-lg font-bold uppercase ${
                  activeItem.bias === 'bullish'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : activeItem.bias === 'bearish'
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                }`}
              >
                {activeItem.bias === 'bullish' ? 'LONG' : activeItem.bias === 'bearish' ? 'SHORT' : 'NEUTRAL'}
              </span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed bg-slate-950 p-3.5 rounded-xl border border-slate-800">
              {activeItem.description}
            </p>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
                <span className="font-bold text-sky-400 flex items-center gap-1.5 mb-1 text-xs">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Точка входу:
                </span>
                <p className="text-slate-300 leading-relaxed pl-5">{activeItem.entryRule}</p>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
                <span className="font-bold text-rose-400 flex items-center gap-1.5 mb-1 text-xs">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Стоп-лос:
                </span>
                <p className="text-slate-300 leading-relaxed pl-5">{activeItem.stopLossRule}</p>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
                <span className="font-bold text-emerald-400 flex items-center gap-1.5 mb-1 text-xs">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Тейк-профіт:
                </span>
                <p className="text-slate-300 leading-relaxed pl-5">{activeItem.targetRule}</p>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
                <span className="font-bold text-amber-400 flex items-center gap-1.5 mb-1 text-xs">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Підтвердження обсягом:
                </span>
                <p className="text-slate-300 leading-relaxed pl-5">{activeItem.volumeRule}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
