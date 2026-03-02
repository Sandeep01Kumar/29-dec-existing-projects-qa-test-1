# Technical Specification

# 0. Agent Action Plan

## 0.1 Intent Clarification

### 0.1.1 Core Security Objective

Based on the security concern described, the Blitzy platform understands that the security vulnerability to resolve is a **multi-faceted hardening initiative** for a Node.js/Express 5.2.1 "Hello World" web service that currently operates without any security middleware, HTTPS encryption, input validation, rate limiting, or cross-origin resource sharing policies.

- **Vulnerability category:** Multiple vulnerabilities — comprising dependency vulnerabilities (minimatch ReDoS, qs DoS), missing security headers, absence of input validation and sanitization, no rate limiting defense, unencrypted HTTP transport, and unconfigured CORS policies
- **Severity level:** High — the dependency vulnerabilities carry CVSS scores of 7.5 (HIGH) for minimatch ReDoS, while the absence of security headers, rate limiting, and HTTPS represents a significant exposure for any public-facing deployment
- **Security requirements with enhanced clarity:**
  - Integrate `helmet` v8.1.0 middleware to set 13 protective HTTP response headers including Content-Security-Policy, Strict-Transport-Security, X-Content-Type-Options, X-Frame-Options, and others
  - Add `express-rate-limit` v8.2.1 to defend against brute-force and denial-of-service attacks by capping request frequency per IP
  - Implement `express-validator` v7.3.1 to sanitize and validate all incoming request data against injection attacks
  - Configure `cors` v2.8.6 middleware with restrictive origin policies to control cross-origin access
  - Add HTTPS support using the Node.js built-in `https` and `fs` modules with self-signed certificate infrastructure for development
  - Resolve two existing dependency vulnerabilities: minimatch (HIGH — 3 ReDoS CVEs) and qs (LOW — arrayLimit bypass DoS) via `npm audit fix`
- **Implicit security needs surfaced:**
  - Backward compatibility with the existing 19-test suite must be maintained — all current tests must continue to pass
  - The existing graceful shutdown, error handling, and 404 middleware in `server.js` must be preserved
  - The `main` field in `package.json` lists `index.js` but the actual entrypoint is `server.js` — this inconsistency should be noted but is out of scope for this security fix

### 0.1.2 Special Instructions and Constraints

- **Change scope preference:** Standard — security middleware additions are additive and non-breaking, dependency patches are minimal
- **API compatibility:** All existing routes (`GET /`, `GET /evening`) and their response formats must remain identical
- **No breaking changes:** The security middleware must be layered before route handlers without altering existing endpoint behavior
- **OWASP alignment:** Changes follow OWASP Top 10 recommendations for secure headers (A05:2021 Security Misconfiguration), input validation (A03:2021 Injection), and rate limiting (brute-force prevention)
- **Web search research conducted:** Security advisories for minimatch (CVE-2026-26996, CVE-2026-27903, CVE-2026-27904), qs (CVE-2026-2391), and latest stable versions of helmet, cors, express-rate-limit, and express-validator were researched

### 0.1.3 Technical Interpretation

This security vulnerability translates to the following technical fix strategy:

- To resolve **missing security headers**, we will add `helmet` as a production dependency and invoke `app.use(helmet())` before all route handlers in `server.js`
- To resolve **absence of rate limiting**, we will add `express-rate-limit` and configure a global rate limiter middleware with sensible defaults (100 requests per 15-minute window)
- To resolve **missing input validation**, we will add `express-validator` and implement validation/sanitization middleware for route parameters and query strings
- To resolve **unconfigured CORS**, we will add the `cors` package and configure it with restrictive origin settings via `app.use(cors(corsOptions))`
- To resolve **no HTTPS support**, we will add HTTPS server creation using Node.js built-in `https` module alongside the existing HTTP server, with self-signed certificate support for development
- To resolve **dependency vulnerabilities (minimatch, qs)**, we will execute `npm audit fix` to upgrade minimatch from 9.0.5 → 9.0.9 and 3.1.2 → 3.1.5, and qs from 6.14.1 → 6.15.0
- **User's understanding level:** General security concern — the user described desired security features rather than specific CVEs, indicating a proactive hardening approach

## 0.2 Vulnerability Research and Analysis

### 0.2.1 Initial Assessment

Security-related information extracted from repository audit and user requirements:

- **CVE numbers identified through `npm audit`:**
  - CVE-2026-26996 (minimatch ReDoS via repeated wildcards)
  - CVE-2026-27903 (minimatch ReDoS via matchOne() backtracking)
  - CVE-2026-27904 (minimatch ReDoS via nested *() extglobs)
  - CVE-2026-2391 (qs arrayLimit bypass in comma parsing)
  - CVE-2025-15284 (qs arrayLimit bypass in bracket notation — resolved in 6.14.1, but superseded by CVE-2026-2391)
- **Vulnerability names:** minimatch ReDoS (3 variants), qs arrayLimit bypass DoS
- **Affected packages:** `minimatch` (v9.0.5, v3.1.2), `qs` (v6.14.1)
- **Symptoms described by user:** No symptoms — proactive security hardening request
- **Security advisories referenced:** GHSA-3ppc-4f35-3m26, GHSA-7r86-cg39-jmmj, GHSA-23c5-xmqv-rm74, GHSA-w7fw-mjwx-w883, GHSA-6rw7-vpxm-498p
- **Missing security features identified:** No security headers, no input validation, no rate limiting, no HTTPS, no CORS configuration

