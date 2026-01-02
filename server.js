const http = require('http');

const hostname = '127.0.0.1';
const port = 3000;

const server = http.createServer((req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain');
  res.end('Hello, World!\n');
});

// Security: Error handling
server.on('error', (err) => {
  console.error('Server error:', err.message);
});

// Security: Request timeout (2 minutes)
server.timeout = 120000;

// Security: Graceful shutdown
function shutdown() {
  console.log('Shutting down...');
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
  // Force exit after 5 seconds
  setTimeout(() => process.exit(1), 5000);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});
