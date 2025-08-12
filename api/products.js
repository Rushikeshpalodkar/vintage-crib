const fs = require('fs').promises;
const path = require('path');

// Data file path
const DATA_FILE = path.join(process.cwd(), 'data', 'products.json');

// Helper functions
async function readProducts() {
    // For Vercel deployment, return default products directly
    console.log('📁 Using default products for Vercel');
    
    // Create default products
        const defaultProducts = [
            {
                id: 1, 
                name: "Vintage Leather Jacket", 
                price: 89.99, 
                platform: "curated", 
                description: "Authentic vintage leather jacket with timeless appeal", 
                category: "clothing", 
                image: "https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=400&h=400&fit=crop",
                images: ["https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=400&h=400&fit=crop"],
                sourceUrl: "",
                buyLink: "",
                dateAdded: new Date().toISOString()
            },
            {
                id: 2, 
                name: "Antique Brass Compass", 
                price: 45.50, 
                platform: "curated", 
                description: "Beautiful antique brass compass with original patina", 
                category: "collectibles", 
                image: "https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=400&h=400&fit=crop",
                images: ["https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=400&h=400&fit=crop"],
                sourceUrl: "",
                buyLink: "",
                dateAdded: new Date().toISOString()
            },
            {
                id: 3, 
                name: "Vintage Ceramic Vase", 
                price: 65.00, 
                platform: "curated", 
                description: "Mid-century ceramic vase with unique geometric pattern", 
                category: "home", 
                image: "https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?w=400&h=400&fit=crop",
                images: ["https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?w=400&h=400&fit=crop"],
                sourceUrl: "",
                buyLink: "",
                dateAdded: new Date().toISOString()
            },
            {
                id: 4, 
                name: "Retro Vinyl Record Player", 
                price: 125.99, 
                platform: "curated", 
                description: "Restored vintage turntable in excellent working condition", 
                category: "electronics", 
                image: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=400&fit=crop",
                images: ["https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=400&fit=crop"],
                sourceUrl: "",
                buyLink: "",
                dateAdded: new Date().toISOString()
            }
        ];
        
        return defaultProducts;
}

async function writeProducts(products) {
    try {
        await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
        await fs.writeFile(DATA_FILE, JSON.stringify(products, null, 2));
    } catch (error) {
        console.error('Error writing products:', error);
    }
}

module.exports = async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        if (req.method === 'GET') {
            console.log('📦 Products API: Reading products...');
            const products = await readProducts();
            console.log('📦 Sending', products.length, 'products');
            res.status(200).json(products);
        } 
        else if (req.method === 'POST') {
            console.log('💾 Adding product:', req.body.name);
            
            const products = await readProducts();
            const newProduct = {
                id: Date.now(),
                name: req.body.name,
                price: req.body.price,
                description: req.body.description,
                category: req.body.category || 'vintage',
                platform: req.body.platform,
                image: req.body.image,
                images: req.body.images || [],
                sourceUrl: req.body.sourceUrl,
                buyLink: req.body.buyLink,
                dateAdded: new Date().toISOString()
            };
            
            products.push(newProduct);
            await writeProducts(products);
            
            console.log('✅ Product saved successfully:', newProduct.name);
            res.status(200).json(newProduct);
        }
        else {
            res.status(405).json({ error: 'Method not allowed' });
        }
    } catch (error) {
        console.error('❌ API Error:', error);
        res.status(500).json({ error: error.message });
    }
}