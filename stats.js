import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, getDocs, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const config = { apiKey: "AIzaSyA7YsFC0dtxU09zg8j3q6jv2UHoYQJQqTRA", authDomain: "boulangerie-dana.firebaseapp.com", projectId: "boulangerie-dana", storageBucket: "boulangerie-dana.firebasestorage.app", messagingSenderId: "508760970095", appId: "1:508760970095:web:0be3c6fb78eb5426698e9a" };
const fallbackAdminEmails = ["devbarack2000@gmail.com"];
const app = getApps().length ? getApps()[0] : initializeApp(config);
const auth = getAuth(app);
const db = getFirestore(app);

async function isAllowedAdmin(user) {
  if (!user || !user.email) return false;
  if (window.DanaAdmin?.resolveAdminEmails) {
    const emails = await window.DanaAdmin.resolveAdminEmails();
    return emails.includes(String(user.email).trim().toLowerCase());
  }
  return fallbackAdminEmails.includes(String(user.email).trim().toLowerCase());
}

let orders = [];
let products = [];
let users = [];
let salesChart;
let categoryChart;

function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[character])); }
function toast(message, type = "info") { const element = document.createElement("div"); element.className = "orders-toast"; element.dataset.type = type; element.textContent = message; document.body.appendChild(element); setTimeout(() => element.remove(), 3500); }
function dateOf(order) { const date = order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.createdAt || 0); return Number.isNaN(date.getTime()) ? null : date; }
function orderTotal(order) { return Number(order.total ?? order.totalAmount ?? 0); }
function selectedPeriod() { return document.getElementById("stats-period")?.value || "all"; }
function inPeriod(order, period) { const date = dateOf(order); if (!date || period === "all") return period === "all"; const now = new Date(); if (period === "today") return date.toDateString() === now.toDateString(); if (period === "month") return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear(); const start = new Date(now); start.setDate(now.getDate() - now.getDay()); start.setHours(0, 0, 0, 0); return date >= start; }
function clientName(order) { const user = users.find(item => item.id === order.clientId || item.uid === order.clientId); return user?.nom || user?.name || order.clientName || order.customerName || "Client inconnu"; }
function itemsOf(order) { return Array.isArray(order.items) ? order.items : []; }
function filteredOrders() { const period = selectedPeriod(); return orders.filter(order => inPeriod(order, period)); }

function renderKpis(currentOrders) {
  const revenue = currentOrders.reduce((sum, order) => sum + orderTotal(order), 0);
  const available = products.filter(product => product.isAvailable !== false && Number(product.stock || 0) > 0).length;
  const retrieved = currentOrders.filter(order => order.status === "RETRIEVED").length;
  document.getElementById("stat-revenue").textContent = `${revenue.toLocaleString("fr-FR")} FC`;
  document.getElementById("stat-orders").textContent = currentOrders.length.toString();
  document.getElementById("stat-clients").textContent = users.filter(user => String(user.role || "").toUpperCase() === "CLIENT").length.toString();
  document.getElementById("stat-products").textContent = available.toString();
  document.getElementById("stat-average").textContent = `${(currentOrders.length ? revenue / currentOrders.length : 0).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} FC`;
  document.getElementById("stat-retrieval").textContent = `${currentOrders.length ? Math.round(retrieved / currentOrders.length * 100) : 0}%`;
}

function renderTables(currentOrders) {
  const productMap = new Map();
  const clientMap = new Map();
  currentOrders.forEach(order => {
    const clientKey = order.clientId || clientName(order);
    const clientEntry = clientMap.get(clientKey) || { name: clientName(order), count: 0, total: 0 };
    clientEntry.count += 1;
    clientEntry.total += orderTotal(order);
    clientMap.set(clientKey, clientEntry);
    itemsOf(order).forEach(item => {
      const key = item.productId || item.productName || item.name || "Produit";
      const entry = productMap.get(key) || { name: item.productName || item.name || "Produit", quantity: 0, revenue: 0 };
      const quantity = Number(item.quantity || item.qty || 1);
      entry.quantity += quantity;
      entry.revenue += Number(item.price || 0) * quantity;
      productMap.set(key, entry);
    });
  });
  const productsBody = document.getElementById("top-products-body");
  const topProducts = [...productMap.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 5);
  productsBody.innerHTML = topProducts.length ? topProducts.map(item => `<tr><td>${escapeHtml(item.name)}</td><td>${item.quantity}</td><td>${item.revenue.toLocaleString("fr-FR")} FC</td></tr>`).join("") : '<tr><td colspan="3" class="empty-state">Aucune donnée disponible.</td></tr>';
  const clientsBody = document.getElementById("top-clients-body");
  const topClients = [...clientMap.values()].sort((a, b) => b.count - a.count || b.total - a.total).slice(0, 5);
  clientsBody.innerHTML = topClients.length ? topClients.map(item => `<tr><td>${escapeHtml(item.name)}</td><td>${item.count}</td><td>${item.total.toLocaleString("fr-FR")} FC</td></tr>`).join("") : '<tr><td colspan="3" class="empty-state">Aucune donnée disponible.</td></tr>';
}

