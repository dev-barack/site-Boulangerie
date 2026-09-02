import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, getDocs, getDoc, onSnapshot, addDoc, updateDoc, doc, query, where, orderBy, serverTimestamp, runTransaction, writeBatch, increment, Timestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { calculateItemTotal, calculateOrderTotalFromOrder, safeQuantity, toNumber } from "./calculations.js";

const firebaseConfig = {
  apiKey: "AIzaSyA7YsFC0dtxU09zg8j3q6jv2UHoYQJQqTRA",
  authDomain: "boulangerie-dana.firebaseapp.com",
  projectId: "boulangerie-dana",
  storageBucket: "boulangerie-dana.firebasestorage.app",
  messagingSenderId: "508760970095",
  appId: "1:508760970095:web:0be3c6fb78eb5426698e9a"
};
const fallbackAdminEmails = ["devbarack2000@gmail.com"];
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
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
let clients = [];
let products = [];
let platformSettings = { orderInitialStatus: "PENDING" };
let unsubscribeOrders = null;

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

function disposeOrdersListener() {
  if (typeof unsubscribeOrders === "function") {
    unsubscribeOrders();
    unsubscribeOrders = null;
  }
}

function getOrdersQuery() {
  const status = document.getElementById("orders-filter-status")?.value || "";
  if (status) {
    return query(collection(db, "orders"), where("status", "==", status), orderBy("createdAt", "desc"));
  }
  return query(collection(db, "orders"), orderBy("createdAt", "desc"));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[character]));
}
function toast(message, type = "info") {
  const element = document.createElement("div");
  element.className = "orders-toast";
  element.textContent = message;
  element.dataset.type = type;
  document.body.appendChild(element);
  setTimeout(() => element.remove(), 3500);
}
function orderTotal(order) { return calculateOrderTotalFromOrder(order); }
function orderDate(order) {
  const value = order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.createdAt || 0);
  return Number.isNaN(value.getTime()) ? "-" : value.toLocaleString("fr-FR");
}

function normalizeClientIdentifier(value) {
  return String(value ?? "").trim();
}

function getClientByUid(uid) {
  const candidate = normalizeClientIdentifier(uid);
  if (!candidate) return null;

  return clients.find(item => {
    const userId = normalizeClientIdentifier(item.id);
    const itemUid = normalizeClientIdentifier(item.uid);
    const itemClientId = normalizeClientIdentifier(item.clientId);
    return userId === candidate || itemUid === candidate || itemClientId === candidate;
  }) || null;
}

function getClientByClientNumber(clientNumber) {
  const candidate = normalizeClientIdentifier(clientNumber);
  if (!candidate) return null;

  return clients.find(item => {
    const userClientNumber = normalizeClientIdentifier(item.clientNumber || item.customerNumber || "");
    return userClientNumber === candidate;
  }) || null;
}

function getClientByIdentifier(identifier) {
  const candidate = normalizeClientIdentifier(identifier);
  if (!candidate) return null;
  return clients.find(item => {
    const userId = normalizeClientIdentifier(item.id);
    const uid = normalizeClientIdentifier(item.uid);
    const itemClientId = normalizeClientIdentifier(item.clientId);
    const clientNumber = normalizeClientIdentifier(item.clientNumber || item.customerNumber || "");
    const phone = normalizeClientIdentifier(item.phone || item.telephone || "");
    const email = normalizeClientIdentifier(item.email || item.userEmail || "");
    return userId === candidate || uid === candidate || itemClientId === candidate || clientNumber === candidate || phone === candidate || email.toLowerCase() === candidate.toLowerCase();
  }) || null;
}

function resolveOrderClient(order) {
  if (!order) return null;

  const uidCandidates = [order?.clientId, order?.uid, order?.customerId, order?.clientUid, order?.customerUid];
  for (const candidate of uidCandidates) {
    const matched = getClientByUid(candidate);
    if (matched) return matched;
  }

  const numberCandidates = [order?.clientNumber, order?.customerNumber, order?.clientId, order?.customerId];
  for (const candidate of numberCandidates) {
    const matched = getClientByClientNumber(candidate);
    if (matched) return matched;
  }

  const clientIdMatch = getClientByIdentifier(order?.clientId || order?.customerId || order?.uid);
  if (clientIdMatch) return clientIdMatch;

  const candidateIds = [order?.phone, order?.telephone, order?.clientPhone, order?.customerPhone, order?.email, order?.clientEmail, order?.customerEmail];
  for (const candidate of candidateIds) {
    const matched = getClientByIdentifier(candidate);
    if (matched) return matched;
  }
  return null;
}

