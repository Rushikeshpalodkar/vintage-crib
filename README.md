# 🏺 Vintage Crib

**A curated vintage products marketplace with stunning 3D design**

> *Discover extraordinary pieces with timeless character and authentic stories*

[![Website](https://img.shields.io/badge/Website-vintagecrib.com-ff6b6b)](https://vintagecrib.com)
[![Version](https://img.shields.io/badge/Version-1.0.0-4ecdc4)](https://github.com/vintagecrib/website)
[![License](https://img.shields.io/badge/License-MIT-ffe66d)](LICENSE)

---

## ✨ Features

### 🎨 **3D Design Experience**
- Stunning 3D animations and interactions
- Mouse-tracking 3D effects
- Glass morphism design patterns
- Fresh, shining color palette

### 🛍️ **Curated Marketplace**
- Vintage product collection
- eBay API integration
- Bulk import functionality
- Advanced search and filtering

### 🔧 **Admin Dashboard**
- Complete product management
- Real-time statistics
- Import/export tools
- Duplicate removal utilities

### 📱 **Responsive Design**
- Mobile-first approach
- Progressive enhancement
- Touch-friendly interactions
- Cross-browser compatibility

---

## 🚀 Quick Start

### Prerequisites
- Node.js 16+ 
- npm 8+
- eBay Developer Account

### Installation

```bash
# Clone the repository
git clone https://github.com/vintagecrib/website.git
cd vintage-crib

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your eBay API credentials

# Start the development server
npm run dev
```

Visit `http://localhost:3001` to see your store!

---

## 🌐 Deployment

Ready to go live? Check out our [Deployment Guide](DEPLOYMENT.md) for step-by-step instructions to publish your website to `vintagecrib.com`.

**Recommended hosting platforms:**
- ⚡ **Vercel** - One-click deployment with auto-SSL
- 🌊 **Netlify** - Great for static sites
- ☁️ **DigitalOcean** - Full server control
- 🚀 **Railway** - Simple Node.js hosting

---

## 📂 Project Structure

```
vintage-crib/
├── server.js              # Express server & API routes
├── package.json            # Dependencies & scripts
├── .env                   # Environment variables
├── data/
│   └── products.json      # Product database
├── frontend/
│   ├── index.html         # Landing page
│   ├── store-3d.html      # 3D store interface
│   ├── admin-3d.html      # 3D admin dashboard
│   └── ...                # Additional themes
├── uploads/               # Image uploads
└── DEPLOYMENT.md          # Deployment guide
```

---

## 🎯 Core Functionality

### Customer Store (`/store-3d.html`)
- 3D product grid with hover effects
- Real-time search and filtering
- Responsive design for all devices
- Direct links to eBay listings

### Admin Dashboard (`/admin-3d.html`)
- Import products from eBay stores
- Bulk URL processing
- Product management tools
- Analytics and statistics

### API Endpoints
- `GET /api/products` - Fetch all products
- `POST /api/products` - Add new product
- `PUT /api/products/:id` - Update product
- `DELETE /api/products/:id` - Delete product
- `POST /api/extract-product` - Extract from URL

---

## 🔧 Configuration

### Environment Variables

```env
# eBay API Configuration
EBAY_APP_ID=your_app_id
EBAY_CERT_ID=your_cert_id
EBAY_DEV_ID=your_dev_id
EBAY_ENVIRONMENT=sandbox

# Server Configuration  
PORT=3001
NODE_ENV=development
```

### eBay API Setup
1. Create developer account at [developer.ebay.com](https://developer.ebay.com)
2. Generate sandbox credentials
3. Add credentials to `.env` file
4. Switch to production when ready to go live

---

## 🎨 Customization

### Colors & Theming
The design uses CSS custom properties for easy theming:

```css
:root {
  --primary: #ff6b6b;      /* Coral Red */
  --secondary: #4ecdc4;    /* Mint Green */
  --accent: #ffe66d;       /* Bright Yellow */
  --purple: #a8e6cf;       /* Soft Mint Purple */
}
```

### 3D Effects
Customize the 3D animations by adjusting transform values and animation timings in the CSS.

---

## 🛠️ Development

### Available Scripts

```bash
npm start       # Production server
npm run dev     # Development with nodemon
npm run build   # Prepare for deployment
npm test        # Run tests (to be implemented)
```

### Adding New Features
1. Server-side: Add routes to `server.js`
2. Client-side: Modify HTML/CSS/JS in `frontend/`
3. Database: Products stored in `data/products.json`

---

## 📈 Analytics & Monitoring

### Built-in Analytics
- Page view tracking
- Product click tracking
- Visit statistics
- Performance monitoring

### External Integrations
- Google Analytics (add GA4 ID to env)
- Error monitoring with Sentry
- Uptime monitoring with UptimeRobot

---

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Workflow
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🆘 Support

- 📧 **Email**: support@vintagecrib.com
- 💬 **Discord**: [Join our community](https://discord.gg/vintagecrib)
- 📖 **Docs**: [Full documentation](https://docs.vintagecrib.com)
- 🐛 **Issues**: [Report bugs](https://github.com/vintagecrib/website/issues)

---

## 🙏 Acknowledgments

- eBay API for product data
- Font Awesome for icons
- Google Fonts for typography
- Vercel for hosting platform
- The vintage collecting community

---

## 🌟 Roadmap

### Coming Soon
- [ ] User authentication system
- [ ] Wishlist functionality
- [ ] Product reviews and ratings
- [ ] Mobile app development
- [ ] AI-powered product recommendations
- [ ] Multi-language support
- [ ] Advanced analytics dashboard

---

<div align="center">

**Made with ❤️ by the Vintage Crib team**

[Website](https://vintagecrib.com) • [Documentation](https://docs.vintagecrib.com) • [Community](https://discord.gg/vintagecrib)

</div>