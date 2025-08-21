#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔨 Starting build process...');

// Ensure public directory exists
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
    console.log('📁 Creating public directory...');
    fs.mkdirSync(publicDir, { recursive: true });
}

// Copy files recursively
function copyRecursive(src, dest) {
    try {
        const stat = fs.statSync(src);
        if (stat.isDirectory()) {
            if (!fs.existsSync(dest)) {
                fs.mkdirSync(dest, { recursive: true });
            }
            const files = fs.readdirSync(src);
            for (const file of files) {
                copyRecursive(path.join(src, file), path.join(dest, file));
            }
        } else {
            fs.copyFileSync(src, dest);
        }
    } catch (error) {
        console.error(`❌ Error copying ${src} to ${dest}:`, error.message);
        process.exit(1);
    }
}

try {
    // Copy frontend directory to public
    const frontendDir = path.join(__dirname, 'frontend');
    if (fs.existsSync(frontendDir)) {
        console.log('📋 Copying frontend files to public...');
        copyRecursive(frontendDir, publicDir);
    } else {
        console.error('❌ Frontend directory not found!');
        process.exit(1);
    }

    // Copy index.html to public
    const indexPath = path.join(__dirname, 'index.html');
    if (fs.existsSync(indexPath)) {
        console.log('📄 Copying index.html...');
        fs.copyFileSync(indexPath, path.join(publicDir, 'index.html'));
    } else {
        console.warn('⚠️ index.html not found, skipping...');
    }

    // Verify build output
    const publicFiles = fs.readdirSync(publicDir);
    console.log(`✅ Build complete! Generated ${publicFiles.length} files in public/`);
    console.log('📦 Files:', publicFiles.slice(0, 5).join(', '), publicFiles.length > 5 ? '...' : '');

} catch (error) {
    console.error('❌ Build failed:', error.message);
    process.exit(1);
}