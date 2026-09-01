import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const config = { apiKey: "AIzaSyA7YsFC0dtxU09zg8j3q6jv2UHoYQJQqTRA", authDomain: "boulangerie-dana.firebaseapp.com", projectId: "boulangerie-dana", storageBucket: "boulangerie-dana.firebasestorage.app", messagingSenderId: "508760970095", appId: "1:508760970095:web:0be3c6fb78eb5426698e9a" };
const app = getApps().length ? getApps()[0] : initializeApp(config);
const auth = getAuth(app);
const db = getFirestore(app);
const DEFAULT_ADMIN_EMAIL = "devbarack2000@gmail.com";

function normalizeAdminEmails(value) {
  const source = Array.isArray(value) ? value : [value];
  return [...new Set(source.flatMap(item => String(item || '').split(/[\n,]+/)).map(item => String(item || '').trim().toLowerCase()).filter(item => item && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item)))];
}

function resolveAdminEmails(data = {}) {
  const emailList = normalizeAdminEmails(data.adminEmails || data.adminEmail || [DEFAULT_ADMIN_EMAIL]);
  return emailList.length ? emailList : [DEFAULT_ADMIN_EMAIL];
}

function getCurrentUserEmail() {
  return String(auth.currentUser?.email || '').trim().toLowerCase();
}

function validateAdminEmails(nextEmails, previousEmails = []) {
  const normalizedNext = normalizeAdminEmails(nextEmails);
  const currentUserEmail = getCurrentUserEmail();

  if (!normalizedNext.length) {
    return "La liste des administrateurs ne peut pas être vide.";
  }

  if (!normalizedNext.includes(currentUserEmail) && previousEmails.includes(currentUserEmail)) {
    const remainingAdmins = previousEmails.filter(email => email !== currentUserEmail);
    if (remainingAdmins.length === 0) {
      return "Vous ne pouvez pas retirer votre propre email si vous êtes le seul administrateur actif.";
    }
  }

  if (normalizedNext.some(email => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return "Un ou plusieurs emails sont invalides. Vérifiez leur format.";
  }

  return null;
}

function toast(message, type = "info") {
  const element = document.createElement("div");
  element.className = "orders-toast";
  element.dataset.type = type;
  element.textContent = message;
  document.body.appendChild(element);
  setTimeout(() => element.remove(), 3500);
}

const defaultSettings = {
  shopName: "Boulangerie DANA",
  shopAddress: "",
  shopPhone: "",
  shopEmail: "",
  shopLogoUrl: "",
  loyaltyEnabled: true,
  loyaltyType: "fixed",
  loyaltyValue: 1,
  stockAlertThreshold: 5,
  orderPickupDelay: 30,
  orderInitialStatus: "PENDING",
  qrPrefix: "DANA-",
  adminScanEnabled: false
};

async function loadSettings() {
  const snapshot = await getDoc(doc(db, "settings", "config"));
  const values = { ...defaultSettings, ...(snapshot.exists() ? snapshot.data() : {}) };
  document.getElementById("shop-name").value = values.shopName;
  document.getElementById("shop-address").value = values.shopAddress;
  document.getElementById("shop-phone").value = values.shopPhone;
  document.getElementById("shop-email").value = values.shopEmail;
  document.getElementById("shop-logo-url").value = values.shopLogoUrl;
  document.getElementById("admin-emails").value = resolveAdminEmails(values).join(', ');
  document.getElementById("loyalty-enabled").value = String(values.loyaltyEnabled !== false);
  document.getElementById("loyalty-type").value = values.loyaltyType === "percentage" ? "percentage" : "fixed";
  document.getElementById("loyalty-value").value = Number(values.loyaltyValue || 0);
  document.getElementById("stock-alert-threshold").value = Number(values.stockAlertThreshold ?? 5);
  document.getElementById("order-pickup-delay").value = Number(values.orderPickupDelay ?? 30);
  document.getElementById("order-initial-status").value = values.orderInitialStatus || "PENDING";
  document.getElementById("qr-prefix").value = values.qrPrefix || "DANA-";
  document.getElementById("admin-scan-enabled").value = String(values.adminScanEnabled === true);
}

function readSettings() {
  const number = id => Number(document.getElementById(id).value);
  return {
    shopName: document.getElementById("shop-name").value.trim(),
    shopAddress: document.getElementById("shop-address").value.trim(),
    shopPhone: document.getElementById("shop-phone").value.trim(),
    shopEmail: document.getElementById("shop-email").value.trim(),
    shopLogoUrl: document.getElementById("shop-logo-url").value.trim(),
    adminEmails: normalizeAdminEmails(document.getElementById("admin-emails").value),
    loyaltyEnabled: document.getElementById("loyalty-enabled").value === "true",
    loyaltyType: document.getElementById("loyalty-type").value,
    loyaltyValue: number("loyalty-value"),
    stockAlertThreshold: number("stock-alert-threshold"),
    orderPickupDelay: number("order-pickup-delay"),
    orderInitialStatus: document.getElementById("order-initial-status").value,
    qrPrefix: document.getElementById("qr-prefix").value.trim(),
    adminScanEnabled: document.getElementById("admin-scan-enabled").value === "true"
  };
}

async function start() {
  onAuthStateChanged(auth, async user => {
    if (!user) {
      window.location.href = "index.html";
      return;
    }

    try {
      const settingsSnap = await getDoc(doc(db, "settings", "config"));
      const settingsData = settingsSnap.exists() ? settingsSnap.data() : {};
      const allowedAdminEmails = resolveAdminEmails(settingsData);
      const currentUserEmail = getCurrentUserEmail();

      if (!allowedAdminEmails.includes(currentUserEmail)) {
        window.location.href = "index.html";
        return;
      }

      await loadSettings();

      document.querySelectorAll("[data-setting-section]").forEach(form => form.addEventListener("submit", async event => {
        event.preventDefault();
        const values = readSettings();

        const validationError = validateAdminEmails(values.adminEmails, allowedAdminEmails);
        if (validationError) {
          toast(validationError, "error");
          return;
        }

        if (![values.loyaltyValue, values.stockAlertThreshold, values.orderPickupDelay].every(value => Number.isFinite(value) && value >= 0)) return toast("Une valeur numérique est invalide.", "error");
        if (!values.qrPrefix) return toast("Le préfixe QR est obligatoire.", "error");

        try {
          await setDoc(doc(db, "settings", "config"), { ...values, updatedAt: serverTimestamp() }, { merge: true });
          toast("Paramètres enregistrés.", "success");
        } catch (error) { console.error(error); toast("Impossible d'enregistrer les paramètres.", "error"); }
      }));
    } catch (error) { console.error(error); toast("Impossible de charger les paramètres.", "error"); }
  });
}
document.addEventListener("DOMContentLoaded", start);
