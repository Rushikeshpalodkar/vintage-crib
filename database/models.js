const { query, transaction } = require('./connection');

// User model
class User {
    static async create(userData) {
        const { username, email, password_hash, role = 'user' } = userData;
        const result = await query(
            'INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING *',
            [username, email, password_hash, role]
        );
        return result.rows[0];
    }

    static async findById(id) {
        const result = await query('SELECT * FROM users WHERE id = $1', [id]);
        return result.rows[0];
    }

    static async findByEmail(email) {
        const result = await query('SELECT * FROM users WHERE email = $1', [email]);
        return result.rows[0];
    }

    static async findByUsername(username) {
        const result = await query('SELECT * FROM users WHERE username = $1', [username]);
        return result.rows[0];
    }
}

// Vintage Seller model
class VintageSeller {
    static async create(sellerData) {
        const { user_id, store_name, bio, instagram_handle, ebay_store_url, profile_image, subscription_tier = 'free' } = sellerData;
        const result = await query(
            `INSERT INTO vintage_sellers (user_id, store_name, bio, instagram_handle, ebay_store_url, profile_image, subscription_tier)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [user_id, store_name, bio, instagram_handle, ebay_store_url, profile_image, subscription_tier]
        );
        return result.rows[0];
    }

    static async findById(id) {
        const result = await query(
            `SELECT vs.*, u.username, u.email 
             FROM vintage_sellers vs 
             JOIN users u ON vs.user_id = u.id 
             WHERE vs.id = $1`,
            [id]
        );
        return result.rows[0];
    }

    static async findByUserId(user_id) {
        const result = await query('SELECT * FROM vintage_sellers WHERE user_id = $1', [user_id]);
        return result.rows[0];
    }

    static async getAll(limit = 50, offset = 0) {
        const result = await query(
            `SELECT vs.*, u.username 
             FROM vintage_sellers vs 
             JOIN users u ON vs.user_id = u.id 
             ORDER BY vs.created_at DESC 
             LIMIT $1 OFFSET $2`,
            [limit, offset]
        );
        return result.rows;
    }

    static async updateStats(seller_id, stats) {
        const { total_sales, rating } = stats;
        const result = await query(
            'UPDATE vintage_sellers SET total_sales = $1, rating = $2, updated_at = NOW() WHERE id = $3 RETURNING *',
            [total_sales, rating, seller_id]
        );
        return result.rows[0];
    }
}

// Vintage Item model
class VintageItem {
    static async create(itemData) {
        const {
            seller_id, title, description, price, original_price, category, brand, size, condition,
            tags = [], images = [], status = 'draft', published_to = []
        } = itemData;
        
        const result = await query(
            `INSERT INTO vintage_items 
             (seller_id, title, description, price, original_price, category, brand, size, condition, tags, images, status, published_to)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
            [seller_id, title, description, price, original_price, category, brand, size, condition, tags, images, status, published_to]
        );
        return result.rows[0];
    }

    static async findById(id) {
        const result = await query(
            `SELECT vi.*, vs.store_name, vs.profile_image as seller_image, u.username as seller_username
             FROM vintage_items vi
             JOIN vintage_sellers vs ON vi.seller_id = vs.id
             JOIN users u ON vs.user_id = u.id
             WHERE vi.id = $1`,
            [id]
        );
        return result.rows[0];
    }

    static async getBySeller(seller_id, limit = 50, offset = 0) {
        const result = await query(
            `SELECT * FROM vintage_items 
             WHERE seller_id = $1 
             ORDER BY created_at DESC 
             LIMIT $2 OFFSET $3`,
            [seller_id, limit, offset]
        );
        return result.rows;
    }

    static async getPublished(limit = 50, offset = 0, filters = {}) {
        let whereClause = "WHERE status = 'published'";
        let params = [limit, offset];
        let paramIndex = 3;

        if (filters.category) {
            whereClause += ` AND category = $${paramIndex}`;
            params.push(filters.category);
            paramIndex++;
        }

        if (filters.seller_id) {
            whereClause += ` AND seller_id = $${paramIndex}`;
            params.push(filters.seller_id);
            paramIndex++;
        }

        if (filters.search) {
            whereClause += ` AND (title ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`;
            params.push(`%${filters.search}%`);
            paramIndex++;
        }

        const result = await query(
            `SELECT vi.*, vs.store_name, vs.profile_image as seller_image, u.username as seller_username
             FROM vintage_items vi
             JOIN vintage_sellers vs ON vi.seller_id = vs.id
             JOIN users u ON vs.user_id = u.id
             ${whereClause}
             ORDER BY vi.created_at DESC
             LIMIT $1 OFFSET $2`,
            params
        );
        return result.rows;
    }

