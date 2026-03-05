/**
 * @fileoverview Express.js HTTP/HTTPS server with security middleware pipeline.
 *
 * This module creates an Express 5 application that serves two greeting
 * endpoints (`GET /` and `GET /evening`) behind a layered security stack:
 *
 *   1. **Helmet** — sets 13 protective HTTP response headers (CSP, HSTS, etc.)
 *   2. **CORS** — enforces a restrictive cross-origin policy with an origin
 *      allowlist, limited HTTP methods, and controlled headers
 *   3. **Rate Limiter** — caps each client IP to 100 requests per 15-minute
 *      window and returns `429 Too Many Requests` when the limit is exceeded
 *   4. **Input Validator** — sanitises and validates query parameters, rejecting
 *      payloads that contain HTML/script tags (XSS prevention)
 *
 * The server binds to the loopback address (`127.0.0.1`) on port 3000 for
 * HTTP. When TLS certificate files are present in `./certs/`, an HTTPS
 * listener is started on port 3443 with the same Express application.
 *
 * Graceful shutdown is handled for `SIGTERM` and `SIGINT` signals with a
 * configurable timeout. Uncaught exceptions and unhandled promise rejections
 * are logged and, in the case of exceptions, trigger a controlled shutdown.
 *
 * @module server
 * @requires express
 * @requires helmet
 * @requires cors
 * @requires express-rate-limit
 * @requires express-validator
 * @requires https
 * @requires fs
 */

// ---------------------------------------------------------------------------
// External dependencies
// ---------------------------------------------------------------------------

/** @type {import('express')} */
const express = require('express');

/** @type {import('helmet')} */
const helmet = require('helmet');

/** @type {import('cors')} */
const cors = require('cors');

/** @type {{ rateLimit: import('express-rate-limit').rateLimit }} */
const { rateLimit } = require('express-rate-limit');

/** @type {{ query: import('express-validator').query, validationResult: import('express-validator').validationResult }} */
const { query, validationResult } = require('express-validator');

// Node.js built-in modules — used for conditional HTTPS support and
// filesystem access (certificate file detection).
const https = require('https');
const fs = require('fs');

// ---------------------------------------------------------------------------
// Server configuration constants
// ---------------------------------------------------------------------------

/**
 * Loopback hostname the server binds to.
 * Using `127.0.0.1` restricts access to the local machine only, which is a
 * security best practice for development servers that are not intended to be
 * exposed to external networks.
 *
 * @constant {string}
 */
const hostname = '127.0.0.1';

/**
 * TCP port for the HTTP listener.
 * @constant {number}
 */
const port = 3000;

/**
 * TCP port for the HTTPS listener (conditional — only used when TLS
 * certificates are available in `./certs/`).
 * @constant {number}
 */
const httpsPort = 3443;

// ---------------------------------------------------------------------------
// Express application instance
// ---------------------------------------------------------------------------

/**
 * The Express application instance.
 *
 * All middleware, routes, and error handlers are registered on this object.
 * It is also exported so that the test suite (`server.test.js`) can pass it
 * directly to Supertest without starting a live network server.
 *
 * @type {import('express').Express}
 */
const app = express();

/**
 * Flag that tracks whether a shutdown sequence is already in progress.
 * Prevents duplicate shutdown attempts when multiple termination signals
 * arrive in quick succession (e.g. `SIGTERM` followed by `SIGINT`).
 *
 * @type {boolean}
 */
let isShuttingDown = false;

// =============================================================================
// Security Configuration
// =============================================================================

/**
 * CORS (Cross-Origin Resource Sharing) configuration options.
 *
 * The policy uses a restrictive origin allowlist that defaults to the loopback
 * address.  Override the allowed origin at runtime via the `CORS_ORIGIN`
 * environment variable (e.g. `CORS_ORIGIN=https://example.com`).
 *
 * Only safe, read-only HTTP methods (`GET`, `HEAD`, `OPTIONS`) are permitted.
 * The `credentials` flag is disabled because this server does not use cookies
 * or HTTP authentication that would require credentialed cross-origin
 * requests.  Pre-flight `OPTIONS` requests receive a `204 No Content`
 * response as recommended by the CORS specification.
 *
 * @type {import('cors').CorsOptions}
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
 */
