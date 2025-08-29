const bcrypt = require('bcryptjs');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const Joi = require('joi');

// Security Configuration
class SecurityManager {
    constructor() {
        this.maxLoginAttempts = parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5;
        this.sessionTimeout = parseInt(process.env.SESSION_TIMEOUT_HOURS) || 24;
        this.loginAttempts = new Map();
    }

    // Password hashing and verification
    async hashPassword(password) {
        const saltRounds = 12;
        return await bcrypt.hash(password, saltRounds);
    }

    async verifyPassword(password, hash) {
        return await bcrypt.compare(password, hash);
    }

    // Generate secure admin password hash (run once to set up)
    async generateAdminPasswordHash(plainPassword = 'mystore123') {
        const hash = await this.hashPassword(plainPassword);
        console.log('🔐 Generated secure admin password hash:');
        console.log(`ADMIN_PASSWORD_HASH=${hash}`);
        console.log('💡 Add this to your .env file and remove the plain password');
        return hash;
    }

    // Session configuration
    getSessionConfig() {
        return {
            secret: process.env.SESSION_SECRET || 'fallback_secret_change_this',
            resave: false,
            saveUninitialized: false,
            cookie: {
                secure: process.env.NODE_ENV === 'production',
                httpOnly: true,
                maxAge: this.sessionTimeout * 60 * 60 * 1000, // Convert hours to milliseconds
                sameSite: 'strict'
            }
        };
    }

    // Rate limiting configurations
    createLoginLimiter() {
        return rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: this.maxLoginAttempts,
            message: {
                error: 'Too many login attempts, please try again later.',
                retryAfter: '15 minutes'
            },
            standardHeaders: true,
            legacyHeaders: false,
            handler: (req, res) => {
                console.log(`🚨 Rate limit exceeded for IP: ${req.ip}`);
                res.status(429).json({
                    error: 'Too many login attempts',
                    message: 'Please try again in 15 minutes'
                });
            }
        });
    }

    createAPILimiter() {
        return rateLimit({
            windowMs: 1 * 60 * 1000, // 1 minute
            max: 100, // Limit each IP to 100 requests per minute
            message: {
                error: 'Too many API requests, please slow down.',
                retryAfter: '1 minute'
            },
            standardHeaders: true,
            legacyHeaders: false
        });
    }

    createSyncLimiter() {
        return rateLimit({
            windowMs: 5 * 60 * 1000, // 5 minutes
            max: 5, // Only 5 sync requests per 5 minutes
            message: {
                error: 'Sync requests are rate limited to prevent eBay API abuse.',
                retryAfter: '5 minutes'
            },
            standardHeaders: true,
            legacyHeaders: false
        });
    }

    // Input validation schemas
    getValidationSchemas() {
        return {
            login: Joi.object({
                username: Joi.string().alphanum().min(3).max(30).required(),
                password: Joi.string().min(6).max(100).required()
            }),

            productImport: Joi.object({
                url: Joi.string().uri().required(),
                maxItems: Joi.number().integer().min(1).max(100).optional()
            }),

            bulkImport: Joi.object({
                urls: Joi.array().items(Joi.string().uri()).min(1).max(50).required(),
                maxItems: Joi.number().integer().min(1).max(1000).optional()
            }),

            productUpdate: Joi.object({
                name: Joi.string().min(1).max(500).optional(),
                price: Joi.number().positive().max(999999.99).optional(),
                description: Joi.string().max(5000).optional(),
                category: Joi.string().valid('electronics', 'clothing', 'collectibles', 'home', 'other').optional()
            })
        };
    }

    // Middleware for authentication
    requireAuth(req, res, next) {
        if (!req.session || !req.session.isAuthenticated) {
            return res.status(401).json({
                error: 'Authentication required',
                message: 'Please log in to access this resource'
            });
        }

        // Check session timeout
        if (req.session.lastAccess && Date.now() - req.session.lastAccess > this.sessionTimeout * 60 * 60 * 1000) {
            req.session.destroy();
            return res.status(401).json({
                error: 'Session expired',
                message: 'Your session has expired, please log in again'
            });
        }

        // Update last access time
        req.session.lastAccess = Date.now();
        next();
    }

    // Input validation middleware
    validateInput(schema) {
        return (req, res, next) => {
            const { error, value } = schema.validate(req.body);
            if (error) {
                return res.status(400).json({
                    error: 'Invalid input',
                    details: error.details.map(detail => detail.message)
                });
            }
            req.validatedData = value;
            next();
        };
    }

    // Security headers middleware
    securityHeaders(req, res, next) {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        
        // Only set HSTS in production
        if (process.env.NODE_ENV === 'production') {
            res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        }
        
        next();
    }

    // Sanitize user input
    sanitizeInput(input) {
        if (typeof input !== 'string') return input;
        
        // Remove potentially dangerous characters
        return input
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/javascript:/gi, '')
            .replace(/on\w+\s*=/gi, '')
            .trim();
    }

    // Log security events
    logSecurityEvent(event, req, details = {}) {
        const timestamp = new Date().toISOString();
        const ip = req.ip || req.connection.remoteAddress;
        const userAgent = req.get('User-Agent') || 'Unknown';
        
        console.log(`🔐 [${timestamp}] Security Event: ${event}`);
        console.log(`   IP: ${ip}`);
        console.log(`   User-Agent: ${userAgent}`);
        console.log(`   Details:`, details);
        
        // In production, you would send this to a security monitoring service
    }

    // Generate secure session ID
    generateSessionId() {
        return require('crypto').randomBytes(32).toString('hex');
    }
}

module.exports = new SecurityManager();