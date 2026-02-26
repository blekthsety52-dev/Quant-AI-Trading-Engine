import ccxt from 'ccxt';
import { AlertManager } from './AlertManager.js';

export class ExchangeConnector {
  private binance: any;
  private coinbase: any;
  private kraken: any;
  
  private pairs = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'ADA/USDT', 'XRP/USDT'];
  private latestData: Record<string, any> = {};
  private isConnected: boolean = false;
  private alertManager: AlertManager;

  constructor(alertManager: AlertManager) {
    this.alertManager = alertManager;
    this.binance = new ccxt.binance({ enableRateLimit: true });
    this.coinbase = new ccxt.coinbase({ enableRateLimit: true });
    this.kraken = new ccxt.kraken({ enableRateLimit: true });
  }

  public async connect() {
    console.log('Connecting to exchanges...');
    this.isConnected = true;
    this.alertManager.sendAlert('SYSTEM', 'Connected to Exchange APIs', 'INFO');
    
    // Initial fetch
    await this.fetchMarketData();
  }

  public disconnect() {
    console.log('Disconnecting from exchanges...');
    this.isConnected = false;
    this.alertManager.sendAlert('SYSTEM', 'Disconnected from Exchange APIs', 'WARNING');
  }

  public async fetchMarketData(): Promise<Record<string, any>> {
    if (!this.isConnected) return this.latestData;

    try {
      // In a real high-frequency bot, we'd use WebSockets per exchange.
      // For this implementation, we simulate sub-second latency by polling or using cached data
      // and adding random noise to simulate tick data.
      
      // Fetch real data periodically
      if (Math.random() < 0.1) { // 10% chance to fetch real data to avoid rate limits
        const tickers = await this.binance.fetchTickers(this.pairs);
        for (const pair of this.pairs) {
          if (tickers[pair]) {
            this.latestData[pair] = {
              last: tickers[pair].last,
              bid: tickers[pair].bid,
              ask: tickers[pair].ask,
              volume: tickers[pair].baseVolume,
              timestamp: Date.now()
            };
          }
        }
      } else {
        // Simulate tick data based on last known prices
        for (const pair of this.pairs) {
          if (this.latestData[pair]) {
            const volatility = 0.001; // 0.1% volatility per tick
            const change = 1 + (Math.random() * volatility * 2 - volatility);
            this.latestData[pair].last *= change;
            this.latestData[pair].bid = this.latestData[pair].last * 0.9995;
            this.latestData[pair].ask = this.latestData[pair].last * 1.0005;
            this.latestData[pair].timestamp = Date.now();
          } else {
            // Fallback initial prices if real fetch hasn't happened yet
            this.latestData[pair] = {
              last: 50000, bid: 49950, ask: 50050, volume: 100, timestamp: Date.now()
            };
          }
        }
      }

      return this.latestData;
    } catch (error) {
      console.error('Error fetching market data:', error);
      return this.latestData;
    }
  }

  public getLatestData() {
    return this.latestData;
  }
}
