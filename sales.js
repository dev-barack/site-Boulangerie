import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, onSnapshot, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const config = { apiKey: "AIzaSyA7YsFC0dtxU09zg8j3q6jv2UHoYQJQqTRA", authDomain: "boulangerie-dana.firebaseapp.com", projectId: "boulangerie-dana", storageBucket: "boulangerie-dana.firebasestorage.app", messagingSenderId: "508760970095", appId: "1:508760970095:web:0be3c6fb78eb5426698e9a" };
const app = getApps().length ? getApps()[0] : initializeApp(config);
const auth = getAuth(app);
const db = getFirestore(app);
const fallbackAdminEmails = ["devbarack2000@gmail.com"];

async function isAllowedAdmin(user) {
  if (!user || !user.email) return false;
  if (window.DanaAdmin?.resolveAdminEmails) {
    const emails = await window.DanaAdmin.resolveAdminEmails();
    return emails.includes(String(user.email).trim().toLowerCase());
  }
  return fallbackAdminEmails.includes(String(user.email).trim().toLowerCase());
}

let orders = [];
let clients = [];
let chart;

const ORDER_STATUS_LABELS = {
  PENDING: "En attente",
  READY: "Prête",
  PICKED_UP: "Retirée",
  RETRIEVED: "Retirée",
  CANCELLED: "Annulée",
  VALIDATED: "Validée",
  COMPLETED: "Terminée",
  IN_PROGRESS: "En cours"
};

function normalizeOrderStatus(status) {
  const key = String(status || "PENDING").trim().toUpperCase();
  if (["PICKED_UP", "RETRIEVED"].includes(key)) return "PICKED_UP";
  if (key === "CANCELLED") return "CANCELLED";
  if (key === "READY") return "READY";
  if (key === "PENDING") return "PENDING";
  if (key === "VALIDATED") return "VALIDATED";
  if (key === "COMPLETED") return "COMPLETED";
  if (key === "IN_PROGRESS") return "IN_PROGRESS";
  return key;
}

function getOrderStatusLabel(status) {
  return ORDER_STATUS_LABELS[normalizeOrderStatus(status)] || String(status || "En attente");
}

function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[character])); }
function total(order) { return Number(order.total ?? order.totalAmount ?? 0); }
function dateOf(order) { const date = order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.createdAt || 0); return Number.isNaN(date.getTime()) ? null : date; }
function clientName(order) { const client = clients.find(item => item.id === order.clientId || item.uid === order.clientId); return client?.nom || client?.name || order.clientName || order.customerName || "Client inconnu"; }
function itemsOf(order) { return Array.isArray(order.items) ? order.items : []; }
function showToast(message, type = "info") { const element = document.createElement("div"); element.className = "orders-toast"; element.dataset.type = type; element.textContent = message; document.body.appendChild(element); setTimeout(() => element.remove(), 3500); }
function setLoading(value) { const element = document.getElementById("sales-loading"); if (element) element.hidden = !value; }
function inPeriod(order, period) { const date = dateOf(order); if (!date || period === "all") return period === "all"; const now = new Date(); if (period === "today") return date.toDateString() === now.toDateString(); if (period === "month") return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear(); const start = new Date(now); start.setDate(now.getDate() - now.getDay()); start.setHours(0, 0, 0, 0); return date >= start; }

