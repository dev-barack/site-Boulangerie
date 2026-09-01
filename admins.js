import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const config = {
  apiKey: "AIzaSyA7YsFC0dtxU09zg8j3q6jv2UHoYQJqTRA",
  authDomain: "boulangerie-dana.firebaseapp.com",
  projectId: "boulangerie-dana",
  storageBucket: "boulangerie-dana.firebasestorage.app",
  messagingSenderId: "508760970095",
  appId: "1:508760970095:web:0be3c6fb78eb5426698e9a",
  measurementId: "G-53FLSWN3KF"
};

const app = getApps().length ? getApps()[0] : initializeApp(config);
const auth = getAuth(app);
const db = getFirestore(app);

const DEFAULT_ADMIN_EMAIL = "devbarack2000@gmail.com";

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeAdmins(value) {
  const source = Array.isArray(value) ? value : [value];
  return [...new Set(
    source
      .flatMap((item) => String(item || '').split(/[\n,]+/))
      .map((item) => normalizeEmail(item))
      .filter((item) => item && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item))
  )];
}

function toast(message, type = 'info') {
  const rootId = 'app-toast-root';
  let root = document.getElementById(rootId);
  if (!root) {
    root = document.createElement('div');
    root.id = rootId;
    root.style.position = 'fixed';
    root.style.right = '18px';
    root.style.bottom = '18px';
    root.style.zIndex = '99999';
    root.style.display = 'flex';
    root.style.flexDirection = 'column';
    root.style.gap = '8px';
    document.body.appendChild(root);
  }

  const toastEl = document.createElement('div');
  toastEl.textContent = message;
  toastEl.style.padding = '10px 12px';
  toastEl.style.borderRadius = '10px';
  toastEl.style.maxWidth = '320px';
  toastEl.style.fontSize = '13px';
  toastEl.style.boxShadow = '0 12px 30px rgba(0,0,0,0.25)';
  toastEl.style.color = '#fff';
  toastEl.style.background = type === 'error'
    ? 'rgba(239,68,68,0.9)'
    : type === 'success'
      ? 'rgba(16,185,129,0.9)'
      : 'rgba(31,41,55,0.95)';

  root.appendChild(toastEl);
  setTimeout(() => toastEl.remove(), 3500);
}

async function getSettingsData() {
  const snap = await getDoc(doc(db, 'settings', 'config'));
  return snap.exists() ? snap.data() : {};
}

function getCurrentAdminEmails(data = {}) {
  const list = normalizeAdmins(data.adminEmails || data.adminEmail || [DEFAULT_ADMIN_EMAIL]);
  return list.length ? list : [DEFAULT_ADMIN_EMAIL];
}

function getAdminRoleValue(data = {}) {
  const value = String(data.role || 'ADMIN').trim().toUpperCase();
  return value === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'ADMIN';
}

function getAdminStatusValue(data = {}) {
  const source = data.statut ?? data.status ?? true;
  if (source === 'false') return false;
  if (source === false) return false;
  if (source === 'true') return true;
  if (source === 'active' || source === 'ACTIF') return true;
  if (source === 'inactive' || source === 'INACTIF') return false;
  return Boolean(source);
}

function getConnectedAdminEmail() {
  return normalizeEmail(auth.currentUser?.email || '');
}

async function loadAdminList() {
  const settingsData = await getSettingsData();
  const emails = getCurrentAdminEmails(settingsData);
  const list = [];

  for (const email of emails) {
    let userDoc = null;
    try {
      const docRef = doc(db, 'users', email);
      const userSnap = await getDoc(docRef);
      if (userSnap.exists()) userDoc = userSnap.data();
    } catch (error) {
      console.warn('Impossible de lire le document utilisateur admin :', email, error);
    }

    const role = getAdminRoleValue(userDoc || {});
    const status = getAdminStatusValue(userDoc || {});
    list.push({
      email,
      role,
      status,
      createdAt: userDoc?.createdAt || null,
      source: 'firestore'
    });
  }

  return list;
}

