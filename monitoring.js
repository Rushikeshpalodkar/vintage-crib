const os = require('os');
const { customLogger } = require('./logger');

class SystemMonitor {
    constructor() {
        this.metrics = {
            requests: 0,
            errors: 0,
            responseTime: [],
            memory: [],
            cpu: [],
            startTime: Date.now()
        };
        
        this.isMonitoring = false;
        this.monitoringInterval = null;
    }

    // Start system monitoring
    start(intervalMs = 60000) { // Default: 1 minute
        if (this.isMonitoring) return;
        
        this.isMonitoring = true;
        this.monitoringInterval = setInterval(() => {
            this.collectSystemMetrics();
        }, intervalMs);
        
        customLogger.performance('SystemMonitor', 'Started', 'status');
    }

    // Stop monitoring
    stop() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
        this.isMonitoring = false;
        customLogger.performance('SystemMonitor', 'Stopped', 'status');
    }

    // Collect system metrics
    collectSystemMetrics() {
        const memoryUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();
        
        // Store metrics (keep last 100 entries)
        this.metrics.memory.push({
            timestamp: Date.now(),
            rss: memoryUsage.rss,
            heapTotal: memoryUsage.heapTotal,
            heapUsed: memoryUsage.heapUsed,
            external: memoryUsage.external
        });
        
        this.metrics.cpu.push({
            timestamp: Date.now(),
            user: cpuUsage.user,
            system: cpuUsage.system
        });

        // Keep only last 100 entries
        if (this.metrics.memory.length > 100) {
            this.metrics.memory.shift();
        }
        if (this.metrics.cpu.length > 100) {
            this.metrics.cpu.shift();
        }

        // Log critical metrics
        const memoryMB = Math.round(memoryUsage.rss / 1024 / 1024);
        if (memoryMB > 500) { // Alert if memory > 500MB
            customLogger.performance('HighMemoryUsage', memoryMB, 'MB');
        }

        // Log system stats
        customLogger.performance('SystemMetrics', {
            memory: `${memoryMB}MB`,
            uptime: `${Math.round(process.uptime())}s`,
            requests: this.metrics.requests,
            errors: this.metrics.errors
        });
    }

    // Record request
    recordRequest(responseTime, statusCode) {
        this.metrics.requests++;
        
        if (statusCode >= 400) {
            this.metrics.errors++;
        }
        
        this.metrics.responseTime.push({
            timestamp: Date.now(),
            time: responseTime,
            statusCode
        });

        // Keep only last 1000 response times
        if (this.metrics.responseTime.length > 1000) {
            this.metrics.responseTime.shift();
        }

        // Alert on slow responses
        if (responseTime > 5000) { // > 5 seconds
            customLogger.performance('SlowResponse', responseTime, 'ms');
        }
    }

    // Get current metrics
    getMetrics() {
        const now = Date.now();
        const uptime = now - this.metrics.startTime;
        const recentResponses = this.metrics.responseTime.filter(r => 
            now - r.timestamp < 300000 // Last 5 minutes
        );

        const avgResponseTime = recentResponses.length > 0 
            ? recentResponses.reduce((sum, r) => sum + r.time, 0) / recentResponses.length 
            : 0;

        const currentMemory = process.memoryUsage();
        
        return {
            uptime: uptime,
            requests: {
                total: this.metrics.requests,
                recent: recentResponses.length,
                avgResponseTime: Math.round(avgResponseTime)
            },
            errors: {
                total: this.metrics.errors,
                rate: this.metrics.requests > 0 ? (this.metrics.errors / this.metrics.requests * 100).toFixed(2) : 0
            },
            system: {
                memory: {
                    rss: Math.round(currentMemory.rss / 1024 / 1024),
                    heapTotal: Math.round(currentMemory.heapTotal / 1024 / 1024),
                    heapUsed: Math.round(currentMemory.heapUsed / 1024 / 1024),
                    external: Math.round(currentMemory.external / 1024 / 1024)
                },
                cpu: {
                    loadAverage: os.loadavg(),
                    cores: os.cpus().length
                },
                os: {
                    platform: os.platform(),
                    arch: os.arch(),
                    nodeVersion: process.version,
                    totalMemory: Math.round(os.totalmem() / 1024 / 1024 / 1024),
                    freeMemory: Math.round(os.freemem() / 1024 / 1024 / 1024)
                }
            },
            timestamp: now
        };
    }

    // Get health status
    getHealthStatus() {
        const metrics = this.getMetrics();
        const memoryUsagePct = (metrics.system.memory.rss / (metrics.system.os.totalMemory * 1024)) * 100;
        const errorRate = parseFloat(metrics.errors.rate);
        
        let status = 'healthy';
        let issues = [];

        // Check memory usage
        if (memoryUsagePct > 80) {
            status = 'warning';
            issues.push(`High memory usage: ${memoryUsagePct.toFixed(1)}%`);
        }

        // Check error rate
        if (errorRate > 10) {
            status = 'warning';
            issues.push(`High error rate: ${errorRate}%`);
        }

        // Check response time
        if (metrics.requests.avgResponseTime > 2000) {
            status = 'warning';
            issues.push(`Slow response time: ${metrics.requests.avgResponseTime}ms`);
        }

        // Critical thresholds
        if (memoryUsagePct > 95 || errorRate > 50) {
            status = 'critical';
        }

        return {
            status,
            issues,
            metrics: {
                memoryUsage: `${memoryUsagePct.toFixed(1)}%`,
                errorRate: `${errorRate}%`,
                avgResponseTime: `${metrics.requests.avgResponseTime}ms`,
                uptime: `${Math.round(metrics.uptime / 1000)}s`
            }
        };
    }

    // Express middleware for monitoring
    middleware() {
        return (req, res, next) => {
            const startTime = Date.now();
            
            // Override res.end to capture metrics
            const originalEnd = res.end;
            res.end = (...args) => {
                const responseTime = Date.now() - startTime;
                this.recordRequest(responseTime, res.statusCode);
                originalEnd.apply(res, args);
            };
            
            next();
        };
    }

    // Reset metrics
    reset() {
        this.metrics = {
            requests: 0,
            errors: 0,
            responseTime: [],
            memory: [],
            cpu: [],
            startTime: Date.now()
        };
        customLogger.performance('MetricsReset', 'Metrics reset', 'status');
    }
}

// Create singleton instance
const monitor = new SystemMonitor();

module.exports = monitor;