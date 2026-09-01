import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, getDocs, getDoc, onSnapshot, setDoc, updateDoc, deleteDoc, doc, serverTimestamp, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = { apiKey: "AIzaSyA7YsFC0dtxU09zg8j3q6jv2UHoYQJQqTRA", authDomain: "boulangerie-dana.firebaseapp.com", projectId: "boulangerie-dana", storageBucket: "boulangerie-dana.firebasestorage.app", messagingSenderId: "508760970095", appId: "1:508760970095:web:0be3c6fb78eb5426698e9a" };
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

let products = [];
let stockAlertThreshold = 5;
const PLACEHOLDER_IMAGE = "images/pain3.png";

function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[character])); }
function toast(message, type = "info") { const element = document.createElement("div"); element.className = "orders-toast"; element.dataset.type = type; element.textContent = message; document.body.appendChild(element); setTimeout(() => element.remove(), 3500); }
function setLoading(value) { const element = document.getElementById("products-loading"); if (element) element.style.display = value ? "block" : "none"; }
function isAvailable(product) { return product.isAvailable !== false && Number(product.stock || 0) > 0; }

async function ensureProductSchema() {
  const snapshot = await getDocs(collection(db, "products"));
  const batch = writeBatch(db);
  let changes = 0;
  snapshot.docs.forEach(item => {
    const data = item.data();
    const patch = {};
    if (!data.productId) patch.productId = item.id;
    if (typeof data.description !== "string") patch.description = "";
    if (typeof data.isAvailable !== "boolean") patch.isAvailable = Number(data.stock || 0) > 0;
    if (Object.keys(patch).length) { batch.update(doc(db, "products", item.id), patch); changes += 1; }
  });
  if (changes) await batch.commit();
  return changes;
}

