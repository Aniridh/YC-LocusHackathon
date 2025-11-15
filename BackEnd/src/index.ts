import express from 'express';
import cors from 'cors';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { startWorker } from './services/worker';
import questRoutes from './routes/quests';
import submissionRoutes from './routes/submissions';
import payoutRoutes from './routes/payouts';
import adminRoutes from './routes/admin';
import queueRoutes from './routes/queue';
import healthzRoutes from './routes/healthz';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(pinoHttp({ logger }));

// Routes
app.use('/api/quests', questRoutes);
app.use('/api/submissions', submissionRoutes);
app.use('/api/payouts', payoutRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/queue', queueRoutes);
app.use('/healthz', healthzRoutes);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error({ err, req: { id: req.id } }, 'Request error');
  
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    requestId: req.id,
  });
});

// Start server
app.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`);
  
  // Start worker
  startWorker();
  logger.info('🚀 Job worker started');
});

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('🛑 Shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('🛑 Shutting down...');
  process.exit(0);
});