function renderCharts(currentOrders) {
  if (!window.Chart) return;
  const now = new Date();
  const period = selectedPeriod();
  const days = period === "today" ? 1 : period === "week" ? 7 : period === "month" ? 30 : 30;
  const labels = [];
  const values = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(now.getDate() - offset);
    labels.push(day.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }));
    values.push(currentOrders.filter(order => dateOf(order)?.toDateString() === day.toDateString()).reduce((sum, order) => sum + orderTotal(order), 0));
  }
  const categoryMap = new Map();
  currentOrders.forEach(order => itemsOf(order).forEach(item => {
    const product = products.find(entry => entry.id === item.productId || entry.productId === item.productId);
    const category = item.category || product?.category || "Divers";
    categoryMap.set(category, (categoryMap.get(category) || 0) + Number(item.price || product?.price || 0) * Number(item.quantity || item.qty || 1));
  }));
  const categoryLabels = [...categoryMap.keys()];
  const categoryValues = categoryLabels.map(label => categoryMap.get(label));
  if (salesChart) salesChart.destroy();
  if (categoryChart) categoryChart.destroy();
  salesChart = new Chart(document.getElementById("stats-sales-chart"), { type: "line", data: { labels, datasets: [{ data: values, borderColor: "#d97706", backgroundColor: "rgba(217,119,6,.16)", fill: true, tension: .35, pointRadius: 2 }] }, options: chartOptions() });
  categoryChart = new Chart(document.getElementById("stats-category-chart"), { type: "pie", data: { labels: categoryLabels.length ? categoryLabels : ["Aucune vente"], datasets: [{ data: categoryValues.length ? categoryValues : [1], backgroundColor: ["#d97706", "#b45309", "#f59e0b", "#92400e", "#fbbf24"] }] }, options: { ...chartOptions(), plugins: { legend: { position: "bottom", labels: { color: "#cfcfcf" } } } } });
}
function chartOptions() { return { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: "#cfcfcf", maxTicksLimit: 10 }, grid: { color: "rgba(255,255,255,.05)" } }, y: { beginAtZero: true, ticks: { color: "#cfcfcf" }, grid: { color: "rgba(255,255,255,.05)" } } } }; }
function renderAll() { const currentOrders = filteredOrders(); renderKpis(currentOrders); renderTables(currentOrders); renderCharts(currentOrders); }

async function start() {
  onAuthStateChanged(auth, async user => {
    if (!(await isAllowedAdmin(user))) { window.location.href = "index.html"; return; }
    try {
      const [usersSnapshot, productsSnapshot] = await Promise.all([getDocs(collection(db, "users")), getDocs(collection(db, "products"))]);
      users = usersSnapshot.docs.map(item => ({ id: item.id, ...item.data() }));
      products = productsSnapshot.docs.map(item => ({ id: item.id, ...item.data() }));
      onSnapshot(collection(db, "orders"), snapshot => { orders = snapshot.docs.map(item => ({ id: item.id, ...item.data() })); renderAll(); }, error => { console.error(error); toast("Erreur de mise à jour des commandes.", "error"); });
      onSnapshot(collection(db, "products"), snapshot => { products = snapshot.docs.map(item => ({ id: item.id, ...item.data() })); renderAll(); }, error => { console.error(error); toast("Erreur de mise à jour des produits.", "error"); });
      onSnapshot(collection(db, "users"), snapshot => { users = snapshot.docs.map(item => ({ id: item.id, ...item.data() })); renderAll(); }, error => { console.error(error); toast("Erreur de mise à jour des clients.", "error"); });
    } catch (error) { console.error(error); toast("Impossible de charger les statistiques.", "error"); }
  });
  document.getElementById("stats-period")?.addEventListener("change", renderAll);
}
document.addEventListener("DOMContentLoaded", start);
