import { getApps } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, getDocs, getDoc, updateDoc, addDoc, doc, query, where, serverTimestamp, runTransaction, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const app = getApps()[0];
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

let scanner;
let scannerModal;
let currentClient;
let currentClientId = null;
let products = [];
const activeListeners = [];
window.addEventListener("beforeunload", closeListeners);

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

function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[character])); }
function toast(message, type = "info") { const element = document.createElement("div"); element.className = "orders-toast"; element.dataset.type = type; element.textContent = message; document.body.appendChild(element); setTimeout(() => element.remove(), 4000); }
function registerListener(unsubscribe) {
  if (typeof unsubscribe === "function") activeListeners.push(unsubscribe);
  return unsubscribe;
}
function closeListeners() {
  while (activeListeners.length) {
    const unsubscribe = activeListeners.pop();
    try {
      if (typeof unsubscribe === "function") unsubscribe();
    } catch (error) {
      console.warn("Nettoyage listener Firestore :", error);
    }
  }
}
async function stopScanner() {
  const active = scanner;
  scanner = null;
  if (!active) return;
  try {
    if (typeof active.stop === "function") await Promise.resolve(active.stop());
  } catch (error) {
    console.warn("Arrêt caméra :", error);
  }
  try {
    if (typeof active.clear === "function") await Promise.resolve(active.clear());
  } catch (error) {
    console.warn("Nettoyage caméra :", error);
  }
}
function decodedClientNumber(value) { try { const parsed = JSON.parse(value); return parsed.clientNumber || parsed.qrCodeId || parsed.clientId || value; } catch { return String(value || "").trim(); } }
function orderTotal(order) { return Number(order.total ?? order.totalAmount ?? 0); }
function normalizeOrderStatus(status) {
  const key = String(status || "PENDING").trim().toUpperCase();
  if (key === "RETRIEVED" || key === "PICKED_UP") return "RETRIEVED";
  if (key === "CANCELLED") return "CANCELLED";
  if (key === "READY") return "READY";
  if (key === "PENDING") return "PENDING";
  if (key === "VALIDATED") return "VALIDATED";
  if (key === "COMPLETED") return "COMPLETED";
  if (key === "IN_PROGRESS") return "IN_PROGRESS";
  return key;
}
function formatOrderStatus(status) {
  return ORDER_STATUS_LABELS[normalizeOrderStatus(status)] || String(status || "En attente");
}
function clientOrders(client, orders) {
  const clientId = getClientIdentifier(client);
  return orders.filter(order => {
    const matchClientId = order.clientId === clientId || order.clientId === client?.uid;
    const matchClientNumber = order.clientNumber === client?.clientNumber || order.clientNumber === client?.clientNumber;
    const matchPhone = order.phone === client?.phone || order.telephone === client?.telephone || order.telephone === client?.phone;
    return matchClientId || matchClientNumber || matchPhone;
  });
}
function getClientIdentifier(client) { return String(client?.id || client?.uid || currentClientId || client?.clientNumber || client?.telephone || client?.phone || "").trim(); }

async function loadLibrary() {
  if (window.Html5Qrcode) return window.Html5Qrcode;
  await new Promise((resolve, reject) => { const script = document.createElement("script"); script.src = "https://unpkg.com/html5-qrcode"; script.onload = resolve; script.onerror = () => reject(new Error("Librairie caméra indisponible")); document.head.appendChild(script); });
  return window.Html5Qrcode;
}

function addScannerButton() {
  if (document.getElementById("admin-scan-button")) return;
  const header = document.querySelector(".app-header");
  if (!header) return;
  const profile = document.getElementById("profile-bubble");
  const button = document.createElement("button");
  button.id = "admin-scan-button";
  button.className = "btn admin-scan-button";
  button.type = "button";
  button.textContent = "📷 Scanner un client";
  if (profile?.parentElement) profile.parentElement.insertBefore(button, profile); else header.appendChild(button);
  button.addEventListener("click", openScannerModal);
}

function openScannerModal() {
  scannerModal = document.createElement("div");
  scannerModal.className = "scanner-modal-backdrop";
  scannerModal.innerHTML = `<div class="scanner-modal" role="dialog" aria-modal="true" aria-label="Scanner un client"><div class="orders-modal-header"><h3>Scanner un client</h3><button class="btn-ghost scanner-close" type="button">✕</button></div><div id="qr-reader" class="qr-reader"></div><p class="scanner-status">Autorisez l’accès à la caméra pour scanner la carte client.</p></div>`;
  document.body.appendChild(scannerModal);
  scannerModal.querySelector(".scanner-close").addEventListener("click", closeScannerModal);
  scannerModal.addEventListener("click", event => { if (event.target === scannerModal) closeScannerModal(); });
  startScanner();
}

