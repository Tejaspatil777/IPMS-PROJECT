const router = require('express').Router();
const pool = require('../db/pool');

// GET /api/item-types: sabhi types
router.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
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

    const [result] = await pool.query(
      'INSERT INTO item_types (type_name) VALUES (?)', [typeName]
    );
    res.status(201).json({ id: result.insertId, type_name: typeName });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
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

    const [result] = await pool.query(
      'UPDATE item_types SET type_name = ? WHERE id = ?', [typeName, id]
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ error: 'Item type not found' });

    res.json({ id, type_name: typeName });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
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

    const [used] = await pool.query(
      'SELECT COUNT(*) AS cnt FROM items WHERE item_type_id = ?', [id]
    );
    if (used[0].cnt > 0)
      return res.status(409).json({ error: 'Item type is in use by items and cannot be deleted' });

    const [result] = await pool.query('DELETE FROM item_types WHERE id = ?', [id]);
    if (result.affectedRows === 0)
      return res.status(404).json({ error: 'Item type not found' });

    res.json({ message: 'Item type deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
