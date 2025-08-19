const winston = require('winston');
const path = require('path');

// Create logs directory if it doesn't exist
const fs = require('fs');
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
}

// Custom format for better readability
const customFormat = winston.format.combine(
    winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
    winston.format.prettyPrint()
);

// Console format for development
const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({
        format: 'HH:mm:ss'
    }),
    winston.format.printf(({ timestamp, level, message, stack }) => {
        return `${timestamp} [${level}]: ${stack || message}`;
    })
);

// Create logger instance
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: customFormat,
    defaultMeta: { 
        service: 'vintage-crib-api',
        version: process.env.npm_package_version || '1.0.0'
    },
    transports: [
        // Write all logs to combined.log
        new winston.transports.File({ 
            filename: path.join(logsDir, 'combined.log'),
            maxsize: 5242880, // 5MB
            maxFiles: 5
        }),
        
        // Write error logs to error.log
        new winston.transports.File({ 
            filename: path.join(logsDir, 'error.log'),
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5
        }),
        
        // Write API access logs
        new winston.transports.File({
            filename: path.join(logsDir, 'access.log'),
            level: 'http',
            maxsize: 5242880, // 5MB
            maxFiles: 5
        })
    ],
    
    // Handle uncaught exceptions
    exceptionHandlers: [
        new winston.transports.File({ 
            filename: path.join(logsDir, 'exceptions.log') 
        })
    ],
    
    // Handle unhandled promise rejections
    rejectionHandlers: [
        new winston.transports.File({ 
            filename: path.join(logsDir, 'rejections.log') 
        })
    ]
});

// Add console transport for development
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: consoleFormat,
        level: 'debug'
    }));
}

// Custom logging methods for different scenarios
const customLogger = {
    // API request logging
    api: (req, res, responseTime) => {
        logger.http('API Request', {
            method: req.method,
            url: req.originalUrl,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            statusCode: res.statusCode,
            responseTime: `${responseTime}ms`,
            contentLength: res.get('Content-Length') || 0
        });
    },

    // Authentication events
    auth: (event, data) => {
        logger.info('Authentication Event', {
            event,
            ...data,
            timestamp: new Date().toISOString()
        });
    },

    // Database operations
    database: (operation, data) => {
        logger.info('Database Operation', {
            operation,
            ...data,
            timestamp: new Date().toISOString()
        });
    },

    // eBay API operations
    ebay: (operation, data) => {
        logger.info('eBay API Operation', {
            operation,
            ...data,
            timestamp: new Date().toISOString()
        });
    },

    // Performance metrics
    performance: (metric, value, unit = 'ms') => {
        logger.info('Performance Metric', {
            metric,
            value,
            unit,
            timestamp: new Date().toISOString()
        });
    },

    // Security events
    security: (event, data) => {
        logger.warn('Security Event', {
            event,
            ...data,
            timestamp: new Date().toISOString()
        });
    },

    // Error logging with context
    error: (error, context = {}) => {
        logger.error('Application Error', {
            message: error.message,
            stack: error.stack,
            name: error.name,
            code: error.code,
            ...context,
            timestamp: new Date().toISOString()
        });
    },

    // Business metrics
    business: (metric, data) => {
        logger.info('Business Metric', {
            metric,
            ...data,
            timestamp: new Date().toISOString()
        });
    }
};

// Express middleware for request logging
const requestLogger = (req, res, next) => {
    const startTime = Date.now();
    
    // Override res.end to capture response time
    const originalEnd = res.end;
    res.end = function(...args) {
        const responseTime = Date.now() - startTime;
        customLogger.api(req, res, responseTime);
        originalEnd.apply(this, args);
    };
    
    next();
};

// Error handling middleware
const errorLogger = (error, req, res, next) => {
    customLogger.error(error, {
        method: req.method,
        url: req.originalUrl,
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });
    
    next(error);
};

// Log rotation and cleanup
const cleanupOldLogs = () => {
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
    const now = Date.now();
    
    fs.readdir(logsDir, (err, files) => {
        if (err) return;
        
        files.forEach(file => {
            const filePath = path.join(logsDir, file);
            fs.stat(filePath, (err, stats) => {
                if (err) return;
                
                if (now - stats.mtime.getTime() > maxAge) {
                    fs.unlink(filePath, (err) => {
                        if (!err) {
                            logger.info('Log file cleaned up', { file });
                        }
                    });
                }
            });
        });
    });
};

// Schedule cleanup every day
setInterval(cleanupOldLogs, 24 * 60 * 60 * 1000);

module.exports = {
    logger,
    customLogger,
    requestLogger,
    errorLogger
};