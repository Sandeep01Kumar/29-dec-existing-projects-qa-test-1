const express = require('express');

const hostname = '127.0.0.1';
const port = 3000;

const app = express();

// Route handler for root path - returns "Hello, World!"
app.get('/', (req, res) => {
  res.type('text/plain');
  res.send('Hello, World!\n');
});

// Route handler for /evening path - returns "Good evening"
app.get('/evening', (req, res) => {
  res.type('text/plain');
  res.send('Good evening');
});

app.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});
