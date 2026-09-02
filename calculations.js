export function toNumber(value, fallback = 0) {
  const numeric = Number(value ?? fallback);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function resolveQuantity(value, fallback = 1) {
  const numeric = Math.floor(toNumber(value, fallback));
  return Number.isFinite(numeric) ? Math.max(1, numeric) : fallback;
}

export function safeQuantity(value, fallback = 1) {
  return resolveQuantity(value, fallback);
}

export function clampQuantity(value, stockLimit = Number.POSITIVE_INFINITY) {
  const quantity = Math.floor(toNumber(value, 1));
  const maximum = Number.isFinite(stockLimit) ? Math.max(0, Math.floor(stockLimit)) : Number.POSITIVE_INFINITY;
  if (maximum === Number.POSITIVE_INFINITY) return Math.max(1, quantity);
  return Math.min(Math.max(1, quantity), maximum);
}

export function calculateItemTotal(item = {}) {
  const quantity = resolveQuantity(item.quantity ?? item.qty ?? item.count ?? 1, 1);
  const unitPrice = toNumber(item.price ?? item.unitPrice ?? 0, 0);
  return unitPrice * quantity;
}

export function calculateOrderTotal(items = []) {
  return (Array.isArray(items) ? items : []).reduce((sum, item) => sum + calculateItemTotal(item), 0);
}

export function calculateOrderTotalFromOrder(order = {}) {
  if (order.total != null || order.totalAmount != null) {
    return toNumber(order.total ?? order.totalAmount ?? 0, 0);
  }
  return calculateOrderTotal(Array.isArray(order.items) ? order.items : []);
}

export function calculateReducedPrice(price, discount = 0) {
  const basePrice = toNumber(price, 0);
  const percent = Math.min(Math.max(toNumber(discount, 0), 0), 100);
  return Math.max(0, basePrice - (basePrice * percent / 100));
}

export function isProductAvailable(product = {}) {
  return product.isAvailable !== false && toNumber(product.stock, 0) > 0;
}

export function calculateStockAfterOrder(currentStock, orderedQuantity) {
  return Math.max(0, toNumber(currentStock, 0) - toNumber(orderedQuantity, 0));
}

export function calculateStockAfterCancellation(currentStock, cancelledQuantity) {
  return toNumber(currentStock, 0) + toNumber(cancelledQuantity, 0);
}

export function normalizeOrderStatus(status) {
  const key = String(status || "PENDING").trim().toUpperCase();
  if (["PICKED_UP", "RETRIEVED"].includes(key)) return "PICKED_UP";
  if (["VALIDATED", "READY", "PENDING", "CANCELLED", "COMPLETED", "IN_PROGRESS"].includes(key)) return key;
  return key || "PENDING";
}

export function hasValidQuantity(quantity, stock) {
  const qty = Math.floor(toNumber(quantity, 1));
  const availableStock = Math.max(0, Math.floor(toNumber(stock, 0)));
  return qty >= 1 && qty <= availableStock;
}
