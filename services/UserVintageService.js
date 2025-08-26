const { User, VintageSeller } = require('../database/models');
const { hashPassword } = require('../auth');

class UserVintageService {
    constructor() {
        this.subscriptionTiers = {
            'free': {
                maxItems: 10,
                platforms: ['vintage_crib'],
                features: ['basic_listing', 'portfolio']
            },
            'starter': {
                maxItems: 50,
                platforms: ['vintage_crib', 'poshmark', 'depop'],
                features: ['basic_listing', 'portfolio', 'cross_post_manual', 'analytics_basic']
            },
            'pro': {
                maxItems: 200,
                platforms: ['vintage_crib', 'ebay', 'poshmark', 'depop', 'mercari'],
                features: ['advanced_listing', 'portfolio', 'cross_post_auto', 'analytics_advanced', 'bulk_tools']
            },
            'enterprise': {
                maxItems: -1, // unlimited
                platforms: ['all'],
                features: ['all', 'api_access', 'custom_branding']
            }
        };
    }

    async extendUserForVintage(userId, userData = {}) {
        try {
            // Check if user already has vintage seller profile
            let seller = await VintageSeller.findByUserId(userId);
            
            if (!seller) {
                // Get user details for auto-generation
                const user = await User.findById(userId);
                
                // Create vintage seller profile with smart defaults
                const sellerData = {
                    user_id: userId,
                    store_name: userData.store_name || 
                              `${user?.username || 'User'}'s Vintage Store`,
                    bio: userData.bio || 
                         'Curated vintage finds with authentic style and quality.',
                    subscription_tier: userData.subscription_tier || 'free',
                    instagram_handle: userData.instagram_handle || null,
                    ebay_store_url: userData.ebay_store_url || null,
                    profile_image: userData.profile_image || null,
                    is_verified: false,
                    total_sales: 0,
                    rating: 0.0
                };

                seller = await VintageSeller.create(sellerData);
                console.log(`✅ Created vintage seller profile for user ${userId}: ${seller.store_name}`);
            } else {
                console.log(`✅ Vintage seller profile already exists for user ${userId}: ${seller.store_name}`);
            }
            
            return seller;

        } catch (error) {
            console.error('Error extending user for vintage:', error);
            throw error;
        }
    }

    async upgradeSubscription(userId, newTier, paymentInfo = null) {
        try {
            const seller = await VintageSeller.findByUserId(userId);
            if (!seller) {
                throw new Error('Seller profile not found');
            }

            if (!this.subscriptionTiers[newTier]) {
                throw new Error('Invalid subscription tier');
            }

            // In a real app, you'd process payment here
            if (paymentInfo) {
                console.log(`💳 Processing payment for ${newTier} subscription...`);
                // await this.processPayment(paymentInfo);
            }

            // Update seller tier
            const updatedSeller = await VintageSeller.update(seller.id, {
                subscription_tier: newTier
            });

            console.log(`🎉 User ${userId} upgraded to ${newTier} tier`);
            return {
                success: true,
                seller: updatedSeller,
                tier: this.subscriptionTiers[newTier]
            };

        } catch (error) {
            console.error('Subscription upgrade error:', error);
            throw error;
        }
    }

    async checkVintageAccess(userId, requiredFeature = null) {
        try {
            const seller = await VintageSeller.findByUserId(userId);
            
            if (!seller) {
                return {
                    hasAccess: false,
                    reason: 'No vintage seller profile found'
                };
            }

            const tier = this.subscriptionTiers[seller.subscription_tier];
            if (!tier) {
                return {
                    hasAccess: false,
                    reason: 'Invalid subscription tier'
                };
            }

            if (requiredFeature) {
                const hasFeature = tier.features.includes(requiredFeature) || 
                                 tier.features.includes('all');
                
                if (!hasFeature) {
                    return {
                        hasAccess: false,
                        reason: `Feature '${requiredFeature}' requires upgrade`,
                        currentTier: seller.subscription_tier,
                        requiredTier: this.getMinimumTierForFeature(requiredFeature)
                    };
                }
            }

            return {
                hasAccess: true,
                seller,
                tier,
                currentTier: seller.subscription_tier
            };

        } catch (error) {
            console.error('Access check error:', error);
            return {
                hasAccess: false,
                reason: 'System error during access check'
            };
        }
    }

    getMinimumTierForFeature(feature) {
        for (const [tierName, tierInfo] of Object.entries(this.subscriptionTiers)) {
            if (tierInfo.features.includes(feature) || tierInfo.features.includes('all')) {
                return tierName;
            }
        }
        return 'enterprise'; // fallback
    }

