const express = require('express');
const { VintageSeller, VintageItem, User } = require('../database/models');
const router = express.Router();

// =============================================================================
// PUBLIC PORTFOLIO ROUTES
// =============================================================================

// Public seller portfolio by user ID
router.get('/vintage/portfolio/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        
        // Get seller by user ID
        const seller = await VintageSeller.findByUserId(userId);
        if (!seller) {
            return res.status(404).json({ 
                success: false,
                error: 'Seller portfolio not found' 
            });
        }

        // Get published items only for public view
        const items = await VintageItem.getBySeller(seller.id, 100, 0);
        const publishedItems = items.filter(item => item.status === 'published');

        // Calculate public stats (no sensitive data)
        const stats = {
            totalItems: publishedItems.length,
            totalLikes: publishedItems.reduce((sum, item) => sum + (item.likes || 0), 0),
            avgPrice: publishedItems.length > 0 
                ? publishedItems.reduce((sum, item) => sum + item.price, 0) / publishedItems.length 
                : 0,
            memberSince: seller.created_at
        };

        // Remove sensitive seller data for public view
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
            stats: stats
        });

    } catch (error) {
        console.error('Portfolio error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to load seller portfolio' 
        });
    }
});

// Public seller portfolio by username/store name
router.get('/vintage/portfolio/username/:storeName', async (req, res) => {
    try {
        const storeName = decodeURIComponent(req.params.storeName);
        
        // Find seller by store name (case insensitive)
        const seller = await VintageSeller.findByStoreName(storeName);
        if (!seller) {
            return res.status(404).json({ 
                success: false,
                error: 'Seller portfolio not found' 
            });
        }

        // Redirect to user ID endpoint for consistent handling
        req.params.userId = seller.user_id;
        return router.handle(req, res);

    } catch (error) {
        console.error('Portfolio username error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to load seller portfolio' 
        });
    }
});

// =============================================================================
// VINTAGE MARKETPLACE INTEGRATION
// =============================================================================

// Get all vintage items for main store integration
router.get('/vintage/items/public', async (req, res) => {
    try {
        const { 
            category, 
            minPrice, 
            maxPrice, 
            condition, 
            limit = 20, 
            offset = 0,
            search 
        } = req.query;

        // Build filters for public items
        let whereConditions = `status = 'published'`;
        let queryParams = [];
        let paramIndex = 1;

        if (category) {
            whereConditions += ` AND category = $${paramIndex++}`;
            queryParams.push(category);
        }

        if (minPrice) {
            whereConditions += ` AND price >= $${paramIndex++}`;
            queryParams.push(parseFloat(minPrice));
        }

        if (maxPrice) {
            whereConditions += ` AND price <= $${paramIndex++}`;
            queryParams.push(parseFloat(maxPrice));
        }

        if (condition) {
            whereConditions += ` AND condition = $${paramIndex++}`;
            queryParams.push(condition);
        }

        if (search) {
            whereConditions += ` AND (title ILIKE $${paramIndex++} OR description ILIKE $${paramIndex++})`;
            queryParams.push(`%${search}%`, `%${search}%`);
        }

        // Get items with seller information
        const query = `
            SELECT vi.*, vs.store_name, vs.profile_image as seller_image, vs.is_verified
            FROM vintage_items vi
            JOIN vintage_sellers vs ON vi.seller_id = vs.id
            WHERE ${whereConditions}
            ORDER BY vi.created_at DESC
            LIMIT $${paramIndex++} OFFSET $${paramIndex}
        `;

        queryParams.push(parseInt(limit), parseInt(offset));

        const { query: dbQuery } = require('../database/connection');
        const result = await dbQuery(query, queryParams);

        res.json({
            success: true,
            items: result.rows,
            count: result.rows.length,
            filters: {
                category,
                minPrice,
                maxPrice,
                condition,
                search
            }
        });

    } catch (error) {
        console.error('Public items error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to load vintage items' 
        });
    }
});

// Get vintage item details for integration with main store
router.get('/vintage/item/:itemId', async (req, res) => {
    try {
        const itemId = req.params.itemId;
        
        const item = await VintageItem.findById(itemId);
        if (!item || item.status !== 'published') {
            return res.status(404).json({ 
                success: false,
                error: 'Item not found or not available' 
            });
        }

        // Get seller info
        const seller = await VintageSeller.findById(item.seller_id);
        if (!seller) {
            return res.status(404).json({ 
                success: false,
                error: 'Seller not found' 
            });
        }

        // Increment view count
        await VintageItem.update(itemId, { 
            views: (item.views || 0) + 1 
        });

        // Format for main store compatibility
        const formattedItem = {
            id: `vintage_${item.id}`,
            name: item.title,
            price: item.price,
            originalPrice: item.original_price,
            description: item.description,
            category: item.category || 'vintage',
            brand: item.brand,
            size: item.size,
            condition: item.condition,
            images: parseItemImages(item.images),
            platform: 'vintage_crib',
            seller: {
                id: seller.id,
                name: seller.store_name,
                verified: seller.is_verified,
                rating: seller.rating,
                profile_image: seller.profile_image
            },
            vintage_specific: {
                published_to: parsePublishedPlatforms(item.published_to),
                views: item.views || 0,
                likes: item.likes || 0,
                created_at: item.created_at
            }
        };

        res.json({
            success: true,
            item: formattedItem
        });

    } catch (error) {
        console.error('Item details error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to load item details' 
        });
    }
});

// =============================================================================
// SELLER DISCOVERY & SEARCH
// =============================================================================

