import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { calculateOrderTotalFromOrder } from "./calculations.js";

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
let users = [];
let products = [];
let settings = {};
let chart;
let dashboardUnsubscribers = [];

function disposeDashboardListeners() {
  dashboardUnsubscribers.forEach(unsubscribe => { if (typeof unsubscribe === "function") unsubscribe(); });
  dashboardUnsubscribers = [];
}

function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[character])); }
function toast(message) { const element = document.createElement("div"); element.className = "orders-toast"; element.dataset.type = "error"; element.textContent = message; document.body.appendChild(element); setTimeout(() => element.remove(), 4000); }
function dateOf(order) { const date = order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.createdAt || 0); return Number.isNaN(date.getTime()) ? null : date; }
function total(order) { return calculateOrderTotalFromOrder(order); }
function clientName(order) { const client = users.find(user => user.id === order.clientId || user.uid === order.clientId); return client?.nom || client?.name || order.clientName || order.customerName || "Client inconnu"; }
function itemsOf(order) { return Array.isArray(order.items) ? order.items : []; }
function update(id, value) { const element = document.getElementById(id); if (element) element.textContent = value; }
function setLoading(value) { const element = document.getElementById("dashboard-loading"); if (element) element.hidden = !value; }

function renderQuickActions() {
  const root = document.getElementById("quick-actions");
  if (!root) return;

  const pendingOrders = orders.filter(order => String(order.status || "PENDING").toUpperCase() === "PENDING").length;
  const validatedOrders = orders.filter(order => String(order.status || "").toUpperCase() === "VALIDATED").length;
  const lowStock = products.filter(product => Number(product.stock || 0) <= 5 && Number(product.stock || 0) >= 0).length;
  const revenueToday = orders.filter(order => dateOf(order)?.toDateString() === new Date().toDateString()).reduce((sum, order) => sum + total(order), 0);

  const cards = [
    { label: "Commandes en attente", value: pendingOrders, tone: "amber", href: "orders.html" },
    { label: "Commandes validées", value: validatedOrders, tone: "green", href: "sales.html" },
    { label: "Produits à surveiller", value: lowStock, tone: "red", href: "products.html" },
    { label: "Revenu du jour", value: `${revenueToday.toLocaleString("fr-FR")} FC`, tone: "gold", href: "sales.html" }
  ];

  root.innerHTML = cards.map(card => `
    <a class="quick-action-card ${card.tone}" href="${card.href}">
      <span>${card.label}</span>
      <strong>${card.value}</strong>
    </a>
  `).join("");
}

function renderAlerts() {
  const root = document.getElementById("alert-board");
  if (!root) return;

  const lowStock = products.filter(product => Number(product.stock || 0) <= 5 && Number(product.stock || 0) >= 0).slice(0, 4);
  const pendingOrders = orders.filter(order => String(order.status || "PENDING").toUpperCase() === "PENDING").slice(0, 3);

  const alerts = [
    ...lowStock.map(product => ({
      type: "stock",
      title: product.name || product.nom || "Produit",
      text: `${Number(product.stock || 0)} unités restantes`,
      tone: "danger"
    })),
    ...pendingOrders.map(order => ({
      type: "order",
      title: `Commande ${String(order.id).slice(0, 8)}`,
      text: `${clientName(order)} • ${total(order).toLocaleString("fr-FR")} FC`,
      tone: "warning"
    }))
  ];

  root.innerHTML = alerts.length ? alerts.map(alert => `
    <div class="alert-card ${alert.tone}">
      <span class="alert-dot"></span>
      <div>
        <strong>${escapeHtml(alert.title)}</strong>
        <small>${escapeHtml(alert.text)}</small>
      </div>
    </div>
  `).join("") : '<div class="alert-card neutral"><span class="alert-dot"></span><div><strong>Aucune alerte</strong><small>Tout est stable pour le moment.</small></div></div>';
}

