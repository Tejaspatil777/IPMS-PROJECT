# Item & Purchase Management System

Node.js + Express.js + MySQL web application for managing Items, Item Types,
Purchases, stock availability and purchase history.

## Prerequisites

- Node.js v20 or higher
- npm v10 or higher
- MySQL Server 8.0.16 or higher (CHECK constraints need 8.0.16+)
- MySQL Workbench (optional)

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create the database

Using MySQL command line:

```bash
mysql -u root -p < db/schema.sql
```

Or in MySQL Workbench: File > Open SQL Script > `db/schema.sql` > Execute.

This creates the database `item_purchase_db`, all 4 tables and sample data
(5 item types, 3 items).

### 3. Configure environment

Copy `.env.example` to `.env` and set your MySQL credentials:

```
PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=item_purchase_db
```

### 4. Start the application

```bash
npm start
```

For auto-restart during development: `npm run dev`

Open http://localhost:3000 in the browser. The frontend is served by the
same Express server, so there is no separate frontend command.

## Project Structure

```
db/schema.sql        Database schema + sample data
db/pool.js           MySQL connection pool
routes/              REST API routes (itemTypes, items, purchases)
public/              Frontend (HTML, CSS, JS)
server.js            Express app entry point
API.md               API documentation
```

## Key Design Decisions

- **Transactions:** Purchase create and update run inside a MySQL transaction
  (BEGIN, validate, insert, stock update, COMMIT, ROLLBACK on failure).
- **Row locking:** `SELECT ... FOR UPDATE` on items prevents two simultaneous
  purchases from making stock negative.
- **No purchase deletion:** Purchases are historical data. There is no DELETE
  purchase API and no Delete button in the UI.
- **Item deletion rule:** An item used in any purchase cannot be deleted
  (409 error). Mark it Inactive instead.
- **Duplicate items in one order:** Rejected with a 400 error.
- **Stock check at DB level too:** `CHECK (stock_available >= 0)`.

## SQL JOINs Used

Item + Item Type:

```sql
SELECT i.id, i.name, it.type_name, i.purchase_date, i.stock_available, i.active
FROM items i JOIN item_types it ON i.item_type_id = it.id;
```

Purchase + Items + Item Types:

```sql
SELECT p.order_id, p.purchase_date, i.id AS item_id, i.name AS item_name,
       it.type_name, pi.quantity
FROM purchases p
JOIN purchase_items pi ON p.id = pi.purchase_id
JOIN items i ON pi.item_id = i.id
JOIN item_types it ON i.item_type_id = it.id
WHERE p.order_id = ?;
```

## API Usage Example

```bash
curl -X POST http://localhost:3000/api/purchases \
  -H "Content-Type: application/json" \
  -d '{"purchase_date":"2026-08-25","items":[{"item_id":1,"quantity":2},{"item_id":2,"quantity":5}]}'
```

See `API.md` for all endpoints.