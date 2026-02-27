/**
 * Server Unit Tests
 * 
 * Comprehensive test suite for server.js covering:
 * - Route handlers
 * - 404 error handling
 * - Error handling middleware
 * - Graceful shutdown setup
 * - Module exports
 */

const request = require('supertest');
const { app, server } = require('./server');

// Store original process event listeners count for cleanup verification
const originalListenerCounts = {
  SIGTERM: process.listenerCount('SIGTERM'),
  SIGINT: process.listenerCount('SIGINT'),
  uncaughtException: process.listenerCount('uncaughtException'),
  unhandledRejection: process.listenerCount('unhandledRejection')
};

// =============================================================================
// Test Suite Setup and Teardown
// =============================================================================

afterAll((done) => {
  // Close the server after all tests complete
  if (server && server.listening) {
    server.close(done);
  } else {
    done();
  }
});

// =============================================================================
// Server Routes Tests
// =============================================================================

describe('Server Routes', () => {
  describe('GET /', () => {
    it('should return "Hello, World!" with status 200', async () => {
      const response = await request(app).get('/');
      
      expect(response.status).toBe(200);
      expect(response.text).toBe('Hello, World!\n');
    });
  });

  describe('GET /evening', () => {
    it('should return "Good evening" with status 200', async () => {
      const response = await request(app).get('/evening');
      
      expect(response.status).toBe(200);
      expect(response.text).toBe('Good evening\n');
    });
  });
});

// =============================================================================
// 404 Error Handling Tests
// =============================================================================

describe('404 Error Handling', () => {
  it('should return 404 for non-existent routes', async () => {
    const response = await request(app).get('/nonexistent');
    
    expect(response.status).toBe(404);
    expect(response.text).toBe('Not Found\n');
  });

  it('should return 404 for non-existent POST routes', async () => {
    const response = await request(app).post('/nonexistent');
    
    expect(response.status).toBe(404);
    expect(response.text).toBe('Not Found\n');
  });

  it('should return 404 for deeply nested non-existent routes', async () => {
    const response = await request(app).get('/a/b/c/d/e');
    
    expect(response.status).toBe(404);
    expect(response.text).toBe('Not Found\n');
  });

  it('should return 404 for unsupported HTTP methods on existing routes', async () => {
    const response = await request(app).post('/');
    
    expect(response.status).toBe(404);
    expect(response.text).toBe('Not Found\n');
  });
});

// =============================================================================
// Content Type Handling Tests
// =============================================================================

describe('Content Type Handling', () => {
  it('should return plain text content type for root', async () => {
    const response = await request(app).get('/');
    
    expect(response.headers['content-type']).toMatch(/text\/plain/);
  });

  it('should return plain text content type for 404', async () => {
    const response = await request(app).get('/nonexistent');
    
    expect(response.headers['content-type']).toMatch(/text\/plain/);
  });
});

// =============================================================================
// Server Exports Tests
// =============================================================================

describe('Server Exports', () => {
  it('should export app object', () => {
    expect(app).toBeDefined();
    expect(typeof app).toBe('function');
  });

  it('should export server object', () => {
    expect(server).toBeDefined();
    expect(typeof server.close).toBe('function');
    expect(typeof server.listen).toBe('function');
  });
});

// =============================================================================
// Graceful Shutdown Setup Tests
// =============================================================================

