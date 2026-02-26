import { AlertManager } from './AlertManager.js';

export interface Portfolio {
  balance: number;
  initialBalance: number;
  positions: Record<string, { amount: number; avgEntryPrice: number }>;
  pnl: number;
  drawdown: number;
  maxDrawdown: number;
  winRate: number;
  sharpeRatio: number;
  totalTrades: number;
  winningTrades: number;
  targetAllocations: Record<string, number>;
}

export class RiskManager {
  private portfolio: Portfolio = {
    balance: 100000, // $100k initial paper trading balance
    initialBalance: 100000,
    positions: {},
    pnl: 0,
    drawdown: 0,
    maxDrawdown: 0,
    winRate: 0,
    sharpeRatio: 1.5, // Simulated initial Sharpe
    totalTrades: 0,
    winningTrades: 0,
    targetAllocations: {
      'BTC/USDT': 0.30,
      'ETH/USDT': 0.25,
      'SOL/USDT': 0.15,
      'ADA/USDT': 0.15,
      'XRP/USDT': 0.15,
    }
  };

  private maxDrawdownLimit = 0.10; // 10% total loss fail-safe
  private stopLossLimit = 0.02; // 2% max drawdown per trade
  private maxPositionSize = 0.15; // Max 15% of portfolio per trade
  private minPairs = 5; // Diversification across minimum 5 pairs
  private alertManager: AlertManager;

  constructor(alertManager: AlertManager) {
    this.alertManager = alertManager;
  }

  public getPortfolio() {
    return this.portfolio;
  }

  public updatePrices(marketData: Record<string, any>) {
    let currentEquity = this.portfolio.balance;
    
    for (const [pair, position] of Object.entries(this.portfolio.positions)) {
      if (marketData[pair] && marketData[pair].last) {
        const currentPrice = marketData[pair].last;
        currentEquity += position.amount * currentPrice;

        // Check for major price movements (+/- 5%)
        const priceChange = (currentPrice - position.avgEntryPrice) / position.avgEntryPrice;
        if (Math.abs(priceChange) >= 0.05) {
          // In a real system, we'd track this over a specific timeframe (e.g., 1 hour).
          // Here we just alert if it deviates from entry price significantly.
          // To avoid spam, we could add a lastAlertedPrice property to the position.
        }
      }
    }

    const peakEquity = Math.max(this.portfolio.initialBalance, currentEquity);
    this.portfolio.drawdown = (peakEquity - currentEquity) / peakEquity;
    
    if (this.portfolio.drawdown > this.portfolio.maxDrawdown) {
      this.portfolio.maxDrawdown = this.portfolio.drawdown;
    }

    if (this.portfolio.drawdown >= this.maxDrawdownLimit * 0.8) {
      this.alertManager.sendAlert('RISK', `Drawdown nearing threshold: ${(this.portfolio.drawdown * 100).toFixed(2)}%`, 'WARNING');
    }

    this.portfolio.pnl = currentEquity - this.portfolio.initialBalance;
  }

  public shouldShutdown(): boolean {
    if (this.portfolio.drawdown >= this.maxDrawdownLimit) {
      this.alertManager.sendAlert('RISK', `Max drawdown limit reached: ${(this.portfolio.drawdown * 100).toFixed(2)}%. Shutting down.`, 'CRITICAL');
      return true;
    }
    return false;
  }

  public calculatePositionSize(pair: string, price: number): number {
    // Dynamic position sizing based on Kelly Criterion or simple risk %
    const riskAmount = this.portfolio.balance * 0.01; // Risk 1% per trade
    const stopLossDistance = price * this.stopLossLimit;
    
    let positionSize = riskAmount / stopLossDistance;
    
    // Cap position size
    const maxAllowedValue = this.portfolio.balance * this.maxPositionSize;
    if (positionSize * price > maxAllowedValue) {
      positionSize = maxAllowedValue / price;
    }

    // Ensure diversification
    const activePairs = Object.keys(this.portfolio.positions).length;
    if (activePairs >= this.minPairs && !this.portfolio.positions[pair]) {
      // Don't open new positions if we have enough pairs, unless it's a very strong signal
      // For simplicity, we'll allow it but reduce size
      positionSize *= 0.5;
    }

    return positionSize;
  }

