import express from "express";
import { v4 as uuidv4 } from "uuid";
import { config } from "./config";
import { RateLimiter } from "./tokenBucket";
import { validateLog } from "./validation";
import { RawLogChannel } from "./channel";
import { enrichLog } from "./enrichment";

const app = express();
// Enforce payload size limit (1MB) and JSON parsing
app.use(express.json({ limit: config.maxPayLoadSize }));

const rateLimiter = new RateLimiter(config.rateLimit);

// create rawlog channel
const rawLogChannel = new RawLogChannel(config.channelBufferSize);

// Error handler for malformed JSON / payload too large
app.use(
  (
    err: any,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    if (err.type === "entity.too.large") {
      return res.status(413).json({ error: "Payload Too Large" });
    }
    if (err instanceof SyntaxError && "body" in err) {
      return res.status(400).json({ error: "Malformed JSON" });
    }
    next(err);
  },
);

app.post("/logs", (req, res) => {
  // Check Content-Type
  const contentType = req.headers["content-type"] || "";
  if (!contentType.includes("application/json")) {
    return res.status(415).json({ error: "Unsupported Media Type" });
  }

  // Determine client IP (X-Forwarded-For or socket)
  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() ||
    req.ip ||
    "unknown";

  // Rate limiting check
  if (!rateLimiter.check(ip)) {
    res.setHeader("Retry-After", "1");
    return res.status(429).json({ error: "Too Many Requests" });
  }

  const body = req.body;
  if (!Array.isArray(body)) {
    return res
      .status(400)
      .json({ error: "Expected JSON array of log entries" });
  }

  const batchId = uuidv4();
  const accepted: any[] = [];
  const rejected: any[] = [];

  // Validate each log; valid ones are accepted (processing comes later)
  for (const item of body) {
    const result = validateLog(item);
    if (result.valid) {
      // push to raw chamnnel instead of accepting
      const pushed = rawLogChannel.push({ log: result.log, sourceIp: ip });
      if (!pushed) {
        return res.status(503).json({ error: "ingestion overload" });
      }
      accepted.push(result.log);
    } else {
      rejected.push({ entry: item, errors: result.errors });
    }
  }

  // Return 202 with batch ID and details
  return res.status(202).json({
    status: "accepted",
    batchId,
    acceptedCount: accepted.length,
    rejected,
  });
});
async function startConsumer() {
  while (true) {
    const batch = await rawLogChannel.popBatch(config.consumerBatchSize, 100);
    if (batch.length > 0) {
      for (const item of batch) {
        const enriched = enrichLog(item.log, item.sourceIp, config.env);
        console.log("Enriched log:", enriched);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
startConsumer().catch(console.error);

app.listen(config.port, () => {
  console.log(`Log ingestion server running on port ${config.port}`);
});
