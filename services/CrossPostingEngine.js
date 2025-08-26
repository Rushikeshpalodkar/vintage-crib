const VintageEbayService = require('./VintageEbayService');
const { VintageItem, VintageSeller, CrossPost } = require('../database/models');

class CrossPostingEngine {
    constructor(ebayAPI = null) {
        this.ebayService = new VintageEbayService(ebayAPI);
        this.platformUrls = {
            poshmark: 'https://poshmark.com/create-listing',
            depop: 'https://www.depop.com/products/create/',
            mercari: 'https://www.mercari.com/sell/'
        };
    }

    async publishToAllPlatforms(itemId, userId, platforms = ['ebay', 'poshmark', 'depop']) {
        try {
            console.log(`🚀 Cross-posting item ${itemId} to ${platforms.join(', ')}`);
            
            const item = await VintageItem.findById(itemId);
            if (!item) {
                throw new Error('Item not found');
            }

            const seller = await VintageSeller.findByUserId(userId);
            if (!seller) {
                throw new Error('Seller profile not found');
            }

            const results = {};

            // Process each platform
            for (const platform of platforms) {
                try {
                    results[platform] = await this.publishToPlatform(item, seller, platform);
                    console.log(`✅ ${platform}: ${results[platform].status}`);
                } catch (error) {
                    results[platform] = {
                        success: false,
                        status: 'failed',
                        error: error.message
                    };
                    console.error(`❌ ${platform} failed:`, error.message);
                }
            }

            // Update item status if any platform succeeded
            const successfulPlatforms = Object.keys(results).filter(
                platform => results[platform].success
            );

            if (successfulPlatforms.length > 0) {
                await VintageItem.update(itemId, {
                    status: 'published',
                    published_to: JSON.stringify(successfulPlatforms)
                });
            }

            return {
                success: successfulPlatforms.length > 0,
                results,
                publishedCount: successfulPlatforms.length,
                totalPlatforms: platforms.length
            };

        } catch (error) {
            console.error('Cross-posting engine error:', error);
            throw error;
        }
    }

    async publishToPlatform(item, seller, platform) {
        switch (platform.toLowerCase()) {
            case 'ebay':
                return await this.publishToEbay(item, seller);
            
            case 'poshmark':
                return await this.prepareForPoshmark(item, seller);
            
            case 'depop':
                return await this.prepareForDepop(item, seller);
            
            case 'mercari':
                return await this.prepareForMercari(item, seller);
            
            case 'vintage_crib':
                return await this.publishToVintageCrib(item, seller);
            
            default:
                throw new Error(`Unsupported platform: ${platform}`);
        }
    }

    async publishToEbay(item, seller) {
        try {
            // Use the VintageEbayService for actual eBay publishing
            const result = await this.ebayService.publishVintageItem(item);
            
            return {
                success: true,
                platform: 'ebay',
                status: 'success',
                external_id: result.ebayId,
                external_url: result.url,
                fees: result.fees,
                message: 'Successfully listed on eBay'
            };

        } catch (error) {
            return {
                success: false,
                platform: 'ebay',
                status: 'failed',
                error: error.message
            };
        }
    }

    async prepareForPoshmark(item, seller) {
        // Poshmark requires manual posting, so we prepare the data
        const formattedData = this.formatForPoshmark(item, seller);
        
        return {
            success: true,
            platform: 'poshmark',
            status: 'ready_for_manual_post',
            clipboardData: formattedData,
            instructions: [
                '1. Open Poshmark.com and log into your account',
                '2. Click "Sell" to create a new listing',
                '3. Upload your images (prepared list below)',
                '4. Copy the title and description provided',
                '5. Set category, size, and brand as specified',
                '6. Set the price and publish'
            ],
            openUrl: 'https://poshmark.com/create-listing',
            data: formattedData
        };
    }

    async prepareForDepop(item, seller) {
        // Depop also requires manual posting
        const formattedData = this.formatForDepop(item, seller);
        
        return {
            success: true,
            platform: 'depop',
            status: 'ready_for_manual_post',
            clipboardData: formattedData,
            instructions: [
                '1. Open Depop app or website',
                '2. Tap the camera icon to create listing',
                '3. Upload your photos',
                '4. Use the provided title and description',
                '5. Set category and price',
                '6. Add hashtags from the list provided',
                '7. Publish your item'
            ],
            openUrl: 'https://www.depop.com/products/create/',
            data: formattedData
        };
    }

    async prepareForMercari(item, seller) {
        const formattedData = this.formatForMercari(item, seller);
        
        return {
            success: true,
            platform: 'mercari',
            status: 'ready_for_manual_post',
            clipboardData: formattedData,
            instructions: [
                '1. Open Mercari app or website',
                '2. Tap "Sell" to create a new listing',
                '3. Upload photos (up to 12)',
                '4. Copy the title and description',
                '5. Select category and condition',
                '6. Set price and shipping',
                '7. Publish listing'
            ],
            openUrl: 'https://www.mercari.com/sell/',
            data: formattedData
        };
    }

