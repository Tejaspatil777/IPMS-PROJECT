const $ = id => document.getElementById(id);
let itemsCache = [];
let orderLines = []; // {item_id, item_name, type_name, quantity}

// ---------- helpers ----------
async function api(url, method = 'GET', body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

function showMsg(text, type = 'success') {
  const m = $('message');
  m.textContent = text;
  m.className = 'message ' + type;
  setTimeout(() => m.classList.add('hidden'), 4000);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function availBadge(a) {
  const cls = a === 'In Stock' ? 'green' : a === 'Low Stock' ? 'orange' : 'red';
  return `<span class="badge ${cls}">${a}</span>`;
}

function showTab(name) {
  document.querySelectorAll('.panel').forEach(p => p.classList.add('hidden'));
  $(name).classList.remove('hidden');
  document.querySelectorAll('.tab').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === name));
  if (name === 'types') loadTypes();
  if (name === 'items') loadItems();
  if (name === 'purchase') loadPurchaseForm();
  if (name === 'purchases') loadPurchases();
  if (name === 'stock') loadStock();
}
document.querySelectorAll('.tab').forEach(t =>
  t.addEventListener('click', () => showTab(t.dataset.tab)));

// ---------- ITEM TYPES ----------
async function loadTypes() {
  try {
    const types = await api('/api/item-types');
    $('types-body').innerHTML = types.map(t => `
      <tr><td>${t.id}</td><td>${esc(t.type_name)}</td>
      <td>
        <button class="btn small" onclick="editType(${t.id}, '${esc(t.type_name)}')">Edit</button>
        <button class="btn small danger" onclick="deleteType(${t.id})">Delete</button>
      </td></tr>`).join('');
  } catch (e) { showMsg(e.message, 'error'); }
}
function editType(id, name) {
  $('type-id').value = id; $('type-name').value = name;
  $('type-cancel').classList.remove('hidden');
}
function resetTypeForm() {
  $('type-id').value = ''; $('type-name').value = '';
  $('type-cancel').classList.add('hidden');
}
$('type-cancel').addEventListener('click', resetTypeForm);
$('type-save').addEventListener('click', async () => {
  try {
    const id = $('type-id').value;
    const body = { type_name: $('type-name').value };
    if (id) await api('/api/item-types/' + id, 'PUT', body);
    else await api('/api/item-types', 'POST', body);
    showMsg('Item type saved');
    resetTypeForm(); loadTypes();
  } catch (e) { showMsg(e.message, 'error'); }
});
async function deleteType(id) {
  if (!confirm('Delete this item type?')) return;
  try { await api('/api/item-types/' + id, 'DELETE'); showMsg('Item type deleted'); loadTypes(); }
  catch (e) { showMsg(e.message, 'error'); }
}

