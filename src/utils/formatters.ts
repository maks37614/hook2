/**
 * High-precision currency & crypto price formatter.
 * Handles assets from ultra-low fractions ($0.00000012) to high-value assets ($100,000+).
 */

export function formatCryptoPrice(price: number | undefined | null): string {
  if (price === undefined || price === null || isNaN(price) || !isFinite(price)) {
    return '0.00';
  }
  if (price === 0) return '0.00';

  const abs = Math.abs(price);

  if (abs >= 1000) {
    return price.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  if (abs >= 10) {
    return price.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  if (abs >= 1) {
    return price.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });
  }

  // For prices < 1 (e.g. micro-altcoins & meme tokens),
  // dynamically calculate precision so that at least 4 significant digits are visible
  const exponent = Math.floor(Math.log10(abs)); // e.g. -5 for 0.000012
  const precision = Math.min(10, Math.max(4, Math.abs(exponent) + 3));
  return price.toFixed(precision);
}

/**
 * Provides dynamic precision & minMove for lightweight-charts series so
 * the vertical price scale and price lines never display 0.00 for micro-assets.
 */
export function getChartPriceFormat(samplePrice: number) {
  const abs = Math.abs(samplePrice || 1);
  let minMove = 0.01;
  let precision = 2;

  if (abs >= 1000) {
    minMove = 0.01;
    precision = 2;
  } else if (abs >= 10) {
    minMove = 0.01;
    precision = 2;
  } else if (abs >= 1) {
    minMove = 0.0001;
    precision = 4;
  } else if (abs >= 0.1) {
    minMove = 0.0001;
    precision = 4;
  } else if (abs >= 0.01) {
    minMove = 0.00001;
    precision = 5;
  } else if (abs >= 0.001) {
    minMove = 0.000001;
    precision = 6;
  } else if (abs >= 0.0001) {
    minMove = 0.0000001;
    precision = 7;
  } else if (abs >= 0.00001) {
    minMove = 0.00000001;
    precision = 8;
  } else if (abs >= 0.000001) {
    minMove = 0.000000001;
    precision = 8;
  } else {
    minMove = 0.0000000001;
    precision = 10;
  }

  return {
    type: 'custom' as const,
    minMove,
    precision,
    formatter: (price: number) => {
      if (price >= 1000) {
        return price.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
      }
      return price.toFixed(precision);
    },
  };
}

/**
 * Format USD volumes (e.g. $14.2B, $45.1M, $520.4K)
 */
export function formatVolume(vol: number | undefined | null): string {
  if (!vol || vol <= 0 || isNaN(vol)) return '$0';
  if (vol >= 1_000_000_000) return `$${(vol / 1_000_000_000).toFixed(2)}B`;
  if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(1)}M`;
  if (vol >= 1_000) return `$${(vol / 1_000).toFixed(1)}K`;
  return `$${vol.toFixed(0)}`;
}

/**
 * Format percentage changes with optional sign
 */
export function formatPercent(pct: number | undefined | null, includeSign: boolean = true): string {
  if (pct === undefined || pct === null || isNaN(pct)) return '0.00%';
  const sign = includeSign && pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}
