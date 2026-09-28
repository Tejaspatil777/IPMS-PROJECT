const router = require('express').Router();
const pool = require('../db/pool');

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// Body se date aur lines validate karo (DB ko touch kiye bina).
// Duplicate item ek order mein reject hota hai (consistent rule).
function validateBody(body) {
  const date = (body.purchase_date || '').toString().trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(new Date(date).getTime()))
    return { error: 'Purchase date is required and must be valid (YYYY-MM-DD)' };

  if (!Array.isArray(body.items) || body.items.length === 0)
    return { error: 'Purchase must contain at least one item' };

  const seen = new Set();
  const lines = [];
  for (const line of body.items) {
    const itemId = parseId(line && line.item_id);
    if (!itemId) return { error: 'Invalid item id in purchase' };

    const qty = Number(line.quantity);
    if (!Number.isInteger(qty) || qty <= 0)
      return { error: 'Quantity must be greater than zero' };

    if (seen.has(itemId))
      return { error: 'Duplicate item in the same order is not allowed' };
    seen.add(itemId);
    lines.push({ itemId, qty });
  }
  return { data: { date, lines } };
}

// Order ID generate: PO-00001, PO-00002 ...
// PostgreSQL mein "MAX(id)+1 ... FOR UPDATE" allowed nahi hai (FOR UPDATE
// aggregate ke saath kaam nahi karta). Identity sequence se hi next id lo ->
// poori tarah atomic aur race-free; order_id hamesha purchases.id se match karega.
async function nextOrder(conn) {
  const { rows } = await conn.query(
    "SELECT nextval(pg_get_serial_sequence('purchases', 'id')) AS id"
  );
  const id = Number(rows[0].id);
  return { id, orderId: 'PO-' + String(id).padStart(5, '0') };
}

// Purchase details fetch karne ka JOIN (assignment ka 2nd mandatory JOIN)
async function fetchPurchase(conn, whereSql, param) {
  const { rows } = await conn.query(
    `SELECT p.id AS purchase_id, p.order_id, p.purchase_date,
            i.id AS item_id, i.name AS item_name, it.type_name,
            pi.quantity, i.stock_available, i.active
     FROM purchases p
     JOIN purchase_items pi ON p.id = pi.purchase_id
     JOIN items i ON pi.item_id = i.id
     JOIN item_types it ON i.item_type_id = it.id
     WHERE ${whereSql}
     ORDER BY p.id, pi.id`, [param]
  );
  if (rows.length === 0) return null;
  return {
    id: rows[0].purchase_id,
    order_id: rows[0].order_id,
    purchase_date: rows[0].purchase_date,
    items: rows.map(r => ({
      item_id: r.item_id, item_name: r.item_name, type_name: r.type_name,
      quantity: r.quantity, current_stock: r.stock_available, active: r.active
    }))
  };
}

// Item ko lock karke validate karo. isNew = true toh inactive item reject.
async function lockItems(conn, itemIds) {
  // MySQL ka "IN (?)" PostgreSQL mein nahi chalta -> = ANY($1::int[])
  const { rows } = await conn.query(
    'SELECT id, name, stock_available, active FROM items WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE',
    [itemIds]
  );
  return new Map(rows.map(r => [r.id, r]));
}

