const sharp = require('sharp');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

class ImageProcessor {
    constructor() {
        this.uploadsDir = path.join(__dirname, 'uploads');
        this.optimizedDir = path.join(__dirname, 'uploads', 'optimized');
        this.thumbnailsDir = path.join(__dirname, 'uploads', 'thumbnails');
        
        this.ensureDirectories();
    }

    async ensureDirectories() {
        try {
            await fs.mkdir(this.uploadsDir, { recursive: true });
            await fs.mkdir(this.optimizedDir, { recursive: true });
            await fs.mkdir(this.thumbnailsDir, { recursive: true });
        } catch (error) {
            console.error('Failed to create upload directories:', error.message);
        }
    }

    // Multer configuration for file uploads
    getMulterConfig() {
        const storage = multer.diskStorage({
            destination: (req, file, cb) => {
                cb(null, this.uploadsDir);
            },
            filename: (req, file, cb) => {
                const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
                const extension = path.extname(file.originalname);
                cb(null, `product_${uniqueSuffix}${extension}`);
            }
        });

        const fileFilter = (req, file, cb) => {
            // Accept only image files
            if (file.mimetype.startsWith('image/')) {
                cb(null, true);
            } else {
                cb(new Error('Only image files are allowed!'), false);
            }
        };

        return multer({
            storage,
            fileFilter,
            limits: {
                fileSize: 10 * 1024 * 1024, // 10MB max file size
                files: 5 // Max 5 files per upload
            }
        });
    }

    // Optimize image for web display
    async optimizeImage(inputPath, outputPath = null, options = {}) {
        try {
            if (!outputPath) {
                const parsed = path.parse(inputPath);
                outputPath = path.join(this.optimizedDir, `${parsed.name}_optimized${parsed.ext}`);
            }

            const defaultOptions = {
                width: 800,
                height: 600,
                quality: 85,
                format: 'jpeg'
            };

            const settings = { ...defaultOptions, ...options };

            const result = await sharp(inputPath)
                .resize(settings.width, settings.height, {
                    fit: 'inside',
                    withoutEnlargement: true
                })
                .jpeg({ quality: settings.quality })
                .toFile(outputPath);

            return {
                success: true,
                path: outputPath,
                originalSize: result.size,
                format: result.format,
                width: result.width,
                height: result.height
            };

        } catch (error) {
            console.error('Image optimization failed:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Create thumbnail
    async createThumbnail(inputPath, outputPath = null, size = 150) {
        try {
            if (!outputPath) {
                const parsed = path.parse(inputPath);
                outputPath = path.join(this.thumbnailsDir, `${parsed.name}_thumb.jpg`);
            }

            const result = await sharp(inputPath)
                .resize(size, size, {
                    fit: 'cover',
                    position: 'center'
                })
                .jpeg({ quality: 80 })
                .toFile(outputPath);

            return {
                success: true,
                path: outputPath,
                size: result.size
            };

        } catch (error) {
            console.error('Thumbnail creation failed:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Process uploaded image (optimize + thumbnail)
    async processUploadedImage(file) {
        try {
            const results = {
                original: file.path,
                optimized: null,
                thumbnail: null
            };

            // Create optimized version
            const optimized = await this.optimizeImage(file.path);
            if (optimized.success) {
                results.optimized = optimized.path;
            }

            // Create thumbnail
            const thumbnail = await this.createThumbnail(file.path);
            if (thumbnail.success) {
                results.thumbnail = thumbnail.path;
            }

            return {
                success: true,
                files: results,
                originalFile: file
            };

        } catch (error) {
            console.error('Image processing failed:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Get image info
    async getImageInfo(imagePath) {
        try {
            const metadata = await sharp(imagePath).metadata();
            const stats = await fs.stat(imagePath);

            return {
                width: metadata.width,
                height: metadata.height,
                format: metadata.format,
                size: stats.size,
                density: metadata.density,
                hasAlpha: metadata.hasAlpha,
                channels: metadata.channels
            };

        } catch (error) {
            console.error('Failed to get image info:', error.message);
            return null;
        }
    }

    // Convert image format
    async convertFormat(inputPath, outputFormat = 'webp', quality = 90) {
        try {
            const parsed = path.parse(inputPath);
            const outputPath = path.join(this.optimizedDir, `${parsed.name}.${outputFormat}`);

            let sharpInstance = sharp(inputPath);

            switch (outputFormat.toLowerCase()) {
                case 'webp':
                    sharpInstance = sharpInstance.webp({ quality });
                    break;
                case 'avif':
                    sharpInstance = sharpInstance.avif({ quality });
                    break;
                case 'png':
                    sharpInstance = sharpInstance.png({ quality });
                    break;
                default:
                    sharpInstance = sharpInstance.jpeg({ quality });
            }

            const result = await sharpInstance.toFile(outputPath);

            return {
                success: true,
                path: outputPath,
                originalSize: (await fs.stat(inputPath)).size,
                newSize: result.size,
                format: outputFormat
            };

        } catch (error) {
            console.error('Format conversion failed:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Clean up old files
    async cleanupOldFiles(days = 30) {
        try {
            const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
            const directories = [this.uploadsDir, this.optimizedDir, this.thumbnailsDir];

            let deletedCount = 0;

            for (const dir of directories) {
                const files = await fs.readdir(dir);
                
                for (const file of files) {
                    const filePath = path.join(dir, file);
                    const stats = await fs.stat(filePath);
                    
                    if (stats.mtime.getTime() < cutoffTime) {
                        await fs.unlink(filePath);
                        deletedCount++;
                    }
                }
            }

            console.log(`🧹 Cleaned up ${deletedCount} old image files`);
            return { deletedCount };

        } catch (error) {
            console.error('Cleanup failed:', error.message);
            return { error: error.message };
        }
    }
}

// Create singleton instance
const imageProcessor = new ImageProcessor();

module.exports = imageProcessor;