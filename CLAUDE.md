# Claude Instructions

This project appears to be a Node.js web application with an e-commerce store frontend and backend server.

## Project Structure
- `server.js` - Main backend server
- `frontend/` - HTML frontend files for store, admin, and eBay helper
- `data/products.json` - Product data storage
- `package.json` - Node.js dependencies and scripts

## Common Commands
- `npm start` - Start the server
- `npm test` - Run tests (if configured)
- `npm run lint` - Run linting (if configured)

## Development Notes
- Check package.json for available npm scripts
- Server runs on port 3001 (configurable via PORT env var)
- Frontend files are static HTML served by Express
- eBay API integration requires credentials in .env file

## API Endpoints

### Product Management
- `GET /api/products` - Retrieve all products
- `POST /api/products` - Add new product
- `DELETE /api/products/:id` - Remove product

### eBay API Integration (NEW)
- `GET /api/ebay/search?query=shoes&limit=10` - Search eBay products
- `GET /api/ebay/item/:itemId` - Get detailed item information
- `GET /api/ebay/categories` - Get eBay categories

### Utilities
- `POST /api/extract-product` - Extract from eBay URL (fallback scraping)
- `GET /api/analytics` - View site analytics
- `GET /api/test` - API health check

## Instructions for Claude
When working on this project:
1. Always check package.json for available scripts before running commands
2. Review server.js to understand the backend architecture
3. Check if there are any build or development commands configured
4. Be careful with file modifications - always read files first to understand the current structure