# IPMS — Item & Purchase Management System

Complete technical documentation: architecture, tech stack, database design, API,
business rules and how to run the project.

---

## 1. Project identity

| Item | Value |
|---|---|
| Name | `item-purchase-system` (IPMS) — "Item & Purchase Management System" |
| Repository | `https://github.com/Tejaspatil777/IPMS-PROJECT.git`, branch `main` |
| Type | Node.js + Express REST API serving a static frontend, backed by PostgreSQL |
| Purpose | Manage item types and items, record purchases (with automatic stock deduction), view stock availability and purchase history |
| Domain objects | Item Type -> Item -> Purchase (header) + Purchase Items (lines) |
| Platform | Windows 11 (local development) |

## 2. Tech stack

### 2.1 Backend

| Layer | Technology | Notes |
|---|---|---|
| Runtime | Node.js v24.19.0 | CommonJS (`"type": "commonjs"`) |
| Web framework | Express 5.2.1 | `express.json()`, `express.static('public')`, mounted routers |
| Database driver | pg 8.13.1 | `pg.Pool` (max 10 connections), `types.setTypeParser` overrides, raw parameterized SQL (`$1 ... $n`) |
| Database | PostgreSQL 16.10 | `127.0.0.1:5432`, `scram-sha-256` auth, database `item_purchase_db` |
| Configuration | dotenv 18 | `.env` (git-ignored): `PORT`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` |
| Middleware | cors 2.8.6 | `cors()` enabled |
| Dev tooling | nodemon 3.1.14 | `npm run dev` |
| ORM / query builder | none | plain SQL through `pg` |
| Migrations | none | single idempotent `db/schema.sql` + npm scripts `db:create`, `db:setup` |
| Authentication | none | open REST API (out of scope) |

### 2.2 Frontend

| Layer | Technology | Notes |
|---|---|---|
| Markup | HTML5, single page | `public/index.html` — header + 5-tab nav, five panel sections, toast div, hidden inputs for edit state |
| Styling | Plain CSS3 (hand-written) | `public/style.css` — Flexbox, CSS Grid (`auto-fit/minmax`), badges, one `@media` breakpoint |
| Scripting | Vanilla ES6+ JavaScript | `public/app.js` — `async/await`, `fetch()`, template literals, `esc()` HTML escaping |
| Build step | none | files are served as-is; no bundler, no npm packages in the browser |
| Browser APIs | Fetch API, `<input type="date">`, `<input type="number">`, `confirm()` | |

**The frontend needs only a modern browser.** Express serves both the UI and the API
on the same port, so there is no separate frontend command.

### 2.3 Unused / legacy technology (kept out of the runtime path)

React 18 + `react-scripts`, Tailwind CSS, PostCSS and Autoprefixer came in with the
initial commit and are **not used** by the running application. Their source
(`src/`), build output (`build/`) and configs have been removed, so the only
remaining trace is the unused logo assets in `public/images/`.

---

## 3. Architecture

```
        Browser (public/index.html + app.js + style.css)
                     |                          ^
      fetch('/api/...') -> JSON                | HTML / CSS / JS (static)
                     v                          |
        +------------------------------------------------+
        |  Express 5 (server.js, port 3000)              |
        |  - express.static('public')                    |
        |  - express.json()   - cors()                   |
        |  - /api/item-types -> routes/itemTypes.js      |
        |  - /api/items      -> routes/items.js          |
        |  - /api/purchases  -> routes/purchases.js      |
        |  - 404 guard for unknown /api/*                |
        |  - global error handler (SQLSTATE -> HTTP)     |
        +------------------------------------------------+
                     |  parameterized SQL ($1 ... $n)
                     v
        pg.Pool  -->  PostgreSQL 16  (item_purchase_db)
                      item_types -> items -> purchase_items <- purchases
                      + 2 triggers, 4 identity sequences
```

A single process serves the UI **and** the REST API. Each UI tab calls its
endpoints and re-renders its table:

| Tab | Calls |
|---|---|
| Item Types | `GET/POST/PUT/DELETE /api/item-types` |
| Items | `GET/POST/PUT/PATCH/DELETE /api/items` |
| Create Purchase | `GET /api/items` (active items only) then `POST /api/purchases` |
| Purchases | `GET /api/purchases`, `GET /api/purchases/:id`, `PUT /api/purchases/:id` |
| Stock | `GET /api/items` with availability badges |

## 4. Database design

| Table | Columns and constraints |
|---|---|
| `item_types` | `id` IDENTITY PK, `type_name VARCHAR(100) NOT NULL UNIQUE` |
| `items` | `id` IDENTITY PK, `name VARCHAR(150) NOT NULL`, `purchase_date DATE NOT NULL`, `stock_available INT NOT NULL DEFAULT 0` + `CHECK (stock_available >= 0)`, `item_type_id INT NOT NULL FK -> item_types`, `active BOOLEAN NOT NULL DEFAULT TRUE`, `created_at` / `updated_at TIMESTAMPTZ DEFAULT now()` |
| `purchases` | `id` IDENTITY PK, `order_id VARCHAR(20) NOT NULL UNIQUE`, `purchase_date DATE NOT NULL`, timestamps |
| `purchase_items` | `id` IDENTITY PK, `purchase_id FK -> purchases`, `item_id FK -> items`, `quantity INT NOT NULL` + `CHECK (quantity > 0)`, `UNIQUE (purchase_id, item_id)`, `created_at` |

- Triggers `trg_items_updated_at` and `trg_purchases_updated_at` call `set_updated_at()`.
- Sequences: `items_id_seq`, `item_types_id_seq`, `purchases_id_seq`, `purchase_items_id_seq`.
- Seed data: 5 item types (Electronics, Furniture, Clothing, Grocery, Stationery)
  and 3 items (Laptop 10, Mouse 20, Chair 15).

## 5. API endpoints

| Resource | Endpoints |
|---|---|
| Item types | `GET /api/item-types`, `POST /api/item-types`, `PUT /api/item-types/:id`, `DELETE /api/item-types/:id` |
| Items | `GET /api/items`, `GET /api/items/:id`, `POST /api/items`, `PUT /api/items/:id`, `PATCH /api/items/:id/status`, `DELETE /api/items/:id` |
| Purchases | `GET /api/purchases`, `GET /api/purchases/:id` (numeric id or `PO-00001`), `POST /api/purchases`, `PUT /api/purchases/:id` |
| Misc | unknown `/api/*` -> 404 JSON; malformed JSON body -> 400 |

There is intentionally **no DELETE endpoint for purchases** (historical data).

Two mandatory JOINs are used: `items JOIN item_types` (with a `CASE` computing
`In Stock` / `Low Stock` (<= 5) / `Out of Stock`) and
`purchases JOIN purchase_items JOIN items JOIN item_types` for purchase details.

## 6. Business rules

| Rule | Where it is enforced |
|---|---|
| Purchase create/update is atomic | `pool.connect()` + `BEGIN` ... `COMMIT`, `ROLLBACK` on failure |
| No overselling | `SELECT ... WHERE id = ANY($1::int[]) ... FOR UPDATE` row locks + application check (409) + DB `CHECK` |
| Order numbering | `nextval(pg_get_serial_sequence('purchases','id'))` -> `PO-` + 5-digit pad (atomic, always matches the row id) |
| Purchase update | stock adjusted by the difference (`new - old`); a positive difference re-checks active + stock |
| Inactive items | cannot be purchased (409); can still be viewed, updated or re-activated |
| Items used in purchases | cannot be deleted (409) -> mark Inactive instead |
| Item types in use | cannot be deleted (409) |
| Duplicate item in one order | rejected by the API (400) and by `UNIQUE (purchase_id, item_id)` |
| Validation | dates `YYYY-MM-DD`, stock a whole number `>= 0`, quantity `> 0`, `active` boolean, item type must exist |

### Error mapping (`server.js`)

| PostgreSQL SQLSTATE / code | HTTP | Message |
|---|---|---|
| `23505` unique_violation | 409 | Duplicate value: record already exists |
| `23503` foreign_key_violation | 409 | Record is referenced by other data |
| `23514` check_violation | 400 | Value violates a database constraint |
| `22P02` / `22007` | 400 | Invalid value supplied |
| `42P01` undefined_table | 500 | Run `npm run db:setup` |
| `3D000` invalid_catalog_name | 500 | Run `npm run db:create` |
| `28P01` invalid_password | 503 | Check `DB_USER` / `DB_PASSWORD` in `.env` |
| `ECONNREFUSED` / `ETIMEDOUT` / `ENOTFOUND` | 503 | Check the PostgreSQL service and `.env` |

## 7. File map

| File | Purpose |
|---|---|
| `server.js` | Express app: static hosting, routers, JSON parsing, 404 guard, error mapping |
| `db/pool.js` | `pg.Pool` + type parsers (DATE/TIMESTAMP as strings, bigint -> number) |
| `db/schema.sql` | PostgreSQL DDL, triggers, sample data (idempotent) |
| `routes/itemTypes.js` | Item type CRUD |
| `routes/items.js` | Item CRUD, status toggle, JOIN select with availability |
| `routes/purchases.js` | Purchase list/detail/create/update with transactions |
| `public/index.html` | Single-page UI markup (5 tabs) |
| `public/app.js` | UI logic: fetch, render, client-side validation |
| `public/style.css` | Hand-written CSS |
| `README.md`, `API.md`, `PROJECT.md` | Documentation |
| `.env` / `.env.example` | Configuration (the real `.env` is git-ignored) |
| `screenshots/` | Project screenshots |

## 8. Setup and run

```powershell
cd g:\IPMS\IPMS
npm install                     # express, pg, dotenv, cors, nodemon
npm run db:create               # CREATE DATABASE item_purchase_db
npm run db:setup                # db/schema.sql -> tables + triggers + seed
npm start                       # http://localhost:3000     (npm run dev = nodemon)
```

`.env`:

```
PORT=3000
DB_HOST=127.0.0.1     # not "localhost" (avoids Node's IPv6 ::1 resolution issue)
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=<your password>
DB_NAME=item_purchase_db
```

## 9. Verification status

- `node --check` passes for every backend file.
- 30/30 end-to-end API assertions pass: CRUD for all resources, transaction with
  stock deduction, `PO-00001` numbering, update with stock difference, and the
  400/404/409 error paths plus malformed JSON.
- API JSON shape is preserved for the frontend: dates as `YYYY-MM-DD` strings,
  `active` as a real boolean, `COUNT`/`SUM` as numbers (not bigint strings).

## 10. Migration history

The project was originally written against **MySQL 8** (driver `mysql2`) and was
migrated to **PostgreSQL 16**:

| MySQL | PostgreSQL |
|---|---|
| `mysql2/promise` + `createPool` | `pg` `Pool` + `setTypeParser` overrides |
| `AUTO_INCREMENT` | `INT GENERATED BY DEFAULT AS IDENTITY` |
| `TINYINT(1)` for `active` | `BOOLEAN` |
| `ON UPDATE CURRENT_TIMESTAMP` | `set_updated_at()` trigger |
| `?` placeholders | `$1 ... $n` |
| `result.insertId` | `INSERT ... RETURNING id` |
| `result.affectedRows` | `rowCount` |
| error code `ER_DUP_ENTRY` | SQLSTATE `23505` |
| `beginTransaction()/commit()/rollback()` | `BEGIN` / `COMMIT` / `ROLLBACK` on a pooled client |
| `WHERE id IN (?)` | `WHERE id = ANY($1::int[])` |
| `SELECT MAX(id)+1 ... FOR UPDATE` | `nextval(pg_get_serial_sequence(...))` (`FOR UPDATE` cannot be used with aggregates in PostgreSQL) |
| `dateStrings: true` | `types.setTypeParser(1082, v => v)` (plus 1114 / 1184, and bigint `20` -> `Number`) |

## 11. Notes and limitations

- No authentication or authorization: the API is open (local assignment scope).
- No automated test suite is committed; verification was done with a local
  end-to-end script (30 assertions).
- No migration tooling: schema changes are applied by re-running `db/schema.sql`.
- Pagination, filtering and search are not implemented.
- Deleting purchases is deliberately unsupported (history must be preserved).
- The unused React / Tailwind / PostCSS artifacts from the initial commit were removed;
  `public/images/logo.jpg` and `logo.png` remain but are not referenced by the UI.
- Rotate the database password used during development and update `.env`.
