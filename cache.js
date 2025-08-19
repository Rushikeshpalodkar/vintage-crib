const Redis = require('ioredis');

class CacheManager {
    constructor() {
        this.redis = null;
        this.memoryCache = new Map();
        this.maxMemoryItems = 1000;
        this.defaultTTL = 300; // 5 minutes
        
        this.initializeRedis();
    }

    async initializeRedis() {
        try {
            const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
            
            this.redis = new Redis(redisUrl, {
                maxRetriesPerRequest: 3,
                retryDelayOnFailover: 100,
                lazyConnect: true,
                connectTimeout: 5000,
                commandTimeout: 3000
            });

            await this.redis.ping();
            console.log('✅ Redis cache connected successfully');
            
            this.redis.on('error', (error) => {
                console.warn('⚠️ Redis error, falling back to memory cache:', error.message);
                this.redis = null;
            });

        } catch (error) {
            console.log('💾 Redis not available, using memory cache only');
            this.redis = null;
        }
    }

    // Get from cache
    async get(key) {
        try {
            if (this.redis) {
                const value = await this.redis.get(key);
                return value ? JSON.parse(value) : null;
            } else {
                // Fallback to memory cache
                const item = this.memoryCache.get(key);
                if (item && item.expiry > Date.now()) {
                    return item.value;
                } else if (item) {
                    this.memoryCache.delete(key);
                }
                return null;
            }
        } catch (error) {
            console.warn('Cache get error:', error.message);
            return null;
        }
    }

    // Set to cache
    async set(key, value, ttl = this.defaultTTL) {
        try {
            if (this.redis) {
                await this.redis.setex(key, ttl, JSON.stringify(value));
            } else {
                // Fallback to memory cache
                if (this.memoryCache.size >= this.maxMemoryItems) {
                    // Remove oldest items
                    const firstKey = this.memoryCache.keys().next().value;
                    this.memoryCache.delete(firstKey);
                }
                
                this.memoryCache.set(key, {
                    value,
                    expiry: Date.now() + (ttl * 1000)
                });
            }
        } catch (error) {
            console.warn('Cache set error:', error.message);
        }
    }

    // Delete from cache
    async del(key) {
        try {
            if (this.redis) {
                await this.redis.del(key);
            } else {
                this.memoryCache.delete(key);
            }
        } catch (error) {
            console.warn('Cache delete error:', error.message);
        }
    }

    // Clear all cache
    async clear() {
        try {
            if (this.redis) {
                await this.redis.flushall();
            } else {
                this.memoryCache.clear();
            }
        } catch (error) {
            console.warn('Cache clear error:', error.message);
        }
    }

    // Cache middleware for Express
    middleware(ttl = this.defaultTTL) {
        return async (req, res, next) => {
            // Only cache GET requests
            if (req.method !== 'GET') {
                return next();
            }

            const key = `cache:${req.originalUrl}`;
            
            try {
                const cached = await this.get(key);
                if (cached) {
                    res.setHeader('X-Cache', 'HIT');
                    return res.json(cached);
                }

                // Override res.json to cache the response
                const originalJson = res.json;
                res.json = function(body) {
                    // Cache successful responses only
                    if (res.statusCode === 200) {
                        cache.set(key, body, ttl).catch(console.warn);
                    }
                    res.setHeader('X-Cache', 'MISS');
                    return originalJson.call(this, body);
                };

                next();
            } catch (error) {
                console.warn('Cache middleware error:', error.message);
                next();
            }
        };
    }

    // Get cache stats
    async getStats() {
        try {
            if (this.redis) {
                const info = await this.redis.info('memory');
                return {
                    type: 'redis',
                    connected: true,
                    memory: info
                };
            } else {
                return {
                    type: 'memory',
                    connected: true,
                    size: this.memoryCache.size,
                    maxSize: this.maxMemoryItems
                };
            }
        } catch (error) {
            return {
                type: 'error',
                connected: false,
                error: error.message
            };
        }
    }

    // Close connections
    async close() {
        if (this.redis) {
            await this.redis.quit();
        }
        this.memoryCache.clear();
    }
}

// Create singleton instance
const cache = new CacheManager();

module.exports = cache;