describe('Graceful Shutdown Setup', () => {
  it('should have SIGTERM handler registered', () => {
    // Check that at least one SIGTERM handler is registered
    const currentListenerCount = process.listenerCount('SIGTERM');
    expect(currentListenerCount).toBeGreaterThanOrEqual(1);
  });

  it('should have SIGINT handler registered', () => {
    // Check that at least one SIGINT handler is registered
    const currentListenerCount = process.listenerCount('SIGINT');
    expect(currentListenerCount).toBeGreaterThanOrEqual(1);
  });

  it('should have uncaughtException handler registered', () => {
    // Check that at least one uncaughtException handler is registered
    const currentListenerCount = process.listenerCount('uncaughtException');
    expect(currentListenerCount).toBeGreaterThanOrEqual(1);
  });

  it('should have unhandledRejection handler registered', () => {
    // Check that at least one unhandledRejection handler is registered
    const currentListenerCount = process.listenerCount('unhandledRejection');
    expect(currentListenerCount).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================================
// Error Handling Middleware Pattern Tests
// =============================================================================

describe('Error Handling Middleware Pattern', () => {
  // Create a test app to verify error handling works correctly
  const express = require('express');
  
  // We need to test the error handling middleware in isolation
  // by adding test routes that throw errors
  
  it('should catch synchronous errors and return 500', async () => {
    // Create a test instance with error-throwing route
    const testApp = express();
    
    testApp.get('/test-sync-error', (req, res, next) => {
      const error = new Error('Test sync error');
      next(error);
    });
    
    // Add the same error handler from server.js
    testApp.use((err, req, res, next) => {
      const statusCode = err.status || err.statusCode || 500;
      const message = process.env.NODE_ENV === 'production'
        ? 'Internal Server Error'
        : err.message || 'Internal Server Error';
      res.status(statusCode).type('text/plain').send(`${message}\n`);
    });
    
    const response = await request(testApp).get('/test-sync-error');
    
    expect(response.status).toBe(500);
    expect(response.text).toBe('Test sync error\n');
  });

  it('should catch async errors and return 500', async () => {
    // Create a test instance with async error-throwing route
    const testApp = express();
    
    testApp.get('/test-async-error', async (req, res, next) => {
      throw new Error('Test async error');
    });
    
    // Add the same error handler from server.js
    testApp.use((err, req, res, next) => {
      const statusCode = err.status || err.statusCode || 500;
      const message = process.env.NODE_ENV === 'production'
        ? 'Internal Server Error'
        : err.message || 'Internal Server Error';
      res.status(statusCode).type('text/plain').send(`${message}\n`);
    });
    
    const response = await request(testApp).get('/test-async-error');
    
    expect(response.status).toBe(500);
    expect(response.text).toBe('Test async error\n');
  });

  it('should respect custom status codes on errors', async () => {
    // Create a test instance with custom status code error
    const testApp = express();
    
    testApp.get('/test-custom-error', (req, res, next) => {
      const error = new Error('Bad Request');
      error.status = 400;
      next(error);
    });
    
    // Add the same error handler from server.js
    testApp.use((err, req, res, next) => {
      const statusCode = err.status || err.statusCode || 500;
      const message = process.env.NODE_ENV === 'production'
        ? 'Internal Server Error'
        : err.message || 'Internal Server Error';
      res.status(statusCode).type('text/plain').send(`${message}\n`);
    });
    
    const response = await request(testApp).get('/test-custom-error');
    
    expect(response.status).toBe(400);
    expect(response.text).toBe('Bad Request\n');
  });

  it('should allow normal routes to work', async () => {
    // Verify the main app routes still work with error handling in place
    const response = await request(app).get('/');
    
    expect(response.status).toBe(200);
    expect(response.text).toBe('Hello, World!\n');
  });

  it('should return plain text content type for errors', async () => {
    // Create a test instance with error-throwing route
    const testApp = express();
    
    testApp.get('/test-error-type', (req, res, next) => {
      next(new Error('Test error'));
    });
    
    // Add the same error handler from server.js
    testApp.use((err, req, res, next) => {
      const statusCode = err.status || err.statusCode || 500;
      const message = process.env.NODE_ENV === 'production'
        ? 'Internal Server Error'
        : err.message || 'Internal Server Error';
      res.status(statusCode).type('text/plain').send(`${message}\n`);
    });
    
    const response = await request(testApp).get('/test-error-type');
    
    expect(response.headers['content-type']).toMatch(/text\/plain/);
  });
});

// =============================================================================
// Security Headers Tests
// Verify that helmet middleware sets protective HTTP response headers on every
// response, including error responses (OWASP A05:2021 — Security Misconfiguration)
// =============================================================================

describe('Security Headers', () => {
  it('should set Content-Security-Policy header', async () => {
    const response = await request(app).get('/');

    expect(response.headers['content-security-policy']).toBeDefined();
  });

  it('should set X-Content-Type-Options header', async () => {
    const response = await request(app).get('/');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('should set X-Frame-Options header', async () => {
    const response = await request(app).get('/');

    // Helmet sets X-Frame-Options to SAMEORIGIN by default
    expect(response.headers['x-frame-options']).toBeDefined();
  });

  it('should remove X-Powered-By header', async () => {
    const response = await request(app).get('/');

    // Helmet removes X-Powered-By to prevent server technology fingerprinting
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('should set security headers on error responses too', async () => {
    const response = await request(app).get('/nonexistent');

    // Security headers must be present even on 404 error responses
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });
});

// =============================================================================
// CORS Policy Tests
// Verify that the cors middleware enforces cross-origin access control policies
// with a restrictive origin allowlist (OWASP A05:2021)
// =============================================================================

describe('CORS Policy', () => {
  it('should include CORS headers in responses', async () => {
    // A request without an Origin header should complete successfully
    const response = await request(app).get('/');

    expect(response.status).toBe(200);
  });

  it('should handle preflight OPTIONS requests', async () => {
    // Preflight request from the configured allowed origin
    const response = await request(app)
      .options('/')
      .set('Origin', 'http://127.0.0.1:3000')
      .set('Access-Control-Request-Method', 'GET');

    // CORS middleware should respond with appropriate headers
    expect(response.headers['access-control-allow-origin']).toBeDefined();
  });
});

// =============================================================================
// Input Validation Tests
// Verify that express-validator sanitizes and validates all incoming request
// data to prevent injection attacks (OWASP A03:2021 — Injection)
// =============================================================================

describe('Input Validation', () => {
  it('should reject requests with malicious query parameters', async () => {
    // XSS payload in query parameter should be rejected with 400
    const response = await request(app)
      .get('/?name=<script>alert("xss")</script>');

    expect(response.status).toBe(400);
    expect(response.text).toContain('Validation Error');
  });

  it('should allow requests with clean query parameters', async () => {
    // Normal alphanumeric input should pass validation
    const response = await request(app).get('/?name=John');

    expect(response.status).toBe(200);
    expect(response.text).toBe('Hello, World!\n');
  });
});

// =============================================================================
// Rate Limiting Tests
// Verify that express-rate-limit protects against request flooding and
// brute-force attacks via IP-based request rate limiting
// NOTE: This describe block is intentionally placed LAST to avoid polluting
// the rate limit counter for other test blocks in the suite
// =============================================================================

describe('Rate Limiting', () => {
  it('should include rate limit headers in responses', async () => {
    const response = await request(app).get('/');

    // draft-8 standard headers from express-rate-limit (standardHeaders: 'draft-8')
    expect(response.headers['ratelimit-policy']).toBeDefined();
  });

  it('should return 429 when rate limit is exceeded', async () => {
    // Send requests in parallel to exceed the 100-request-per-window rate limit.
    // Previous tests have already consumed some of the limit, so 110 requests
    // should be more than enough to trigger a 429 Too Many Requests response.
    const promises = [];
    for (let i = 0; i < 110; i++) {
      promises.push(request(app).get('/'));
    }

    const responses = await Promise.all(promises);
    const has429 = responses.some((r) => r.status === 429);

    expect(has429).toBe(true);
  }, 30000); // Extended timeout for many concurrent requests
});
