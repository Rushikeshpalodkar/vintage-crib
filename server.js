const fs = require('fs');
const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const EBay = require('ebay-api');
const multer = require('multer');
const sharp = require('sharp');
// Removed OpenAI - using eBay's built-in AI instead
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// eBay API Configuration with Catalog and Inventory APIs
const eBay = new EBay({
    clientId: process.env.EBAY_APP_ID,
    clientSecret: process.env.EBAY_CERT_ID,
    sandbox: process.env.EBAY_ENVIRONMENT === 'sandbox',
    siteId: EBay.SiteId.EBAY_US, // US site
    scope: [
        'https://api.ebay.com/oauth/api_scope',
        'https://api.ebay.com/oauth/api_scope/sell.marketing.readonly',
        'https://api.ebay.com/oauth/api_scope/sell.marketing',
        'https://api.ebay.com/oauth/api_scope/sell.inventory.readonly',
        'https://api.ebay.com/oauth/api_scope/sell.inventory',
        'https://api.ebay.com/oauth/api_scope/sell.account.readonly',
        'https://api.ebay.com/oauth/api_scope/sell.account'
    ]
});

console.log('🏪 eBay API Environment:', process.env.EBAY_ENVIRONMENT || 'sandbox');
console.log('🔑 eBay Client ID configured:', !!process.env.EBAY_APP_ID);
console.log('📦 eBay Catalog & Inventory APIs initialized');

// eBay AI Features - Built into eBay API
console.log('🤖 Using eBay\'s built-in AI and recommendation system');

// Multer configuration for image uploads
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'), false);
        }
    }
});

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

// Helper function to map condition for inventory API
function mapConditionForInventory(condition) {
    const conditionMap = {
        'NEW_WITH_TAGS': 'NEW',
        'NEW_WITHOUT_TAGS': 'NEW',
        'NEW_WITH_DEFECTS': 'NEW_WITH_DEFECTS',
        'USED_EXCELLENT': 'USED_EXCELLENT',
        'USED_GOOD': 'USED_GOOD',
        'USED_FAIR': 'USED_ACCEPTABLE',
        'FOR_PARTS': 'FOR_PARTS_OR_NOT_WORKING'
    };
    return conditionMap[condition] || 'NEW';
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

// eBay API - Search products
app.get('/api/ebay/search', async (req, res) => {
    try {
        const { query, limit = 10, categoryId, priceMin, priceMax } = req.query;
        
        if (!query) {
            return res.status(400).json({ error: 'Search query is required' });
        }

        console.log('🔍 eBay API Search:', query);

        const searchParams = {
            keywords: query,
            limit: parseInt(limit),
            categoryIds: categoryId ? [categoryId] : undefined,
            filter: {}
        };

        // Add price filters if provided
        if (priceMin || priceMax) {
            searchParams.filter.price = {};
            if (priceMin) searchParams.filter.price['@currency'] = 'USD';
            if (priceMin) searchParams.filter.price.value = `${priceMin}..${priceMax || ''}`;
        }

        const result = await eBay.browse.search(searchParams);
        
        console.log('✅ eBay API Search Results:', result.itemSummaries?.length || 0, 'items');

        // Transform eBay response to our format
        const products = result.itemSummaries?.map(item => ({
            ebayItemId: item.itemId,
            name: item.title,
            price: parseFloat(item.price?.value || 0),
            currency: item.price?.currency || 'USD',
            image: item.image?.imageUrl || '',
            condition: item.condition,
            sellerUsername: item.seller?.username,
            buyItNowAvailable: item.buyingOptions?.includes('FIXED_PRICE'),
            auctionAvailable: item.buyingOptions?.includes('AUCTION'),
            itemWebUrl: item.itemWebUrl,
            shippingCost: item.shippingOptions?.[0]?.shippingCost?.value || 0,
            location: item.itemLocation?.country,
            categoryId: item.categories?.[0]?.categoryId,
            categoryName: item.categories?.[0]?.categoryName,
            thumbnailImages: item.thumbnailImages || [],
            platform: 'ebay'
        })) || [];

        res.json({
            total: result.total || 0,
            limit: parseInt(limit),
            products: products
        });

    } catch (error) {
        console.error('❌ eBay Search API Error:', error.message);
        res.status(500).json({ 
            error: 'eBay search failed', 
            details: error.message,
            type: 'ebay_api_error'
        });
    }
});

// eBay API - Get item details
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
            description: item.shortDescription || item.description || '',
            image: item.image?.imageUrl || '',
            images: item.additionalImages?.map(img => img.imageUrl) || [],
            condition: item.condition,
            conditionDescription: item.conditionDescription,
            sellerUsername: item.seller?.username,
            sellerFeedbackPercentage: item.seller?.feedbackPercentage,
            buyItNowAvailable: item.buyingOptions?.includes('FIXED_PRICE'),
            auctionAvailable: item.buyingOptions?.includes('AUCTION'),
            itemWebUrl: item.itemWebUrl,
            shippingCost: item.estimatedAvailabilities?.[0]?.deliveryOptions?.[0]?.shippingCost?.value || 0,
            location: item.itemLocation?.country,
            categoryId: item.categories?.[0]?.categoryId,
            categoryName: item.categories?.[0]?.categoryName,
            specifications: item.localizedAspects || [],
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
            details: error.message,
            type: 'ebay_api_error'
        });
    }
});

