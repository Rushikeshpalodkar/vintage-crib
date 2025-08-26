const express = require('express');
const { verifyToken } = require('../auth');
const UserVintageService = require('../services/UserVintageService');
const router = express.Router();

// Initialize UserVintageService
const userVintageService = new UserVintageService();

// Middleware for vintage access control
const vintageAccess = userVintageService.createVintageAccessMiddleware();
const vintageProAccess = userVintageService.createVintageAccessMiddleware('cross_post_auto');
const vintageBulkAccess = userVintageService.createVintageAccessMiddleware('bulk_tools');

// =============================================================================
// USER REGISTRATION & ONBOARDING
// =============================================================================

// Create vintage seller profile for existing user
router.post('/auth/vintage/setup', verifyToken, async (req, res) => {
    try {
        const { store_name, bio, instagram_handle, subscription_tier } = req.body;
        
        const seller = await userVintageService.extendUserForVintage(req.user.id, {
            store_name,
            bio,
            instagram_handle,
            subscription_tier: subscription_tier || 'free'
        });

        res.json({
            success: true,
            message: 'Vintage seller profile created successfully',
            seller,
            tier: userVintageService.subscriptionTiers[seller.subscription_tier]
        });

    } catch (error) {
        console.error('Vintage setup error:', error);
        res.status(500).json({ 
            error: 'Failed to create vintage seller profile',
            details: error.message 
        });
    }
});

// Check vintage access status
router.get('/auth/vintage/status', verifyToken, async (req, res) => {
    try {
        const accessCheck = await userVintageService.checkVintageAccess(req.user.id);
        const stats = await userVintageService.getUserStats(req.user.id);

        res.json({
            success: true,
            access: accessCheck,
            stats,
            subscriptionInfo: userVintageService.getSubscriptionInfo()
        });

    } catch (error) {
        console.error('Vintage status error:', error);
        res.status(500).json({ error: 'Failed to get vintage status' });
    }
});

// =============================================================================
// SUBSCRIPTION MANAGEMENT
// =============================================================================

// Get available subscription tiers
router.get('/auth/vintage/tiers', async (req, res) => {
    try {
        const subscriptionInfo = userVintageService.getSubscriptionInfo();
        
        res.json({
            success: true,
            ...subscriptionInfo
        });

    } catch (error) {
        console.error('Get tiers error:', error);
        res.status(500).json({ error: 'Failed to get subscription tiers' });
    }
});

// Upgrade subscription
router.post('/auth/vintage/upgrade', verifyToken, async (req, res) => {
    try {
        const { tier, paymentInfo } = req.body;
        
        if (!tier) {
            return res.status(400).json({ error: 'Subscription tier required' });
        }

        const result = await userVintageService.upgradeSubscription(
            req.user.id,
            tier,
            paymentInfo
        );

        res.json({
            success: true,
            message: `Successfully upgraded to ${tier} tier`,
            seller: result.seller,
            tier: result.tier
        });

    } catch (error) {
        console.error('Upgrade error:', error);
        res.status(400).json({ 
            error: 'Upgrade failed',
            details: error.message 
        });
    }
});

// =============================================================================
// USER DASHBOARD & ANALYTICS
// =============================================================================

// Get user dashboard with vintage-specific data
router.get('/auth/vintage/dashboard', verifyToken, vintageAccess, async (req, res) => {
    try {
        const stats = await userVintageService.getUserStats(req.user.id);
        const { VintageItem } = require('../database/models');
        
        // Get recent activity
        const recentItems = await VintageItem.getBySeller(req.seller.id, 5, 0);
        
        // Get subscription info
        const tierInfo = userVintageService.subscriptionTiers[req.seller.subscription_tier];

        res.json({
            success: true,
            user: {
                id: req.user.id,
                username: req.user.username,
                role: req.user.role
            },
            seller: req.seller,
            stats,
            recentItems,
            tierInfo,
            accessLevel: req.vintageAccess
        });

    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({ error: 'Failed to load dashboard' });
    }
});

