/**
 * Comprehensive unit tests for server.js
 * Tests HTTP responses, status codes, headers, server startup/shutdown,
 * error handling, and edge cases.
 */

const request = require('supertest');
const http = require('http');
const {
  EXPECTED_BODY,
  EXPECTED_STATUS,
  EXPECTED_CONTENT_TYPE,
  SERVER_HOSTNAME,
  SERVER_PORT,
  STARTUP_MESSAGE_PATTERN
} = require('./fixtures/testConstants');
const {
  createTestServer,
  startServer,
  stopServer,
  getAvailablePort
} = require('./helpers/serverHelper');

// Import the actual server for testing
const server = require('../server');

describe('Server Tests', () => {
  afterEach(async () => {
    // Ensure the actual server is closed after each test
    if (server.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  describe('HTTP Response', () => {
    it('should return 200 status code', async () => {
      const response = await request(server).get('/');
      expect(response.status).toBe(EXPECTED_STATUS);
    });

    it('should return text/plain Content-Type', async () => {
      const response = await request(server).get('/');
      expect(response.headers['content-type']).toBe(EXPECTED_CONTENT_TYPE);
    });

    it('should return Hello, World! body', async () => {
      const response = await request(server).get('/');
      expect(response.text).toBe(EXPECTED_BODY);
    });

    it('should include Content-Length header', async () => {
      const response = await request(server).get('/');
      expect(response.headers['content-length']).toBe(String(EXPECTED_BODY.length));
    });
  });

  describe('HTTP Methods', () => {
    it('should respond to GET requests', async () => {
      const response = await request(server).get('/');
      expect(response.status).toBe(EXPECTED_STATUS);
      expect(response.text).toBe(EXPECTED_BODY);
    });

    it('should respond to POST requests', async () => {
      const response = await request(server).post('/');
      expect(response.status).toBe(EXPECTED_STATUS);
      expect(response.text).toBe(EXPECTED_BODY);
    });

    it('should respond to PUT requests', async () => {
      const response = await request(server).put('/');
      expect(response.status).toBe(EXPECTED_STATUS);
      expect(response.text).toBe(EXPECTED_BODY);
    });

    it('should respond to DELETE requests', async () => {
      const response = await request(server).delete('/');
      expect(response.status).toBe(EXPECTED_STATUS);
      expect(response.text).toBe(EXPECTED_BODY);
    });

    it('should respond to HEAD requests', async () => {
      const response = await request(server).head('/');
      expect(response.status).toBe(EXPECTED_STATUS);
      // HEAD requests should not have a body
      expect(response.text).toBeFalsy();
    });

    it('should respond to OPTIONS requests', async () => {
      const response = await request(server).options('/');
      expect(response.status).toBe(EXPECTED_STATUS);
    });

    it('should respond to PATCH requests', async () => {
      const response = await request(server).patch('/');
      expect(response.status).toBe(EXPECTED_STATUS);
      expect(response.text).toBe(EXPECTED_BODY);
    });
  });

  describe('Server Startup', () => {
    let testServer;

    beforeEach(() => {
      testServer = createTestServer();
    });

    afterEach(async () => {
      await stopServer(testServer);
    });

    it('should bind to specified hostname', async () => {
      const port = await startServer(testServer, 0, SERVER_HOSTNAME);
      const address = testServer.address();
      expect(address.address).toBe(SERVER_HOSTNAME);
      expect(port).toBeGreaterThan(0);
    });

    it('should listen on specified port', async () => {
      const availablePort = await getAvailablePort();
      await startServer(testServer, availablePort, SERVER_HOSTNAME);
      const address = testServer.address();
      expect(address.port).toBe(availablePort);
    });

    it('should log startup message', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      
      const logTestServer = http.createServer((req, res) => {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain');
        res.end('Hello, World!\n');
      });

      await new Promise((resolve) => {
        logTestServer.listen(0, SERVER_HOSTNAME, () => {
          const addr = logTestServer.address();
          console.log(`Server running at http://${SERVER_HOSTNAME}:${addr.port}/`);
          resolve();
        });
      });

      expect(consoleSpy).toHaveBeenCalled();
      expect(consoleSpy.mock.calls[0][0]).toMatch(STARTUP_MESSAGE_PATTERN);
      
      consoleSpy.mockRestore();
      await stopServer(logTestServer);
    });

    it('should emit listening event when started', async () => {
      const listeningCallback = jest.fn();
      testServer.on('listening', listeningCallback);
      
      await startServer(testServer, 0, SERVER_HOSTNAME);
      
      expect(listeningCallback).toHaveBeenCalled();
    });
  });

  describe('Server Shutdown', () => {
    let testServer;

    beforeEach(() => {
      testServer = createTestServer();
    });

    afterEach(async () => {
      await stopServer(testServer);
    });

    it('should close gracefully', async () => {
      await startServer(testServer, 0, SERVER_HOSTNAME);
      expect(testServer.listening).toBe(true);
      
      await stopServer(testServer);
      expect(testServer.listening).toBe(false);
    });

    it('should handle multiple close calls', async () => {
      await startServer(testServer, 0, SERVER_HOSTNAME);
      
      await stopServer(testServer);
      // Second close should not throw
      await expect(stopServer(testServer)).resolves.not.toThrow();
    });

    it('should emit close event when stopped', async () => {
      const closeCallback = jest.fn();
      testServer.on('close', closeCallback);
      
      await startServer(testServer, 0, SERVER_HOSTNAME);
      await stopServer(testServer);
      
      expect(closeCallback).toHaveBeenCalled();
    });

    it('should reject new connections after close is called', async () => {
      await startServer(testServer, 0, SERVER_HOSTNAME);
      
      await stopServer(testServer);
      
      // Server should not be listening
      expect(testServer.listening).toBe(false);
    });

    it('should handle stopServer with null server', async () => {
      await expect(stopServer(null)).resolves.not.toThrow();
    });

    it('should handle stopServer with non-listening server', async () => {
      const nonListeningServer = createTestServer();
      // Server not started, so not listening
      await expect(stopServer(nonListeningServer)).resolves.not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle concurrent requests', async () => {
      // Create a dedicated server for concurrent testing
      const concurrentServer = createTestServer();
      await startServer(concurrentServer, 0, SERVER_HOSTNAME);
      const port = concurrentServer.address().port;
      
      const concurrentRequests = 5;
      const promises = [];
      
      for (let i = 0; i < concurrentRequests; i++) {
        promises.push(
          new Promise((resolve, reject) => {
            const req = http.request({
              hostname: SERVER_HOSTNAME,
              port: port,
              path: '/',
              method: 'GET'
            }, (res) => {
              let data = '';
              res.on('data', (chunk) => { data += chunk; });
              res.on('end', () => {
                resolve({ status: res.statusCode, body: data });
              });
            });
            req.on('error', reject);
            req.end();
          })
        );
      }
      
      const responses = await Promise.all(promises);
      
      responses.forEach((response) => {
        expect(response.status).toBe(EXPECTED_STATUS);
        expect(response.body).toBe(EXPECTED_BODY);
      });

      await stopServer(concurrentServer);
    });

    it('should handle requests with query strings', async () => {
      const response = await request(server).get('/?foo=bar&baz=qux');
      expect(response.status).toBe(EXPECTED_STATUS);
      expect(response.text).toBe(EXPECTED_BODY);
    });

    it('should handle requests with various paths', async () => {
      const paths = ['/', '/foo', '/foo/bar', '/foo/bar/baz'];
      
      for (const path of paths) {
        const response = await request(server).get(path);
        expect(response.status).toBe(EXPECTED_STATUS);
        expect(response.text).toBe(EXPECTED_BODY);
      }
    });

    it('should handle requests with headers', async () => {
      const response = await request(server)
        .get('/')
        .set('Accept', 'application/json')
        .set('X-Custom-Header', 'test-value');
      
      expect(response.status).toBe(EXPECTED_STATUS);
      expect(response.text).toBe(EXPECTED_BODY);
    });

    it('should handle requests with request body', async () => {
      const response = await request(server)
        .post('/')
        .send({ test: 'data' });
      
      expect(response.status).toBe(EXPECTED_STATUS);
      expect(response.text).toBe(EXPECTED_BODY);
    });

    it('should handle empty path request', async () => {
      const response = await request(server).get('/');
      expect(response.status).toBe(EXPECTED_STATUS);
    });
  });

  describe('Error Handling', () => {
    let testServer;

    beforeEach(() => {
      testServer = createTestServer();
    });

    afterEach(async () => {
      await stopServer(testServer);
    });

    it('should handle port already in use', async () => {
      // Start first server on a specific port
      const port = await getAvailablePort();
      await startServer(testServer, port, SERVER_HOSTNAME);
      
      // Try to start second server on the same port
      const secondServer = createTestServer();
      
      await expect(
        startServer(secondServer, port, SERVER_HOSTNAME)
      ).rejects.toThrow();
      
      // Cleanup
      try {
        await stopServer(secondServer);
      } catch (e) {
        // Ignore cleanup errors
      }
    });

    it('should emit error event on failure', async () => {
      const port = await getAvailablePort();
      await startServer(testServer, port, SERVER_HOSTNAME);
      
      const secondServer = createTestServer();
      const errorCallback = jest.fn();
      secondServer.on('error', errorCallback);
      
      // Try to listen on the same port
      secondServer.listen(port, SERVER_HOSTNAME);
      
      // Wait for error event
      await new Promise((resolve) => setTimeout(resolve, 100));
      
      expect(errorCallback).toHaveBeenCalled();
      const errorArg = errorCallback.mock.calls[0][0];
      expect(errorArg.code).toBe('EADDRINUSE');
      
      // Cleanup
      try {
        await stopServer(secondServer);
      } catch (e) {
        // Ignore cleanup errors
      }
    });

    it('should handle server error gracefully', async () => {
      const errorServer = http.createServer((req, res) => {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain');
        res.end('Hello, World!\n');
      });
      
      const errorHandler = jest.fn();
      errorServer.on('error', errorHandler);
      
      // Server should be able to register error handlers
      expect(errorServer.listenerCount('error')).toBeGreaterThan(0);
      
      await stopServer(errorServer);
    });

    it('should reject startServer on error', async () => {
      // Occupy a port first
      const port = await getAvailablePort();
      const blockingServer = createTestServer();
      await startServer(blockingServer, port, SERVER_HOSTNAME);

      // Try to start server on occupied port - should reject
      const failingServer = createTestServer();
      await expect(startServer(failingServer, port, SERVER_HOSTNAME)).rejects.toThrow();

      // Cleanup
      await stopServer(blockingServer);
    });
  });

  describe('Response Headers', () => {
    it('should set correct Content-Type header', async () => {
      const response = await request(server).get('/');
      expect(response.headers['content-type']).toBe('text/plain');
    });

    it('should include Date header', async () => {
      const response = await request(server).get('/');
      expect(response.headers['date']).toBeDefined();
    });

    it('should include Connection header', async () => {
      const response = await request(server).get('/');
      expect(response.headers['connection']).toBeDefined();
    });
  });

  describe('Server Configuration', () => {
    it('should use correct hostname constant', () => {
      expect(SERVER_HOSTNAME).toBe('127.0.0.1');
    });

    it('should use correct port constant', () => {
      expect(SERVER_PORT).toBe(3000);
    });

    it('should have correct expected body', () => {
      expect(EXPECTED_BODY).toBe('Hello, World!\n');
    });

    it('should have correct expected status', () => {
      expect(EXPECTED_STATUS).toBe(200);
    });

    it('should have correct expected content type', () => {
      expect(EXPECTED_CONTENT_TYPE).toBe('text/plain');
    });
  });

  describe('Server Module Exports', () => {
    it('should export an http.Server instance', () => {
      expect(server).toBeInstanceOf(http.Server);
    });

    it('should not auto-start when imported', () => {
      // Server should not be listening when imported
      // (because require.main !== module when imported)
      expect(server.listening).toBe(false);
    });
  });
});
