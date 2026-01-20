const express = require('express');

const hostname = '127.0.0.1';
const port = 3000;

const app = express();

// Shutdown tracking flag to prevent multiple simultaneous shutdown attempts
let isShuttingDown = false;

// =============================================================================
// Routes
// =============================================================================

app.get('/', (req, res) => {
  res.type('text/plain').send('Hello, World!\n');
});

app.get('/evening', (req, res) => {
  res.type('text/plain').send('Good evening\n');
});

// =============================================================================
// 404 Handler - Catches all unmatched routes
// =============================================================================

app.use((req, res) => {
  res.status(404).type('text/plain').send('Not Found\n');
});

// =============================================================================
// Error Handling Middleware - Catches all errors from route handlers
// Must have exactly 4 parameters (err, req, res, next) to be recognized as error handler
// =============================================================================

app.use((err, req, res, next) => {
  // Log the error for debugging purposes
  console.error('Error occurred:', err.stack || err.message || err);

  // Determine the appropriate status code
  const statusCode = err.status || err.statusCode || 500;

  // In production, hide internal error details
  const message = process.env.NODE_ENV === 'production'
    ? 'Internal Server Error'
    : err.message || 'Internal Server Error';

  res.status(statusCode).type('text/plain').send(`${message}\n`);
});

// =============================================================================
// Server Initialization - Capture server reference for graceful shutdown
// =============================================================================

const server = app.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});

// =============================================================================
// Graceful Shutdown Function
// Handles clean server termination with timeout protection
// =============================================================================

function gracefulShutdown(signal) {
  // Prevent multiple simultaneous shutdown attempts
  if (isShuttingDown) {
    console.log('Shutdown already in progress...');
    return;
  }

  isShuttingDown = true;
  console.log(`\n${signal} signal received: starting graceful shutdown`);

  // Stop accepting new connections and wait for existing ones to complete
  server.close((err) => {
    if (err) {
      console.error('Error during server close:', err);
      process.exit(1);
    }
    console.log('HTTP server closed');
    console.log('Cleanup complete, exiting process');
    process.exit(0);
  });

  // Force shutdown after timeout to prevent hanging
  const SHUTDOWN_TIMEOUT = 10000; // 10 seconds
  setTimeout(() => {
    console.error(`Forced shutdown after ${SHUTDOWN_TIMEOUT}ms timeout`);
    process.exit(1);
  }, SHUTDOWN_TIMEOUT);
}

// =============================================================================
// Signal Handlers - Handle process termination signals
// =============================================================================

// Handle SIGTERM (sent by process managers like Docker, Kubernetes, pm2)
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle SIGINT (sent when user presses Ctrl+C)
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// =============================================================================
// Exception Handlers - Last resort error handling for unexpected failures
// =============================================================================

// Handle uncaught synchronous exceptions
process.on('uncaughtException', (err, origin) => {
  console.error('Uncaught Exception:', err);
  console.error('Exception origin:', origin);
  gracefulShutdown('uncaughtException');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise);
  console.error('Reason:', reason);
  // Note: We log but don't shutdown for unhandled rejections
  // Express 5 automatically catches Promise rejections in route handlers
});

// =============================================================================
// Module Exports - Enable unit testing
// =============================================================================

module.exports = { app, server };
