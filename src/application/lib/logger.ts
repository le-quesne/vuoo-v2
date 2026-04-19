type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const isDev = import.meta.env.DEV;

function emit(level: LogLevel, message: string, meta?: unknown): void {
  if (!isDev && level === 'debug') return;

  const payload = meta === undefined ? '' : meta;

  switch (level) {
    case 'debug':
      console.debug(`[vuoo] ${message}`, payload);
      return;
    case 'info':
      console.info(`[vuoo] ${message}`, payload);
      return;
    case 'warn':
      console.warn(`[vuoo] ${message}`, payload);
      return;
    case 'error':
      console.error(`[vuoo] ${message}`, payload);
      return;
  }
}

export const logger = {
  debug: (message: string, meta?: unknown) => emit('debug', message, meta),
  info: (message: string, meta?: unknown) => emit('info', message, meta),
  warn: (message: string, meta?: unknown) => emit('warn', message, meta),
  error: (message: string, meta?: unknown) => emit('error', message, meta),
};
