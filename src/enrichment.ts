
export interface EnrichedLog {
  timestamp: string;
  service: string;
  level: string;
  message: string;
  received_at: string;
  source_ip: string;
  env: string;
}

export function enrichLog(log: any, sourceIp: string, env: string): EnrichedLog {
  // Get current ISO timestamp with milliseconds (e.g., 2025-01-01T12:34:56.789Z)
  const iso = new Date().toISOString();

  // Simulate microsecond precision by appending three zeros after the milliseconds
  // Result: 2025-01-01T12:34:56.789000Z
  const receivedAt = iso.slice(0, -1) + '000Z'; // remove trailing 'Z', add '000Z'

  return {
    ...log,
    received_at: receivedAt,
    source_ip: sourceIp || 'unknown',
    env: env,
  };
}