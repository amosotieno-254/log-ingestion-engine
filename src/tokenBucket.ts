export class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private readonly refillRate: number;

  constructor(rate: number) {
    this.tokens = rate;
    this.refillRate = rate;
    this.lastRefill = Date.now();
  }
  tryconsume(): boolean {
    this.refill();
    if (this.tokens >= 1) {
      return true;
    }
    return false;
  }

  private refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(
      this.refillRate,
      this.tokens + elapsed * this.refillRate,
    );
    this.lastRefill = now;
  }
}

export class RateLimiter {
  private buckets = new Map<string, TokenBucket>();

  constructor(private rate: number) {}
  check(key: string): boolean {
    if (!this.buckets.has(key)) {
      this.buckets.set(key, new TokenBucket(this.rate));
    }
    return this.buckets.get(key)!.tryconsume();
  }
}