### 0.2.2 Required Web Research Findings

Research reveals the following vulnerability details:

**minimatch ReDoS — CVE-2026-27904 (GHSA-23c5-xmqv-rm74)**
- Severity: HIGH (CVSS 7.5 — AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H)
- CWE-1333: Inefficient Regular Expression Complexity
- Nested `*()` extglobs produce regexps with nested unbounded quantifiers that exhibit catastrophic backtracking in V8
- A 12-byte pattern with an 18-byte non-matching input stalls `minimatch()` for over 7 seconds
- Affects all versions before 3.1.4, 4.2.5, 5.1.8, 6.2.2, 7.4.8, 8.0.6, 9.0.7, 10.2.3
- Source: https://github.com/advisories/GHSA-23c5-xmqv-rm74

**minimatch ReDoS — CVE-2026-27903 (GHSA-7r86-cg39-jmmj)**
- Severity: HIGH
- `matchOne()` performs unbounded recursive backtracking with multiple non-adjacent GLOBSTAR segments
- Source: https://github.com/advisories/GHSA-7r86-cg39-jmmj

**minimatch ReDoS — CVE-2026-26996 (GHSA-3ppc-4f35-3m26)**
- Severity: HIGH (CVSS 7.5)
- Consecutive `*` wildcards compile to separate `[^/]*?` regex groups; V8 backtracks exponentially — O(4^N)
- With N=15 wildcards, a single `minimatch()` call takes ~2 seconds; N=34 hangs indefinitely
- Fixed in version 10.2.1 (also addressed in patch versions for all major lines)
- Source: https://github.com/advisories/GHSA-3ppc-4f35-3m26

**qs arrayLimit Bypass — CVE-2026-2391 (GHSA-w7fw-mjwx-w883)**
- Severity: LOW
- The `arrayLimit` option does not enforce limits for comma-separated values when `comma: true` is enabled
- Attackers can send a single parameter with millions of commas, allocating massive arrays in memory
- Bypass of the `arrayLimit` enforcement, similar to the bracket notation bypass in CVE-2025-15284
- Source: https://github.com/ljharb/qs/security/advisories/GHSA-w7fw-mjwx-w883

### 0.2.3 Vulnerability Classification

| Attribute | minimatch (3 CVEs) | qs (CVE-2026-2391) |
|-----------|---------------------|---------------------|
| **Type** | Regular Expression Denial of Service (ReDoS) | arrayLimit Bypass DoS |
| **Attack vector** | Network | Network |
| **Exploitability** | High — triggered via default API with 12-byte payload | Low — requires `comma: true` option |
| **Impact** | Availability (process hang/crash) | Availability (memory exhaustion) |
| **Root cause** | Unbounded regex quantifiers from glob patterns | Missing limit enforcement in comma-separated parsing |
| **CVSS** | 7.5 (HIGH) | LOW |

### 0.2.4 Web Search Research Conducted

- **Official security advisories reviewed:**
  - https://github.com/advisories/GHSA-23c5-xmqv-rm74 (minimatch nested extglobs)
  - https://github.com/advisories/GHSA-7r86-cg39-jmmj (minimatch GLOBSTAR backtracking)
  - https://github.com/advisories/GHSA-3ppc-4f35-3m26 (minimatch repeated wildcards)
  - https://github.com/ljharb/qs/security/advisories/GHSA-w7fw-mjwx-w883 (qs comma bypass)
  - https://nvd.nist.gov/vuln/detail/CVE-2026-27904
  - https://nvd.nist.gov/vuln/detail/CVE-2026-2391
- **CVE details and patches:** All fixes available via `npm audit fix` — minimatch 3.1.2→3.1.5, 9.0.5→9.0.9; qs 6.14.1→6.15.0
- **Recommended mitigation strategies:**
  - Apply `npm audit fix` for existing dependency vulnerabilities
  - Add `helmet` v8.1.0 for 13 security HTTP response headers
  - Add `cors` v2.8.6 for restrictive CORS policy configuration
  - Add `express-rate-limit` v8.2.1 for IP-based request rate limiting
  - Add `express-validator` v7.3.1 for input validation and sanitization
  - Add HTTPS support via Node.js built-in `https` module with self-signed certificates
- **Alternative solutions considered:**
  - `rate-limiter-flexible` instead of `express-rate-limit` — rejected for simplicity; `express-rate-limit` has 16M+ weekly downloads and native Express integration
  - `Joi` / `Yup` instead of `express-validator` — rejected; `express-validator` is purpose-built for Express middleware chains with 1.3M+ weekly downloads

## 0.3 Security Scope Analysis

### 0.3.1 Affected Component Discovery

A comprehensive search of the repository reveals a minimal project structure with the following files affected by this security hardening initiative:

