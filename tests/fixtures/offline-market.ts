// Integration tests exercise HTTP/persistence without reaching exchanges or Telegram.
import { ExchangeStreamClient } from '../../server/surveillance/exchangeStream';
globalThis.fetch = async () => new Response('{}', { status: 503 });
(ExchangeStreamClient.prototype as any).connect = function() { this.status = 'SYNCING'; };
(ExchangeStreamClient.prototype as any).startWatchdog = function() {};
