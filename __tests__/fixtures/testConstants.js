/**
 * Test constants for server.js tests
 * Shared expected values used across test files
 */

const EXPECTED_BODY = 'Hello, World!\n';
const EXPECTED_STATUS = 200;
const EXPECTED_CONTENT_TYPE = 'text/plain';
const SERVER_HOSTNAME = '127.0.0.1';
const SERVER_PORT = 3000;
const STARTUP_MESSAGE_PATTERN = /Server running at/;

module.exports = {
  EXPECTED_BODY,
  EXPECTED_STATUS,
  EXPECTED_CONTENT_TYPE,
  SERVER_HOSTNAME,
  SERVER_PORT,
  STARTUP_MESSAGE_PATTERN
};