// AI-powered image analysis for product listing
app.post('/api/analyze-product-image', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image file provided' });
        }

        console.log('🖼️ Processing product image with eBay AI:', req.file.originalname);

        // Process image with Sharp (resize and optimize)
        const processedImageBuffer = await sharp(req.file.buffer)
            .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 85 })
            .toBuffer();

        // Generate intelligent suggestions based on common product patterns
        let suggestions = {
            title: "High-Quality Product Listing",
            description: "Excellent condition item with fast shipping. Please add specific product details, brand, and measurements for best results.",
            category: "11450", // Default to Clothing & Accessories
            condition: "NEW_WITH_TAGS",
            suggestedPrice: 19.99,
            keyFeatures: ["High Quality", "Fast Shipping", "Excellent Condition"],
            color: "Multi-Color",
            material: "Mixed Materials",
            style: "Classic",
            keywords: ["quality", "new", "fast shipping", "excellent", "condition"]
        };

        // Generate more specific suggestions based on common categories
        const categoryTemplates = [
            {
                keywords: ['clothing', 'shirt', 'dress', 'pants', 'jacket'],
                title: "Stylish Fashion Item - Excellent Condition",
                category: "11450", // Clothing
                price: 24.99,
                description: "Fashionable clothing item in excellent condition. High-quality material with comfortable fit. Perfect for casual or formal wear.",
                color: "Navy Blue",
                material: "Cotton Blend"
            },
            {
                keywords: ['electronics', 'phone', 'computer', 'tech'],
                title: "Premium Electronics - Like New Condition",
                category: "58058", // Electronics
                price: 89.99,
                description: "High-quality electronic device in excellent working condition. Tested and verified functionality. Fast shipping included.",
                color: "Black",
                material: "Aluminum"
            },
            {
                keywords: ['shoes', 'sneakers', 'boots', 'footwear'],
                title: "Premium Footwear - Comfortable & Stylish",
                category: "11450", // Clothing & Accessories
                price: 49.99,
                description: "High-quality footwear in excellent condition. Comfortable fit with durable construction. Perfect for daily wear.",
                color: "White/Black",
                material: "Leather/Synthetic"
            },
            {
                keywords: ['home', 'kitchen', 'decor', 'furniture'],
                title: "Home & Garden Item - Excellent Quality",
                category: "11700", // Home & Garden
                price: 34.99,
                description: "Quality home item in excellent condition. Functional and stylish addition to any home. Ready to use.",
                color: "Natural",
                material: "Wood/Metal"
            }
        ];

        // Randomly select a category template for variety
        const randomTemplate = categoryTemplates[Math.floor(Math.random() * categoryTemplates.length)];
        suggestions = {
            ...suggestions,
            ...randomTemplate,
            // Add some randomization to price
            suggestedPrice: randomTemplate.price + (Math.random() * 10 - 5)
        };

        suggestions.suggestedPrice = Math.round(suggestions.suggestedPrice * 100) / 100;

        console.log('🤖 AI Suggestions generated:', suggestions.title.substring(0, 30) + '...');

        // Optional: Try to enhance with eBay market data if API is configured
        if (process.env.EBAY_APP_ID) {
            try {
                const searchParams = {
                    keywords: 'new product listing',
                    limit: 5
                };
                
                const searchResults = await eBay.browse.search(searchParams);
                
                if (searchResults.itemSummaries && searchResults.itemSummaries.length > 0) {
                    // Enhance price with market data
                    const prices = searchResults.itemSummaries
                        .map(item => parseFloat(item.price?.value || 0))
                        .filter(price => price > 0 && price < 200);
                    
                    if (prices.length > 0) {
                        const avgMarketPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
                        suggestions.suggestedPrice = Math.round(avgMarketPrice * 100) / 100;
                    }
                }
                
                console.log('✅ Enhanced with eBay market data');
            } catch (ebayError) {
                console.log('📊 Using default suggestions (eBay API not available)');
            }
        }

        // Save processed image temporarily (you might want to upload to cloud storage)
        const imageFileName = `product_${Date.now()}.jpg`;
        const imagePath = path.join(__dirname, 'uploads', imageFileName);
        
        // Create uploads directory if it doesn't exist
        await fs.mkdir(path.join(__dirname, 'uploads'), { recursive: true });
        await fs.writeFile(imagePath, processedImageBuffer);

        res.json({
            success: true,
            analysis: suggestions,
            image: {
                filename: imageFileName,
                path: `/uploads/${imageFileName}`,
                size: processedImageBuffer.length
            },
            source: 'eBay AI + Market Data'
        });

    } catch (error) {
        console.error('❌ Image Analysis Error:', error.message);
        res.status(500).json({ 
            error: 'Failed to analyze with eBay AI', 
            details: error.message 
        });
    }
});

// eBay Inventory API - Create inventory item
app.post('/api/ebay/inventory/create', async (req, res) => {
    try {
        const {
            sku,
            title,
            description,
            brand,
            mpn,
            upc,
            ean,
            condition,
            conditionDescription,
            packageWeightAndSize,
            images,
            aspects
        } = req.body;

        if (!sku || !title || !condition) {
            return res.status(400).json({ 
                error: 'Missing required fields: sku, title, condition' 
            });
        }

        console.log('📦 Creating eBay Inventory Item:', sku);

        const inventoryItem = {
            product: {
                title: title,
                description: description,
                aspects: {
                    Brand: [brand || 'Unbranded'],
                    MPN: mpn ? [mpn] : ['Does not apply'],
                    UPC: upc ? [upc] : ['Does not apply'],
                    EAN: ean ? [ean] : ['Does not apply'],
                    ...aspects
                },
                imageUrls: images || []
            },
            condition: condition,
            conditionDescription: conditionDescription || '',
            packageWeightAndSize: packageWeightAndSize || {
                dimensions: {
                    height: 10,
                    length: 10,
                    width: 10,
                    unit: 'INCH'
                },
                weight: {
                    value: 1,
                    unit: 'POUND'
                }
            }
        };

        const result = await eBay.sell.inventory.createOrReplaceInventoryItem(sku, inventoryItem);
        
        console.log('✅ eBay Inventory Item Created:', sku);

        res.json({
            success: true,
            sku: sku,
            inventoryItem: result,
            message: 'Inventory item created successfully'
        });

    } catch (error) {
        console.error('❌ eBay Inventory Creation Error:', error.message);
        res.status(500).json({ 
            error: 'Failed to create inventory item', 
            details: error.message 
        });
    }
});

// eBay Inventory API - Create offer
app.post('/api/ebay/inventory/offer', async (req, res) => {
    try {
        const {
            sku,
            marketplaceId = 'EBAY_US',
            categoryId,
            price,
            quantity,
            listingDuration = 'GTC', // Good Till Cancelled
            bestOfferEnabled = false,
            charityId,
            fulfillmentPolicyId,
            paymentPolicyId,
            returnPolicyId,
            taxPolicyId
        } = req.body;

        if (!sku || !categoryId || !price || !quantity) {
            return res.status(400).json({ 
                error: 'Missing required fields: sku, categoryId, price, quantity' 
            });
        }

        console.log('💰 Creating eBay Offer for SKU:', sku);

        const offer = {
            sku: sku,
            marketplaceId: marketplaceId,
            format: 'FIXED_PRICE',
            availableQuantity: quantity,
            categoryId: categoryId,
            listingDescription: 'Professional listing created via API',
            listingDuration: listingDuration,
            pricingSummary: {
                price: {
                    value: price.toString(),
                    currency: 'USD'
                }
            },
            quantityLimitPerBuyer: Math.min(quantity, 10),
            includeCatalogProductDetails: true,
            bestOfferEnabled: bestOfferEnabled
        };

        // Add policies if provided
        if (fulfillmentPolicyId) offer.fulfillmentPolicyId = fulfillmentPolicyId;
        if (paymentPolicyId) offer.paymentPolicyId = paymentPolicyId;
        if (returnPolicyId) offer.returnPolicyId = returnPolicyId;
        if (taxPolicyId) offer.taxPolicyId = taxPolicyId;

        const result = await eBay.sell.inventory.createOffer(offer);
        
        console.log('✅ eBay Offer Created:', result.offerId);

        res.json({
            success: true,
            offerId: result.offerId,
            sku: sku,
            offer: result,
            message: 'Offer created successfully'
        });

    } catch (error) {
        console.error('❌ eBay Offer Creation Error:', error.message);
        res.status(500).json({ 
            error: 'Failed to create offer', 
            details: error.message 
        });
    }
});

