const express = require('express');
const { verifyToken, authenticateAdmin } = require('../auth');
const VintageSubscriptionService = require('../services/VintageSubscriptionService');
const { User } = require('../database/models');
const router = express.Router();

const subscriptionService = new VintageSubscriptionService();

// =============================================================================
// ADMIN SUBSCRIPTION MANAGEMENT ROUTES
// =============================================================================

// Get subscription analytics dashboard
router.get('/admin/subscriptions/analytics', verifyToken, authenticateAdmin, async (req, res) => {
    try {
        const analytics = await subscriptionService.getSubscriptionAnalytics();
        
        res.json({
            success: true,
            analytics
        });
        
    } catch (error) {
        console.error('Subscription analytics error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load subscription analytics'
        });
    }
});

// Get all user subscriptions for admin management
router.get('/admin/subscriptions/users', verifyToken, authenticateAdmin, async (req, res) => {
    try {
        const { limit = 50, offset = 0, tier = null, status = null } = req.query;
        
        let subscriptions = await subscriptionService.getAllUserSubscriptions(
            parseInt(limit), 
            parseInt(offset)
        );
        
        // Filter by tier if specified
        if (tier) {
            subscriptions = subscriptions.filter(sub => sub.tier === tier);
        }
        
        // Filter by status if specified
        if (status) {
            subscriptions = subscriptions.filter(sub => sub.status === status);
        }
        
        res.json({
            success: true,
            subscriptions,
            pagination: {
                limit: parseInt(limit),
                offset: parseInt(offset),
                hasMore: subscriptions.length === parseInt(limit)
            }
        });
        
    } catch (error) {
        console.error('Get subscriptions error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load user subscriptions'
        });
    }
});

// Upgrade user subscription (Admin only)
router.post('/admin/subscriptions/:userId/upgrade', verifyToken, authenticateAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const { newTier, reason } = req.body;
        const adminId = req.user.id;
        
        if (!newTier) {
            return res.status(400).json({
                success: false,
                error: 'New tier is required'
            });
        }
        
        const tierDetails = subscriptionService.getTierDetails(newTier);
        if (!tierDetails) {
            return res.status(400).json({
                success: false,
                error: 'Invalid subscription tier'
            });
        }
        
        const updatedSubscription = await subscriptionService.upgradeUserSubscription(
            userId, 
            newTier, 
            adminId
        );
        
        res.json({
            success: true,
            subscription: updatedSubscription,
            message: `User successfully upgraded to ${tierDetails.name}`
        });
        
    } catch (error) {
        console.error('Upgrade subscription error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to upgrade subscription'
        });
    }
});

// Downgrade user subscription (Admin only)
router.post('/admin/subscriptions/:userId/downgrade', verifyToken, authenticateAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const { newTier, reason } = req.body;
        const adminId = req.user.id;
        
        if (!newTier) {
            return res.status(400).json({
                success: false,
                error: 'New tier is required'
            });
        }
        
        const tierDetails = subscriptionService.getTierDetails(newTier);
        if (!tierDetails) {
            return res.status(400).json({
                success: false,
                error: 'Invalid subscription tier'
            });
        }
        
        const updatedSubscription = await subscriptionService.downgradeUserSubscription(
            userId, 
            newTier, 
            adminId, 
            reason || 'admin_action'
        );
        
        res.json({
            success: true,
            subscription: updatedSubscription,
            message: `User successfully downgraded to ${tierDetails.name}`
        });
        
    } catch (error) {
        console.error('Downgrade subscription error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to downgrade subscription'
        });
    }
});

// Get subscription tiers and pricing
router.get('/admin/subscriptions/tiers', verifyToken, authenticateAdmin, async (req, res) => {
    try {
        const tiers = subscriptionService.getAllTiers();
        
        res.json({
            success: true,
            tiers
        });
        
    } catch (error) {
        console.error('Get tiers error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load subscription tiers'
        });
    }
});

