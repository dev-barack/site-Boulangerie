import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { calculateReducedPrice } from "./calculations.js";
import {
  getFirestore,
  collection,
  getDocs,
  getDoc,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  onSnapshot,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA7YsFC0dtxU09zg8j3q6jv2UHoYQJqTRA",
  authDomain: "boulangerie-dana.firebaseapp.com",
  projectId: "boulangerie-dana",
  storageBucket: "boulangerie-dana.firebasestorage.app",
  messagingSenderId: "508760970095",
  appId: "1:508760970095:web:0be3c6fb78eb5426698e9a"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const PLACEHOLDER_IMAGE = "images/pain3.png";
let products = [];
let offers = [];

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[character]));
}

function showToast(message, type = "info") {
  const element = document.createElement("div");
  element.className = "orders-toast";
  element.dataset.type = type;
  element.textContent = message;
  document.body.appendChild(element);
  setTimeout(() => element.remove(), 3500);
}

function isAllowedAdmin(user) {
  if (!user || !user.email) return false;
  if (window.DanaAdmin?.resolveAdminEmails) {
    return window.DanaAdmin.resolveAdminEmails().then(emails => emails.includes(String(user.email).trim().toLowerCase()));
  }
  return Promise.resolve(String(user.email).trim().toLowerCase() === "devbarack2000@gmail.com");
}

function formatCurrency(value) {
  const number = Number(value || 0);
  return `${Math.round(number).toLocaleString("fr-FR")} FCFA`;
}

function getProductById(productId) {
  return products.find(product => product.id === productId || product.productId === productId) || null;
}

function computeReducedPrice(product, discount) {
  return calculateReducedPrice(product?.price || 0, discount);
}

function renderOffersSummary() {
  const summary = document.getElementById("offers-summary");
  if (!summary) return;
  const active = offers.filter(offer => offer.status === true || offer.status === "true").length;
  const inactive = offers.length - active;
  summary.innerHTML = `
    <div class="offers-summary-grid">
      <div class="panel stat-card">
        <span>Total</span>
        <strong>${offers.length}</strong>
      </div>
      <div class="panel stat-card accent">
        <span>Actives</span>
        <strong>${active}</strong>
      </div>
      <div class="panel stat-card muted">
        <span>Inactives</span>
        <strong>${inactive}</strong>
      </div>
    </div>
  `;
}

