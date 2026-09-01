import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, onSnapshot, updateDoc, deleteDoc, doc, query, orderBy, getDocs, where, addDoc, deleteField } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA7YsFC0dtxU09zg8j3q6jv2UHoYQJqTRA",
  authDomain: "boulangerie-dana.firebaseapp.com",
  projectId: "boulangerie-dana",
  storageBucket: "boulangerie-dana.firebasestorage.app",
  messagingSenderId: "508760970095",
  appId: "1:508760970095:web:0be3c6fb78eb5426698e9a",
  measurementId: "G-53FLSWN3KF"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);
let isSubmitting = false;

document.addEventListener('DOMContentLoaded', () => {
  const tbody = document.getElementById('users-table-body');
  const searchEl = document.getElementById('users-search');
  const roleEl = document.getElementById('users-filter-role');
  const btnAdd = document.getElementById('btn-add-user');
  const loadingEl = document.getElementById('users-loading');

  let usersCache = [];
  let unsubscribeUsers = null;

  function disposeUsersListener() {
    if (typeof unsubscribeUsers === 'function') {
      unsubscribeUsers();
      unsubscribeUsers = null;
    }
  }

  function getUsersQuery() {
    const role = roleEl ? String(roleEl.value || '') : '';
    if (role) {
      return query(collection(db, 'users'), where('role', '==', role), orderBy('createdAt', 'desc'));
    }
    return query(collection(db, 'users'), orderBy('createdAt', 'desc'));
  }

  function setLoading(v) { if (!loadingEl) return; loadingEl.style.display = v ? 'block' : 'none'; }

  function showToast(msg, type='info'){
    const rootId = 'user-toast-root';
    let root = document.getElementById(rootId);
    if (!root) { root = document.createElement('div'); root.id = rootId; document.body.appendChild(root); }
    const t = document.createElement('div');
    t.className = 'card';
    t.style.position = 'fixed'; t.style.right = '20px'; t.style.bottom = '20px'; t.style.zIndex = 9999; t.style.maxWidth='320px';
    t.style.padding = '10px';
    t.textContent = msg;
    if (type==='error') t.style.background = 'linear-gradient(135deg, rgba(255,0,0,0.06), rgba(0,0,0,0.02))';
    root.appendChild(t);
    setTimeout(()=>{ try{ t.remove(); }catch(e){} }, 4000);
  }

  function renderTable(list){
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!Array.isArray(list) || list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Aucun compte trouvé.</td></tr>';
      return;
    }

    list.forEach(u => {
      const tr = document.createElement('tr');
      tr.style.fontSize = '13px';
      const name = escapeHtml(u.nom || u.name || u.displayName || '—');
      const phone = escapeHtml(u.phone || u.email || '—');
      const role = escapeHtml((u.role||'').toString());
      const status = (u.statut===false) ? 'Inactif' : 'Actif';

      tr.innerHTML = `
        <td style="padding:8px;">${name}</td>
        <td style="padding:8px;">${phone}</td>
        <td style="padding:8px;">${role}</td>
        <td style="padding:8px;color:var(--accent-gold);font-weight:700;">${u.role && u.role.toString().toLowerCase() === 'client' ? Number(u.loyaltyPoints || u.points || 0) : '—'}</td>
        <td style="padding:8px;">${status}</td>
        <td style="padding:8px;text-align:right;">
          <button class="btn-ghost action-btn" data-id="${u.id}" data-action="edit" title="Modifier">✎</button>
          <button class="btn-ghost action-btn" data-id="${u.id}" data-action="orders" title="Historique des commandes">Commandes</button>
          <button class="btn-ghost action-btn" data-id="${u.id}" data-action="reset-pin" title="Réinitialiser PIN">🔑</button>
          <button class="btn-ghost action-btn" data-id="${u.id}" data-action="toggle" title="Basculer statut">${u.statut===false ? 'Activer' : 'Désactiver'}</button>
          <button class="btn-ghost action-btn" data-id="${u.id}" data-action="delete" title="Supprimer" style="color:#ffb4b4;border-color:rgba(255,0,0,0.06);">🗑</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('button[data-action]').forEach(btn => {
      btn.addEventListener('click', (e)=>{
        const id = btn.getAttribute('data-id');
        const action = btn.getAttribute('data-action');
        const u = usersCache.find(x=>x.id===id);
        if (action==='edit') openUserModal(u,'edit');
        else if (action==='orders') openOrderHistory(u);
        else if (action==='reset-pin') openPinResetModal(u);
        else if (action==='delete') deleteUser(id);
        else if (action==='toggle') toggleStatus(u);
      });
    });
  }

  async function openOrderHistory(user) {
    const modal = document.createElement('div');
    modal.className = 'orders-modal-backdrop';
    modal.innerHTML = `<div class="orders-modal" role="dialog" aria-modal="true"><div class="orders-modal-header"><h3>Historique des commandes</h3><button class="btn-ghost history-close" type="button">✕</button></div><p style="color:var(--text-muted);">${escapeHtml(user.nom || user.name || 'Client')}</p><div class="order-history-list">Chargement...</div></div>`;
    document.body.appendChild(modal);
    modal.querySelector('.history-close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', event => { if (event.target === modal) modal.remove(); });
    try {
      const snapshot = await getDocs(query(collection(db, 'orders'), orderBy('createdAt', 'desc')));
      const rows = snapshot.docs.map(item => ({ id: item.id, ...item.data() })).filter(order => order.clientId === user.id || order.clientId === user.uid);
      const list = modal.querySelector('.order-history-list');
      list.innerHTML = rows.length ? rows.map(order => `<div class="order-history-row"><span>#${escapeHtml(order.id.slice(0, 10))}</span><span>${escapeHtml(order.status || 'PENDING')}</span><strong>${Number(order.total ?? order.totalAmount ?? 0).toLocaleString('fr-FR')} FC</strong></div>`).join('') : '<p class="empty-state">Aucune commande trouvée.</p>';
    } catch (error) {
      console.error(error);
      modal.querySelector('.order-history-list').innerHTML = '<p class="empty-state">Impossible de charger l’historique.</p>';
    }
  }

  function applyFilters(){
    const q = searchEl ? String(searchEl.value||'').trim().toLowerCase() : '';
    const role = roleEl ? String(roleEl.value||'') : '';
    let filtered = usersCache.slice();
    if (role) filtered = filtered.filter(u => (u.role||'').toString().toLowerCase() === role);
    if (q) filtered = filtered.filter(u => {
      const name = (u.nom||u.name||u.displayName||'').toString().toLowerCase();
      const email = (u.email||'').toString().toLowerCase();
      const phone = (u.phone||u.telephone||'').toString().toLowerCase();
      const clientNumber = (u.clientNumber||'').toString().toLowerCase();
      return name.includes(q) || email.includes(q) || phone.includes(q) || clientNumber.includes(q);
    });
    renderTable(filtered);
  }

  function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, (c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[c]); }

  async function deleteUser(id){
    if (!confirm('Confirmer la suppression du compte ?')) return;
    try {
      await deleteDoc(doc(db,'users',id));
      showToast('Compte supprimé.', 'info');
    } catch (err){ console.error(err); showToast('Erreur suppression: '+(err.message||err),'error'); }
  }

  async function toggleStatus(u){
    if (!u || !u.id) return;
    try{
      await updateDoc(doc(db,'users',u.id), { statut: !(u.statut===false) });
      showToast('Statut mis à jour.');
    } catch(err){ console.error(err); showToast('Erreur mise à jour statut','error'); }
  }

  function openPinResetModal(user) {
    if (!user || !user.id) return;
    const modal = document.createElement('div');
    modal.className = 'user-modal-backdrop';
    modal.innerHTML = `
      <div class="user-modal-dialog" role="dialog" aria-modal="true">
        <div class="user-modal-header">
          <h3>Réinitialiser le PIN</h3>
          <button class="btn-ghost" type="button" data-close="pin-reset">✕</button>
        </div>
        <div class="user-modal-form">
          <div class="user-modal-field">
            <label>Client</label>
            <input type="text" value="${escapeHtml(user.nom || user.name || 'Client')}" disabled />
          </div>
          <div class="user-modal-field">
            <label>Nouveau PIN</label>
            <input id="pin-reset-input" type="password" maxlength="6" inputmode="numeric" placeholder="123456" autocomplete="off" />
          </div>
          <div class="user-modal-actions">
            <button type="button" class="btn-ghost" data-close="pin-reset">Annuler</button>
            <button type="button" id="pin-reset-submit" class="btn">Enregistrer</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    modal.querySelector('[data-close="pin-reset"]').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', event => { if (event.target === modal) modal.remove(); });

    document.getElementById('pin-reset-submit').addEventListener('click', async () => {
      const input = document.getElementById('pin-reset-input');
      const newPin = String(input.value ?? '').trim();

      if (!/^\d{6}$/.test(newPin)) {
        showToast('Le nouveau PIN doit contenir exactement 6 chiffres.', 'error');
        return;
      }

      try {
        const newHash = CryptoJS.SHA256(newPin).toString();
        await updateDoc(doc(db, 'users', user.id), {
          pin_hash: newHash,
          pin: deleteField()
        });
        showToast('PIN mis à jour avec succès.', 'success');
        modal.remove();
      } catch (err) {
        console.error(err);
        showToast('Erreur lors de la mise à jour du PIN.', 'error');
      }
    });
  }

  function openUserModal(user, mode='create'){
    let modal = document.getElementById('user-modal-root');
    if (!modal) {
      modal = document.createElement('div'); modal.id = 'user-modal-root';
      modal.style.position='fixed'; modal.style.inset='0'; modal.style.background='rgba(0,0,0,0.6)'; modal.style.display='flex'; modal.style.alignItems='center'; modal.style.justifyContent='center'; modal.style.zIndex='9999';
      document.body.appendChild(modal);
    }

    const isCreate = mode === 'create';
    const title = isCreate ? '+ Créer un compte' : 'Modifier le compte';
    const initialRole = (user && user.role ? String(user.role).toLowerCase() : 'client');
    const normalizedRole = ['admin', 'agent', 'client'].includes(initialRole) ? initialRole : 'client';
    const name = user ? (user.nom || user.name || '') : '';
    const phoneValue = user ? (user.phone || user.telephone || '') : '';
    const emailValue = user ? (user.email || '') : '';
    const status = user ? (user.statut === false ? 'false' : 'true') : 'true';
    const pin = '';

    modal.innerHTML = `
      <div class="user-modal-backdrop">
        <div class="user-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="user-modal-title">
          <div class="user-modal-header">
            <h3 id="user-modal-title">${title}</h3>
            <button id="user-modal-close" class="btn-ghost" type="button" aria-label="Fermer">✕</button>
          </div>
          <form id="user-modal-form" class="user-modal-form">
            <div class="user-modal-field">
              <label>Nom complet</label>
              <input id="user-modal-name" type="text" value="${escapeHtml(name)}" required />
            </div>

            <div class="user-modal-field" data-field-group="identity">
              <label id="user-modal-identity-label">Téléphone</label>
              <input id="user-modal-phone" type="tel" inputmode="numeric" pattern="0[0-9]{8,9}" maxlength="10" value="${escapeHtml(phoneValue)}" placeholder="0811111111" />
            </div>

            <div class="user-modal-field">
              <label>Rôle</label>
              <select id="user-modal-role">
                <option value="admin" ${normalizedRole === 'admin' ? 'selected' : ''}>Admin</option>
                <option value="agent" ${normalizedRole === 'agent' ? 'selected' : ''}>Agent</option>
                <option value="client" ${normalizedRole === 'client' ? 'selected' : ''}>Client</option>
              </select>
            </div>

            <div class="user-modal-field">
              <label>Statut</label>
              <select id="user-modal-status">
                <option value="true" ${status !== 'false' ? 'selected' : ''}>Actif</option>
                <option value="false" ${status === 'false' ? 'selected' : ''}>Inactif</option>
              </select>
            </div>

            <div class="user-modal-field">
              <label id="user-modal-pin-label">Code PIN (6 chiffres) — obligatoire pour les comptes client/agent</label>
              <input id="user-modal-pin" type="text" maxlength="6" inputmode="numeric" value="${escapeHtml(pin)}" placeholder="Ex: 123456" />
            </div>

            <div class="user-modal-note" id="user-modal-note">Utilisez le numéro de téléphone comme identifiant principal pour les comptes client et agent.</div>

            <div class="user-modal-actions">
              <button type="button" id="user-modal-cancel" class="btn-ghost">Annuler</button>
              <button type="submit" id="user-modal-submit" class="btn">${isCreate ? 'Créer' : 'Sauvegarder'}</button>
            </div>
          </form>
        </div>
      </div>
    `;

    const identityLabel = document.getElementById('user-modal-identity-label');
    const identityInput = document.getElementById('user-modal-phone');
    const pinLabel = document.getElementById('user-modal-pin-label');
    const noteEl = document.getElementById('user-modal-note');

    function refreshRoleFields() {
      const selectedRole = document.getElementById('user-modal-role').value;
      const isAdminRole = selectedRole === 'admin';

      identityLabel.textContent = isAdminRole ? 'Email administrateur' : 'Téléphone';
      identityInput.type = isAdminRole ? 'email' : 'tel';
      identityInput.value = isAdminRole ? (emailValue || '') : (phoneValue || '');
      identityInput.placeholder = isAdminRole ? 'admin@gmail.com' : '0811111111';
      identityInput.required = true;
      identityInput.pattern = isAdminRole ? '.*@.*' : '0[0-9]{8,9}';
      if (isAdminRole) {
        identityInput.removeAttribute('maxlength');
      } else {
        identityInput.setAttribute('maxlength', '10');
      }

      if (isAdminRole) {
        pinLabel.textContent = 'Code PIN (6 chiffres) — facultatif pour l’admin';
        noteEl.textContent = 'L’email est utilisé pour identifier l’administrateur et la connexion au site.';
      } else {
        pinLabel.textContent = 'Code PIN (6 chiffres) — obligatoire pour les comptes client/agent';
        noteEl.textContent = 'Utilisez le numéro de téléphone comme identifiant principal pour les comptes client et agent.';
      }
    }

    document.getElementById('user-modal-role').addEventListener('change', refreshRoleFields);
    refreshRoleFields();

    document.getElementById('user-modal-close').addEventListener('click', closeUserModal);
    document.getElementById('user-modal-cancel').addEventListener('click', closeUserModal);

    const form = document.getElementById('user-modal-form');
    form.addEventListener('submit', async (e)=>{
      e.preventDefault();
      if (isSubmitting) return;
      isSubmitting = true;
      const submitButton = document.getElementById('user-modal-submit');
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Enregistrement...';
      }

      const nameVal = document.getElementById('user-modal-name').value.trim();
      const roleVal = document.getElementById('user-modal-role').value;
      const statusVal = document.getElementById('user-modal-status').value === 'true';
      const pinVal = String(document.getElementById('user-modal-pin').value ?? '').trim();
      const identityValue = document.getElementById('user-modal-phone').value.trim();
      const isAdminRole = roleVal === 'admin';
      const normalizedPhone = identityValue.replace(/\D/g, '');

      if (!nameVal) {
        showToast('Le nom est requis.', 'error');
        isSubmitting = false;
        if (submitButton) submitButton.disabled = false;
        if (submitButton) submitButton.textContent = isCreate ? 'Créer' : 'Sauvegarder';
        return;
      }

      if (isAdminRole) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identityValue)) {
          showToast('L’email administrateur est invalide.', 'error');
          isSubmitting = false;
          if (submitButton) submitButton.disabled = false;
          if (submitButton) submitButton.textContent = isCreate ? 'Créer' : 'Sauvegarder';
          return;
        }
        if (pinVal && !/^[0-9]{6}$/.test(pinVal)) {
          showToast('Le PIN administrateur doit contenir exactement 6 chiffres.', 'error');
          isSubmitting = false;
          if (submitButton) submitButton.disabled = false;
          if (submitButton) submitButton.textContent = isCreate ? 'Créer' : 'Sauvegarder';
          return;
        }
      } else {
        if (!/^[0][0-9]{8,9}$/.test(normalizedPhone)) {
          showToast('Numéro de téléphone invalide. Exemple: 0811111111', 'error');
          isSubmitting = false;
          if (submitButton) submitButton.disabled = false;
          if (submitButton) submitButton.textContent = isCreate ? 'Créer' : 'Sauvegarder';
          return;
        }
        if (!/^[0-9]{6}$/.test(pinVal)) {
          showToast('Le code PIN doit contenir exactement 6 chiffres.', 'error');
          isSubmitting = false;
          if (submitButton) submitButton.disabled = false;
          if (submitButton) submitButton.textContent = isCreate ? 'Créer' : 'Sauvegarder';
          return;
        }
      }

      try {
        const dupField = isAdminRole ? 'email' : 'telephone';
        const duplicateQuery = query(collection(db, 'users'), where(dupField, '==', isAdminRole ? identityValue.toLowerCase() : normalizedPhone));
        const duplicateSnap = await getDocs(duplicateQuery);

        if (isCreate && !duplicateSnap.empty) {
          showToast(isAdminRole ? 'Cet email admin existe déjà.' : 'Ce numéro existe déjà', 'error');
          isSubmitting = false;
          if (submitButton) submitButton.disabled = false;
          if (submitButton) submitButton.textContent = isCreate ? 'Créer' : 'Sauvegarder';
          return;
        }

        if (!isCreate && user) {
          const conflict = duplicateSnap.docs.some(docSnap => docSnap.id !== user.id);
          if (conflict) {
            showToast(isAdminRole ? 'Cet email admin existe déjà.' : 'Ce numéro existe déjà', 'error');
            isSubmitting = false;
            if (submitButton) submitButton.disabled = false;
            if (submitButton) submitButton.textContent = isCreate ? 'Créer' : 'Sauvegarder';
            return;
          }
        }

        const hashedPin = pinVal ? CryptoJS.SHA256(pinVal).toString() : (user && user.pin_hash ? user.pin_hash : '');
        const createPayload = isAdminRole ? {
          nom: nameVal,
          email: identityValue.toLowerCase(),
          role: 'ADMIN',
          statut: statusVal,
          ...(pinVal ? { pin_hash: hashedPin } : {}),
          createdAt: new Date()
        } : {
          nom: nameVal,
          telephone: normalizedPhone,
          phone: normalizedPhone,
          email: `${normalizedPhone}@gmail.com`,
          role: roleVal,
          statut: statusVal,
          ...(pinVal ? { pin_hash: hashedPin } : {}),
          createdAt: new Date()
        };

        const updatePayload = isAdminRole ? {
          nom: nameVal,
          email: identityValue.toLowerCase(),
          role: 'ADMIN',
          statut: statusVal,
          ...(pinVal ? { pin_hash: hashedPin, pin: deleteField() } : {}),
        } : {
          nom: nameVal,
          telephone: normalizedPhone,
          phone: normalizedPhone,
          email: `${normalizedPhone}@gmail.com`,
          role: roleVal,
          statut: statusVal,
          pin_hash: hashedPin,
          pin: deleteField(),
        };

        if (isCreate) {
          await addDoc(collection(db, 'users'), createPayload);
          showToast(roleVal === 'admin' ? 'Admin créé avec succès.' : (roleVal === 'agent' ? 'Agent créé avec succès.' : 'Client créé avec succès.'), 'success');
        } else {
          await updateDoc(doc(db, 'users', user.id), updatePayload);
          showToast('Compte mis à jour.');
        }

        closeUserModal();
      } catch (err) {
        console.error(err);
        showToast(err.message || 'Création impossible. Vérifiez les informations puis réessayez.', 'error');
      } finally {
        isSubmitting = false;
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = isCreate ? 'Créer' : 'Sauvegarder';
        }
      }
    });
  }

  function closeUserModal(){ const m = document.getElementById('user-modal-root'); if (m) m.remove(); }

  // Initial load with async/await and robust error handling, then attach real-time listener
  function syncUsersListener() {
    disposeUsersListener();
    setLoading(true);
    unsubscribeUsers = onSnapshot(getUsersQuery(), (snapshot)=>{
      const arr = [];
      snapshot.forEach(docSnap => arr.push({ id: docSnap.id, ...docSnap.data() }));
      usersCache = arr;
      applyFilters();
      setLoading(false);
    }, (err)=>{
      console.error('users snapshot error', err);
      showToast('Impossible d’écouter les comptes en temps réel : ' + (err.message||err), 'error');
      setLoading(false);
    });
  }

  syncUsersListener();

  // Bind controls
  if (searchEl) { let t=null; searchEl.addEventListener('input', ()=>{ if (t) clearTimeout(t); t = setTimeout(()=>applyFilters(), 200); }); }
  if (roleEl) roleEl.addEventListener('change', () => syncUsersListener());
  if (btnAdd) btnAdd.addEventListener('click', ()=>openUserModal(null,'create'));
  window.addEventListener('beforeunload', disposeUsersListener);

});
