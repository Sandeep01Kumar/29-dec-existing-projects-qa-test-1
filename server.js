/**
 * @file Express.js Hello World Server
 * @module hello_world
 * @description Express.js Hello World server with graceful shutdown, error handling,
 * and process lifecycle management. Provides:
 * - Two HTTP endpoints (GET / and GET /evening) returning plain-text greetings
 * - Catch-all 404 handler for unmatched routes
 * - Environment-aware error handling middleware
 * - Graceful shutdown with timeout protection
 * - Process signal and exception handlers
 * @requires express
 * @author hxu
 * @license MIT
 * @version 1.0.0
 * @exports {Object} module.exports - Contains {express.Application} app and {http.Server} server
 */

const express = require('express');

/** @const {string} hostname - Server bind address. Restricted to localhost (127.0.0.1) for local development. */
const hostname = '127.0.0.1';
/** @const {number} port - Server listen port. Default 3000 for local development. */
const port = 3000;

/** @const {express.Application} app - Express application instance configured with routes, 404 handler, and error middleware. */
const app = express();

/**
 * @type {boolean}
 * @description Mutex flag preventing concurrent shutdown attempts. Set to true on first
 * shutdown signal to ensure gracefulShutdown executes only once even if multiple signals arrive.
 */
// WHY this flag exists: Multiple SIGTERM/SIGINT signals can arrive in rapid succession
// (e.g., a process manager sending SIGTERM followed by the user pressing Ctrl+C). Without
// this guard, server.close() could be called multiple times causing unpredictable behavior
// such as multiple process.exit() calls or error callbacks firing on an already-closed server.
let isShuttingDown = false;

// =============================================================================
// Routes
// =============================================================================

/**
 * @description Root endpoint handler. Returns a plain-text "Hello, World!" greeting.
 * @param {express.Request} req - Express request object
 * @param {express.Response} res - Express response object
 * @returns {void} Sends 200 response with Content-Type text/plain and body "Hello, World!\n"
 * @example
 * // curl http://127.0.0.1:3000/
 */
app.get('/', (req, res) => {
  res.type('text/plain').send('Hello, World!\n');
});

/**
 * @description Evening endpoint handler. Returns a plain-text evening greeting.
 * @param {express.Request} req - Express request object
 * @param {express.Response} res - Express response object
 * @returns {void} Sends 200 response with Content-Type text/plain and body "Good evening\n"
 * @example
 * // curl http://127.0.0.1:3000/evening
 */
app.get('/evening', (req, res) => {
  res.type('text/plain').send('Good evening\n');
});

// =============================================================================
// 404 Handler - Catches all unmatched routes
// =============================================================================

/**
 * @description Catch-all 404 middleware. Placed after all route definitions to handle any
 * request that didn't match a defined route. Returns plain-text "Not Found" instead of
 * Express's default HTML 404.
 * @param {express.Request} req - Express request object
 * @param {express.Response} res - Express response object
 * @returns {void} Sends 404 response with Content-Type text/plain
 */
app.use((req, res) => {
  res.status(404).type('text/plain').send('Not Found\n');
});

// =============================================================================
// Error Handling Middleware - Catches all errors from route handlers
// WHY exactly 4 parameters are required: Express uses function.length (arity) to
// distinguish error-handling middleware from regular middleware. If this function had
// fewer than 4 parameters, Express would treat it as a regular middleware and would
// never route errors to it. The `next` parameter must be declared even if unused.
// WHY Express 5 handles async errors automatically: Unlike Express 4, Express 5
// natively catches rejected promises from async route handlers and forwards them to
// error middleware without requiring the express-async-errors package or manual
// try-catch wrappers in every route handler.
// =============================================================================

/**
 * @description Centralized error-handling middleware. Catches all errors thrown or passed
 * via next(err) from route handlers. Returns environment-aware error messages — in
 * production, internal details are hidden to prevent information leakage. Must have
 * exactly 4 parameters to be recognized by Express as an error handler.
 * @param {Error} err - The error object thrown or passed to next()
 * @param {express.Request} req - Express request object
 * @param {express.Response} res - Express response object
 * @param {express.NextFunction} next - Express next function (required for Express error middleware signature)
 * @returns {void} Sends error response with appropriate status code and message
 */
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

