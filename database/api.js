const express = require('express');
const { VintageItem, VintageSeller, User, CrossPost, Order } = require('./models');

const router = express.Router();

// =============================================================================
// VINTAGE ITEMS API (Multi-seller products)
// =============================================================================

// Get all published items (public endpoint)
router.get('/items', async (req, res) => {
    try {
        const { limit = 50, offset = 0, category, seller_id, search } = req.query;
        const filters = { category, seller_id, search };
        
        const items = await VintageItem.getPublished(
            parseInt(limit), 
            parseInt(offset), 
            filters
        );
        
        res.json({
            success: true,
            items,
            count: items.length,
            filters: filters
        });
    } catch (error) {
        console.error('Error fetching items:', error);
        res.status(500).json({ error: 'Failed to fetch items' });
    }
});

// Get single item details
router.get('/items/:id', async (req, res) => {
    try {
        const item = await VintageItem.findById(req.params.id);
        if (!item) {
            return res.status(404).json({ error: 'Item not found' });
        }
        
        // Increment view count
        await VintageItem.incrementViews(req.params.id);
        
        res.json({ success: true, item });
    } catch (error) {
        console.error('Error fetching item:', error);
        res.status(500).json({ error: 'Failed to fetch item' });
    }
});

// Create new item (requires authentication)
router.post('/items', async (req, res) => {
    try {
        // In a real app, you'd get seller_id from authenticated user session
        const itemData = req.body;
        
        // Validate required fields
        if (!itemData.title || !itemData.price || !itemData.seller_id) {
            return res.status(400).json({ 
                error: 'Missing required fields: title, price, seller_id' 
            });
        }
        
        const item = await VintageItem.create(itemData);
        res.status(201).json({ success: true, item });
    } catch (error) {
        console.error('Error creating item:', error);
        res.status(500).json({ error: 'Failed to create item' });
    }
});

// Update item
router.put('/items/:id', async (req, res) => {
    try {
        const updates = req.body;
        delete updates.id; // Don't allow ID updates
        
        const item = await VintageItem.update(req.params.id, updates);
        if (!item) {
            return res.status(404).json({ error: 'Item not found' });
        }
        
        res.json({ success: true, item });
    } catch (error) {
        console.error('Error updating item:', error);
        res.status(500).json({ error: 'Failed to update item' });
    }
});

// Delete item
router.delete('/items/:id', async (req, res) => {
    try {
        const item = await VintageItem.delete(req.params.id);
        if (!item) {
            return res.status(404).json({ error: 'Item not found' });
        }
        
        res.json({ success: true, message: 'Item deleted successfully' });
    } catch (error) {
        console.error('Error deleting item:', error);
        res.status(500).json({ error: 'Failed to delete item' });
    }
});

// Like/unlike item
router.post('/items/:id/like', async (req, res) => {
    try {
        // In a real app, you'd get user_id from authenticated session
        const { user_id } = req.body;
        if (!user_id) {
            return res.status(400).json({ error: 'user_id required' });
        }
        
        const result = await VintageItem.toggleLike(req.params.id, user_id);
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Error toggling like:', error);
        res.status(500).json({ error: 'Failed to toggle like' });
    }
});

// =============================================================================
// SELLERS API
// =============================================================================

// Get all sellers
router.get('/sellers', async (req, res) => {
    try {
        const { limit = 50, offset = 0 } = req.query;
        const sellers = await VintageSeller.getAll(parseInt(limit), parseInt(offset));
        
        res.json({ success: true, sellers, count: sellers.length });
    } catch (error) {
        console.error('Error fetching sellers:', error);
        res.status(500).json({ error: 'Failed to fetch sellers' });
    }
});

// Get seller profile
router.get('/sellers/:id', async (req, res) => {
    try {
        const seller = await VintageSeller.findById(req.params.id);
        if (!seller) {
            return res.status(404).json({ error: 'Seller not found' });
        }
        
        // Get seller's items
        const items = await VintageItem.getBySeller(req.params.id, 20, 0);
        
        res.json({ 
            success: true, 
            seller: { ...seller, items }
        });
    } catch (error) {
        console.error('Error fetching seller:', error);
        res.status(500).json({ error: 'Failed to fetch seller' });
    }
});

// Create seller profile
router.post('/sellers', async (req, res) => {
    try {
        const sellerData = req.body;
        
        if (!sellerData.user_id || !sellerData.store_name) {
            return res.status(400).json({ 
                error: 'Missing required fields: user_id, store_name' 
            });
        }
        
        const seller = await VintageSeller.create(sellerData);
        res.status(201).json({ success: true, seller });
    } catch (error) {
        console.error('Error creating seller:', error);
        res.status(500).json({ error: 'Failed to create seller profile' });
    }
});

