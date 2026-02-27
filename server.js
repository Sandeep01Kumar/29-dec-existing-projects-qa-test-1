const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { rateLimit } = require('express-rate-limit');
const { query, validationResult } = require('express-validator');
const https = require('https');
const fs = require('fs');

const hostname = '127.0.0.1';
const port = 3000;
const httpsPort = 3443;

const app = express();

// Shutdown tracking flag to prevent multiple simultaneous shutdown attempts
let isShuttingDown = false;

// =============================================================================
// Security Configuration
// =============================================================================

// CORS policy — restrictive origin allowlist with limited HTTP methods
const corsOptions = {
  origin: process.env.CORS_ORIGIN || 'http://127.0.0.1:3000',
  methods: ['GET', 'HEAD', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
  optionsSuccessStatus: 204
};

// Rate limiter — 100 requests per 15-minute window per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100, // 100 requests per window per IP
  standardHeaders: 'draft-8', // Modern RateLimit headers
  legacyHeaders: false // Disable X-RateLimit-* headers
});

// =============================================================================
// Security Middleware (applied BEFORE routes in strict order)
// =============================================================================

app.use(helmet());          // 1. Security headers (MUST be first middleware)
app.use(cors(corsOptions));  // 2. CORS policy enforcement
app.use(limiter);            // 3. Rate limiting

// =============================================================================
// Input Validation Middleware (shared across routes)
// =============================================================================

// Reusable validation chain — validates and sanitizes query parameters
const validateQuery = [
  query('name')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Name exceeds maximum length')
    .custom((value) => {
      // Reject inputs containing HTML tags to prevent XSS injection (OWASP A03:2021)
      if (/<[^>]*>/.test(value)) {
        throw new Error('Input contains potentially dangerous content');
      }
      return true;
    })
    .trim()
    .escape(),
];

// Reusable validation error handler — returns 400 for invalid inputs
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

app.get('/', validateQuery, handleValidationErrors, (req, res) => {
  res.type('text/plain').send('Hello, World!\n');
});

app.get('/evening', validateQuery, handleValidationErrors, (req, res) => {
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
// HTTPS Server (conditional — starts only if certificates exist)
// =============================================================================

let httpsServer = null;
const certPath = './certs/cert.pem';
const keyPath = './certs/key.pem';

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
    console.error('Failed to start HTTPS server:', err.message);
    console.log('Continuing with HTTP only');
  }
}

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

  // Also close HTTPS server if running
  if (httpsServer) {
    httpsServer.close();
  }

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

module.exports = { app, server, httpsServer };
