const { VintageItem, VintageSeller } = require('../database/models');

class StoreIntegrationService {
    constructor() {
        this.vintageCategory = 'vintage';
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    }

    // Integrate vintage items into existing product system
    async getIntegratedProducts(existingProducts = [], options = {}) {
        try {
            const {
                includeVintage = true,
                vintageLimit = 20,
                mixRatio = this.calculateOptimalRatio(existingProducts.length),
                category = null,
                priceRange = null
            } = options;

            let allProducts = [...existingProducts];

            if (includeVintage) {
                const vintageItems = await this.getVintageItemsWithCache(vintageLimit, {
                    category,
                    priceRange
                });

                // Convert vintage items to store format
                const convertedVintage = vintageItems.map(item => this.convertVintageToStoreFormat(item));
                
                // Mix vintage items with existing products based on ratio
                allProducts = this.mixProducts(existingProducts, convertedVintage, mixRatio);
            }

            return allProducts;

        } catch (error) {
            console.error('Store integration error:', error);
            return existingProducts; // Fallback to original products
        }
    }

    // Get vintage items formatted for the main store
    async getVintageItemsForStore(limit = 20, filters = {}) {
        try {
            const { query } = require('../database/connection');
            
            let whereConditions = `vi.status = 'published'`;
            let queryParams = [];
            let paramIndex = 1;

            if (filters.category && filters.category !== 'all') {
                whereConditions += ` AND vi.category = $${paramIndex++}`;
                queryParams.push(filters.category);
            }

            if (filters.priceRange) {
                const [min, max] = filters.priceRange;
                if (min !== null) {
                    whereConditions += ` AND vi.price >= $${paramIndex++}`;
                    queryParams.push(min);
                }
                if (max !== null) {
                    whereConditions += ` AND vi.price <= $${paramIndex++}`;
                    queryParams.push(max);
                }
            }

            const sql = `
                SELECT vi.*, vs.store_name, vs.profile_image, vs.is_verified, vs.rating
                FROM vintage_items vi
                JOIN vintage_sellers vs ON vi.seller_id = vs.id
                WHERE ${whereConditions}
                ORDER BY vi.views DESC, vi.created_at DESC
                LIMIT $${paramIndex}
            `;

            queryParams.push(limit);

            const result = await query(sql, queryParams);
            return result.rows;

        } catch (error) {
            console.error('Get vintage items error:', error);
            return [];
        }
    }

    // Convert vintage item to main store product format
    convertVintageToStoreFormat(vintageItem) {
        const images = this.parseImages(vintageItem.images);
        
        return {
            id: `vintage_${vintageItem.id}`,
            name: this.createStoreProductName(vintageItem),
            price: vintageItem.price,
            originalPrice: vintageItem.original_price,
            description: this.createStoreDescription(vintageItem),
            category: vintageItem.category || this.vintageCategory,
            platform: 'vintage_crib',
            image: images[0] || '/placeholder-vintage.jpg',
            images: images,
            buyLink: `/frontend/vintage-portfolio.html?seller=${vintageItem.user_id}#item-${vintageItem.id}`,
            sourceUrl: `/api/vintage/item/${vintageItem.id}`,
            
            // Vintage-specific data
            vintage: {
                seller: {
                    name: vintageItem.store_name,
                    verified: vintageItem.is_verified,
                    rating: vintageItem.rating,
                    image: vintageItem.profile_image
                },
                condition: vintageItem.condition,
                brand: vintageItem.brand,
                size: vintageItem.size,
                published_to: this.parsePublishedPlatforms(vintageItem.published_to),
                views: vintageItem.views || 0,
                likes: vintageItem.likes || 0
            },
            
            // Store compatibility
            isSold: vintageItem.status === 'sold',
            isVintage: true,
            seller: vintageItem.store_name,
            condition: vintageItem.condition,
            tags: this.generateStoreTags(vintageItem)
        };
    }

    // Create store-compatible product name
    createStoreProductName(item) {
        let name = item.title;
        
        // Add brand if available
        if (item.brand && !name.toLowerCase().includes(item.brand.toLowerCase())) {
            name = `${item.brand} ${name}`;
        }
        
        // Add vintage prefix if not already included
        if (!name.toLowerCase().includes('vintage')) {
            name = `Vintage ${name}`;
        }
        
        // Add size if available and short
        if (item.size && item.size.length <= 3) {
            name += ` (Size ${item.size})`;
        }
        
        return name.substring(0, 150); // Limit length
    }