const corsOptions = {
  origin: process.env.CORS_ORIGIN || 'http://127.0.0.1:3000',
  methods: ['GET', 'HEAD', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
  optionsSuccessStatus: 204
};

/**
 * IP-based request rate limiter.
 *
 * Each unique client IP is allowed at most 100 requests within a rolling
 * 15-minute window.  When the limit is exceeded the middleware responds with
 * HTTP `429 Too Many Requests`.
 *
 * The `standardHeaders: 'draft-8'` option includes modern `RateLimit` headers
 * in every response so that well-behaved clients can self-throttle.  Legacy
 * `X-RateLimit-*` headers are disabled to reduce response header size.
 *
 * @type {import('express-rate-limit').RateLimitRequestHandler}
 * @see https://www.ietf.org/archive/id/draft-ietf-httpapi-ratelimit-headers-08.html
 */
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100, // 100 requests per window per IP
  standardHeaders: 'draft-8', // Modern RateLimit headers
  legacyHeaders: false // Disable X-RateLimit-* headers
});

// =============================================================================
// Security Middleware Pipeline (applied BEFORE routes in strict order)
// =============================================================================
// Middleware execution order matters: Helmet MUST be first so that security
// headers are present on every response — including CORS pre-flight and
// rate-limit error responses.  Changing this order can create gaps in the
// security posture.

app.use(helmet());          // 1. Security headers (MUST be first middleware)
app.use(cors(corsOptions));  // 2. CORS policy enforcement
app.use(limiter);            // 3. Rate limiting

// =============================================================================
// Input Validation Middleware (shared across routes)
// =============================================================================

/**
 * Reusable `express-validator` validation chain for query parameters.
 *
 * The chain performs the following checks on the optional `name` query
 * parameter:
 *   1. Verifies the value does not exceed 500 characters.
 *   2. Runs a custom validator that rejects any value containing HTML tags
 *      (regex `/<[^>]*>/`), which is the primary XSS prevention gate
 *      (OWASP A03:2021 — Injection).
 *   3. Trims leading/trailing whitespace.
 *   4. HTML-entity-escapes special characters (`&`, `<`, `>`, `"`, `'`).
 *
 * This array is spread into the route middleware list for every endpoint so
 * that every route receives the same input sanitisation guarantees.
 *
 * @type {import('express-validator').ValidationChain[]}
 */
const validateQuery = [
  query('name')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Name exceeds maximum length')
    .custom((value) => {
      // Reject inputs containing HTML tags to prevent XSS injection (OWASP A03:2021).
      // The regex matches any string that contains an opening angle bracket followed
      // by content and a closing angle bracket, which covers <script>, <img>, <a>, etc.
      if (/<[^>]*>/.test(value)) {
        throw new Error('Input contains potentially dangerous content');
      }
      return true;
    })
    .trim()
    .escape(),
];

/**
 * Express middleware that inspects the validation result produced by the
 * preceding `validateQuery` chain.
 *
 * If any validation errors are present the middleware short-circuits the
 * request pipeline and responds with HTTP `400 Bad Request` and a plain-text
 * `"Validation Error"` message.  Otherwise it calls `next()` to continue to
 * the route handler.
 *
 * @param {import('express').Request} req  - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @param {import('express').NextFunction} next - Express next-middleware callback.
 * @returns {void}
 */
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).type('text/plain').send('Validation Error\n');
  }
  next();
}

// =============================================================================
// Routes
// =============================================================================
// Each route is registered with the shared validation middleware
// (`validateQuery`, `handleValidationErrors`) followed by the route handler.
// Routes MUST be registered AFTER the global security middleware (Helmet,
// CORS, Rate Limiter) and BEFORE the 404 catch-all handler so that
// unmatched requests fall through correctly.

/**
 * GET / — Root greeting endpoint.
 *
 * Responds with `"Hello, World!\n"` as plain text (HTTP 200).
 * The trailing newline is intentional so that `curl` output renders cleanly
 * in a terminal without appending a `%` character.
 *
 * @name GET /
 * @function
 * @param {import('express').Request} req  - Express request object.
 * @param {import('express').Response} res - Express response object.
 */
app.get('/', validateQuery, handleValidationErrors, (req, res) => {
  res.type('text/plain').send('Hello, World!\n');
});

/**
 * GET /evening — Evening greeting endpoint.
 *
 * Responds with `"Good evening\n"` as plain text (HTTP 200).
 * Mirrors the response format of `GET /` — plain text with trailing newline.
 *
 * @name GET /evening
 * @function
 * @param {import('express').Request} req  - Express request object.
 * @param {import('express').Response} res - Express response object.
 */
