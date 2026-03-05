# hao-backprop-test

A production-hardened Node.js HTTP server built with **Express 5** that serves
two greeting endpoints behind a comprehensive security middleware pipeline.

> **Note:** This is a test project for backprop integration. Do not touch!

---

## Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Running the Server](#running-the-server)
- [API Documentation](#api-documentation)
  - [GET /](#get-)
  - [GET /evening](#get-evening)
  - [Error Responses](#error-responses)
- [Testing](#testing)
  - [Automated Tests](#automated-tests)
  - [Manual Testing with curl](#manual-testing-with-curl)
- [Project Structure](#project-structure)
- [Security Features](#security-features)
  - [Security Headers (Helmet)](#security-headers-helmet)
  - [CORS Policy](#cors-policy)
  - [Rate Limiting](#rate-limiting)
  - [Input Validation](#input-validation)
- [HTTPS Setup](#https-setup)
- [Deployment Guide](#deployment-guide)
  - [Environment Variables](#environment-variables)
  - [Running Behind a Reverse Proxy](#running-behind-a-reverse-proxy)
  - [Process Managers](#process-managers)
  - [Docker](#docker)
  - [Graceful Shutdown](#graceful-shutdown)
- [Dependencies](#dependencies)
- [License](#license)

---

## Features

- **Express 5.2.1** web framework with modern async error handling
- **Two greeting endpoints** — `GET /` and `GET /evening`
- **Helmet** — 13 protective HTTP security response headers
- **CORS** — restrictive origin allowlist with configurable policy
- **Rate Limiting** — 100 requests per IP per 15-minute window
- **Input Validation** — query parameter sanitisation and XSS prevention
- **Conditional HTTPS** — TLS listener on port 3443 when certificates are present
- **Graceful Shutdown** — clean process termination with drain timeout
- **Comprehensive Test Suite** — 30 tests covering routes, security, errors, and more

---

## Prerequisites

| Requirement | Minimum Version | Recommended  |
|-------------|-----------------|--------------|
| Node.js     | 18.x            | 20.x (LTS)  |
| npm         | 9.x             | 11.x         |

Verify your installation:

```bash
node --version   # Expected: v18.x or higher
npm --version    # Expected: 9.x or higher
```

---

## Installation

1. **Clone the repository** (or navigate to the project directory):

   ```bash
   cd hao-backprop-test
   ```

2. **Install all dependencies** (production and dev):

   ```bash
   npm install
   ```

   This installs 387 packages with 0 known vulnerabilities.

---

## Running the Server

Start the HTTP server on `http://127.0.0.1:3000/`:

```bash
node server.js
```

Expected console output:

```
Server running at http://127.0.0.1:3000/
```

If TLS certificates are present in `./certs/` (see [HTTPS Setup](#https-setup)),
the HTTPS server will also start:

```
HTTPS server running at https://127.0.0.1:3443/
```

Stop the server with `Ctrl+C` — the graceful shutdown handler will close all
active connections before exiting.

---

## API Documentation

### Endpoints Overview

| Endpoint   | Method | Status | Content-Type | Response Body    |
|------------|--------|--------|--------------|------------------|
| `/`        | GET    | 200    | text/plain   | `Hello, World!\n`|
| `/evening` | GET    | 200    | text/plain   | `Good evening\n` |

### GET /

Returns the classic "Hello, World!" greeting.

**Request:**

```
GET / HTTP/1.1
Host: 127.0.0.1:3000
```

**Successful Response (200 OK):**

```
Hello, World!
```

**With optional query parameter:**

```
GET /?name=Alice HTTP/1.1
```

The `name` parameter is validated and sanitised but does not change the
response body — it exists to demonstrate the input validation middleware.

---

### GET /evening

Returns an evening greeting.

**Request:**

```
GET /evening HTTP/1.1
Host: 127.0.0.1:3000
```

**Successful Response (200 OK):**

```
Good evening
```

---

### Error Responses

| Status | Condition                                    | Body                        |
|--------|----------------------------------------------|-----------------------------|
| 400    | Query parameter contains HTML/script tags    | `Validation Error\n`        |
| 404    | Path does not match any defined route        | `Not Found\n`               |
| 429    | Client IP exceeded 100 requests / 15 minutes | Rate limit exceeded message |
| 500    | Unhandled server error                       | `Internal Server Error\n`   |

All error responses use `Content-Type: text/plain`.

---

## Testing

### Automated Tests

The project uses **Jest** (v30) and **Supertest** (v7) for automated testing.
The suite contains **30 tests** across 10 describe blocks:

| Test Group                    | Tests | Coverage Area                              |
|-------------------------------|-------|--------------------------------------------|
| Server Routes                 | 2     | `GET /` and `GET /evening` responses       |
| 404 Error Handling            | 4     | Non-existent paths, methods, nested routes |
| Content Type Handling         | 2     | `text/plain` on success and error          |
| Server Exports                | 2     | `app` and `server` object validation       |
| Graceful Shutdown Setup       | 4     | SIGTERM, SIGINT, exception handlers        |
| Error Handling Middleware      | 5     | Sync/async errors, custom status codes     |
| Security Headers              | 5     | Helmet headers, x-powered-by removal       |
| CORS Policy                   | 2     | Origin validation, preflight OPTIONS       |
| Input Validation              | 2     | XSS payload rejection, clean input         |
| Rate Limiting                 | 2     | Header presence, 429 enforcement           |

Run the full test suite:

```bash
npm test
```

Run with verbose output:

```bash
npx jest --verbose
```

Run a specific test group:

```bash
npx jest --verbose -t "Server Routes"
```

Expected output:

```
Test Suites: 1 passed, 1 total
Tests:       30 passed, 30 total
```

### Manual Testing with curl

Test the root endpoint:

```bash
curl http://127.0.0.1:3000/
# Output: Hello, World!
```

Test the evening endpoint:

```bash
curl http://127.0.0.1:3000/evening
# Output: Good evening
```

Test a non-existent route (should return 404):

```bash
curl -w "\nHTTP Status: %{http_code}\n" http://127.0.0.1:3000/nonexistent
# Output: Not Found
# HTTP Status: 404
```

Verify security headers are present:

```bash
curl -sI http://127.0.0.1:3000/ | grep -iE "content-security-policy|x-content-type|strict-transport"
```

Verify rate limit headers are present:

```bash
curl -sI http://127.0.0.1:3000/ | grep -i "ratelimit"
```

Test input validation (should return 400):

```bash
curl -w "\nHTTP Status: %{http_code}\n" "http://127.0.0.1:3000/?name=<script>alert(1)</script>"
# Output: Validation Error
# HTTP Status: 400
```

---

## Project Structure

```
.
├── server.js            # Express application — routes, middleware, server startup
├── server.test.js       # Jest + Supertest test suite (30 tests)
├── server - Copy.js     # Historical reference — original http.createServer() server
├── package.json         # npm manifest — dependencies and scripts
├── package-lock.json    # Deterministic dependency lockfile
├── .gitignore           # Git ignore patterns
├── generate-cert.sh     # Self-signed TLS certificate generation script
├── README.md            # This documentation file
└── certs/               # TLS certificates directory (generated, git-ignored)
    ├── key.pem          # RSA-2048 private key (generated by generate-cert.sh)
    └── cert.pem         # Self-signed certificate (generated by generate-cert.sh)
```

### Code Architecture (`server.js`)

The server module follows a linear top-to-bottom architecture:

1. **Imports** — External packages (`express`, `helmet`, `cors`, `express-rate-limit`, `express-validator`) and Node.js built-ins (`https`, `fs`).
2. **Configuration** — Server hostname/port constants, CORS options, rate limiter settings.
3. **Security Middleware** — Applied globally in strict order: Helmet → CORS → Rate Limiter.
4. **Input Validation** — Shared `validateQuery` chain and `handleValidationErrors` middleware.
5. **Route Handlers** — `GET /` and `GET /evening`, each using the validation middleware.
6. **404 Handler** — Catch-all for unmatched requests.
7. **Error Handler** — Centralised 4-parameter error middleware.
8. **Server Startup** — HTTP listener on port 3000, conditional HTTPS on port 3443.
9. **Graceful Shutdown** — Signal handlers for `SIGTERM`, `SIGINT`, uncaught exceptions.
10. **Module Exports** — `{ app, server, httpsServer }` for test consumption.

---

## Security Features

### Security Headers (Helmet)

Every HTTP response includes 13 protective headers set by
[Helmet](https://helmetjs.github.io/):

| Header                            | Purpose                                                        |
|-----------------------------------|----------------------------------------------------------------|
| Content-Security-Policy           | Restricts sources of content the browser may load              |
| Cross-Origin-Opener-Policy        | Isolates browsing context from cross-origin documents          |
| Cross-Origin-Resource-Policy      | Prevents other origins from reading the response               |
| Origin-Agent-Cluster              | Requests browser to isolate origin in its own agent cluster    |
| Referrer-Policy                   | Controls the `Referer` header sent with requests               |
| Strict-Transport-Security         | Instructs browsers to use HTTPS for all future requests        |
| X-Content-Type-Options            | Prevents MIME-type sniffing (`nosniff`)                        |
| X-DNS-Prefetch-Control            | Controls DNS prefetching behaviour                             |
| X-Download-Options                | Prevents IE from executing downloaded files                    |
| X-Frame-Options                   | Prevents clickjacking via frame restrictions (`SAMEORIGIN`)    |
| X-Permitted-Cross-Domain-Policies | Controls cross-domain policy files                             |
| X-XSS-Protection                  | Disabled (`0`) — legacy filter can introduce vulnerabilities   |
| X-Powered-By                      | **Removed** — prevents server technology fingerprinting        |

### CORS Policy

Cross-origin requests are controlled with a restrictive policy:

| Setting           | Value                              | Notes                             |
|-------------------|------------------------------------|-----------------------------------|
| Allowed Origin    | `http://127.0.0.1:3000`           | Override with `CORS_ORIGIN` env   |
| Allowed Methods   | `GET`, `HEAD`, `OPTIONS`           | Read-only methods only            |
| Allowed Headers   | `Content-Type`, `Authorization`    |                                   |
| Credentials       | Disabled                           | No cookies or HTTP auth           |
| Preflight Status  | `204 No Content`                   | Per CORS specification            |

### Rate Limiting

All endpoints are protected by IP-based rate limiting:

| Setting     | Value                                      |
|-------------|--------------------------------------------|
| Window      | 15 minutes (fixed window)                  |
| Limit       | 100 requests per IP per window             |
| Headers     | `draft-8` standard `RateLimit` headers     |
| Exceeded    | `429 Too Many Requests` response           |

### Input Validation

Query parameters on all routes are validated and sanitised using
[express-validator](https://express-validator.github.io/docs/):

- **Length limit** — The `name` query parameter is capped at 500 characters.
- **XSS prevention** — Values containing HTML tags (`<script>`, `<img>`, etc.)
  are rejected with HTTP `400 Bad Request`.
- **Sanitisation** — Accepted values are trimmed and HTML-entity-escaped before
  reaching the route handler.

---

## HTTPS Setup

The server supports HTTPS on port **3443** with TLS encryption for data in
transit. HTTPS starts automatically when certificate files are present in the
`certs/` directory.

### Generate Self-Signed Certificates (Development Only)

```bash
bash generate-cert.sh
```

This creates:

- `certs/key.pem` — RSA-2048 private key
- `certs/cert.pem` — Self-signed certificate with 365-day validity

After generating the certificates, restart the server:

```bash
node server.js
```

> **Warning:** Self-signed certificates are for **development use only**. Your
> browser will show a security warning when accessing
> `https://127.0.0.1:3443/`. For production environments, use properly issued
> certificates from a trusted Certificate Authority (e.g. Let's Encrypt).

### Verify HTTPS

```bash
curl -k https://127.0.0.1:3443/
# Output: Hello, World!

curl -k https://127.0.0.1:3443/evening
# Output: Good evening
```

The `-k` flag tells curl to accept the self-signed certificate.

---

## Deployment Guide

### Environment Variables

| Variable      | Default                    | Description                          |
|---------------|----------------------------|--------------------------------------|
| `CORS_ORIGIN` | `http://127.0.0.1:3000`   | Allowed CORS origin                  |
| `NODE_ENV`    | (unset)                    | Set to `production` to hide error details in responses |

Set environment variables before starting the server:

```bash
CORS_ORIGIN=https://example.com NODE_ENV=production node server.js
```

### Running Behind a Reverse Proxy

When deploying behind a reverse proxy (e.g. Nginx, Caddy, AWS ALB):

1. **Trust the proxy** — Add `app.set('trust proxy', 1)` before the rate
   limiter if the proxy forwards the client IP in `X-Forwarded-For`. Without
   this setting, `express-rate-limit` will see the proxy's IP instead of the
   client's IP, causing all requests to share a single rate-limit bucket.

2. **Let the proxy handle TLS** — In most production setups, the reverse proxy
   terminates TLS and forwards plain HTTP to the application. In this case,
   there is no need to generate certificates or enable the HTTPS listener.

3. **Health checks** — The `GET /` endpoint can serve as a basic health check.
   Configure your load balancer to poll `http://127.0.0.1:3000/` and expect a
   `200` response.

### Process Managers

For production deployments, use a process manager to handle restarts and log
management:

**pm2:**

```bash
# Install pm2 globally
npm install -g pm2

# Start the server
pm2 start server.js --name hao-backprop

# View logs
pm2 logs hao-backprop

# Restart on crash
pm2 startup
pm2 save
```

**systemd (Linux):**

Create `/etc/systemd/system/hao-backprop.service`:

```ini
[Unit]
Description=hao-backprop Node.js Server
After=network.target

[Service]
Type=simple
User=node
WorkingDirectory=/opt/hao-backprop
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=CORS_ORIGIN=https://example.com

[Install]
WantedBy=multi-user.target
```

Then enable and start:

```bash
sudo systemctl enable hao-backprop
sudo systemctl start hao-backprop
```

### Docker

Create a `Dockerfile` in the project root:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server.js ./
EXPOSE 3000
USER node
CMD ["node", "server.js"]
```

Build and run:

```bash
docker build -t hao-backprop .
docker run -p 3000:3000 -e NODE_ENV=production hao-backprop
```

### Graceful Shutdown

The server handles the following termination signals:

| Signal             | Source                           | Behaviour                         |
|--------------------|----------------------------------|-----------------------------------|
| `SIGTERM`          | Process managers (Docker, pm2)   | Graceful shutdown with drain      |
| `SIGINT`           | `Ctrl+C` in terminal             | Graceful shutdown with drain      |
| `uncaughtException`| Unhandled synchronous error      | Log + graceful shutdown           |
| `unhandledRejection`| Unhandled promise rejection     | Log only (Express 5 handles route rejections) |

During shutdown:

1. The HTTPS listener (if active) stops accepting new connections.
2. The HTTP listener stops accepting new connections.
3. In-flight requests are given up to **10 seconds** to complete.
4. If the drain timeout expires, the process is forcefully terminated.

---

## Dependencies

### Production

| Package             | Version  | Purpose                                    |
|---------------------|----------|--------------------------------------------|
| express             | ^5.2.1   | Web application framework                  |
| helmet              | ^8.1.0   | Security HTTP response headers             |
| cors                | ^2.8.6   | Cross-Origin Resource Sharing middleware    |
| express-rate-limit  | ^8.2.1   | IP-based request rate limiting             |
| express-validator   | ^7.3.1   | Input validation and sanitisation          |

### Development

| Package   | Version  | Purpose                                      |
|-----------|----------|----------------------------------------------|
| jest      | ^30.2.0  | JavaScript testing framework                 |
| supertest | ^7.2.2   | HTTP assertion library for Express testing   |

---

## License

MIT
