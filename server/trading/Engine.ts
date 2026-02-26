import { WebSocketServer, WebSocket } from 'ws';
import { MLPredictor } from './MLPredictor.js';
import { RiskManager } from './RiskManager.js';
import { ExchangeConnector } from './ExchangeConnector.js';
import { AlertManager } from './AlertManager.js';

export interface TradeLog {
  id: string;
  timestamp: number;
  pair: string;
  type: 'BUY' | 'SELL';
  price: number;
  amount: number;
  status: 'EXECUTED' | 'FAILED' | 'PENDING';
  pnl?: number;
}

export class TradingEngine {
  private wss: WebSocketServer;
  private predictor: MLPredictor;
  private riskManager: RiskManager;
  private exchange: ExchangeConnector;
  private alertManager: AlertManager;
  
  private isRunning: boolean = false;
  private logs: TradeLog[] = [];
  private clients: Set<WebSocket> = new Set();
  private updateInterval: NodeJS.Timeout | null = null;

  constructor(wss: WebSocketServer) {
    this.wss = wss;
    this.alertManager = new AlertManager();
    this.predictor = new MLPredictor();
    this.riskManager = new RiskManager(this.alertManager);
    this.exchange = new ExchangeConnector(this.alertManager);

    this.wss.on('connection', (ws) => {
      this.clients.add(ws);
      ws.on('close', () => this.clients.delete(ws));
      this.sendInitialState(ws);
    });
  }

  public start() {
    console.log('Starting Trading Engine...');
    this.isRunning = true;
    this.exchange.connect();
    
    // Simulate real-time trading loop
    this.updateInterval = setInterval(() => {
      this.tick();
    }, 1000); // 1-second ticks
  }

  public stop() {
    console.log('Stopping Trading Engine...');
    this.isRunning = false;
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    this.exchange.disconnect();
  }

  public toggleStatus() {
    if (this.isRunning) {
      this.stop();
    } else {
      this.start();
    }
    return this.isRunning;
  }

  public getStatus() {
    return this.isRunning;
  }

  public getPortfolio() {
    return this.riskManager.getPortfolio();
  }

  public getLogs() {
    return this.logs.slice(-100); // Return last 100 logs
  }

  private async tick() {
    if (!this.isRunning) return;

    try {
      const marketData = await this.exchange.fetchMarketData();
      
      // Update sentiment periodically (e.g., every 10 ticks)
      if (Math.random() < 0.1) {
        await this.predictor.updateSentiment();
      }

      // Update risk manager with current prices
      this.riskManager.updatePrices(marketData);

      // Check fail-safes
      if (this.riskManager.shouldShutdown()) {
        this.logSystemEvent('CRITICAL', 'Max drawdown reached. Shutting down engine.');
        this.stop();
        this.broadcastState();
        return;
      }

      // Check for rebalancing
      const rebalanceTrades = this.riskManager.checkRebalance(marketData);
      if (rebalanceTrades.length > 0) {
        this.alertManager.sendAlert('SYSTEM', `Initiating portfolio rebalance for ${rebalanceTrades.length} pairs`, 'INFO');
        for (const trade of rebalanceTrades) {
          this.executeTrade(trade.pair, trade.action, trade.price, trade.amount, true);
        }
      }

      // Generate signals
      const signals = this.predictor.generateSignals(marketData);

      // Execute trades based on signals and risk
      for (const signal of signals) {
        if (signal.action !== 'HOLD' && signal.confidence > 0.85) {
          const tradeAmount = this.riskManager.calculatePositionSize(signal.pair, signal.price);
          if (tradeAmount > 0) {
            this.executeTrade(signal.pair, signal.action, signal.price, tradeAmount);
          }
        }
      }

      this.broadcastState();
    } catch (error) {
      console.error('Error in trading tick:', error);
      this.logSystemEvent('ERROR', `Tick error: ${error instanceof Error ? error.message : 'Unknown'}`);
      this.alertManager.sendAlert('SYSTEM', `Tick error: ${error instanceof Error ? error.message : 'Unknown'}`, 'WARNING');
    }
  }

  private executeTrade(pair: string, type: 'BUY' | 'SELL', price: number, amount: number, isRebalance: boolean = false) {
    // Simulate slippage
    const slippage = price * (Math.random() * 0.001); // Max 0.1% slippage
    const executedPrice = type === 'BUY' ? price + slippage : price - slippage;

    const success = this.riskManager.executeTrade(pair, type, executedPrice, amount);
    
    const log: TradeLog = {
      id: Math.random().toString(36).substring(7),
      timestamp: Date.now(),
      pair,
      type,
      price: executedPrice,
      amount,
      status: success ? 'EXECUTED' : 'FAILED',
    };

    if (success) {
      let pnlMsg = '';
      if (type === 'SELL') {
        log.pnl = this.riskManager.calculateTradePnL(pair, executedPrice, amount);
        pnlMsg = ` (PnL: $${log.pnl.toFixed(2)})`;
      }
      this.alertManager.sendAlert('TRADE', `${isRebalance ? '[REBALANCE] ' : ''}Executed ${type} ${amount.toFixed(4)} ${pair} @ $${executedPrice.toFixed(2)}${pnlMsg}`, 'INFO');
    }

    this.logs.push(log);
    if (this.logs.length > 1000) this.logs.shift(); // Keep last 1000 logs
  }

  private logSystemEvent(level: string, message: string) {
    console.log(`[${level}] ${message}`);
  }

  private broadcastState() {
    const state = {
      type: 'STATE_UPDATE',
      data: {
        isRunning: this.isRunning,
        portfolio: this.riskManager.getPortfolio(),
        marketData: this.exchange.getLatestData(),
        recentLogs: this.getLogs().slice(-10),
        alerts: this.alertManager.getRecentAlerts().slice(-5),
      }
    };
    
    const message = JSON.stringify(state);
    for (const client of this.clients) {
      if (client.readyState === 1) { // OPEN
        client.send(message);
      }
    }
  }

  private sendInitialState(ws: WebSocket) {
    ws.send(JSON.stringify({
      type: 'STATE_UPDATE',
      data: {
        isRunning: this.isRunning,
        portfolio: this.riskManager.getPortfolio(),
        marketData: this.exchange.getLatestData(),
        recentLogs: this.getLogs().slice(-50),
        alerts: this.alertManager.getRecentAlerts().slice(-20),
      }
    }));
  }
}