app.get('/evening', validateQuery, handleValidationErrors, (req, res) => {
  res.type('text/plain').send('Good evening\n');
});

// =============================================================================
// 404 Handler — Catches all unmatched routes
// =============================================================================

/**
 * Catch-all middleware for requests that do not match any defined route.
 *
 * Because this middleware is registered *after* all named routes, Express
 * only invokes it when no prior route has handled the request.  It responds
 * with HTTP `404 Not Found` and a plain-text body.
 *
 * @param {import('express').Request} req  - Express request object.
 * @param {import('express').Response} res - Express response object.
 */
app.use((req, res) => {
  res.status(404).type('text/plain').send('Not Found\n');
});

// =============================================================================
// Error Handling Middleware — Catches all errors from route handlers
// =============================================================================

/**
 * Centralised Express error-handling middleware.
 *
 * Express recognises a middleware as an error handler when its function
 * signature contains exactly **four** parameters (`err`, `req`, `res`,
 * `next`).  This handler is the single point through which all runtime
 * errors (both synchronous and asynchronous) are funnelled.
 *
 * Behaviour:
 * - Logs the full error stack (or message) to `stderr` for operator
 *   visibility.
 * - Reads a custom `status` or `statusCode` property from the error object;
 *   falls back to `500 Internal Server Error` when neither is set.
 * - In production (`NODE_ENV === 'production'`), the response body is a
 *   generic message that hides internal implementation details.  In all
 *   other environments the original error message is returned to aid
 *   debugging.
 *
 * @param {Error & { status?: number, statusCode?: number }} err - Error object, optionally decorated with a status code.
 * @param {import('express').Request} req  - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @param {import('express').NextFunction} next - Express next-middleware callback (required by Express error-handler signature but unused here).
 */
app.use((err, req, res, next) => {
  // Log the error for debugging and operational monitoring.
  console.error('Error occurred:', err.stack || err.message || err);

  // Determine the appropriate HTTP status code from the error object.
  // Libraries such as `http-errors` attach `status`; others use `statusCode`.
  const statusCode = err.status || err.statusCode || 500;

  // In production environments, never leak internal error details to clients.
  const message = process.env.NODE_ENV === 'production'
    ? 'Internal Server Error'
    : err.message || 'Internal Server Error';

  res.status(statusCode).type('text/plain').send(`${message}\n`);
});

// =============================================================================
// Server Initialization — Capture server reference for graceful shutdown
// =============================================================================

/**
 * HTTP server instance.
 *
 * Created by calling `app.listen()`, which internally invokes
 * `http.createServer(app)` and begins accepting TCP connections on the
 * specified `hostname` and `port`.  The returned `http.Server` reference is
 * stored so that:
 *   - The graceful shutdown function can call `server.close()` to stop
 *     accepting new connections.
 *   - The test suite can import it and close the listener after all tests
 *     have finished, preventing Jest from hanging.
 *
 * @type {import('http').Server}
 */
const server = app.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});

// =============================================================================
// HTTPS Server (conditional — starts only if certificates exist)
// =============================================================================

/**
 * HTTPS server instance.
 *
 * Set to `null` by default and only initialised when both the TLS private
 * key (`certs/key.pem`) and certificate (`certs/cert.pem`) exist on disk.
 * The same Express `app` is used as the request handler so that all routes
 * and middleware apply identically to both HTTP and HTTPS traffic.
 *
 * If the certificate files are missing or unreadable the server continues
 * in HTTP-only mode and logs a warning — this is expected in development
 * environments where TLS is not required.
 *
 * @type {import('https').Server | null}
 */
let httpsServer = null;

/** @constant {string} certPath — Path to the TLS certificate PEM file. */
const certPath = './certs/cert.pem';

/** @constant {string} keyPath — Path to the TLS private key PEM file. */
const keyPath = './certs/key.pem';

// Only attempt to start the HTTPS listener when both certificate files are
// present.  `fs.existsSync` is used synchronously during startup because
// the server is not yet accepting requests at this point.
if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
  try {
    const httpsOptions = {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath)
    };
    httpsServer = https.createServer(httpsOptions, app);
    httpsServer.listen(httpsPort, hostname, () => {
      console.log(`HTTPS server running at https://${hostname}:${httpsPort}/`);
    });
  } catch (err) {
    // Certificate read or server bind failure — degrade gracefully to
    // HTTP-only mode rather than crashing the process.
    console.error('Failed to start HTTPS server:', err.message);
    console.log('Continuing with HTTP only');
  }
}

