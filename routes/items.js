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
  const [types] = await pool.query('SELECT id FROM item_types WHERE id = ?', [typeId]);
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
  const active = (body.active === true || body.active === 1 || body.active === '1' ||
                  body.active === 'true') ? 1 : 0;

  return { data: { name, typeId, date, stock, active } };
}

// GET /api/items: sabhi items (JOIN ke saath)
router.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.query(ITEM_SELECT + ' ORDER BY i.id');
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/items/:id
router.get('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid item id' });

    const [rows] = await pool.query(ITEM_SELECT + ' WHERE i.id = ?', [id]);
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

    const [result] = await pool.query(
      `INSERT INTO items (name, purchase_date, stock_available, item_type_id, active)
       VALUES (?, ?, ?, ?, ?)`,
      [d.name, d.date, d.stock, d.typeId, d.active]
    );
    const [rows] = await pool.query(ITEM_SELECT + ' WHERE i.id = ?', [result.insertId]);
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

    const [result] = await pool.query(
      `UPDATE items SET name = ?, purchase_date = ?, stock_available = ?,
                        item_type_id = ?, active = ?
       WHERE id = ?`,
      [d.name, d.date, d.stock, d.typeId, d.active, id]
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ error: 'Item not found' });

    const [rows] = await pool.query(ITEM_SELECT + ' WHERE i.id = ?', [id]);
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

    const [result] = await pool.query(
      'UPDATE items SET active = ? WHERE id = ?', [req.body.active ? 1 : 0, id]
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ error: 'Item not found' });

    const [rows] = await pool.query(ITEM_SELECT + ' WHERE i.id = ?', [id]);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/items/:id: sirf jab item kisi purchase mein use na hua ho
router.delete('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid item id' });

    const [exists] = await pool.query('SELECT id FROM items WHERE id = ?', [id]);
    if (exists.length === 0) return res.status(404).json({ error: 'Item not found' });

    const [used] = await pool.query(
      'SELECT COUNT(*) AS cnt FROM purchase_items WHERE item_id = ?', [id]
    );
    if (used[0].cnt > 0)
      return res.status(409).json({
        error: 'Item is used in purchase history and cannot be deleted. Mark it Inactive instead.'
      });

    await pool.query('DELETE FROM items WHERE id = ?', [id]);
    res.json({ message: 'Item deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
