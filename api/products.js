const fs = require('fs').promises;
const path = require('path');

// Data file path
const DATA_FILE = path.join(process.cwd(), 'data', 'products.json');

// Helper functions
async function readProducts() {
    try {
        // First try to read from the data file
        const data = await fs.readFile(DATA_FILE, 'utf8');
        const products = JSON.parse(data);
        console.log('📁 Loaded', products.length, 'products from data file');
        return products;
    } catch (error) {
        console.log('📁 Data file not found, using your vintage products');
        
        // Return your actual vintage products if file not found
        const vintageProducts = [
            {
                id: 1754989743547,
                name: "Boy Scouts of America Vintage",
                price: 40,
                description: "The product is a vintage item related to the Boy Scouts of America, specifically made in the United States. It does not mention if it is signed or not. This vintage piece could hold sentimental value for collectors or former members of the Boy Scouts organization.",
                category: "collectibles",
                platform: "ebay",
                image: "https://i.ebayimg.com/images/g/O0YAAeSwoUZomXZO/s-l400.jpg",
                images: [
                    "https://i.ebayimg.com/images/g/O0YAAeSwoUZomXZO/s-l400.jpg",
                    "https://i.ebayimg.com/images/g/O0YAAeSwoUZomXZO/s-l140.jpg",
                    "https://i.ebayimg.com/images/g/bGwAAeSwZ4FomXZN/s-l140.jpg"
                ],
                sourceUrl: "https://www.ebay.com/itm/336118796146",
                buyLink: "https://www.ebay.com/itm/336118796146",
                dateAdded: new Date().toISOString()
            },
            {
                id: 2,
                name: "Vintage Leather Jacket",
                price: 89.99,
                description: "Authentic vintage leather jacket with timeless appeal",
                category: "clothing",
                platform: "curated",
                image: "https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=400&h=400&fit=crop",
                images: ["https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=400&h=400&fit=crop"],
                sourceUrl: "",
                buyLink: "",
                dateAdded: new Date().toISOString()
            },
            {
                id: 3,
                name: "Antique Brass Compass",
                price: 45.50,
                description: "Beautiful antique brass compass with original patina",
                category: "collectibles",
                platform: "curated",
                image: "https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=400&h=400&fit=crop",
                images: ["https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=400&h=400&fit=crop"],
                sourceUrl: "",
                buyLink: "",
                dateAdded: new Date().toISOString()
            }
        ];
        
        return vintageProducts;
}

async function writeProducts(products) {
    try {
        await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
        await fs.writeFile(DATA_FILE, JSON.stringify(products, null, 2));
    } catch (error) {
        console.error('Error writing products:', error);
    }
}

export default async function handler(req, res) {
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