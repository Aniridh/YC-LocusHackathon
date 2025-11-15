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
app.use('/api/audits', payoutRoutes); // Also mount audits routes
app.use('/api/admin', adminRoutes);
app.use('/api/queue', queueRoutes);
app.use('/healthz', healthzRoutes);

// Error handling middleware - map errors to friendly messages
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  const requestId = req.id || Math.random().toString(36).substring(2, 15);
  
  logger.error({ err, req: { id: requestId } }, 'Request error');
  
  // Map known error types to friendly messages
  let statusCode = err.status || 500;
  let message = err.message || 'An internal error occurred. Please try again.';
  
  // Handle PolicyViolation
  if (err.name === 'PolicyViolation') {
    statusCode = 400;
    message = err.reason || message;
  }
  
  // Handle VerifierError
  if (err.name === 'VerifierError') {
    statusCode = 400;
    message = err.message;
  }
  
  // Handle validation errors
  if (err.name === 'ValidationError' || err.name === 'MulterError') {
    statusCode = 400;
    message = err.message || 'Invalid input provided.';
  }
  
  res.status(statusCode).json({
    error: message,
    requestId,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
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

