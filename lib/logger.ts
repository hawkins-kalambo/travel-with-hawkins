type LogLevel = "info" | "warn" | "error";

function formatMessage(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  return {
    level,
    message,
    ...(meta ? { meta } : {}),
  };
}

export function logInfo(message: string, meta?: Record<string, unknown>) {
  console.info(JSON.stringify(formatMessage("info", message, meta)));
}

export function logWarn(message: string, meta?: Record<string, unknown>) {
  console.warn(JSON.stringify(formatMessage("warn", message, meta)));
}

export function logError(message: string, meta?: Record<string, unknown>) {
  console.error(JSON.stringify(formatMessage("error", message, meta)));
}
