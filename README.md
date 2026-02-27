# hao-backprop-test
test project for backprop integration. Do not touch!

## Dependencies

- **Express.js** (v5.2.1) - Web framework for Node.js
- **Helmet** (v8.1.0) - Security HTTP response headers
- **CORS** (v2.8.6) - Cross-Origin Resource Sharing middleware
- **express-rate-limit** (v8.2.1) - IP-based request rate limiting
- **express-validator** (v7.3.1) - Input validation and sanitization

## Installation

```bash
npm install
```

## Running the Server

```bash
node server.js
```

The HTTP server will start on http://127.0.0.1:3000/

If TLS certificates are available in the `certs/` directory, the HTTPS server will also start on https://127.0.0.1:3443/. HTTPS is conditional on the presence of `certs/key.pem` and `certs/cert.pem`; if the certificate files are not found, the server runs HTTP only.

## Available Endpoints

| Endpoint | Method | Response |
|----------|--------|----------|
| `/` | GET | Hello, World! |
| `/evening` | GET | Good evening |

## Security Features

### Security Headers (Helmet)

Every HTTP response includes 13 protective security headers set by [Helmet](https://helmetjs.github.io/):

- **Content-Security-Policy** — restricts sources of content the browser is allowed to load
- **Cross-Origin-Opener-Policy** — isolates the browsing context from cross-origin documents
- **Cross-Origin-Resource-Policy** — prevents other origins from reading the response
- **Origin-Agent-Cluster** — requests the browser to isolate the origin in its own agent cluster
- **Referrer-Policy** — controls the Referer header sent with requests
- **Strict-Transport-Security** — instructs browsers to use HTTPS for all future requests
- **X-Content-Type-Options** — prevents MIME-type sniffing
- **X-DNS-Prefetch-Control** — controls DNS prefetching behavior
- **X-Download-Options** — prevents Internet Explorer from executing downloaded files
- **X-Frame-Options** — prevents clickjacking by restricting framing
- **X-Permitted-Cross-Domain-Policies** — controls cross-domain policy files
- **X-XSS-Protection** — disabled (`0`) to prevent legacy browser XSS filter from introducing vulnerabilities
- **X-Powered-By** — removed to prevent server technology disclosure

### Rate Limiting

All endpoints are protected by IP-based rate limiting:

- **Window:** 15-minute fixed window
- **Limit:** 100 requests per IP per window
- **Headers:** Modern `draft-8` standard `RateLimit` headers are included in every response
- **Exceeded:** Clients that exceed the limit receive a `429 Too Many Requests` response

### Input Validation

Query parameters on all routes are validated and sanitized using [express-validator](https://express-validator.github.io/docs/):

- Parameters are trimmed and escaped to prevent injection attacks (XSS, SQL injection)
- Malicious or oversized input returns a `400 Bad Request` response with a validation error message
- The `name` query parameter is validated and sanitized, with a maximum length of 500 characters

### CORS Policy

Cross-origin requests are controlled with a restrictive policy:

- **Allowed Origin:** `http://127.0.0.1:3000` by default (configurable via `CORS_ORIGIN` environment variable)
- **Allowed Methods:** `GET`, `HEAD`, `OPTIONS`
- **Allowed Headers:** `Content-Type`, `Authorization`
- **Credentials:** Disabled by default

### HTTPS Support

The server supports HTTPS on port **3443** with TLS encryption for data in transit. HTTPS is started automatically when certificate files are present in the `certs/` directory. See the [HTTPS Setup](#https-setup) section below for details.

## HTTPS Setup

To enable HTTPS for local development, generate self-signed certificates:

```bash
bash generate-cert.sh
```

This creates `certs/key.pem` (private key) and `certs/cert.pem` (certificate) with 365-day validity.

After generating the certificates, restart the server to enable HTTPS:

```bash
node server.js
```

> **Note:** Self-signed certificates are for development use only. Your browser will show a security warning when accessing `https://127.0.0.1:3443/`. For production environments, use properly issued certificates from a trusted Certificate Authority (e.g., Let's Encrypt).

## Testing Endpoints

Run the automated test suite:

```bash
npm test
```

Test the endpoints manually with `curl`:

```bash
# Test root endpoint
curl http://127.0.0.1:3000/

# Test evening endpoint
curl http://127.0.0.1:3000/evening
```

Verify security headers are present:

```bash
curl -sI http://127.0.0.1:3000/ | grep -iE "content-security-policy|x-content-type|strict-transport"
```

Verify rate limit headers are present:

```bash
curl -sI http://127.0.0.1:3000/ | grep -i "ratelimit"
```