function renderStats(list) {
  const total = list.length;
  const active = list.filter((item) => item.status).length;
  const inactive = total - active;

  document.getElementById('admins-total').textContent = String(total);
  document.getElementById('admins-active').textContent = String(active);
  document.getElementById('admins-inactive').textContent = String(inactive);
}

function renderAdminList(list) {
  const container = document.getElementById('admins-list');
  if (!container) return;

  if (!list.length) {
    container.innerHTML = '<div class="empty-state">Aucun administrateur enregistré.</div>';
    return;
  }

  container.innerHTML = list.map((admin) => {
    const initials = (admin.email || 'A').split('@')[0].slice(0, 2).toUpperCase();
    const statusLabel = admin.status ? 'Actif' : 'Inactif';
    const statusClass = admin.status ? 'status-active' : 'status-inactive';
    const isCurrentUser = normalizeEmail(admin.email) === getConnectedAdminEmail();

    return `
      <article class="admin-card panel" data-email="${admin.email}">
        <div class="admin-card-head">
          <div class="admin-avatar">${initials}</div>
          <div>
            <h4>${admin.email}</h4>
            <div class="admin-role-row">
              <span class="badge">${admin.role}</span>
              <span class="status-pill ${statusClass}">${statusLabel}</span>
            </div>
          </div>
        </div>
        <div class="admin-card-actions">
          <button class="btn btn-secondary admin-edit-btn" type="button" data-email="${admin.email}">Modifier</button>
          <button class="btn btn-secondary admin-toggle-btn" type="button" data-email="${admin.email}">${admin.status ? 'Désactiver' : 'Activer'}</button>
          <button class="btn btn-danger admin-delete-btn" type="button" data-email="${admin.email}" ${isCurrentUser ? 'disabled' : ''}>Supprimer</button>
        </div>
      </article>
    `;
  }).join('');

  document.querySelectorAll('.admin-edit-btn').forEach((button) => {
    button.addEventListener('click', () => openEditModal(button.dataset.email));
  });

  document.querySelectorAll('.admin-toggle-btn').forEach((button) => {
    button.addEventListener('click', () => toggleAdminStatus(button.dataset.email));
  });

  document.querySelectorAll('.admin-delete-btn').forEach((button) => {
    button.addEventListener('click', () => deleteAdmin(button.dataset.email));
  });
}

async function refreshAdmins() {
  const adminList = await loadAdminList();
  renderStats(adminList);
  renderAdminList(adminList);
}

function renderHistory(list) {
  const historyEl = document.getElementById('admin-history');
  if (!historyEl) return;
  if (!list.length) {
    historyEl.innerHTML = '<li>Aucun historique récent.</li>';
    return;
  }
  historyEl.innerHTML = list.slice(0, 6).map((item) => `<li>${item}</li>`).join('');
}

function recordHistory(message) {
  const key = 'admin_history';
  const existing = JSON.parse(localStorage.getItem(key) || '[]');
  existing.unshift(`${new Date().toLocaleString()} — ${message}`);
  localStorage.setItem(key, JSON.stringify(existing.slice(0, 10)));
  renderHistory(existing);
}

async function saveSettingsFromAdminEmails(adminEmails) {
  const cleanEmails = normalizeAdmins(adminEmails);
  const currentData = await getSettingsData();
  const currentList = getCurrentAdminEmails(currentData);

  const lastActiveAdmin = currentList.filter((email) => email !== getConnectedAdminEmail());
  if (!cleanEmails.length) {
    throw new Error('La liste des administrateurs ne peut pas être vide.');
  }

  if (currentList.includes(getConnectedAdminEmail()) && !cleanEmails.includes(getConnectedAdminEmail()) && lastActiveAdmin.length === 0) {
    throw new Error('Vous ne pouvez pas supprimer votre propre email si vous êtes le seul administrateur actif.');
  }

  await setDoc(doc(db, 'settings', 'config'), {
    adminEmails: cleanEmails,
    adminEmail: cleanEmails[0],
    updatedAt: serverTimestamp()
  }, { merge: true });
}