    // Create store-compatible description
    createStoreDescription(item) {
        let description = item.description || 'Authentic vintage piece';
        
        // Add seller info
        description += `\n\n✨ Curated by ${item.store_name}`;
        
        if (item.is_verified) {
            description += ` (Verified Seller)`;
        }
        
        // Add condition info
        if (item.condition) {
            description += `\n📋 Condition: ${item.condition.charAt(0).toUpperCase() + item.condition.slice(1)}`;
        }
        
        // Add brand info
        if (item.brand) {
            description += `\n🏷️ Brand: ${item.brand}`;
        }
        
        // Add size info
        if (item.size) {
            description += `\n📏 Size: ${item.size}`;
        }
        
        // Add platform availability
        const platforms = this.parsePublishedPlatforms(item.published_to);
        if (platforms.length > 1) {
            description += `\n🌐 Also available on: ${platforms.filter(p => p !== 'vintage_crib').join(', ')}`;
        }
        
        return description.substring(0, 500); // Limit length
    }

    // Generate store-compatible tags
    generateStoreTags(item) {
        const tags = ['vintage'];
        
        if (item.category) tags.push(item.category);
        if (item.brand) tags.push(item.brand.toLowerCase());
        if (item.condition) tags.push(item.condition);
        if (item.size) tags.push(`size-${item.size.toLowerCase()}`);
        
        return tags;
    }

    // Mix vintage and regular products based on ratio
    mixProducts(regularProducts, vintageProducts, vintageRatio) {
        if (vintageProducts.length === 0) return regularProducts;
        if (regularProducts.length === 0) return vintageProducts;
        
        const totalItems = regularProducts.length + vintageProducts.length;
        const vintageCount = Math.floor(totalItems * vintageRatio);
        const regularCount = totalItems - vintageCount;
        
        // Take subsets
        const selectedRegular = regularProducts.slice(0, regularCount);
        const selectedVintage = vintageProducts.slice(0, vintageCount);
        
        // Interleave the arrays
        const mixed = [];
        const maxLength = Math.max(selectedRegular.length, selectedVintage.length);
        const ratio = selectedRegular.length / selectedVintage.length;
        
        for (let i = 0; i < maxLength; i++) {
            // Add regular products
            const regularIndex = Math.floor(i / (1 + 1/ratio));
            if (regularIndex < selectedRegular.length) {
                mixed.push(selectedRegular[regularIndex]);
            }
            
            // Add vintage products
            if (i < selectedVintage.length) {
                mixed.push(selectedVintage[i]);
            }
        }
        
        return mixed;
    }

    // Get vintage marketplace stats for dashboard integration
    async getVintageStatsForDashboard() {
        try {
            const { query } = require('../database/connection');
            
            const statsQuery = `
                SELECT 
                    COUNT(DISTINCT vi.id) as total_items,
                    COUNT(DISTINCT CASE WHEN vi.status = 'published' THEN vi.id END) as published_items,
                    COUNT(DISTINCT CASE WHEN vi.status = 'sold' THEN vi.id END) as sold_items,
                    AVG(CASE WHEN vi.status = 'published' THEN vi.price END) as avg_price,
                    SUM(vi.views) as total_views,
                    COUNT(DISTINCT vs.id) as active_sellers
                FROM vintage_items vi
                JOIN vintage_sellers vs ON vi.seller_id = vs.id
                WHERE vi.created_at > NOW() - INTERVAL '30 days'
            `;

            const result = await query(statsQuery);
            const stats = result.rows[0];

            return {
                vintage_items: parseInt(stats.total_items) || 0,
                published_items: parseInt(stats.published_items) || 0,
                sold_items: parseInt(stats.sold_items) || 0,
                avg_price: parseFloat(stats.avg_price) || 0,
                total_views: parseInt(stats.total_views) || 0,
                active_sellers: parseInt(stats.active_sellers) || 0,
                conversion_rate: stats.published_items > 0 
                    ? ((parseInt(stats.sold_items) / parseInt(stats.published_items)) * 100).toFixed(1)
                    : 0
            };

        } catch (error) {
            console.error('Dashboard stats error:', error);
            return {
                vintage_items: 0,
                published_items: 0,
                sold_items: 0,
                avg_price: 0,
                total_views: 0,
                active_sellers: 0,
                conversion_rate: 0
            };
        }
    }

    // Get trending vintage items for homepage
    async getTrendingVintageItems(limit = 6) {
        try {
            const { query } = require('../database/connection');
            
            // Get items with highest views in last 7 days
            const sql = `
                SELECT vi.*, vs.store_name, vs.is_verified
                FROM vintage_items vi
                JOIN vintage_sellers vs ON vi.seller_id = vs.id
                WHERE vi.status = 'published' 
                AND vi.updated_at > NOW() - INTERVAL '7 days'
                ORDER BY vi.views DESC, vi.likes DESC
                LIMIT $1
            `;

            const result = await query(sql, [limit]);
            return result.rows.map(item => this.convertVintageToStoreFormat(item));

        } catch (error) {
            console.error('Trending items error:', error);
            return [];
        }
    }