    async publishToVintageCrib(item, seller) {
        // This is our own platform - direct database update
        await VintageItem.update(item.id, { 
            status: 'published',
            published_to: JSON.stringify(['vintage_crib'])
        });

        return {
            success: true,
            platform: 'vintage_crib',
            status: 'success',
            external_id: item.id.toString(),
            external_url: `https://vintagecrib.com/items/${item.id}`,
            message: 'Published to Vintage Crib marketplace'
        };
    }

    formatForPoshmark(item, seller) {
        // Poshmark-optimized formatting
        const title = `${item.brand ? item.brand + ' ' : ''}${item.title}${item.size ? ' Size ' + item.size : ''}`;
        
        const description = `${item.description}

🌟 ITEM DETAILS:
• Brand: ${item.brand || 'Vintage/Unbranded'}
• Size: ${item.size || 'See measurements'}
• Condition: ${item.condition || 'Good'}
• Era: Vintage

📏 MEASUREMENTS:
Please see photos for detailed measurements

💫 STYLING TIPS:
Perfect for creating that vintage aesthetic! 
Pairs beautifully with modern pieces.

🏠 SOLD BY: ${seller.store_name}
${seller.bio || 'Curated vintage finds with love'}

✨ Follow my closet for daily vintage treasures!
❤️ Bundle 2+ items for 10% off!

#vintage #retro #style #fashion #poshmarkfinds`;

        return {
            title: title.substring(0, 50), // Poshmark title limit
            description: description,
            category: this.mapToPoshmarkCategory(item.category),
            brand: item.brand || 'Vintage',
            size: item.size || 'OS',
            price: item.price,
            condition: this.mapToPoshmarkCondition(item.condition),
            images: item.images || [],
            tags: this.generatePoshmarkTags(item)
        };
    }

    formatForDepop(item, seller) {
        // Depop loves hashtags and casual descriptions
        const description = `${item.description}

✨ Vintage ${item.category || 'piece'} 
${item.brand ? `Brand: ${item.brand}` : ''}
${item.size ? `Size: ${item.size}` : ''}
Condition: ${item.condition || 'Good'}

From @${seller.store_name || 'vintagecrib'} 💫
${seller.bio || ''}

Message me with any questions! 💌`;

        const hashtags = this.generateDepopHashags(item);

        return {
            description: description + '\n\n' + hashtags.join(' '),
            price: item.price,
            category: item.category || 'clothing',
            brand: item.brand || '',
            size: item.size || 'S',
            condition: item.condition || 'good',
            images: item.images || [],
            tags: hashtags
        };
    }

    formatForMercari(item, seller) {
        const title = `${item.brand ? '[' + item.brand + '] ' : ''}${item.title}${item.size ? ' (Size ' + item.size + ')' : ''}`;
        
        const description = `${item.description}

📋 Details:
• Brand: ${item.brand || 'Vintage/Unbranded'}
• Size: ${item.size || 'See measurements'}  
• Condition: ${item.condition || 'Good'}
• Style: Vintage

📦 Shipping: Ships within 1-2 business days
💝 Bundle discounts available!

Questions? Feel free to ask! 😊`;

        return {
            title: title.substring(0, 80), // Mercari title limit
            description: description,
            category: this.mapToMercariCategory(item.category),
            brand: item.brand || '',
            size: item.size || 'S',
            condition: this.mapToMercariCondition(item.condition),
            price: item.price,
            images: item.images || []
        };
    }

    mapToPoshmarkCategory(category) {
        const categoryMap = {
            'clothing': 'Women > Tops',
            'dresses': 'Women > Dresses',
            'accessories': 'Women > Accessories',
            'shoes': 'Women > Shoes',
            'bags': 'Women > Bags',
            'jewelry': 'Women > Jewelry'
        };
        return categoryMap[category] || 'Women > Other';
    }

    mapToPoshmarkCondition(condition) {
        const conditionMap = {
            'new': 'NWT (New With Tags)',
            'like_new': 'NWOT (New Without Tags)',
            'excellent': 'Excellent Used Condition',
            'good': 'Good Used Condition',
            'fair': 'Fair Used Condition'
        };
        return conditionMap[condition] || 'Good Used Condition';
    }

    mapToMercariCondition(condition) {
        const conditionMap = {
            'new': 'New, unused',
            'like_new': 'Like new',
            'excellent': 'Good',
            'good': 'Good',
            'fair': 'Fair'
        };
        return conditionMap[condition] || 'Good';
    }

    mapToMercariCategory(category) {
        const categoryMap = {
            'clothing': 'Women/Tops & Blouses',
            'dresses': 'Women/Dresses',
            'accessories': 'Women/Accessories',
            'shoes': 'Women/Shoes',
            'bags': 'Women/Bags',
            'jewelry': 'Women/Jewelry'
        };
        return categoryMap[category] || 'Women/Other';
    }

