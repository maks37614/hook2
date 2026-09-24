import { GoogleGenAI } from '@google/genai';
import { DetectedFormation, FormationAIAnalysis, Kline } from '../src/types';

let genAI: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI | null {
  if (genAI) return genAI;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  try {
    genAI = new GoogleGenAI({ apiKey });
    return genAI;
  } catch (err) {
    console.error('Error initializing Gemini client:', err);
    return null;
  }
}

export async function analyzeFormationWithAI(
  symbol: string,
  exchange: string,
  timeframe: string,
  formation: DetectedFormation,
  currentPrice: number,
  recentCandles: Kline[]
): Promise<FormationAIAnalysis> {
  const ai = getGeminiClient();

  if (ai) {
    try {
      const prompt = `Ти — професійний інституційний крипто-трейдер та аналітик Price Action.
Проаналізуй наступну виявлену технічну формацію на монеті:
Монета: ${symbol}
Біржа: ${exchange.toUpperCase()}
Таймфрейм: ${timeframe}
Формація: ${formation.name} (${formation.nameEn})
Тип/Категорія: ${formation.category}, Напрямок: ${formation.bias}
Поточна ціна: ${currentPrice}
Рівні: Вхід ~${formation.levels.entryPrice}, Ціль ~${formation.levels.targetPrice}, Стоп-лос ~${formation.levels.stopLossPrice}
${formation.levels.resistancePrice ? `Опір: ${formation.levels.resistancePrice}` : ''}
${formation.levels.supportPrice ? `Підтримка: ${formation.levels.supportPrice}` : ''}
${formation.levels.necklinePrice ? `Лінія шиї: ${formation.levels.necklinePrice}` : ''}

Останні 5 свічок:
${recentCandles.slice(-5).map((c, i) => `Свічка ${i + 1}: O:${c.open.toFixed(4)}, H:${c.high.toFixed(4)}, L:${c.low.toFixed(4)}, C:${c.close.toFixed(4)}, Vol:${c.volume.toFixed(0)}`).join('\n')}

Дай структуровану JSON відповідь з наступними полями (виключно українською мовою):
{
  "summary": "Коротке резюме ситуації та готовності формації (2-3 речення українською)",
  "patternConfirmation": "Що необхідно для підтвердження істинності формації (об'єм, закриття свічки)",
  "targetAnalysis": "Обґрунтування цілей TP1 та TP2 з точки зору ліквідності",
  "invalidationCriteria": "За якої умови патерн повністю скасовується (інвалідація)",
  "volumeRecommendation": "Рекомендації щодо аналізу кластерів та об'ємів",
  "tradeScenario": {
    "recommendedEntry": "Рекомендована точка входу (ліміт/маркет/пробій)",
    "tp1": "Консервативна ціль (ціна)",
    "tp2": "Основна ціль (ціна)",
    "stopLoss": "Рекомендований стоп-лос (ціна)",
    "rrRatio": "Розрахункове співвідношення ризик/прибуток (наприклад, 1:2.8)"
  },
  "keyRisks": ["Ризик 1", "Ризик 2", "Ризик 3"]
}
Відповідай ТІЛЬКИ валідним JSON без markdown обгорток або з \`\`\`json.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      const text = response.text || '';
      const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      return parsed as FormationAIAnalysis;
    } catch (err) {
      console.warn('Gemini API call failed, falling back to technical engine analysis:', err);
    }
  }

  // Deterministic technical fallback in Ukrainian
  const isBullish = formation.bias === 'bullish';
  const entry = formation.levels.entryPrice || currentPrice;
  const target = formation.levels.targetPrice;
  const stop = formation.levels.stopLossPrice;
  const tp1 = isBullish ? entry + (target - entry) * 0.5 : entry - (entry - target) * 0.5;

  return {
    summary: `Формація "${formation.name}" на таймфреймі ${timeframe} знаходиться у фазі "${formation.statusLabel}". Співвідношення Risk/Reward оцінюється в 1:${formation.riskRewardRatio.toFixed(1)}.`,
    patternConfirmation: isBullish
      ? 'Підтвердження потребує закріплення свічки вище локального опору зі зростанням торговельного обсягу вище 20-періодної ковзної середньої.'
      : 'Підтвердження потребує закриття свічки нижче ключової підтримки зі сплеском тиску продавців.',
    targetAnalysis: `Первинне зняття ліквідності очікується на рівні ${tp1.toFixed(4)} (TP1), основний тейк-профіт розташований на висоті патерну ${target.toFixed(4)} (TP2).`,
    invalidationCriteria: `Повне скасування сценарію при зворотному імпульсі та закритті тіла свічки за рівнем інвалідації ${stop.toFixed(4)}.`,
    volumeRecommendation: 'Зверніть увагу на об\'єм: на імпульсі виходу обсяг має перевищувати середній мінімум у 1.5–2 рази. Вхід на згасаючому обсязі несе підвищений ризик хибного пробою.',
    tradeScenario: {
      recommendedEntry: formation.status === 'breakout' ? `За поточною ціною ${entry.toFixed(4)} або на локальному ретесті` : `Відкладений лімітний ордер біля ${entry.toFixed(4)}`,
      tp1: tp1.toFixed(4),
      tp2: target.toFixed(4),
      stopLoss: stop.toFixed(4),
      rrRatio: `1:${formation.riskRewardRatio.toFixed(1)}`,
    },
    keyRisks: [
      'Хибний пробій (Fakeout) зі швидким поверненням у діапазон',
      'Різка загальна волатильність Bitcoin, що впливає на альткоїни',
      'Знижена ліквідність на молодших таймфреймах',
    ],
  };
}