// =============================================================================
// CROSS-PLATFORM POSTING API
// =============================================================================

// Get cross-posts for an item
router.get('/items/:id/cross-posts', async (req, res) => {
    try {
        const posts = await CrossPost.findByItem(req.params.id);
        res.json({ success: true, posts });
    } catch (error) {
        console.error('Error fetching cross-posts:', error);
        res.status(500).json({ error: 'Failed to fetch cross-posts' });
    }
});

// Create cross-post
router.post('/items/:id/cross-posts', async (req, res) => {
    try {
        const { platform, external_id, external_url } = req.body;
        
        if (!platform) {
            return res.status(400).json({ error: 'Platform is required' });
        }
        
        const postData = {
            item_id: req.params.id,
            platform,
            external_id,
            external_url,
            status: 'success' // Assuming successful post
        };
        
        const post = await CrossPost.create(postData);
        res.status(201).json({ success: true, post });
    } catch (error) {
        console.error('Error creating cross-post:', error);
        res.status(500).json({ error: 'Failed to create cross-post' });
    }
});

// Update cross-post status
router.put('/cross-posts/:id', async (req, res) => {
    try {
        const { status, error_message } = req.body;
        
        const post = await CrossPost.updateStatus(req.params.id, status, error_message);
        if (!post) {
            return res.status(404).json({ error: 'Cross-post not found' });
        }
        
        res.json({ success: true, post });
    } catch (error) {
        console.error('Error updating cross-post:', error);
        res.status(500).json({ error: 'Failed to update cross-post' });
    }
});

// =============================================================================
// MIGRATION HELPER - Convert existing JSON products to database
// =============================================================================

router.post('/migrate/json-to-db', async (req, res) => {
    try {
        const fs = require('fs');
        const path = require('path');
        
        // Read existing products.json
        const productsPath = path.join(__dirname, '../data/products.json');
        if (!fs.existsSync(productsPath)) {
            return res.status(404).json({ error: 'products.json not found' });
        }
        
        const products = JSON.parse(fs.readFileSync(productsPath, 'utf8'));
        
        // Create default seller if doesn't exist
        let seller = await VintageSeller.findById(1);
        if (!seller) {
            // Create admin user first if needed
            let adminUser = await User.findByUsername('admin');
            if (!adminUser) {
                adminUser = await User.create({
                    username: 'admin',
                    email: 'admin@vintagecrib.com',
                    password_hash: '$2b$10$example',
                    role: 'admin'
                });
            }
            
            seller = await VintageSeller.create({
                user_id: adminUser.id,
                store_name: 'Vintage Crib Official',
                bio: 'Curated vintage collection from around the world',
                subscription_tier: 'pro'
            });
        }
        
        let migrated = 0;
        let errors = [];
        
        // Convert each product
        for (const product of products) {
            try {
                const itemData = {
                    seller_id: seller.id,
                    title: product.name || 'Untitled Item',
                    description: product.description || '',
                    price: parseFloat(product.price) || 0,
                    category: product.category || 'uncategorized',
                    images: product.images || [product.image].filter(Boolean),
                    status: 'published',
                    published_to: ['vintage_crib']
                };
                
                await VintageItem.create(itemData);
                migrated++;
            } catch (error) {
                errors.push({ product: product.name, error: error.message });
            }
        }
        
        res.json({
            success: true,
            message: `Migration completed: ${migrated} products migrated`,
            migrated,
            errors: errors.slice(0, 10) // Show first 10 errors only
        });
        
    } catch (error) {
        console.error('Migration error:', error);
        res.status(500).json({ error: 'Migration failed' });
    }
});

// =============================================================================
// ANALYTICS & STATS
// =============================================================================

// Get marketplace stats
router.get('/stats', async (req, res) => {
    try {
        const { query } = require('./connection');
        
        const stats = await query(`
            SELECT 
                (SELECT COUNT(*) FROM vintage_items WHERE status = 'published') as published_items,
                (SELECT COUNT(*) FROM vintage_items WHERE status = 'sold') as sold_items,
                (SELECT COUNT(*) FROM vintage_sellers) as total_sellers,
                (SELECT COUNT(*) FROM users) as total_users,
                (SELECT AVG(price) FROM vintage_items WHERE status = 'published') as avg_price,
                (SELECT SUM(views) FROM vintage_items) as total_views
        `);
        
        res.json({ success: true, stats: stats.rows[0] });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

module.exports = router;