const router = require('express').Router();
const pool = require('../db/pool');

// Base query: JOIN se item type ka naam aata hai (assignment ka mandatory JOIN)
const ITEM_SELECT = `
  SELECT i.id, i.name, i.item_type_id, it.type_name, i.purchase_date,
         i.stock_available, i.active,
         CASE
           WHEN i.stock_available = 0 THEN 'Out of Stock'
           WHEN i.stock_available <= 5 THEN 'Low Stock'
           ELSE 'In Stock'
         END AS availability
  FROM items i
  JOIN item_types it ON i.item_type_id = it.id
`;

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// Body validate karta hai. Error string return karta hai, sahi ho toh null + clean data.
async function validateItem(body) {
  const name = (body.name || '').toString().trim();
  if (!name) return { error: 'Item name is required' };

  const typeId = parseId(body.item_type_id);
  if (!typeId) return { error: 'Invalid item type' };
  const { rows: types } = await pool.query('SELECT id FROM item_types WHERE id = $1', [typeId]);
  if (types.length === 0) return { error: 'Invalid item type' };

  const date = (body.purchase_date || '').toString().trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(new Date(date).getTime()))
    return { error: 'Purchase date is required and must be valid (YYYY-MM-DD)' };

  const stock = Number(body.stock_available);
  if (body.stock_available === '' || body.stock_available === null ||
      body.stock_available === undefined || !Number.isInteger(stock))
    return { error: 'Stock must be a whole number' };
  if (stock < 0) return { error: 'Stock cannot be negative' };

  if (body.active === undefined || body.active === null)
    return { error: 'Active status is required' };
  // PostgreSQL BOOLEAN column: real true/false hi bhejna hai (1/0 integer reject hota hai)
  const active = body.active === true || body.active === 1 ||
                 body.active === '1' || body.active === 'true';

  return { data: { name, typeId, date, stock, active } };
}

// GET /api/items: sabhi items (JOIN ke saath)
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(ITEM_SELECT + ' ORDER BY i.id');
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/items/:id
router.get('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid item id' });

    const { rows } = await pool.query(ITEM_SELECT + ' WHERE i.id = $1', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Item not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /api/items
router.post('/', async (req, res, next) => {
  try {
    const v = await validateItem(req.body);
    if (v.error) return res.status(400).json({ error: v.error });
    const d = v.data;

    const { rows: inserted } = await pool.query(
      `INSERT INTO items (name, purchase_date, stock_available, item_type_id, active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [d.name, d.date, d.stock, d.typeId, d.active]
    );
    const { rows } = await pool.query(ITEM_SELECT + ' WHERE i.id = $1', [inserted[0].id]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PUT /api/items/:id
router.put('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid item id' });

    const v = await validateItem(req.body);
    if (v.error) return res.status(400).json({ error: v.error });
    const d = v.data;

    const { rowCount } = await pool.query(
      `UPDATE items SET name = $1, purchase_date = $2, stock_available = $3,
                        item_type_id = $4, active = $5
       WHERE id = $6`,
      [d.name, d.date, d.stock, d.typeId, d.active, id]
    );
    if (rowCount === 0)
      return res.status(404).json({ error: 'Item not found' });

    const { rows } = await pool.query(ITEM_SELECT + ' WHERE i.id = $1', [id]);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /api/items/:id/status: Activate / Deactivate
router.patch('/:id/status', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid item id' });
    if (typeof req.body.active !== 'boolean')
      return res.status(400).json({ error: 'active must be true or false' });

    const { rowCount } = await pool.query(
      'UPDATE items SET active = $1 WHERE id = $2', [req.body.active, id]
    );
    if (rowCount === 0)
      return res.status(404).json({ error: 'Item not found' });

    const { rows } = await pool.query(ITEM_SELECT + ' WHERE i.id = $1', [id]);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/items/:id: sirf jab item kisi purchase mein use na hua ho
router.delete('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid item id' });

    const { rows: exists } = await pool.query('SELECT id FROM items WHERE id = $1', [id]);
    if (exists.length === 0) return res.status(404).json({ error: 'Item not found' });

    const { rows: used } = await pool.query(
      'SELECT COUNT(*)::int AS cnt FROM purchase_items WHERE item_id = $1', [id]
    );
    if (used[0].cnt > 0)
      return res.status(409).json({
        error: 'Item is used in purchase history and cannot be deleted. Mark it Inactive instead.'
      });

    await pool.query('DELETE FROM items WHERE id = $1', [id]);
    res.json({ message: 'Item deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
