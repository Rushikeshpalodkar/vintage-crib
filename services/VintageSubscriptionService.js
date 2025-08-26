const { query } = require('../database/connection');

class VintageSubscriptionService {
    constructor() {
        this.subscriptionTiers = {
            free: {
                name: 'Free Tier',
                price: 0,
                maxItems: 5,
                crossPostPlatforms: ['vintage_crib'],
                featuresIncluded: ['basic_listing', 'profile_page'],
                featuresRestricted: ['cross_posting', 'analytics', 'priority_support', 'custom_branding'],
                support: 'community',
                description: 'Perfect for getting started with vintage selling'
            },
            starter: {
                name: 'Starter',
                price: 4.99,
                maxItems: 15,
                crossPostPlatforms: ['vintage_crib', 'ebay'],
                featuresIncluded: ['basic_listing', 'profile_page', 'ebay_integration'],
                featuresRestricted: ['multi_platform_posting', 'analytics', 'priority_support', 'custom_branding'],
                support: 'email',
                description: 'Great for casual sellers expanding to eBay'
            },
            pro: {
                name: 'Pro',
                price: 9.99,
                maxItems: 50,
                crossPostPlatforms: ['vintage_crib', 'ebay', 'poshmark', 'depop'],
                featuresIncluded: ['basic_listing', 'profile_page', 'multi_platform_posting', 'basic_analytics'],
                featuresRestricted: ['advanced_analytics', 'custom_branding', 'api_access'],
                support: 'priority_email',
                description: 'Perfect for serious sellers with multi-platform presence'
            },
            premium: {
                name: 'Premium',
                price: 19.99,
                maxItems: -1, // unlimited
                crossPostPlatforms: ['vintage_crib', 'ebay', 'poshmark', 'depop', 'mercari'],
                featuresIncluded: ['all_features'],
                featuresRestricted: [],
                analytics: true,
                customBranding: true,
                apiAccess: true,
                support: 'priority_phone_email',
                description: 'Complete solution for professional vintage businesses'
            }
        };
        
        // Revenue tracking for admin
        this.monthlyRevenue = 0;
        this.totalRevenue = 0;
    }

    // Get subscription tier details
    getTierDetails(tierName) {
        return this.subscriptionTiers[tierName] || this.subscriptionTiers.free;
    }

    // Get all available tiers for pricing page
    getAllTiers() {
        return this.subscriptionTiers;
    }

    // Check if user can perform action based on subscription
    async checkSubscriptionLimit(userId, action, currentCount = 0) {
        try {
            const userSub = await this.getUserSubscription(userId);
            const tier = this.getTierDetails(userSub.tier);
            
            switch (action) {
                case 'create_item':
                    if (tier.maxItems === -1) return { allowed: true, limit: 'unlimited' };
                    return { 
                        allowed: currentCount < tier.maxItems, 
                        limit: tier.maxItems,
                        current: currentCount
                    };
                    
                case 'cross_post':
                    return { 
                        allowed: true,
                        platforms: tier.crossPostPlatforms
                    };
                    
                case 'analytics':
                    return { 
                        allowed: tier.analytics || tier.featuresIncluded.includes('basic_analytics') || tier.featuresIncluded.includes('all_features')
                    };
                    
                case 'custom_branding':
                    return { 
                        allowed: tier.customBranding || tier.featuresIncluded.includes('all_features')
                    };
                    
                case 'api_access':
                    return { 
                        allowed: tier.apiAccess || tier.featuresIncluded.includes('all_features')
                    };
                    
                default:
                    return { allowed: true };
            }
            
        } catch (error) {
            console.error('Subscription check error:', error);
            // Default to free tier on error
            return this.checkSubscriptionLimit(userId, action, currentCount, 'free');
        }
    }

    // Get user's current subscription
    async getUserSubscription(userId) {
        try {
            const result = await query(
                'SELECT * FROM user_subscriptions WHERE user_id = $1',
                [userId]
            );
            
            if (result.rows.length === 0) {
                // Create default free subscription
                return await this.createDefaultSubscription(userId);
            }
            
            const subscription = result.rows[0];
            
            // Check if subscription is expired
            if (subscription.expires_at && new Date(subscription.expires_at) < new Date()) {
                return await this.downgradeToFree(userId);
            }
            
            return subscription;
            
        } catch (error) {
            console.error('Get user subscription error:', error);
            return { user_id: userId, tier: 'free', status: 'active' };
        }
    }

    // Create default free subscription
    async createDefaultSubscription(userId) {
        try {
            const result = await query(
                `INSERT INTO user_subscriptions (user_id, tier, status, started_at) 
                 VALUES ($1, $2, $3, CURRENT_TIMESTAMP) RETURNING *`,
                [userId, 'free', 'active']
            );
            
            return result.rows[0];
            
        } catch (error) {
            console.error('Create default subscription error:', error);
            return { user_id: userId, tier: 'free', status: 'active' };
        }
    }

