/**
 * Lightweight structured logger for API routes.
 * Outputs JSON logs compatible with Vercel and CloudWatch.
 */

export type LogLevel = "info" | "warn" | "error"

interface LogEntry {
  timestamp: string
  level: LogLevel
  route: string
  message: string
  meta?: Record<string, unknown>
}

/**
 * Core structured logger
 */
export function log(
  level: LogLevel,
  route: string,
  message: string,
  meta?: Record<string, unknown>
): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    route,
    message,
    ...(meta && { meta }),
  }

  // Output as JSON for structured logging
  console.log(JSON.stringify(entry))
}

/**
 * Convenience: info level
 */
export function logInfo(
  route: string,
  message: string,
  meta?: Record<string, unknown>
): void {
  log("info", route, message, meta)
}

/**
 * Convenience: warn level
 */
export function logWarn(
  route: string,
  message: string,
  meta?: Record<string, unknown>
): void {
  log("warn", route, message, meta)
}

/**
 * Convenience: error level
 */
export function logError(
  route: string,
  message: string,
  meta?: Record<string, unknown>
): void {
  log("error", route, message, meta)
}

/**
 * Log an API request with route, method, and duration
 */
export function logRequest(
  route: string,
  method: string,
  durationMs: number,
  meta?: Record<string, unknown>
): void {
  log("info", route, `${method} completed`, {
    method,
    durationMs,
    ...meta,
  })
}