| File | Security Issue | Discovery Method |
|------|---------------|------------------|
| `server.js` (127 lines) | No security headers, no input validation, no rate limiting, no HTTPS, no CORS — all middleware absent | Direct code review |
| `package.json` | Missing security dependencies (helmet, cors, express-rate-limit, express-validator); vulnerable transitive deps | `npm audit` + code review |
| `package-lock.json` | Locks vulnerable versions: minimatch@9.0.5, minimatch@3.1.2, qs@6.14.1 | `npm audit` |
| `server.test.js` (272 lines) | No security-specific test coverage; needs new tests for headers, CORS, rate limiting, HTTPS | Test gap analysis |
| `README.md` | No security documentation; missing HTTPS, headers, or rate-limiting details | Documentation review |

**Vulnerability affects 5 files across 1 directory (project root).** The repository contains no subdirectory source tree — all application code resides at root level.

### 0.3.2 Root Cause Identification

The vulnerabilities stem from two distinct categories:

**Category 1: Missing Security Middleware (Code-Level)**
The server (`server.js`) was developed as a minimal "Hello World" application without any security considerations:
- Lines 1–10: Only `express` is imported — no security packages
- Lines 12–30: `app` is created without any middleware layering for security
- Lines 32–50: Routes serve plain-text responses with no input validation
- Lines 52–70: Error handling middleware exists but contains no security-specific logic
- The server listens on HTTP only (`127.0.0.1:3000`) with no TLS/SSL support

**Category 2: Transitive Dependency Vulnerabilities**
- `minimatch@9.0.5` — pulled in by `jest@30.2.0` → `@jest/core` → `micromatch` → `picomatch` dependency chain (and transitively via `glob`)
- `minimatch@3.1.2` — pulled in by `jest@30.2.0` → `test-exclude` (locked legacy version)
- `qs@6.14.1` — pulled in by `express@5.2.1` → `qs` (direct dependency of Express)

**Vulnerability propagation trace:**
- Direct usage locations: `server.js` (affected by missing middleware), `package.json` (dependency manifests)
- Indirect dependencies: `minimatch` via jest test infrastructure, `qs` via Express query parsing
- Configuration enablers: No security configuration exists anywhere in the project

### 0.3.3 Current State Assessment

| Component | Current State | Vulnerability |
|-----------|---------------|---------------|
| minimatch (transitive) | v9.0.5, v3.1.2 | HIGH — 3 ReDoS CVEs (CVE-2026-26996, CVE-2026-27903, CVE-2026-27904) |
| qs (transitive) | v6.14.1 | LOW — arrayLimit bypass DoS (CVE-2026-2391) |
| Security headers | None present | CRITICAL — no Content-Security-Policy, no Strict-Transport-Security, no X-Content-Type-Options |
| Input validation | None present | HIGH — routes accept arbitrary query strings and params with no sanitization |
| Rate limiting | None present | HIGH — no protection against brute-force or DoS via request flooding |
| HTTPS | None present | HIGH — all traffic transmitted in plaintext over HTTP |
| CORS | None present | MEDIUM — no cross-origin restrictions; default Express behavior allows all origins |
| Scope of exposure | `127.0.0.1:3000` (loopback only) | Reduced — currently bound to localhost, but easily changed for deployment |

## 0.4 Version Compatibility Research

### 0.4.1 Secure Version Identification

For each vulnerable or missing dependency, the following patched/target versions have been identified:

**Existing Dependency Patches (via `npm audit fix`):**

| Package | Current | First Patched | Recommended | Breaking Changes | Source |
|---------|---------|---------------|-------------|------------------|--------|
| minimatch | 9.0.5 | 9.0.7 (CVE-2026-27903/27904) | 9.0.9 | None — semver patch | GHSA-23c5-xmqv-rm74 |
| minimatch | 3.1.2 | 3.1.4 (CVE-2026-27903/27904) | 3.1.5 | None — semver patch | GHSA-23c5-xmqv-rm74 |
| qs | 6.14.1 | 6.14.2 (CVE-2026-2391) | 6.15.0 | None — semver minor | GHSA-w7fw-mjwx-w883 |

**New Security Package Additions:**

| Package | Target Version | Purpose | Weekly Downloads | Dependencies |
|---------|---------------|---------|-----------------|--------------|
| helmet | 8.1.0 | 13 security HTTP response headers | 2M+ | Zero (standalone) |
| cors | 2.8.6 | CORS policy middleware | 21M+ | object-assign, vary |
| express-rate-limit | 8.2.1 | IP-based rate limiting | 16M+ | Zero (standalone) |
| express-validator | 7.3.1 | Input validation/sanitization | 1.3M+ | validator.js |

### 0.4.2 Compatibility Verification

- **Node.js compatibility:** All packages verified compatible with Node.js v20.20.0 (current runtime)
  - helmet v8.1.0: Requires Node.js 18+ ✅
  - cors v2.8.6: Compatible with all modern Node.js versions ✅
  - express-rate-limit v8.2.1: Requires Node.js 16+ ✅
  - express-validator v7.3.1: Requires Node.js 14+ ✅