// =============================================================================
// Graceful Shutdown Function
// Handles clean server termination with timeout protection
// =============================================================================

/**
 * Initiates a graceful server shutdown sequence.
 *
 * The function performs the following steps in order:
 *   1. Sets the `isShuttingDown` flag to guard against duplicate invocations.
 *   2. Closes the HTTPS listener (if active) so that no new TLS connections
 *      are accepted.
 *   3. Closes the HTTP listener.  `server.close()` waits for in-flight
 *      requests to complete before invoking its callback, which allows
 *      active connections to drain naturally.
 *   4. Starts a safety timer (`SHUTDOWN_TIMEOUT`) that forcefully terminates
 *      the process if the drain phase takes too long — this prevents the
 *      server from hanging indefinitely on long-lived keep-alive connections.
 *
 * @param {string} signal - The name of the signal or event that triggered the
 *   shutdown (e.g. `'SIGTERM'`, `'SIGINT'`, `'uncaughtException'`).  Used for
 *   log messages only.
 * @returns {void}
 */
function gracefulShutdown(signal) {
  // Guard: prevent multiple simultaneous shutdown attempts.  This can happen
  // when a process manager sends SIGTERM immediately followed by SIGINT.
  if (isShuttingDown) {
    console.log('Shutdown already in progress...');
    return;
  }

  isShuttingDown = true;
  console.log(`\n${signal} signal received: starting graceful shutdown`);

  // Close the HTTPS listener first (if it was started).  This ensures no new
  // TLS handshakes are initiated while we drain existing HTTP connections.
  if (httpsServer) {
    httpsServer.close();
  }

  // Stop accepting new HTTP connections and wait for in-flight requests to
  // complete.  The callback fires once all connections have been closed.
  server.close((err) => {
    if (err) {
      console.error('Error during server close:', err);
      process.exit(1);
    }
    console.log('HTTP server closed');
    console.log('Cleanup complete, exiting process');
    process.exit(0);
  });

  // Safety net: force-kill the process if graceful drain exceeds the timeout.
  // A value of 10 000 ms (10 seconds) balances giving in-flight requests
  // enough time to finish while not delaying deployment rollouts.
  const SHUTDOWN_TIMEOUT = 10000; // 10 seconds
  setTimeout(() => {
    console.error(`Forced shutdown after ${SHUTDOWN_TIMEOUT}ms timeout`);
    process.exit(1);
  }, SHUTDOWN_TIMEOUT);
}

// =============================================================================
// Signal Handlers — Handle process termination signals
// =============================================================================

// SIGTERM is the standard termination signal sent by process managers such as
// Docker, Kubernetes, and pm2 when they want the application to shut down.
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// SIGINT is sent when the user presses Ctrl+C in the terminal.  Handling it
// ensures that development servers close cleanly without leaving orphaned
// sockets or open file handles.
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// =============================================================================
// Exception Handlers — Last-resort error handling for unexpected failures
// =============================================================================

// An uncaught synchronous exception indicates a programmer error (e.g. a
// `TypeError` thrown outside of any `try/catch`).  The safest response is to
// log the error and shut down gracefully so that a process manager can restart
// the application in a clean state.
process.on('uncaughtException', (err, origin) => {
  console.error('Uncaught Exception:', err);
  console.error('Exception origin:', origin);
  gracefulShutdown('uncaughtException');
});

// Unhandled promise rejections are logged but do **not** trigger a shutdown.
// Express 5 automatically catches rejections from `async` route handlers, so
// the most likely source of these events is background work outside of the
// request pipeline.  Logging ensures they are visible to operators.
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise);
  console.error('Reason:', reason);
});

// =============================================================================
// Module Exports — Enable unit testing
// =============================================================================

/**
 * Exported objects consumed by the test suite and by any module that embeds
 * this server (e.g. integration tests, health-check scripts).
 *
 * - `app`         — The Express application instance (used by Supertest to
 *                   send requests without a live TCP connection).
 * - `server`      — The `http.Server` instance (closed in `afterAll` hooks
 *                   to prevent Jest from hanging).
 * - `httpsServer` — The `https.Server` instance or `null` if TLS
 *                   certificates were not found at startup.
 *
 * @type {{ app: import('express').Express, server: import('http').Server, httpsServer: import('https').Server | null }}
 */
module.exports = { app, server, httpsServer };