async function ensureUserDocForAdmin(email, role = 'ADMIN', status = true) {
  const normalized = normalizeEmail(email);
  const userId = normalized.replace(/[^a-z0-9]/gi, '');
  const ref = doc(db, 'users', userId || normalized);
  const snap = await getDoc(ref);

  const payload = {
    uid: userId || normalized,
    email: normalized,
    role: role || 'ADMIN',
    statut: Boolean(status),
    status: Boolean(status),
    updatedAt: serverTimestamp()
  };

  if (!snap.exists()) {
    await setDoc(ref, { ...payload, createdAt: serverTimestamp() });
    return;
  }

  await updateDoc(ref, payload);
}

async function addAdmin(email, role = 'ADMIN') {
  const normalized = normalizeEmail(email);
  const settingsData = await getSettingsData();
  const currentList = getCurrentAdminEmails(settingsData);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error('Veuillez saisir un email valide.');
  }

  if (currentList.includes(normalized)) {
    throw new Error('Cet administrateur existe déjà.');
  }

  const next = [...currentList, normalized];
  await saveSettingsFromAdminEmails(next);
  await ensureUserDocForAdmin(normalized, role, true);
  recordHistory(`Ajout de ${normalized}`);
  toast('Administrateur ajouté avec succès.', 'success');
  await refreshAdmins();
}

async function toggleAdminStatus(email) {
  const normalized = normalizeEmail(email);
  const settingsData = await getSettingsData();
  const currentList = getCurrentAdminEmails(settingsData);

  const userTarget = doc(db, 'users', normalized.replace(/[^a-z0-9]/gi, '') || normalized);
  const userSnap = await getDoc(userTarget);
  const currentStatus = userSnap.exists() ? getAdminStatusValue(userSnap.data()) : true;

  const nextStatus = !currentStatus;

  if (!nextStatus) {
    const activeAdmins = currentList.filter((item) => item !== normalized)
      .filter((item) => !!item);
    if (activeAdmins.length === 0 && currentList.includes(normalized)) {
      toast('Le dernier administrateur actif ne peut pas être désactivé.', 'error');
      return;
    }
  }

  await updateDoc(userTarget, {
    statut: nextStatus,
    status: nextStatus,
    updatedAt: serverTimestamp()
  });

  recordHistory(`${normalized} ${nextStatus ? 'activé' : 'désactivé'}`);
  toast(nextStatus ? 'Administrateur activé.' : 'Administrateur désactivé.', 'success');
  await refreshAdmins();
}

async function deleteAdmin(email) {
  const normalized = normalizeEmail(email);
  const currentData = await getSettingsData();
  const currentList = getCurrentAdminEmails(currentData);

  if (currentList.length <= 1) {
    toast('Vous ne pouvez pas supprimer le dernier administrateur actif.', 'error');
    return;
  }

  if (normalized === getConnectedAdminEmail()) {
    toast('Vous ne pouvez pas supprimer votre propre compte administrateur.', 'error');
    return;
  }

  const nextList = currentList.filter((item) => item !== normalized);
  await saveSettingsFromAdminEmails(nextList);

  const userId = normalized.replace(/[^a-z0-9]/gi, '') || normalized;
  try {
    await deleteDoc(doc(db, 'users', userId));
  } catch (error) {
    console.warn('Le document utilisateur n’existe pas déjà :', error);
  }

  recordHistory(`Suppression de ${normalized}`);
  toast('Administrateur supprimé.', 'success');
  await refreshAdmins();
}

async function updateAdmin(email, role, status) {
  const normalized = normalizeEmail(email);
  const data = await getSettingsData();
  const emails = getCurrentAdminEmails(data);
  if (!emails.includes(normalized)) {
    throw new Error('Administrateur introuvable dans la liste autorisée.');
  }

  const statusValue = status === 'true' || status === true;
  const userId = normalized.replace(/[^a-z0-9]/gi, '') || normalized;
  await updateDoc(doc(db, 'users', userId), {
    email: normalized,
    role: role || 'ADMIN',
    statut: statusValue,
    status: statusValue,
    updatedAt: serverTimestamp()
  });

  recordHistory(`Modification de ${normalized} (${role}, ${statusValue ? 'actif' : 'inactif'})`);
  toast('Administrateur mis à jour.', 'success');
  await refreshAdmins();
}

