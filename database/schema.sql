-- Vintage Crib Database Schema
-- PostgreSQL Database Tables

-- Users table (base user system)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'user', -- 'user', 'seller', 'admin'
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Vintage sellers (multi-seller marketplace functionality)
CREATE TABLE IF NOT EXISTS vintage_sellers (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    store_name VARCHAR(255) NOT NULL,
    bio TEXT,
    instagram_handle VARCHAR(100),
    ebay_store_url VARCHAR(255),
    profile_image VARCHAR(255),
    subscription_tier VARCHAR(50) DEFAULT 'free', -- 'free', 'premium', 'pro'
    is_verified BOOLEAN DEFAULT FALSE,
    total_sales INTEGER DEFAULT 0,
    rating DECIMAL(3,2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Vintage items (products from multiple sellers)
CREATE TABLE IF NOT EXISTS vintage_items (
    id SERIAL PRIMARY KEY,
    seller_id INTEGER REFERENCES vintage_sellers(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    original_price DECIMAL(10,2), -- For sale/discount tracking
    category VARCHAR(100),
    brand VARCHAR(100),
    size VARCHAR(50),
    condition VARCHAR(50), -- 'new', 'like_new', 'good', 'fair', 'poor'
    tags TEXT[], -- PostgreSQL array for tags
    images TEXT[] NOT NULL DEFAULT '{}', -- Array of image URLs
    status VARCHAR(50) DEFAULT 'draft', -- 'draft', 'published', 'sold', 'archived'
    published_to TEXT[] DEFAULT '{}', -- ['ebay', 'poshmark', 'depop', 'vintage_crib']
    views INTEGER DEFAULT 0,
    likes INTEGER DEFAULT 0,
    is_featured BOOLEAN DEFAULT FALSE,
    sold_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Cross-platform posting tracking
CREATE TABLE IF NOT EXISTS cross_posts (
    id SERIAL PRIMARY KEY,
    item_id INTEGER REFERENCES vintage_items(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL, -- 'ebay', 'poshmark', 'depop', 'vintage_crib'
    external_id VARCHAR(255), -- ID from the external platform
    external_url VARCHAR(500), -- Direct link to the listing
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'success', 'failed', 'removed'
    error_message TEXT,
    posted_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- User favorites/likes
CREATE TABLE IF NOT EXISTS user_favorites (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    item_id INTEGER REFERENCES vintage_items(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, item_id)
);

-- Order/transaction tracking
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    buyer_id INTEGER REFERENCES users(id),
    seller_id INTEGER REFERENCES vintage_sellers(id),
    item_id INTEGER REFERENCES vintage_items(id),
    total_amount DECIMAL(10,2) NOT NULL,
    platform VARCHAR(50), -- Where the sale happened
    external_order_id VARCHAR(255), -- Platform's order ID
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'paid', 'shipped', 'delivered', 'cancelled'
    shipping_address TEXT,
    tracking_number VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Seller analytics
CREATE TABLE IF NOT EXISTS seller_analytics (
    id SERIAL PRIMARY KEY,
    seller_id INTEGER REFERENCES vintage_sellers(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    views INTEGER DEFAULT 0,
    likes INTEGER DEFAULT 0,
    sales INTEGER DEFAULT 0,
    revenue DECIMAL(10,2) DEFAULT 0.00,
    listings_posted INTEGER DEFAULT 0,
    UNIQUE(seller_id, date)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_vintage_items_seller_id ON vintage_items(seller_id);
CREATE INDEX IF NOT EXISTS idx_vintage_items_status ON vintage_items(status);
CREATE INDEX IF NOT EXISTS idx_vintage_items_category ON vintage_items(category);
CREATE INDEX IF NOT EXISTS idx_vintage_items_created_at ON vintage_items(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cross_posts_item_id ON cross_posts(item_id);
CREATE INDEX IF NOT EXISTS idx_cross_posts_platform ON cross_posts(platform);
CREATE INDEX IF NOT EXISTS idx_user_favorites_user_id ON user_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_buyer_id ON orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_orders_seller_id ON orders(seller_id);

-- Insert sample data for testing (optional)
INSERT INTO users (username, email, password_hash, role) VALUES 
    ('admin', 'admin@vintagecrib.com', '$2b$10$example', 'admin'),
    ('vintage_seller1', 'seller1@example.com', '$2b$10$example', 'seller')
ON CONFLICT (email) DO NOTHING;

INSERT INTO vintage_sellers (user_id, store_name, bio, subscription_tier) 
SELECT id, 'Vintage Crib Official', 'Curated vintage collection', 'pro'
FROM users WHERE username = 'admin'
ON CONFLICT DO NOTHING;