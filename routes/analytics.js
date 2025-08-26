const express = require('express');
const router = express.Router();
const { verifyToken } = require('../auth');
const AnalyticsService = require('../services/AnalyticsService');
const ABTestService = require('../services/ABTestService');

const analyticsService = new AnalyticsService();
const abTestService = new ABTestService();

// Middleware for analytics routes
router.use(verifyToken);

// Track analytics event
router.post('/track', async (req, res) => {
    try {
        const { itemId, eventType, platform, metadata } = req.body;
        const sellerId = req.user.id; // From auth token
        
        const result = await analyticsService.trackEvent({
            sellerId,
            itemId,
            eventType,
            platform,
            metadata,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });
        
        if (result.success) {
            res.json({ success: true, eventId: result.eventId });
        } else {
            res.status(400).json({ success: false, error: result.error });
        }
        
    } catch (error) {
        console.error('Track analytics error:', error);
        res.status(500).json({ success: false, error: 'Failed to track event' });
    }
});

// Get seller analytics dashboard
router.get('/seller/dashboard', async (req, res) => {
    try {
        const sellerId = req.user.id;
        const days = parseInt(req.query.days) || 30;
        
        const result = await analyticsService.getSellerAnalytics(sellerId, days);
        
        if (result.success) {
            res.json(result);
        } else {
            res.status(400).json({ success: false, error: result.error });
        }
        
    } catch (error) {
        console.error('Get seller analytics error:', error);
        res.status(500).json({ success: false, error: 'Failed to get analytics data' });
    }
});

// Get admin analytics dashboard (admin only)
router.get('/admin/dashboard', async (req, res) => {
    try {
        // Check if user is admin
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, error: 'Admin access required' });
        }
        
        const days = parseInt(req.query.days) || 30;
        const result = await analyticsService.getAdminAnalytics(days);
        
        if (result.success) {
            res.json(result);
        } else {
            res.status(400).json({ success: false, error: result.error });
        }
        
    } catch (error) {
        console.error('Get admin analytics error:', error);
        res.status(500).json({ success: false, error: 'Failed to get admin analytics' });
    }
});

// Get item performance analytics
router.get('/item/:itemId', async (req, res) => {
    try {
        const itemId = req.params.itemId;
        const days = parseInt(req.query.days) || 30;
        
        const result = await analyticsService.getItemAnalytics(itemId, days);
        
        if (result.success) {
            res.json(result);
        } else {
            res.status(400).json({ success: false, error: result.error });
        }
        
    } catch (error) {
        console.error('Get item analytics error:', error);
        res.status(500).json({ success: false, error: 'Failed to get item analytics' });
    }
});

// Create A/B test
router.post('/ab-test/create', async (req, res) => {
    try {
        // Only admin can create A/B tests
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, error: 'Admin access required' });
        }
        
        const result = await analyticsService.createABTest(req.body);
        
        if (result.success) {
            res.json(result);
        } else {
            res.status(400).json({ success: false, error: result.error });
        }
        
    } catch (error) {
        console.error('Create A/B test error:', error);
        res.status(500).json({ success: false, error: 'Failed to create A/B test' });
    }
});

// Get A/B test results
router.get('/ab-test/:testName/results', async (req, res) => {
    try {
        const testName = req.params.testName;
        const result = await analyticsService.getABTestResults(testName);
        
        if (result.success) {
            res.json(result);
        } else {
            res.status(400).json({ success: false, error: result.error });
        }
        
    } catch (error) {
        console.error('Get A/B test results error:', error);
        res.status(500).json({ success: false, error: 'Failed to get A/B test results' });
    }
});

// Get platform comparison
router.get('/platform-comparison', async (req, res) => {
    try {
        const sellerId = req.user.id;
        const days = parseInt(req.query.days) || 30;
        
        // Get seller analytics for platform comparison
        const result = await analyticsService.getSellerAnalytics(sellerId, days);
        
        if (result.success && result.data.platformBreakdown) {
            // Format for comparison view
            const comparison = result.data.platformBreakdown.map(platform => ({
                platform: platform.platform,
                performance: {
                    views: platform.views,
                    clicks: platform.clicks,
                    clickRate: platform.click_rate,
                    events: platform.total_events
                },
                recommendation: getPerformanceRecommendation(platform)
            }));
            
            res.json({ success: true, comparison });
        } else {
            res.status(400).json({ success: false, error: result.error || 'No platform data available' });
        }
        
    } catch (error) {
        console.error('Platform comparison error:', error);
        res.status(500).json({ success: false, error: 'Failed to get platform comparison' });
    }
});

// Get active A/B tests
router.get('/ab-test/active', async (req, res) => {
    try {
        const result = await abTestService.getActiveTests();
        
        if (result.success) {
            res.json(result);
        } else {
            res.status(400).json({ success: false, error: result.error });
        }
        
    } catch (error) {
        console.error('Get active tests error:', error);
        res.status(500).json({ success: false, error: 'Failed to get active tests' });
    }
});

// Stop A/B test
router.post('/ab-test/:testName/stop', async (req, res) => {
    try {
        // Only admin can stop tests
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, error: 'Admin access required' });
        }
        
        const testName = req.params.testName;
        const result = await abTestService.stopTest(testName, 'admin_manual_stop');
        
        if (result.success) {
            res.json(result);
        } else {
            res.status(400).json({ success: false, error: result.error });
        }
        
    } catch (error) {
        console.error('Stop test error:', error);
        res.status(500).json({ success: false, error: 'Failed to stop test' });
    }
});

// Record A/B test event
router.post('/ab-test/event', async (req, res) => {
    try {
        const { testId, eventType, metadata } = req.body;
        
        const result = await abTestService.recordTestEvent(testId, eventType, metadata);
        
        if (result.success) {
            res.json(result);
        } else {
            res.status(400).json({ success: false, error: result.error });
        }
        
    } catch (error) {
        console.error('Record test event error:', error);
        res.status(500).json({ success: false, error: 'Failed to record test event' });
    }
});

// Helper function for performance recommendations
function getPerformanceRecommendation(platform) {
    const clickRate = platform.click_rate || 0;
    const views = platform.views || 0;
    
    if (clickRate > 5) {
        return { level: 'excellent', message: 'Great engagement! Consider increasing posting frequency.' };
    } else if (clickRate > 2) {
        return { level: 'good', message: 'Good performance. Try A/B testing different titles.' };
    } else if (views > 10) {
        return { level: 'fair', message: 'Getting views but low clicks. Improve descriptions or images.' };
    } else {
        return { level: 'poor', message: 'Low visibility. Consider better tags and timing of posts.' };
    }
}

module.exports = router;