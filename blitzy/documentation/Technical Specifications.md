# Technical Specification

# 0. Agent Action Plan

## 0.1 Executive Summary

Based on the bug description, the Blitzy platform understands that the bug is **a lack of robust HTTP request processing features in server.js**, specifically:

- **Missing Error Handling**: No custom error handling middleware to catch and format application errors, resulting in default HTML error pages
- **No Graceful Shutdown**: No signal handlers (SIGTERM/SIGINT) for clean server termination, risking connection interruption and resource leaks
- **No Input Validation Framework**: While the current routes are simple and don't require input validation, no foundation exists for future expansion
- **No Resource Cleanup**: No mechanism to properly release server resources during shutdown
- **Missing 404 Handler**: Non-existent routes return default Express HTML error pages instead of consistent plain text responses

#### Technical Failure Analysis

The original `server.js` consists of only 18 lines of code that:
1. Creates an Express 5.x application
2. Defines two GET routes (`/` and `/evening`)
3. Starts the server on port 3000 without capturing the server reference

**Specific Error Types Identified:**
- **Configuration Gap**: `app.listen()` return value (server object) was discarded
- **Missing Middleware**: No error-handling middleware (4-parameter function) registered
- **No Signal Handling**: No `process.on()` handlers for SIGTERM, SIGINT, uncaughtException, or unhandledRejection

#### Reproduction Steps

```bash
# Start the original server

node server.js

#### Test 1: Access non-existent route

curl http://127.0.0.1:3000/nonexistent
# Result: Returns HTML error page (not plain text)

#### Test 2: Terminate with Ctrl+C

#### Result: Abrupt termination with no cleanup messaging

```



## 0.2 Root Cause Identification

Based on research, THE root cause(s) are:

#### Root Cause 1: Missing Server Reference Capture

- **Located in**: `server.js`, line 16
- **Triggered by**: Calling `app.listen()` without storing the return value
- **Evidence**: Original code `app.listen(port, hostname, () => {...})` discards the server object
- **This is definitive because**: Without the server object reference, `server.close()` cannot be called for graceful shutdown

#### Root Cause 2: No Error Handling Middleware

- **Located in**: `server.js` - absent after routes (lines 8-14)
- **Triggered by**: Any thrown error or `next(err)` call in route handlers
- **Evidence**: Express requires a 4-parameter middleware `(err, req, res, next)` to catch errors
- **This is definitive because**: Express official documentation states error-handling middleware must have exactly 4 arguments

#### Root Cause 3: No 404 Handler

- **Located in**: `server.js` - absent after routes
- **Triggered by**: Any request to undefined routes
- **Evidence**: Testing `/nonexistent` returns Express default HTML 404 page
- **This is definitive because**: Express uses catch-all middleware pattern for custom 404 responses

#### Root Cause 4: No Process Signal Handlers

- **Located in**: `server.js` - absent entirely
- **Triggered by**: SIGTERM/SIGINT signals from process managers or Ctrl+C
- **Evidence**: No `process.on('SIGTERM', ...)` or `process.on('SIGINT', ...)` registered
- **This is definitive because**: Node.js documentation confirms these must be explicitly registered

#### Root Cause 5: No Global Exception Handlers

- **Located in**: `server.js` - absent entirely
- **Triggered by**: Uncaught synchronous exceptions or unhandled promise rejections
- **Evidence**: No `process.on('uncaughtException', ...)` or `process.on('unhandledRejection', ...)` registered
- **This is definitive because**: Without these handlers, uncaught errors crash the process without logging



## 0.3 Diagnostic Execution

#### Code Examination Results

**File analyzed**: `server.js`
**Problematic code block**: Lines 1-18 (entire file)
**Specific failure points**:
- Line 16: `app.listen()` return value not captured
- After Line 14: No 404 middleware
- After Line 14: No error middleware
- Global scope: No process signal handlers

**Execution flow leading to issues**:
1. Server starts → Express app created → Routes defined → Server starts listening
2. Unknown request arrives → No matching route → Express default 404 HTML response
3. Error thrown in route → No error middleware → Express default HTML error
4. SIGTERM received → No handler → Abrupt termination without cleanup

#### Repository Analysis Findings

| Tool Used | Command Executed | Finding | File:Line |
|-----------|-----------------|---------|-----------|
| read_file | `cat -n server.js` | Only 18 lines, minimal implementation | server.js:1-18 |
| read_file | `cat package.json` | Express 5.2.1 dependency confirmed | package.json |
| bash | `curl http://127.0.0.1:3000/nonexistent` | Returns HTML 404 page | N/A |
| bash | `node --version` | Node v20.20.0 (compatible with >=18) | N/A |

