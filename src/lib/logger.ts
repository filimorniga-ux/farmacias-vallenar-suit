import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

export const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    transport: !isProduction
        ? {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'SYS:standard',
                ignore: 'pid,hostname',
            },
        }
        : undefined,
    base: isProduction ? undefined : { pid: undefined, hostname: undefined },
});

export const requestLogger = (req: any) => {
    logger.info({
        method: req.method,
        url: req.url,
        query: req.query,
    }, 'Incoming Request');
};