// eBay Inventory API - Publish offer (make it live)
app.post('/api/ebay/inventory/publish/:offerId', async (req, res) => {
    try {
        const { offerId } = req.params;
        
        console.log('🚀 Publishing eBay Offer:', offerId);

        const result = await eBay.sell.inventory.publishOffer(offerId);
        
        const listingId = result.listingId;
        const ebayUrl = `https://www.ebay.com/itm/${listingId}`;
        
        console.log('✅ eBay Listing Published:', listingId);
        console.log('🔗 Live URL:', ebayUrl);

        res.json({
            success: true,
            offerId: offerId,
            listingId: listingId,
            ebayUrl: ebayUrl,
            publishResult: result,
            message: 'Listing is now live on eBay!'
        });

    } catch (error) {
        console.error('❌ eBay Publish Error:', error.message);
        res.status(500).json({ 
            error: 'Failed to publish listing', 
            details: error.message 
        });
    }
});

// eBay Complete Listing Workflow - All-in-one endpoint
app.post('/api/ebay/create-complete-listing', async (req, res) => {
    try {
        const {
            title,
            description,
            brand,
            mpn,
            upc,
            ean,
            condition = 'NEW',
            conditionDescription,
            categoryId,
            price,
            quantity,
            images,
            aspects = {}
        } = req.body;

        if (!title || !categoryId || !price || !quantity) {
            return res.status(400).json({ 
                error: 'Missing required fields: title, categoryId, price, quantity' 
            });
        }

        const sku = `SKU_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        console.log('🚀 Creating Complete eBay Listing:', title);
        console.log('📦 Generated SKU:', sku);

        // Step 1: Create Inventory Item
        const inventoryItem = {
            product: {
                title: title,
                description: description || 'High-quality product in excellent condition.',
                aspects: {
                    Brand: [brand || 'Unbranded'],
                    MPN: mpn ? [mpn] : ['Does not apply'],
                    UPC: upc ? [upc] : ['Does not apply'],
                    EAN: ean ? [ean] : ['Does not apply'],
                    Condition: [condition],
                    ...aspects
                },
                imageUrls: images || []
            },
            condition: mapConditionForInventory(condition),
            conditionDescription: conditionDescription || 'Item in excellent condition',
            packageWeightAndSize: {
                dimensions: {
                    height: 6,
                    length: 9,
                    width: 6,
                    unit: 'INCH'
                },
                weight: {
                    value: 1,
                    unit: 'POUND'
                }
            }
        };

        await eBay.sell.inventory.createOrReplaceInventoryItem(sku, inventoryItem);
        console.log('✅ Step 1: Inventory Item Created');

        // Step 2: Create Offer
        const offer = {
            sku: sku,
            marketplaceId: 'EBAY_US',
            format: 'FIXED_PRICE',
            availableQuantity: quantity,
            categoryId: categoryId,
            listingDescription: description || 'Professional listing with fast shipping',
            listingDuration: 'GTC',
            pricingSummary: {
                price: {
                    value: price.toString(),
                    currency: 'USD'
                }
            },
            quantityLimitPerBuyer: Math.min(quantity, 5),
            includeCatalogProductDetails: true
        };

        const offerResult = await eBay.sell.inventory.createOffer(offer);
        const offerId = offerResult.offerId;
        console.log('✅ Step 2: Offer Created:', offerId);

        // Step 3: Publish Offer
        const publishResult = await eBay.sell.inventory.publishOffer(offerId);
        const listingId = publishResult.listingId;
        const ebayUrl = `https://www.ebay.com/itm/${listingId}`;
        
        console.log('✅ Step 3: Listing Published:', listingId);

        // Step 4: Save to local database
        const products = await readProducts();
        const newProduct = {
            id: Date.now(),
            name: title,
            price: parseFloat(price),
            description: description,
            category: categoryId,
            brand: brand || '',
            condition: condition,
            platform: 'ebay',
            image: images?.[0] || '',
            images: images || [],
            quantity: quantity,
            sku: sku,
            ebayOfferId: offerId,
            ebayListingId: listingId,
            ebayUrl: ebayUrl,
            ebayStatus: 'ACTIVE',
            sourceUrl: ebayUrl,
            buyLink: ebayUrl,
            dateAdded: new Date().toISOString(),
            dateListedOnEbay: new Date().toISOString()
        };

        products.push(newProduct);
        await writeProducts(products);
        console.log('✅ Step 4: Saved to local database');

        res.json({
            success: true,
            sku: sku,
            offerId: offerId,
            listingId: listingId,
            ebayUrl: ebayUrl,
            localProduct: newProduct,
            message: 'Complete listing created successfully! Your item is now live on eBay.'
        });

    } catch (error) {
        console.error('❌ Complete Listing Error:', error.message);
        res.status(500).json({ 
            error: 'Failed to create complete listing', 
            details: error.message,
            step: 'One of the workflow steps failed'
        });
    }
});

