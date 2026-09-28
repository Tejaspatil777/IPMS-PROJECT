# Item & Purchase Management System

Node.js + Express.js + MySQL web application for managing Items, Item Types,
Purchases, stock availability and purchase history.

## Prerequisites

- Node.js v20 or higher
- npm v10 or higher
- PostgreSQL 16 or higher, service running, `psql` on PATH

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create the database and load the schema

PostgreSQL mein `CREATE DATABASE` ya `USE` SQL script ke andar nahi chal sakta,
isliye pehle database banate hain, phir schema load karte hain:

```bash
psql -U postgres -h 127.0.0.1 -c "CREATE DATABASE item_purchase_db"
psql -U postgres -h 127.0.0.1 -d item_purchase_db -f db/schema.sql
```

Shortcut (wahi commands, npm scripts ke through):

```bash
npm run db:create
npm run db:setup
```

This creates all 4 tables, the `updated_at` trigger and sample data
(5 item types, 3 items).

### 3. Configure environment

Copy `.env.example` to `.env` and set your PostgreSQL credentials:

```
PORT=3000
DB_HOST=127.0.0.1
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_postgres_password
DB_NAME=item_purchase_db
```

`DB_HOST=127.0.0.1` rakho, `localhost` nahi: Node 17+ `localhost` ko pehle IPv6
`::1` pe resolve karta hai, aur agar PostgreSQL sirf IPv4 pe listen kar raha ho
to connection `ECONNREFUSED` se fail hota hai.

### 4. Start the application

```bash
npm start
```

For auto-restart during development: `npm run dev`

Open http://localhost:3000 in the browser. The frontend is served by the
same Express server, so there is no separate frontend command.

## Project Structure

```
db/schema.sql        PostgreSQL schema, trigger + sample data
db/pool.js           PostgreSQL connection pool (pg)
routes/              REST API routes (itemTypes, items, purchases)
public/              Frontend (HTML, CSS, JS)
server.js            Express app entry point
API.md               API documentation
```

## Key Design Decisions

- **Transactions:** Purchase create and update run inside a PostgreSQL
  transaction (`BEGIN`, validate, insert, stock update, `COMMIT`, `ROLLBACK`
  on failure) using a single pooled client.
- **Row locking:** `SELECT ... FOR UPDATE` on items (via
  `WHERE id = ANY($1::int[])`) prevents two simultaneous purchases from making
  stock negative.
- **Order numbering:** `order_id` (`PO-00001`) is generated from the
  `purchases.id` identity sequence with `nextval(...)`, so it is atomic and
  race-free, and always matches the row id. (`MAX(id)+1 ... FOR UPDATE` is not
  allowed in PostgreSQL because `FOR UPDATE` cannot be used with aggregates.)
- **`updated_at`:** Maintained by a `BEFORE UPDATE` trigger
  (`set_updated_at()`), since PostgreSQL has no `ON UPDATE CURRENT_TIMESTAMP`.
- **Driver type parsers:** `db/pool.js` keeps `DATE`/`TIMESTAMP` as strings
  (`'YYYY-MM-DD'`) and converts bigint `COUNT()`/`SUM()` results to numbers, so
  the API JSON stays exactly the same shape for the frontend.
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

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Any API returns `503 Database not reachable` | PostgreSQL service stopped, or wrong `DB_HOST`/`DB_PORT` | `Get-Service postgresql*` → start it; keep `DB_HOST=127.0.0.1` (not `localhost`) |
| `503 Database rejected the credentials` | Wrong `DB_USER`/`DB_PASSWORD` in `.env` | Fix `.env` and restart `npm start` (env is read at boot) |
| `500 Database not found. Run: npm run db:create` | `item_purchase_db` does not exist | `npm run db:create` |
| `500 Database schema is missing. Run: npm run db:setup` | Tables/trigger not created | `npm run db:setup` |
| `409 Duplicate value: record already exists` | Duplicate type name or duplicate item in one order | Expected behaviour |
| `400 Invalid value supplied` | Bad id/date in request body | Send `YYYY-MM-DD` dates, positive integer ids |
| `favicon.ico 404` | No favicon file | Harmless (suppressed via `<link rel="icon" href="data:,">`) |

`.env` changes need a server restart unless you run `npm run dev` (nodemon).