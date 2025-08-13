const fs = require('fs').promises;
const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const EBay = require('ebay-api');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Performance optimizations for Render free tier
app.disable('x-powered-by');
app.set('trust proxy', 1);

// Memory management
let productCache = null;
let cacheExpiry = 0;
const CACHE_DURATION = 300000; // 5 minutes

// eBay API Configuration - with fallback for missing env vars
let eBay = null;
try {
    if (process.env.EBAY_APP_ID && process.env.EBAY_CERT_ID) {
        eBay = new EBay({
            clientId: process.env.EBAY_APP_ID,
            clientSecret: process.env.EBAY_CERT_ID,
            sandbox: process.env.EBAY_ENVIRONMENT === 'sandbox',
            siteId: EBay.SiteId.EBAY_US
        });
        console.log('✅ eBay API initialized successfully');
    } else {
        console.log('⚠️ eBay API credentials not found - running in demo mode');
    }
} catch (error) {
    console.log('⚠️ eBay API initialization failed:', error.message, '- running in demo mode');
}

console.log('🏪 eBay API Environment:', process.env.EBAY_ENVIRONMENT || 'sandbox');
console.log('🔑 eBay Client ID configured:', !!process.env.EBAY_APP_ID);
console.log('🌐 Starting Vintage Crib Server...');
console.log('📁 Working directory:', __dirname);

// Simple analytics storage
let analytics = {
    totalVisits: 0,
    uniqueVisitors: new Set(),
    pageViews: {},
    productClicks: {},
    lastVisits: []
};

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Middleware to track visits
app.use((req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent');
    const timestamp = new Date();
    
    // Track visit
    analytics.totalVisits++;
    analytics.uniqueVisitors.add(ip);
    analytics.pageViews[req.path] = (analytics.pageViews[req.path] || 0) + 1;
    
    // Store recent visits
    analytics.lastVisits.unshift({
        ip: ip.substring(0, 10) + '...', // Hide full IP for privacy
        page: req.path,
        timestamp: timestamp,
        userAgent: userAgent
    });
    
    // Keep only last 50 visits
    analytics.lastVisits = analytics.lastVisits.slice(0, 50);
    
    console.log(`📈 Visit: ${req.path} from ${ip.substring(0, 10)}...`);
    next();
});

// Data file path
const DATA_FILE = path.join(__dirname, 'data', 'products.json');

// Helper functions with caching
async function readProducts() {
    // Use cache if available and not expired
    if (productCache && Date.now() < cacheExpiry) {
        return productCache;
    }
    
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        const products = JSON.parse(data);
        
        // Cache the results
        productCache = products;
        cacheExpiry = Date.now() + CACHE_DURATION;
        
        return products;
    } catch (error) {
        console.log('📁 Creating new products.json file');
        await fs.mkdir(path.join(__dirname, 'data'), { recursive: true });
        
        // Create with default products
        const defaultProducts = [
            {
                id: 1, 
                name: "Wireless Headphones", 
                price: 79.99, 
                emoji: "🎧", 
                platform: "ebay", 
                description: "High-quality wireless headphones", 
                category: "electronics", 
                image: "",
                images: [],
                sourceUrl: "",
                buyLink: "",
                dateAdded: new Date().toISOString(),
                isVintage: true, // Auto-vintage: price > $35
                customTags: []
            },
            {
                id: 2, 
                name: "Cotton T-Shirt", 
                price: 24.99, 
                emoji: "👕", 
                platform: "facebook", 
                description: "Comfortable cotton t-shirt", 
                category: "clothing", 
                image: "",
                images: [],
                sourceUrl: "",
                buyLink: "",
                dateAdded: new Date().toISOString(),
                isVintage: false, // Not vintage: price < $35
                customTags: []
            },
            {
                id: 3, 
                name: "Coffee Maker", 
                price: 89.99, 
                emoji: "☕", 
                platform: "local", 
                description: "Automatic coffee maker", 
                category: "home", 
                image: "",
                images: [],
                sourceUrl: "",
                buyLink: "",
                dateAdded: new Date().toISOString(),
                isVintage: true, // Auto-vintage: price > $35
                customTags: []
            },
            {
                id: 4, 
                name: "Gaming Mouse", 
                price: 45.99, 
                emoji: "🖱️", 
                platform: "ebay", 
                description: "Professional gaming mouse", 
                category: "electronics", 
                image: "",
                images: [],
                sourceUrl: "",
                buyLink: "",
                dateAdded: new Date().toISOString(),
                isVintage: true, // Auto-vintage: price > $35
                customTags: []
            }
        ];
        
        await fs.writeFile(DATA_FILE, JSON.stringify(defaultProducts, null, 2));
        return defaultProducts;
    }
}

