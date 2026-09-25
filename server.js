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

// Global error handler: sensitive details expose nahi karta
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON request' });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));