function clientName(order) {
  const client = resolveOrderClient(order);
  if (client) return client.nom || client.name || client.email || "Client";

  const fallbackUid = normalizeClientIdentifier(order?.clientId || order?.uid || order?.customerId || "");
  if (fallbackUid) return `Client ${fallbackUid.slice(0, 12)}`;
  return order.clientName || order.customerName || "Client inconnu";
}
function setLoading(value) { const element = document.getElementById("orders-loading"); if (element) element.hidden = !value; }

export async function linkExistingOrdersToClients() {
  const [orderSnapshot, userSnapshot] = await Promise.all([getDocs(collection(db, "orders")), getDocs(collection(db, "users"))]);
  const users = userSnapshot.docs.map(item => ({ id: item.id, ...item.data() }));
  const findClient = order => {
    const candidateIds = [
      order.clientId,
      order.customerId,
      order.uid,
      order.clientNumber,
      order.customerNumber,
      order.phone,
      order.telephone,
      order.clientPhone,
      order.customerPhone,
      order.email,
      order.clientEmail,
      order.customerEmail
    ];

    for (const candidate of candidateIds) {
      const value = String(candidate ?? "").trim();
      if (!value) continue;
      const match = users.find(user => {
        const userId = String(user.id || "");
        const userUid = String(user.uid || "");
        const userClientNumber = String(user.clientNumber || user.customerNumber || "");
        const userPhone = String(user.phone || user.telephone || "");
        const userEmail = String(user.email || user.userEmail || "").toLowerCase();
        return userId === value || userUid === value || userClientNumber === value || userPhone === value || userEmail === value.toLowerCase();
      });
      if (match) return match;
    }
    return null;
  };
  const batch = writeBatch(db);
  let linked = 0;
  orderSnapshot.docs.forEach(item => {
    const data = item.data();
    const client = !data.clientId ? findClient(data) : findClient(data) || null;
    if (client) {
      batch.update(doc(db, "orders", item.id), { clientId: client.id, clientUid: client.uid || client.id, updatedAt: serverTimestamp() });
      linked += 1;
    }
  });
  if (linked) await batch.commit();
  return linked;
}

function getQuickStatusActions(order) {
  const currentStatus = normalizeOrderStatus(order.status || "PENDING");
  const actions = [];

  if (currentStatus === "PENDING") {
    actions.push({ label: "Valider", value: "VALIDATED", tone: "success" });
  }
  if (currentStatus === "VALIDATED" || currentStatus === "READY") {
    actions.push({ label: "Retirer", value: "PICKED_UP", tone: "warning" });
  }
  if (currentStatus !== "CANCELLED") {
    actions.push({ label: "Annuler", value: "CANCELLED", tone: "danger" });
  }

  return actions;
}

function renderOrders() {
  const tbody = document.getElementById("orders-table-body");
  if (!tbody) return;
  const search = (document.getElementById("orders-search")?.value || "").trim().toLowerCase();
  const status = document.getElementById("orders-filter-status")?.value || "";
  const filtered = orders.filter(order => {
    const client = clientName(order).toLowerCase();
    const phone = String(order.phone || order.telephone || order.clientPhone || order.customerPhone || "").toLowerCase();
    const clientNumber = String(order.clientNumber || order.customerNumber || "").toLowerCase();
    const text = `${order.id} ${client} ${order.clientId || ""} ${phone} ${clientNumber}`.toLowerCase();
    const matchesSearch = !search || text.includes(search);
    const matchesStatus = !status || normalizeOrderStatus(order.status) === status;
    return matchesSearch && matchesStatus;
  });
  tbody.innerHTML = "";
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Aucun résultat trouvé.</td></tr>';
    return;
  }
  filtered.forEach(order => {
    const row = document.createElement("tr");
    const statusLabel = getOrderStatusLabel(order.status);
    const quickActions = getQuickStatusActions(order);
    row.innerHTML = `
      <td title="${escapeHtml(order.id)}">${escapeHtml(order.id.slice(0, 10))}</td>
      <td>${escapeHtml(clientName(order))}</td>
      <td>${escapeHtml(orderDate(order))}</td>
      <td>${orderTotal(order).toLocaleString("fr-FR")} FC</td>
      <td><span class="badge order-status order-status-${String(normalizeOrderStatus(order.status || "PENDING")).toLowerCase()}">${escapeHtml(statusLabel)}</span></td>
      <td style="text-align:right">
        <div class="orders-row-actions">
          <button class="btn btn-ghost order-detail-button" type="button">Voir</button>
          ${quickActions.map(action => `<button class="btn btn-ghost order-quick-action order-quick-action-${action.tone}" data-status="${action.value}" type="button">${action.label}</button>`).join("")}
        </div>
      </td>
    `;
    row.querySelector(".order-detail-button").addEventListener("click", () => openOrderModal(order));
    row.querySelectorAll(".order-quick-action").forEach(button => {
      button.addEventListener("click", async () => {
        const nextStatus = button.dataset.status;
        try {
          await handleStatusChange(order.clientId || order.customerId || null, order.id, nextStatus);
          toast(nextStatus === "CANCELLED" ? "Commande annulée." : nextStatus === "VALIDATED" ? "Commande validée." : "Commande retirée.", "success");
        } catch (error) {
          console.error(error);
          toast("Impossible de mettre à jour la commande.", "error");
        }
      });
    });
    tbody.appendChild(row);
  });
}