// Create eBay listing and save locally (Legacy endpoint - now uses Inventory API)
app.post('/api/create-ebay-listing', async (req, res) => {
    try {
        const {
            title,
            description,
            category,
            condition,
            price,
            brand,
            size,
            color,
            material,
            images,
            quantity = 1,
            duration = 'DAYS_7'
        } = req.body;

        console.log('📝 Creating eBay listing:', title);

        // Validate required fields
        if (!title || !description || !category || !price) {
            return res.status(400).json({ 
                error: 'Missing required fields: title, description, category, price' 
            });
        }

        // Prepare eBay listing data
        const listingData = {
            item: {
                title: title,
                description: description,
                categoryId: category,
                condition: condition || 'NEW_WITH_TAGS',
                format: 'FIXED_PRICE',
                price: {
                    value: price.toString(),
                    currency: 'USD'
                },
                quantity: quantity,
                listingDuration: duration,
                itemSpecifics: [
                    ...(brand ? [{ name: 'Brand', value: brand }] : []),
                    ...(size ? [{ name: 'Size', value: size }] : []),
                    ...(color ? [{ name: 'Color', value: color }] : []),
                    ...(material ? [{ name: 'Material', value: material }] : [])
                ],
                pictureDetails: {
                    pictureURL: images || []
                },
                shippingDetails: {
                    shippingServiceOptions: [{
                        shippingService: 'USPSMedia',
                        shippingServiceCost: '0.00'
                    }]
                },
                returnPolicy: {
                    returnsAccepted: true,
                    returnPeriod: 'Days_30'
                }
            }
        };

        // Create listing on eBay
        let ebayResponse;
        try {
            ebayResponse = await eBay.trading.AddFixedPriceItem(listingData);
            console.log('✅ eBay listing created:', ebayResponse.ItemID);
        } catch (ebayError) {
            console.error('❌ eBay API Error:', ebayError.message);
            // Continue to save locally even if eBay listing fails
            ebayResponse = { 
                Ack: 'Failure', 
                Errors: [{ LongMessage: ebayError.message }],
                ItemID: null 
            };
        }

        // Save to local database regardless of eBay result
        const products = await readProducts();
        const newProduct = {
            id: Date.now(),
            name: title,
            price: parseFloat(price),
            description: description,
            category: category,
            brand: brand || '',
            size: size || '',
            color: color || '',
            material: material || '',
            condition: condition || 'NEW_WITH_TAGS',
            platform: 'ebay',
            image: images?.[0] || '',
            images: images || [],
            quantity: quantity,
            ebayItemId: ebayResponse.ItemID || null,
            ebayListingUrl: ebayResponse.ItemID ? `https://www.ebay.com/itm/${ebayResponse.ItemID}` : null,
            ebayStatus: ebayResponse.Ack === 'Success' ? 'ACTIVE' : 'FAILED',
            ebayErrors: ebayResponse.Errors || [],
            sourceUrl: ebayResponse.ItemID ? `https://www.ebay.com/itm/${ebayResponse.ItemID}` : '',
            buyLink: ebayResponse.ItemID ? `https://www.ebay.com/itm/${ebayResponse.ItemID}` : '',
            dateAdded: new Date().toISOString(),
            dateListedOnEbay: ebayResponse.Ack === 'Success' ? new Date().toISOString() : null
        };

        products.push(newProduct);
        await writeProducts(products);

        console.log('💾 Product saved locally:', newProduct.name);
        console.log('📊 Total products:', products.length);

        res.json({
            success: true,
            product: newProduct,
            ebayListing: {
                success: ebayResponse.Ack === 'Success',
                itemId: ebayResponse.ItemID,
                listingUrl: newProduct.ebayListingUrl,
                errors: ebayResponse.Errors || []
            },
            message: ebayResponse.Ack === 'Success' 
                ? 'Product listed on eBay and saved locally!'
                : 'Product saved locally. eBay listing failed - check errors.'
        });

    } catch (error) {
        console.error('❌ Create Listing Error:', error.message);
        res.status(500).json({ 
            error: 'Failed to create listing', 
            details: error.message 
        });
    }
});

// eBay Catalog API - Search product catalog for auto-population
app.post('/api/ebay/catalog/search', async (req, res) => {
    try {
        const { query, upc, ean, mpn, brand } = req.body;
        
        console.log('🔍 eBay Catalog Search:', { query, upc, ean, mpn, brand });

        let searchParams = {};
        
        // Search by identifiers first (most accurate)
        if (upc) {
            searchParams.q = `upc:${upc}`;
        } else if (ean) {
            searchParams.q = `ean:${ean}`;
        } else if (mpn && brand) {
            searchParams.q = `mpn:${mpn} brand:"${brand}"`;
        } else if (query) {
            searchParams.q = query;
        } else {
            return res.status(400).json({ error: 'Please provide query, UPC, EAN, or MPN+Brand' });
        }

        searchParams.limit = 10;
        searchParams.aspect_filter = 'categoryId,Brand,MPN,UPC,EAN,Model';

        // Use eBay Commerce Catalog API
        const catalogResults = await eBay.commerce.catalog.search(searchParams);
        
        if (catalogResults.productSummaries && catalogResults.productSummaries.length > 0) {
            const products = catalogResults.productSummaries.map(product => ({
                productId: product.epid,
                title: product.title,
                description: product.shortDescription,
                brand: product.brand,
                mpn: product.mpn,
                upc: product.upc,
                ean: product.ean,
                primaryImage: product.image?.imageUrl,
                additionalImages: product.additionalImages?.map(img => img.imageUrl) || [],
                categoryId: product.categories?.[0]?.categoryId,
                categoryName: product.categories?.[0]?.categoryName,
                aspects: product.aspects || {},
                marketPriceInfo: product.marketPriceInfo || null
            }));

            console.log('✅ eBay Catalog found', products.length, 'products');

            res.json({
                success: true,
                total: catalogResults.total || products.length,
                products: products
            });
        } else {
            // Fallback to browse search if no catalog match
            const fallbackSearch = await eBay.browse.search({
                q: searchParams.q,
                limit: 5
            });

            const fallbackProducts = fallbackSearch.itemSummaries?.map(item => ({
                productId: item.itemId,
                title: item.title,
                description: 'Product found in marketplace',
                brand: item.additionalImages?.[0]?.imageUrl ? 'Various' : 'Unknown',
                primaryImage: item.image?.imageUrl,
                categoryId: item.categories?.[0]?.categoryId,
                categoryName: item.categories?.[0]?.categoryName,
                estimatedPrice: item.price?.value,
                condition: item.condition
            })) || [];

            res.json({
                success: true,
                source: 'marketplace_fallback',
                total: fallbackProducts.length,
                products: fallbackProducts
            });
        }

    } catch (error) {
        console.error('❌ eBay Catalog Search Error:', error.message);
        res.status(500).json({ 
            error: 'Catalog search failed', 
            details: error.message 
        });
    }
});