- **Express compatibility:** All packages verified compatible with Express 5.2.1
  - helmet v8.1.0: Works with Express 4.x and 5.x (standard Connect middleware) ✅
  - cors v2.8.6: Listed on Express.js official middleware page ✅
  - express-rate-limit v8.2.1: Supports Express 4.x and 5.x ✅
  - express-validator v7.3.1: Verified with Express 4.x, compatible with 5.x via standard req/res interface ✅
- **Inter-package conflicts:** None detected — all packages operate as independent middleware layers
- **`npm audit fix` dry-run confirmation:** Will add 24 packages, change 3 packages — no removals, no breaking changes
- **Alternative packages considered but rejected:** No patch unavailability for any package; all chosen packages are actively maintained with healthy release cadence

## 0.5 Security Fix Design

### 0.5.1 Minimal Fix Strategy

**PRINCIPLE:** Apply the smallest possible change that completely addresses each vulnerability while adding the requested security features. All changes are additive middleware layering — no existing functionality is modified or removed.

**Fix approach:** Combination — dependency updates + security middleware additions + HTTPS transport + configuration hardening

**For dependency vulnerabilities (minimatch, qs):**
- Upgrade minimatch from 9.0.5 → 9.0.9 and 3.1.2 → 3.1.5 via `npm audit fix`
- Upgrade qs from 6.14.1 → 6.15.0 via `npm audit fix`
- Justification: All three patches are semver-compatible; `npm audit fix --dry-run` confirms no breaking changes
- Side effects: None expected — these are patch/minor version bumps in transitive dependencies

**For missing security headers (helmet):**
- Add `helmet` v8.1.0 as a production dependency
- Insert `app.use(helmet())` as the first middleware in the chain, before all route handlers in `server.js`
- This sets 13 HTTP response headers including Content-Security-Policy, Strict-Transport-Security, X-Content-Type-Options, X-Frame-Options, Cross-Origin-Opener-Policy, Cross-Origin-Resource-Policy, Origin-Agent-Cluster, Referrer-Policy, X-DNS-Prefetch-Control, X-Download-Options, X-Permitted-Cross-Domain-Policies, and removes X-Powered-By
- Rationale: OWASP A05:2021 — Security Misconfiguration

**For missing rate limiting (express-rate-limit):**
- Add `express-rate-limit` v8.2.1 as a production dependency
- Configure a global rate limiter: 100 requests per 15-minute window per IP
- Enable `standardHeaders: 'draft-8'` for modern RateLimit response headers
- Disable legacy `X-RateLimit-*` headers with `legacyHeaders: false`
- Rationale: OWASP brute-force prevention; DoS mitigation

**For missing input validation (express-validator):**
- Add `express-validator` v7.3.1 as a production dependency
- Implement query parameter validation and sanitization middleware for existing routes
- Add a reusable validation error handler that returns 400 responses with structured error messages
- Rationale: OWASP A03:2021 — Injection prevention

**For missing CORS configuration (cors):**
- Add `cors` v2.8.6 as a production dependency
- Configure restrictive CORS options: explicit origin allowlist, limited HTTP methods, credentials disabled by default
- Apply as global middleware via `app.use(cors(corsOptions))`
- Rationale: OWASP A05:2021 — Security Misconfiguration; prevent unauthorized cross-origin access

**For missing HTTPS support:**
- Add HTTPS server creation using Node.js built-in `https` and `fs` modules
- Create a self-signed certificate generation script (`generate-cert.sh`) for development environments
- Server will listen on both HTTP (port 3000) and HTTPS (port 3443) simultaneously
- Rationale: OWASP transport security; encrypt all data in transit

### 0.5.2 Security Improvement Validation

- **How each fix eliminates its vulnerability:**
  - `npm audit fix` patches regex patterns in minimatch and enforces arrayLimit in qs, eliminating ReDoS and DoS attack vectors
  - `helmet()` middleware injects 13 protective response headers on every HTTP response, preventing XSS, clickjacking, MIME-sniffing, and information leakage
  - `rateLimit()` middleware caps requests per IP, preventing automated abuse and resource exhaustion
  - `express-validator` chains sanitize and validate all incoming data, blocking injection payloads
  - `cors()` middleware restricts which origins can interact with the API, preventing unauthorized cross-origin data access
  - HTTPS encrypts all request/response data in transit, preventing eavesdropping and man-in-the-middle attacks
- **Verification method:** Automated test suite with security-specific assertions + `npm audit` returning 0 vulnerabilities
- **Rollback plan:** Revert `package.json` and `server.js` to pre-change state; remove new security middleware files; run `npm install` to restore original dependency tree

## 0.6 File Transformation Mapping

### 0.6.1 File-by-File Security Fix Plan

**Security Fix Transformation Modes:**
- **UPDATE** — Update an existing file to patch vulnerability or add security features
- **CREATE** — Create a new file for security improvement
- **DELETE** — Remove a file that introduces vulnerability
- **REFERENCE** — Use as an example for security patterns