function renderProducts() {
  const tbody = document.getElementById("products-table-body");
  if (!tbody) return;
  const search = (document.getElementById("products-search")?.value || "").trim().toLowerCase();
  const visible = products.filter(product => `${product.name || ""} ${product.category || ""}`.toLowerCase().includes(search));
  tbody.innerHTML = "";
  if (!visible.length) { tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Aucun produit trouvé.</td></tr>'; return; }
  visible.forEach(product => {
    const stock = Number(product.stock || 0);
    const available = isAvailable(product);
    const lowStock = stock < stockAlertThreshold;
    const row = document.createElement("tr");
    row.innerHTML = `
      <td><img class="product-table-preview" src="${escapeHtml(product.imageUrl || PLACEHOLDER_IMAGE)}" alt="${escapeHtml(product.name || "Produit")}" onerror="this.onerror=null;this.src='${PLACEHOLDER_IMAGE}';" /></td>
      <td><strong>${escapeHtml(product.name || "Produit sans nom")}</strong><small class="product-description">${escapeHtml(product.category || "Divers")}</small></td>
      <td>${Number(product.price || 0).toLocaleString("fr-FR")} FC</td>
      <td><span class="stock-value ${lowStock ? "stock-low" : ""}">${stock}</span>${lowStock ? '<span class="stock-alert">Stock faible</span>' : ""}</td>
      <td><button class="availability-toggle ${available ? "is-on" : "is-off"}" type="button" aria-label="Basculer disponibilité">${available ? "Disponible" : "Indisponible"}</button></td>
      <td style="text-align:right"><button class="btn btn-ghost product-edit" type="button">Modifier</button><button class="btn btn-ghost product-delete" type="button">Supprimer</button></td>
    `;
    row.querySelector(".availability-toggle").addEventListener("click", () => toggleAvailability(product));
    row.querySelector(".product-edit").addEventListener("click", () => openProductModal(product));
    row.querySelector(".product-delete").addEventListener("click", () => removeProduct(product));
    tbody.appendChild(row);
  });
}

function openProductModal(product = null) {
  const modal = document.createElement("div");
  modal.className = "orders-modal-backdrop";
  modal.innerHTML = `<div class="orders-modal" role="dialog" aria-modal="true"><div class="orders-modal-header"><h3>${product ? "Modifier le produit" : "Ajouter un produit"}</h3><button class="btn-ghost modal-close" type="button">✕</button></div><form id="product-form" class="product-form"><label for="product-name">Nom</label><input id="product-name" required value="${escapeHtml(product?.name)}" /><label for="product-category">Catégorie</label><input id="product-category" required value="${escapeHtml(product?.category)}" placeholder="Pain, Viennoiserie..." /><label for="product-description">Description</label><textarea id="product-description" rows="3">${escapeHtml(product?.description)}</textarea><label for="product-price">Prix (FCFA)</label><input id="product-price" type="number" min="0" required value="${Number(product?.price || 0)}" /><label for="product-stock">Stock</label><input id="product-stock" type="number" min="0" required value="${Number(product?.stock || 0)}" /><label class="availability-field"><input id="product-available" type="checkbox" ${product?.isAvailable !== false ? "checked" : ""} /> Disponible pour l’application mobile</label><label for="product-image">Lien de l’image</label><input id="product-image" type="url" value="${escapeHtml(product?.imageUrl)}" placeholder="https://..." /><img id="product-image-preview" class="image-preview" src="${escapeHtml(product?.imageUrl || PLACEHOLDER_IMAGE)}" alt="Aperçu du produit" /><div class="orders-modal-actions"><button type="button" class="btn-ghost modal-close">Annuler</button><button class="btn" type="submit">${product ? "Enregistrer" : "Créer"}</button></div></form></div>`;
  document.body.appendChild(modal);
  const imageInput = modal.querySelector("#product-image");
  const imagePreview = modal.querySelector("#product-image-preview");
  const updateImagePreview = () => {
    const value = imageInput.value.trim();
    try {
      const url = new URL(value);
      if (!/^https?:$/.test(url.protocol)) throw new Error("URL image invalide");
      imagePreview.onerror = () => {
        imagePreview.onerror = null;
        imagePreview.src = PLACEHOLDER_IMAGE;
      };
      imagePreview.src = url.href;
    } catch {
      imagePreview.onerror = null;
      imagePreview.src = PLACEHOLDER_IMAGE;
    }
  };
  imageInput.addEventListener("input", updateImagePreview);
  imagePreview.onerror = () => {
    imagePreview.onerror = null;
    imagePreview.src = PLACEHOLDER_IMAGE;
  };
  modal.querySelectorAll(".modal-close").forEach(button => button.addEventListener("click", () => modal.remove()));
  modal.addEventListener("click", event => { if (event.target === modal) modal.remove(); });
  modal.querySelector("#product-form").addEventListener("submit", async event => {
    event.preventDefault();
    const productId = product?.id || doc(collection(db, "products")).id;
    const payload = { productId, name: modal.querySelector("#product-name").value.trim(), category: modal.querySelector("#product-category").value.trim(), description: modal.querySelector("#product-description").value.trim(), price: Number(modal.querySelector("#product-price").value || 0), stock: Number(modal.querySelector("#product-stock").value || 0), isAvailable: modal.querySelector("#product-available").checked, imageUrl: modal.querySelector("#product-image").value.trim() || "", ...(product ? {} : { createdAt: serverTimestamp() }) };
    try { await setDoc(doc(db, "products", productId), payload, { merge: Boolean(product) }); modal.remove(); toast(product ? "Produit mis à jour." : "Produit créé.", "success"); }
    catch (error) { console.error(error); toast("Impossible d’enregistrer le produit.", "error"); }
  });
}

async function toggleAvailability(product) {
  try { await updateDoc(doc(db, "products", product.id), { isAvailable: !isAvailable(product) }); toast("Disponibilité mise à jour.", "success"); }
  catch (error) { console.error(error); toast("Impossible de modifier la disponibilité.", "error"); }
}

async function removeProduct(product) {
  try {
    const orderSnapshot = await getDocs(collection(db, "orders"));
    const sold = orderSnapshot.docs.some(order => (order.data().items || []).some(item => item.productId === product.id || item.productId === product.productId));
    if (sold) {
      if (window.confirm("Ce produit a déjà été vendu. Le rendre indisponible ?")) await updateDoc(doc(db, "products", product.id), { isAvailable: false });
      toast("Suppression physique bloquée : produit déjà vendu.", "info");
      return;
    }
    if (!window.confirm("Supprimer définitivement ce produit ?")) return;
    await deleteDoc(doc(db, "products", product.id));
    toast("Produit supprimé.", "success");
  } catch (error) { console.error(error); toast("Impossible de vérifier ou supprimer le produit.", "error"); }
}

async function start() {
  onAuthStateChanged(auth, async user => {
    if (!(await isAllowedAdmin(user))) { window.location.href = "index.html"; return; }
    setLoading(true);
    try {
      await ensureProductSchema();
      const settingsSnapshot = await getDoc(doc(db, "settings", "config"));
      if (settingsSnapshot.exists()) stockAlertThreshold = Number(settingsSnapshot.data().stockAlertThreshold ?? 5);
      onSnapshot(collection(db, "products"), snapshot => { products = snapshot.docs.map(item => ({ id: item.id, ...item.data() })); renderProducts(); setLoading(false); }, error => { console.error(error); setLoading(false); toast("Erreur de chargement des produits.", "error"); });
    } catch (error) { console.error(error); setLoading(false); toast("Impossible d’initialiser les produits.", "error"); }
  });
  document.getElementById("products-search")?.addEventListener("input", renderProducts);
  document.getElementById("btn-add-product")?.addEventListener("click", () => openProductModal());
}
document.addEventListener("DOMContentLoaded", start);