    generatePoshmarkTags(item) {
        const tags = ['vintage', 'retro', 'unique'];
        if (item.brand) tags.push(item.brand.toLowerCase());
        if (item.category) tags.push(item.category);
        if (item.size) tags.push(`size${item.size.toLowerCase()}`);
        return tags;
    }

    generateDepopHashags(item) {
        const hashtags = ['#vintage', '#retro', '#thrifted', '#sustainable'];
        
        if (item.brand) hashtags.push(`#${item.brand.toLowerCase().replace(/\s+/g, '')}`);
        if (item.category) hashtags.push(`#${item.category}`);
        if (item.size && item.size.toLowerCase() !== 'os') {
            hashtags.push(`#size${item.size.toLowerCase()}`);
        }
        
        // Add popular Depop hashtags
        hashtags.push('#depop', '#vintagestyle', '#90s', '#y2k');
        
        return hashtags.slice(0, 20); // Depop has hashtag limits
    }

    // Clipboard preparation method for easy testing
    prepareClipboardData(item, platform, seller = null) {
        // Default seller if not provided
        const defaultSeller = seller || {
            store_name: 'Vintage Crib Official',
            bio: 'Curated vintage collection'
        };

        switch (platform.toLowerCase()) {
            case 'poshmark':
                const poshmarkData = this.formatForPoshmark(item, defaultSeller);
                return {
                    platform: 'poshmark',
                    clipboardData: `${poshmarkData.title}\n\n${poshmarkData.description}`,
                    platformUrl: 'https://poshmark.com/create-listing',
                    instructions: [
                        '1. Open Poshmark.com and log into your account',
                        '2. Click "Sell" to create a new listing',
                        '3. Upload your images',
                        '4. Copy and paste the title and description',
                        '5. Set category, size, and brand',
                        '6. Set the price and publish'
                    ],
                    formattedData: poshmarkData
                };
                
            case 'depop':
                const depopData = this.formatForDepop(item, defaultSeller);
                return {
                    platform: 'depop',
                    clipboardData: depopData.description,
                    platformUrl: 'https://www.depop.com/products/create/',
                    instructions: [
                        '1. Open Depop app or website',
                        '2. Tap the camera icon to create listing',
                        '3. Upload your photos',
                        '4. Copy and paste the description with hashtags',
                        '5. Set category and price',
                        '6. Publish your item'
                    ],
                    formattedData: depopData
                };
                
            case 'mercari':
                const mercariData = this.formatForMercari(item, defaultSeller);
                return {
                    platform: 'mercari',
                    clipboardData: `${mercariData.title}\n\n${mercariData.description}`,
                    platformUrl: 'https://www.mercari.com/sell/',
                    instructions: [
                        '1. Open Mercari app or website',
                        '2. Tap "Sell" to create a new listing',
                        '3. Upload photos',
                        '4. Copy and paste title and description',
                        '5. Select category and condition',
                        '6. Set price and shipping',
                        '7. Publish listing'
                    ],
                    formattedData: mercariData
                };
                
            case 'ebay':
                return {
                    platform: 'ebay',
                    clipboardData: `${item.title}\n\n${item.description}\n\nPrice: $${item.price}`,
                    platformUrl: 'https://www.ebay.com/sl/sell',
                    instructions: [
                        '1. eBay integration is automated',
                        '2. Items are published directly via API',
                        '3. No manual copying required'
                    ],
                    formattedData: { title: item.title, description: item.description, price: item.price }
                };
                
            default:
                throw new Error(`Unsupported platform for clipboard preparation: ${platform}`);
        }
    }

    // Analytics and reporting methods
    async getCrossPostStats(sellerId) {
        try {
            const stats = await CrossPost.getStatsBySeller(sellerId);
            return {
                totalPosts: stats.total || 0,
                successfulPosts: stats.successful || 0,
                pendingPosts: stats.pending || 0,
                failedPosts: stats.failed || 0,
                platformBreakdown: stats.platformBreakdown || {},
                successRate: stats.total > 0 ? (stats.successful / stats.total * 100).toFixed(1) : 0
            };
        } catch (error) {
            console.error('Failed to get cross-post stats:', error);
            return null;
        }
    }

    async retryFailedPosts(sellerId, platform = null) {
        try {
            const failedPosts = await CrossPost.getFailedBySeller(sellerId, platform);
            const results = [];

            for (const post of failedPosts) {
                const item = await VintageItem.findById(post.item_id);
                const seller = await VintageSeller.findById(item.seller_id);
                
                const result = await this.publishToPlatform(item, seller, post.platform);
                results.push({ postId: post.id, result });
            }

            return results;
        } catch (error) {
            console.error('Failed to retry failed posts:', error);
            throw error;
        }
    }
}

module.exports = CrossPostingEngine;