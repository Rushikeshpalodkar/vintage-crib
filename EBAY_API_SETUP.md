# eBay API Integration Setup Guide

## Overview
Your project now has full eBay API integration with three new endpoints for searching products, getting item details, and browsing categories.

## 🔑 Step 1: Get eBay API Credentials

### 1. Create eBay Developer Account
- Go to: https://developer.ebay.com/
- Sign up or log in with your eBay account
- Complete the developer registration

### 2. Create an Application
1. Navigate to "My Account" → "Application Keys"
2. Click "Create Application" 
3. Fill in your application details:
   - **Application Title**: "My Store Product Importer"
   - **Application Type**: "Personal Use" or "Commercial Use"
   - **Platform**: "Web"

### 3. Get Your Keys
After creating the app, you'll receive:
- **App ID (Client ID)**: Your application identifier
- **Cert ID (Client Secret)**: Your application secret key
- **Dev ID**: Your developer ID
- **User Token**: For accessing user-specific data (optional)

## 🛠️ Step 2: Configure Environment Variables

### 1. Copy the example file:
```bash
copy .env.example .env
```

### 2. Edit `.env` file with your credentials:
```env
# Production Environment
EBAY_APP_ID=YourAppId-12345678-abcd-efgh-ijkl-123456789012
EBAY_CERT_ID=PRD-1234567890abcdef-12345678-90ab-12cd-ef12-3456
EBAY_DEV_ID=12345678-abcd-efgh-ijkl-123456789012
EBAY_USER_TOKEN=v^1.1#i^1#p^3#I^3#f^0#r^1#t^Hl4BMw== (optional)

# Environment (start with sandbox for testing)
EBAY_ENVIRONMENT=sandbox

# Server
PORT=3001
NODE_ENV=development
```

### 3. For testing, use Sandbox credentials first:
```env
EBAY_ENVIRONMENT=sandbox
EBAY_APP_ID=YourSandboxAppId-12345678-abcd-efgh-ijkl-123456789012
EBAY_CERT_ID=SBX-1234567890abcdef-12345678-90ab-12cd-ef12-3456
```

## 🚀 Step 3: Test the Integration

### 1. Start your server:
```bash
npm start
```

### 2. Test the new eBay API endpoints:

#### Search Products:
```bash
curl "http://localhost:3001/api/ebay/search?query=wireless+headphones&limit=5"
```

#### Get Item Details:
```bash
curl "http://localhost:3001/api/ebay/item/123456789012"
```

#### Get Categories:
```bash
curl "http://localhost:3001/api/ebay/categories"
```

## 📡 New API Endpoints

### 1. **Product Search** 
`GET /api/ebay/search`

**Parameters:**
- `query` (required): Search term (e.g., "wireless headphones")
- `limit` (optional): Number of results (default: 10, max: 100)
- `categoryId` (optional): eBay category ID to filter by
- `priceMin` (optional): Minimum price filter
- `priceMax` (optional): Maximum price filter

**Example:**
```
GET /api/ebay/search?query=nike+shoes&limit=20&categoryId=15709&priceMin=50&priceMax=200
```

**Response:**
```json
{
  "total": 1245,
  "limit": 20,
  "products": [
    {
      "ebayItemId": "123456789012",
      "name": "Nike Air Max 270",
      "price": 129.99,
      "currency": "USD",
      "image": "https://i.ebayimg.com/images/...",
      "condition": "New",
      "sellerUsername": "sneaker_store",
      "buyItNowAvailable": true,
      "itemWebUrl": "https://www.ebay.com/itm/123456789012",
      "categoryName": "Athletic Shoes",
      "platform": "ebay"
    }
  ]
}
```

### 2. **Item Details**
`GET /api/ebay/item/:itemId`

**Example:**
```
GET /api/ebay/item/123456789012
```

**Response:**
```json
{
  "ebayItemId": "123456789012",
  "name": "Nike Air Max 270 Black/White",
  "price": 129.99,
  "description": "Comfortable running shoes with Air Max technology...",
  "image": "https://i.ebayimg.com/images/main.jpg",
  "images": ["https://i.ebayimg.com/images/1.jpg", "..."],
  "condition": "New with box",
  "sellerFeedbackPercentage": 99.2,
  "specifications": [
    {"name": "Brand", "value": "Nike"},
    {"name": "Size", "value": "10.5"}
  ],
  "sourceUrl": "https://www.ebay.com/itm/123456789012",
  "platform": "ebay"
}
```

### 3. **Categories**
`GET /api/ebay/categories`

**Response:**
```json
{
  "totalCategories": 35,
  "categories": [
    {
      "categoryId": "550",
      "categoryName": "Art",
      "hasChildren": true,
      "childCount": 15
    },
    {
      "categoryId": "2984",
      "categoryName": "Baby",
      "hasChildren": true,
      "childCount": 12
    }
  ]
}
```

## 🔧 Integration with Your Frontend

### Update your eBay Helper page:
Add these JavaScript functions to call the new API endpoints:

```javascript
// Search eBay products
async function searchEbayProducts(query, limit = 10) {
    const response = await fetch(`/api/ebay/search?query=${encodeURIComponent(query)}&limit=${limit}`);
    return response.json();
}

// Get detailed item information
async function getEbayItem(itemId) {
    const response = await fetch(`/api/ebay/item/${itemId}`);
    return response.json();
}

// Load eBay categories
async function loadEbayCategories() {
    const response = await fetch('/api/ebay/categories');
    return response.json();
}
```

## 🚦 Rate Limits & Best Practices

### eBay API Limits:
- **Sandbox**: 10,000 calls per day
- **Production**: Varies by endpoint (typically 5,000-25,000/day)
- **Rate limiting**: ~10 requests per second

### Best Practices:
1. **Cache results** when possible
2. **Handle errors gracefully** (network issues, rate limits)
3. **Use sandbox** for development and testing
4. **Implement retry logic** for failed requests
5. **Monitor your usage** via eBay Developer Console

## 🔒 Security Notes

1. **Never commit `.env`** to version control
2. **Keep credentials secure** - don't share in logs
3. **Use HTTPS** in production
4. **Rotate keys** periodically
5. **Monitor API usage** for unusual activity

## 🐛 Troubleshooting

### Common Issues:

1. **"Authentication failed"**
   - Check your App ID and Cert ID
   - Verify environment setting (sandbox vs production)
   - Ensure credentials are properly set in .env

2. **"Rate limit exceeded"**
   - Reduce request frequency
   - Implement caching
   - Consider upgrading your eBay developer account

3. **"Item not found"**
   - Verify the item ID is correct
   - Check if item is still active on eBay
   - Ensure you're using the right environment

### Debug Mode:
Set `NODE_ENV=development` to see detailed API logs in the console.

## 🔄 Fallback Strategy

Your server still includes the original web scraping method as a fallback:
- API method fails → Falls back to scraping
- Rate limit exceeded → Use cached data or scraping
- Item not accessible via API → Extract via URL scraping

## 📈 Next Steps

1. **Test with sandbox** credentials first
2. **Create frontend UI** for search and browsing
3. **Implement caching** for frequently accessed data
4. **Add more filters** (location, condition, etc.)
5. **Move to production** when ready

---

Need help? Check the [eBay Developer Documentation](https://developer.ebay.com/api-docs/buy/browse/overview.html) or raise an issue!