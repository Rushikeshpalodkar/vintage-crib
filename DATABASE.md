# 🗄️ Database Integration - Vintage Crib

This document explains how to set up and use the PostgreSQL database integration for the multi-seller marketplace functionality.

## 📋 Overview

The database layer adds:
- **Multi-seller marketplace** functionality
- **Cross-platform posting** (eBay, Poshmark, Depop)
- **User management** and authentication
- **Order tracking** and analytics
- **Advanced product management**

## 🚀 Quick Setup

### 1. Install PostgreSQL

```bash
# Windows (using Chocolatey)
choco install postgresql

# macOS (using Homebrew)
brew install postgresql

# Ubuntu/Debian
sudo apt update
sudo apt install postgresql postgresql-contrib
```

### 2. Create Database

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE vintage_crib;

# Create user (optional)
CREATE USER vintage_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE vintage_crib TO vintage_user;
```

### 3. Configure Environment

```bash
# Copy example configuration
cp .env.example .env

# Edit .env file with your database credentials
DB_HOST=localhost
DB_PORT=5432
DB_NAME=vintage_crib
DB_USER=postgres
DB_PASSWORD=your_password_here
```

### 4. Start Server

```bash
npm start
```

The server will automatically:
- Connect to PostgreSQL
- Create all required tables
- Initialize sample data
- Fall back to file-based storage if database is unavailable

## 📊 Database Schema

### Core Tables

1. **users** - User accounts (buyers, sellers, admins)
2. **vintage_sellers** - Seller profiles and store information
3. **vintage_items** - Products from multiple sellers
4. **cross_posts** - Track listings across platforms
5. **orders** - Transaction and order management
6. **user_favorites** - User likes/favorites
7. **seller_analytics** - Performance metrics

### Key Features

- **Multi-seller support**: Multiple sellers can list products
- **Cross-platform posting**: Sync to eBay, Poshmark, Depop
- **Advanced filtering**: Search, category, seller filtering
- **Analytics**: Views, likes, sales tracking
- **Order management**: Complete transaction lifecycle

## 🔌 API Endpoints

### Items API
- `GET /api/db/items` - Get all published items
- `GET /api/db/items/:id` - Get item details
- `POST /api/db/items` - Create new item
- `PUT /api/db/items/:id` - Update item
- `DELETE /api/db/items/:id` - Delete item
- `POST /api/db/items/:id/like` - Like/unlike item

### Sellers API
- `GET /api/db/sellers` - Get all sellers
- `GET /api/db/sellers/:id` - Get seller profile
- `POST /api/db/sellers` - Create seller profile

### Cross-Platform API
- `GET /api/db/items/:id/cross-posts` - Get cross-posts for item
- `POST /api/db/items/:id/cross-posts` - Create cross-post
- `PUT /api/db/cross-posts/:id` - Update cross-post status

### Migration & Analytics
- `POST /api/db/migrate/json-to-db` - Migrate existing JSON products
- `GET /api/db/stats` - Get marketplace statistics

## 🔄 Migration from JSON

To migrate your existing products to the database:

```bash
curl -X POST http://localhost:3001/api/db/migrate/json-to-db
```

This will:
- Read existing `data/products.json`
- Create default seller profile
- Convert all products to database format
- Maintain all existing data

## 📈 Usage Examples

### Creating a Seller Profile

```javascript
const sellerData = {
    user_id: 1,
    store_name: "Vintage Vibes Co",
    bio: "Curated 90s streetwear and accessories",
    instagram_handle: "@vintagevibes",
    ebay_store_url: "https://ebay.com/usr/vintagevibes",
    subscription_tier: "premium"
};

fetch('/api/db/sellers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sellerData)
});
```

### Adding a Product

```javascript
const itemData = {
    seller_id: 1,
    title: "Vintage Nike Windbreaker",
    description: "Rare 90s Nike windbreaker in excellent condition",
    price: 89.99,
    category: "clothing",
    brand: "Nike",
    size: "L",
    condition: "good",
    tags: ["vintage", "nike", "windbreaker", "90s"],
    images: ["image1.jpg", "image2.jpg"],
    status: "published"
};

fetch('/api/db/items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(itemData)
});
```

### Cross-Platform Posting

```javascript
// After posting to eBay
const crossPostData = {
    platform: "ebay",
    external_id: "334567890123",
    external_url: "https://ebay.com/itm/334567890123",
    status: "success"
};

fetch('/api/db/items/1/cross-posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(crossPostData)
});
```

## 🛡️ Backward Compatibility

The database integration is designed to work alongside your existing JSON-based system:

- **Graceful fallback**: If database is unavailable, uses file storage
- **Dual API support**: Both `/api/products` (existing) and `/api/db/items` (new)
- **Migration tools**: Easy conversion from JSON to database
- **No breaking changes**: Existing functionality continues to work

## 🔧 Troubleshooting

### Database Connection Issues

```bash
# Check if PostgreSQL is running
pg_isready -U postgres

# Check connection
psql -U postgres -h localhost -p 5432
```

### Schema Issues

```bash
# Reset database (CAUTION: This will delete all data)
psql -U postgres -c "DROP DATABASE vintage_crib; CREATE DATABASE vintage_crib;"
```

### Performance Optimization

The schema includes indexes for optimal performance:
- Items by seller, status, category, date
- Cross-posts by item and platform
- User favorites by user
- Orders by buyer and seller

## 🚀 Next Steps

1. **Set up PostgreSQL** locally or use cloud provider
2. **Configure environment** variables
3. **Run migration** to import existing products
4. **Test API endpoints** with Postman or curl
5. **Build frontend** for multi-seller functionality
6. **Integrate cross-platform** posting features

The database layer provides a solid foundation for scaling your vintage marketplace into a full multi-seller platform! 🎯