| Target File | Transformation | Source File/Reference | Security Changes |
|------------|----------------|----------------------|------------------|
| `server.js` | UPDATE | `server.js` | Add helmet, cors, express-rate-limit, express-validator middleware; add HTTPS server creation with `https` and `fs` modules; restructure middleware ordering for security-first layering |
| `package.json` | UPDATE | `package.json` | Add 4 new production dependencies: helmet@^8.1.0, cors@^2.8.6, express-rate-limit@^8.2.1, express-validator@^7.3.1 |
| `package-lock.json` | UPDATE | `package-lock.json` | Auto-regenerated by `npm install` and `npm audit fix`; locks minimatch@9.0.9, minimatch@3.1.5, qs@6.15.0, plus new security packages |
| `server.test.js` | UPDATE | `server.test.js` | Add security-specific test cases: verify helmet headers present, verify CORS headers, verify rate-limit headers, verify 429 on rate limit exceeded, verify input validation error responses |
| `generate-cert.sh` | CREATE | — | Bash script to generate self-signed TLS certificates (key.pem, cert.pem) for HTTPS development support using OpenSSL |
| `certs/.gitkeep` | CREATE | — | Directory placeholder for TLS certificate storage; actual certs excluded via .gitignore |
| `.gitignore` | CREATE | — | Ignore generated certificates (`certs/*.pem`), node_modules, and environment files |
| `README.md` | UPDATE | `README.md` | Add security features documentation: HTTPS setup, helmet headers, CORS policy, rate limiting, input validation, certificate generation instructions |

### 0.6.2 Code Change Specifications

**File: `server.js` — Lines 1–127 (comprehensive restructure)**

- **Lines 1–5 (imports):** Currently imports only `express`. After fix, will also import `helmet`, `cors`, `rateLimit` from `express-rate-limit`, `query` and `validationResult` from `express-validator`, and Node.js built-in `https` and `fs` modules
  - Before state: `const express = require('express');` is the only import
  - After state: Six additional require statements for security packages and HTTPS support
  - Security improvement: All security middleware becomes available for use

- **Lines 12–20 (app creation and middleware):** Currently creates bare Express app with no middleware
  - Before state: `const app = express();` followed directly by route definitions
  - After state: Security middleware chain inserted before routes in this exact order:
    1. `app.use(helmet())` — security headers (must be first)
    2. `app.use(cors(corsOptions))` — CORS policy enforcement
    3. `app.use(rateLimit(rateLimitConfig))` — rate limiting
  - Security improvement: Every response now includes 13+ protective headers, CORS restrictions, and rate limits

- **Lines 32–50 (route handlers):** Currently serve plain-text responses with no validation
  - Before state: `app.get('/', ...)` and `app.get('/evening', ...)` with no input checking
  - After state: Routes wrapped with `express-validator` query parameter validation and sanitization middleware; validation error handler returns 400 for invalid inputs
  - Security improvement: Eliminates injection attack surface on route parameters and query strings

- **Lines 95–127 (server startup):** Currently creates HTTP server only
  - Before state: `app.listen(PORT, HOST, ...)` on HTTP port 3000
  - After state: Both HTTP and HTTPS servers created; HTTPS server on port 3443 using `https.createServer({ key, cert }, app)`; graceful conditional — if cert files exist, start HTTPS; always start HTTP
  - Security improvement: Adds encrypted transport channel for all data in transit

**File: `server.test.js` — Lines 1–272 (additive test cases)**

- Before state: 19 tests covering routes, 404 handling, content-type, server exports, graceful shutdown, and error handling — no security assertions
- After state: ~10 additional test cases appended covering:
  - Helmet headers present on all responses (Content-Security-Policy, X-Content-Type-Options, etc.)
  - X-Powered-By header removed
  - CORS headers present (Access-Control-Allow-Origin)
  - Rate-limit headers present (RateLimit-Policy, RateLimit)
  - 429 Too Many Requests response when rate limit exceeded
  - Input validation error response (400) for malicious query parameters
- Security improvement: Automated regression testing ensures security features cannot be silently removed

### 0.6.3 Configuration Change Specifications

**File: `package.json` — Dependencies section**

| Setting | Current Value | New Value | Security Rationale |
|---------|---------------|-----------|-------------------|
| `dependencies.express` | `^5.2.1` | `^5.2.1` (unchanged) | Already on latest v5 |
| `dependencies.helmet` | (absent) | `^8.1.0` | Adds 13 HTTP security headers per OWASP guidelines |
| `dependencies.cors` | (absent) | `^2.8.6` | Enforces cross-origin access control policies |
| `dependencies.express-rate-limit` | (absent) | `^8.2.1` | Prevents brute-force and DoS attacks via IP-based rate limiting |
| `dependencies.express-validator` | (absent) | `^7.3.1` | Validates and sanitizes all incoming request data against injection |

**File: `generate-cert.sh` — New file**

- Creates self-signed TLS certificate and private key for development HTTPS support
- Outputs `certs/key.pem` and `certs/cert.pem` with 365-day validity
- Uses `openssl req -x509 -newkey rsa:2048 -nodes` with automated subject fields
- Security rationale: Enables HTTPS testing without requiring a Certificate Authority

## 0.7 Dependency Inventory

### 0.7.1 Security Patches and Updates

All security-critical package updates required for this fix:

| Registry | Package Name | Current | Patched To | CVE/Advisory | Severity |
|----------|--------------|---------|------------|--------------|----------|
| npm | minimatch | 9.0.5 | 9.0.9 | CVE-2026-26996 / GHSA-3ppc-4f35-3m26, CVE-2026-27903 / GHSA-7r86-cg39-jmmj, CVE-2026-27904 / GHSA-23c5-xmqv-rm74 | HIGH |
| npm | minimatch | 3.1.2 | 3.1.5 | CVE-2026-27903 / GHSA-7r86-cg39-jmmj, CVE-2026-27904 / GHSA-23c5-xmqv-rm74 | HIGH |
| npm | qs | 6.14.1 | 6.15.0 | CVE-2026-2391 / GHSA-w7fw-mjwx-w883 | LOW |

**New security dependencies to install:**

| Registry | Package Name | Version | Purpose | Advisory |
|----------|--------------|---------|---------|----------|
| npm | helmet | 8.1.0 | HTTP security response headers (13 headers) | Proactive — OWASP A05:2021 |
| npm | cors | 2.8.6 | Cross-origin resource sharing policy middleware | Proactive — OWASP A05:2021 |
| npm | express-rate-limit | 8.2.1 | IP-based request rate limiting | Proactive — DoS/brute-force prevention |
| npm | express-validator | 7.3.1 | Input validation and sanitization middleware | Proactive — OWASP A03:2021 |

### 0.7.2 Dependency Chain Analysis

- **Direct dependencies requiring updates:** None — all vulnerability patches are in transitive dependencies resolved by `npm audit fix`
- **Transitive dependencies affected:**
  - `minimatch@9.0.5` → patched to `9.0.9` (pulled by `jest@30.2.0` → `@jest/core` → `glob`/`micromatch`)
  - `minimatch@3.1.2` → patched to `3.1.5` (pulled by `jest@30.2.0` → `test-exclude`)
  - `qs@6.14.1` → patched to `6.15.0` (pulled by `express@5.2.1` directly)
- **Peer dependencies to verify:**
  - `helmet@8.1.0` — no peer dependencies (zero-dependency package)
  - `cors@2.8.6` — no peer dependencies; depends on `object-assign` and `vary` (both stable)
  - `express-rate-limit@8.2.1` — no peer dependencies (zero-dependency package)
  - `express-validator@7.3.1` — depends on `validator` (string validation library); no Express peer dep required
- **Development dependencies with vulnerabilities:**
  - `jest@30.2.0` — not directly vulnerable, but its transitive dependency `minimatch` is; patched via `npm audit fix`
  - `supertest@7.2.2` — no known vulnerabilities

### 0.7.3 Import and Reference Updates

**Source files requiring import additions (not updates — all are new imports):**

- `server.js` — Add the following require statements at the top of the file:
  - `const helmet = require('helmet');`
  - `const cors = require('cors');`
  - `const { rateLimit } = require('express-rate-limit');`
  - `const { query, validationResult } = require('express-validator');`
  - `const https = require('https');`
  - `const fs = require('fs');`

**No import transformation rules needed** — this is a greenfield security middleware addition, not a package replacement. All existing imports remain unchanged.

**Configuration reference updates:**
- `package.json` `dependencies` object gains 4 new entries
- `package-lock.json` regenerated to reflect all new and patched packages
- No environment variable changes required
- No documentation references to old package names need updating

## 0.8 Impact Analysis and Testing Strategy

### 0.8.1 Security Testing Requirements

**Vulnerability regression tests:**

- Verify that `npm audit` returns **0 vulnerabilities** after applying `npm audit fix`
- Verify that minimatch ReDoS patterns no longer cause process hangs (patched regex patterns)
- Verify that qs `arrayLimit` is enforced for comma-separated values (patch in 6.15.0)

**Specific attack scenarios to test:**

| Scenario | Expected Behavior | Test Method |
|----------|-------------------|-------------|
| Request without security headers | All 13 helmet headers present in response | Supertest assertion on response headers |
| X-Powered-By header leak | Header absent from all responses | Assert `X-Powered-By` is undefined |
| Cross-origin request from unauthorized origin | CORS headers restrict access per configured policy | Supertest with `Origin` header set to unauthorized domain |
| Rapid request flooding (>100 in 15 min window) | 429 Too Many Requests response returned | Supertest loop exceeding rate limit threshold |
| Malicious query parameter injection | 400 Bad Request with validation errors | Supertest with XSS/SQL injection payloads in query string |
| HTTPS certificate availability check | Server starts HTTPS if certs exist, HTTP-only if absent | Conditional test based on cert file presence |

**Security-specific test cases to add to `server.test.js`:**

- `describe('Security Headers')` — verify Content-Security-Policy, X-Content-Type-Options, Strict-Transport-Security, X-Frame-Options on GET / response
- `describe('CORS Policy')` — verify Access-Control-Allow-Origin header behavior with allowed and disallowed origins
- `describe('Rate Limiting')` — verify RateLimit headers present; verify 429 response after exceeding limit
- `describe('Input Validation')` — verify 400 response for invalid/malicious query parameters; verify clean input passes through

**Existing tests to verify (all 19 must continue passing):**
- `GET /` returns "Hello, World!\n" with 200 status
- `GET /evening` returns "Good evening\n" with 200 status
- Unknown routes return 404
- Content-Type is text/html for valid routes
- Server exports `app` and `server` correctly
- Graceful shutdown on SIGTERM works
- Error handling middleware catches and logs errors