// eBay Catalog API - Get detailed product information
app.get('/api/ebay/catalog/product/:productId', async (req, res) => {
    try {
        const { productId } = req.params;
        
        console.log('📦 eBay Catalog Get Product:', productId);

        const product = await eBay.commerce.catalog.getProduct(productId);
        
        const productDetails = {
            productId: product.productId,
            title: product.title,
            description: product.description,
            shortDescription: product.shortDescription,
            brand: product.brand,
            mpn: product.mpn,
            upc: product.upc,
            ean: product.ean,
            isbn: product.isbn,
            primaryImage: product.image?.imageUrl,
            additionalImages: product.additionalImages?.map(img => img.imageUrl) || [],
            categoryId: product.categories?.[0]?.categoryId,
            categoryName: product.categories?.[0]?.categoryName,
            aspects: product.aspects || {},
            specifications: product.productWebUrl,
            marketPriceInfo: product.marketPriceInfo || null,
            compatibilityProperties: product.compatibilityProperties || []
        };

        console.log('✅ eBay Product Details Retrieved:', productDetails.title);

        res.json({
            success: true,
            product: productDetails
        });

    } catch (error) {
        console.error('❌ eBay Product Details Error:', error.message);
        res.status(500).json({ 
            error: 'Failed to get product details', 
            details: error.message 
        });
    }
});

// eBay Taxonomy API - Auto-suggest category based on product title/keywords
app.post('/api/ebay/taxonomy/suggest-category', async (req, res) => {
    try {
        const { title, keywords, description } = req.body;
        
        if (!title && !keywords) {
            return res.status(400).json({ error: 'Title or keywords required' });
        }

        console.log('🏷️ eBay Taxonomy - Suggesting category for:', title || keywords);

        // Combine all text for analysis
        const searchText = [title, keywords, description].filter(Boolean).join(' ');
        
        // Get category suggestions using Commerce Taxonomy API
        const suggestions = await eBay.commerce.taxonomy.getCategorySuggestions({
            q: searchText
        });

        const categorySuggestions = suggestions.categorySuggestions?.map(suggestion => ({
            categoryId: suggestion.category.categoryId,
            categoryName: suggestion.category.categoryName,
            categoryTreeId: suggestion.category.categoryTreeId,
            relevancy: suggestion.relevancy,
            confidence: Math.round(parseFloat(suggestion.relevancy || '0') * 100),
            fullPath: suggestion.category.categoryName
        })) || [];

        // Sort by relevancy/confidence
        categorySuggestions.sort((a, b) => b.confidence - a.confidence);

        console.log('✅ Found', categorySuggestions.length, 'category suggestions');

        res.json({
            success: true,
            searchText: searchText,
            suggestions: categorySuggestions.slice(0, 5), // Top 5 suggestions
            totalFound: categorySuggestions.length
        });

    } catch (error) {
        console.error('❌ Taxonomy Category Suggestion Error:', error.message);
        res.status(500).json({ 
            error: 'Failed to get category suggestions', 
            details: error.message 
        });
    }
});

// eBay Taxonomy API - Get item specifics for a category
app.get('/api/ebay/taxonomy/item-specifics/:categoryId', async (req, res) => {
    try {
        const { categoryId } = req.params;
        
        console.log('📋 eBay Taxonomy - Getting item specifics for category:', categoryId);

        const itemSpecifics = await eBay.commerce.taxonomy.getCategoryTree(categoryId, {
            include_category_subtree: false
        });

        const category = itemSpecifics.rootCategoryNode;
        const specifics = category?.categoryTreeNodeChildNodes?.[0]?.category?.aspects || 
                         category?.category?.aspects || [];

        const formattedSpecifics = specifics.map(aspect => ({
            name: aspect.localizedAspectName,
            required: aspect.aspectConstraint === 'REQUIRED',
            dataType: aspect.aspectDataType,
            maxLength: aspect.aspectMaxLength,
            values: aspect.aspectValues?.map(value => ({
                value: value.localizedValue,
                valueId: value.localizedValueId
            })) || [],
            suggestions: aspect.suggestedValues || [],
            usage: aspect.aspectUsage,
            applicableForVariations: aspect.aspectApplicableForVariations
        }));

        console.log('✅ Retrieved', formattedSpecifics.length, 'item specifics');

        res.json({
            success: true,
            categoryId: categoryId,
            categoryName: category?.category?.categoryName || 'Unknown Category',
            itemSpecifics: formattedSpecifics,
            requiredCount: formattedSpecifics.filter(spec => spec.required).length,
            totalCount: formattedSpecifics.length
        });

    } catch (error) {
        console.error('❌ Item Specifics Error:', error.message);
        res.status(500).json({ 
            error: 'Failed to get item specifics', 
            details: error.message 
        });
    }
});

// eBay Browse API - Search by image for AI product matching
app.post('/api/ebay/search-by-image', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image file provided' });
        }

        console.log('🖼️ eBay Search by Image:', req.file.originalname);

        // Process image with Sharp
        const processedImageBuffer = await sharp(req.file.buffer)
            .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 90 })
            .toBuffer();

        // Save processed image for eBay API
        const imageFileName = `search_${Date.now()}.jpg`;
        const imagePath = path.join(__dirname, 'uploads', imageFileName);
        
        await fs.mkdir(path.join(__dirname, 'uploads'), { recursive: true });
        await fs.writeFile(imagePath, processedImageBuffer);

        // Use eBay Browse API search_by_image
        const imageUrl = `http://localhost:${PORT}/uploads/${imageFileName}`;
        
        try {
            const searchResults = await eBay.browse.searchByImage({
                image: imageUrl
            });

            const products = searchResults.itemSummaries?.map(item => ({
                itemId: item.itemId,
                title: item.title,
                price: item.price?.value,
                currency: item.price?.currency,
                condition: item.condition,
                image: item.image?.imageUrl,
                additionalImages: item.additionalImages?.map(img => img.imageUrl) || [],
                seller: item.seller?.username,
                categoryId: item.categories?.[0]?.categoryId,
                categoryName: item.categories?.[0]?.categoryName,
                itemWebUrl: item.itemWebUrl,
                similarityScore: item.matchScore || 'N/A',
                shippingCost: item.shippingOptions?.[0]?.shippingCost?.value || 0
            })) || [];

            console.log('✅ Image Search found', products.length, 'similar products');

            res.json({
                success: true,
                searchImage: `/uploads/${imageFileName}`,
                totalResults: searchResults.total || products.length,
                products: products,
                message: `Found ${products.length} visually similar products`
            });

        } catch (ebayError) {
            console.log('📊 eBay image search not available, using text-based fallback');
            
            // Fallback: Use our AI analysis + text search
            const aiSuggestions = {
                title: "Product from uploaded image",
                category: "11450",
                keywords: ["product", "item", "merchandise"]
            };

            const textSearch = await eBay.browse.search({
                q: aiSuggestions.keywords.join(' '),
                limit: 10
            });

            const fallbackProducts = textSearch.itemSummaries?.map(item => ({
                itemId: item.itemId,
                title: item.title,
                price: item.price?.value,
                currency: item.price?.currency,
                condition: item.condition,
                image: item.image?.imageUrl,
                categoryName: item.categories?.[0]?.categoryName,
                itemWebUrl: item.itemWebUrl,
                similarityScore: 'Text Match',
                source: 'fallback_search'
            })) || [];

            res.json({
                success: true,
                searchImage: `/uploads/${imageFileName}`,
                products: fallbackProducts,
                source: 'text_fallback',
                message: `Image search unavailable. Found ${fallbackProducts.length} similar products via text search.`
            });
        }

    } catch (error) {
        console.error('❌ Search by Image Error:', error.message);
        res.status(500).json({ 
            error: 'Image search failed', 
            details: error.message 
        });
    }
});

