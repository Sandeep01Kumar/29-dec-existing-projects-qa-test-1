const express = require('express');

const hostname = '127.0.0.1';
const port = 3000;

const app = express();

// Root route - returns "Hello, World!" with newline (preserves original behavior)
app.get('/', (req, res) => {
  res.send('Hello, World!\n');
});

// Evening route - returns "Good evening" (new endpoint per user specification)
app.get('/evening', (req, res) => {
  res.send('Good evening');
});

app.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});
