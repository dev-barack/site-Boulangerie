import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, getDocs, getDoc, onSnapshot, writeBatch, doc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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

let clientsCache = [];

/**
 * The Agent application scans this exact value and looks up users.clientNumber.
 */
export function buildQrPayload(client) {
  if (!client?.clientNumber) throw new Error("Carte client invalide : numéro client manquant.");
  return client.clientNumber;
}

export function createClientNumber(nextNumber, prefix = "DANA-") {
  return `${prefix}${String(nextNumber).padStart(4, "0")}`;
}

export async function ensureClientNumbersForExistingClients(prefix = "DANA-") {
  const allUsers = await getDocs(collection(db, "users"));
  const clientDocs = allUsers.docs.filter(item => String(item.data().role || "").toUpperCase() === "CLIENT");
  const existing = new Set();
  const counts = new Map();
  let nextNumber = 1;
  clientDocs.forEach(item => {
    const value = item.data().clientNumber;
    const match = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}(\\d{4})$`).exec(value || "");
    if (match) {
      counts.set(value, (counts.get(value) || 0) + 1);
      nextNumber = Math.max(nextNumber, Number(match[1]) + 1);
    }
  });

  let batch = writeBatch(db);
  let writes = 0;
  let updated = 0;
  for (const item of clientDocs) {
    const data = item.data();
    if (new RegExp(`^${prefix.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\d{4}$`).test(data.clientNumber || "") && counts.get(data.clientNumber) === 1) {
      existing.add(data.clientNumber);
      continue;
    }
    let clientNumber = createClientNumber(nextNumber++);
    while (existing.has(clientNumber)) clientNumber = createClientNumber(nextNumber++);
    existing.add(clientNumber);
    batch.update(doc(db, "users", item.id), { clientNumber });
    writes += 1;
    updated += 1;
    if (writes === 450) {
      await batch.commit();
      batch = writeBatch(db);
      writes = 0;
    }
  }
  if (writes) await batch.commit();
  return updated;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
  }[character]));
}

function formatPhone(client) {
  return client.phone || (client.email && !client.email.endsWith("@gmail.com") ? client.email : "Non renseigné");
}

function toast(message, type = "info") {
  const element = document.createElement("div");
  element.className = "card";
  element.textContent = message;
  element.style.cssText = `position:fixed;right:18px;bottom:18px;z-index:99999;padding:12px 14px;color:#fff;background:${type === "error" ? "#9f2f25" : "#146c52"};`;
  document.body.appendChild(element);
  setTimeout(() => element.remove(), 4000);
}

function renderCards(clients) {
  const search = (document.getElementById("qr-search")?.value || "").trim().toLowerCase();
  const filtered = clients.filter(client => {
    const text = `${client.nom || client.name || ""} ${client.phone || ""} ${client.clientNumber || ""}`.toLowerCase();
    return !search || text.includes(search);
  });

  const tableBody = document.getElementById("qr-client-table-body");
  if (!tableBody) return;
  tableBody.innerHTML = "";
  if (!filtered.length) {
    tableBody.innerHTML = '<tr><td colspan="4" class="empty-state">Aucun client trouvé.</td></tr>';
    return;
  }

  filtered.forEach(client => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(client.nom || client.name || "Client sans nom")}</td>
      <td class="client-number">${escapeHtml(client.clientNumber || "Numéro manquant")}</td>
      <td>${escapeHtml(formatPhone(client))}</td>
      <td style="text-align:right;"><button class="btn btn-ghost view-card-button" type="button">Voir la carte</button></td>
    `;
    row.querySelector(".view-card-button").addEventListener("click", () => openCardModal(client));
    tableBody.appendChild(row);
  });
}

function openCardModal(client) {
  if (!client.clientNumber) return toast("Carte invalide : numéro client manquant.", "error");
  const modal = document.createElement("div");
  modal.className = "client-card-modal";
  modal.innerHTML = `
    <div class="client-card-modal-dialog" role="dialog" aria-modal="true" aria-label="Carte client">
      <div class="client-card-modal-header">
        <h3>Carte client</h3>
        <button class="btn-ghost modal-close" type="button" aria-label="Fermer">✕</button>
      </div>
      <div id="client-card" class="client-card">
        <div class="client-card-heading">
          <div class="client-card-brand"><img src="images/logo.png" alt="" /><span>Boulangerie DANA</span></div>
          <span class="client-card-mark">CARTE CLIENT</span>
        </div>
        <div class="client-card-body">
          <div class="client-card-details">
            <span class="client-card-label">CLIENT</span>
            <h2>${escapeHtml(client.nom || client.name || "Client sans nom")}</h2>
            <div><span>Identifiant</span><strong>${escapeHtml(client.clientNumber)}</strong></div>
            <div><span>Téléphone</span><strong>${escapeHtml(formatPhone(client))}</strong></div>
          </div>
          <div class="qr-zone" aria-label="QR Code client"><div class="qr-canvas"></div></div>
        </div>
      </div>
      <div class="client-card-modal-actions">
        <button class="btn btn-print" type="button">Imprimer</button>
        <button class="btn btn-pdf" type="button">Exporter PDF</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  const printableCard = modal.querySelector("#client-card");
  const qrNode = modal.querySelector(".qr-canvas");
  new window.QRCode(qrNode, { text: buildQrPayload(client), width: 120, height: 120, correctLevel: window.QRCode.CorrectLevel.M });
  modal.querySelector(".modal-close").addEventListener("click", () => modal.remove());
  modal.addEventListener("click", event => { if (event.target === modal) modal.remove(); });
  modal.querySelector(".btn-print").addEventListener("click", () => printCard(printableCard));
  modal.querySelector(".btn-pdf").addEventListener("click", () => exportPdf(client, qrNode));
}

function printCard(printableCard) {
  if (!printableCard) return toast("Carte client introuvable.", "error");
  printableCard.classList.add("client-card-print-target");
  window.onafterprint = () => printableCard.classList.remove("client-card-print-target");
  window.print();
}

async function exportPdf(client, qrNode) {
  const JsPDF = window.jspdf?.jsPDF;
  const printableCard = qrNode.closest(".client-card");
  if (!JsPDF || !window.html2canvas || !printableCard) return toast("Export PDF indisponible : librairie ou carte absente.", "error");
  try {
    const canvas = await window.html2canvas(printableCard, { scale: 3, useCORS: true, backgroundColor: null });
    const pdf = new JsPDF({ orientation: "landscape", unit: "mm", format: "a6" });
    const width = 130;
    const height = width * 200 / 350;
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", (148 - width) / 2, (105 - height) / 2, width, height);
    pdf.save(`carte-client-${client.clientNumber}.pdf`);
  } catch (error) {
    console.error("Erreur export carte PDF :", error);
    toast("Impossible de générer le PDF de cette carte.", "error");
  }
}

async function start() {
  onAuthStateChanged(auth, async user => {
    if (!(await isAllowedAdmin(user))) {
      window.location.href = "index.html";
      return;
    }
    try {
      const settingsSnapshot = await getDoc(doc(db, "settings", "config"));
      const prefix = settingsSnapshot.exists() ? (settingsSnapshot.data().qrPrefix || "DANA-") : "DANA-";
      const updated = await ensureClientNumbersForExistingClients(prefix);
      if (updated) toast(`${updated} carte(s) QR créée(s) automatiquement.`, "success");
      const snapshot = await getDocs(collection(db, "users"));
      clientsCache = snapshot.docs.filter(item => String(item.data().role || "").toUpperCase() === "CLIENT").map(item => ({ id: item.id, ...item.data() }));
      renderCards(clientsCache);
      onSnapshot(collection(db, "users"), next => {
        clientsCache = next.docs.filter(item => String(item.data().role || "").toUpperCase() === "CLIENT").map(item => ({ id: item.id, ...item.data() }));
        renderCards(clientsCache);
      });
    } catch (error) {
      console.error("Erreur QR clients :", error);
      toast("Impossible de charger ou compléter les cartes QR. Vérifiez les règles Firestore.", "error");
    }
  });
  document.getElementById("qr-search")?.addEventListener("input", () => {
    renderCards(clientsCache);
  });
}

document.addEventListener("DOMContentLoaded", start);