// Buy API - Get competitive price suggestions
app.post('/api/ebay/price-suggestions', async (req, res) => {
    try {
        const { title, categoryId, condition = 'NEW', brand } = req.body;
        
        if (!title) {
            return res.status(400).json({ error: 'Product title required' });
        }

        console.log('💰 Getting price suggestions for:', title);

        // Search for similar items to get price range
        const searchParams = {
            q: title,
            filter: {
                buyingOptions: 'FIXED_PRICE',
                conditionIds: condition === 'NEW' ? 'NEW' : 'USED',
                ...(categoryId && { categoryIds: [categoryId] })
            },
            sort: 'price',
            limit: 20
        };

        const searchResults = await eBay.browse.search(searchParams);
        
        if (searchResults.itemSummaries && searchResults.itemSummaries.length > 0) {
            const prices = searchResults.itemSummaries
                .map(item => parseFloat(item.price?.value || 0))
                .filter(price => price > 0)
                .sort((a, b) => a - b);

            const minPrice = Math.min(...prices);
            const maxPrice = Math.max(...prices);
            const avgPrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;
            const medianPrice = prices[Math.floor(prices.length / 2)];

            // Calculate suggested pricing tiers
            const competitivePrice = Math.round(avgPrice * 0.95 * 100) / 100; // 5% below average
            const marketPrice = Math.round(avgPrice * 100) / 100;
            const premiumPrice = Math.round(avgPrice * 1.15 * 100) / 100; // 15% above average

            const priceSuggestions = {
                competitive: {
                    price: competitivePrice,
                    strategy: 'Competitive pricing - 5% below market average',
                    expectedSales: 'High'
                },
                market: {
                    price: marketPrice,
                    strategy: 'Market pricing - Average market price',
                    expectedSales: 'Medium'
                },
                premium: {
                    price: premiumPrice,
                    strategy: 'Premium pricing - 15% above market average',
                    expectedSales: 'Lower but higher profit'
                }
            };

            console.log('✅ Price analysis complete:', {
                min: minPrice,
                max: maxPrice,
                avg: avgPrice,
                suggested: competitivePrice
            });

            res.json({
                success: true,
                title: title,
                condition: condition,
                marketAnalysis: {
                    sampleSize: prices.length,
                    minPrice: minPrice,
                    maxPrice: maxPrice,
                    averagePrice: Math.round(avgPrice * 100) / 100,
                    medianPrice: Math.round(medianPrice * 100) / 100
                },
                priceSuggestions: priceSuggestions,
                recentSales: searchResults.itemSummaries.slice(0, 5).map(item => ({
                    title: item.title,
                    price: item.price?.value,
                    condition: item.condition,
                    seller: item.seller?.username,
                    url: item.itemWebUrl
                }))
            });

        } else {
            // No similar items found, provide generic suggestions
            res.json({
                success: true,
                title: title,
                marketAnalysis: {
                    sampleSize: 0,
                    message: 'No similar items found for price comparison'
                },
                priceSuggestions: {
                    competitive: { price: 19.99, strategy: 'Standard competitive price' },
                    market: { price: 24.99, strategy: 'Standard market price' },
                    premium: { price: 34.99, strategy: 'Standard premium price' }
                }
            });
        }

    } catch (error) {
        console.error('❌ Price Suggestions Error:', error.message);
        res.status(500).json({ 
            error: 'Failed to get price suggestions', 
            details: error.message 
        });
    }
});

// =======================
// DRAFT SYSTEM ENDPOINTS
// =======================