async function startScanner() {
  const status = scannerModal.querySelector(".scanner-status");
  try {
    const Html5Qrcode = await loadLibrary();
    scanner = new Html5Qrcode("qr-reader");
    await scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 220, height: 220 } }, async decoded => {
      await stopScanner();
      await closeScannerModal();
      await identifyClient(decodedClientNumber(decoded));
    }, () => {});
  } catch (error) {
    console.error(error);
    if (status) status.textContent = "Caméra inaccessible. Vérifiez les permissions du navigateur ou utilisez un QR valide.";
    toast("Impossible d’ouvrir la caméra.", "error");
  }
}
async function closeScannerModal() { await stopScanner(); if (scannerModal) { scannerModal.remove(); scannerModal = null; } }

async function identifyClient(clientNumber) {
  try {
    closeListeners();
    const [usersByClientNumber, usersByPhone, usersByTelephone, productsSnapshot] = await Promise.all([
      getDocs(query(collection(db, "users"), where("clientNumber", "==", clientNumber))),
      getDocs(query(collection(db, "users"), where("phone", "==", clientNumber))),
      getDocs(query(collection(db, "users"), where("telephone", "==", clientNumber))),
      getDocs(collection(db, "products"))
    ]);

    const clientDoc = usersByClientNumber.docs[0] || usersByPhone.docs[0] || usersByTelephone.docs[0] || null;
    currentClient = clientDoc ? { id: clientDoc.id, ...clientDoc.data() } : null;
    currentClientId = getClientIdentifier(currentClient);

    if (!currentClient) {
      toast("QR Code invalide ou client introuvable", "error");
      return;
    }

    products = productsSnapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    await ensureCryptoJS();
    openPinVerification(currentClient);
  } catch (error) {
    console.error(error);
    toast(error.message === "ORDER_UPDATE_FAILED" ? "Impossible de mettre à jour les commandes." : "QR Code invalide ou client introuvable", "error");
  }
}

async function ensureCryptoJS() {
  if (window.CryptoJS) return;
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Librairie CryptoJS indisponible"));
    document.head.appendChild(script);
  });
}

