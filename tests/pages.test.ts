import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { terminate } from 'firebase/firestore';
import { db } from '../src/firebase';
import { AuthProvider } from '../src/context/AuthContext';
import { AlertsProvider } from '../src/context/AlertsContext';
import { ArchiveProvider } from '../src/context/ArchiveContext';
import { SurveillanceProvider } from '../src/context/SurveillanceContext';
import { LanguageProvider } from '../src/context/LanguageContext';
import App from '../src/App';
import { CoinScreenerPage } from '../src/components/CoinScreenerPage';
import { SurveillancePage } from '../src/components/SurveillancePage';
import { TerminalPage } from '../src/components/TerminalPage';
import { ReplayPage } from '../src/components/ReplayPage';
import { FormationCard } from '../src/components/FormationCard';
import { detectFormations } from '../src/utils/patternRecognition';
import { getFallbackScannedCoins } from '../src/utils/directExchangeClient';

Object.defineProperty(globalThis, 'localStorage', { value: { getItem: () => null, setItem: () => {}, removeItem: () => {} }, configurable: true });
test.after(() => terminate(db));
const noop = () => {};
const wrap = (child: React.ReactNode) =>
  React.createElement(AuthProvider, { children:
    React.createElement(AlertsProvider, { children:
      React.createElement(ArchiveProvider, { children:
        React.createElement(SurveillanceProvider, { children:
          React.createElement(LanguageProvider, { children: child }),
        }),
      }),
    }),
  });

const pages: Array<[string, React.ReactNode]> = [
  ['application shell', React.createElement(App)],
  ['coin screener', React.createElement(CoinScreenerPage, { watchlist: [], onSelectCoin: noop,
    onToggleWatchlist: noop, onOpenTelegramAlerts: noop, onOpenWatchlist: noop })],
  ['surveillance', React.createElement(SurveillancePage)],
  ['terminal', React.createElement(TerminalPage, { coins: [], watchlist: [], onToggleWatchlist: noop })],
  ['replay', React.createElement(ReplayPage, { coins: [] })],
];
for (const [name, page] of pages) {
  test(`${name} renders without crashing with empty or offline data`, () => {
    const html = renderToString(wrap(page));
    assert.ok(html.length > 100);
    assert.ok(!html.includes('NaN'));
  });
}

test('formation card renders valid measured levels', () => {
  const data = Array.from({ length: 40 }, (_, i) => ({
    time: Math.floor(Date.now() / 1000) - (41 - i) * 3600,
    open: 99, high: 100, low: 98, close: 99, volume: 100,
  }));
  data[39] = { ...data[39], open: 98.5, close: 99.5, high: 99.7, low: 90 };
  const formation = detectFormations(data, 'BTCUSDT').find(f => f.patternKey === 'hammer');
  assert.ok(formation);
  const coin = { ...getFallbackScannedCoins()[0], currentPrice: 99.5, formations: [formation] };
  const html = renderToString(wrap(React.createElement(FormationCard, { coin, formation,
    isWatchlisted: false, onToggleWatchlist: noop, onSelect: noop })));
  assert.ok(!html.includes('NaN'));
  assert.ok(html.includes('BTC'));
});