#### Web Search Findings

**Search queries executed**:
- "Express.js 5 error handling middleware best practices"
- "Node.js Express graceful shutdown SIGTERM signal handler"
- "Node.js uncaughtException unhandledRejection process handling"
- "Express.js app.listen server reference resource cleanup"

**Web sources referenced**:
- expressjs.com/en/guide/error-handling.html (official Express docs)
- expressjs.com/en/advanced/healthcheck-graceful-shutdown.html (official Express docs)
- nodejs.org/api/process.html (official Node.js docs)
- dev.to, Medium, Better Stack (community best practices)

**Key findings incorporated**:
1. Express 5 automatically catches Promise rejections in async route handlers
2. Error-handling middleware requires exactly 4 parameters `(err, req, res, next)`
3. Graceful shutdown requires capturing server reference and calling `server.close()`
4. SIGTERM handler is essential for container orchestration (Docker, Kubernetes)
5. Shutdown timeout prevents hanging during graceful shutdown

#### Fix Verification Analysis

**Steps followed to reproduce bug**:
1. Started original server with `node server.js`
2. Tested 404 response: `curl http://127.0.0.1:3000/nonexistent` → HTML page
3. Terminated with Ctrl+C → No cleanup messaging

**Confirmation tests used to ensure bug was fixed**:
1. All 19 Jest unit tests pass
2. Integration test: 404 returns "Not Found" with HTTP 404
3. Integration test: SIGTERM triggers graceful shutdown sequence
4. Process exits with code 0 after cleanup

**Boundary conditions and edge cases covered**:
- Deeply nested non-existent routes (`/a/b/c/d/e`)
- Unsupported HTTP methods on existing routes (POST `/`)
- Multiple simultaneous shutdown signals (prevented with `isShuttingDown` flag)
- Shutdown timeout (10 seconds) for hung connections

**Verification confidence level**: 95%



## 0.4 Bug Fix Specification

#### The Definitive Fix

**Files to modify**: `server.js`

**Summary of changes**:
The fix transforms `server.js` from 18 lines to 147 lines by adding:
- 404 handler middleware
- Error handling middleware
- Server reference capture
- Graceful shutdown function
- SIGTERM/SIGINT signal handlers
- uncaughtException/unhandledRejection handlers
- Module exports for testing

#### Change Instructions

**1. Add shutdown tracking flag (after line 6)**
```javascript
// INSERT after const app = express();
let isShuttingDown = false;
```
This prevents multiple simultaneous shutdown attempts if signals arrive in rapid succession.

**2. Add 404 handler (after routes, before error handler)**
```javascript
// INSERT after existing routes
app.use((req, res) => {
  res.status(404).type('text/plain').send('Not Found\n');
});
```
This catches all unmatched routes and returns a consistent plain text 404 response.

**3. Add error handling middleware (after 404 handler)**
```javascript
// INSERT after 404 handler
app.use((err, req, res, next) => {
  console.error('Error occurred:', err.stack || err.message || err);
  const statusCode = err.status || err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production' 
    ? 'Internal Server Error' 
    : err.message || 'Internal Server Error';
  res.status(statusCode).type('text/plain').send(`${message}\n`);
});
```
This catches all errors from routes and returns formatted error responses with appropriate status codes.

**4. Capture server reference (modify line 16)**
```javascript
// MODIFY from: app.listen(port, hostname, () => {...});
// MODIFY to:
const server = app.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});
```
This stores the server reference required for graceful shutdown.

**5. Add graceful shutdown function**
```javascript
// INSERT after server.listen
function gracefulShutdown(signal) {
  if (isShuttingDown) {
    console.log('Shutdown already in progress...');
    return;
  }
  isShuttingDown = true;
  console.log(`\n${signal} signal received: starting graceful shutdown`);
  server.close((err) => {
    if (err) {
      console.error('Error during server close:', err);
      process.exit(1);
    }
    console.log('HTTP server closed');
    console.log('Cleanup complete, exiting process');
    process.exit(0);
  });
  const SHUTDOWN_TIMEOUT = 10000;
  setTimeout(() => {
    console.error(`Forced shutdown after ${SHUTDOWN_TIMEOUT}ms timeout`);
    process.exit(1);
  }, SHUTDOWN_TIMEOUT);
}
```
This provides coordinated shutdown with timeout protection.

