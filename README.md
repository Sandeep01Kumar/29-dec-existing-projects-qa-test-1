# hao-backprop-test

A simple Node.js HTTP server using Express.js framework.

## Description

This project demonstrates a basic Express.js server with two HTTP endpoints.

## Installation

```bash
npm install
```

## Usage

Start the server:

```bash
npm start
# or
node server.js
```

The server runs at `http://127.0.0.1:3000/`.

## API Endpoints

| Endpoint | Method | Response |
|----------|--------|----------|
| `/` | GET | `Hello, World!` |
| `/evening` | GET | `Good evening` |

### Example Usage

```bash
# Test Hello World endpoint
curl http://127.0.0.1:3000/

# Test Good Evening endpoint
curl http://127.0.0.1:3000/evening
```

## License

MIT
