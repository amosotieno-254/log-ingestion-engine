export class TokenBucket {
  private capacity: number;
  private tokens: number;
  private refillRate: number; 
  private lastRefill: number;

  constructor(ratePerSecond: number) {
    this.capacity = ratePerSecond;
    this.tokens = ratePerSecond;
    this.refillRate = ratePerSecond;
    this.lastRefill = Date.now();
  }

  // Try to consume one token; return true if successful, false otherwise.
  tryConsume(tokens = 1): boolean {
    this.refill();
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }
    return false;
  }

  private refill() {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastRefill) / 1000;
    const add = elapsedSeconds * this.refillRate;
    this.tokens = Math.min(this.capacity, this.tokens + add);
    this.lastRefill = now;
  }
}

export class RateLimiter {
  private buckets = new Map<string, TokenBucket>();
  private rate: number;

  constructor(rate: number) {
    this.rate = rate;
  }

  // Check if a request from this key (e.g., IP) is allowed.
  check(key: string): boolean {
    if (!this.buckets.has(key)) {
      this.buckets.set(key, new TokenBucket(this.rate));
    }
    return this.buckets.get(key)!.tryConsume();
  }
}