function openOrderModal(order) {
  const modal = document.createElement("div");
  modal.className = "orders-modal-backdrop";
  const items = Array.isArray(order.items) ? order.items : [];
  modal.innerHTML = `
    <div class="orders-modal" role="dialog" aria-modal="true" aria-label="Détails de la commande">
      <div class="orders-modal-header"><h3>Détails de la commande</h3><button class="btn-ghost modal-close" type="button">✕</button></div>
      <div class="order-summary"><div><span>Client</span><strong>${escapeHtml(clientName(order))}</strong></div><div><span>Date</span><strong>${escapeHtml(orderDate(order))}</strong></div><div><span>Total</span><strong>${orderTotal(order).toLocaleString("fr-FR")} FC</strong></div></div>
      <h4>Articles</h4>
      <div class="order-items">${items.length ? items.map(item => `<div><span>${escapeHtml(item.productName || item.name || "Produit")} × ${safeQuantity(item.quantity ?? item.qty ?? 1)}</span><strong>${calculateItemTotal(item).toLocaleString("fr-FR")} FC</strong></div>`).join("") : '<p class="empty-state">Aucun article détaillé.</p>'}</div>
      <form class="order-status-form"><label for="order-status-select">Statut</label><select id="order-status-select"><option value="PENDING">En attente</option><option value="VALIDATED">Validée</option><option value="READY">Prête</option><option value="PICKED_UP">Retirée</option><option value="CANCELLED">Annulée</option></select><div class="orders-modal-actions"><button type="button" class="btn-ghost modal-close">Annuler</button><button class="btn" type="submit">Enregistrer</button></div></form>
    </div>`;
  document.body.appendChild(modal);
  modal.querySelector("#order-status-select").value = normalizeOrderStatus(order.status || "PENDING");
  modal.querySelectorAll(".modal-close").forEach(button => button.addEventListener("click", () => modal.remove()));
  modal.addEventListener("click", event => { if (event.target === modal) modal.remove(); });
  modal.querySelector(".order-status-form").addEventListener("submit", async event => {
    event.preventDefault();
    const newStatus = modal.querySelector("#order-status-select").value;
    try {
      await handleStatusChange(order.clientId || order.customerId || null, order.id, newStatus);
      modal.remove();
      toast("Statut de la commande mis à jour.", "success");
    } catch (error) {
      console.error(error);
      toast("Impossible de mettre à jour la commande.", "error");
    }
  });
}

