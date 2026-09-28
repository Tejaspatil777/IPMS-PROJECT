const router = require('express').Router();
const pool = require('../db/pool');

// GET /api/item-types: sabhi types
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, type_name FROM item_types ORDER BY type_name'
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/item-types
router.post('/', async (req, res, next) => {
  try {
    const typeName = (req.body.type_name || '').trim();
    if (!typeName) return res.status(400).json({ error: 'Item type name is required' });

    const { rows } = await pool.query(
      'INSERT INTO item_types (type_name) VALUES ($1) RETURNING id', [typeName]
    );
    res.status(201).json({ id: rows[0].id, type_name: typeName });
  } catch (err) {
    if (err.code === '23505') // unique_violation
      return res.status(409).json({ error: 'Item type already exists' });
    next(err);
  }
});

// PUT /api/item-types/:id
router.put('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0)
      return res.status(400).json({ error: 'Invalid item type id' });

    const typeName = (req.body.type_name || '').trim();
    if (!typeName) return res.status(400).json({ error: 'Item type name is required' });

    const { rowCount } = await pool.query(
      'UPDATE item_types SET type_name = $1 WHERE id = $2', [typeName, id]
    );
    if (rowCount === 0)
      return res.status(404).json({ error: 'Item type not found' });

    res.json({ id, type_name: typeName });
  } catch (err) {
    if (err.code === '23505') // unique_violation
      return res.status(409).json({ error: 'Item type already exists' });
    next(err);
  }
});

// DELETE /api/item-types/:id: sirf tab jab koi item use na kar raha ho
router.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0)
      return res.status(400).json({ error: 'Invalid item type id' });

    const { rows } = await pool.query(
      'SELECT COUNT(*)::int AS cnt FROM items WHERE item_type_id = $1', [id]
    );
    if (rows[0].cnt > 0)
      return res.status(409).json({ error: 'Item type is in use by items and cannot be deleted' });

    const { rowCount } = await pool.query('DELETE FROM item_types WHERE id = $1', [id]);
    if (rowCount === 0)
      return res.status(404).json({ error: 'Item type not found' });

    res.json({ message: 'Item type deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
