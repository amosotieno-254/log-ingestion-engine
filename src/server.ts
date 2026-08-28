import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { config } from './config';
import { RateLimiter } from './tokenBucket';
import { validateLog } from './validation';
import { RawLogChannel } from './channel';
import { enrichLog } from './enrichment';
// NEW: import new modules
import { RabbitMQClient } from './rabbitmq';   
import { SQLiteWriter } from './sqlite';       
import { DeadLetter } from './deadLetter';     

const app = express();
app.use(express.json({ limit: config.maxPayLoadSize }));

const rateLimiter = new RateLimiter(config.rateLimit);
const rawChannel = new RawLogChannel(config.channelBufferSize);

//  instantiating RabbitMQ client and DeadLetter
const rabbit = new RabbitMQClient();           
const deadLetter = new DeadLetter();           

// Error handler (unchanged)
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Payload Too Large' });
  }
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: 'Malformed JSON' });
  }
  next(err);
});

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

async function startRouterConsumer() {
  while (true) {
    const batch = await rawChannel.popBatch(config.consumerBatchSize, 100);
    for (const item of batch) {
      const enriched = enrichLog(item.log, item.sourceIp, config.env);
      await rabbit.publish(enriched.service, enriched);     // NEW
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

// Storage consumer: reads from RabbitMQ (or fallback), writes to SQLite with retry
async function startStorageConsumer(service: string) {
  const writer = new SQLiteWriter(service);                 
  const backoff = [1000, 5000, 10000];                      
  while (true) {
    const batch = await rabbit.popBatch(service, config.storageBatchSize, config.storageBatchTimeoutMs); // NEW
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
          await new Promise(resolve => setTimeout(resolve, backoff[retries - 1])); // NEW
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

//  Initialize RabbitMQ, start consumers
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