**6. Add signal handlers**
```javascript
// INSERT after gracefulShutdown function
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
```
These handle process manager signals and Ctrl+C respectively.

**7. Add exception handlers**
```javascript
// INSERT after signal handlers
process.on('uncaughtException', (err, origin) => {
  console.error('Uncaught Exception:', err);
  console.error('Exception origin:', origin);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise);
  console.error('Reason:', reason);
});
```
These provide last-resort error handling for unexpected failures.

**8. Add module exports**
```javascript
// INSERT at end of file
module.exports = { app, server };
```
This enables unit testing of the server.

#### Fix Validation

**Test command to verify fix**:
```bash
npm test
```

**Expected output after fix**:
```
Test Suites: 1 passed, 1 total
Tests:       19 passed, 19 total
```

**Confirmation method**:
- All 19 unit tests pass
- Integration test shows correct 404 responses
- Integration test confirms graceful shutdown sequence



## 0.5 Scope Boundaries

#### Changes Required (EXHAUSTIVE LIST)

| File | Lines | Specific Change |
|------|-------|-----------------|
| `server.js` | Line 8 | INSERT: `isShuttingDown` flag variable |
| `server.js` | Lines 23-29 | INSERT: 404 handler middleware |
| `server.js` | Lines 31-50 | INSERT: Error handling middleware |
| `server.js` | Line 56 | MODIFY: Capture server reference with `const server = app.listen(...)` |
| `server.js` | Lines 60-104 | INSERT: `gracefulShutdown()` function |
| `server.js` | Lines 106-114 | INSERT: SIGTERM/SIGINT signal handlers |
| `server.js` | Lines 116-128 | INSERT: uncaughtException handler |
| `server.js` | Lines 130-141 | INSERT: unhandledRejection handler |
| `server.js` | Line 147 | INSERT: Module exports |
| `server.test.js` | New file | CREATE: 19 comprehensive unit tests |
| `package.json` | `scripts.test` | MODIFY: Update test script to use Jest |
| `package.json` | `devDependencies` | ADD: supertest, jest |

**No other files require modification.**

#### Explicitly Excluded

**Do not modify:**
- `README.md` - Documentation updates are outside bug fix scope
- `package-lock.json` - Will auto-update when dependencies are installed
- Any other files not listed above

**Do not refactor:**
- Existing route handlers (`/` and `/evening`) - Working correctly
- Existing hostname/port configuration - Working correctly
- Console.log statements - Appropriate for this application scale

**Do not add:**
- Input validation middleware - Not needed for current routes (no user input)
- Rate limiting - Outside scope of error handling bug fix
- Request logging middleware - Outside scope of error handling bug fix
- Health check endpoint - Outside scope (though commonly paired with graceful shutdown)
- HTTPS support - Outside scope of this bug fix
- Environment variable configuration - Outside scope of this bug fix



## 0.6 Verification Protocol

#### Bug Elimination Confirmation

**Execute test suite**:
```bash
npm test
```

**Verify output matches**:
```
PASS ./server.test.js
  Server Routes
    GET /
      ✓ should return "Hello, World!" with status 200
    GET /evening
      ✓ should return "Good evening" with status 200
  404 Error Handling
    ✓ should return 404 for non-existent routes
    ✓ should return 404 for non-existent POST routes
    ✓ should return 404 for deeply nested non-existent routes
    ✓ should return 404 for unsupported HTTP methods on existing routes
  Content Type Handling
    ✓ should return plain text content type for root
    ✓ should return plain text content type for 404
  Server Exports
    ✓ should export app object
    ✓ should export server object
  Graceful Shutdown Setup
    ✓ should have SIGTERM handler registered
    ✓ should have SIGINT handler registered
    ✓ should have uncaughtException handler registered
    ✓ should have unhandledRejection handler registered
  Error Handling Middleware Pattern
    ✓ should catch synchronous errors and return 500
    ✓ should catch async errors and return 500
    ✓ should respect custom status codes on errors
    ✓ should allow normal routes to work
    ✓ should return plain text content type for errors

Test Suites: 1 passed, 1 total
Tests:       19 passed, 19 total
```

**Confirm error no longer appears**:
```bash
# Before fix: HTML error page

#### After fix: Plain text response

curl -s http://127.0.0.1:3000/nonexistent
#### Expected: "Not Found"

```

**Validate graceful shutdown**:
```bash
node server.js &
SERVER_PID=$!
sleep 2
kill -SIGTERM $SERVER_PID
# Expected output:

#### SIGTERM signal received: starting graceful shutdown

#### HTTP server closed

#### Cleanup complete, exiting process

```

