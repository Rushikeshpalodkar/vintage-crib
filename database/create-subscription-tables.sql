-- Subscription system tables for Vintage Crib marketplace

-- User subscriptions table
CREATE TABLE IF NOT EXISTS user_subscriptions (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    tier VARCHAR(20) NOT NULL DEFAULT 'free',
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    upgraded_by_admin INTEGER REFERENCES users(id) NULL,
    
    CONSTRAINT valid_tier CHECK (tier IN ('free', 'starter', 'pro', 'premium')),
    CONSTRAINT valid_status CHECK (status IN ('active', 'cancelled', 'expired', 'suspended'))
);

-- Subscription change logs for admin tracking
CREATE TABLE IF NOT EXISTS subscription_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    old_tier VARCHAR(20),
    new_tier VARCHAR(20) NOT NULL,
    change_type VARCHAR(30) NOT NULL,
    admin_id INTEGER REFERENCES users(id) NULL,
    reason TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT valid_change_type CHECK (change_type IN (
        'admin_upgrade', 'admin_downgrade', 'auto_downgrade_expired', 
        'user_upgrade', 'user_downgrade', 'user_cancel', 'payment_failed'
    ))
);

-- Revenue tracking for admin dashboard
CREATE TABLE IF NOT EXISTS subscription_revenue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tier VARCHAR(20) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    payment_method VARCHAR(50) DEFAULT 'admin_granted',
    transaction_id VARCHAR(100) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Subscription features usage tracking
CREATE TABLE IF NOT EXISTS subscription_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    feature VARCHAR(50) NOT NULL,
    usage_count INTEGER DEFAULT 0,
    last_used TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    month_year VARCHAR(7) NOT NULL, -- Format: YYYY-MM
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(user_id, feature, month_year)
);

-- Subscription limits and notifications
CREATE TABLE IF NOT EXISTS subscription_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notification_type VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT valid_notification_type CHECK (notification_type IN (
        'limit_warning', 'limit_reached', 'subscription_expired', 
        'upgrade_recommendation', 'feature_unlocked'
    ))
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_tier ON user_subscriptions(tier);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status ON user_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_expires ON user_subscriptions(expires_at);
CREATE INDEX IF NOT EXISTS idx_subscription_logs_user ON subscription_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_logs_date ON subscription_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_subscription_revenue_user ON subscription_revenue(user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_revenue_date ON subscription_revenue(created_at);
CREATE INDEX IF NOT EXISTS idx_subscription_usage_user_month ON subscription_usage(user_id, month_year);
CREATE INDEX IF NOT EXISTS idx_subscription_notifications_user ON subscription_notifications(user_id, is_read);

-- Insert default free subscriptions for existing users
INSERT OR IGNORE INTO user_subscriptions (user_id, tier, status)
SELECT id, 'free', 'active' FROM users;

-- Sample data for testing
INSERT OR IGNORE INTO subscription_revenue (user_id, tier, amount) VALUES
(1, 'pro', 9.99),
(1, 'premium', 19.99);

INSERT OR IGNORE INTO subscription_logs (user_id, new_tier, change_type) VALUES
(1, 'free', 'admin_upgrade'),
(1, 'pro', 'admin_upgrade'),
(1, 'premium', 'admin_upgrade');