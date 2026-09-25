# API Documentation

Base URL: `http://localhost:3000/api`

## Item Types

| Method | Endpoint | Description |
|---|---|---|
| GET | /item-types | List all types |
| POST | /item-types | Create. Body: `{"type_name":"Books"}` |
| PUT | /item-types/:id | Update. Body: `{"type_name":"Books"}` |
| DELETE | /item-types/:id | Delete (409 if used by items) |

## Items

| Method | Endpoint | Description |
|---|---|---|
| GET | /items | List all (JOIN with item_types) |
| GET | /items/:id | Item details |
| POST | /items | Create item |
| PUT | /items/:id | Update item |
| PATCH | /items/:id/status | Activate/Deactivate. Body: `{"active":false}` |
| DELETE | /items/:id | Delete (409 if used in purchase history) |

Create/Update body:

```json
{
  "name": "Keyboard",
  "item_type_id": 1,
  "purchase_date": "2026-08-01",
  "stock_available": 10,
  "active": true
}
```

## Purchases

| Method | Endpoint | Description |
|---|---|---|
| GET | /purchases | List all purchases |
| GET | /purchases/:id | Details (numeric id or order id like PO-00001) |
| POST | /purchases | Create (transaction, stock deducted) |
| PUT | /purchases/:id | Update (stock adjusted by quantity difference) |

There is no DELETE endpoint for purchases by design.

Create/Update body:

```json
{
  "purchase_date": "2026-08-25",
  "items": [
    { "item_id": 1, "quantity": 2 },
    { "item_id": 2, "quantity": 5 }
  ]
}
```

## Error Responses

| Status | Meaning | Example |
|---|---|---|
| 400 | Validation error | `{"error":"Item name is required"}` |
| 404 | Not found | `{"error":"Item not found"}` |
| 409 | Business conflict | `{"error":"Insufficient stock for Laptop. Available: 8"}` |
| 500 | Server error | `{"error":"Internal server error"}` |