#### Regression Check

**Run existing test suite**:
```bash
npm test
```

**Verify unchanged behavior**:
- GET `/` still returns "Hello, World!"
- GET `/evening` still returns "Good evening"
- Server still binds to 127.0.0.1:3000

**Confirm performance characteristics**:
- Server startup time: < 1 second (unchanged)
- Route response time: < 10ms (unchanged)
- Graceful shutdown time: < 10 seconds (new timeout)



## 0.7 Execution Requirements

#### Research Completeness Checklist

✓ Repository structure fully mapped
- `server.js` - Main application file (analyzed)
- `package.json` - Dependencies and scripts (analyzed)
- `package-lock.json` - Lock file (generated)
- `README.md` - Documentation (read)

✓ All related files examined with retrieval tools
- Used `read_file` on server.js, package.json, README.md
- Used `get_source_folder_contents` on repository root
- Used bash commands for file inspection and testing

✓ Bash analysis completed for patterns/dependencies
- Verified Node.js version: v20.20.0
- Verified Express version: 5.2.1
- Tested endpoints with curl
- Tested graceful shutdown with kill signals

✓ Root cause definitively identified with evidence
- 5 specific root causes documented
- Each with file location, trigger condition, and evidence
- All confirmed through testing

✓ Single solution determined and validated
- Comprehensive fix implemented
- 19 unit tests pass
- Integration tests successful

#### Fix Implementation Rules

**Make the exact specified change only:**
- All changes are documented in section 0.4
- No additional features beyond error handling scope

**Zero modifications outside the bug fix:**
- No changes to existing route logic
- No changes to hostname/port configuration
- No unnecessary code reorganization

**No interpretation or improvement of working code:**
- Existing routes preserved exactly
- Only additions to fill identified gaps

**Preserve all whitespace and formatting except where changed:**
- New code follows existing indentation (2 spaces)
- Comments use same style as would be typical for the codebase
- Line endings consistent

#### Dependencies Added

| Package | Version | Purpose |
|---------|---------|---------|
| jest | ^29.x | Unit testing framework |
| supertest | ^7.x | HTTP assertion library for testing Express apps |

These are development dependencies only and do not affect production runtime.



## 0.8 References

#### Files and Folders Searched

| Path | Type | Purpose |
|------|------|---------|
| `/` (repository root) | Folder | Initial repository structure discovery |
| `server.js` | File | Main application - primary analysis target |
| `package.json` | File | Dependencies and configuration |
| `package-lock.json` | File | Dependency lock verification |
| `README.md` | File | Project documentation |

#### Web Sources Referenced

| Source | Topic | Key Contribution |
|--------|-------|------------------|
| expressjs.com/en/guide/error-handling.html | Express Error Handling | Error middleware pattern with 4 parameters |
| expressjs.com/en/advanced/healthcheck-graceful-shutdown.html | Graceful Shutdown | `server.close()` pattern for SIGTERM handling |
| nodejs.org/api/process.html | Process Events | `uncaughtException` and `unhandledRejection` event handling |
| dev.to (multiple articles) | Best Practices | Community patterns for Node.js graceful shutdown |
| Medium (multiple articles) | Best Practices | Global error handler implementation patterns |
| Better Stack Community | Error Handling | Express 5 automatic Promise rejection handling |
| GeeksforGeeks | Express Methods | `app.listen()` behavior and return values |

#### Attachments Provided

No attachments were provided for this project.

#### Figma Screens Provided

No Figma screens were provided for this project.

#### Commands Executed for Analysis

```bash
# Repository structure discovery

find /workspace -name ".blitzyignore" 2>/dev/null
ls -la

#### File content analysis

cat -n server.js
cat package.json
cat README.md
head -100 package-lock.json | grep -E '"node"|"engines"' -A 2

#### Environment verification

node --version && npm --version

#### Dependency installation

npm install

#### Server testing

node server.js &
curl -s http://127.0.0.1:3000/
curl -s http://127.0.0.1:3000/evening
curl -s http://127.0.0.1:3000/nonexistent
kill -SIGTERM $SERVER_PID

#### Test framework installation

npm install --save-dev supertest jest

#### Test execution

npm test
```

#### Test Files Created

| File | Lines of Code | Test Count | Coverage |
|------|--------------|------------|----------|
| `server.test.js` | ~170 | 19 | Routes, 404, Error Handling, Signal Handlers, Exports |



