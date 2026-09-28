require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/item-types', require('./routes/itemTypes'));
app.use('/api/items', require('./routes/items'));
app.use('/api/purchases', require('./routes/purchases'));

// Unknown API route
app.use('/api', (req, res) => res.status(404).json({ error: 'Route not found' }));

// Global error handler: sensitive details expose nahi karta,
// lekin database ki common galtiyon ka readable message deta hai.
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON request' });
  }

  // PostgreSQL error code -> HTTP status + saaf message
  switch (err.code) {
    case '23505': // unique_violation
      return res.status(409).json({ error: 'Duplicate value: record already exists' });
    case '23503': // foreign_key_violation
      return res.status(409).json({ error: 'Record is referenced by other data and cannot be changed' });
    case '23514': // check_violation
      return res.status(400).json({ error: 'Value violates a database constraint' });
    case '22P02': // invalid_text_representation
    case '22007': // invalid_datetime_format
      return res.status(400).json({ error: 'Invalid value supplied' });
    case '42P01': // undefined_table
      return res.status(500).json({ error: 'Database schema is missing. Run: npm run db:setup' });
    case '3D000': // invalid_catalog_name (database exist nahi karta)
      return res.status(500).json({ error: 'Database not found. Run: npm run db:create' });
    case '28P01': // invalid_password
    case '28000': // invalid_authorization_specification
      return res.status(503).json({ error: 'Database rejected the credentials. Check DB_USER / DB_PASSWORD in .env' });
    case 'ECONNREFUSED':
    case 'ETIMEDOUT':
    case 'ENOTFOUND':
      return res.status(503).json({
        error: 'Database not reachable. PostgreSQL service chal rahi hai kya? .env mein DB_HOST=127.0.0.1 aur DB_PORT=5432 check karo'
      });
    default:
      break;
  }

  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));