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

// eBay API Configuration
const eBay = new EBay({
    clientId: process.env.EBAY_APP_ID,
    clientSecret: process.env.EBAY_CERT_ID,
    sandbox: process.env.EBAY_ENVIRONMENT === 'sandbox',
    siteId: EBay.SiteId.EBAY_US
});

console.log('🏪 eBay API Environment:', process.env.EBAY_ENVIRONMENT || 'sandbox');
console.log('🔑 eBay Client ID configured:', !!process.env.EBAY_APP_ID);
console.log('🌐 Starting Vintage Crib Server...');
console.log('📁 Working directory:', __dirname);

// Middleware
app.use(cors());
app.use(express.json());

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
                dateAdded: new Date().toISOString()
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
                dateAdded: new Date().toISOString()
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
                dateAdded: new Date().toISOString()
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
                dateAdded: new Date().toISOString()
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
            dateAdded: new Date().toISOString()
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
        products[productIndex] = {
            ...products[productIndex],
            ...updatedData,
            id: productId, // Ensure ID doesn't change
            dateAdded: products[productIndex].dateAdded, // Preserve original date
            dateModified: new Date().toISOString()
        };
        
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

// Static files - AFTER API routes
app.use(express.static(path.join(__dirname, 'frontend')));

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

// Start server
const server = app.listen(PORT, () => {
    console.log('🚀 Server running on http://localhost:' + PORT);
    console.log('📂 Frontend folder: ./frontend/');
    console.log('🧪 Test API: http://localhost:' + PORT + '/api/test');
    console.log('📦 Products API: http://localhost:' + PORT + '/api/products');
    console.log('🗑️ Delete API: DELETE http://localhost:' + PORT + '/api/products/:id');
});

// Handle server errors
server.on('error', (error) => {
    console.error('❌ Server error:', error.message);
});

// Keep alive for Render + Memory cleanup
setInterval(() => {
    // Light memory cleanup
    if (global.gc) {
        global.gc();
    }
    
    // Prevent analytics memory leaks
    if (analytics.uniqueVisitors.size > 500) {
        analytics.uniqueVisitors.clear();
        console.log('🧹 Cleared analytics cache to prevent memory leak');
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
            const response = await fetch('https://vintage-crib.onrender.com/api/health');
            if (response.ok) {
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
// Simple analytics storage
let analytics = {
    totalVisits: 0,
    uniqueVisitors: new Set(),
    pageViews: {},
    productClicks: {},
    lastVisits: []
};

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

// Analytics API endpoint
app.get('/api/analytics', (req, res) => {
    res.json({
        totalVisits: analytics.totalVisits,
        uniqueVisitors: analytics.uniqueVisitors.size,
        pageViews: analytics.pageViews,
        recentVisits: analytics.lastVisits.slice(0, 10)
    });
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