// ---------- ITEMS ----------
async function loadItems() {
  try {
    const [types, items] = await Promise.all([api('/api/item-types'), api('/api/items')]);
    itemsCache = items;
    const sel = $('item-type');
    const current = sel.value;
    sel.innerHTML = types.map(t => `<option value="${t.id}">${esc(t.type_name)}</option>`).join('');
    if (current) sel.value = current;

    $('items-body').innerHTML = items.map(i => `
      <tr>
        <td>${i.id}</td><td>${esc(i.name)}</td><td>${esc(i.type_name)}</td>
        <td>${i.purchase_date}</td><td>${i.stock_available}</td>
        <td>${availBadge(i.availability)}</td>
        <td>${i.active ? '<span class="badge green">Active</span>' : '<span class="badge grey">Inactive</span>'}</td>
        <td>
          <button class="btn small" onclick="viewItem(${i.id})">View</button>
          <button class="btn small" onclick="editItem(${i.id})">Update</button>
          <button class="btn small" onclick="toggleItem(${i.id}, ${i.active ? 'false' : 'true'})">${i.active ? 'Deactivate' : 'Activate'}</button>
          <button class="btn small danger" onclick="deleteItem(${i.id})">Delete</button>
        </td>
      </tr>`).join('');
  } catch (e) { showMsg(e.message, 'error'); }
}
async function viewItem(id) {
  try {
    const i = await api('/api/items/' + id);
    const box = $('item-details');
    box.innerHTML = `<h3>Item Details</h3>
      <p><b>ID:</b> ${i.id}</p><p><b>Name:</b> ${esc(i.name)}</p>
      <p><b>Type:</b> ${esc(i.type_name)}</p><p><b>Purchase Date:</b> ${i.purchase_date}</p>
      <p><b>Stock:</b> ${i.stock_available} (${i.availability})</p>
      <p><b>Status:</b> ${i.active ? 'Active' : 'Inactive'}</p>`;
    box.classList.remove('hidden');
  } catch (e) { showMsg(e.message, 'error'); }
}
function editItem(id) {
  const i = itemsCache.find(x => x.id === id);
  $('item-id').value = i.id; $('item-name').value = i.name;
  $('item-type').value = i.item_type_id; $('item-date').value = i.purchase_date;
  $('item-stock').value = i.stock_available; $('item-active').value = String(!!i.active);
  $('item-save').textContent = 'Update Item';
  $('item-cancel').classList.remove('hidden');
  window.scrollTo(0, 0);
}
function resetItemForm() {
  $('item-form').reset(); $('item-id').value = '';
  $('item-save').textContent = 'Create Item';
  $('item-cancel').classList.add('hidden');
}
$('item-cancel').addEventListener('click', resetItemForm);
$('item-form').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    const id = $('item-id').value;
    const body = {
      name: $('item-name').value,
      item_type_id: $('item-type').value,
      purchase_date: $('item-date').value,
      stock_available: $('item-stock').value,
      active: $('item-active').value === 'true'
    };
    if (id) await api('/api/items/' + id, 'PUT', body);
    else await api('/api/items', 'POST', body);
    showMsg(id ? 'Item updated' : 'Item created');
    resetItemForm(); loadItems();
  } catch (e) { showMsg(e.message, 'error'); }
});
async function toggleItem(id, active) {
  try { await api(`/api/items/${id}/status`, 'PATCH', { active }); loadItems(); }
  catch (e) { showMsg(e.message, 'error'); }
}
async function deleteItem(id) {
  if (!confirm('Delete this item?')) return;
  try { await api('/api/items/' + id, 'DELETE'); showMsg('Item deleted'); $('item-details').classList.add('hidden'); loadItems(); }
  catch (e) { showMsg(e.message, 'error'); }
}

// ---------- PURCHASE FORM ----------
async function loadPurchaseForm() {
  try {
    itemsCache = await api('/api/items');
    // Sirf Active items selectable
    $('line-item').innerHTML = itemsCache.filter(i => i.active).map(i =>
      `<option value="${i.id}">${esc(i.name)} (stock: ${i.stock_available})</option>`).join('');
    if (!$('purchase-edit-id').value && !$('purchase-date').value)
      $('purchase-date').value = new Date().toISOString().slice(0, 10);
    renderLines();
  } catch (e) { showMsg(e.message, 'error'); }
}
function renderLines() {
  $('lines-body').innerHTML = orderLines.map((l, idx) => `
    <tr><td>${esc(l.item_name)}</td><td>${esc(l.type_name)}</td><td>${l.quantity}</td>
    <td><button class="btn small danger" onclick="removeLine(${idx})">Remove</button></td></tr>`).join('');
}
$('line-add').addEventListener('click', () => {
  const itemId = Number($('line-item').value);
  const qty = Number($('line-qty').value);
  if (!itemId) return showMsg('Select an item', 'error');
  if (!Number.isInteger(qty) || qty <= 0) return showMsg('Quantity must be greater than zero', 'error');
  if (orderLines.some(l => l.item_id === itemId))
    return showMsg('Item already added to this order', 'error');
  const item = itemsCache.find(i => i.id === itemId);
  orderLines.push({ item_id: itemId, item_name: item.name, type_name: item.type_name, quantity: qty });
  renderLines();
});
function removeLine(idx) { orderLines.splice(idx, 1); renderLines(); }

