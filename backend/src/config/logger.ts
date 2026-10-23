import winston from 'winston';
import { env } from './env';

const { combine, timestamp, errors, json, colorize, simple } = winston.format;

const baseLogger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    errors({ stack: true }),
    json(),
  ),
  defaultMeta: { service: 'sre-copilot-backend' },
  transports: [
    new winston.transports.Console({
      format:
        env.NODE_ENV === 'development'
          ? combine(colorize(), simple())
          : combine(timestamp(), json()),
    }),
  ],
});

type LogFn = (messageOrMeta: any, ...args: any[]) => void;

function formatLogCall(fn: (msg: string, ...meta: any[]) => void): LogFn {
  return (messageOrMeta: any, ...args: any[]) => {
    if (typeof messageOrMeta === 'object' && messageOrMeta !== null && typeof args[0] === 'string') {
      const message = args[0];
      const rest = args.slice(1);
      fn(message, { ...messageOrMeta, ...(rest.length > 0 ? { extra: rest } : {}) });
    } else if (typeof messageOrMeta === 'string') {
      fn(messageOrMeta, ...args);
    } else {
      fn(JSON.stringify(messageOrMeta), ...args);
    }
  };
}

export const logger = {
  info: formatLogCall(baseLogger.info.bind(baseLogger)),
  warn: formatLogCall(baseLogger.warn.bind(baseLogger)),
  error: formatLogCall(baseLogger.error.bind(baseLogger)),
  debug: formatLogCall(baseLogger.debug.bind(baseLogger)),
  base: baseLogger,
};
