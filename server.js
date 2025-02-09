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
    ],
    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }
  
      try {
        const { name, description, price, category_id, image_url, affiliate_url } = req.body;
        const result = await pool.query(
          'INSERT INTO products (name, description, price, category_id, image_url, affiliate_url) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
          [name, description, price, category_id, image_url, affiliate_url]
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
    const { name, description, price, category_id, image_url } = req.body;
    const result = await pool.query(
      'UPDATE products SET name = $1, description = $2, price = $3, category_id = $4, image_url = $5 WHERE id = $6 RETURNING *',
      [name, description, price, category_id, image_url, id]
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

// Error-handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', details: err.message });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});