    static async update(id, updates) {
        const fields = Object.keys(updates);
        const values = Object.values(updates);
        const setClause = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');
        
        values.push(id);
        const result = await query(
            `UPDATE vintage_items SET ${setClause}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`,
            values
        );
        return result.rows[0];
    }

    static async delete(id) {
        const result = await query('DELETE FROM vintage_items WHERE id = $1 RETURNING *', [id]);
        return result.rows[0];
    }

    static async incrementViews(id) {
        await query('UPDATE vintage_items SET views = views + 1 WHERE id = $1', [id]);
    }

    static async toggleLike(item_id, user_id) {
        return await transaction(async (client) => {
            // Check if already liked
            const existing = await client.query(
                'SELECT id FROM user_favorites WHERE item_id = $1 AND user_id = $2',
                [item_id, user_id]
            );

            if (existing.rows.length > 0) {
                // Unlike
                await client.query(
                    'DELETE FROM user_favorites WHERE item_id = $1 AND user_id = $2',
                    [item_id, user_id]
                );
                await client.query(
                    'UPDATE vintage_items SET likes = likes - 1 WHERE id = $1',
                    [item_id]
                );
                return { liked: false };
            } else {
                // Like
                await client.query(
                    'INSERT INTO user_favorites (item_id, user_id) VALUES ($1, $2)',
                    [item_id, user_id]
                );
                await client.query(
                    'UPDATE vintage_items SET likes = likes + 1 WHERE id = $1',
                    [item_id]
                );
                return { liked: true };
            }
        });
    }
}

// Cross Post model
class CrossPost {
    static async create(postData) {
        const { item_id, platform, external_id, external_url, status = 'pending' } = postData;
        const result = await query(
            'INSERT INTO cross_posts (item_id, platform, external_id, external_url, status) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [item_id, platform, external_id, external_url, status]
        );
        return result.rows[0];
    }

    static async findByItem(item_id) {
        const result = await query('SELECT * FROM cross_posts WHERE item_id = $1', [item_id]);
        return result.rows;
    }

    static async updateStatus(id, status, error_message = null) {
        const result = await query(
            'UPDATE cross_posts SET status = $1, error_message = $2, updated_at = NOW() WHERE id = $3 RETURNING *',
            [status, error_message, id]
        );
        return result.rows[0];
    }
}

// Order model
class Order {
    static async create(orderData) {
        const { buyer_id, seller_id, item_id, total_amount, platform, external_order_id, shipping_address } = orderData;
        const result = await query(
            `INSERT INTO orders (buyer_id, seller_id, item_id, total_amount, platform, external_order_id, shipping_address)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [buyer_id, seller_id, item_id, total_amount, platform, external_order_id, shipping_address]
        );
        return result.rows[0];
    }

    static async findById(id) {
        const result = await query(
            `SELECT o.*, vi.title as item_title, vs.store_name, u1.username as buyer_username, u2.username as seller_username
             FROM orders o
             JOIN vintage_items vi ON o.item_id = vi.id
             JOIN vintage_sellers vs ON o.seller_id = vs.id
             JOIN users u1 ON o.buyer_id = u1.id
             JOIN users u2 ON vs.user_id = u2.id
             WHERE o.id = $1`,
            [id]
        );
        return result.rows[0];
    }

    static async getByUser(user_id, type = 'buyer', limit = 50, offset = 0) {
        const field = type === 'buyer' ? 'buyer_id' : 'seller_id';
        const result = await query(
            `SELECT o.*, vi.title as item_title, vi.images[1] as item_image, vs.store_name
             FROM orders o
             JOIN vintage_items vi ON o.item_id = vi.id
             JOIN vintage_sellers vs ON o.seller_id = vs.id
             WHERE o.${field} = $1
             ORDER BY o.created_at DESC
             LIMIT $2 OFFSET $3`,
            [user_id, limit, offset]
        );
        return result.rows;
    }
}

module.exports = {
    User,
    VintageSeller,
    VintageItem,
    CrossPost,
    Order
};