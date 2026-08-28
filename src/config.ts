export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  rateLimit: parseInt(process.env.RATE_LIMIT || "1000", 10),
  maxPayLoadSize: "1mb",
  channelBufferSize: parseInt(process.env.CHANNEL_BUFFER_SIZE || "10000", 10),
  consumerBatchSize: parseInt(process.env.CONSUMER_BATCH_SIZE || "50", 10),
  env:process.env.ENV || "production",

  rabbitmq: {
    host: process.env.RABBITMG_HOST || "localhost",
    port: parseInt(process.env.RABBITMG_PORT || "5672",10),
    user: process.env.RABBITMG_USER || "guest",
    pass:process.env.RABBITMG_PASS || "guest",
  },
  storageBatchSize: parseInt(process.env.STORAGE_BATCH_SIZE || '100', 10), 
  storageBatchTimeoutMs: parseInt(process.env.STORAGE_BATCH_TIMEOUT_MS || '1000', 10), // NEW
  sqliteDir: process.env.SQLITE_DIR || './data',                           
  deadLetterFile: process.env.DEAD_LETTER_FILE || 'logs-failed.json',

  services:["servicie1","service2","service3"],
};

