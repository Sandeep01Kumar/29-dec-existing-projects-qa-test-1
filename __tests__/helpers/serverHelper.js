/**
 * Server helper utilities for test isolation
 * Provides server creation, startup, and cleanup functions
 */

const http = require('http');
const { SERVER_HOSTNAME, SERVER_PORT } = require('../fixtures/testConstants');

/**
 * Creates a test server instance without auto-listening
 * The request handler is identical to the main server.js implementation
 * @returns {http.Server} HTTP server instance
 */
function createTestServer() {
  return http.createServer((req, res) => {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Hello, World!\n');
  });
}

/**
 * Starts a server on the specified port
 * @param {http.Server} server - HTTP server instance
 * @param {number} [port=0] - Port to listen on (0 for ephemeral)
 * @param {string} [hostname='127.0.0.1'] - Hostname to bind to
 * @returns {Promise<number>} Resolves with the actual port number
 */
function startServer(server, port = 0, hostname = SERVER_HOSTNAME) {
  return new Promise((resolve, reject) => {
    server.listen(port, hostname, () => {
      const actualPort = server.address().port;
      resolve(actualPort);
    });
    server.on('error', reject);
  });
}

/**
 * Gracefully stops a server
 * @param {http.Server} server - HTTP server instance
 * @returns {Promise<void>} Resolves when server is closed
 */
function stopServer(server) {
  return new Promise((resolve, reject) => {
    if (!server || !server.listening) {
      resolve();
      return;
    }
    server.close((err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Finds an available port for isolated tests
 * @returns {Promise<number>} Resolves with an available port number
 */
function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, () => {
      const port = server.address().port;
      server.close(() => {
        resolve(port);
      });
    });
    server.on('error', reject);
  });
}

module.exports = {
  createTestServer,
  startServer,
  stopServer,
  getAvailablePort
};