function renderOffers() {
  const tbody = document.getElementById("offers-table-body");
  if (!tbody) return;

  const search = (document.getElementById("offers-search")?.value || "").trim().toLowerCase();
  const visibleOffers = offers.filter(offer => {
    const product = getProductById(offer.productId);
    const haystack = `${offer.productName || ""} ${product?.name || ""} ${offer.discount || ""}`.toLowerCase();
    return haystack.includes(search);
  });

  if (!visibleOffers.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Aucune offre trouvée.</td></tr>';
    renderOffersSummary();
    return;
  }

  tbody.innerHTML = visibleOffers.map((offer) => {
    const product = getProductById(offer.productId);
    const productName = offer.productName || product?.name || "Produit";
    const productImage = product?.imageUrl || offer.imageUrl || PLACEHOLDER_IMAGE;
    const statusOn = offer.status === true || offer.status === "true";
    const reducedPrice = Number(offer.price ?? computeReducedPrice(product, offer.discount ?? 0));
    const date = offer.createdAt?.seconds ? new Date(offer.createdAt.seconds * 1000) : new Date();
    return `
      <tr>
        <td>
          <div class="offer-product-name">${escapeHtml(productName)}</div>
          <small class="offer-product-meta">${escapeHtml(product?.category || "Produit")}</small>
        </td>
        <td><img class="offer-product-image" src="${escapeHtml(productImage)}" alt="${escapeHtml(productName)}" onerror="this.onerror=null;this.src='${PLACEHOLDER_IMAGE}';" /></td>
        <td><span class="offer-discount">-${Number(offer.discount || 0).toFixed(0)}%</span></td>
        <td>${escapeHtml(formatCurrency(reducedPrice))}</td>
        <td><span class="status-pill ${statusOn ? "status-active" : "status-inactive"}">${statusOn ? "Actif" : "Inactif"}</span></td>
        <td>${date.toLocaleDateString("fr-FR")}</td>
        <td style="text-align:right;">
          <div class="offers-inline-actions">
            <button class="btn btn-ghost offer-toggle" type="button" data-id="${offer.id}">${statusOn ? "Désactiver" : "Activer"}</button>
            <button class="btn btn-ghost offer-edit" type="button" data-id="${offer.id}">Modifier</button>
            <button class="btn btn-ghost offer-delete" type="button" data-id="${offer.id}">Supprimer</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  tbody.querySelectorAll(".offer-toggle").forEach(button => {
    button.addEventListener("click", () => toggleOfferStatus(button.dataset.id));
  });
  tbody.querySelectorAll(".offer-edit").forEach(button => {
    button.addEventListener("click", () => openOfferModal(offers.find(offer => offer.id === button.dataset.id)));
  });
  tbody.querySelectorAll(".offer-delete").forEach(button => {
    button.addEventListener("click", () => deleteOffer(button.dataset.id));
  });

  renderOffersSummary();
}

function openOfferModal(offer = null) {
  const productOptions = products.map(product => `
    <option value="${product.id}" ${offer && offer.productId === product.id ? "selected" : ""}>${escapeHtml(product.name || "Produit")}</option>
  `).join("") || '<option value="">Aucun produit disponible</option>';

  const selectedProduct = offer ? getProductById(offer.productId) : products[0] || null;
  const defaultDiscount = Number(offer?.discount || 20);
  const defaultPrice = Number(offer?.price ?? computeReducedPrice(selectedProduct, defaultDiscount));

  const backdrop = document.createElement("div");
  backdrop.className = "orders-modal-backdrop";
  backdrop.innerHTML = `
    <div class="orders-modal" role="dialog" aria-modal="true">
      <div class="orders-modal-header">
        <h3>${offer ? "Modifier l'offre" : "Créer une offre"}</h3>
        <button class="btn-ghost modal-close" type="button">✕</button>
      </div>

      <form id="offer-form" class="product-form">
        <label for="offer-product">Produit</label>
        <select id="offer-product" required>
          <option value="">Sélectionner un produit</option>
          ${productOptions}
        </select>

        <label for="offer-discount">Remise (%)</label>
        <input id="offer-discount" type="number" min="0" max="100" step="1" value="${defaultDiscount}" required />

        <label for="offer-price">Prix réduit (FCFA, optionnel)</label>
        <input id="offer-price" type="number" min="0" step="1" value="${defaultPrice}" />

        <label for="offer-status">Statut</label>
        <select id="offer-status">
          <option value="true" ${offer?.status === true || offer?.status === "true" ? "selected" : ""}>Actif</option>
          <option value="false" ${offer?.status === false || offer?.status === "false" ? "selected" : ""}>Inactif</option>
        </select>

        <div class="offer-preview-wrap">
          <label>Image du produit</label>
          <img id="offer-preview-image" class="image-preview" src="${escapeHtml(selectedProduct?.imageUrl || PLACEHOLDER_IMAGE)}" alt="Aperçu produit" onerror="this.onerror=null;this.src='${PLACEHOLDER_IMAGE}';" />
        </div>

        <div class="orders-modal-actions">
          <button type="button" class="btn-ghost modal-close">Annuler</button>
          <button class="btn" type="submit">${offer ? "Enregistrer" : "Créer l'offre"}</button>
        </div>
      </form>
    </div>
  `;

  const productSelect = backdrop.querySelector("#offer-product");
  const discountInput = backdrop.querySelector("#offer-discount");
  const priceInput = backdrop.querySelector("#offer-price");
  const previewImage = backdrop.querySelector("#offer-preview-image");

  const updatePreview = () => {
    const chosenId = productSelect.value;
    const selectedProduct = getProductById(chosenId) || products[0] || null;
    const discountValue = Number(discountInput.value || 0);
    const basePrice = Number(selectedProduct?.price || 0);
    const calculated = basePrice > 0 ? Math.max(0, basePrice * (1 - Math.min(Math.max(discountValue, 0), 100) / 100)) : 0;
    previewImage.src = selectedProduct?.imageUrl || PLACEHOLDER_IMAGE;
    previewImage.onerror = () => {
      previewImage.onerror = null;
      previewImage.src = PLACEHOLDER_IMAGE;
    };
    if (!priceInput.value || Number(priceInput.value) === 0) {
      priceInput.value = String(Math.round(calculated));
    }
  };

  productSelect.addEventListener("change", updatePreview);
  discountInput.addEventListener("input", updatePreview);

  if (offer) {
    productSelect.value = offer.productId || "";
  }

  backdrop.querySelectorAll(".modal-close").forEach(button => button.addEventListener("click", () => backdrop.remove()));
  backdrop.addEventListener("click", event => { if (event.target === backdrop) backdrop.remove(); });

  backdrop.querySelector("#offer-form").addEventListener("submit", async (event) => {
    event.preventDefault();

    const productId = productSelect.value;
    const discount = Number(discountInput.value || 0);
    const status = backdrop.querySelector("#offer-status").value === "true";
    const product = getProductById(productId);

    if (!productId || !product) {
      showToast("Veuillez sélectionner un produit valide.", "error");
      return;
    }

    if (Number.isNaN(discount) || discount < 0 || discount > 100) {
      showToast("La remise doit être comprise entre 0% et 100%.", "error");
      return;
    }

    const offerPayload = {
      productId: product.id,
      productName: product.name,
      discount,
      price: Number(priceInput.value || computeReducedPrice(product, discount)),
      status,
      imageUrl: product.imageUrl || "",
      updatedAt: serverTimestamp(),
      ...(offer ? {} : { createdAt: serverTimestamp() })
    };

    try {
      if (offer) {
        await updateDoc(doc(db, "offers", offer.id), offerPayload);
        showToast("Offre modifiée avec succès.", "success");
      } else {
        await addDoc(collection(db, "offers"), offerPayload);
        showToast("Offre créée avec succès.", "success");
      }
      backdrop.remove();
    } catch (error) {
      console.error(error);
      showToast("Impossible d’enregistrer l’offre.", "error");
    }
  });

  document.body.appendChild(backdrop);
  updatePreview();
}

async function deleteOffer(offerId) {
  const offer = offers.find(item => item.id === offerId);
  if (!offer) return;

  if (!window.confirm(`Supprimer l’offre pour ${offer.productName || "ce produit"} ?`)) return;

  try {
    await deleteDoc(doc(db, "offers", offerId));
    showToast("Offre supprimée.", "success");
  } catch (error) {
    console.error(error);
    showToast("Impossible de supprimer l’offre.", "error");
  }
}

async function toggleOfferStatus(offerId) {
  const offer = offers.find(item => item.id === offerId);
  if (!offer) return;

  try {
    await updateDoc(doc(db, "offers", offerId), {
      status: !(offer.status === true || offer.status === "true"),
      updatedAt: serverTimestamp()
    });
    showToast("Statut de l’offre mis à jour.", "success");
  } catch (error) {
    console.error(error);
    showToast("Impossible de modifier le statut.", "error");
  }
}

async function loadProducts() {
  const snapshot = await getDocs(collection(db, "products"));
  products = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
}

async function initializeOffersPage() {
  const user = auth.currentUser;
  if (!(await isAllowedAdmin(user))) {
    window.location.href = "index.html";
    return;
  }

  const loadingEl = document.getElementById("offers-loading");
  if (loadingEl) loadingEl.style.display = "block";

  try {
    await loadProducts();
    const q = query(collection(db, "offers"), orderBy("createdAt", "desc"));
    onSnapshot(q, (snapshot) => {
      offers = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
      renderOffers();
      if (loadingEl) loadingEl.style.display = "none";
    }, (error) => {
      console.error(error);
      showToast("Erreur de lecture des offres.", "error");
      if (loadingEl) loadingEl.style.display = "none";
    });
  } catch (error) {
    console.error(error);
    showToast("Impossible de charger les offres.", "error");
    if (loadingEl) loadingEl.style.display = "none";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = "index.html";
      return;
    }
    initializeOffersPage();
  });

  const searchInput = document.getElementById("offers-search");
  if (searchInput) {
    searchInput.addEventListener("input", renderOffers);
  }

  const createButton = document.getElementById("btn-create-offer");
  if (createButton) {
    createButton.addEventListener("click", () => openOfferModal());
  }
});
