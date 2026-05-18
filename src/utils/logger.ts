type LogLevel = 'info' | 'warn' | 'error'

interface LogEntry {
  level: LogLevel
  message: string
  timestamp: string
  context?: Record<string, unknown>
}

function log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(context && { context }),
  }
  // MCP servers must log to stderr — stdout is reserved for protocol messages
  process.stderr.write(JSON.stringify(entry) + '\n')
}

export const logger = {
  info: (message: string, context?: Record<string, unknown>) =>
    log('info', message, context),

  warn: (message: string, context?: Record<string, unknown>) =>
    log('warn', message, context),

  error: (message: string, context?: Record<string, unknown>) =>
    log('error', message, context),
}