### 0.8.2 Verification Methods

**Automated security scanning:**
- Tool: `npm audit`
- Command: `npm audit --audit-level=low`
- Expected result: "found 0 vulnerabilities"

**Full test suite execution:**
- Command: `CI=true npx jest --watchAll=false --ci --maxWorkers=2`
- Expected result: All existing 19 tests pass + all new security tests pass
- Baseline: 19 tests, 1 suite, 0.643s (recorded pre-change)

**Manual verification steps:**
- Start server with `node server.js`
- `curl -sI http://127.0.0.1:3000/` and inspect response headers for helmet headers
- `curl -sI http://127.0.0.1:3000/ -H "Origin: http://malicious.example.com"` and verify CORS rejection
- Rapid-fire requests to verify rate limiting kicks in: `for i in $(seq 1 105); do curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/; done`

### 0.8.3 Impact Assessment

**Direct security improvements achieved:**
- 3 minimatch ReDoS vulnerabilities (CVE-2026-26996, CVE-2026-27903, CVE-2026-27904) eliminated
- 1 qs DoS vulnerability (CVE-2026-2391) eliminated
- 13 HTTP security headers added to every response (via helmet)
- IP-based rate limiting protects all endpoints against request flooding
- Input validation and sanitization prevents injection attacks on query parameters
- CORS policy restricts unauthorized cross-origin API access
- HTTPS transport encryption available for development and production

**Minimal side effects on existing functionality:**
- No breaking changes to public APIs — `GET /` and `GET /evening` return identical responses
- All 19 existing tests continue to pass unchanged
- Internal changes confined to middleware layering in `server.js`
- Server startup behavior unchanged for HTTP; HTTPS is additive and conditional on certificate presence

**Potential impacts to address:**
- Rate limiting may affect automated test runners making rapid sequential requests — mitigated by configuring test environment to skip rate limiting or use high limits
- Helmet's Content-Security-Policy default blocks inline scripts — acceptable for this API-only server with no HTML views
- CORS restrictive policy may block legitimate cross-origin consumers if not configured with correct origins — documentation will include instructions for customization

## 0.9 Scope Boundaries

### 0.9.1 Exhaustively In Scope

**Vulnerable dependency manifests:**
- `package.json` — add 4 new security dependencies, trigger `npm audit fix`
- `package-lock.json` — regenerated to lock patched and new packages

**Source files requiring security middleware integration:**
- `server.js` — primary application file receiving all security middleware additions

**Test files requiring security coverage:**
- `server.test.js` — existing test file extended with security-specific test cases

**New files for security infrastructure:**
- `generate-cert.sh` — self-signed TLS certificate generation script
- `certs/.gitkeep` — certificate directory placeholder
- `.gitignore` — ignore generated certificates and sensitive files

**Documentation updates:**
- `README.md` — security features section, HTTPS setup instructions, rate-limiting and CORS configuration notes

**Dependency vulnerability patches (via `npm audit fix`):**
- `node_modules/minimatch` (9.0.5 → 9.0.9)
- `node_modules/test-exclude/node_modules/minimatch` (3.1.2 → 3.1.5)
- `node_modules/qs` (6.14.1 → 6.15.0)

### 0.9.2 Explicitly Out of Scope

