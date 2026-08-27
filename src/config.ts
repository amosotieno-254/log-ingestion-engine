export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  rateLimit: parseInt(process.env.RATE_LIMIT || "1000", 10),
  maxPayLoadSize: "1mb",
};