    // Admin: Upgrade user subscription
    async upgradeUserSubscription(userId, newTier, adminId) {
        try {
            const tier = this.getTierDetails(newTier);
            if (!tier) {
                throw new Error('Invalid subscription tier');
            }

            // Calculate expiration date (30 days from now for paid tiers)
            const expiresAt = newTier === 'free' ? null : 
                new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

            const result = await query(
                `INSERT INTO user_subscriptions (user_id, tier, status, started_at, expires_at, upgraded_by_admin) 
                 VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4, $5)
                 ON CONFLICT (user_id) 
                 DO UPDATE SET 
                    tier = $2, 
                    status = $3, 
                    expires_at = $4,
                    updated_at = CURRENT_TIMESTAMP,
                    upgraded_by_admin = $5
                 RETURNING *`,
                [userId, newTier, 'active', expiresAt, adminId]
            );

            // Log the upgrade
            await this.logSubscriptionChange(userId, newTier, 'admin_upgrade', adminId);
            
            // Update revenue tracking for paid tiers
            if (newTier !== 'free') {
                await this.trackRevenue(tier.price, userId, newTier);
            }

            return result.rows[0];
            
        } catch (error) {
            console.error('Upgrade subscription error:', error);
            throw error;
        }
    }

    // Admin: Downgrade user subscription
    async downgradeUserSubscription(userId, newTier, adminId, reason = 'admin_action') {
        try {
            const result = await query(
                `UPDATE user_subscriptions 
                 SET tier = $1, updated_at = CURRENT_TIMESTAMP, expires_at = NULL
                 WHERE user_id = $2 RETURNING *`,
                [newTier, userId]
            );

            // Log the downgrade
            await this.logSubscriptionChange(userId, newTier, 'admin_downgrade', adminId, reason);

            return result.rows[0];
            
        } catch (error) {
            console.error('Downgrade subscription error:', error);
            throw error;
        }
    }

    // Downgrade expired subscriptions to free
    async downgradeToFree(userId) {
        try {
            const result = await query(
                `UPDATE user_subscriptions 
                 SET tier = 'free', status = 'active', expires_at = NULL, updated_at = CURRENT_TIMESTAMP
                 WHERE user_id = $1 RETURNING *`,
                [userId]
            );

            await this.logSubscriptionChange(userId, 'free', 'auto_downgrade_expired');

            return result.rows[0];
            
        } catch (error) {
            console.error('Auto downgrade error:', error);
            return { user_id: userId, tier: 'free', status: 'active' };
        }
    }

    // Log subscription changes for admin tracking
    async logSubscriptionChange(userId, newTier, changeType, adminId = null, reason = null) {
        try {
            await query(
                `INSERT INTO subscription_logs (user_id, new_tier, change_type, admin_id, reason, created_at)
                 VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
                [userId, newTier, changeType, adminId, reason]
            );
        } catch (error) {
            console.error('Log subscription change error:', error);
        }
    }

    // Track revenue for admin dashboard
    async trackRevenue(amount, userId, tier) {
        try {
            await query(
                `INSERT INTO subscription_revenue (user_id, tier, amount, created_at)
                 VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
                [userId, tier, amount]
            );
        } catch (error) {
            console.error('Track revenue error:', error);
        }
    }

    // Admin: Get subscription analytics
    async getSubscriptionAnalytics() {
        try {
            // Get user counts by tier
            const tierCounts = await query(`
                SELECT tier, COUNT(*) as user_count
                FROM user_subscriptions 
                WHERE status = 'active'
                GROUP BY tier
            `);

            // Get monthly revenue (SQLite compatible)
            const monthlyRevenue = await query(`
                SELECT SUM(amount) as total, COUNT(*) as transactions
                FROM subscription_revenue 
                WHERE created_at >= date('now', 'start of month')
            `);

            // Get total revenue
            const totalRevenue = await query(`
                SELECT SUM(amount) as total, COUNT(*) as total_transactions
                FROM subscription_revenue
            `);

            // Get recent subscription changes
            const recentChanges = await query(`
                SELECT sl.*, u.username, vs.store_name
                FROM subscription_logs sl
                LEFT JOIN users u ON sl.user_id = u.id
                LEFT JOIN vintage_sellers vs ON sl.user_id = vs.user_id
                ORDER BY sl.created_at DESC
                LIMIT 20
            `);

            // Calculate conversion rates (SQLite compatible)
            const conversionStats = await query(`
                SELECT 
                    COUNT(CASE WHEN tier != 'free' THEN 1 END) as paid_users,
                    COUNT(*) as total_users,
                    ROUND(CAST(COUNT(CASE WHEN tier != 'free' THEN 1 END) AS REAL) / COUNT(*) * 100, 2) as conversion_rate
                FROM user_subscriptions 
                WHERE status = 'active'
            `);

            return {
                tierDistribution: tierCounts.rows,
                revenue: {
                    monthly: parseFloat(monthlyRevenue.rows[0]?.total || 0),
                    monthlyTransactions: parseInt(monthlyRevenue.rows[0]?.transactions || 0),
                    total: parseFloat(totalRevenue.rows[0]?.total || 0),
                    totalTransactions: parseInt(totalRevenue.rows[0]?.total_transactions || 0)
                },
                recentChanges: recentChanges.rows,
                conversion: conversionStats.rows[0],
                tiers: this.subscriptionTiers
            };
            
        } catch (error) {
            console.error('Get subscription analytics error:', error);
            return {
                tierDistribution: [],
                revenue: { monthly: 0, total: 0 },
                recentChanges: [],
                conversion: { paid_users: 0, total_users: 0, conversion_rate: 0 },
                tiers: this.subscriptionTiers
            };
        }
    }