function openPinVerification(client) {
  const modal = document.createElement("div");
  modal.className = "scanner-modal-backdrop";
  modal.innerHTML = `
    <div class="scanner-modal" role="dialog" aria-modal="true">
      <div class="orders-modal-header">
        <h3>Vérification du PIN</h3>
        <button class="btn-ghost pin-close" type="button">✕</button>
      </div>
      <div class="scanned-profile" style="margin: 12px 0;">
        <strong>${escapeHtml(client.nom || client.name || "Client")}</strong>
        <span>${escapeHtml(client.phone || "Téléphone non renseigné")}</span>
      </div>
      <div class="user-modal-field" style="margin-top: 8px;">
        <label>Code PIN client</label>
        <input id="scan-client-pin" type="password" maxlength="6" inputmode="numeric" placeholder="123456" autocomplete="off" />
      </div>
      <div class="orders-modal-actions" style="margin-top: 16px;">
        <button type="button" class="btn-ghost pin-close">Annuler</button>
        <button type="button" class="btn pin-confirm">Vérifier</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  modal.querySelector(".pin-close")?.addEventListener("click", () => modal.remove());

  const confirmButton = modal.querySelector(".pin-confirm");
  const input = modal.querySelector("#scan-client-pin");

  confirmButton?.addEventListener("click", () => {
    const inputPin = String(input?.value ?? "").trim();

    if (!/^\d{6}$/.test(inputPin)) {
      toast("Le PIN doit contenir exactement 6 chiffres.", "error");
      return;
    }

    if (!client.pin_hash) {
      toast("PIN du client introuvable. Accès refusé.", "error");
      return;
    }

    const hashedInput = CryptoJS.SHA256(inputPin).toString();
    const valid = (hashedInput === client.pin_hash);

    if (!valid) {
      toast("PIN incorrect. Accès refusé.", "error");
      return;
    }

    modal.remove();
    openClientResult(client);
  });
}

function renderClientOrders(orders) {
  if (!orders.length) return '<p class="empty-state">Aucune commande pour ce client.</p>';

  return orders.map(order => {
    const normalizedStatus = normalizeOrderStatus(order.status);
    const statusLabel = formatOrderStatus(normalizedStatus);
    const amount = Number(order.total ?? order.totalAmount ?? 0);
    const dateValue = order.createdAt && typeof order.createdAt.toDate === "function" ? order.createdAt.toDate() : (order.createdAt ? new Date(order.createdAt) : null);
    const dateLabel = dateValue && !Number.isNaN(dateValue.getTime())
      ? dateValue.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
      : "Date inconnue";

    const productsHtml = Array.isArray(order.items) && order.items.length
      ? `<ul class="scanner-order-products">${order.items.map(item => `<li>${escapeHtml(item.productName || item.name || "Produit")} × ${Number(item.quantity || 0)}</li>`).join("")}</ul>`
      : '<span class="empty-state">Aucun produit</span>';

    const action = normalizedStatus === "PENDING"
      ? `<button class="btn btn-ghost scanned-status-button" data-order-id="${escapeHtml(String(order.id || ""))}" data-status="READY" type="button">Passer à Prête</button>`
      : normalizedStatus === "READY"
        ? `<button class="btn btn-ghost scanned-status-button" data-order-id="${escapeHtml(String(order.id || ""))}" data-status="PICKED_UP" type="button">Confirmer le Retrait</button>`
        : "";

    const badgeClass = normalizedStatus === "PENDING" ? "status-pending" : normalizedStatus === "READY" ? "status-ready" : normalizedStatus === "PICKED_UP" ? "status-retrieved" : "status-cancelled";

    return `
      <div class="scanned-order">
        <div class="scanned-order-header">
          <strong>#${escapeHtml(String(order.id || "").slice(0, 10))}</strong>
          <span class="status-badge ${badgeClass}">${escapeHtml(statusLabel)}</span>
        </div>
        <small>${escapeHtml(dateLabel)}</small>
        <strong>${amount.toLocaleString("fr-FR")} FC</strong>
        ${productsHtml}
        ${action}
      </div>
    `;
  }).join("");
}

function filterOrdersForClient(orders, client) {
  const clientId = getClientIdentifier(client);
  const clientNumber = client?.clientNumber || client?.phone || client?.telephone || "";
  const uidCandidates = [clientId, client?.id, client?.uid, client?.clientId, client?.userId].filter(Boolean);
  const clientNumberCandidates = [clientNumber, client?.customerNumber, client?.clientNumber].filter(Boolean);
  return orders.filter(order => {
    const orderClientId = order.clientId || "";
    const orderClientNumber = order.clientNumber || order.customerNumber || "";
    const orderPhone = order.phone || order.telephone || "";
    const orderUid = order.uid || order.customerUid || "";
    return (
      uidCandidates.includes(orderClientId) ||
      uidCandidates.includes(orderUid) ||
      clientNumberCandidates.includes(orderClientNumber) ||
      clientNumberCandidates.includes(orderClientId) ||
      orderPhone === (client?.phone || client?.telephone || "") ||
      orderClientNumber === clientNumber ||
      orderClientId === clientNumber
    );
  });
}

function openClientResult(client) {
  const modal = document.createElement("div");
  modal.className = "scanner-modal-backdrop client-result-backdrop";
  modal.innerHTML = `
    <div class="scanner-modal client-result-modal" role="dialog" aria-modal="true">
      <div class="orders-modal-header">
        <h3>Client trouvé</h3>
        <button class="btn-ghost result-close" type="button">✕</button>
      </div>

      <div class="scanned-profile">
        <strong>${escapeHtml(client.nom || client.name || "Client")}</strong>
        <span>${escapeHtml(client.phone || client.telephone || "Téléphone non renseigné")}</span>
        <span>${escapeHtml(client.clientNumber || client.id || "DANA-0000")}</span>
      </div>

      <div class="client-stats-grid">
        <div class="client-stat-box">
          <span>Points</span>
          <strong id="client-points-value">0</strong>
        </div>
        <div class="client-stat-box">
          <span>Commandes en attente</span>
          <strong id="client-pending-count">0</strong>
        </div>
      </div>

      <div class="client-section">
        <h4>Commandes en attente / à traiter</h4>
        <div class="scanned-orders scanned-orders-pending">Chargement des commandes...</div>
      </div>

      <div class="client-section">
        <h4>Historique</h4>
        <div class="scanned-orders scanned-orders-history">Chargement des commandes...</div>
      </div>

      <button class="btn create-scanned-order" type="button">Créer une commande</button>
    </div>
  `;

  document.body.appendChild(modal);

  const pendingNode = modal.querySelector(".scanned-orders-pending");
  const historyNode = modal.querySelector(".scanned-orders-history");
  const pointsNode = modal.querySelector("#client-points-value");
  const pendingCountNode = modal.querySelector("#client-pending-count");
  const clientId = getClientIdentifier(client) || currentClientId || client.id || client.uid;

  const renderOrders = (orders) => {
    const pendingOrders = orders.filter(order => {
      const status = normalizeOrderStatus(order.status);
      return status === "PENDING" || status === "READY" || status === "VALIDATED" || status === "IN_PROGRESS";
    });
    const historyOrders = orders.filter(order => {
      const status = normalizeOrderStatus(order.status);
      return status === "PICKED_UP" || status === "RETRIEVED" || status === "CANCELLED" || status === "COMPLETED";
    });

    const pointsValue = Number(client.loyaltyPoints ?? client.points ?? 0);
    pointsNode.textContent = String(pointsValue);
    pendingCountNode.textContent = String(pendingOrders.length);
    pendingNode.innerHTML = renderClientOrders(pendingOrders);
    historyNode.innerHTML = renderClientOrders(historyOrders);

    modal.querySelectorAll(".scanned-status-button").forEach(button => {
      button.addEventListener("click", async () => {
        const orderId = button.dataset.orderId;
        const nextStatus = button.dataset.status;
        try {
          await handleStatusChange(client.id || client.uid || currentClientId, orderId, nextStatus);
          toast(nextStatus === "PICKED_UP" ? "Retrait confirmé et points mis à jour." : "Commande passée à Prête.", "success");
        } catch (error) {
          console.error(error);
          toast("Impossible de traiter la commande.", "error");
        }
      });
    });
  };

  const loadClientOrders = async () => {
    try {
      const clientNumberValues = [client.clientNumber, client.customerNumber].filter(Boolean);
      const uidValues = [clientId, client.uid, client.id, client.userId].filter(Boolean);
      const queries = [
        ...uidValues.map(value => getDocs(query(collection(db, "orders"), where("clientId", "==", value)))),
        ...clientNumberValues.map(value => getDocs(query(collection(db, "orders"), where("clientId", "==", value)))),
        ...clientNumberValues.map(value => getDocs(query(collection(db, "orders"), where("clientNumber", "==", value)))),
        ...clientNumberValues.map(value => getDocs(query(collection(db, "orders"), where("customerNumber", "==", value)))),
        ...(client.phone || client.telephone ? [getDocs(query(collection(db, "orders"), where("phone", "==", client.phone || client.telephone)))] : []),
        ...(client.phone || client.telephone ? [getDocs(query(collection(db, "orders"), where("telephone", "==", client.phone || client.telephone)))] : [])
      ];

      const snapshots = await Promise.all(queries);
      const merged = new Map();
      snapshots.forEach(snapshot => {
        snapshot.docs.forEach(docSnap => merged.set(docSnap.id, { id: docSnap.id, ...docSnap.data() }));
      });

      const filtered = filterOrdersForClient(Array.from(merged.values()), client);
      renderOrders(filtered);
    } catch (error) {
      console.error(error);
      pendingNode.innerHTML = '<p class="empty-state">Impossible de charger les commandes.</p>';
      historyNode.innerHTML = '<p class="empty-state">Impossible de charger les commandes.</p>';
      toast("Impossible de charger les commandes du client.", "error");
    }
  };

  const closeCurrentModal = () => {
    closeListeners();
    modal.remove();
  };

  modal.querySelector(".result-close").addEventListener("click", closeCurrentModal);
  modal.addEventListener("click", event => { if (event.target === modal) closeCurrentModal(); });

  modal.querySelector(".create-scanned-order")?.addEventListener("click", async () => {
    closeCurrentModal();
    await openCreateOrder(client);
  });

  registerListener(onSnapshot(collection(db, "orders"), snapshot => {
    const filtered = filterOrdersForClient(snapshot.docs.map(item => ({ id: item.id, ...item.data() })), client);
    renderOrders(filtered);
  }, error => {
    console.error(error);
    pendingNode.innerHTML = '<p class="empty-state">Impossible de suivre les commandes.</p>';
    historyNode.innerHTML = '<p class="empty-state">Impossible de suivre les commandes.</p>';
    toast("Impossible de suivre les commandes du client.", "error");
  }));

  loadClientOrders();
}

async function handleStatusChange(clientId, orderId, newStatus) {
  if (!orderId) throw new Error("Commande introuvable");

  const safeClientId = typeof clientId === "string" && clientId.trim() ? clientId.trim() : null;
  const orderRef = doc(db, "orders", orderId);
  const orderSnap = await getDoc(orderRef);
  if (!orderSnap.exists()) throw new Error("Commande introuvable");

  const current = orderSnap.data();
  const previousStatus = normalizeOrderStatus(current.status || "PENDING");
  const normalizedNewStatus = normalizeOrderStatus(newStatus);
  const settingsSnap = await getDoc(doc(db, "settings", "config"));
  const settings = settingsSnap.exists() ? settingsSnap.data() : { loyaltyEnabled: false };
  const total = Number(current.total ?? current.totalAmount ?? 0);
  const pointsAlreadyAwarded = Number(current.loyaltyPointsAwarded || current.pointsAwarded || 0);
  const statusHistory = Array.isArray(current.statusHistory) ? current.statusHistory : [];
  const historyEntry = { changedBy: "admin", fromStatus: previousStatus, toStatus: normalizedNewStatus, at: serverTimestamp() };

  const updateUserPoints = async (delta) => {
    if (!safeClientId || typeof delta !== "number") return;
    try {
      await updateDoc(doc(db, "users", safeClientId), { points: increment(delta) });
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

  const rewardsAllowed = ["VALIDATED", "PICKED_UP", "RETRIEVED"].includes(normalizedNewStatus);
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

    if (pointsToAdd > 0 && (!current.loyaltyAwarded || pointsAlreadyAwarded === 0)) {
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

async function updateOrderStatus(orderId, newStatus) {
  return handleStatusChange(currentClientId || currentClient?.id || null, orderId, newStatus);
}

function openCreateOrder(client) {
  const modal = document.createElement("div"); modal.className = "scanner-modal-backdrop"; modal.innerHTML = `<div class="scanner-modal" role="dialog" aria-modal="true"><div class="orders-modal-header"><h3>Nouvelle commande · ${escapeHtml(client.nom || client.name || "Client")}</h3><button class="btn-ghost create-close" type="button">✕</button></div><form class="scanned-create-form"><div id="scanned-order-items"></div><button type="button" class="btn btn-ghost add-scanned-item">+ Ajouter un produit</button><strong class="scanned-total">Total : <span>0 FC</span></strong><div class="orders-modal-actions"><button type="button" class="btn-ghost create-close">Annuler</button><button class="btn" type="submit">Créer</button></div></form></div>`;
  document.body.appendChild(modal); const container = modal.querySelector("#scanned-order-items"); const add = () => { const line = document.createElement("div"); line.className = "new-order-item"; line.innerHTML = `<select required><option value="">Produit</option>${products.filter(product => product.isAvailable !== false && Number(product.stock || 0) > 0).map(product => `<option value="${escapeHtml(product.id)}">${escapeHtml(product.name || "Produit")} · ${Number(product.price || 0)} FC</option>`).join("")}</select><input type="number" min="1" value="1" required />`; container.appendChild(line); line.querySelectorAll("select,input").forEach(element => element.addEventListener("input", calculate)); }; const calculate = () => { const total = [...container.children].reduce((sum, line) => { const product = products.find(item => item.id === line.querySelector("select").value); return sum + Number(product?.price || 0) * Number(line.querySelector("input").value || 0); }, 0); modal.querySelector(".scanned-total span").textContent = `${total.toLocaleString("fr-FR")} FC`; }; add(); modal.querySelector(".add-scanned-item").addEventListener("click", add); modal.querySelectorAll(".create-close").forEach(button => button.addEventListener("click", () => modal.remove())); modal.querySelector(".scanned-create-form").addEventListener("submit", async event => { event.preventDefault(); const items = [...container.children].map(line => { const product = products.find(item => item.id === line.querySelector("select").value); return { productId: product.id, productName: product.name, price: Number(product.price || 0), quantity: Number(line.querySelector("input").value || 1) }; }); if (items.some(item => !item.productId)) return toast("Sélectionnez un produit.", "error"); try { await addDoc(collection(db, "orders"), { clientId: client.id, items, total: items.reduce((sum, item) => sum + item.price * item.quantity, 0), status: "PENDING", createdAt: serverTimestamp(), loyaltyAwarded: false }); modal.remove(); toast("Commande créée.", "success"); } catch (error) { console.error(error); toast("Impossible de créer la commande.", "error"); } });
}

async function start() {
  onAuthStateChanged(auth, async user => {
    if (!(await isAllowedAdmin(user))) return;
    try { const snapshot = await getDoc(doc(db, "settings", "config")); if (snapshot.exists() && snapshot.data().adminScanEnabled === true) addScannerButton(); } catch (error) { console.error("Configuration scanner indisponible :", error); }
  });
}
start();