async function handleStatusChange(clientId, orderId, newStatus) {
  if (!orderId) throw new Error("Commande introuvable");

  const orderRef = doc(db, "orders", orderId);
  const orderSnap = await getDoc(orderRef);
  if (!orderSnap.exists()) throw new Error("Commande introuvable");

  const current = orderSnap.data();
  const matchedClient = resolveOrderClient(current) || getClientByIdentifier(clientId);
  const safeClientId = matchedClient ? matchedClient.id : (typeof clientId === "string" && clientId.trim() ? clientId.trim() : null);
  const normalizedNewStatus = normalizeOrderStatus(newStatus);
  const previousStatus = normalizeOrderStatus(current.status || "PENDING");
  const settingsSnap = await getDoc(doc(db, "settings", "config"));
  const settings = settingsSnap.exists() ? settingsSnap.data() : { loyaltyEnabled: false };
  const total = Number(current.total ?? current.totalAmount ?? 0);
  const pointsAlreadyAwarded = Number(current.loyaltyPointsAwarded || current.pointsAwarded || 0);
  const statusHistory = Array.isArray(current.statusHistory) ? current.statusHistory : [];
  const historyEntry = {
    changedBy: "admin",
    fromStatus: previousStatus,
    toStatus: normalizedNewStatus,
    at: Timestamp.now()
  };

  const updateUserPoints = async (delta) => {
    if (!safeClientId || typeof delta !== "number") return;
    try {
      const userRef = doc(db, "users", safeClientId);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        const fallbackClient = matchedClient || getClientByIdentifier(current.clientNumber || current.customerNumber || current.clientId || current.customerId || "");
        if (fallbackClient) {
          await updateDoc(doc(db, "users", fallbackClient.id), { points: increment(delta) });
        }
        return;
      }
      await updateDoc(userRef, { points: increment(delta) });
    } catch (error) {
      console.warn("Mise à jour du client ignorée pendant le changement de statut:", error);
    }
  };

  if (normalizedNewStatus === "CANCELLED") {
    if (pointsAlreadyAwarded > 0) {
      await updateUserPoints(-pointsAlreadyAwarded);
    }
    await updateDoc(orderRef, {
      status: "CANCELLED",
      loyaltyAwarded: false,
      loyaltyPointsAwarded: 0,
      statusHistory: [...statusHistory, historyEntry],
      updatedAt: serverTimestamp()
    });
    toast("Commande annulée, points retirés si nécessaire.", "success");
    return;
  }

  const rewardsAllowed = ["VALIDATED", "PICKED_UP", "RETRIEVED", "COMPLETED"].includes(normalizedNewStatus);
  const shouldRemoveAward = pointsAlreadyAwarded > 0 && !rewardsAllowed;
  if (shouldRemoveAward) {
    await updateUserPoints(-pointsAlreadyAwarded);
  }

  if (rewardsAllowed && settings.loyaltyEnabled === true) {
    const pointsToAdd = (() => {
      const loyaltyType = settings.loyaltyType || "fixed";
      const loyaltyValue = Number(settings.loyaltyValue || 0);
      if (loyaltyType === "percentage") return loyaltyValue > 0 ? Math.floor(total / loyaltyValue) : 0;
      return Number(loyaltyValue || 0);
    })();

    if (pointsToAdd > 0 && (normalizeOrderStatus(current.status || "PENDING") !== normalizedNewStatus || !current.loyaltyAwarded || pointsAlreadyAwarded === 0)) {
      await updateUserPoints(pointsToAdd);
      await updateDoc(orderRef, {
        status: normalizedNewStatus,
        loyaltyAwarded: true,
        loyaltyPointsAwarded: pointsToAdd,
        statusHistory: [...statusHistory, historyEntry],
        updatedAt: serverTimestamp()
      });
      toast(`Points de fidélité attribués : ${pointsToAdd} points`, "success");
      return;
    }
  }

  await updateDoc(orderRef, {
    status: normalizedNewStatus,
    loyaltyAwarded: pointsAlreadyAwarded > 0 && rewardsAllowed ? true : false,
    loyaltyPointsAwarded: pointsAlreadyAwarded > 0 && rewardsAllowed ? pointsAlreadyAwarded : 0,
    statusHistory: [...statusHistory, historyEntry],
    updatedAt: serverTimestamp()
  });
}

async function updateOrderStatus(order, newStatus) {
  await handleStatusChange(order.clientId || order.customerId || null, order.id, newStatus);
}

