export interface LogEntry {
  timestamp: string;
  service: string;
  level: string;
  message: string;
}

export interface ValidationError {
  field: string;
  reason: string;
}

const VALID_LEVELS = ["INFO", "WARN", "ERROR", "DEBUG"];

export function validateLog(entry: any): {
  valid: boolean;
  errors?: ValidationError[];
  log?: LogEntry;
} {
  const errors: ValidationError[] = [];

  // If not an object, return early with an error
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
    return {
      valid: false,
      errors: [{ field: "entry", reason: "must be a JSON object" }],
    };
  }

  const { timestamp, service, level, message } = entry;

  // timestamp validation
  if (typeof timestamp !== "string" || isNaN(Date.parse(timestamp))) {
    errors.push({ field: "timestamp", reason: "must be ISO 8601" });
  }

  // service validation
  if (
    typeof service !== "string" ||
    service.length === 0 ||
    service.length > 100
  ) {
    errors.push({ field: "service", reason: "must be string, max 100 chars" });
  }

  // level validation
  if (typeof level !== "string" || !VALID_LEVELS.includes(level)) {
    errors.push({
      field: "level",
      reason: "must be one of INFO/WARN/ERROR/DEBUG",
    });
  }

  // message validation
  if (
    typeof message !== "string" ||
    message.length === 0 ||
    message.length > 10000
  ) {
    errors.push({
      field: "message",
      reason: "must be string, max 10000 chars",
    });
  }

  // If any errors, return them
  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // All validations passed – return the log
  return { valid: true, log: { timestamp, service, level, message } };
}
