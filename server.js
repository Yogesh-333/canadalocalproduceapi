require('dotenv').config();

const express = require('express');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const cors = require('cors');
const { body, validationResult } = require('express-validator');

const app = express();
app.use(bodyParser.json());
app.use(cors());

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

const PORT = process.env.PORT || 3000;

// Helper function to validate price parameters
function validatePrice(price) {
  return !isNaN(price) && parseFloat(price) >= 0;
}

// Get all products with pagination, filtering, and sorting
app.get('/api/products', async (req, res, next) => {
  try {
    const { page = 1, limit = 10, category_id, min_price, max_price, sort_by = 'id', order = 'ASC' } = req.query;
    const offset = (page - 1) * limit;

    let query = 'SELECT * FROM products';
    const params = [];

    // Validate price parameters
    if (min_price && !validatePrice(min_price)) {
      return res.status(400).json({ error: 'Invalid min_price' });
    }
    if (max_price && !validatePrice(max_price)) {
      return res.status(400).json({ error: 'Invalid max_price' });
    }

    let conditions = [];
    if (category_id) {
      conditions.push('category_id = $1');
      params.push(category_id);
    }

    if (min_price) {
      conditions.push('price >= $' + (params.length + 1));
      params.push(min_price);
    }

    if (max_price) {
      conditions.push('price <= $' + (params.length + 1));
      params.push(max_price);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ` ORDER BY ${sort_by} ${order} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    // Log the constructed query and parameters for debugging
    console.log('Constructed Query:', query);
    console.log('Parameters:', params);

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    next(err); // Pass the error to the error-handling middleware
  }
});

// Get products by category
app.get('/api/products/category/:categoryId', async (req, res, next) => {
  try {
    const { categoryId } = req.params;
    const result = await pool.query(
      'SELECT * FROM products WHERE category_id = $1',
      [categoryId]
    );
    res.json(result.rows);
  } catch (err) {
    next(err); // Pass the error to the error-handling middleware
  }
});

// Search products with fuzzy search
app.get('/api/products/search', async (req, res, next) => {
  try {
    const { query } = req.query;
    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const searchQuery = `%${query}%`;
    const result = await pool.query(
      'SELECT * FROM products WHERE name ILIKE $1 OR description ILIKE $1',
      [searchQuery]
    );
    res.json(result.rows);
  } catch (err) {
    next(err); // Pass the error to the error-handling middleware
  }
});

// Add a new product with input validation
app.post(
  '/api/products',
  [
    body('name').notEmpty().withMessage('Name is required'),
    body('description').notEmpty().withMessage('Description is required'),
    body('price').isFloat({ gt: 0 }).withMessage('Price must be a positive number'),
    body('category_id').isInt({ gt: 0 }).withMessage('Category ID must be a positive integer'),
    body('image_url').isURL().withMessage('Image URL must be a valid URL'),
    body('affiliate_url').isURL().withMessage('Affiliate URL must be a valid URL'),
    body('address').optional().isString().withMessage('Address must be a string'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { name, description, price, category_id, image_url, affiliate_url, address } = req.body;
      const result = await pool.query(
        'INSERT INTO products (name, description, price, category_id, image_url, affiliate_url, address) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
        [name, description, price, category_id, image_url, affiliate_url, address]
      );
      res.json(result.rows[0]);
    } catch (err) {
      console.error('Error adding product:', err);
      res.status(500).json({ error: 'Server error', details: err.message });
    }
  }
);

// Update a product
app.put('/api/products/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, price, category_id, image_url, address } = req.body;
    const result = await pool.query(
      'UPDATE products SET name = $1, description = $2, price = $3, category_id = $4, image_url = $5, address = $6 WHERE id = $7 RETURNING *',
      [name, description, price, category_id, image_url, address, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    next(err); // Pass the error to the error-handling middleware
  }
});

// Delete a product
app.delete('/api/products/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM products WHERE id = $1', [id]);
    res.json({ message: 'Product deleted' });
  } catch (err) {
    next(err); // Pass the error to the error-handling middleware
  }
});

// Get all categories
app.get('/api/categories', async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM categories');
    res.json(result.rows);
  } catch (err) {
    next(err); // Pass the error to the error-handling middleware
  }
});

// Submit a product request
app.post(
  '/api/product-requests',
  [
    body('name').notEmpty().withMessage('Name is required'),
    body('description').notEmpty().withMessage('Description is required'),
    body('price').isFloat({ gt: 0 }).withMessage('Price must be a positive number'),
    body('category_id').isInt({ gt: 0 }).withMessage('Category ID must be a positive integer'),
    body('image_url').isURL().withMessage('Image URL must be a valid URL'),
    body('affiliate_url').isURL().withMessage('Affiliate URL must be a valid URL'),
    body('user_id').isInt({ gt: 0 }).withMessage('User ID must be a positive integer'),
    body('address').optional().isString().withMessage('Address must be a string'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { name, description, price, category_id, image_url, affiliate_url, user_id, address } = req.body;
      const result = await pool.query(
        'INSERT INTO product_requests (user_id, name, description, price, category_id, image_url, affiliate_url, address) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
        [user_id, name, description, price, category_id, image_url, affiliate_url, address]
      );
      res.json(result.rows[0]);
    } catch (err) {
      console.error('Error submitting product request:', err);
      res.status(500).json({ error: 'Server error', details: err.message });
    }
  }
);

// Admin endpoint to approve or reject a product request
app.put('/api/product-requests/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (status !== 'approved' && status !== 'rejected') {
      return res.status(400).json({ error: 'Invalid status. Status must be "approved" or "rejected".' });
    }

    const requestResult = await pool.query(
      'SELECT * FROM product_requests WHERE id = $1',
      [id]
    );

    if (requestResult.rows.length === 0) {
      return res.status(404).json({ error: 'Product request not found' });
    }

    if (status === 'approved') {
      const productRequest = requestResult.rows[0];
      await pool.query(
        'INSERT INTO products (name, description, price, category_id, image_url, affiliate_url, address) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [productRequest.name, productRequest.description, productRequest.price, productRequest.category_id, productRequest.image_url, productRequest.affiliate_url, productRequest.address]
      );
    }

    await pool.query(
      'UPDATE product_requests SET status = $1 WHERE id = $2',
      [status, id]
    );

    res.json({ message: `Product request ${status === 'approved' ? 'approved' : 'rejected'}` });
  } catch (err) {
    next(err); // Pass the error to the error-handling middleware
  }
});

// Get all product requests (for admin)
app.get('/api/product-requests', async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM product_requests');
    res.json(result.rows);
  } catch (err) {
    next(err); // Pass the error to the error-handling middleware
  }
});

// Error-handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', details: err.message });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});