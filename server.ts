import express from 'express';
import { createServer as createViteServer } from 'vite';
import { WebSocketServer } from 'ws';
import http from 'http';
import { TradingEngine } from './server/trading/Engine.js';

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = 3000;

  // Setup WebSocket Server for real-time updates
  const wss = new WebSocketServer({ server });
  
  // Initialize Trading Engine
  const engine = new TradingEngine(wss);
  engine.start();

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', engineStatus: engine.getStatus() });
  });

  app.get('/api/portfolio', (req, res) => {
    res.json(engine.getPortfolio());
  });

  app.get('/api/logs', (req, res) => {
    res.json(engine.getLogs());
  });

  app.post('/api/engine/toggle', (req, res) => {
    const status = engine.toggleStatus();
    res.json({ status });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
