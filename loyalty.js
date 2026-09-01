import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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

let clients = [];
let orders = [];

function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[character])); }
function orderDate(order) { const date = order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.createdAt || 0); return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("fr-FR"); }
function render() {
  const body = document.getElementById("loyalty-table-body");
  const search = (document.getElementById("loyalty-search")?.value || "").toLowerCase().trim();
  const visible = clients.filter(client => `${client.nom || client.name || ""} ${client.phone || ""}`.toLowerCase().includes(search));
  body.innerHTML = "";
  if (!visible.length) { body.innerHTML = '<tr><td colspan="4" class="empty-state">Aucun client trouvé.</td></tr>'; return; }
  visible.forEach(client => {
    const clientOrders = orders.filter(order => order.clientId === client.id || order.clientId === client.uid);
    const row = document.createElement("tr");
    row.innerHTML = `<td>${escapeHtml(client.nom || client.name || "Client")}</td><td style="color:var(--accent-gold);font-weight:700;">${Number(client.loyaltyPoints || client.points || 0)}</td><td>${clientOrders.length}</td><td style="text-align:right"><button class="btn btn-ghost loyalty-history-button" type="button">Historique</button></td>`;
    row.querySelector("button").addEventListener("click", () => openHistory(client, clientOrders));
    body.appendChild(row);
  });
}
function openHistory(client, clientOrders) {
  const modal = document.createElement("div");
  modal.className = "orders-modal-backdrop";
  modal.innerHTML = `<div class="orders-modal" role="dialog" aria-modal="true"><div class="orders-modal-header"><h3>Historique fidélité</h3><button class="btn-ghost close-history" type="button">✕</button></div><p>${escapeHtml(client.nom || client.name || "Client")} · <strong>${Number(client.loyaltyPoints || client.points || 0)} points</strong></p><div class="order-history-list">${clientOrders.length ? clientOrders.map(order => `<div class="order-history-row"><span>${orderDate(order)}</span><span>${escapeHtml(order.status || "PENDING")}</span><strong>${Number(order.total ?? order.totalAmount ?? 0).toLocaleString("fr-FR")} FC</strong></div>`).join("") : '<p class="empty-state">Aucune commande.</p>'}</div></div>`;
  document.body.appendChild(modal);
  modal.querySelector(".close-history").addEventListener("click", () => modal.remove());
  modal.addEventListener("click", event => { if (event.target === modal) modal.remove(); });
}
async function start() {
  onAuthStateChanged(auth, async user => {
    if (!(await isAllowedAdmin(user))) { window.location.href = "index.html"; return; }
    try {
      const [usersSnapshot, ordersSnapshot] = await Promise.all([getDocs(collection(db, "users")), getDocs(query(collection(db, "orders"), orderBy("createdAt", "desc")))]);
      clients = usersSnapshot.docs.map(item => ({ id: item.id, ...item.data() })).filter(item => String(item.role || "").toUpperCase() === "CLIENT");
      orders = ordersSnapshot.docs.map(item => ({ id: item.id, ...item.data() }));
      render();
    } catch (error) { console.error(error); document.getElementById("loyalty-table-body").innerHTML = '<tr><td colspan="4" class="empty-state">Impossible de charger la fidélité.</td></tr>'; }
  });
  document.getElementById("loyalty-search")?.addEventListener("input", render);
}
document.addEventListener("DOMContentLoaded", start);