function renderKpis() {
  const revenue = orders.reduce((sum, order) => sum + total(order), 0);
  const productCounts = new Map();
  const clientCounts = new Map();
  orders.forEach(order => {
    clientCounts.set(order.clientId || clientName(order), (clientCounts.get(order.clientId || clientName(order)) || 0) + 1);
    itemsOf(order).forEach(item => { const key = item.productId || item.productName || item.name || "Produit"; const previous = productCounts.get(key) || { name: item.productName || item.name || key, quantity: 0 }; previous.quantity += Number(item.quantity || item.qty || 1); productCounts.set(key, previous); });
  });
  const topProduct = [...productCounts.values()].sort((a, b) => b.quantity - a.quantity)[0];
  const topClientEntry = [...clientCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const topClient = topClientEntry ? (clients.find(client => client.id === topClientEntry[0] || client.uid === topClientEntry[0])?.nom || clients.find(client => client.id === topClientEntry[0] || client.uid === topClientEntry[0])?.name || topClientEntry[0]) : "—";
  document.getElementById("sales-total-revenue").textContent = `${revenue.toLocaleString("fr-FR")} FC`;
  document.getElementById("sales-order-count").textContent = orders.length.toString();
  document.getElementById("sales-top-product").textContent = topProduct ? `${topProduct.name} (${topProduct.quantity})` : "—";
  document.getElementById("sales-top-client").textContent = topClient;
}

function renderTable() {
  const body = document.getElementById("sales-table-body");
  const search = (document.getElementById("sales-search")?.value || "").trim().toLowerCase();
  const status = document.getElementById("sales-status-filter")?.value || "";
  const period = document.getElementById("sales-period-filter")?.value || "all";
  const filtered = orders.filter(order => (`${order.id} ${clientName(order)}`.toLowerCase().includes(search)) && (!status || normalizeOrderStatus(order.status) === status) && inPeriod(order, period));
  body.innerHTML = "";
  if (!filtered.length) { body.innerHTML = '<tr><td colspan="7" class="empty-state">Aucune vente trouvée.</td></tr>'; return; }
  filtered.forEach(order => {
    const items = itemsOf(order);
    const quantity = items.reduce((sum, item) => sum + Number(item.quantity || item.qty || 1), 0);
    const productsText = items.map(item => item.productName || item.name || "Produit").join(", ") || "Commande";
    const date = dateOf(order);
    const row = document.createElement("tr");
    const statusLabel = getOrderStatusLabel(order.status);
    row.innerHTML = `<td>${date ? escapeHtml(date.toLocaleString("fr-FR")) : "-"}</td><td>${escapeHtml(clientName(order))}</td><td title="${escapeHtml(productsText)}">${escapeHtml(productsText)}</td><td>${quantity}</td><td>${total(order).toLocaleString("fr-FR")} FC</td><td><span class="badge order-status order-status-${String(normalizeOrderStatus(order.status || "PENDING")).toLowerCase()}">${escapeHtml(statusLabel)}</span></td><td>${Number(order.loyaltyPointsAwarded || 0)}</td>`;
    body.appendChild(row);
  });
}

function renderChart() {
  const canvas = document.getElementById("sales-chart");
  if (!canvas || !window.Chart) return;
  const now = new Date();
  const labels = [];
  const values = [];
  for (let offset = 6; offset >= 0; offset -= 1) { const day = new Date(now); day.setDate(now.getDate() - offset); labels.push(day.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })); values.push(orders.filter(order => { const date = dateOf(order); return date && date.toDateString() === day.toDateString(); }).reduce((sum, order) => sum + total(order), 0)); }
  if (chart) chart.destroy();
  chart = new window.Chart(canvas, { type: "line", data: { labels, datasets: [{ label: "Ventes", data: values, borderColor: "#d97706", backgroundColor: "rgba(217,119,6,0.16)", fill: true, tension: 0.35, pointRadius: 3 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: "#cfcfcf" }, grid: { color: "rgba(255,255,255,.05)" } }, y: { beginAtZero: true, ticks: { color: "#cfcfcf" }, grid: { color: "rgba(255,255,255,.05)" } } } } });
}
function renderAll() { renderKpis(); renderTable(); renderChart(); }

async function start() {
  onAuthStateChanged(auth, async user => {
    if (!(await isAllowedAdmin(user))) { window.location.href = "index.html"; return; }
    setLoading(true);
    try {
      const snapshot = await getDocs(collection(db, "users"));
      clients = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
      onSnapshot(collection(db, "orders"), snapshot => { orders = snapshot.docs.map(item => ({ id: item.id, ...item.data() })); renderAll(); setLoading(false); }, error => { console.error(error); setLoading(false); showToast("Impossible de charger les ventes.", "error"); });
    } catch (error) { console.error(error); setLoading(false); showToast("Erreur d’initialisation des ventes.", "error"); }
  });
  ["sales-search", "sales-status-filter", "sales-period-filter"].forEach(id => document.getElementById(id)?.addEventListener("input", renderTable));
  document.getElementById("sales-status-filter")?.addEventListener("change", renderTable);
  document.getElementById("sales-period-filter")?.addEventListener("change", renderTable);
}
document.addEventListener("DOMContentLoaded", start);