// GET /api/purchases: list (har order ke total items ke saath)
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.order_id, p.purchase_date,
              COUNT(pi.id)::int AS line_count, COALESCE(SUM(pi.quantity), 0)::int AS total_quantity
       FROM purchases p
       LEFT JOIN purchase_items pi ON p.id = pi.purchase_id
       GROUP BY p.id, p.order_id, p.purchase_date
       ORDER BY p.id DESC`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/purchases/:id  (numeric id ya order_id jaise PO-00001)
router.get('/:id', async (req, res, next) => {
  try {
    const key = req.params.id;
    const isOrderId = /^PO-\d+$/i.test(key);
    const numeric = parseId(key);
    if (!isOrderId && !numeric)
      return res.status(400).json({ error: 'Invalid purchase id' });

    const purchase = isOrderId
      ? await fetchPurchase(pool, 'p.order_id = $1', key.toUpperCase())
      : await fetchPurchase(pool, 'p.id = $1', numeric);
    if (!purchase) return res.status(404).json({ error: 'Purchase not found' });
    res.json(purchase);
  } catch (err) { next(err); }
});

// POST /api/purchases: transaction ke saath
router.post('/', async (req, res, next) => {
  const v = validateBody(req.body);
  if (v.error) return res.status(400).json({ error: v.error });
  const { date, lines } = v.data;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Items lock + validate
    const itemMap = await lockItems(client, lines.map(l => l.itemId));
    for (const l of lines) {
      const item = itemMap.get(l.itemId);
      if (!item) throw { status: 404, message: 'Item not found' };
      if (!item.active)
        throw { status: 409, message: `Item is inactive and cannot be purchased: ${item.name}` };
      if (l.qty > item.stock_available)
        throw { status: 409, message: `Insufficient stock for ${item.name}. Available: ${item.stock_available}` };
    }

    // 2. Purchase insert (id sequence se pehle hi reserve ho jata hai)
    const order = await nextOrder(client);
    await client.query(
      'INSERT INTO purchases (id, order_id, purchase_date) VALUES ($1, $2, $3)',
      [order.id, order.orderId, date]
    );

    // 3. Purchase items insert + 4. stock deduct
    for (const l of lines) {
      await client.query(
        'INSERT INTO purchase_items (purchase_id, item_id, quantity) VALUES ($1, $2, $3)',
        [order.id, l.itemId, l.qty]
      );
      await client.query(
        'UPDATE items SET stock_available = stock_available - $1 WHERE id = $2',
        [l.qty, l.itemId]
      );
    }

    await client.query('COMMIT');
    const purchase = await fetchPurchase(pool, 'p.id = $1', order.id);
    res.status(201).json(purchase);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  } finally {
    client.release();
  }
});

// PUT /api/purchases/:id: quantity difference se stock adjust
router.put('/:id', async (req, res, next) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid purchase id' });
  const v = validateBody(req.body);
  if (v.error) return res.status(400).json({ error: v.error });
  const { date, lines } = v.data;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: ex } = await client.query('SELECT id FROM purchases WHERE id = $1 FOR UPDATE', [id]);
    if (ex.length === 0) throw { status: 404, message: 'Purchase not found' };

    // Purani quantities
    const { rows: oldRows } = await client.query(
      'SELECT item_id, quantity FROM purchase_items WHERE purchase_id = $1', [id]
    );
    const oldMap = new Map(oldRows.map(r => [r.item_id, r.quantity]));
    const newMap = new Map(lines.map(l => [l.itemId, l.qty]));

    // Jitne items pe asar padega un sabko lock karo
    const allIds = [...new Set([...oldMap.keys(), ...newMap.keys()])];
    const itemMap = await lockItems(client, allIds);

    // Har item ka diff: new - old. Positive = extra deduct, negative = stock wapas.
    for (const itemId of allIds) {
      const item = itemMap.get(itemId);
      if (!item) throw { status: 404, message: 'Item not found' };

      const oldQty = oldMap.get(itemId) || 0;
      const newQty = newMap.get(itemId) || 0;
      const diff = newQty - oldQty;

      if (diff > 0) {
        // Naya ya badhi hui quantity: inactive block, stock check
        if (!item.active)
          throw { status: 409, message: `Item is inactive and cannot be purchased: ${item.name}` };
        if (diff > item.stock_available)
          throw { status: 409, message: `Insufficient stock for ${item.name}. Available: ${item.stock_available}` };
      }
      if (diff !== 0) {
        await client.query(
          'UPDATE items SET stock_available = stock_available - $1 WHERE id = $2', [diff, itemId]
        );
      }
    }

    // Lines dobara likho, date update karo
    await client.query('DELETE FROM purchase_items WHERE purchase_id = $1', [id]);
    for (const l of lines) {
      await client.query(
        'INSERT INTO purchase_items (purchase_id, item_id, quantity) VALUES ($1, $2, $3)',
        [id, l.itemId, l.qty]
      );
    }
    await client.query('UPDATE purchases SET purchase_date = $1 WHERE id = $2', [date, id]);

    await client.query('COMMIT');
    const purchase = await fetchPurchase(pool, 'p.id = $1', id);
    res.json(purchase);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  } finally {
    client.release();
  }
});

// DELETE route jaan-boojhkar nahi banaya: purchases historical data hain.

module.exports = router;
