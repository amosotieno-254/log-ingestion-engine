import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { config } from './config';
import { RateLimiter } from './tokenBucket';
import { validateLog } from './validation';
import { RawLogChannel } from './channel';
import { enrichLog } from './enrichment';
import { RabbitMQClient } from './rabbitmq';
import { SQLiteWriter } from './sqlite';
import { DeadLetter } from './deadLetter';
import { Metrics } from './metrics';   

const app = express();
app.use(express.json({ limit: config.maxPayLoadSize }));

const rateLimiter = new RateLimiter(config.rateLimit);
const rawChannel = new RawLogChannel(config.channelBufferSize);
const rabbit = new RabbitMQClient();
const deadLetter = new DeadLetter();
const metrics = new Metrics();  

app.post('/logs', (req, res) => {
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('application/json')) {
    return res.status(415).json({ error: 'Unsupported Media Type' });
  }

  const ip =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
    req.ip ||
    'unknown';

  if (!rateLimiter.check(ip)) {
    res.setHeader('Retry-After', '1');
    return res.status(429).json({ error: 'Too Many Requests' });
  }

  const body = req.body;
  if (!Array.isArray(body)) {
    return res.status(400).json({ error: 'Expected JSON array of log entries' });
  }

  const batchId = uuidv4();
  const accepted: any[] = [];
  const rejected: any[] = [];

  for (const item of body) {
    const result = validateLog(item);
    if (result.valid) {
      const pushed = rawChannel.push({ log: result.log, sourceIp: ip });
      if (!pushed) {
        return res.status(503).json({ error: 'ingestion overloaded' });
      }
      accepted.push(result.log);
    } else {
      rejected.push({ entry: item, errors: result.errors });
    }
  }

  return res.status(202).json({
    status: 'accepted',
    batchId,
    acceptedCount: accepted.length,
    rejected,
  });
});

//  GET /metrics endpoint
app.get('/metrics', (req, res) => {   
  metrics.queueBacklog = rabbit.getBacklogSize();   
  res.json(metrics.snapshot());   
});   

// GET /dashboard endpoint 
app.get('/dashboard', (req, res) => {   
  metrics.queueBacklog = rabbit.getBacklogSize();   
  const snap = metrics.snapshot();  
  const topServices = Object.entries(snap.logs_by_service)   
    .sort((a, b) => b[1] - a[1])   
    .slice(0, 5)   
    .map(([svc, count]) => `<li>${svc}: ${count}</li>`)   
    .join('');   

  const html = `   
<!DOCTYPE html>
<html>
<head>
  <title>Log Ingestion Dashboard</title>
  <meta http-equiv="refresh" content="5">
  <style>
    body { font-family: sans-serif; margin: 2rem; }
    .metric { display: inline-block; margin: 1rem; padding: 1rem; border: 1px solid #ccc; border-radius: 8px; min-width: 150px; }
    .value { font-size: 2rem; font-weight: bold; }
  </style>
</head>
<body>
  <h1>Log Ingestion Dashboard</h1>
  <div class="metric"><div>Total Logs</div><div class="value">${snap.total_logs}</div></div>
  <div class="metric"><div>Throughput</div><div class="value">${snap.throughput.toFixed(2)} logs/sec</div></div>
  <div class="metric"><div>Error Rate</div><div class="value">${snap.error_rate.toFixed(2)}%</div></div>
  <div class="metric"><div>Queue Backlog</div><div class="value">${snap.queue_backlog}</div></div>
  <h2>Top 5 Services</h2>
  <ul>${topServices || '<li>No data</li>'}</ul>
  <p>Auto-refreshes every 5 seconds</p>
</body>
</html>`;   
  res.send(html);   
});  

// Router consumer: record metrics after enrichment
async function startRouterConsumer() {
  while (true) {
    const batch = await rawChannel.popBatch(config.consumerBatchSize, 100);
    for (const item of batch) {
      const enriched = enrichLog(item.log, item.sourceIp, config.env);
      // record metrics for each enriched log
      metrics.record(enriched);   
      await rabbit.publish(enriched.service, enriched);
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

// Storage consumers 
async function startStorageConsumer(service: string) {
  const writer = new SQLiteWriter(service);
  const backoff = [1000, 5000, 10000];
  while (true) {
    const batch = await rabbit.popBatch(service, config.storageBatchSize, config.storageBatchTimeoutMs);
    if (batch.length === 0) continue;

    let success = false;
    let retries = 0;
    while (!success && retries < 3) {
      try {
        await writer.writeBatch(batch);
        success = true;
      } catch (err) {
        retries++;
        console.error(`Write failed for ${service}, retry ${retries}/3:`, err);
        if (retries < 3) {
          await new Promise(resolve => setTimeout(resolve, backoff[retries - 1]));
        }
      }
    }

    if (!success) {
      console.error(`All retries failed for ${service}. Sending to dead letter.`);
      for (const log of batch) {
        await deadLetter.append({
          log,
          error: 'All retries failed',
          timestamp: new Date().toISOString(),
        });
      }
    }
  }
}

async function main() {
  await rabbit.connect();

  startRouterConsumer();
  for (const service of config.services) {
    startStorageConsumer(service);
  }

  app.listen(config.port, () => {
    console.log(`Log ingestion server running on port ${config.port}`);
  });
}

main().catch(console.error);