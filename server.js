require('dotenv').config();
const app = require('./app');
const logger = require('./src/utils/logger');

const PORT = process.env.PORT || 4002;
const server = app.listen(PORT, () => {
  logger.info(`goWILD User API server listening on port ${PORT}`);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Promise Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received: closing User API HTTP server gracefully');
  server.close(() => {
    logger.info('User API server closed');
    process.exit(0);
  });
});

