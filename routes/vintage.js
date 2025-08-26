const express = require('express');
const { VintageItem, VintageSeller, User } = require('../database/models');
const { authenticateAdmin, verifyToken } = require('../auth');
const CrossPostingEngine = require('../services/CrossPostingEngine');
const VintageSubscriptionService = require('../services/VintageSubscriptionService');
const router = express.Router();

const subscriptionService = new VintageSubscriptionService();

// Initialize CrossPostingEngine with existing eBay API
let crossPostingEngine;
try {
    // Try to get the eBay instance from the main server
    const eBayAPI = global.eBay || null;
    crossPostingEngine = new CrossPostingEngine(eBayAPI);
    console.log('✅ CrossPostingEngine initialized');
} catch (error) {
    console.log('⚠️ CrossPostingEngine initialized without eBay API');
    crossPostingEngine = new CrossPostingEngine();
}

// Middleware to authenticate user (reuse the existing verifyToken middleware)
const authenticateUser = verifyToken;

// =============================================================================
// VINTAGE DASHBOARD ROUTES
// =============================================================================

// Get vintage seller dashboard data
router.get('/vintage/dashboard', authenticateUser, async (req, res) => {
    try {
        // Get seller profile for this user
        const seller = await VintageSeller.findByUserId(req.user.id);
        
        if (!seller) {
            return res.status(404).json({ 
                error: 'Seller profile not found. Create a seller profile first.' 
            });
        }

        // Get seller's items with stats
        const items = await VintageItem.getBySeller(seller.id, 100, 0);
        
        // Calculate dashboard stats
        const stats = {
            totalItems: items.length,
            publishedItems: items.filter(item => item.status === 'published').length,
            soldItems: items.filter(item => item.status === 'sold').length,
            totalViews: items.reduce((sum, item) => sum + (item.views || 0), 0),
            totalLikes: items.reduce((sum, item) => sum + (item.likes || 0), 0),
            totalRevenue: items
                .filter(item => item.status === 'sold')
                .reduce((sum, item) => sum + (item.price || 0), 0)
        };

        // Recent activity (last 10 items)
        const recentItems = items
            .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
            .slice(0, 10);

        res.json({
            success: true,
            seller,
            stats,
            recentItems,
            items
        });

    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({ error: 'Failed to load dashboard data' });
    }
});

// =============================================================================
// VINTAGE ITEM MANAGEMENT
// =============================================================================

// Create new vintage item
router.post('/vintage/items', authenticateUser, async (req, res) => {
    try {
        const seller = await VintageSeller.findByUserId(req.user.id);
        
        if (!seller) {
            return res.status(400).json({ 
                error: 'Seller profile required. Create a seller profile first.' 
            });
        }

        // Check subscription limits
        const currentItemCount = await VintageItem.getBySeller(seller.id, 1000, 0);
        const limitCheck = await subscriptionService.checkSubscriptionLimit(
            req.user.id, 
            'create_item', 
            currentItemCount.length
        );

        if (!limitCheck.allowed) {
            const subscription = await subscriptionService.getUserSubscription(req.user.id);
            const tierDetails = subscriptionService.getTierDetails(subscription.tier);
            
            return res.status(403).json({
                success: false,
                error: 'Item limit reached for your subscription tier',
                limit: limitCheck.limit,
                current: limitCheck.current,
                tier: subscription.tier,
                tierName: tierDetails.name,
                upgradeRecommendations: subscriptionService.getUpgradeRecommendations(subscription.tier)
            });
        }

        const itemData = {
            ...req.body,
            seller_id: seller.id
        };

        // Validate required fields
        const required = ['title', 'price'];
        const missing = required.filter(field => !itemData[field]);
        
        if (missing.length > 0) {
            return res.status(400).json({ 
                error: `Missing required fields: ${missing.join(', ')}` 
            });
        }

        // Create the item
        const item = await VintageItem.create(itemData);
        
        res.status(201).json({
            success: true,
            message: 'Vintage item created successfully',
            item
        });

    } catch (error) {
        console.error('Create item error:', error);
        res.status(500).json({ error: 'Failed to create vintage item' });
    }
});

