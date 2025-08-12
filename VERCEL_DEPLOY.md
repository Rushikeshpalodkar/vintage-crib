# 🚀 Vercel Deployment Guide for Vintage Crib

## Your Vercel Team Setup ✅
- **Team URL**: `vercel.com/vintagecrib`
- **Team ID**: `team_x8jARWoEaE0IbqOgH5N9INbs`
- **Project Name**: `vintage-crib`

---

## 🎯 Quick Deployment Steps

### Method 1: Vercel CLI (Recommended)

1. **Install Vercel CLI**
```bash
npm install -g vercel
```

2. **Login to your Vercel account**
```bash
vercel login
```

3. **Deploy from your project directory**
```bash
cd "C:\new project"
vercel
```

4. **Follow the prompts:**
   - Link to existing project? **No**
   - Project name: **vintage-crib**
   - Directory: **./** (current directory)
   - Override settings? **No**

5. **Deploy to production**
```bash
vercel --prod
```

### Method 2: Vercel Dashboard (GUI)

1. **Visit** [vercel.com/vintagecrib](https://vercel.com/vintagecrib)
2. **Click** "Add New Project"
3. **Import** from Git or upload your project folder
4. **Configure** project settings:
   - Project Name: `vintage-crib`
   - Framework Preset: `Other`
   - Build Command: `npm run build`
   - Output Directory: `./`
   - Install Command: `npm install`

---

## ⚙️ Environment Variables Setup

Add these environment variables in your Vercel dashboard:

1. **Go to** [vercel.com/vintagecrib/vintage-crib/settings/environment-variables](https://vercel.com/vintagecrib/vintage-crib/settings/environment-variables)

2. **Add each variable:**

| Name | Value | Environment |
|------|-------|-------------|
| `EBAY_APP_ID` | `your_ebay_app_id` | Production |
| `EBAY_CERT_ID` | `your_ebay_cert_id` | Production |
| `EBAY_DEV_ID` | `your_ebay_dev_id` | Production |
| `EBAY_ENVIRONMENT` | `production` | Production |
| `NODE_ENV` | `production` | Production |

**Important:** Use your actual eBay production credentials (not sandbox) when ready to go live.

---

## 🌐 Custom Domain Setup

### Add vintagecrib.com Domain

1. **Go to** [vercel.com/vintagecrib/vintage-crib/settings/domains](https://vercel.com/vintagecrib/vintage-crib/settings/domains)

2. **Add Domain**
   - Domain: `vintagecrib.com`
   - Click "Add"

3. **Add www subdomain**
   - Domain: `www.vintagecrib.com`
   - Redirect to: `vintagecrib.com`
   - Click "Add"

4. **Configure DNS at your domain registrar:**

```dns
# Add these DNS records at your domain registrar
Type    Name    Value                           TTL
A       @       76.76.19.61                    300
CNAME   www     vintage-crib.vercel.app        300
```

**Note:** Vercel will show you the exact DNS records to add after you add the domain.

---

## 🔧 Project Configuration

Your `vercel.json` is already configured with:
- ✅ Correct team scope (`vintagecrib`)
- ✅ Node.js serverless functions
- ✅ Proper routing for API and static files
- ✅ Environment variable mapping
- ✅ Function timeout settings

---

## 📋 Pre-Deployment Checklist

- [ ] **eBay API credentials** ready (production mode)
- [ ] **Domain purchased** (vintagecrib.com)
- [ ] **Vercel CLI** installed and logged in
- [ ] **Environment variables** prepared
- [ ] **Project files** ready in `C:\new project`
- [ ] **Test locally** with `npm start`

---

## 🚀 Deploy Commands

```bash
# Navigate to your project
cd "C:\new project"

# Login to Vercel (if not already)
vercel login

# Deploy to preview (staging)
vercel

# Deploy to production
vercel --prod

# Check deployment status
vercel ls

# View logs
vercel logs
```

---

## 🌍 Your Live URLs

After deployment, your website will be available at:

- **Production**: `https://vintagecrib.com` (custom domain)
- **Vercel URL**: `https://vintage-crib.vercel.app`
- **Team Dashboard**: `https://vercel.com/vintagecrib`

---

## 🔍 Testing Your Deployment

After going live, test these URLs:

- **Homepage**: `https://vintagecrib.com`
- **Store**: `https://vintagecrib.com/store-3d.html`
- **Admin**: `https://vintagecrib.com/admin-3d.html`
- **API Test**: `https://vintagecrib.com/api/test`
- **Products**: `https://vintagecrib.com/api/products`

---

## 🛠️ Troubleshooting

### Common Issues:

**1. Build Fails**
```bash
# Check build logs in Vercel dashboard
# Or run locally:
npm run build
npm start
```

**2. Environment Variables Not Working**
- Verify variables are set in Vercel dashboard
- Redeploy after adding variables: `vercel --prod`

**3. API Routes Not Working**
- Check `vercel.json` routing configuration
- Verify serverless function deployment

**4. Custom Domain Issues**
- Check DNS propagation: [whatsmydns.net](https://whatsmydns.net)
- Verify DNS records at your registrar
- SSL certificate auto-issues (may take up to 24 hours)

**5. eBay API Errors**
- Switch eBay environment from `sandbox` to `production`
- Verify production credentials are valid
- Check rate limits in eBay Developer Console

---

## 📊 Monitoring & Analytics

### Vercel Analytics (Built-in)
- **Speed Insights**: Performance monitoring
- **Web Analytics**: Visitor tracking
- **Function Logs**: Error monitoring

### Enable Analytics:
1. Go to [vercel.com/vintagecrib/vintage-crib/analytics](https://vercel.com/vintagecrib/vintage-crib/analytics)
2. Enable "Speed Insights"
3. Enable "Web Analytics"

---

## 🔄 Continuous Deployment

### Auto-Deploy from Git:
1. Connect your GitHub repository
2. Push changes to trigger automatic deployments
3. Preview deployments for pull requests

### Manual Deployments:
```bash
# Deploy specific branch
vercel --prod --branch main

# Deploy specific commit
vercel --prod --meta commit=abc123
```

---

## 🎉 Success! Your Vintage Crib is Live!

Once deployed, your beautiful 3D vintage marketplace will be live at:

### 🌐 **https://vintagecrib.com**

**Next steps:**
1. Test all functionality
2. Set up monitoring alerts
3. Share with your audience
4. Start curating amazing vintage pieces!

---

## 📞 Support

- **Vercel Support**: [vercel.com/support](https://vercel.com/support)
- **Documentation**: [vercel.com/docs](https://vercel.com/docs)
- **Community**: [github.com/vercel/vercel/discussions](https://github.com/vercel/vercel/discussions)

**Your vintage empire awaits! 🏺✨**