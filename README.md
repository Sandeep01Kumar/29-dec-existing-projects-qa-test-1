# Hello World Node.js Server

A simple Node.js HTTP server built with Express.js that serves two endpoints.

## Prerequisites

- Node.js v18 or higher (tested with v20.20.0)
- npm v8 or higher (tested with v11.1.0)

## Installation

```bash
npm install
```

## Running the Server

```bash
npm start
# or
node server.js
```

The server will start at http://127.0.0.1:3000/

## Available Endpoints

| Endpoint | Method | Response |
|----------|--------|----------|
| `/` | GET | "Hello, World!" |
| `/evening` | GET | "Good evening" |

## Usage Examples

```bash
# Get "Hello, World!" response
curl http://127.0.0.1:3000/

# Get "Good evening" response
curl http://127.0.0.1:3000/evening
```

## Testing

Start the server in one terminal, then run tests in another:

```bash
# Terminal 1: Start the server
npm start

# Terminal 2: Run tests
npm test
```

## License

MIT
