const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        maxLength: 500
    },
    price: {
        type: Number,
        required: true,
        min: 0
    },
    image: {
        type: String,
        required: true
    },
    description: {
        type: String,
        trim: true,
        maxLength: 2000
    },
    category: {
        type: String,
        trim: true,
        maxLength: 100
    },
    condition: {
        type: String,
        enum: ['New', 'Like New', 'Very Good', 'Good', 'Acceptable', 'Vintage', 'Used'],
        default: 'Used'
    },
    ebayItemId: {
        type: String,
        unique: true,
        sparse: true,
        index: true
    },
    ebayUrl: {
        type: String,
        trim: true
    },
    sold: {
        type: Boolean,
        default: false,
        index: true
    },
    featured: {
        type: Boolean,
        default: false,
        index: true
    },
    views: {
        type: Number,
        default: 0
    },
    clicks: {
        type: Number,
        default: 0
    },
    lastSynced: {
        type: Date,
        default: Date.now
    },
    tags: [{
        type: String,
        trim: true,
        maxLength: 50
    }],
    dimensions: {
        length: Number,
        width: Number,
        height: Number,
        weight: Number
    },
    vintage: {
        era: String,
        year: Number,
        authenticity: {
            type: String,
            enum: ['Authenticated', 'Likely Authentic', 'Unknown', 'Reproduction'],
            default: 'Unknown'
        }
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes for performance
productSchema.index({ name: 'text', description: 'text', category: 'text' });
productSchema.index({ price: 1 });
productSchema.index({ sold: 1, featured: -1, createdAt: -1 });
productSchema.index({ category: 1, sold: 1 });

// Virtual for formatted price
productSchema.virtual('formattedPrice').get(function() {
    return `$${this.price.toFixed(2)}`;
});

// Virtual for age
productSchema.virtual('age').get(function() {
    const now = new Date();
    const diffTime = Math.abs(now - this.createdAt);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
});

// Pre-save middleware
productSchema.pre('save', function(next) {
    if (this.isModified('name') || this.isModified('description')) {
        // Auto-generate tags from name and description
        const text = `${this.name} ${this.description || ''}`.toLowerCase();
        const autoTags = [];
        
        // Extract vintage-related keywords
        const vintageKeywords = ['vintage', 'antique', 'retro', 'classic', 'collectible', 'rare'];
        vintageKeywords.forEach(keyword => {
            if (text.includes(keyword) && !this.tags.includes(keyword)) {
                autoTags.push(keyword);
            }
        });
        
        this.tags = [...new Set([...this.tags, ...autoTags])];
    }
    next();
});

// Static methods
productSchema.statics.findAvailable = function() {
    return this.find({ sold: false }).sort({ featured: -1, createdAt: -1 });
};

productSchema.statics.findFeatured = function() {
    return this.find({ sold: false, featured: true }).sort({ createdAt: -1 });
};

productSchema.statics.findByCategory = function(category) {
    return this.find({ 
        category: new RegExp(category, 'i'), 
        sold: false 
    }).sort({ featured: -1, createdAt: -1 });
};

productSchema.statics.searchProducts = function(query) {
    return this.find({
        $text: { $search: query },
        sold: false
    }).sort({ score: { $meta: 'textScore' } });
};

// Instance methods
productSchema.methods.markAsSold = function() {
    this.sold = true;
    this.lastSynced = new Date();
    return this.save();
};

productSchema.methods.incrementViews = function() {
    this.views += 1;
    return this.save();
};

productSchema.methods.incrementClicks = function() {
    this.clicks += 1;
    return this.save();
};

module.exports = mongoose.model('Product', productSchema);