    // Search integration for site-wide search
    async searchVintageItems(searchTerm, limit = 5) {
        try {
            if (!searchTerm) return [];

            const { query } = require('../database/connection');
            
            const sql = `
                SELECT vi.*, vs.store_name, vs.is_verified
                FROM vintage_items vi
                JOIN vintage_sellers vs ON vi.seller_id = vs.id
                WHERE vi.status = 'published' 
                AND (vi.title ILIKE $1 OR vi.description ILIKE $1 OR vi.brand ILIKE $1)
                ORDER BY vi.views DESC
                LIMIT $2
            `;

            const result = await query(sql, [`%${searchTerm}%`, limit]);
            return result.rows.map(item => this.convertVintageToStoreFormat(item));

        } catch (error) {
            console.error('Search integration error:', error);
            return [];
        }
    }

    // Get vintage recommendations based on regular product
    async getVintageRecommendations(regularProduct, limit = 4) {
        try {
            const { query } = require('../database/connection');
            
            // Find similar vintage items based on category and price range
            const priceRange = {
                min: regularProduct.price * 0.7,
                max: regularProduct.price * 1.3
            };

            const sql = `
                SELECT vi.*, vs.store_name, vs.is_verified
                FROM vintage_items vi
                JOIN vintage_sellers vs ON vi.seller_id = vs.id
                WHERE vi.status = 'published' 
                AND vi.category = $1
                AND vi.price BETWEEN $2 AND $3
                ORDER BY vi.views DESC, vi.created_at DESC
                LIMIT $4
            `;

            const result = await query(sql, [
                regularProduct.category, 
                priceRange.min, 
                priceRange.max, 
                limit
            ]);

            return result.rows.map(item => this.convertVintageToStoreFormat(item));

        } catch (error) {
            console.error('Recommendations error:', error);
            return [];
        }
    }

    // Utility functions
    parseImages(images) {
        if (!images) return [];
        
        try {
            if (typeof images === 'string') {
                return JSON.parse(images);
            }
            return Array.isArray(images) ? images : [];
        } catch {
            return [];
        }
    }

    parsePublishedPlatforms(published) {
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
    
    // Calculate optimal vintage ratio based on product count
    calculateOptimalRatio(regularProductCount) {
        if (regularProductCount <= 10) return 0.5; // 50% for small catalogs
        if (regularProductCount <= 50) return 0.3; // 30% for medium catalogs
        if (regularProductCount <= 100) return 0.2; // 20% for large catalogs
        return 0.15; // 15% for very large catalogs
    }
    
    // Cached vintage items retrieval
    async getVintageItemsWithCache(limit, filters = {}) {
        const cacheKey = JSON.stringify({ limit, filters });
        const cached = this.cache.get(cacheKey);
        
        if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
            return cached.data;
        }
        
        try {
            const data = await this.getVintageItemsForStore(limit, filters);
            this.cache.set(cacheKey, {
                data,
                timestamp: Date.now()
            });
            
            // Clean old cache entries
            this.cleanCache();
            
            return data;
        } catch (error) {
            console.error('Cache fetch error:', error);
            return [];
        }
    }
    
    // Clean expired cache entries
    cleanCache() {
        const now = Date.now();
        for (const [key, value] of this.cache.entries()) {
            if (now - value.timestamp > this.cacheTimeout) {
                this.cache.delete(key);
            }
        }
    }
    
    // Enhanced mixing algorithm with better distribution
    mixProducts(regularProducts, vintageProducts, vintageRatio) {
        if (vintageProducts.length === 0) return regularProducts;
        if (regularProducts.length === 0) return vintageProducts;
        
        const totalItems = regularProducts.length + vintageProducts.length;
        const targetVintageCount = Math.min(
            Math.ceil(totalItems * vintageRatio),
            vintageProducts.length
        );
        const targetRegularCount = Math.min(
            totalItems - targetVintageCount,
            regularProducts.length
        );
        
        // Shuffle arrays for randomization
        const shuffledRegular = [...regularProducts].sort(() => 0.5 - Math.random());
        const shuffledVintage = [...vintageProducts].sort(() => 0.5 - Math.random());
        
        const selectedRegular = shuffledRegular.slice(0, targetRegularCount);
        const selectedVintage = shuffledVintage.slice(0, targetVintageCount);
        
        // Interleave products for better distribution
        const mixed = [];
        const vintageInterval = Math.floor(selectedRegular.length / selectedVintage.length) || 1;
        
        let vintageIndex = 0;
        let regularIndex = 0;
        
        while (regularIndex < selectedRegular.length || vintageIndex < selectedVintage.length) {
            // Add regular products
            const regularBatchSize = Math.min(vintageInterval, selectedRegular.length - regularIndex);
            for (let i = 0; i < regularBatchSize; i++) {
                if (regularIndex < selectedRegular.length) {
                    mixed.push(selectedRegular[regularIndex++]);
                }
            }
            
            // Add one vintage product
            if (vintageIndex < selectedVintage.length) {
                mixed.push(selectedVintage[vintageIndex++]);
            }
        }
        
        return mixed;
    }
}

module.exports = StoreIntegrationService;