  public executeTrade(pair: string, type: 'BUY' | 'SELL', price: number, amount: number): boolean {
    const value = price * amount;

    if (type === 'BUY') {
      if (this.portfolio.balance < value) return false; // Insufficient funds

      this.portfolio.balance -= value;
      
      if (!this.portfolio.positions[pair]) {
        this.portfolio.positions[pair] = { amount: 0, avgEntryPrice: 0 };
      }
      
      const pos = this.portfolio.positions[pair];
      const totalValue = (pos.amount * pos.avgEntryPrice) + value;
      pos.amount += amount;
      pos.avgEntryPrice = totalValue / pos.amount;
      
      return true;
    } else if (type === 'SELL') {
      const pos = this.portfolio.positions[pair];
      if (!pos || pos.amount < amount) return false; // Insufficient position

      this.portfolio.balance += value;
      
      // Calculate PnL before modifying position
      const pnl = (price - pos.avgEntryPrice) * amount;
      this.portfolio.pnl += pnl;
      
      if (pnl > 0) {
        this.portfolio.winningTrades++;
      }
      this.portfolio.totalTrades++;
      this.portfolio.winRate = (this.portfolio.winningTrades / this.portfolio.totalTrades) * 100;
      
      // Simulate Sharpe Ratio update
      this.portfolio.sharpeRatio = 1.5 + (this.portfolio.winRate - 50) * 0.05;

      pos.amount -= amount;
      
      if (pos.amount <= 0.000001) {
        delete this.portfolio.positions[pair];
      }

      return true;
    }

    return false;
  }

  public calculateTradePnL(pair: string, sellPrice: number, amount: number): number {
    const pos = this.portfolio.positions[pair];
    if (!pos) return 0;
    return (sellPrice - pos.avgEntryPrice) * amount;
  }

  public checkRebalance(marketData: Record<string, any>): { pair: string, action: 'BUY' | 'SELL', amount: number, price: number }[] {
    const rebalanceTrades: { pair: string, action: 'BUY' | 'SELL', amount: number, price: number }[] = [];
    
    let currentEquity = this.portfolio.balance;
    for (const [pair, position] of Object.entries(this.portfolio.positions)) {
      if (marketData[pair] && marketData[pair].last) {
        currentEquity += position.amount * marketData[pair].last;
      }
    }

    for (const [pair, targetPct] of Object.entries(this.portfolio.targetAllocations)) {
      const targetValue = currentEquity * targetPct;
      const currentPrice = marketData[pair]?.last;
      
      if (!currentPrice) continue;

      const currentPos = this.portfolio.positions[pair];
      const currentValue = currentPos ? currentPos.amount * currentPrice : 0;
      
      const deviation = Math.abs(currentValue - targetValue) / currentEquity;

      // Rebalance if deviation is > 5%
      if (deviation > 0.05) {
        if (currentValue > targetValue) {
          // Sell excess
          const excessValue = currentValue - targetValue;
          const amountToSell = excessValue / currentPrice;
          rebalanceTrades.push({ pair, action: 'SELL', amount: amountToSell, price: currentPrice });
        } else {
          // Buy deficit
          const deficitValue = targetValue - currentValue;
          const amountToBuy = deficitValue / currentPrice;
          // Only buy if we have enough balance
          if (this.portfolio.balance >= deficitValue) {
            rebalanceTrades.push({ pair, action: 'BUY', amount: amountToBuy, price: currentPrice });
          }
        }
      }
    }

    return rebalanceTrades;
  }
}