// Get featured sellers for homepage integration
router.get('/vintage/sellers/featured', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 6;
        
        // Get sellers with most items or highest ratings
        const query = `
            SELECT vs.*, COUNT(vi.id) as item_count
            FROM vintage_sellers vs
            LEFT JOIN vintage_items vi ON vs.id = vi.seller_id AND vi.status = 'published'
            WHERE vs.is_verified = true OR vs.total_sales > 0
            GROUP BY vs.id
            ORDER BY vs.is_verified DESC, item_count DESC, vs.rating DESC
            LIMIT $1
        `;

        const { query: dbQuery } = require('../database/connection');
        const result = await dbQuery(query, [limit]);

        const featuredSellers = result.rows.map(seller => ({
            id: seller.id,
            user_id: seller.user_id,
            store_name: seller.store_name,
            bio: seller.bio,
            profile_image: seller.profile_image,
            is_verified: seller.is_verified,
            rating: seller.rating,
            total_sales: seller.total_sales,
            item_count: seller.item_count || 0,
            portfolio_url: `/frontend/vintage-portfolio.html?seller=${seller.user_id}`
        }));

        res.json({
            success: true,
            sellers: featuredSellers
        });

    } catch (error) {
        console.error('Featured sellers error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to load featured sellers' 
        });
    }
});

// Search vintage items for site-wide search integration
router.get('/vintage/search', async (req, res) => {
    try {
        const { q: searchTerm, limit = 10 } = req.query;
        
        if (!searchTerm) {
            return res.json({ success: true, items: [] });
        }

        const query = `
            SELECT vi.*, vs.store_name, vs.is_verified
            FROM vintage_items vi
            JOIN vintage_sellers vs ON vi.seller_id = vs.id
            WHERE vi.status = 'published' 
            AND (vi.title ILIKE $1 OR vi.description ILIKE $1 OR vi.brand ILIKE $1 OR vs.store_name ILIKE $1)
            ORDER BY vi.views DESC, vi.created_at DESC
            LIMIT $2
        `;

        const { query: dbQuery } = require('../database/connection');
        const result = await dbQuery(query, [`%${searchTerm}%`, parseInt(limit)]);

        const searchResults = result.rows.map(item => ({
            id: `vintage_${item.id}`,
            title: item.title,
            price: item.price,
            image: parseItemImages(item.images)[0],
            seller: item.store_name,
            verified: item.is_verified,
            type: 'vintage',
            url: `/frontend/vintage-portfolio.html?seller=${item.seller_id}#item-${item.id}`
        }));

        res.json({
            success: true,
            items: searchResults,
            query: searchTerm
        });

    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Search failed' 
        });
    }
});

// =============================================================================
// ANALYTICS & STATS FOR MAIN SITE
// =============================================================================

// Get vintage marketplace stats for homepage/admin integration
router.get('/vintage/marketplace/stats', async (req, res) => {
    try {
        const { query: dbQuery } = require('../database/connection');
        
        // Get comprehensive marketplace stats
        const statsQuery = `
            SELECT 
                COUNT(DISTINCT vs.id) as total_sellers,
                COUNT(DISTINCT vi.id) as total_items,
                COUNT(DISTINCT CASE WHEN vi.status = 'published' THEN vi.id END) as published_items,
                COUNT(DISTINCT CASE WHEN vi.status = 'sold' THEN vi.id END) as sold_items,
                AVG(CASE WHEN vi.status = 'published' THEN vi.price END) as avg_price,
                SUM(CASE WHEN vi.status = 'sold' THEN vi.price ELSE 0 END) as total_revenue,
                COUNT(DISTINCT CASE WHEN vs.is_verified = true THEN vs.id END) as verified_sellers
            FROM vintage_sellers vs
            LEFT JOIN vintage_items vi ON vs.id = vi.seller_id
        `;

        const result = await dbQuery(statsQuery);
        const stats = result.rows[0];

        // Get category breakdown
        const categoryQuery = `
            SELECT category, COUNT(*) as count
            FROM vintage_items
            WHERE status = 'published' AND category IS NOT NULL
            GROUP BY category
            ORDER BY count DESC
            LIMIT 10
        `;

        const categoryResult = await dbQuery(categoryQuery);

        res.json({
            success: true,
            stats: {
                sellers: {
                    total: parseInt(stats.total_sellers) || 0,
                    verified: parseInt(stats.verified_sellers) || 0
                },
                items: {
                    total: parseInt(stats.total_items) || 0,
                    published: parseInt(stats.published_items) || 0,
                    sold: parseInt(stats.sold_items) || 0
                },
                financial: {
                    avg_price: parseFloat(stats.avg_price) || 0,
                    total_revenue: parseFloat(stats.total_revenue) || 0
                },
                categories: categoryResult.rows
            }
        });

    } catch (error) {
        console.error('Marketplace stats error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to load marketplace statistics' 
        });
    }
});

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function parseItemImages(images) {
    if (!images) return [];
    
    try {
        if (typeof images === 'string') {
            return JSON.parse(images);
        }
        return Array.isArray(images) ? images : [];
    } catch {
        return typeof images === 'string' ? [images] : [];
    }
}

function parsePublishedPlatforms(published) {
    if (!published) return ['vintage_crib'];
    
    try {
        if (typeof published === 'string') {
            return JSON.parse(published);
        }
        return Array.isArray(published) ? published : ['vintage_crib'];
    } catch {
        return ['vintage_crib'];
    }
}

module.exports = router;