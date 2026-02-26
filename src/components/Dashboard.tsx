import React, { useEffect, useState } from 'react';
import { Activity, TrendingUp, TrendingDown, DollarSign, Percent, ShieldAlert, Play, Square, Bell, MessageSquare } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Portfolio {
  balance: number;
  initialBalance: number;
  positions: Record<string, { amount: number; avgEntryPrice: number }>;
  pnl: number;
  drawdown: number;
  maxDrawdown: number;
  winRate: number;
  sharpeRatio: number;
  totalTrades: number;
  targetAllocations: Record<string, number>;
}

interface TradeLog {
  id: string;
  timestamp: number;
  pair: string;
  type: 'BUY' | 'SELL';
  price: number;
  amount: number;
  status: string;
  pnl?: number;
}

interface Alert {
  id: string;
  timestamp: number;
  type: string;
  message: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
}

export default function Dashboard() {
  const [isRunning, setIsRunning] = useState(false);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [marketData, setMarketData] = useState<Record<string, any>>({});
  const [logs, setLogs] = useState<TradeLog[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [chartData, setChartData] = useState<{ time: string; equity: number }[]>([]);

  useEffect(() => {
    // Determine WebSocket URL based on current origin
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'STATE_UPDATE') {
        const { isRunning, portfolio, marketData, recentLogs, alerts } = message.data;
        setIsRunning(isRunning);
        setPortfolio(portfolio);
        setMarketData(marketData);
        if (alerts) {
          setAlerts(prev => {
            const newAlerts = [...alerts, ...prev];
            const unique = Array.from(new Map(newAlerts.map(item => [item.id, item])).values());
            return unique.sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);
          });
        }
        setLogs(prev => {
          const newLogs = [...recentLogs, ...prev];
          // Deduplicate by ID and keep last 50
          const unique = Array.from(new Map(newLogs.map(item => [item.id, item])).values());
          return unique.sort((a, b) => b.timestamp - a.timestamp).slice(0, 50);
        });

        // Update chart data
        setChartData(prev => {
          const currentEquity = portfolio.balance + Object.entries(portfolio.positions).reduce((acc, [pair, pos]: [string, any]) => {
            const currentPrice = marketData[pair]?.last || pos.avgEntryPrice;
            return acc + (pos.amount * currentPrice);
          }, 0);

          const newData = [...prev, { time: format(new Date(), 'HH:mm:ss'), equity: currentEquity }];
          return newData.slice(-60); // Keep last 60 points
        });
      }
    };

    return () => ws.close();
  }, []);

  const toggleEngine = async () => {
    try {
      const res = await fetch('/api/engine/toggle', { method: 'POST' });
      const data = await res.json();
      setIsRunning(data.status);
    } catch (error) {
      console.error('Failed to toggle engine', error);
    }
  };

  if (!portfolio) return <div className="flex items-center justify-center h-screen bg-[#0a0a0a] text-white">Connecting to Trading Engine...</div>;

  const currentEquity = portfolio.balance + Object.entries(portfolio.positions).reduce((acc, [pair, pos]: [string, any]) => {
    const currentPrice = marketData[pair]?.last || pos.avgEntryPrice;
    return acc + (pos.amount * currentPrice);
  }, 0);

  const pnlPercent = ((currentEquity - portfolio.initialBalance) / portfolio.initialBalance) * 100;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-gray-100 p-4 md:p-6 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              <Activity className="w-6 h-6 text-emerald-500" />
              Quant AI Trading Engine
            </h1>
            <p className="text-sm text-gray-400">Live Paper Trading Mode • LSTM/GRU Predictor • NLP Sentiment</p>
          </div>
          
          <div className="flex items-center gap-4">
            <div className={cn(
              "px-3 py-1 rounded-full text-xs font-medium flex items-center gap-2 border",
              isRunning ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-red-500/10 text-red-500 border-red-500/20"
            )}>
              <div className={cn("w-2 h-2 rounded-full", isRunning ? "bg-emerald-500 animate-pulse" : "bg-red-500")} />
              {isRunning ? 'SYSTEM ACTIVE' : 'SYSTEM HALTED'}
            </div>
            
            <button
              onClick={toggleEngine}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors",
                isRunning 
                  ? "bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20" 
                  : "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border border-emerald-500/20"
              )}
            >
              {isRunning ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {isRunning ? 'Stop Engine' : 'Start Engine'}
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard 
            title="Total Equity" 
            value={`$${currentEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            icon={<DollarSign className="w-5 h-5 text-blue-500" />}
            trend={pnlPercent}
          />
          <StatCard 
            title="Win Rate" 
            value={`${portfolio.winRate.toFixed(1)}%`}
            icon={<Percent className="w-5 h-5 text-purple-500" />}
            subtitle={`${portfolio.totalTrades} Total Trades`}
          />
          <StatCard 
            title="Sharpe Ratio" 
            value={portfolio.sharpeRatio.toFixed(2)}
            icon={<Activity className="w-5 h-5 text-emerald-500" />}
            subtitle="Risk-Adjusted Return"
          />
          <StatCard 
            title="Max Drawdown" 
            value={`${(portfolio.maxDrawdown * 100).toFixed(2)}%`}
            icon={<ShieldAlert className="w-5 h-5 text-orange-500" />}
            subtitle="Fail-safe limit: 10%"
            alert={portfolio.maxDrawdown > 0.08}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Chart */}
          <div className="lg:col-span-2 bg-[#141414] border border-white/5 rounded-xl p-4">
            <h2 className="text-lg font-medium mb-4">Equity Curve</h2>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                  <XAxis 
                    dataKey="time" 
                    stroke="#666" 
                    tick={{ fill: '#666', fontSize: 12 }} 
                    tickMargin={10}
                  />
                  <YAxis 
                    domain={['auto', 'auto']} 
                    stroke="#666" 
                    tick={{ fill: '#666', fontSize: 12 }}
                    tickFormatter={(val) => `$${val.toLocaleString()}`}
                    width={80}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: '8px' }}
                    itemStyle={{ color: '#fff' }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="equity" 
                    stroke="#10b981" 
                    strokeWidth={2} 
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Active Positions & Allocations */}
          <div className="bg-[#141414] border border-white/5 rounded-xl p-4 flex flex-col">
            <h2 className="text-lg font-medium mb-4 flex justify-between items-center">
              <span>Portfolio Allocation</span>
              <span className="text-xs text-gray-500 bg-white/5 px-2 py-1 rounded-md">
                {Object.keys(portfolio.positions).length} / 5 Pairs
              </span>
            </h2>
            <div className="flex-1 overflow-y-auto space-y-3">
              {Object.keys(portfolio.targetAllocations).map((pair) => {
                const targetPct = portfolio.targetAllocations[pair];
                const pos = portfolio.positions[pair];
                const currentPrice = marketData[pair]?.last || (pos ? pos.avgEntryPrice : 0);
                const currentValue = pos ? pos.amount * currentPrice : 0;
                const currentPct = currentEquity > 0 ? currentValue / currentEquity : 0;
                const pnl = pos ? (currentPrice - pos.avgEntryPrice) * pos.amount : 0;
                const pnlPct = pos ? ((currentPrice - pos.avgEntryPrice) / pos.avgEntryPrice) * 100 : 0;
                
                return (
                  <div key={pair} className="flex flex-col p-3 bg-white/5 rounded-lg border border-white/5">
                    <div className="flex justify-between items-center mb-2">
                      <div>
                        <div className="font-medium text-sm">{pair}</div>
                        <div className="text-xs text-gray-400">
                          Target: {(targetPct * 100).toFixed(0)}% | Actual: {(currentPct * 100).toFixed(1)}%
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium text-sm">${currentValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                        {pos && (
                          <div className={cn("text-xs flex items-center justify-end gap-1", pnl >= 0 ? "text-emerald-500" : "text-red-500")}>
                            {pnl >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {pnlPct.toFixed(2)}%
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Progress bar for allocation */}
                    <div className="w-full bg-gray-800 rounded-full h-1.5 mt-1 relative">
                      <div 
                        className="bg-gray-600 h-1.5 rounded-full absolute top-0 left-0" 
                        style={{ width: `${targetPct * 100}%` }} 
                      />
                      <div 
                        className={cn("h-1.5 rounded-full absolute top-0 left-0 opacity-80", 
                          Math.abs(currentPct - targetPct) > 0.05 ? "bg-orange-500" : "bg-emerald-500"
                        )} 
                        style={{ width: `${currentPct * 100}%` }} 
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Trade Logs */}
          <div className="bg-[#141414] border border-white/5 rounded-xl p-4">
            <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Live Execution Logs
            </h2>
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-500 uppercase bg-white/5 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 rounded-tl-lg">Time</th>
                    <th className="px-4 py-3">Pair</th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Price</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3 rounded-tr-lg">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-500">Waiting for signals...</td>
                    </tr>
                  ) : (
                    logs.map((log) => (
                      <tr key={log.id} className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3 text-gray-400 font-mono text-xs">{format(log.timestamp, 'HH:mm:ss')}</td>
                        <td className="px-4 py-3 font-medium">{log.pair}</td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            "px-2 py-1 rounded text-xs font-bold",
                            log.type === 'BUY' ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
                          )}>
                            {log.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">${log.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="px-4 py-3 font-mono text-xs">{log.amount.toFixed(4)}</td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            "px-2 py-1 rounded text-xs",
                            log.status === 'EXECUTED' ? "bg-blue-500/10 text-blue-500" : "bg-gray-500/10 text-gray-500"
                          )}>
                            {log.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* System Alerts */}
          <div className="bg-[#141414] border border-white/5 rounded-xl p-4">
            <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
              <Bell className="w-5 h-5" />
              System Alerts
            </h2>
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
              {alerts.length === 0 ? (
                <div className="text-center text-gray-500 py-8">No recent alerts</div>
              ) : (
                alerts.map((alert) => (
                  <div 
                    key={alert.id} 
                    className={cn(
                      "p-3 rounded-lg border text-sm flex gap-3",
                      alert.severity === 'CRITICAL' ? "bg-red-500/10 border-red-500/20 text-red-200" :
                      alert.severity === 'WARNING' ? "bg-orange-500/10 border-orange-500/20 text-orange-200" :
                      "bg-blue-500/10 border-blue-500/20 text-blue-200"
                    )}
                  >
                    <div className="mt-0.5">
                      {alert.severity === 'CRITICAL' ? <ShieldAlert className="w-4 h-4 text-red-500" /> :
                       alert.severity === 'WARNING' ? <Activity className="w-4 h-4 text-orange-500" /> :
                       <MessageSquare className="w-4 h-4 text-blue-500" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={cn(
                          "text-xs font-bold px-1.5 py-0.5 rounded",
                          alert.severity === 'CRITICAL' ? "bg-red-500/20 text-red-400" :
                          alert.severity === 'WARNING' ? "bg-orange-500/20 text-orange-400" :
                          "bg-blue-500/20 text-blue-400"
                        )}>
                          {alert.type}
                        </span>
                        <span className="text-xs opacity-50">{format(alert.timestamp, 'HH:mm:ss')}</span>
                      </div>
                      <p>{alert.message}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

function StatCard({ title, value, icon, trend, subtitle, alert }: { title: string, value: string, icon: React.ReactNode, trend?: number, subtitle?: string, alert?: boolean }) {
  return (
    <div className={cn(
      "bg-[#141414] border rounded-xl p-4 flex flex-col justify-between",
      alert ? "border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.1)]" : "border-white/5"
    )}>
      <div className="flex justify-between items-start mb-2">
        <div className="text-gray-400 text-sm font-medium">{title}</div>
        <div className="p-2 bg-white/5 rounded-lg">{icon}</div>
      </div>
      <div>
        <div className="text-2xl font-bold text-white flex items-baseline gap-2">
          {value}
          {trend !== undefined && (
            <span className={cn("text-sm font-medium flex items-center", trend >= 0 ? "text-emerald-500" : "text-red-500")}>
              {trend >= 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
              {Math.abs(trend).toFixed(2)}%
            </span>
          )}
        </div>
        {subtitle && <div className="text-xs text-gray-500 mt-1">{subtitle}</div>}
      </div>
    </div>
  );
}