    // Admin: Get all user subscriptions with details
    async getAllUserSubscriptions(limit = 50, offset = 0) {
        try {
            const result = await query(`
                SELECT 
                    us.*,
                    u.username,
                    u.email,
                    vs.store_name,
                    vs.total_sales,
                    COUNT(vi.id) as item_count
                FROM user_subscriptions us
                JOIN users u ON us.user_id = u.id
                LEFT JOIN vintage_sellers vs ON us.user_id = vs.user_id
                LEFT JOIN vintage_items vi ON vs.id = vi.seller_id AND vi.status = 'published'
                GROUP BY us.user_id, us.tier, us.status, us.started_at, us.expires_at, us.created_at, us.updated_at, u.username, u.email, vs.store_name, vs.total_sales
                ORDER BY us.updated_at DESC
                LIMIT $1 OFFSET $2
            `, [limit, offset]);

            return result.rows.map(row => ({
                ...row,
                tierDetails: this.getTierDetails(row.tier)
            }));
            
        } catch (error) {
            console.error('Get all subscriptions error:', error);
            return [];
        }
    }

    // Check if user needs to be notified about subscription limits
    async checkAndNotifyLimits(userId) {
        try {
            const subscription = await this.getUserSubscription(userId);
            const tier = this.getTierDetails(subscription.tier);
            
            if (tier.maxItems === -1) return null; // Unlimited

            // Get current item count
            const itemCount = await query(`
                SELECT COUNT(*) as count
                FROM vintage_items vi
                JOIN vintage_sellers vs ON vi.seller_id = vs.id
                WHERE vs.user_id = $1 AND vi.status IN ('published', 'draft')
            `, [userId]);

            const currentCount = parseInt(itemCount.rows[0]?.count || 0);
            const limit = tier.maxItems;

            if (currentCount >= limit * 0.8) { // 80% of limit
                return {
                    warning: true,
                    message: `You're using ${currentCount} of ${limit} items (${Math.round(currentCount/limit*100)}%). Consider upgrading to continue adding items.`,
                    currentCount,
                    limit,
                    tier: subscription.tier
                };
            }

            return null;
            
        } catch (error) {
            console.error('Check limits error:', error);
            return null;
        }
    }

    // Get upgrade recommendations for user
    getUpgradeRecommendations(currentTier, userNeeds = {}) {
        const current = this.getTierDetails(currentTier);
        const recommendations = [];

        Object.entries(this.subscriptionTiers).forEach(([tierName, tier]) => {
            if (tierName === currentTier) return;
            
            const benefits = [];
            
            // Compare item limits
            if (tier.maxItems > current.maxItems || tier.maxItems === -1) {
                benefits.push(`${tier.maxItems === -1 ? 'Unlimited' : tier.maxItems} items vs ${current.maxItems}`);
            }
            
            // Compare platforms
            if (tier.crossPostPlatforms.length > current.crossPostPlatforms.length) {
                const newPlatforms = tier.crossPostPlatforms.filter(p => !current.crossPostPlatforms.includes(p));
                if (newPlatforms.length > 0) {
                    benefits.push(`Access to ${newPlatforms.join(', ')}`);
                }
            }
            
            // Check feature upgrades
            if (tier.analytics && !current.analytics) benefits.push('Advanced analytics');
            if (tier.customBranding && !current.customBranding) benefits.push('Custom branding');
            if (tier.apiAccess && !current.apiAccess) benefits.push('API access');
            
            if (benefits.length > 0) {
                recommendations.push({
                    tierName,
                    ...tier,
                    benefits,
                    savings: tier.price < 20 ? `Save $${((tier.price * 12) * 0.1).toFixed(2)} with annual billing` : null
                });
            }
        });

        return recommendations.sort((a, b) => a.price - b.price);
    }
}

module.exports = VintageSubscriptionService;