function resetPurchaseForm() {
  orderLines = [];
  $('purchase-edit-id').value = '';
  $('purchase-order-id').value = 'Auto-generated';
  $('purchase-date').value = new Date().toISOString().slice(0, 10);
  $('purchase-title').textContent = 'Create Purchase';
  $('purchase-submit').textContent = 'Submit Purchase';
  $('purchase-cancel').classList.add('hidden');
  renderLines();
}
$('purchase-cancel').addEventListener('click', resetPurchaseForm);
$('purchase-submit').addEventListener('click', async () => {
  try {
    const editId = $('purchase-edit-id').value;
    const body = {
      purchase_date: $('purchase-date').value,
      items: orderLines.map(l => ({ item_id: l.item_id, quantity: l.quantity }))
    };
    const p = editId ? await api('/api/purchases/' + editId, 'PUT', body)
                     : await api('/api/purchases', 'POST', body);
    showMsg((editId ? 'Purchase updated: ' : 'Purchase saved: ') + p.order_id);
    resetPurchaseForm();
    showTab('purchases');
  } catch (e) { showMsg(e.message, 'error'); }
});

// ---------- PURCHASE LIST + DETAILS ----------
async function loadPurchases() {
  try {
    const list = await api('/api/purchases');
    $('purchases-body').innerHTML = list.map(p => `
      <tr><td>${p.order_id}</td><td>${p.purchase_date}</td>
      <td>${p.line_count}</td><td>${p.total_quantity}</td>
      <td>
        <button class="btn small" onclick="viewPurchase(${p.id})">View Details</button>
        <button class="btn small" onclick="editPurchase(${p.id})">Update</button>
      </td></tr>`).join('');
    // NOTE: Purchase ke liye Delete button jaan-boojhkar nahi hai
  } catch (e) { showMsg(e.message, 'error'); }
}
async function viewPurchase(id) {
  try {
    const p = await api('/api/purchases/' + id);
    const box = $('purchase-details');
    box.innerHTML = `<h3>Purchase Details</h3>
      <p><b>Order ID:</b> ${p.order_id}</p><p><b>Purchase Date:</b> ${p.purchase_date}</p>
      <table><thead><tr><th>Item</th><th>Type</th><th>Quantity</th><th>Current Stock</th><th>Item Status</th></tr></thead>
      <tbody>${p.items.map(i => `<tr><td>${esc(i.item_name)}</td><td>${esc(i.type_name)}</td>
        <td>${i.quantity}</td><td>${i.current_stock}</td>
        <td>${i.active ? 'Active' : 'Inactive'}</td></tr>`).join('')}</tbody></table>`;
    box.classList.remove('hidden');
  } catch (e) { showMsg(e.message, 'error'); }
}
async function editPurchase(id) {
  try {
    const p = await api('/api/purchases/' + id);
    orderLines = p.items.map(i => ({
      item_id: i.item_id, item_name: i.item_name, type_name: i.type_name, quantity: i.quantity
    }));
    showTab('purchase');
    $('purchase-edit-id').value = p.id;
    $('purchase-order-id').value = p.order_id;
    $('purchase-date').value = p.purchase_date;
    $('purchase-title').textContent = 'Update Purchase ' + p.order_id;
    $('purchase-submit').textContent = 'Save Changes';
    $('purchase-cancel').classList.remove('hidden');
    renderLines();
  } catch (e) { showMsg(e.message, 'error'); }
}

// ---------- STOCK ----------
async function loadStock() {
  try {
    const items = await api('/api/items');
    $('stock-body').innerHTML = items.map(i => `
      <tr><td>${esc(i.name)}</td><td>${esc(i.type_name)}</td>
      <td>${i.stock_available}</td><td>${availBadge(i.availability)}</td></tr>`).join('');
  } catch (e) { showMsg(e.message, 'error'); }
}

// start
loadTypes();