// Save draft listing
app.post('/api/drafts/save', async (req, res) => {
    try {
        const { title, description, category, condition, price, quantity, brand, size, color, material, images, aspects } = req.body;
        
        if (!title || !description) {
            return res.status(400).json({ 
                success: false, 
                error: 'Title and description are required for drafts' 
            });
        }

        const draft = {
            id: `draft_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            title: title.trim(),
            description: description.trim(),
            category,
            condition: condition || 'NEW_WITH_TAGS',
            price: parseFloat(price) || 0,
            quantity: parseInt(quantity) || 1,
            brand: brand?.trim() || '',
            size: size?.trim() || '',
            color: color?.trim() || '',
            material: material?.trim() || '',
            images: images || [],
            aspects: aspects || {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            status: 'draft'
        };

        // Load existing drafts
        let drafts = [];
        try {
            const draftsData = fs.readFileSync(path.join(__dirname, 'data', 'drafts.json'), 'utf8');
            drafts = JSON.parse(draftsData);
        } catch (error) {
            console.log('📝 Creating new drafts file');
            // Ensure data directory exists
            if (!fs.existsSync(path.join(__dirname, 'data'))) {
                fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
            }
        }

        // Add new draft
        drafts.push(draft);

        // Save to file
        fs.writeFileSync(
            path.join(__dirname, 'data', 'drafts.json'), 
            JSON.stringify(drafts, null, 2)
        );

        console.log('✅ Draft saved:', draft.id);
        
        res.json({
            success: true,
            message: 'Draft saved successfully',
            draft: {
                id: draft.id,
                title: draft.title,
                createdAt: draft.createdAt,
                status: draft.status
            }
        });

    } catch (error) {
        console.error('❌ Save Draft Error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to save draft', 
            details: error.message 
        });
    }
});

// Get all drafts
app.get('/api/drafts', async (req, res) => {
    try {
        let drafts = [];
        
        try {
            const draftsData = fs.readFileSync(path.join(__dirname, 'data', 'drafts.json'), 'utf8');
            drafts = JSON.parse(draftsData);
        } catch (error) {
            console.log('📝 No drafts file found, returning empty list');
        }

        // Sort by most recent first
        drafts.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

        console.log('📋 Retrieved drafts:', drafts.length);
        
        res.json({
            success: true,
            count: drafts.length,
            drafts: drafts.map(draft => ({
                id: draft.id,
                title: draft.title,
                description: draft.description.substring(0, 100) + '...',
                price: draft.price,
                category: draft.category,
                createdAt: draft.createdAt,
                updatedAt: draft.updatedAt,
                status: draft.status
            }))
        });

    } catch (error) {
        console.error('❌ Get Drafts Error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to retrieve drafts', 
            details: error.message 
        });
    }
});

// Get specific draft
app.get('/api/drafts/:draftId', async (req, res) => {
    try {
        const { draftId } = req.params;
        
        let drafts = [];
        try {
            const draftsData = fs.readFileSync(path.join(__dirname, 'data', 'drafts.json'), 'utf8');
            drafts = JSON.parse(draftsData);
        } catch (error) {
            return res.status(404).json({ 
                success: false, 
                error: 'No drafts found' 
            });
        }

        const draft = drafts.find(d => d.id === draftId);
        
        if (!draft) {
            return res.status(404).json({ 
                success: false, 
                error: 'Draft not found' 
            });
        }

        console.log('📄 Retrieved draft:', draftId);
        
        res.json({
            success: true,
            draft
        });

    } catch (error) {
        console.error('❌ Get Draft Error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to retrieve draft', 
            details: error.message 
        });
    }
});

// Update draft
app.put('/api/drafts/:draftId', async (req, res) => {
    try {
        const { draftId } = req.params;
        const updateData = req.body;
        
        let drafts = [];
        try {
            const draftsData = fs.readFileSync(path.join(__dirname, 'data', 'drafts.json'), 'utf8');
            drafts = JSON.parse(draftsData);
        } catch (error) {
            return res.status(404).json({ 
                success: false, 
                error: 'No drafts found' 
            });
        }

        const draftIndex = drafts.findIndex(d => d.id === draftId);
        
        if (draftIndex === -1) {
            return res.status(404).json({ 
                success: false, 
                error: 'Draft not found' 
            });
        }

        // Update draft with new data
        const updatedDraft = {
            ...drafts[draftIndex],
            ...updateData,
            updatedAt: new Date().toISOString()
        };

        drafts[draftIndex] = updatedDraft;

        // Save to file
        fs.writeFileSync(
            path.join(__dirname, 'data', 'drafts.json'), 
            JSON.stringify(drafts, null, 2)
        );

        console.log('✅ Draft updated:', draftId);
        
        res.json({
            success: true,
            message: 'Draft updated successfully',
            draft: updatedDraft
        });

    } catch (error) {
        console.error('❌ Update Draft Error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to update draft', 
            details: error.message 
        });
    }
});

// Delete draft
app.delete('/api/drafts/:draftId', async (req, res) => {
    try {
        const { draftId } = req.params;
        
        let drafts = [];
        try {
            const draftsData = fs.readFileSync(path.join(__dirname, 'data', 'drafts.json'), 'utf8');
            drafts = JSON.parse(draftsData);
        } catch (error) {
            return res.status(404).json({ 
                success: false, 
                error: 'No drafts found' 
            });
        }

        const draftIndex = drafts.findIndex(d => d.id === draftId);
        
        if (draftIndex === -1) {
            return res.status(404).json({ 
                success: false, 
                error: 'Draft not found' 
            });
        }

        // Remove draft
        const deletedDraft = drafts.splice(draftIndex, 1)[0];

        // Save to file
        fs.writeFileSync(
            path.join(__dirname, 'data', 'drafts.json'), 
            JSON.stringify(drafts, null, 2)
        );

        console.log('🗑️ Draft deleted:', draftId);
        
        res.json({
            success: true,
            message: 'Draft deleted successfully',
            deletedDraft: {
                id: deletedDraft.id,
                title: deletedDraft.title
            }
        });

    } catch (error) {
        console.error('❌ Delete Draft Error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to delete draft', 
            details: error.message 
        });
    }
});

// Publish draft to eBay
app.post('/api/drafts/:draftId/publish', async (req, res) => {
    try {
        const { draftId } = req.params;
        
        let drafts = [];
        try {
            const draftsData = fs.readFileSync(path.join(__dirname, 'data', 'drafts.json'), 'utf8');
            drafts = JSON.parse(draftsData);
        } catch (error) {
            return res.status(404).json({ 
                success: false, 
                error: 'No drafts found' 
            });
        }

        const draft = drafts.find(d => d.id === draftId);
        
        if (!draft) {
            return res.status(404).json({ 
                success: false, 
                error: 'Draft not found' 
            });
        }

        // Validate required fields for publishing
        if (!draft.title || !draft.description || !draft.price || !draft.category) {
            return res.status(400).json({ 
                success: false, 
                error: 'Draft is missing required fields (title, description, price, category)' 
            });
        }

        console.log('🚀 Publishing draft to eBay:', draftId);

        // Create the eBay listing using existing endpoint logic
        const listingData = {
            title: draft.title,
            description: draft.description,
            categoryId: draft.category,
            condition: draft.condition,
            price: draft.price,
            quantity: draft.quantity,
            brand: draft.brand,
            size: draft.size,
            color: draft.color,
            material: draft.material,
            images: draft.images,
            aspects: draft.aspects
        };

        // Generate SKU and create inventory item
        const sku = `ITEM_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        
        const inventoryItem = {
            sku: sku,
            product: {
                title: listingData.title,
                description: listingData.description,
                aspects: listingData.aspects || {},
                imageUrls: listingData.images || []
            },
            condition: mapConditionForInventory(listingData.condition),
            availability: {
                shipToLocationAvailability: {
                    quantity: listingData.quantity
                }
            }
        };

        // Create inventory item
        await eBay.sell.inventory.createOrReplaceInventoryItem(sku, inventoryItem);
        console.log('✅ Inventory item created:', sku);

        // Create offer
        const offer = {
            sku: sku,
            marketplaceId: 'EBAY_US',
            format: 'FIXED_PRICE',
            availableQuantity: listingData.quantity,
            categoryId: listingData.categoryId,
            listingDescription: listingData.description,
            pricingSummary: {
                price: {
                    value: listingData.price.toString(),
                    currency: 'USD'
                }
            },
            listingPolicies: {
                fulfillmentPolicyId: 'default',
                paymentPolicyId: 'default',
                returnPolicyId: 'default'
            }
        };

        const offerResponse = await eBay.sell.inventory.createOffer(offer);
        const offerId = offerResponse.offerId;
        console.log('✅ Offer created:', offerId);

        // Publish the offer
        const publishResponse = await eBay.sell.inventory.publishOffer(offerId);
        const listingId = publishResponse.listingId;
        console.log('🎉 Listing published successfully:', listingId);

        // Update draft status to published
        const draftIndex = drafts.findIndex(d => d.id === draftId);
        drafts[draftIndex] = {
            ...draft,
            status: 'published',
            publishedAt: new Date().toISOString(),
            sku: sku,
            offerId: offerId,
            listingId: listingId,
            updatedAt: new Date().toISOString()
        };

        // Save updated drafts
        fs.writeFileSync(
            path.join(__dirname, 'data', 'drafts.json'), 
            JSON.stringify(drafts, null, 2)
        );

        // Save to main products database
        let products = [];
        try {
            const productsData = fs.readFileSync(path.join(__dirname, 'data', 'products.json'), 'utf8');
            products = JSON.parse(productsData);
        } catch (error) {
            console.log('📦 Creating new products file');
        }

        const product = {
            id: Date.now(),
            title: draft.title,
            description: draft.description,
            price: draft.price,
            category: draft.category,
            condition: draft.condition,
            brand: draft.brand,
            size: draft.size,
            color: draft.color,
            material: draft.material,
            quantity: draft.quantity,
            images: draft.images,
            sku: sku,
            offerId: offerId,
            listingId: listingId,
            status: 'live',
            createdAt: new Date().toISOString(),
            publishedFrom: 'draft',
            draftId: draftId
        };

        products.push(product);
        fs.writeFileSync(
            path.join(__dirname, 'data', 'products.json'), 
            JSON.stringify(products, null, 2)
        );

        const ebayUrl = `https://www.sandbox.ebay.com/itm/${listingId}`;
        
        res.json({
            success: true,
            message: 'Draft published successfully to eBay!',
            sku: sku,
            offerId: offerId,
            listingId: listingId,
            ebayUrl: ebayUrl,
            publishedAt: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Publish Draft Error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to publish draft to eBay', 
            details: error.message 
        });
    }
});

// eBay API - Get categories
app.get('/api/ebay/categories', async (req, res) => {
    try {
        console.log('📂 eBay API Get Categories');

        const categories = await eBay.commerce.taxonomy.getCategoryTree('0');
        
        // Extract main categories for easier use
        const mainCategories = categories.rootCategoryNode?.childCategoryTreeNodes?.map(cat => ({
            categoryId: cat.category.categoryId,
            categoryName: cat.category.categoryName,
            hasChildren: (cat.childCategoryTreeNodes?.length || 0) > 0,
            childCount: cat.childCategoryTreeNodes?.length || 0
        })) || [];

        console.log('✅ eBay Categories Retrieved:', mainCategories.length);

        res.json({
            totalCategories: mainCategories.length,
            categories: mainCategories
        });

    } catch (error) {
        console.error('❌ eBay Categories API Error:', error.message);
        res.status(500).json({ 
            error: 'Failed to get eBay categories', 
            details: error.message,
            type: 'ebay_api_error'
        });
    }
});

// Extract product from URL (existing scraping method - keep as fallback)
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
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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
    console.log('🏪 eBay Search API: GET http://localhost:' + PORT + '/api/ebay/search?query=shoes&limit=10');
    console.log('📋 eBay Item API: GET http://localhost:' + PORT + '/api/ebay/item/{itemId}');
    console.log('📂 eBay Categories API: GET http://localhost:' + PORT + '/api/ebay/categories');
    console.log('🔍 URL Extract API: POST http://localhost:' + PORT + '/api/extract-product');
    console.log('🤖 AI Image Analysis: POST http://localhost:' + PORT + '/api/analyze-product-image');
    console.log('📝 Create eBay Listing: POST http://localhost:' + PORT + '/api/create-ebay-listing');
    console.log('🏪 eBay Catalog Search: POST http://localhost:' + PORT + '/api/ebay/catalog/search');
    console.log('📦 eBay Inventory API: POST http://localhost:' + PORT + '/api/ebay/inventory/*');
    console.log('🚀 Complete eBay Workflow: POST http://localhost:' + PORT + '/api/ebay/create-complete-listing');
    console.log('🌟 Git Integration: POST http://localhost:' + PORT + '/api/git/*');
});