// Update vintage item
router.put('/vintage/items/:id', authenticateUser, async (req, res) => {
    try {
        const itemId = req.params.id;
        const updates = req.body;
        
        // Check if item exists and belongs to this seller
        const existingItem = await VintageItem.findById(itemId);
        if (!existingItem) {
            return res.status(404).json({ error: 'Item not found' });
        }

        const seller = await VintageSeller.findByUserId(req.user.id);
        if (!seller || existingItem.seller_id !== seller.id) {
            return res.status(403).json({ error: 'Not authorized to update this item' });
        }

        // Remove fields that shouldn't be updated
        delete updates.id;
        delete updates.seller_id;
        delete updates.created_at;

        // Update the item
        const updatedItem = await VintageItem.update(itemId, updates);
        
        res.json({
            success: true,
            message: 'Item updated successfully',
            item: updatedItem
        });

    } catch (error) {
        console.error('Update item error:', error);
        res.status(500).json({ error: 'Failed to update item' });
    }
});

// Delete vintage item
router.delete('/vintage/items/:id', authenticateUser, async (req, res) => {
    try {
        const itemId = req.params.id;
        
        // Check if item exists and belongs to this seller
        const existingItem = await VintageItem.findById(itemId);
        if (!existingItem) {
            return res.status(404).json({ error: 'Item not found' });
        }

        const seller = await VintageSeller.findByUserId(req.user.id);
        if (!seller || existingItem.seller_id !== seller.id) {
            return res.status(403).json({ error: 'Not authorized to delete this item' });
        }

        // Delete the item
        await VintageItem.delete(itemId);
        
        res.json({
            success: true,
            message: 'Item deleted successfully'
        });

    } catch (error) {
        console.error('Delete item error:', error);
        res.status(500).json({ error: 'Failed to delete item' });
    }
});

// =============================================================================
// MARKETPLACE PUBLISHING
// =============================================================================

// Publish item to multiple marketplaces
router.post('/vintage/items/:id/publish', authenticateUser, async (req, res) => {
    try {
        const itemId = req.params.id;
        const { platforms = [], autoPublish = false } = req.body;
        
        // Check subscription limits for cross-posting
        const platformCheck = await subscriptionService.checkSubscriptionLimit(req.user.id, 'cross_post');
        
        // Filter platforms based on subscription
        const allowedPlatforms = platformCheck.platforms || ['vintage_crib'];
        const requestedPlatforms = platforms.length > 0 ? platforms : ['vintage_crib'];
        const deniedPlatforms = requestedPlatforms.filter(p => !allowedPlatforms.includes(p));
        
        if (deniedPlatforms.length > 0) {
            const subscription = await subscriptionService.getUserSubscription(req.user.id);
            const tierDetails = subscriptionService.getTierDetails(subscription.tier);
            
            return res.status(403).json({
                success: false,
                error: `Platforms not available in your subscription tier: ${deniedPlatforms.join(', ')}`,
                allowedPlatforms,
                tier: subscription.tier,
                tierName: tierDetails.name,
                upgradeRecommendations: subscriptionService.getUpgradeRecommendations(subscription.tier)
            });
        }
        
        // Validate platforms
        const validPlatforms = ['ebay', 'poshmark', 'depop', 'vintage_crib'];
        const invalidPlatforms = requestedPlatforms.filter(p => !validPlatforms.includes(p));
        
        if (invalidPlatforms.length > 0) {
            return res.status(400).json({ 
                error: `Invalid platforms: ${invalidPlatforms.join(', ')}` 
            });
        }

        // Check if item exists and belongs to this seller
        const item = await VintageItem.findById(itemId);
        if (!item) {
            return res.status(404).json({ error: 'Item not found' });
        }

        const seller = await VintageSeller.findByUserId(req.user.id);
        if (!seller || item.seller_id !== seller.id) {
            return res.status(403).json({ error: 'Not authorized to publish this item' });
        }

        // Use the advanced CrossPostingEngine
        const publishResults = await crossPostingEngine.publishToAllPlatforms(
            itemId, 
            req.user.id, 
            platforms
        );

        res.json({
            success: publishResults.success,
            message: `Published to ${publishResults.publishedCount} of ${publishResults.totalPlatforms} platforms`,
            results: publishResults.results,
            publishedCount: publishResults.publishedCount,
            totalPlatforms: publishResults.totalPlatforms
        });

    } catch (error) {
        console.error('Publish error:', error);
        res.status(500).json({ error: 'Failed to publish item' });
    }
});

// =============================================================================
// PUBLIC PORTFOLIO
// =============================================================================