function openEditModal(email) {
  const modal = document.getElementById('admin-modal');
  const emailInput = document.getElementById('admin-edit-email');
  const roleInput = document.getElementById('admin-edit-role');
  const statusInput = document.getElementById('admin-edit-status');

  const list = JSON.parse(localStorage.getItem('admin-cache') || '[]');
  const admin = list.find((item) => normalizeEmail(item.email) === normalizeEmail(email));

  if (!admin) return;

  emailInput.value = admin.email;
  roleInput.value = admin.role || 'ADMIN';
  statusInput.value = String(admin.status);
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
}

function closeEditModal() {
  const modal = document.getElementById('admin-modal');
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
}

async function handleAdminFormSubmit(event) {
  event.preventDefault();
  const input = document.getElementById('admin-email-input');
  const roleInput = document.getElementById('admin-role-input');
  const errorEl = document.getElementById('admin-email-error');

  try {
    errorEl.textContent = '';
    await addAdmin(input.value, roleInput.value);
    input.value = '';
    roleInput.value = 'ADMIN';
  } catch (error) {
    errorEl.textContent = error.message || 'Erreur lors de l’ajout de l’administrateur.';
    toast(error.message || 'Erreur lors de l’ajout.', 'error');
  }
}

async function handleAdminEditFormSubmit(event) {
  event.preventDefault();
  const email = document.getElementById('admin-edit-email').value;
  const role = document.getElementById('admin-edit-role').value;
  const status = document.getElementById('admin-edit-status').value;

  try {
    await updateAdmin(email, role, status);
    closeEditModal();
  } catch (error) {
    toast(error.message || 'Erreur de modification.', 'error');
  }
}

function attachModalHandlers() {
  const modal = document.getElementById('admin-modal');
  modal.addEventListener('click', (event) => {
    if (event.target.dataset.closeModal === 'true' || event.target === modal) {
      closeEditModal();
    }
  });

  document.getElementById('admin-edit-form').addEventListener('submit', handleAdminEditFormSubmit);
  document.getElementById('admin-form').addEventListener('submit', handleAdminFormSubmit);
  document.getElementById('add-admin-button').addEventListener('click', () => {
    document.getElementById('admin-email-input').focus();
  });
  document.getElementById('admin-email-input').addEventListener('input', (event) => {
    const value = normalizeEmail(event.target.value);
    const errorEl = document.getElementById('admin-email-error');
    const valid = !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    errorEl.textContent = valid ? '' : 'Format d’email incorrect.';
  });
}

async function bootstrap() {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = 'index.html';
      return;
    }

    const settingsData = await getSettingsData();
    const allowedAdminEmails = getCurrentAdminEmails(settingsData);
    const connectedEmail = getConnectedAdminEmail();

    if (!allowedAdminEmails.includes(connectedEmail)) {
      await signOut(auth);
      window.location.href = 'index.html';
      return;
    }

    const history = JSON.parse(localStorage.getItem('admin_history') || '[]');
    renderHistory(history);

    document.getElementById('profile-bubble').textContent = (connectedEmail.split('@')[0] || 'A').slice(0, 1).toUpperCase();

    try {
      const list = await loadAdminList();
      localStorage.setItem('admin-cache', JSON.stringify(list));
      renderStats(list);
      renderAdminList(list);
      attachModalHandlers();
      document.getElementById('admin-form').addEventListener('submit', handleAdminFormSubmit);
    } catch (error) {
      console.error(error);
      toast('Impossible de charger la liste des administrateurs.', 'error');
    }
  });
}

document.addEventListener('DOMContentLoaded', bootstrap);