- **Feature additions unrelated to security:** No new routes, no new business logic, no API expansions
- **Performance optimizations:** No profiling, benchmarking, or performance-related code changes
- **Code refactoring beyond security fix requirements:** No restructuring of existing route handlers, error middleware, or shutdown logic beyond what is needed to insert security middleware
- **Non-vulnerable dependencies:** `express@5.2.1` is not being upgraded; `jest@30.2.0` and `supertest@7.2.2` versions are not changing (only their transitive deps are patched)
- **Style or formatting changes:** No linting, formatting, or code-style modifications to existing code
- **Test files unrelated to security validation:** Existing 19 tests are not modified — only new security test cases are appended
- **The `main` field inconsistency:** `package.json` lists `main: "index.js"` while the actual entrypoint is `server.js` — this is noted but explicitly out of scope for this security fix
- **Production certificate procurement:** Only self-signed certificates for development; production TLS certificate setup (e.g., Let's Encrypt, ACM) is out of scope
- **External store for rate limiting:** The default in-memory store is used; Redis or other external stores for distributed rate limiting are out of scope
- **`blitzy/` documentation folder:** The `blitzy/documentation/` directory containing `Technical Specifications.md` and `Project Guide.md` is not modified by this security fix
- **CI/CD pipeline changes:** No GitHub Actions, CI workflows, or deployment automation is added or modified

## 0.10 Execution Parameters

### 0.10.1 Security Verification Commands

| Purpose | Command | Expected Result |
|---------|---------|-----------------|
| Dependency vulnerability scan | `npm audit --audit-level=low` | "found 0 vulnerabilities" |
| Apply dependency patches | `npm audit fix` | minimatch and qs upgraded to patched versions |
| Install new security packages | `npm install helmet cors express-rate-limit express-validator --save` | 4 packages added to dependencies |
| Security test execution | `CI=true npx jest --watchAll=false --ci --maxWorkers=2` | All tests pass (existing 19 + new security tests) |
| Full test suite validation | `CI=true npx jest --watchAll=false --ci --verbose` | Verbose output confirms each test case name and status |
| Verify helmet headers | `curl -sI http://127.0.0.1:3000/ \| grep -iE "content-security-policy\|x-content-type\|strict-transport"` | Headers present in response |
| Verify rate limiting active | `curl -sI http://127.0.0.1:3000/ \| grep -i "ratelimit"` | RateLimit headers present |
| Generate self-signed certs | `bash generate-cert.sh` | Creates `certs/key.pem` and `certs/cert.pem` |

### 0.10.2 Research Documentation

**Security advisories consulted:**
- GHSA-3ppc-4f35-3m26 — minimatch ReDoS via repeated wildcards (https://github.com/advisories/GHSA-3ppc-4f35-3m26)
- GHSA-7r86-cg39-jmmj — minimatch ReDoS via matchOne() backtracking (https://github.com/advisories/GHSA-7r86-cg39-jmmj)
- GHSA-23c5-xmqv-rm74 — minimatch ReDoS via nested extglobs (https://github.com/advisories/GHSA-23c5-xmqv-rm74)
- GHSA-w7fw-mjwx-w883 — qs arrayLimit bypass via comma parsing (https://github.com/ljharb/qs/security/advisories/GHSA-w7fw-mjwx-w883)
- GHSA-6rw7-vpxm-498p — qs arrayLimit bypass via bracket notation (https://github.com/advisories/GHSA-6rw7-vpxm-498p)

**CVE numbers referenced:**
- CVE-2026-26996, CVE-2026-27903, CVE-2026-27904 (minimatch)
- CVE-2026-2391, CVE-2025-15284 (qs)

**Security best practices followed:**
- OWASP A03:2021 — Injection: Input validation via express-validator
- OWASP A05:2021 — Security Misconfiguration: Security headers via helmet, CORS via cors package
- OWASP Transport Layer Security recommendations: HTTPS via Node.js built-in https module
- OWASP Brute-Force Prevention: Rate limiting via express-rate-limit

**Package documentation consulted:**
- Helmet.js official docs: https://helmetjs.github.io/
- Express CORS middleware: https://expressjs.com/en/resources/middleware/cors.html
- express-rate-limit docs: https://express-rate-limit.mintlify.app/overview
- express-validator docs: https://express-validator.github.io/docs/

### 0.10.3 Implementation Constraints

- **Priority:** Security fix first, minimal disruption second
- **Backward compatibility:** Must maintain — all existing 19 tests must pass; GET / and GET /evening response content is unchanged
- **Deployment considerations:** Immediate — no coordination required; changes are additive middleware that work on first deployment
- **Middleware ordering:** Security middleware must be applied in the correct order: helmet → cors → rateLimit → routes → error handlers
- **HTTPS conditionality:** HTTPS server creation is conditional on certificate file existence — server starts HTTP-only if certs are missing, preventing startup failures in environments without certificates

## 0.11 Special Instructions for Security Fixes

### 0.11.1 Security-Specific Requirements

The following directives govern the scope and behavior of all security changes:

- **Change scope:** ONLY make changes necessary for the security fix — no unrelated refactoring, feature additions, or style changes
- **Do not refactor unrelated code:** Existing route handlers, error middleware, graceful shutdown logic, and 404 catch-all in `server.js` must remain structurally identical; security middleware is inserted before these existing blocks
- **Do not update non-vulnerable dependencies:** `express@5.2.1`, `jest@30.2.0`, and `supertest@7.2.2` versions remain unchanged; only transitive dependency patches via `npm audit fix` are applied
- **Preserve all existing functionality:** The two GET routes (`/` and `/evening`) must return identical response bodies and status codes; existing 19 tests must pass without modification
- **Follow principle of least privilege:** Rate limiting uses restrictive defaults (100 requests/15 min); CORS restricts origins rather than using wildcards; helmet enables all protective headers by default
- **Maintain audit trail:** All security changes are traceable through `package.json` dependency additions, `package-lock.json` version changes, and `server.js` middleware insertions
- **Security middleware ordering is critical:** helmet must execute before all other middleware to ensure headers are set on every response, including error responses; rate limiting must execute before route handlers to protect against request flooding before any processing occurs

### 0.11.2 Secrets and Credentials Management

- Self-signed TLS certificates generated by `generate-cert.sh` are for development use only and must NEVER be committed to version control
- `.gitignore` must include `certs/*.pem` to prevent accidental certificate/key exposure
- No API keys, tokens, or credentials are introduced by this security fix
- Production environments should use properly issued certificates from a Certificate Authority

### 0.11.3 Breaking Change Justification

No breaking changes are introduced by this security fix. All modifications are additive:
- New middleware is layered before existing route handlers without modifying them
- New dependencies are added to `package.json` without changing existing dependency versions
- New test cases are appended to `server.test.js` without modifying existing test assertions
- HTTPS server creation is conditional and does not affect HTTP server operation
- Rate limiting may cause 429 responses for clients exceeding the configured threshold — this is intentional security behavior, not a breaking change