function renderDashboard() {
  const revenue = orders.reduce((sum, order) => sum + total(order), 0);
  const clients = users.filter(user => String(user.role || "").toUpperCase() === "CLIENT");
  const availableProducts = products.filter(product => product.isAvailable === true && Number(product.stock || 0) > 0);
  update("kpi-revenue", `${revenue.toLocaleString("fr-FR")} FC`);
  update("kpi-orders", orders.length.toString());
  update("kpi-clients", clients.length.toString());
  update("kpi-products", availableProducts.length.toString());
  update("kpi-team", users.filter(user => ["AGENT", "EMPLOYEE"].includes(String(user.role || "").toUpperCase())).length.toString());
  const today = new Date();
  update("kpi-orders-today", orders.filter(order => dateOf(order)?.toDateString() === today.toDateString()).length.toString());
  renderQuickActions();
  renderAlerts();
  renderRecentOrders();
  renderTopProducts();
  renderLoyalClient(clients);
  renderChart();
  setLoading(false);
}
function renderRecentOrders() {
  const body = document.getElementById("recent-orders-body");
  if (!body) return;
  const recent = orders.slice().sort((a, b) => (dateOf(b)?.getTime() || 0) - (dateOf(a)?.getTime() || 0)).slice(0, 5);
  body.innerHTML = recent.length ? recent.map(order => `<tr><td data-label="ID">${escapeHtml(order.id.slice(0, 10))}</td><td data-label="Client">${escapeHtml(clientName(order))}</td><td data-label="Montant">${total(order).toLocaleString("fr-FR")} FC</td><td data-label="Date">${dateOf(order) ? escapeHtml(dateOf(order).toLocaleString("fr-FR")) : "-"}</td><td data-label="Statut">${escapeHtml(order.status || "PENDING")}</td></tr>`).join("") : '<tr><td colspan="5" class="empty-state">Aucun résultat trouvé.</td></tr>';
}
function renderTopProducts() {
  const body = document.getElementById("top-products-list-dashboard");
  if (!body) return;
  const map = new Map();
  orders.forEach(order => itemsOf(order).forEach(item => { const key = item.productId || item.productName || item.name || "Produit"; const entry = map.get(key) || { name: item.productName || item.name || "Produit", quantity: 0 }; entry.quantity += Number(item.quantity || item.qty || 1); map.set(key, entry); }));
  const top = [...map.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 5);
  body.innerHTML = top.length ? `<ol class="dashboard-top-list">${top.map(item => `<li><span>${escapeHtml(item.name)}</span><strong>${item.quantity}</strong></li>`).join("")}</ol>` : "Aucune donnée disponible.";
}
function renderLoyalClient(clients) {
  const container = document.getElementById("loyal-client-summary");
  if (!container) return;
  const best = clients.slice().sort((a, b) => Number(b.loyaltyPoints || b.points || 0) - Number(a.loyaltyPoints || a.points || 0))[0];
  container.innerHTML = best ? `<strong>${escapeHtml(best.nom || best.name || "Client")}</strong><span>${Number(best.loyaltyPoints || best.points || 0)} points fidélité</span>` : "Aucune donnée disponible.";
}
function renderChart() {
  if (!window.Chart) return;
  const canvas = document.getElementById("salesChart");
  if (!canvas) return;
  const now = new Date(); const labels = []; const values = [];
  for (let offset = 6; offset >= 0; offset -= 1) { const day = new Date(now); day.setDate(now.getDate() - offset); labels.push(day.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })); values.push(orders.filter(order => dateOf(order)?.toDateString() === day.toDateString()).reduce((sum, order) => sum + total(order), 0)); }
  if (chart) chart.destroy();
  chart = new Chart(canvas, { type: "line", data: { labels, datasets: [{ data: values, borderColor: "#d97706", backgroundColor: "rgba(217,119,6,.16)", fill: true, tension: .35, pointRadius: 3 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: "#cfcfcf" }, grid: { color: "rgba(255,255,255,.05)" } }, y: { beginAtZero: true, ticks: { color: "#cfcfcf" }, grid: { color: "rgba(255,255,255,.05)" } } } } });
}
async function start() {
  onAuthStateChanged(auth, async user => {
    if (!(await isAllowedAdmin(user))) { window.location.href = "index.html"; return; }
    setLoading(true);
    try {
      disposeDashboardListeners();
      settings = {};
      dashboardUnsubscribers.push(onSnapshot(collection(db, "orders"), snapshot => {
        orders = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
        renderDashboard();
      }, error => { console.error(error); toast("Erreur de lecture des commandes."); }));
      dashboardUnsubscribers.push(onSnapshot(collection(db, "users"), snapshot => {
        users = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
        renderDashboard();
      }, error => { console.error(error); toast("Erreur de lecture des utilisateurs."); }));
      dashboardUnsubscribers.push(onSnapshot(collection(db, "products"), snapshot => {
        products = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
        renderDashboard();
      }, error => { console.error(error); toast("Erreur de lecture des produits."); }));
      dashboardUnsubscribers.push(onSnapshot(doc(db, "settings", "config"), snapshot => {
        settings = snapshot.exists() ? snapshot.data() : {};
        renderDashboard();
      }, error => { console.error(error); toast("Erreur de lecture des paramètres."); }));
    } catch (error) { console.error(error); setLoading(false); toast("Impossible de charger le dashboard."); }
  });
  window.addEventListener("beforeunload", disposeDashboardListeners);
}
start();