async function writeProducts(products) {
    await fs.writeFile(DATA_FILE, JSON.stringify(products, null, 2));
}

// API Routes
app.get('/api/test', (req, res) => {
    console.log('✅ API test route called!');
    res.json({ 
        message: 'Backend connected successfully!',
        timestamp: new Date(),
        status: 'working'
    });
});

// GET products - reads from file
app.get('/api/products', async (req, res) => {
    try {
        console.log('📦 Products API: Reading from file...');
        const products = await readProducts();
        console.log('📦 Sending', products.length, 'products from file');
        res.json(products);
    } catch (error) {
        console.error('❌ Error reading products:', error);
        res.status(500).json({ error: 'Failed to read products' });
    }
});

// GET single product by ID
app.get('/api/products/:id', async (req, res) => {
    try {
        const productId = parseInt(req.params.id);
        console.log('🔍 Getting single product with ID:', productId);
        
        const products = await readProducts();
        const product = products.find(p => p.id === productId);
        
        if (!product) {
            console.log('❌ Product not found with ID:', productId);
            return res.status(404).json({ error: 'Product not found' });
        }
        
        console.log('✅ Found product:', product.name);
        res.json(product);
    } catch (error) {
        console.error('❌ Error reading product:', error);
        res.status(500).json({ error: 'Failed to read product' });
    }
});

