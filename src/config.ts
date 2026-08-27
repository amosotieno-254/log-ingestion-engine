export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  rateLimit: parseInt(process.env.RATE_LIMIT || "1000", 10),
  maxPayLoadSize: "1mb",
  channelBufferSize: parseInt(process.env.CHANNEL_BUFFER_SIZE || "10000", 10),
  consumerBatchSize: parseInt(process.env.CONSUMER_BATCH_SIZE || "50", 10),
  env:process.env.ENV || "production"
};