// Get user's current subscription and recommendations
router.get('/admin/subscriptions/:userId/details', verifyToken, authenticateAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        
        const subscription = await subscriptionService.getUserSubscription(userId);
        const tierDetails = subscriptionService.getTierDetails(subscription.tier);
        const recommendations = subscriptionService.getUpgradeRecommendations(subscription.tier);
        const limitWarnings = await subscriptionService.checkAndNotifyLimits(userId);
        
        res.json({
            success: true,
            subscription: {
                ...subscription,
                tierDetails
            },
            recommendations,
            limitWarnings
        });
        
    } catch (error) {
        console.error('Get subscription details error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load subscription details'
        });
    }
});

// Bulk subscription operations
router.post('/admin/subscriptions/bulk-action', verifyToken, authenticateAdmin, async (req, res) => {
    try {
        const { action, userIds, newTier, reason } = req.body;
        const adminId = req.user.id;
        
        if (!action || !userIds || !Array.isArray(userIds)) {
            return res.status(400).json({
                success: false,
                error: 'Action and user IDs array are required'
            });
        }
        
        const results = [];
        
        for (const userId of userIds) {
            try {
                let result;
                
                switch (action) {
                    case 'upgrade':
                        result = await subscriptionService.upgradeUserSubscription(userId, newTier, adminId);
                        break;
                    case 'downgrade':
                        result = await subscriptionService.downgradeUserSubscription(userId, newTier, adminId, reason);
                        break;
                    default:
                        throw new Error('Invalid action');
                }
                
                results.push({
                    userId,
                    success: true,
                    subscription: result
                });
                
            } catch (error) {
                results.push({
                    userId,
                    success: false,
                    error: error.message
                });
            }
        }
        
        const successCount = results.filter(r => r.success).length;
        
        res.json({
            success: true,
            results,
            summary: {
                total: userIds.length,
                successful: successCount,
                failed: userIds.length - successCount
            }
        });
        
    } catch (error) {
        console.error('Bulk subscription action error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to perform bulk action'
        });
    }
});

// =============================================================================
// USER SUBSCRIPTION INFO ROUTES (for frontend)
// =============================================================================

// Get current user's subscription
router.get('/subscriptions/my-subscription', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        
        const subscription = await subscriptionService.getUserSubscription(userId);
        const tierDetails = subscriptionService.getTierDetails(subscription.tier);
        const recommendations = subscriptionService.getUpgradeRecommendations(subscription.tier);
        const limitWarnings = await subscriptionService.checkAndNotifyLimits(userId);
        
        res.json({
            success: true,
            subscription: {
                ...subscription,
                tierDetails
            },
            recommendations,
            limitWarnings
        });
        
    } catch (error) {
        console.error('Get my subscription error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load subscription details'
        });
    }
});

// Get available subscription tiers for upgrade
router.get('/subscriptions/tiers', async (req, res) => {
    try {
        const tiers = subscriptionService.getAllTiers();
        
        // Remove sensitive admin info from public response
        const publicTiers = Object.entries(tiers).reduce((acc, [key, tier]) => {
            acc[key] = {
                name: tier.name,
                price: tier.price,
                maxItems: tier.maxItems,
                crossPostPlatforms: tier.crossPostPlatforms,
                featuresIncluded: tier.featuresIncluded,
                description: tier.description,
                support: tier.support
            };
            return acc;
        }, {});
        
        res.json({
            success: true,
            tiers: publicTiers
        });
        
    } catch (error) {
        console.error('Get public tiers error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load subscription tiers'
        });
    }
});

// Check subscription limits for specific action
router.post('/subscriptions/check-limit', verifyToken, async (req, res) => {
    try {
        const { action, currentCount } = req.body;
        const userId = req.user.id;
        
        const limitCheck = await subscriptionService.checkSubscriptionLimit(userId, action, currentCount);
        
        res.json({
            success: true,
            limitCheck
        });
        
    } catch (error) {
        console.error('Check subscription limit error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to check subscription limits'
        });
    }
});

module.exports = router;