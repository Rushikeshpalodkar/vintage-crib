# 📧 Email Notifications Setup Guide

## 🎯 Overview
Your CI/CD pipeline is now configured to send email notifications for deployments. You need to configure GitHub Secrets to enable email sending.

## 🔐 Required GitHub Secrets

Go to your GitHub repository: **Settings → Secrets and variables → Actions → Repository secrets**

### 1. EMAIL_USERNAME
- **Description**: SMTP username (your email address)
- **Value**: Your Gmail address (e.g., `your-email@gmail.com`)

### 2. EMAIL_PASSWORD  
- **Description**: SMTP password (Gmail App Password)
- **Value**: Gmail App Password (NOT your regular password)
- **How to get Gmail App Password**:
  1. Go to [Google Account Settings](https://myaccount.google.com/)
  2. Security → 2-Step Verification → App Passwords
  3. Generate new app password for "Mail"
  4. Use that 16-character password

### 3. NOTIFICATION_EMAIL
- **Description**: Email address to receive deployment notifications
- **Value**: Your email address where you want to receive notifications

## 📧 What You'll Receive

### ✅ **Success Notifications**
```
Subject: ✅ Vintage Crib Deployment Successful - [commit-hash]

🚀 Deployment Successful!

Repository: Rushikeshpalodkar/vintage-crib
Branch: main
Commit: [commit-hash]
Commit Message: [your commit message]
Author: [your username]

🌐 Live Site: https://vintage-crib.onrender.com
📊 Admin Dashboard: https://vintage-crib.onrender.com/admin-advanced.html

✅ All tests passed
✅ Security checks completed  
✅ Build successful
✅ Deployment completed

Time: [timestamp]
```

### ❌ **Failure Notifications**
```
Subject: ❌ Vintage Crib Deployment Failed - [commit-hash]

❌ Deployment Failed!

Repository: Rushikeshpalodkar/vintage-crib
Branch: main
Commit: [commit-hash]
Commit Message: [your commit message]
Author: [your username]

🔍 Check the logs: https://github.com/Rushikeshpalodkar/vintage-crib/actions/runs/[run-id]

Time: [timestamp]
```

### 🧪 **Staging Notifications** (for develop branch)
```
Subject: 🧪 Vintage Crib Staging Deployed - [commit-hash]

🧪 Staging Environment Updated!

Repository: Rushikeshpalodkar/vintage-crib
Branch: develop
Commit: [commit-hash]
Author: [your username]

✅ Integration tests passed

Ready for production deployment.
```

## 🚀 How to Set Up Secrets

### Step 1: Generate Gmail App Password
1. **Enable 2-Factor Authentication** on your Gmail account
2. Go to **Google Account Settings** → **Security**
3. Click **2-Step Verification** → **App Passwords**
4. Select **Mail** and generate password
5. **Copy the 16-character password**

### Step 2: Add Secrets to GitHub
1. Go to your repository on GitHub
2. **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret** for each:

**EMAIL_USERNAME:**
```
your-email@gmail.com
```

**EMAIL_PASSWORD:**
```
[16-character app password from Gmail]
```

**NOTIFICATION_EMAIL:**
```
your-email@gmail.com
```

### Step 3: Test the Setup
1. Make any small change to your repository
2. Commit and push to main branch
3. Check GitHub Actions tab to see the workflow running
4. You should receive an email notification

## 🔧 Troubleshooting

### Not receiving emails?
1. **Check spam folder** - CI/CD emails often go to spam
2. **Verify app password** - Make sure you used the app password, not regular password
3. **Check GitHub Actions logs** - Look for email sending errors
4. **Gmail security** - Ensure 2FA is enabled

### Want to customize notifications?
Edit `.github/workflows/ci-cd.yml` and modify the email templates.

### Want different email provider?
Update the `server_address` and `server_port` in the workflow file:
- **Outlook/Hotmail**: `smtp-mail.outlook.com:587`
- **Yahoo**: `smtp.mail.yahoo.com:587`
- **Custom SMTP**: Use your provider's settings

## 📊 Current Pipeline Triggers

- **Production Deploy** → Email sent on push to `main` branch
- **Staging Deploy** → Email sent on push to `develop` branch  
- **Failure** → Email sent if any step fails

## 💡 Next Steps

1. Set up the three GitHub secrets
2. Make a test commit to trigger the pipeline
3. Check your email for the notification
4. Add your email to safe senders to avoid spam folder

**Your email notifications are now configured and ready to use!** 🎉