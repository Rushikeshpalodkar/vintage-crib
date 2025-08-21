# 🚀 Vintage Crib Website Deployment Guide

## 🌐 Publishing Your Website to vintagecrib.com

This guide will help you deploy your Vintage Crib website to the public internet with your custom domain.

## 📋 Prerequisites

- ✅ Domain name: `vintagecrib.com` (register at [Namecheap](https://namecheap.com), [GoDaddy](https://godaddy.com), or [Cloudflare](https://cloudflare.com))
- ✅ All project files ready for deployment
- ✅ eBay API credentials configured

## 🏗️ Recommended Hosting Platforms

### 1. 🎯 **Vercel** (Recommended - Easy & Fast)

**Perfect for:** Quick deployment with automatic SSL and CDN

```bash
# Install Vercel CLI
npm install -g vercel

# Login to Vercel
vercel login

# Deploy from project directory
vercel

# Add custom domain
vercel --prod --domains vintagecrib.com
```

**Vercel Setup:**
1. Visit [vercel.com](https://vercel.com)
2. Sign up with GitHub/Google
3. Import your project from Git or upload files
4. Set environment variables in Vercel dashboard:
   - `EBAY_APP_ID=your_app_id`
   - `EBAY_CERT_ID=your_cert_id`
   - `EBAY_DEV_ID=your_dev_id`
   - `EBAY_ENVIRONMENT=production` (when ready)
5. Add custom domain in Project Settings → Domains

---

### 2. 🌊 **Netlify** (Great for Frontend)

**Perfect for:** Static sites with serverless functions

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Login to Netlify
netlify login

# Deploy from project directory
netlify deploy

# Deploy to production
netlify deploy --prod
```

**Note:** For full-stack apps, you'll need Netlify Functions for the backend.

---

### 3. ☁️ **DigitalOcean** (Full Control)

**Perfect for:** Complete server control and scaling

**Setup Steps:**
1. Create DigitalOcean droplet (Ubuntu 22.04)
2. SSH into server and install Node.js:

```bash
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs nginx

# Clone/upload your project
git clone your-repo-url /var/www/vintage-crib
cd /var/www/vintage-crib

# Install dependencies
npm install --production

# Create environment file
sudo nano .env
# Add your eBay API credentials

# Install PM2 for process management
sudo npm install -g pm2

# Start application
pm2 start server.js --name "vintage-crib"
pm2 startup
pm2 save

# Configure Nginx
sudo nano /etc/nginx/sites-available/vintagecrib.com
```

**Nginx Configuration:**
```nginx
server {
    listen 80;
    server_name vintagecrib.com www.vintagecrib.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Enable site and restart Nginx
sudo ln -s /etc/nginx/sites-available/vintagecrib.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# Install SSL certificate
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d vintagecrib.com -d www.vintagecrib.com
```

---

### 4. 🚀 **Railway** (Simple Node.js Hosting)

**Perfect for:** One-click Node.js deployment

1. Visit [railway.app](https://railway.app)
2. Connect your GitHub repository
3. Add environment variables in Railway dashboard
4. Add custom domain in Project Settings

---

### 5. 🌍 **Render** (Free Tier Available)

**Perfect for:** Budget-friendly hosting with automatic deploys

1. Visit [render.com](https://render.com)
2. Create new Web Service from Git
3. Configure build & start commands:
   - Build: `npm install`
   - Start: `npm start`
4. Add environment variables
5. Add custom domain

---

## 🔧 Domain Configuration

### DNS Settings (Configure at your domain registrar)

```
Type    Name    Value                  TTL
A       @       YOUR_SERVER_IP         300
A       www     YOUR_SERVER_IP         300
CNAME   *       vintagecrib.com        300
```

**For Cloud Platforms (Vercel/Netlify):**
```
Type    Name    Value                    TTL
CNAME   @       your-app.vercel.app      300
CNAME   www     your-app.vercel.app      300
```

---

## 🔐 Environment Variables

Create `.env` file with production values:

```env
# Production eBay API
EBAY_APP_ID=your_production_app_id
EBAY_CERT_ID=your_production_cert_id
EBAY_DEV_ID=your_production_dev_id
EBAY_ENVIRONMENT=production

# Server Configuration
PORT=3001
NODE_ENV=production

# Optional: Analytics
GOOGLE_ANALYTICS_ID=GA4-XXXXXXXXXX
```

---

## 📦 Deployment Checklist

- [ ] **Domain purchased** and DNS configured
- [ ] **Hosting platform** selected and account created
- [ ] **Environment variables** configured for production
- [ ] **SSL certificate** installed (automatic with most platforms)
- [ ] **eBay API credentials** switched to production mode
- [ ] **Database** (products.json) backed up
- [ ] **Static files** optimized for production
- [ ] **Error monitoring** set up (optional)


---

## 🧪 Testing Your Live Website

After deployment, test these features:
- [ ] Homepage loads correctly
- [ ] Admin dashboard accessible
- [ ] Product import functionality
- [ ] Search and filtering work
- [ ] Mobile responsiveness
- [ ] 3D animations smooth
- [ ] SSL certificate active (https://)
- [ ] Custom domain redirects properly

---

## 📊 Monitoring & Maintenance

### Performance Monitoring
- Use [Google PageSpeed Insights](https://pagespeed.web.dev/)
- Monitor with [UptimeRobot](https://uptimerobot.com/) (free)
- Set up [Google Analytics](https://analytics.google.com/)

### Regular Updates
```bash
# Update dependencies monthly
npm update

# Backup product data
cp data/products.json data/products-backup-$(date +%Y%m%d).json

# Monitor server resources (DigitalOcean)
htop
df -h
```

---

## 🆘 Troubleshooting

### Common Issues

**1. Domain not working:**
- Check DNS propagation: [whatsmydns.net](https://whatsmydns.net/)
- Verify DNS records at registrar
- Wait 24-48 hours for full propagation

**2. SSL certificate errors:**
- Most platforms handle SSL automatically
- For custom servers, run: `sudo certbot renew`

**3. eBay API not working:**
- Verify production credentials
- Check API endpoints in eBay Developer Console
- Ensure rate limits not exceeded

**4. Images not loading:**
- Check CORS settings
- Verify image URLs are accessible
- Consider using CDN for better performance

**5. Slow loading:**
- Enable gzip compression
- Optimize images
- Use CDN (Cloudflare)
- Consider caching strategies

---

## 💰 Cost Estimates

| Platform | Monthly Cost | Features |
|----------|-------------|----------|
| **Vercel** | Free - $20 | Automatic SSL, CDN, Easy setup |
| **Netlify** | Free - $19 | Great for static sites |
| **Railway** | $5 - $20 | Simple Node.js hosting |
| **Render** | Free - $25 | Free tier available |
| **DigitalOcean** | $6 - $50+ | Full server control |

**Domain:** $10-15/year

---

## 🎉 Next Steps

1. **Choose your hosting platform** (Vercel recommended for beginners)
2. **Purchase your domain** at vintagecrib.com
3. **Follow the deployment guide** for your chosen platform
4. **Configure DNS** to point to your hosting
5. **Test everything** works correctly
6. **Set up monitoring** for uptime and performance
7. **Share your live website** with the world!

---

## 📞 Support

If you need help with deployment:
- Check hosting platform documentation
- Use platform support channels
- Community forums (Stack Overflow, Reddit)

**Your beautiful Vintage Crib website is ready to shine online! 🌟**