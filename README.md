# hao-backprop-test
test project for backprop integration. Do not touch!

## Dependencies

- **Express.js** (v5.2.1) - Web framework for Node.js

## Installation

```bash
npm install
```

## Running the Server

```bash
node server.js
```

The server will start on http://127.0.0.1:3000/

## Available Endpoints

| Endpoint | Method | Response |
|----------|--------|----------|
| `/` | GET | Hello, World! |
| `/evening` | GET | Good evening |

## Testing Endpoints

```bash
# Test root endpoint
curl http://127.0.0.1:3000/

# Test evening endpoint
curl http://127.0.0.1:3000/evening
```
