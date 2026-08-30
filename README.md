# Centralised Log Ingestion System

A backend service that collects logs from multiple microservices via a single HTTP API, validates them, enriches them with metadata, routes them to per‑service storage, and exposes real‑time metrics and a dashboard for monitoring.

## Table of Contents

- [Architecture](#architecture)
- [Setup](#setup)
- [API](#api)
- [Concurrency Model](#concurrency-model)
- [Configuration](#configuration)
- [Testing](#testing)

---

## Architecture

The system is built as a pipeline with several stages:

1. **Ingestion (HTTP)** – `POST /logs` receives JSON arrays of log entries.
   - Validates each log (timestamp, service, level, message).
   - Enforces per‑IP rate limiting using a token bucket.
   - Pushes valid logs into an in‑memory `raw_logs` channel.

2. **Enrichment & Routing** – A background consumer reads batches from `raw_logs`, adds `received_at`, `source_ip`, and `env`, then publishes each enriched log to a RabbitMQ exchange named after its service (fallback to in‑memory queue if RabbitMQ is down).

3. **Storage & Queuing** – RabbitMQ queues feed storage consumers (one per service). Each consumer batches logs and writes them to a SQLite database (`logs_<service>.db`). Failed writes are retried up to 3 times with exponential backoff; after that, the log is written to a dead‑letter file (`logs-failed.json`).

4. **Monitoring & Reporting** – In‑memory metrics track total logs, logs by level/service, error rate, throughput, and queue backlog. Exposed via `GET /metrics` (JSON) and `GET /dashboard` (auto‑refreshing HTML).

5. **Alerting & Rotation** (Phase 6+) – Console alerts for high error rate, large backlog, or zero throughput; SQLite tables older than 7 days are archived and truncated.

All components are asynchronous and non‑blocking; configuration comes from environment variables; no external monitoring or rate‑limiting libraries are used.

---

## Setup

### Prerequisites

- Node.js (v18+ recommended)
- npm

### Installation

1. Clone the repository and enter the project directory:
```bash
   git clone <your-repo-url>
   cd log-ingestion-engine
```

2. Install dependencies:
```bash
   npm install
```

3. (Optional) Start RabbitMQ using Docker:
```bash
   docker run -d --name rabbitmq -p 5672:5672 rabbitmq:3-management
```
   If RabbitMQ is not running, the system automatically uses an in‑memory fallback.

4. Start the server:
```bash
   npm run dev   # development mode with tsx
```
   Or for production build:
```bash
   npm run build
   npm start
```

The server will listen on `http://localhost:3000` by default.

---

## API

### `POST /logs`

Ingest a batch of log entries.

- Request body: JSON array of log objects.
- Content-Type: `application/json`
- Max payload size: 1 MB

Each log object must contain:

- `timestamp`: string, ISO 8601
- `service`: string, max 100 chars
- `level`: one of `INFO`, `WARN`, `ERROR`, `DEBUG`
- `message`: string, max 10000 chars

**Responses:**

- `202 Accepted` – logs accepted, returns batch ID.
- `400 Bad Request` – malformed JSON or invalid entries.
- `413 Payload Too Large` – body exceeds 1 MB.
- `415 Unsupported Media Type` – wrong content type.
- `429 Too Many Requests` – rate limit exceeded.
- `503 Service Unavailable` – internal queue full.

Example success response:

```json
{
  "status": "accepted",
  "batchId": "3f2a...",
  "acceptedCount": 2,
  "rejected": [
    {
      "entry": { ... },
      "errors": [
        { "field": "timestamp", "reason": "must be ISO 8601" }
      ]
    }
  ]
}
```

### `GET /metrics`

Returns current metrics as JSON.

```json
{
  "total_logs": 12345,
  "logs_by_level": { "INFO": 10000, "ERROR": 2345 },
  "logs_by_service": { "service1": 12000, "service2": 345 },
  "error_rate": 18.99,
  "throughput": 850.2,
  "queue_backlog": 42
}
```

### `GET /dashboard`

Returns an HTML page with auto‑refresh (5 seconds) showing total logs, throughput, error rate, queue backlog, and top 5 services.

---

## Concurrency Model

- **Raw log channel** (`raw_logs`) is an in‑memory queue with a fixed buffer (default 10,000 logs). The HTTP handler pushes logs into it without blocking; if the queue is full, it returns `503`.

- **Router consumer** reads batches of 50 logs (configurable) from `raw_logs` with a 100 ms non‑blocking timeout, enriches them, and publishes to RabbitMQ (or in‑memory fallback). This decouples ingestion from processing.

- **Storage consumers** (one per service) read from RabbitMQ queues (or the fallback) in batches of 100 logs or every 1 second, whichever comes first. They write to SQLite using prepared statements inside a transaction.

- **Retry & Dead‑Letter** – Writes are retried up to 3 times with backoff (1 s, 5 s, 10 s). If all fail, the batch is written to `logs-failed.json`. The file rotates when it exceeds 10 MB.

- **Rate limiting** – Per IP, using a token bucket (default 1000 requests/sec). Configurable via `RATE_LIMIT`.

- **Asynchronous I/O** – All file/database/network operations use async/await or non‑blocking APIs. The ingestion path never blocks on disk or network.

---

## Configuration

All settings are read from environment variables with sensible defaults. Key variables:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `RATE_LIMIT` | `1000` | Requests/sec per IP |
| `CHANNEL_BUFFER_SIZE` | `10000` | Raw log channel capacity |
| `CONSUMER_BATCH_SIZE` | `50` | Router consumer batch size |
| `STORAGE_BATCH_SIZE` | `100` | Storage consumer batch size |
| `STORAGE_BATCH_TIMEOUT_MS` | `1000` | Storage batch timeout (ms) |
| `ENV` | `production` | Environment label added to logs |
| `SQLITE_DIR` | `./data` | Directory for SQLite databases |
| `DEAD_LETTER_FILE` | `logs-failed.json` | Dead‑letter file path |
| `RABBITMQ_HOST` | `localhost` | RabbitMQ host |
| `RABBITMQ_PORT` | `5672` | RabbitMQ port |
| `RABBITMQ_USER` | `guest` | RabbitMQ username |
| `RABBITMQ_PASS` | `guest` | RabbitMQ password |

You can set them directly in the shell or use a `.env` file with a tool like `dotenv`.

---

## Testing

### Unit Tests (suggested)

- Validation logic (`validation.ts`)
- Token bucket (`tokenBucket.ts`)
- Metrics (`metrics.ts`)
- Enrichment (`enrichment.ts`)

### Integration Tests

- End‑to‑end pipeline: send logs → check SQLite database contains them.
- RabbitMQ fallback: stop RabbitMQ, ensure logs still reach SQLite.
- Dead‑letter: force a write failure (e.g., make SQLite directory read‑only) and verify `logs-failed.json` receives the entries.

### Load Testing

Use a simple script or curl loop to send 1,000 logs/sec and observe:

- No dropped logs (unless queue overloaded → `503`).
- Rate limiting triggers at configured threshold.
- Metrics reflect the load.

A basic load test with curl:

```bash
for i in {1..1000}; do
  curl -s -X POST http://localhost:3000/logs \
    -H "Content-Type: application/json" \
    -d '[{"timestamp":"2025-01-01T00:00:00Z","service":"service1","level":"INFO","message":"load"}]' &
done
wait
```