// Get public seller portfolio
router.get('/vintage/portfolio/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        
        // Get seller by user ID
        const seller = await VintageSeller.findByUserId(userId);
        if (!seller) {
            return res.status(404).json({ error: 'Seller portfolio not found' });
        }

        // Get published items only
        const items = await VintageItem.getBySeller(seller.id, 50, 0);
        const publishedItems = items.filter(item => item.status === 'published');

        // Public stats (no sensitive data)
        const publicStats = {
            totalItems: publishedItems.length,
            totalLikes: publishedItems.reduce((sum, item) => sum + (item.likes || 0), 0),
            avgPrice: publishedItems.length > 0 
                ? publishedItems.reduce((sum, item) => sum + item.price, 0) / publishedItems.length 
                : 0,
            memberSince: seller.created_at
        };

        // Remove sensitive seller data
        const publicSeller = {
            id: seller.id,
            store_name: seller.store_name,
            bio: seller.bio,
            instagram_handle: seller.instagram_handle,
            profile_image: seller.profile_image,
            is_verified: seller.is_verified,
            rating: seller.rating,
            total_sales: seller.total_sales,
            created_at: seller.created_at
        };

        res.json({
            success: true,
            seller: publicSeller,
            items: publishedItems,
            stats: publicStats
        });

    } catch (error) {
        console.error('Portfolio error:', error);
        res.status(500).json({ error: 'Failed to load seller portfolio' });
    }
});

// =============================================================================
// SELLER PROFILE MANAGEMENT
// =============================================================================

// Create seller profile
router.post('/vintage/profile', authenticateUser, async (req, res) => {
    try {
        // Check if seller profile already exists
        const existingSeller = await VintageSeller.findByUserId(req.user.id);
        if (existingSeller) {
            return res.status(400).json({ error: 'Seller profile already exists' });
        }

        const profileData = {
            ...req.body,
            user_id: req.user.id
        };

        // Validate required fields
        if (!profileData.store_name) {
            return res.status(400).json({ error: 'Store name is required' });
        }

        const seller = await VintageSeller.create(profileData);
        
        res.status(201).json({
            success: true,
            message: 'Seller profile created successfully',
            seller
        });

    } catch (error) {
        console.error('Create profile error:', error);
        res.status(500).json({ error: 'Failed to create seller profile' });
    }
});

// Update seller profile
router.put('/vintage/profile', authenticateUser, async (req, res) => {
    try {
        const seller = await VintageSeller.findByUserId(req.user.id);
        if (!seller) {
            return res.status(404).json({ error: 'Seller profile not found' });
        }

        const updates = req.body;
        delete updates.user_id; // Don't allow changing user_id

        // Update seller profile (you'll need to implement this method)
        const updatedSeller = await VintageSeller.update(seller.id, updates);
        
        res.json({
            success: true,
            message: 'Profile updated successfully',
            seller: updatedSeller
        });

    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Failed to update seller profile' });
    }
});

// =============================================================================
// ADDITIONAL MARKETPLACE ENDPOINTS
// =============================================================================

// Get cross-posting statistics for seller
router.get('/vintage/stats/crosspost', authenticateUser, async (req, res) => {
    try {
        const seller = await VintageSeller.findByUserId(req.user.id);
        if (!seller) {
            return res.status(404).json({ error: 'Seller profile not found' });
        }

        const stats = await crossPostingEngine.getCrossPostStats(seller.id);
        
        res.json({
            success: true,
            stats
        });

    } catch (error) {
        console.error('Cross-post stats error:', error);
        res.status(500).json({ error: 'Failed to get cross-post statistics' });
    }
});

// Retry failed cross-posts
router.post('/vintage/retry-failed', authenticateUser, async (req, res) => {
    try {
        const { platform } = req.body;
        const seller = await VintageSeller.findByUserId(req.user.id);
        if (!seller) {
            return res.status(404).json({ error: 'Seller profile not found' });
        }

        const results = await crossPostingEngine.retryFailedPosts(seller.id, platform);
        
        res.json({
            success: true,
            message: 'Retry completed',
            results
        });

    } catch (error) {
        console.error('Retry failed posts error:', error);
        res.status(500).json({ error: 'Failed to retry failed posts' });
    }
});

// Import from eBay URL
router.post('/vintage/import/ebay', authenticateUser, async (req, res) => {
    try {
        const { ebayUrl } = req.body;
        const seller = await VintageSeller.findByUserId(req.user.id);
        
        if (!seller) {
            return res.status(404).json({ error: 'Seller profile required' });
        }

        // Use the VintageEbayService to import
        const ebayService = crossPostingEngine.ebayService;
        const itemData = await ebayService.importFromEbayUrl(ebayUrl);
        
        // Create vintage item from imported data
        const vintageItem = await VintageItem.create({
            ...itemData,
            seller_id: seller.id,
            status: 'draft'
        });

        res.json({
            success: true,
            message: 'Item imported from eBay',
            item: vintageItem
        });

    } catch (error) {
        console.error('eBay import error:', error);
        res.status(500).json({ error: 'Failed to import from eBay' });
    }
});

module.exports = router;