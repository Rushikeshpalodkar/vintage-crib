const fs = require('fs').promises;
const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Data file path
const DATA_FILE = path.join(__dirname, 'data', 'products.json');

// Helper functions
async function readProducts() {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        return JSON.parse(data);
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
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 15000
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

// Static files - AFTER API routes
app.use(express.static(path.join(__dirname, 'frontend')));

// Catch-all - MUST BE LAST
app.get('*', (req, res) => {
    console.log('📄 Serving index.html for:', req.path);
    res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log('🚀 Server running on http://localhost:' + PORT);
    console.log('📂 Frontend folder: ./frontend/');
    console.log('🧪 Test API: http://localhost:' + PORT + '/api/test');
    console.log('📦 Products API: http://localhost:' + PORT + '/api/products');
    console.log('🗑️ Delete API: DELETE http://localhost:' + PORT + '/api/products/:id');
});
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