// Get detailed analytics (Pro+ only)
router.get('/auth/vintage/analytics', verifyToken, async (req, res) => {
    try {
        const accessCheck = await userVintageService.checkVintageAccess(
            req.user.id, 
            'analytics_advanced'
        );

        if (!accessCheck.hasAccess) {
            return res.status(403).json({
                error: 'Advanced analytics requires Pro subscription',
                currentTier: accessCheck.currentTier,
                requiredTier: accessCheck.requiredTier
            });
        }

        // Get advanced analytics
        const { VintageItem, CrossPost } = require('../database/models');
        const items = await VintageItem.getBySeller(accessCheck.seller.id, 1000, 0);
        
        // Platform performance
        const platformStats = {};
        for (const item of items) {
            const publishedTo = Array.isArray(item.published_to) 
                ? item.published_to 
                : JSON.parse(item.published_to || '[]');
            
            publishedTo.forEach(platform => {
                if (!platformStats[platform]) {
                    platformStats[platform] = { items: 0, revenue: 0, views: 0 };
                }
                platformStats[platform].items++;
                if (item.status === 'sold') {
                    platformStats[platform].revenue += item.price || 0;
                }
                platformStats[platform].views += item.views || 0;
            });
        }

        // Time-based analytics
        const last30Days = new Date();
        last30Days.setDate(last30Days.getDate() - 30);
        
        const recentItems = items.filter(item => 
            new Date(item.created_at) > last30Days
        );

        res.json({
            success: true,
            analytics: {
                platformStats,
                recentActivity: {
                    itemsListed: recentItems.length,
                    itemsSold: recentItems.filter(item => item.status === 'sold').length,
                    revenue: recentItems
                        .filter(item => item.status === 'sold')
                        .reduce((sum, item) => sum + (item.price || 0), 0)
                },
                topPerformers: items
                    .sort((a, b) => (b.views || 0) - (a.views || 0))
                    .slice(0, 5),
                categoryBreakdown: this.getCategoryBreakdown(items)
            }
        });

    } catch (error) {
        console.error('Analytics error:', error);
        res.status(500).json({ error: 'Failed to load analytics' });
    }
});

// =============================================================================
// ADMIN-ONLY ENDPOINTS
// =============================================================================

// Create new admin user
router.post('/auth/vintage/create-admin', verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const { username, password, email } = req.body;
        
        if (!username || !password || !email) {
            return res.status(400).json({ 
                error: 'Username, password, and email are required' 
            });
        }

        const result = await userVintageService.createAdminUser(username, password, email);
        
        if (result.success) {
            res.status(201).json(result);
        } else {
            res.status(400).json(result);
        }

    } catch (error) {
        console.error('Create admin error:', error);
        res.status(500).json({ error: 'Failed to create admin user' });
    }
});

// Get all users with vintage profiles (admin only)
router.get('/auth/vintage/users', verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const { VintageSeller, User } = require('../database/models');
        const sellers = await VintageSeller.getAll(100, 0);
        
        const usersWithStats = await Promise.all(
            sellers.map(async seller => {
                const stats = await userVintageService.getUserStats(seller.user_id);
                return { seller, stats };
            })
        );

        res.json({
            success: true,
            users: usersWithStats,
            total: usersWithStats.length
        });

    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'Failed to get users' });
    }
});

// Helper function for category breakdown
function getCategoryBreakdown(items) {
    const breakdown = {};
    items.forEach(item => {
        const category = item.category || 'uncategorized';
        if (!breakdown[category]) {
            breakdown[category] = { count: 0, revenue: 0 };
        }
        breakdown[category].count++;
        if (item.status === 'sold') {
            breakdown[category].revenue += item.price || 0;
        }
    });
    return breakdown;
}

// Export middleware for use in other routes
router.vintageAccess = vintageAccess;
router.vintageProAccess = vintageProAccess;
router.vintageBulkAccess = vintageBulkAccess;

module.exports = router;