    async getUserStats(userId) {
        try {
            const seller = await VintageSeller.findByUserId(userId);
            if (!seller) return null;

            // Get item stats
            const { VintageItem, CrossPost } = require('../database/models');
            const items = await VintageItem.getBySeller(seller.id, 1000, 0); // Get all items
            
            // Calculate stats
            const stats = {
                totalItems: items.length,
                publishedItems: items.filter(item => item.status === 'published').length,
                draftItems: items.filter(item => item.status === 'draft').length,
                soldItems: items.filter(item => item.status === 'sold').length,
                totalRevenue: items
                    .filter(item => item.status === 'sold')
                    .reduce((sum, item) => sum + (item.price || 0), 0),
                avgPrice: items.length > 0 
                    ? items.reduce((sum, item) => sum + item.price, 0) / items.length 
                    : 0,
                totalViews: items.reduce((sum, item) => sum + (item.views || 0), 0),
                totalLikes: items.reduce((sum, item) => sum + (item.likes || 0), 0),
                tier: seller.subscription_tier,
                tierLimits: this.subscriptionTiers[seller.subscription_tier]
            };

            // Usage vs limits
            stats.usage = {
                itemsUsed: stats.totalItems,
                itemsLimit: stats.tierLimits.maxItems,
                itemsPercentage: stats.tierLimits.maxItems > 0 
                    ? (stats.totalItems / stats.tierLimits.maxItems * 100).toFixed(1)
                    : 0
            };

            return stats;

        } catch (error) {
            console.error('Error getting user stats:', error);
            return null;
        }
    }

    async createAdminUser(username, password, email) {
        try {
            // Check if admin already exists
            const existingUser = await User.findByUsername(username);
            if (existingUser) {
                return { success: false, message: 'Admin user already exists' };
            }

            // Hash password
            const hashedPassword = await hashPassword(password);

            // Create admin user
            const adminUser = await User.create({
                username,
                email,
                password_hash: hashedPassword,
                role: 'admin'
            });

            // Create vintage seller profile for admin
            await this.extendUserForVintage(adminUser.id, {
                store_name: 'Admin Vintage Collection',
                bio: 'Official admin store with curated vintage pieces',
                subscription_tier: 'enterprise'
            });

            console.log(`✅ Admin user created: ${username}`);
            return {
                success: true,
                user: {
                    id: adminUser.id,
                    username: adminUser.username,
                    role: adminUser.role
                }
            };

        } catch (error) {
            console.error('Error creating admin user:', error);
            return { success: false, message: 'Failed to create admin user' };
        }
    }

    // Middleware factory for vintage access control
    createVintageAccessMiddleware(requiredFeature = null) {
        return async (req, res, next) => {
            try {
                if (!req.user) {
                    return res.status(401).json({ error: 'Authentication required' });
                }

                // Admins always have access
                if (req.user.role === 'admin') {
                    // For admins, get or create seller profile
                    const seller = await this.extendUserForVintage(req.user.id, {
                        subscription_tier: 'enterprise'
                    });
                    req.seller = seller;
                    req.vintageAccess = this.subscriptionTiers['enterprise'];
                    return next();
                }

                const accessCheck = await this.checkVintageAccess(req.user.id, requiredFeature);
                
                if (!accessCheck.hasAccess) {
                    return res.status(403).json({
                        error: 'Vintage access denied',
                        reason: accessCheck.reason,
                        currentTier: accessCheck.currentTier,
                        requiredTier: accessCheck.requiredTier,
                        upgrade_url: '/api/vintage/upgrade'
                    });
                }

                // Attach seller info to request
                req.seller = accessCheck.seller;
                req.vintageAccess = accessCheck.tier;
                next();

            } catch (error) {
                console.error('Vintage access middleware error:', error);
                res.status(500).json({ error: 'Access check failed' });
            }
        };
    }

    // Get subscription tiers info for frontend
    getSubscriptionInfo() {
        return {
            tiers: this.subscriptionTiers,
            features: {
                'basic_listing': 'Create basic vintage listings',
                'advanced_listing': 'Advanced listing features & templates',
                'portfolio': 'Public seller portfolio',
                'cross_post_manual': 'Manual cross-posting tools',
                'cross_post_auto': 'Automated cross-posting',
                'analytics_basic': 'Basic analytics dashboard',
                'analytics_advanced': 'Advanced analytics & insights',
                'bulk_tools': 'Bulk editing and management',
                'api_access': 'API access for integrations',
                'custom_branding': 'Custom store branding'
            }
        };
    }
}

module.exports = UserVintageService;