function openCreateOrderModal() {
  const modal = document.createElement("div");
  modal.className = "orders-modal-backdrop";
  modal.innerHTML = `<div class="orders-modal orders-create-modal" role="dialog" aria-modal="true"><div class="orders-modal-header"><h3>Créer une commande</h3><button class="btn-ghost modal-close" type="button">✕</button></div><form id="create-order-form"><label for="new-order-client">Client</label><select id="new-order-client" required><option value="">Sélectionner un client</option>${clients.map(client => `<option value="${escapeHtml(client.id)}">${escapeHtml(client.nom || client.name || client.phone || client.id)}</option>`).join("")}</select><div id="new-order-items"></div><button id="add-order-item" class="btn btn-ghost" type="button">+ Ajouter un produit</button><div class="new-order-total">Total : <strong id="new-order-total">0 FC</strong></div><div class="orders-modal-actions"><button type="button" class="btn-ghost modal-close">Annuler</button><button class="btn" type="submit">Créer la commande</button></div></form></div>`;
  document.body.appendChild(modal);
  const itemsContainer = modal.querySelector("#new-order-items");
  const addItem = () => {
    const line = document.createElement("div");
    line.className = "new-order-item";
    line.innerHTML = `<select class="new-order-product" required><option value="">Produit</option>${products.map(product => `<option value="${escapeHtml(product.id)}">${escapeHtml(product.name || product.nom || "Produit")} - ${Number(product.price || 0).toLocaleString("fr-FR")} FC</option>`).join("")}</select><input class="new-order-quantity" type="number" min="1" value="1" required /><button class="btn-ghost remove-order-item" type="button">✕</button>`;
    itemsContainer.appendChild(line);
    line.querySelector(".remove-order-item").addEventListener("click", () => { line.remove(); calculateTotal(); });
    line.querySelectorAll("select,input").forEach(element => element.addEventListener("input", calculateTotal));
  };
  const calculateTotal = () => {
    const total = [...itemsContainer.querySelectorAll(".new-order-item")].reduce((sum, line) => { const product = products.find(item => item.id === line.querySelector(".new-order-product").value); return sum + Number(product?.price || 0) * Number(line.querySelector(".new-order-quantity").value || 0); }, 0);
    modal.querySelector("#new-order-total").textContent = `${total.toLocaleString("fr-FR")} FC`;
  };
  addItem();
  modal.querySelector("#add-order-item").addEventListener("click", addItem);
  modal.querySelectorAll(".modal-close").forEach(button => button.addEventListener("click", () => modal.remove()));
  modal.addEventListener("click", event => { if (event.target === modal) modal.remove(); });
  modal.querySelector("#create-order-form").addEventListener("submit", async event => {
    event.preventDefault();
    const clientId = modal.querySelector("#new-order-client").value;
    const items = [...itemsContainer.querySelectorAll(".new-order-item")].map(line => { const product = products.find(item => item.id === line.querySelector(".new-order-product").value); return { productId: product.id, productName: product.name || product.nom || "Produit", price: Number(product.price || 0), quantity: Number(line.querySelector(".new-order-quantity").value || 1) }; });
    if (!clientId || !items.length || items.some(item => !item.productId)) return toast("Sélectionnez un client et au moins un produit.", "error");
    try {
      const orderTotal = items.reduce((sum, item) => sum + calculateItemTotal(item), 0);
      await addDoc(collection(db, "orders"), {
        clientId,
        items,
        total: orderTotal,
        status: platformSettings.orderInitialStatus || "PENDING",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        loyaltyAwarded: false,
        loyaltyPointsAwarded: 0,
        statusHistory: [{
          changedBy: "system",
          fromStatus: "",
          toStatus: platformSettings.orderInitialStatus || "PENDING",
          at: Timestamp.now()
        }]
      });
      modal.remove();
      toast("Commande créée avec succès.", "success");
    } catch (error) { console.error(error); toast("Impossible de créer la commande.", "error"); }
  });
}

async function start() {
  onAuthStateChanged(auth, async user => {
    if (!(await isAllowedAdmin(user))) { window.location.href = "index.html"; return; }
    setLoading(true);
    try {
      await linkExistingOrdersToClients();
      const [userSnapshot, productSnapshot, settingsSnapshot] = await Promise.all([getDocs(collection(db, "users")), getDocs(collection(db, "products")), getDoc(doc(db, "settings", "config"))]);
      const allUsers = userSnapshot.docs.map(item => ({ id: item.id, ...item.data() }));
      clients = allUsers.filter(item => {
        const role = String(item.role || "").trim().toUpperCase();
        return !["ADMIN", "AGENT"].includes(role);
      });
      products = productSnapshot.docs.map(item => ({ id: item.id, ...item.data() }));
      if (settingsSnapshot.exists()) platformSettings = { ...platformSettings, ...settingsSnapshot.data() };

      disposeOrdersListener();
      unsubscribeOrders = onSnapshot(getOrdersQuery(), snapshot => {
        orders = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
        renderOrders();
        setLoading(false);
      }, error => {
        console.error(error);
        setLoading(false);
        toast("Erreur de chargement des commandes.", "error");
      });
    } catch (error) { console.error(error); setLoading(false); toast("Impossible d'initialiser les commandes.", "error"); }
  });

  document.getElementById("orders-search")?.addEventListener("input", renderOrders);
  document.getElementById("orders-filter-status")?.addEventListener("change", () => {
    disposeOrdersListener();
    unsubscribeOrders = onSnapshot(getOrdersQuery(), snapshot => {
      orders = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
      renderOrders();
    }, error => {
      console.error(error);
      toast("Erreur de filtrage des commandes.", "error");
    });
  });
  document.getElementById("orders-toggle-filters")?.addEventListener("click", () => document.querySelector(".orders-page")?.classList.toggle("filters-open"));
  document.getElementById("btn-create-order")?.addEventListener("click", openCreateOrderModal);
  window.addEventListener("beforeunload", disposeOrdersListener);
}
document.addEventListener("DOMContentLoaded", start);