/** @const {http.Server} server - HTTP server instance returned by app.listen(). Captured as a reference to enable graceful shutdown via server.close(). Exported for use in testing (Supertest). */
const server = app.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});

// =============================================================================
// Graceful Shutdown Function
// Handles clean server termination with timeout protection
// =============================================================================

/**
 * @function gracefulShutdown
 * @description Performs clean server termination. Stops accepting new connections, waits
 * for in-flight requests to complete, then exits the process. Includes a timeout safety
 * net to prevent the process from hanging indefinitely if connections don't close.
 * @param {string} signal - The signal or event name that triggered shutdown (e.g., 'SIGTERM', 'SIGINT', 'uncaughtException')
 * @returns {void} Initiates shutdown sequence; process exits via process.exit()
 */
function gracefulShutdown(signal) {
  // WHY this guard prevents race conditions: Multiple signals can arrive in quick
  // succession (e.g., SIGTERM from a process manager immediately followed by SIGINT
  // from Ctrl+C). Without this check, server.close() would be called multiple times,
  // potentially triggering multiple exit callbacks and unpredictable shutdown behavior.
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

  // WHY setTimeout is used as a safety net: server.close() only resolves its callback
  // when all keep-alive connections are terminated. If a client holds a connection open
  // indefinitely (e.g., a long-lived WebSocket or a slow client), the server would never
  // exit without this forced timeout. The timeout ensures the process always terminates
  // within a bounded time, which is critical for container orchestrators like Kubernetes
  // that enforce their own termination grace periods.
  /** @const {number} SHUTDOWN_TIMEOUT - Maximum time in milliseconds (10000 = 10 seconds) to wait for graceful shutdown before forcing process exit. Acts as a safety net against hanging connections. */
  const SHUTDOWN_TIMEOUT = 10000; // 10 seconds
  setTimeout(() => {
    console.error(`Forced shutdown after ${SHUTDOWN_TIMEOUT}ms timeout`);
    process.exit(1);
  }, SHUTDOWN_TIMEOUT);
}

// =============================================================================
// Signal Handlers - Handle process termination signals
// =============================================================================

/** @listens process:SIGTERM - Handles SIGTERM signal sent by process managers (Docker, Kubernetes, pm2) for controlled container/process shutdown. */
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

/** @listens process:SIGINT - Handles SIGINT signal sent when user presses Ctrl+C in the terminal for local development shutdown. */
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// =============================================================================
// Exception Handlers - Last resort error handling for unexpected failures
// =============================================================================

/**
 * @listens process:uncaughtException
 * @description Last-resort handler for uncaught synchronous exceptions. Logs the error
 * and triggers graceful shutdown since the application state may be corrupted.
 * @param {Error} err - The uncaught error
 * @param {string} origin - Origin of the exception ('uncaughtException' or 'unhandledRejection')
 */
process.on('uncaughtException', (err, origin) => {
  console.error('Uncaught Exception:', err);
  console.error('Exception origin:', origin);
  gracefulShutdown('uncaughtException');
});

/**
 * @listens process:unhandledRejection
 * @description Handler for unhandled promise rejections. Logs the rejection but does NOT
 * trigger shutdown.
 * @param {*} reason - The rejection reason/value
 * @param {Promise} promise - The promise that was rejected
 */
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise);
  console.error('Reason:', reason);
  // WHY unhandledRejection does not trigger shutdown in Express 5: Express 5 automatically
  // catches Promise rejections in route handlers and forwards them to the error middleware,
  // so unhandled rejections from routes are already handled gracefully. This listener only
  // catches rejections from non-route code (e.g., background tasks, event handlers), which
  // may not warrant a full shutdown. Logging without shutting down allows the server to
  // continue serving requests while the development team investigates the root cause.
});

// =============================================================================
// Module Exports - Enable unit testing
// =============================================================================

/**
 * @exports hello_world
 * @description Exports the Express app instance and HTTP server for external use
 * (primarily testing with Supertest).
 * @type {{app: express.Application, server: http.Server}}
 */
module.exports = { app, server };