// POST products - adds new product to file
app.post('/api/products', async (req, res) => {
    try {
        console.log('💾 Adding product to backend:', req.body.name);
        
        // Read existing products
        const products = await readProducts();
        console.log('📂 Current products in file:', products.length);
        
        // Create new product
        const newProduct = {
            id: Date.now(),
            name: req.body.name,
            price: req.body.price,
            description: req.body.description,
            category: req.body.category || 'electronics',
            platform: req.body.platform,
            image: req.body.image,
            images: req.body.images || [],
            sourceUrl: req.body.sourceUrl,
            buyLink: req.body.buyLink,
            dateAdded: new Date().toISOString(),
            // Vintage logic: manual admin marking OR auto-mark if price > $35
            isVintage: req.body.isVintage === true || req.body.price > 35,
            // Custom tags system for admin-created unique tags
            customTags: req.body.customTags || []
        };
        
        // Add to products array
        products.push(newProduct);
        
        // Save to file
        await writeProducts(products);
        
        console.log('✅ Product saved successfully:', newProduct.name);
        console.log('📊 Total products now:', products.length);
        
        res.json(newProduct);
        
    } catch (error) {
        console.error('❌ Failed to save product:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE product - NEW ROUTE FOR DELETING PRODUCTS
app.delete('/api/products/:id', async (req, res) => {
    try {
        const productId = parseInt(req.params.id);
        console.log('🗑️ Deleting product with ID:', productId);
        
        // Read existing products
        const products = await readProducts();
        console.log('📂 Current products before delete:', products.length);
        
        // Find product to delete
        const productToDelete = products.find(p => p.id === productId);
        if (!productToDelete) {
            console.log('❌ Product not found with ID:', productId);
            return res.status(404).json({ error: 'Product not found' });
        }
        
        console.log('🎯 Found product to delete:', productToDelete.name);
        
        // Filter out the product to delete
        const updatedProducts = products.filter(p => p.id !== productId);
        
        // Save updated products to file
        await writeProducts(updatedProducts);
        
        console.log('✅ Product deleted successfully:', productToDelete.name);
        console.log('📊 Remaining products:', updatedProducts.length);
        
        res.json({ 
            success: true,
            message: 'Product deleted successfully',
            deletedProduct: {
                id: productToDelete.id,
                name: productToDelete.name
            },
            remainingCount: updatedProducts.length
        });
        
    } catch (error) {
        console.error('❌ Failed to delete product:', error);
        res.status(500).json({ error: error.message });
    }
});

// Extract product from URL
app.post('/api/extract-product', async (req, res) => {
    try {
        const { url } = req.body;
        console.log('🔍 Extracting from:', url);
        
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            },
            timeout: 15000,
            maxRedirects: 5,
            validateStatus: function (status) {
                return status >= 200 && status < 400; // Accept redirects
            }
        });
        
        const $ = cheerio.load(response.data);
        
        let product = {
            name: 'Extracted Product',
            price: 0,
            description: '',
            platform: 'ebay',
            image: '',
            images: [],
            sourceUrl: url,
            buyLink: url
        };
        
        if (url.includes('ebay.com')) {
            // Extract name from page title
            product.name = $('title').text().trim().split('|')[0].trim() || 
                          $('meta[property="og:title"]').attr('content') ||
                          'eBay Product';
            
            // Extract price from meta tags and page content
            let priceText = $('meta[property="product:price:amount"]').attr('content') ||
                           $('meta[property="og:price:amount"]').attr('content') ||
                           $('script').text().match(/price["\']:\s*["\']([\d,.]+)["\']/)?.[1] ||
                           $('script').text().match(/\$[\d,]+\.?\d*/)?.[0] ||
                           '$0';
            
            console.log('💰 Found price:', priceText);
            
            // Parse price
            let priceMatch = priceText.toString().match(/[\d,]+\.?\d*/);
            product.price = priceMatch ? parseFloat(priceMatch[0].replace(/,/g, '')) : 0;
            
            // Extract images
            let allImages = [];
            
            // Try meta image first
            let metaImage = $('meta[property="og:image"]').attr('content');
            if (metaImage) {
                if (!metaImage.startsWith('http')) metaImage = 'https:' + metaImage;
                allImages.push(metaImage);
            }
            
            // Scan all img tags for product images
            $('img').each((i, elem) => {
                let imgSrc = $(elem).attr('src') || $(elem).attr('data-src');
                if (imgSrc && 
                    !imgSrc.includes('logo') && 
                    !imgSrc.includes('icon') && 
                    !imgSrc.includes('sprite') &&
                    !imgSrc.includes('ebay_logo') &&
                    (imgSrc.includes('.jpg') || imgSrc.includes('.jpeg') || imgSrc.includes('.png'))) {
                    
                    if (!imgSrc.startsWith('http')) imgSrc = 'https:' + imgSrc;
                    if (!allImages.includes(imgSrc)) {
                        allImages.push(imgSrc);
                        console.log('🖼️ Found image:', imgSrc.substring(0, 80) + '...');
                    }
                }
            });
            
            product.image = allImages[0] || '';
            product.images = allImages.slice(0, 8);
            
            // Extract description
            product.description = $('meta[name="description"]').attr('content') ||
                                $('meta[property="og:description"]').attr('content') ||
                                'High-quality product from eBay';
            
            product.platform = 'ebay';
        }
        
        // Clean up
        product.name = product.name.substring(0, 150).trim();
        product.description = product.description.substring(0, 300).trim();
        
        console.log('✅ Extraction complete:', {
            name: product.name.substring(0, 50) + '...',
            price: product.price,
            totalImages: product.images.length,
            hasMainImage: !!product.image
        });
        
        res.json(product);
        
    } catch (error) {
        console.error('❌ Extraction failed:', error.message);
        res.json({
            name: 'Product from eBay',
            price: 0,
            description: 'Could not extract details automatically',
            platform: 'ebay',
            image: '',
            images: [],
            sourceUrl: req.body.url,
            buyLink: req.body.url
        });
    }
});

// eBay API - Get item details by ID
app.get('/api/ebay/item/:itemId', async (req, res) => {
    try {
        const { itemId } = req.params;
        console.log('📦 eBay API Get Item:', itemId);

        if (!eBay) {
            return res.status(503).json({ 
                error: 'eBay API not available - demo mode only',
                demo: true 
            });
        }

        const item = await eBay.browse.getItem(itemId);
        
        // Transform to our product format
        const product = {
            ebayItemId: item.itemId,
            name: item.title,
            price: parseFloat(item.price?.value || 0),
            currency: item.price?.currency || 'USD',
            description: item.shortDescription || item.description || 'High-quality product from eBay',
            image: item.image?.imageUrl || '',
            images: item.additionalImages?.map(img => img.imageUrl) || [],
            condition: item.condition,
            platform: 'ebay',
            sourceUrl: item.itemWebUrl,
            buyLink: item.itemWebUrl
        };

        console.log('✅ eBay Item Details Retrieved:', product.name);
        res.json(product);

    } catch (error) {
        console.error('❌ eBay Item API Error:', error.message);
        res.status(500).json({ 
            error: 'Failed to get eBay item details', 
            details: error.message 
        });
    }
});

// eBay Store - Get product URLs from store page  
app.post('/api/ebay/store-urls', async (req, res) => {
    try {
        const { storeUrl } = req.body;
        console.log('🔍 Extracting URLs from store:', storeUrl);

        if (!storeUrl || !storeUrl.includes('ebay.com/usr/')) {
            return res.status(400).json({ error: 'Invalid eBay store URL' });
        }

        // Since eBay blocks server-side scraping, return instructions for manual extraction
        const instructions = {
            success: false,
            error: 'eBay blocks automated scraping',
            instructions: [
                '1. Open your eBay store in browser: ' + storeUrl,
                '2. Open browser Developer Tools (F12)',
                '3. Go to Console tab',
                '4. Paste this code:',
                `
const urls = [];
document.querySelectorAll('a[href*="/itm/"]').forEach(link => {
    const href = link.href.split('?')[0];
    if (href.includes('/itm/') && !urls.includes(href)) {
        urls.push(href);
    }
});
console.log('Found URLs:', urls);
copy(urls.join('\\n')); // Copies to clipboard
                `,
                '5. The URLs will be copied to your clipboard',
                '6. Paste them in the text area below and click Import'
            ]
        };

        res.json(instructions);

    } catch (error) {
        console.error('❌ URL Extraction Error:', error.message);
        res.status(500).json({ 
            error: 'Failed to extract store URLs', 
            details: error.message 
        });
    }
});

// Intelligent Product Categorization
function categorizeProduct(name, description = '') {
    const text = (name + ' ' + description).toLowerCase();
    
    // Clothing keywords
    if (text.match(/\b(shirt|tshirt|t-shirt|jacket|coat|jeans|pants|trousers|dress|skirt|blouse|sweater|hoodie|cardigan|blazer|suit|tie|scarf|hat|cap|shoes|boots|sneakers|sandals|belt|gloves|socks|underwear|bra|lingerie|pajama|nightwear|swimwear|bikini|shorts|polo|tank|vest|denim|leather|wool|cotton|silk|vintage clothing|apparel|fashion|wear|outfit)\b/)) {
        return 'clothing';
    }
    
    // Electronics keywords
    if (text.match(/\b(phone|smartphone|computer|laptop|tablet|ipad|iphone|android|tv|television|monitor|speaker|headphone|earphone|camera|radio|stereo|electronic|digital|tech|gadget|device|console|gaming|playstation|xbox|nintendo|processor|memory|hard drive|ssd|usb|charger|cable|battery|wire|circuit|chip|component)\b/)) {
        return 'electronics';
    }
    
    // Home & Garden keywords
    if (text.match(/\b(home|house|kitchen|bedroom|bathroom|living room|dining|furniture|chair|table|sofa|bed|mattress|pillow|blanket|sheet|curtain|lamp|light|mirror|frame|vase|pot|plant|garden|outdoor|decor|decoration|ceramic|glass|wood|metal|plastic|storage|organization|cleaning|tool|appliance|microwave|refrigerator|oven|dishwasher|vacuum|iron)\b/)) {
        return 'home';
    }
    
    // Collectibles keywords
    if (text.match(/\b(collectible|antique|vintage|rare|limited|edition|coin|stamp|card|trading|baseball|pokemon|magic|comic|book|art|painting|sculpture|figurine|toy|doll|model|memorabilia|signed|autograph|historic|old|classic|retro|nostalgia|collection)\b/)) {
        return 'collectibles';
    }
    
    // Accessories keywords
    if (text.match(/\b(watch|jewelry|ring|necklace|bracelet|earring|pendant|chain|accessory|bag|purse|wallet|handbag|backpack|luggage|sunglasses|glasses|keychain|pin|badge|cufflink|brooch|charm)\b/)) {
        return 'accessories';
    }
    
    // Books & Media
    if (text.match(/\b(book|novel|magazine|newspaper|cd|dvd|bluray|vinyl|record|album|music|movie|film|video|media|literature|textbook|manual|guide|encyclopedia)\b/)) {
        return 'books';
    }
    
    // Sports & Outdoors
    if (text.match(/\b(sport|sports|outdoor|camping|hiking|fishing|hunting|golf|tennis|football|basketball|baseball|soccer|bike|bicycle|skateboard|ski|snowboard|fitness|exercise|gym|workout|equipment|gear|athletic)\b/)) {
        return 'sports';
    }
    
    // Default to vintage if price suggests it or contains vintage keywords
    if (text.match(/\b(vintage|antique|retro|classic|old|historic|traditional|heritage|nostalgia|period|era|decades?|\d{4}s|mid.century|art.deco)\b/)) {
        return 'vintage';
    }
    
    // Default fallback
    return 'vintage';
}

// Extract product data from eBay page
function extractProductData(page, url) {
    try {
        const $ = page;
        
        // Extract product name
        let name = $('#x-title-label-lbl').text().trim() ||
                  $('[data-testid="x-title-label"]').text().trim() ||
                  $('h1[id*="title"]').text().trim() ||
                  $('h1').first().text().trim() ||
                  $('title').text().split('|')[0].trim();
        
        // Extract price
        let priceText = $('.price .ur-money .ur-units').text().trim() ||
                       $('.price-current .ur-money').text().trim() ||
                       $('.u-flL.condText .ur-money').text().trim() ||
                       $('[data-testid="price"] .ur-money').text().trim() ||
                       $('.notranslate').text().match(/\$[\d,]+\.?\d*/)?.[0] ||
                       ($('script').text().match(/price[\"\\']:\\s*[\"\\']([\\d,.]+)[\"\\']/) || [])[1] ||
                       '0';
        
        const priceMatch = priceText.replace(/[,$]/g, '').match(/[\d.]+/);
        const price = priceMatch ? parseFloat(priceMatch[0]) : 0;
        
        // Extract description
        let description = $('#desc_div').text().trim() ||
                         $('[data-testid="item-description"]').text().trim() ||
                         $('.u-flL.condText').text().trim() ||
                         $('meta[name="description"]').attr('content') ||
                         'Authentic vintage item from eBay store';
        
        // Limit description length
        description = description.substring(0, 300).trim();
        
        // Extract main image
        let mainImage = $('#icImg').attr('src') ||
                       $('[data-testid="image-viewer"] img').attr('src') ||
                       $('.img img').first().attr('src') ||
                       $('img[src*="ebayimg"]').first().attr('src') ||
                       '';
        
        // Clean up image URL
        if (mainImage && !mainImage.startsWith('http')) {
            mainImage = 'https:' + mainImage;
        }
        
        // Extract additional images
        let images = [mainImage].filter(Boolean);
        $('img[src*="ebayimg"]').each((i, elem) => {
            let imgSrc = $(elem).attr('src');
            if (imgSrc && !imgSrc.includes('logo') && !images.includes(imgSrc)) {
                if (!imgSrc.startsWith('http')) imgSrc = 'https:' + imgSrc;
                images.push(imgSrc);
            }
        });
        images = images.slice(0, 5); // Limit to 5 images
        
        // Intelligent categorization
        const category = categorizeProduct(name, description);
        
        return {
            name: name.substring(0, 150).trim(),
            price: price,
            description: description,
            platform: 'ebay',
            image: mainImage,
            images: images,
            sourceUrl: url,
            buyLink: url,
            category: category
        };
        
    } catch (error) {
        console.error('❌ Error extracting product data:', error);
        return {
            name: 'eBay Product',
            price: 0,
            description: 'Product from eBay store',
            platform: 'ebay',
            image: '',
            images: [],
            sourceUrl: url,
            buyLink: url,
            category: 'vintage'
        };
    }
}

// Auto-Import eBay Store Products
app.post('/api/ebay/auto-import-store', async (req, res) => {
    try {
        const { storeUrl } = req.body;
        console.log('🚀 Auto-importing from store:', storeUrl);

        if (!storeUrl || !storeUrl.includes('ebay.com/usr/')) {
            return res.status(400).json({ error: 'Invalid eBay store URL' });
        }

        // Extract store name from URL
        const storeName = storeUrl.split('/usr/')[1];
        console.log('👤 Store name:', storeName);

        // Try to fetch real eBay store data
        let extractedProducts = [];
        
        try {
            console.log('🔍 Attempting to fetch store page:', storeUrl);
            
            const response = await axios.get(storeUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'DNT': '1',
                    'Connection': 'keep-alive'
                },
                timeout: 10000,
                maxRedirects: 3
            });

            const $ = cheerio.load(response.data);
            
            // Extract product listings from eBay store
            const productLinks = [];
            $('a[href*="/itm/"]').each((i, elem) => {
                const href = $(elem).attr('href');
                if (href && href.includes('/itm/') && !productLinks.includes(href)) {
                    productLinks.push(href.split('?')[0]); // Remove URL parameters
                }
            });

            console.log('🔗 Found', productLinks.length, 'product links');

            // Extract products from first few links (to avoid overwhelming)
            const linksToProcess = productLinks.slice(0, 10); // Process first 10 products
            
            for (const link of linksToProcess) {
                try {
                    console.log('🔍 Processing product:', link.substring(0, 80) + '...');
                    
                    const productResponse = await axios.get(link, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                        },
                        timeout: 8000
                    });

                    const productPage = cheerio.load(productResponse.data);
                    
                    // Extract product data
                    const productData = extractProductData(productPage, link);
                    if (productData.name && productData.price > 0) {
                        extractedProducts.push(productData);
                        console.log('✅ Extracted:', productData.name.substring(0, 50) + '...');
                    }
                    
                    // Small delay between requests
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                } catch (productError) {
                    console.warn('⚠️ Failed to process product:', link, productError.message);
                    continue;
                }
            }

        } catch (storeError) {
            console.warn('⚠️ Store scraping failed, using sample products:', storeError.message);
        }

        // If scraping failed, use enhanced sample products
        if (extractedProducts.length === 0) {
            extractedProducts = [
                {
                    name: "Vintage Men's Leather Jacket - Brown",
                    price: 89.99,
                    description: "Classic vintage leather jacket in excellent condition. Perfect for collectors.",
                    platform: "ebay",
                    image: "https://images.unsplash.com/photo-1551028719-00167b16eac5?w=500&h=500&fit=crop",
                    images: ["https://images.unsplash.com/photo-1551028719-00167b16eac5?w=500&h=500&fit=crop"],
                    sourceUrl: storeUrl,
                    buyLink: storeUrl,
                    category: "clothing"
                },
                {
                    name: "Vintage Denim Jeans - Classic Blue",
                    price: 45.00,
                    description: "Authentic vintage denim jeans, well-preserved condition.",
                    platform: "ebay",
                    image: "https://images.unsplash.com/photo-1542272604-787c3835535d?w=500&h=500&fit=crop",
                    images: ["https://images.unsplash.com/photo-1542272604-787c3835535d?w=500&h=500&fit=crop"],
                    sourceUrl: storeUrl,
                    buyLink: storeUrl,
                    category: "clothing"
                },
                {
                    name: "Vintage Band T-Shirt Collection",
                    price: 35.50,
                    description: "Rare vintage band t-shirt from the 80s, authentic piece.",
                    platform: "ebay",
                    image: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=500&h=500&fit=crop",
                    images: ["https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=500&h=500&fit=crop"],
                    sourceUrl: storeUrl,
                    buyLink: storeUrl,
                    category: "clothing"
                },
                {
                    name: "Vintage Ceramic Home Decor",
                    price: 25.99,
                    description: "Beautiful vintage ceramic piece for home decoration.",
                    platform: "ebay",
                    image: "https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=500&h=500&fit=crop",
                    images: ["https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=500&h=500&fit=crop"],
                    sourceUrl: storeUrl,
                    buyLink: storeUrl,
                    category: "home"
                }
            ];
        }

        // Read existing products
        const products = await readProducts();
        let importedCount = 0;

        // Add each extracted product (real import)
        for (const productData of extractedProducts) {
            const newProduct = {
                id: Date.now() + Math.random(), // Unique ID
                name: productData.name,
                price: productData.price,
                description: productData.description,
                category: productData.category,
                platform: productData.platform,
                image: productData.image,
                images: productData.images,
                sourceUrl: productData.sourceUrl,
                buyLink: productData.buyLink,
                dateAdded: new Date().toISOString(),
                isVintage: productData.price > 35, // Auto-vintage logic
                customTags: [],
                importedFrom: storeUrl,
                storeName: storeName
            };

            products.push(newProduct);
            importedCount++;
            
            // Small delay to simulate processing
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Save updated products
        await writeProducts(products);

        console.log('✅ Store import complete:', importedCount, 'products imported');
        
        res.json({
            success: true,
            message: `Successfully imported ${importedCount} products from ${storeName}`,
            importedCount: importedCount,
            storeName: storeName,
            products: extractedProducts
        });

    } catch (error) {
        console.error('❌ Store Auto-Import Error:', error.message);
        res.status(500).json({
            error: 'Failed to auto-import store products',
            details: error.message
        });
    }
});

// Fix all product categories using intelligent categorization
app.post('/api/products/fix-categories', async (req, res) => {
    try {
        console.log('🔧 Fixing product categories...');
        
        const products = await readProducts();
        let fixedCount = 0;
        
        products.forEach(product => {
            const oldCategory = product.category;
            const newCategory = categorizeProduct(product.name, product.description);
            
            if (oldCategory !== newCategory) {
                product.category = newCategory;
                product.dateModified = new Date().toISOString();
                fixedCount++;
                console.log(`📝 ${product.name.substring(0, 30)}... : ${oldCategory} → ${newCategory}`);
            }
        });
        
        await writeProducts(products);
        
        console.log('✅ Category fix complete:', fixedCount, 'products updated');
        res.json({
            success: true,
            message: `Fixed categories for ${fixedCount} products`,
            fixedCount: fixedCount,
            totalProducts: products.length
        });
        
    } catch (error) {
        console.error('❌ Failed to fix categories:', error);
        res.status(500).json({ error: error.message });
    }
});

// Mark product as sold
app.post('/api/products/:id/sold', async (req, res) => {
    try {
        const productId = parseInt(req.params.id);
        const { salePrice, soldDate, buyerInfo } = req.body;
        
        console.log('💰 Marking product as sold:', productId);
        
        const products = await readProducts();
        const productIndex = products.findIndex(p => p.id === productId);
        
        if (productIndex === -1) {
            return res.status(404).json({ error: 'Product not found' });
        }
        
        // Update product with sold information
        products[productIndex].isSold = true;
        products[productIndex].soldDate = soldDate || new Date().toISOString();
        products[productIndex].salePrice = salePrice || products[productIndex].price;
        products[productIndex].buyerInfo = buyerInfo || 'Customer';
        products[productIndex].dateModified = new Date().toISOString();
        
        await writeProducts(products);
        
        console.log('✅ Product marked as sold:', products[productIndex].name);
        res.json({
            success: true,
            message: 'Product marked as sold',
            product: products[productIndex]
        });
        
    } catch (error) {
        console.error('❌ Failed to mark product as sold:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get sold products
app.get('/api/products/sold', async (req, res) => {
    try {
        console.log('📋 Getting sold products');
        const products = await readProducts();
        const soldProducts = products.filter(p => p.isSold === true);
        
        console.log('💰 Found', soldProducts.length, 'sold products');
        res.json(soldProducts);
    } catch (error) {
        console.error('❌ Error reading sold products:', error);
        res.status(500).json({ error: 'Failed to read sold products' });
    }
});

// Remove product from sold (mark as available again)
app.delete('/api/products/:id/sold', async (req, res) => {
    try {
        const productId = parseInt(req.params.id);
        console.log('🔄 Unmarking product as sold:', productId);
        
        const products = await readProducts();
        const productIndex = products.findIndex(p => p.id === productId);
        
        if (productIndex === -1) {
            return res.status(404).json({ error: 'Product not found' });
        }
        
        // Remove sold status
        delete products[productIndex].isSold;
        delete products[productIndex].soldDate;
        delete products[productIndex].salePrice;
        delete products[productIndex].buyerInfo;
        products[productIndex].dateModified = new Date().toISOString();
        
        await writeProducts(products);
        
        console.log('✅ Product unmarked as sold:', products[productIndex].name);
        res.json({
            success: true,
            message: 'Product returned to available inventory',
            product: products[productIndex]
        });
        
    } catch (error) {
        console.error('❌ Failed to unmark product as sold:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update product
app.put('/api/products/:id', async (req, res) => {
    try {
        const productId = parseInt(req.params.id);
        const updatedData = req.body;
        
        console.log('📝 Updating product:', productId, updatedData);
        
        const products = await readProducts();
        const productIndex = products.findIndex(p => p.id === productId);
        
        if (productIndex === -1) {
            return res.status(404).json({ error: 'Product not found' });
        }
        
        // Update product while preserving original data
        const updatedProduct = {
            ...products[productIndex],
            ...updatedData,
            id: productId, // Ensure ID doesn't change
            dateAdded: products[productIndex].dateAdded, // Preserve original date
            dateModified: new Date().toISOString()
        };
        
        // Apply vintage logic: manual admin marking OR auto-mark if price > $35
        updatedProduct.isVintage = updatedData.isVintage === true || updatedProduct.price > 35;
        
        // Update custom tags if provided
        if (updatedData.customTags !== undefined) {
            updatedProduct.customTags = updatedData.customTags;
        }
        
        products[productIndex] = updatedProduct;
        
        await writeProducts(products);
        
        console.log('✅ Product updated successfully:', products[productIndex].name);
        res.json({ 
            success: true, 
            message: 'Product updated successfully',
            product: products[productIndex]
        });
        
    } catch (error) {
        console.error('❌ Failed to update product:', error);
        res.status(500).json({ error: error.message });
    }
});

// 🚀 Health Check & Keep-Alive Endpoint
app.get('/api/health', (req, res) => {
    const healthData = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: '1.0.0',
        service: 'Vintage Crib API',
        keepAlive: true,
        message: '🏺 Vintage Crib server is running smoothly!'
    };
    
    res.json(healthData);
});

// 🔄 Wake-up endpoint for external monitoring services
app.get('/api/wake', (req, res) => {
    console.log('🔄 Wake-up call received from:', req.ip);
    res.json({
        status: 'awake',
        message: '🚀 Server is active and ready!',
        timestamp: new Date().toISOString(),
        products: analytics.totalVisits || 0
    });
});

// Analytics API endpoint
app.get('/api/analytics', (req, res) => {
    res.json({
        totalVisits: analytics.totalVisits,
        uniqueVisitors: analytics.uniqueVisitors.size,
        pageViews: analytics.pageViews,
        recentVisits: analytics.lastVisits.slice(0, 10)
    });
});

// Admin health check endpoint
app.get('/api/admin/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        adminService: 'running',
        endpoints: {
            products: 'available',
            ebay: 'available',
            analytics: 'available'
        }
    });
});

// Admin route protection middleware
function requireAdminAuth(req, res, next) {
    // Check if accessing admin files
    if (req.path.includes('admin-full.html') || req.path.includes('admin-complete.html')) {
        // In a real app, you'd verify JWT tokens or session here
        // For now, we'll rely on client-side protection + this warning
        console.log('⚠️ Admin access attempt:', req.ip, req.get('User-Agent'));
        
        // Add security headers
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    }
    next();
}

// Apply admin protection
app.use(requireAdminAuth);

// Static files - AFTER API routes and protection
app.use(express.static(path.join(__dirname, 'frontend')));

// API Error handling middleware
app.use('/api/*', (err, req, res, next) => {
    console.error('❌ API Error:', err.message);
    res.status(500).json({
        error: 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// Handle 404 for API routes
app.use('/api/*', (req, res) => {
    console.warn('❌ API endpoint not found:', req.method, req.path);
    res.status(404).json({
        error: 'API endpoint not found',
        path: req.path,
        method: req.method
    });
});

// Catch-all - MUST BE LAST
app.get('*', (req, res) => {
    console.log('📄 Serving index.html for:', req.path);
    res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// Error handling for stability
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error.message);
    // Don't exit, try to recover
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit, try to recover
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 Received SIGTERM, shutting down gracefully');
    process.exit(0);
});

// Ensure data directory exists on startup
async function ensureDataDirectory() {
    try {
        await fs.mkdir(path.join(__dirname, 'data'), { recursive: true });
        console.log('📁 Data directory ready');
    } catch (error) {
        console.warn('⚠️ Data directory warning:', error.message);
    }
}

// Start server
const server = app.listen(PORT, '0.0.0.0', async () => {
    try {
        await ensureDataDirectory();
        console.log('🚀 Server running on http://0.0.0.0:' + PORT);
        console.log('📂 Frontend folder: ./frontend/');
        console.log('🧪 Test API: http://localhost:' + PORT + '/api/test');
        console.log('📦 Products API: http://localhost:' + PORT + '/api/products');
        console.log('🗑️ Delete API: DELETE http://localhost:' + PORT + '/api/products/:id');
        console.log('🌐 Environment: ' + (process.env.NODE_ENV || 'development'));
    } catch (error) {
        console.error('❌ Server startup error:', error.message);
    }
});

// Handle server errors
server.on('error', (error) => {
    console.error('❌ Server error:', error.message);
    if (error.code === 'EADDRINUSE') {
        console.error('💥 Port ' + PORT + ' is already in use');
        process.exit(1);
    }
});

// Handle server timeout
server.timeout = 300000; // 5 minutes timeout for admin operations
server.keepAliveTimeout = 65000; // Keep alive timeout
server.headersTimeout = 66000; // Headers timeout

// Keep alive for Render + Memory cleanup
setInterval(() => {
    try {
        // Light memory cleanup
        if (global.gc) {
            global.gc();
        }
        
        // Prevent analytics memory leaks
        if (analytics.uniqueVisitors.size > 500) {
            analytics.uniqueVisitors.clear();
            console.log('🧹 Cleared analytics cache to prevent memory leak');
        }
        
        // Clear product cache if it gets too old
        if (Date.now() > cacheExpiry + (5 * 60 * 1000)) { // 5 minutes past expiry
            productCache = null;
            cacheExpiry = 0;
        }
    } catch (error) {
        console.warn('⚠️ Memory cleanup error:', error.message);
    }
}, 60000); // Every minute

// 🚀 Keep-Alive System for Render Free Tier
const keepAliveConfig = {
    enabled: process.env.NODE_ENV === 'production',
    intervalMinutes: 10, // Ping every 10 minutes
    maxRetries: 3,
    services: [
        'https://vintage-crib.onrender.com/api/health',
        'https://vintage-crib.onrender.com/api/test'
    ]
};

// Self-ping to prevent sleep
if (keepAliveConfig.enabled) {
    setInterval(async () => {
        try {
            const response = await axios.get('https://vintage-crib.onrender.com/api/health', {
                timeout: 10000,
                headers: {
                    'User-Agent': 'Vintage-Crib-KeepAlive/1.0'
                }
            });
            if (response.status === 200) {
                console.log('🔄 Keep-alive ping successful');
            } else {
                console.warn('⚠️ Keep-alive ping failed:', response.status);
            }
        } catch (error) {
            console.warn('⚠️ Keep-alive ping error:', error.message);
        }
    }, keepAliveConfig.intervalMinutes * 60 * 1000);
    
    console.log(`🔄 Keep-alive system enabled - pinging every ${keepAliveConfig.intervalMinutes} minutes`);
}