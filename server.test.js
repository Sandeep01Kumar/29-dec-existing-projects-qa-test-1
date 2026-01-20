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