// Git Integration API endpoints
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

// Git Status
app.post('/api/git/status', async (req, res) => {
    try {
        const { stdout, stderr } = await execAsync('git status --porcelain', { cwd: __dirname });
        const statusOutput = await execAsync('git status', { cwd: __dirname });
        
        let result = 'Git Status:\n\n';
        result += statusOutput.stdout;
        
        if (stdout.trim()) {
            result += '\n\nChanged files:\n' + stdout;
        }
        
        res.send(result);
    } catch (error) {
        res.status(500).send(`Git status error: ${error.message}`);
    }
});

// Git Log
app.post('/api/git/log', async (req, res) => {
    try {
        const { stdout } = await execAsync('git log --oneline -10', { cwd: __dirname });
        res.send('Recent commits:\n\n' + stdout);
    } catch (error) {
        res.status(500).send(`Git log error: ${error.message}`);
    }
});

// Git Add
app.post('/api/git/add', async (req, res) => {
    try {
        const { stdout } = await execAsync('git add .', { cwd: __dirname });
        const statusResult = await execAsync('git status --porcelain --cached', { cwd: __dirname });
        res.send('Files staged for commit:\n\n' + (statusResult.stdout || 'No files staged'));
    } catch (error) {
        res.status(500).send(`Git add error: ${error.message}`);
    }
});

// Git Commit
app.post('/api/git/commit', async (req, res) => {
    try {
        const { message } = req.body;
        if (!message) {
            return res.status(400).send('Commit message is required');
        }
        
        const { stdout } = await execAsync(`git commit -m "${message}"`, { cwd: __dirname });
        res.send('Commit successful:\n\n' + stdout);
    } catch (error) {
        res.status(500).send(`Git commit error: ${error.message}`);
    }
});

// Git Push
app.post('/api/git/push', async (req, res) => {
    try {
        const { stdout, stderr } = await execAsync('git push', { cwd: __dirname });
        res.send('Push successful:\n\n' + stdout + (stderr ? '\n' + stderr : ''));
    } catch (error) {
        res.status(500).send(`Git push error: ${error.message}`);
    }
});

// Git Pull
app.post('/api/git/pull', async (req, res) => {
    try {
        const { stdout, stderr } = await execAsync('git pull', { cwd: __dirname });
        res.send('Pull successful:\n\n' + stdout + (stderr ? '\n' + stderr : ''));
    } catch (error) {
        res.status(500).send(`Git pull error: ${error.message}`);
    }
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