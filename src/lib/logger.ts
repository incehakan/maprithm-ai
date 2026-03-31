export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogContext = {
  route?: string;
  helper?: string;
  job?: string;
  storeId?: string | null;
  userId?: string | null;
  membershipId?: string | null;
  requestId?: string | null;
  [key: string]: unknown;
};

function shouldLogDebug(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.LOG_LEVEL === "debug";
}

function emit(level: LogLevel, message: string, context?: LogContext) {
  if (level === "debug" && !shouldLogDebug()) return;
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context
  };
  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug(message: string, context?: LogContext) {
    emit("debug", message, context);
  },
  info(message: string, context?: LogContext) {
    emit("info", message, context);
  },
  warn(message: string, context?: LogContext) {
    emit("warn", message, context);
  },
  error(message: string, context?: LogContext) {
    emit("error", message, context);
  }
};

