import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut,
    sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    onSnapshot, 
    doc, 
    getDoc,
    getDocs,
    updateDoc, 
    setDoc, 
    addDoc,
    deleteDoc,
    query, 
    where, 
    orderBy, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Configuration Firebase
const firebaseConfig = {
  apiKey: "AIzaSyA7YsFC0dtxU09zg8j3q6jv2UHoYQJqTRA",
  authDomain: "boulangerie-dana.firebaseapp.com",
  projectId: "boulangerie-dana",
  storageBucket: "boulangerie-dana.firebasestorage.app",
  messagingSenderId: "508760970095",
  appId: "1:508760970095:web:0be3c6fb78eb5426698e9a",
  measurementId: "G-53FLSWN3KF"
};

const DEFAULT_ADMIN_EMAIL = "devbarack2000@gmail.com";
const normalizeAdminEmail = (value) => String(value || '').trim().toLowerCase();

const normalizeAdminEmailList = (value) => {
    const source = Array.isArray(value) ? value : [value];
    const list = source.flatMap((item) => String(item || '').split(/[\n,]+/));
    return [...new Set(list.map((item) => normalizeAdminEmail(item)).filter((item) => item && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item)))];
};

const resolveAdminEmails = async () => {
    const emails = new Set();
    const fallback = [DEFAULT_ADMIN_EMAIL];

    try {
        const settingsSnap = await getDoc(doc(db, 'settings', 'config'));
        if (settingsSnap.exists()) {
            const data = settingsSnap.data() || {};
            normalizeAdminEmailList(data.adminEmails || data.adminEmail || fallback).forEach((email) => emails.add(email));
        }
    } catch (error) {
        console.warn('Impossible de lire la liste des emails admin :', error);
    }

    try {
        const usersSnap = await getDocs(collection(db, 'users'));
        usersSnap.forEach((userDoc) => {
            const data = userDoc.data() || {};
            const email = normalizeAdminEmail(data.email || data.userEmail || '');
            const role = String(data.role || '').trim().toUpperCase();
            const isActiveAdmin = role === 'ADMIN' && hasAdminStatus(data);
            if (email && isActiveAdmin) {
                emails.add(email);
            }
        });
    } catch (error) {
        console.warn('Impossible de lire les comptes admin dans Firestore :', error);
    }

    if (emails.size > 0) return [...emails];
    return fallback;
};

const isAdminEmail = async (email) => {
    const normalized = normalizeAdminEmail(email);
    if (!normalized) return false;

    const adminEmails = await resolveAdminEmails();
    if (adminEmails.includes(normalized)) return true;

    try {
        const usersSnap = await getDocs(collection(db, 'users'));
        for (const userDoc of usersSnap.docs) {
            const data = userDoc.data() || {};
            const docEmail = normalizeAdminEmail(data.email || data.userEmail || '');
            const role = String(data.role || '').trim().toUpperCase();
            if (docEmail === normalized && role === 'ADMIN' && hasAdminStatus(data)) {
                return true;
            }
        }
    } catch (error) {
        console.warn('Erreur lors de la validation admin en Firestore :', error);
    }

    return false;
};

const isAdminRoleValue = (value) => String(value || '').trim().toUpperCase() === 'ADMIN';

const buildAdminUserRecord = (user) => ({
    uid: user.uid,
    email: String(user.email || '').trim().toLowerCase(),
    role: 'ADMIN',
    statut: true,
    status: true,
    createdAt: serverTimestamp()
});

const hasAdminStatus = (data = {}) => {
    const value = data.statut ?? data.status;
    return value === true || value === 'true' || value === 'active' || value === 'ACTIF';
};

const ensureAdminUserRecord = async (user) => {
    if (!user?.email) return false;
    const allowed = await isAdminEmail(user.email);
    if (!allowed) return false;

    const uidRef = doc(db, 'users', user.uid);
    const emailDocId = String(user.email || '').trim().toLowerCase().replace(/[^a-z0-9]/gi, '') || user.uid;
    const emailRef = doc(db, 'users', emailDocId);
    let targetRef = uidRef;
    let userSnap = await getDoc(uidRef);

    if (!userSnap.exists()) {
        const emailSnap = await getDoc(emailRef);
        if (emailSnap.exists()) {
            userSnap = emailSnap;
            targetRef = emailRef;
        }
    }

    if (!userSnap.exists()) {
        await setDoc(uidRef, buildAdminUserRecord(user));
        userSnap = await getDoc(uidRef);
        targetRef = uidRef;
    }

    const existingData = userSnap.data() || {};
    if (!isAdminRoleValue(existingData.role) || !hasAdminStatus(existingData)) {
        await updateDoc(targetRef, {
            role: 'ADMIN',
            statut: true,
            status: true,
            email: String(user.email || '').trim().toLowerCase()
        });
    }

    if (targetRef.path !== uidRef.path) {
        await setDoc(uidRef, {
            ...(userSnap.data() || {}),
            uid: user.uid,
            email: String(user.email || '').trim().toLowerCase(),
            role: 'ADMIN',
            statut: true,
            status: true,
            updatedAt: serverTimestamp()
        }, { merge: true });
    }

    return true;
};

window.DanaAdmin = {
    DEFAULT_ADMIN_EMAIL,
    normalizeAdminEmailList,
    resolveAdminEmails,
    isAdminEmail
};

function createPageTransitionOverlay() {
    const existing = document.getElementById('page-transition-overlay');
    if (existing) return existing;

    const overlay = document.createElement('div');
    overlay.id = 'page-transition-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
        <div class="page-transition__core">
            <div class="page-transition__logo-wrap">
                <img src="images/logo.png" alt="Logo de la boulangerie" />
            </div>
            <span class="page-transition__label">Boulangerie Dana</span>
        </div>
    `;
    document.body.appendChild(overlay);
    return overlay;
}

function triggerPageTransition(targetUrl) {
    if (!targetUrl || document.body.classList.contains('is-transitioning')) return false;
    const overlay = createPageTransitionOverlay();
    document.body.classList.add('is-transitioning');
    requestAnimationFrame(() => {
        overlay.classList.add('is-active');
    });
    setTimeout(() => {
        window.location.href = targetUrl;
    }, 1500);
    return true;
}

function bindInternalPageNavigation() {
    document.querySelectorAll('a[href]').forEach((anchor) => {
        const href = anchor.getAttribute('href');
        if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('http')) return;
        if (anchor.target === '_blank') return;

        anchor.addEventListener('click', (event) => {
            if (event.defaultPrevented) return;
            event.preventDefault();
            triggerPageTransition(href);
        });
    });
}

// Initialisation Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

document.addEventListener("DOMContentLoaded", () => {
    const protectedPages = ["dashboard", "users", "products", "offers", "orders", "sales", "clients", "qr_cards", "loyalty", "stats", "admins", "settings"];
    const loginForm = document.getElementById("loginForm");
    const loginError = document.getElementById("login-error");

    bindInternalPageNavigation();
    createPageTransitionOverlay();

    if (document.body.classList.contains('auth-body')) {
        const intro = document.querySelector('.auth-intro');

        setTimeout(() => {
            document.body.classList.add('intro-started');
        }, 150);

        setTimeout(() => {
            if (intro) intro.classList.add('is-closing');
            document.body.classList.add('intro-closing');
        }, 1800);

        setTimeout(() => {
            document.body.classList.add('intro-finished');
        }, 2400);
    }

    if (loginForm) {
        const forgotPasswordLink = document.getElementById("forgot-password-link");
        const forgotPasswordModal = document.getElementById("forgot-password-modal");
        const forgotPasswordForm = document.getElementById("forgot-password-form");
        const forgotPasswordEmailInput = document.getElementById("forgot-password-email");
        const forgotPasswordSubmit = document.getElementById("forgot-password-submit");
        const forgotPasswordClose = document.getElementById("forgot-password-close");
        const forgotPasswordCancel = document.getElementById("forgot-password-cancel");

        const openForgotPasswordModal = () => {
            if (!forgotPasswordModal) return;
            forgotPasswordModal.classList.remove('hidden');
            forgotPasswordModal.setAttribute('aria-hidden', 'false');
            setTimeout(() => {
                if (forgotPasswordEmailInput) forgotPasswordEmailInput.focus();
            }, 50);
        };

        const closeForgotPasswordModal = () => {
            if (!forgotPasswordModal) return;
            forgotPasswordModal.classList.add('hidden');
            forgotPasswordModal.setAttribute('aria-hidden', 'true');
            if (forgotPasswordForm) forgotPasswordForm.reset();
        };

        if (forgotPasswordLink) {
            forgotPasswordLink.addEventListener('click', openForgotPasswordModal);
        }

        if (forgotPasswordClose) {
            forgotPasswordClose.addEventListener('click', closeForgotPasswordModal);
        }

        if (forgotPasswordCancel) {
            forgotPasswordCancel.addEventListener('click', closeForgotPasswordModal);
        }

        if (forgotPasswordModal) {
            forgotPasswordModal.addEventListener('click', (event) => {
                if (event.target === forgotPasswordModal) {
                    closeForgotPasswordModal();
                }
            });
        }

        if (forgotPasswordForm) {
            forgotPasswordForm.addEventListener('submit', async (event) => {
                event.preventDefault();
                const email = (forgotPasswordEmailInput?.value || '').trim();
                if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                    showToast('Saisissez une adresse e-mail valide.', 'error');
                    return;
                }

                forgotPasswordSubmit.disabled = true;
                forgotPasswordSubmit.textContent = 'Envoi en cours...';

                try {
                    await sendPasswordResetEmail(auth, email);
                    showToast('Un email de réinitialisation a été envoyé si ce compte existe.', 'success');
                    closeForgotPasswordModal();
                } catch (error) {
                    console.error('Erreur reset password:', error);
                    showToast('Impossible d’envoyer le lien pour le moment. Réessayez plus tard.', 'error');
                } finally {
                    forgotPasswordSubmit.disabled = false;
                    forgotPasswordSubmit.textContent = 'Envoyer le lien de réinitialisation';
                }
            });
        }

        loginForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const email = document.getElementById("email").value.trim();
            const password = document.getElementById("password").value.trim();
            const submitBtn = document.getElementById("btn-submit");

            submitBtn.textContent = "Connexion en cours...";
            submitBtn.disabled = true;
            loginError.textContent = "";

            try {
                if (!(await isAdminEmail(email))) {
                    await signOut(auth);
                    loginError.textContent = "Accès refusé : ce compte n’est pas administrateur.";
                    submitBtn.textContent = "Connexion";
                    submitBtn.disabled = false;
                    return;
                }

                const cred = await signInWithEmailAndPassword(auth, email, password);
                const user = cred.user;
                const isAllowedAdmin = await isAdminEmail(user.email);
                const uidRef = doc(db, "users", user.uid);
                const emailDocId = String(user.email || '').trim().toLowerCase().replace(/[^a-z0-9]/gi, '') || user.uid;
                const emailRef = doc(db, "users", emailDocId);
                let userSnap = await getDoc(uidRef);

                if (!userSnap.exists()) {
                    const emailSnap = await getDoc(emailRef);
                    if (emailSnap.exists()) {
                        userSnap = emailSnap;
                    }
                }

                if (!userSnap.exists() && isAllowedAdmin) {
                    await setDoc(uidRef, buildAdminUserRecord(user));
                    userSnap = await getDoc(uidRef);
                }

                if (userSnap.exists() && isAllowedAdmin && (isAdminRoleValue(userSnap.data().role) || hasAdminStatus(userSnap.data()))) {
                    triggerPageTransition("dashboard.html");
                } else if (isAllowedAdmin) {
                    await updateDoc(uidRef, {
                        role: 'ADMIN',
                        statut: true,
                        status: true,
                        email: String(user.email || '').trim().toLowerCase()
                    });
                    if (emailDocId && emailDocId !== user.uid) {
                        await setDoc(emailRef, {
                            uid: user.uid,
                            email: String(user.email || '').trim().toLowerCase(),
                            role: 'ADMIN',
                            statut: true,
                            status: true,
                            updatedAt: serverTimestamp()
                        }, { merge: true });
                    }
                    triggerPageTransition("dashboard.html");
                } else {
                    await signOut(auth);
                    loginError.textContent = "Accès refusé : compte non administrateur.";
                    submitBtn.textContent = "Connexion";
                    submitBtn.disabled = false;
                }
            } catch (error) {
                console.error("Erreur de connexion :", error);
                loginError.textContent = "Identifiants invalides ou accès non autorisé.";
                submitBtn.textContent = "Connexion";
                submitBtn.disabled = false;
            }
        });
    }

    // Protection des pages Dashboard / Ventes / Stock / Équipe
    onAuthStateChanged(auth, async (user) => {
        const currentPath = window.location.pathname.toLowerCase();
        const currentFile = currentPath.split('/').pop() || 'index.html';
        const needsAdminAuth = protectedPages.some((page) => currentFile.includes(page) || currentPath.includes(page));

        if (!user && needsAdminAuth) {
            window.location.href = "index.html";
            return;
        }

        if (user) {
            if (!(await isAdminEmail(user.email))) {
                await signOut(auth);
                if (needsAdminAuth) {
                    window.location.href = "index.html";
                }
                return;
            }

            try {
                const isAllowedAdmin = await isAdminEmail(user.email);
                const uidRef = doc(db, "users", user.uid);
                const emailDocId = String(user.email || '').trim().toLowerCase().replace(/[^a-z0-9]/gi, '') || user.uid;
                const emailRef = doc(db, "users", emailDocId);
                let userSnap = await getDoc(uidRef);

                if (!userSnap.exists()) {
                    const emailSnap = await getDoc(emailRef);
                    if (emailSnap.exists()) {
                        userSnap = emailSnap;
                    }
                }

                if (!userSnap.exists() && isAllowedAdmin) {
                    await setDoc(uidRef, buildAdminUserRecord(user));
                    userSnap = await getDoc(uidRef);
                }

                const firestoreAdminRoleOk = userSnap.exists() && isAdminRoleValue(userSnap.data().role);
                const firestoreAdminStatusOk = userSnap.exists() && hasAdminStatus(userSnap.data());

                if (userSnap.exists() && isAllowedAdmin && (firestoreAdminRoleOk || firestoreAdminStatusOk)) {
                    if (currentFile === 'index.html' || currentFile === '' || currentPath === '/' || currentPath.includes('index')) {
                        triggerPageTransition("dashboard.html");
                    } else if (protectedPages.some((page) => currentFile.includes(page))) {
                        initAdminDashboard();
                    }
                } else if (isAllowedAdmin) {
                    await updateDoc(uidRef, {
                        role: 'ADMIN',
                        statut: true,
                        status: true,
                        email: String(user.email || '').trim().toLowerCase()
                    });
                    if (emailDocId && emailDocId !== user.uid) {
                        await setDoc(emailRef, {
                            uid: user.uid,
                            email: String(user.email || '').trim().toLowerCase(),
                            role: 'ADMIN',
                            statut: true,
                            status: true,
                            updatedAt: serverTimestamp()
                        }, { merge: true });
                    }
                    if (currentFile === 'index.html' || currentFile === '' || currentPath === '/' || currentPath.includes('index')) {
                        triggerPageTransition("dashboard.html");
                    } else if (protectedPages.some((page) => currentFile.includes(page))) {
                        initAdminDashboard();
                    }
                } else {
                    await signOut(auth);
                    if (needsAdminAuth) window.location.href = "index.html";
                }
            } catch (err) {
                console.error("Erreur vérification rôle :", err);
                await signOut(auth);
                if (needsAdminAuth) window.location.href = "index.html";
            }
        }
    });
});

let salesChartInstance = null;

function showToast(message, type = 'info') {
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
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.padding = '10px 12px';
    toast.style.borderRadius = '10px';
    toast.style.maxWidth = '320px';
    toast.style.fontSize = '13px';
    toast.style.boxShadow = '0 12px 30px rgba(0,0,0,0.25)';
    toast.style.color = '#fff';
    toast.style.background = type === 'error' ? 'rgba(239,68,68,0.9)' : (type === 'success' ? 'rgba(16,185,129,0.9)' : 'rgba(31,41,55,0.95)');
    root.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}

function renderSidebarAdminProfile() {
    const aside = document.querySelector('aside');
    const user = auth && auth.currentUser ? auth.currentUser : null;
    if (!aside || !user) return;

    let profileCard = aside.querySelector('.sidebar-user-card');
    if (!profileCard) {
        profileCard = document.createElement('div');
        profileCard.className = 'sidebar-user-card';
        const logoutButton = aside.querySelector('#logout-btn');
        if (logoutButton && logoutButton.parentElement) {
            aside.insertBefore(profileCard, logoutButton.parentElement);
        } else {
            aside.appendChild(profileCard);
        }
    }

    const displayName = String(user.displayName || user.email?.split('@')[0] || 'Admin').trim() || 'Admin';
    const email = String(user.email || 'admin@boulangerie.com').trim();
    const initials = displayName.charAt(0).toUpperCase();

    profileCard.innerHTML = `
        <div class="sidebar-user-avatar">${escapeHtml(initials)}</div>
        <div class="sidebar-user-meta">
            <span class="sidebar-user-name">${escapeHtml(displayName)}</span>
            <span class="sidebar-user-email">${escapeHtml(email)}</span>
        </div>
    `;
}

async function loadAdminProfile() {
    const user = auth.currentUser;
    const bubble = document.getElementById('profile-bubble');
    if (!user || !bubble) return;

    let profile = {};
    try {
        const snapshot = await getDoc(doc(db, 'users', user.uid));
        if (snapshot.exists()) profile = snapshot.data();
    } catch (error) {
        console.warn('Profil administrateur indisponible :', error);
    }

    const displayName = String(profile.name || profile.nom || user.displayName || user.email || user.uid || 'Admin').trim();
    const initial = displayName.charAt(0).toUpperCase();
    let profileContainer = bubble.closest('.admin-profile');
    if (!profileContainer) {
        profileContainer = document.createElement('div');
        profileContainer.className = 'admin-profile';
        bubble.parentElement.insertBefore(profileContainer, bubble);
        profileContainer.appendChild(bubble);
    }
    bubble.textContent = initial;
    bubble.setAttribute('aria-label', displayName);
    bubble.title = displayName;

    const existingName = profileContainer.querySelector('.admin-profile-name');
    if (existingName) existingName.remove();

    let logoutButton = profileContainer.querySelector('.admin-profile-logout');
    if (!logoutButton) {
        logoutButton = document.createElement('button');
        logoutButton.className = 'btn-ghost admin-profile-logout';
        logoutButton.type = 'button';
        logoutButton.setAttribute('aria-label', 'Se déconnecter');
        logoutButton.title = 'Se déconnecter';
        logoutButton.textContent = '⎋';
        profileContainer.appendChild(logoutButton);
        logoutButton.addEventListener('click', async () => {
            try {
                await signOut(auth);
                window.location.href = 'index.html';
            } catch (error) {
                console.error('Erreur de déconnexion :', error);
                showToast('Impossible de se déconnecter.', 'error');
            }
        });
    }
}
window.loadAdminProfile = loadAdminProfile;

function initResponsiveAdminUI() {
    const container = document.querySelector('.app-container');
    const aside = document.querySelector('.app-container aside');
    const header = document.querySelector('.app-header');
    if (!container || !aside) return;

    if (header) {
        header.classList.add('unified-admin-header');
        const currentFile = window.location.pathname.split('/').pop() || 'index.html';
        const isDashboard = currentFile === 'dashboard.html' || currentFile === 'index.html' || currentFile === '';
        const logo = header.querySelector('img');
        if (logo && !header.querySelector('.header-brand-link')) {
            const parent = logo.parentElement;
            const brandLink = document.createElement('a');
            brandLink.className = 'header-brand-link';
            brandLink.href = 'dashboard.html';
            brandLink.setAttribute('aria-label', 'Retour au Dashboard');
            parent.insertBefore(brandLink, logo);
            brandLink.appendChild(logo);
        }
    }

    let menuToggle = document.getElementById('menu-toggle');
    if (!menuToggle && header) {
        menuToggle = document.createElement('button');
        menuToggle.id = 'menu-toggle';
        menuToggle.className = 'btn-ghost mobile-menu-button';
        menuToggle.type = 'button';
        menuToggle.setAttribute('aria-label', 'Ouvrir le menu');
        menuToggle.textContent = '☰';

        const rightGroup = header.querySelector('.header-right');
        if (rightGroup) {
            rightGroup.insertBefore(menuToggle, rightGroup.firstChild);
        } else {
            header.appendChild(menuToggle);
        }
    }

    let overlay = document.getElementById('mobile-sidebar-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'mobile-sidebar-overlay';
        overlay.className = 'mobile-sidebar-overlay';
        document.body.appendChild(overlay);
    }
    overlay.classList.remove('is-visible');
    container.classList.remove('sidebar-open');

    const closeMenu = () => {
        container.classList.remove('sidebar-open');
        overlay.classList.remove('is-visible');
        if (menuToggle) menuToggle.setAttribute('aria-expanded', 'false');
    };
    if (menuToggle && !menuToggle.hasAttribute('data-responsive-bound')) {
        menuToggle.setAttribute('data-responsive-bound', 'true');
        menuToggle.addEventListener('click', event => {
            event.preventDefault();
            const open = container.classList.toggle('sidebar-open');
            overlay.classList.toggle('is-visible', open);
            menuToggle.setAttribute('aria-expanded', String(open));
        });
    }
    if (!overlay.hasAttribute('data-responsive-bound')) {
        overlay.setAttribute('data-responsive-bound', 'true');
        overlay.addEventListener('click', closeMenu);
    }
    aside.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));

    const applyTableLabels = () => {
        document.querySelectorAll('table').forEach(table => {
            const labels = [...table.querySelectorAll('thead th')].map(cell => cell.textContent.trim());
            table.querySelectorAll('tbody tr').forEach(row => {
                [...row.children].forEach((cell, index) => {
                    if (labels[index] && !cell.hasAttribute('data-label')) cell.setAttribute('data-label', labels[index]);
                });
            });
        });
    };
    applyTableLabels();
    if (!document.body.hasAttribute('data-table-label-observer')) {
        document.body.setAttribute('data-table-label-observer', 'true');
        new MutationObserver(applyTableLabels).observe(document.body, { childList: true, subtree: true });
    }
}

function initAdminDashboard() {
    // Add compact layout class globally to make UI denser
    try { document.body.classList.add('compact'); } catch(e) { /* ignore */ }
    initResponsiveAdminUI();
    loadAdminProfile();
    renderSidebarAdminProfile();

    // Gestion de la déconnexion
    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
            signOut(auth).then(() => {
                triggerPageTransition("index.html");
            });
        });
    }

    // Menu mobile: toggle sidebar
    try {
        const appContainer = document.querySelector('.app-container');
        const menuToggle = document.getElementById('menu-toggle');
        if (menuToggle && appContainer && !menuToggle.hasAttribute('data-responsive-bound')) {
            menuToggle.addEventListener('click', (e) => {
                e.preventDefault();
                appContainer.classList.toggle('sidebar-open');
            });
        }

        // Prevent '#' links from navigating and set active state
        const sidebarLinks = document.querySelectorAll('aside .sidebar-menu a');
        sidebarLinks.forEach(a => {
            if (a.getAttribute('href') === '#') {
                a.addEventListener('click', (ev) => ev.preventDefault());
            }
        });

        // Highlight current page link
        const currentFile = window.location.pathname.split('/').pop() || 'index.html';
        sidebarLinks.forEach(a => {
            const href = a.getAttribute('href');
            if (!href) return;
            // Normalize
            const hrefFile = href.split('/').pop();
            if (hrefFile === currentFile) {
                a.classList.add('active');
            } else {
                a.classList.remove('active');
            }
        });
    } catch (e) {
        console.warn('Menu toggle init error', e);
    }

    // Personalised welcome (use email local-part)
    try {
        const user = auth.currentUser;
        if (user && user.email) {
            const local = user.email.split('@')[0] || '';
            // replace separators with space and take first token as given name
            const cleaned = local.replace(/[._\-]/g, ' ').trim();
            const name = cleaned.split(' ')[0] || cleaned || 'Administrateur';
            const displayName = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
            const welcomeEl = document.getElementById('dashboard-welcome');
            if (welcomeEl) welcomeEl.textContent = `Bonjour ${displayName}, comment allez-vous aujourd'hui?`;
            const profile = document.getElementById('profile-bubble');
            if (profile) profile.textContent = displayName.charAt(0).toUpperCase();
        }
    } catch (e) { console.warn('Welcome personalization error', e); }

    // Écouteurs en temps réel Firestore
    const currentAdminFile = window.location.pathname.split('/').pop() || 'index.html';
        if (!['dashboard.html', 'products.html', 'orders.html', 'sales.html', 'loyalty.html', 'settings.html', 'stats.html'].includes(currentAdminFile)) {
            setupDashboardRealtimeListeners();
        }
    setupUnifiedAdminModules();
    import('./admin-scan.js').catch(error => console.error('Scanner admin indisponible :', error));

    const today = new Date();
    const user = auth.currentUser;
    if (user && user.email) {
        const local = user.email.split('@')[0] || '';
        const cleaned = local.replace(/[._\-]/g, ' ').trim();
        const name = cleaned.split(' ')[0] || cleaned || 'Administrateur';
        const displayName = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
        const profile = document.getElementById('profile-bubble');
        if (profile) profile.textContent = displayName.charAt(0).toUpperCase();
    }

    // Clients search / add bindings (global in case page present)
    const clientsSearch = document.getElementById('clients-search');
    if (clientsSearch) {
        let debounce = null;
        clientsSearch.addEventListener('input', () => {
            if (debounce) clearTimeout(debounce);
            debounce = setTimeout(() => applyClientsFilterAndRender(), 200);
        });
    }
    const btnAddClient = document.getElementById('btn-add-client');
    if (btnAddClient) btnAddClient.addEventListener('click', () => openClientModal(null, 'create'));

    // Chart range selector (dashboard)
    const chartRangeEl = document.getElementById('chart-range');
    if (chartRangeEl) {
        chartRangeEl.addEventListener('change', () => {
            const period = Number(chartRangeEl.value) || 30;
            const label = document.getElementById('chart-range-label');
            if (label) label.textContent = period + ' jours';
            try { renderSalesChartForPeriod(period); } catch(e) { console.warn('Chart update failed', e); }
        });
    }
}

function setupUnifiedAdminModules() {
    const currentFile = window.location.pathname.split('/').pop() || 'index.html';

    if (currentFile.includes('orders')) {
        initOrdersPage();
    }
}

function initProductsPage() {
    const searchEl = document.getElementById('products-search');
    const addBtn = document.getElementById('btn-add-product');

    if (searchEl) {
        searchEl.addEventListener('input', () => renderProductsTableFromCache());
    }
    if (addBtn) {
        addBtn.addEventListener('click', () => openProductModal(null));
    }

    renderProductsTableFromCache();
}

function renderProductsTableFromCache() {
    const tbody = document.getElementById('products-table-body');
    if (!tbody) return;

    const q = (document.getElementById('products-search')?.value || '').trim().toLowerCase();
    const list = Array.isArray(window.productsCache) ? window.productsCache : [];
    const filtered = q ? list.filter(item => {
        const name = (item.name || item.nom || '').toString().toLowerCase();
        const category = (item.category || '').toString().toLowerCase();
        return name.includes(q) || category.includes(q);
    }) : list;

    tbody.innerHTML = '';
    if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Aucun produit trouvé.</td></tr>';
        return;
    }

    filtered.forEach((product) => {
        const tr = document.createElement('tr');
        const stock = Number(product.stock || 0);
        const status = stock > 0 ? 'Disponible' : 'Rupture';
        tr.innerHTML = `
            <td>${escapeHtml(product.name || product.nom || 'Produit')}</td>
            <td>${escapeHtml(product.category || 'Divers')}</td>
            <td>${Number(product.price || 0).toLocaleString()} FC</td>
            <td>${stock}</td>
            <td><span class="badge" style="background:${status === 'Disponible' ? 'rgba(16,185,129,0.15);color:#4ade80' : 'rgba(239,68,68,0.15);color:#fca5a5'};">${status}</span></td>
            <td style="text-align:right;">
                <button class="btn-ghost product-edit-btn" data-id="${product.id || ''}" type="button">Modifier</button>
                <button class="btn-ghost product-delete-btn" data-id="${product.id || ''}" type="button" style="margin-left:6px;">Supprimer</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.product-edit-btn').forEach((btn) => {
        btn.addEventListener('click', () => openProductModal({ id: btn.dataset.id, ...list.find(item => item.id === btn.dataset.id) }));
    });
    tbody.querySelectorAll('.product-delete-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            if (!id) return;
            if (!window.confirm('Supprimer ce produit ?')) return;
            try {
                await deleteDoc(doc(db, 'products', id));
                showToast('Produit supprimé.', 'success');
            } catch (error) {
                console.error('Erreur suppression produit :', error);
                showToast('Erreur lors de la suppression.', 'error');
            }
        });
    });
}

function openProductModal(product) {
    const modal = document.createElement('div');
    modal.className = 'user-modal-backdrop';
    modal.innerHTML = `
        <div class="user-modal-dialog">
            <div class="user-modal-header">
                <h3>${product && product.id ? 'Modifier le produit' : 'Ajouter un produit'}</h3>
                <button type="button" class="btn-ghost product-modal-close">✕</button>
            </div>
            <form id="product-form" class="user-modal-form">
                <div class="user-modal-field">
                    <label>Nom</label>
                    <input id="product-name" type="text" value="${escapeHtml(product?.name || product?.nom || '')}" required />
                </div>
                <div class="user-modal-field">
                    <label>Catégorie</label>
                    <input id="product-category" type="text" value="${escapeHtml(product?.category || '')}" />
                </div>
                <div class="user-modal-field">
                    <label>Prix (FC)</label>
                    <input id="product-price" type="number" min="0" value="${Number(product?.price || 0)}" required />
                </div>
                <div class="user-modal-field">
                    <label>Stock</label>
                    <input id="product-stock" type="number" min="0" value="${Number(product?.stock || 0)}" required />
                </div>
                <div class="user-modal-actions">
                    <button type="button" class="btn-ghost product-modal-close">Annuler</button>
                    <button type="submit" class="btn">${product && product.id ? 'Enregistrer' : 'Créer'}</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(modal);

    modal.querySelectorAll('.product-modal-close').forEach((el) => {
        el.addEventListener('click', () => modal.remove());
    });

    document.getElementById('product-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const payload = {
            name: document.getElementById('product-name').value.trim(),
            category: document.getElementById('product-category').value.trim() || 'Divers',
            price: Number(document.getElementById('product-price').value || 0),
            stock: Number(document.getElementById('product-stock').value || 0),
            updatedAt: serverTimestamp()
        };

        try {
            if (product && product.id) {
                await updateDoc(doc(db, 'products', product.id), payload);
                showToast('Produit mis à jour.', 'success');
            } else {
                await addDoc(collection(db, 'products'), { ...payload, createdAt: serverTimestamp() });
                showToast('Produit ajouté.', 'success');
            }
            modal.remove();
        } catch (error) {
            console.error('Erreur sauvegarde produit :', error);
            showToast('Erreur lors de la sauvegarde.', 'error');
        }
    });
}

function initOrdersPage() {
    const ordersSearchEl = document.getElementById('orders-search');
    if (ordersSearchEl) {
        ordersSearchEl.addEventListener('input', () => applyOrdersFilterAndRender());
    }
    const ordersFilterStatus = document.getElementById('orders-filter-status');
    if (ordersFilterStatus) {
        ordersFilterStatus.addEventListener('change', () => applyOrdersFilterAndRender());
    }
    applyOrdersFilterAndRender();
}

function initSalesPage() {
    const periodEl = document.getElementById('sales-period');
    if (periodEl) {
        periodEl.addEventListener('change', () => {
            const value = Number(periodEl.value) || 30;
            renderSalesChartForPeriod(value, 'sales-chart');
        });
    }
    renderSalesChartForPeriod(30, 'sales-chart');

    const salesBody = document.getElementById('sales-table-body');
    if (salesBody) {
        const orders = Array.isArray(window.ordersCache) ? window.ordersCache : [];
        salesBody.innerHTML = '';
        if (!orders.length) {
            salesBody.innerHTML = '<tr><td colspan="4" class="empty-state">Aucune vente pour le moment.</td></tr>';
            return;
        }

        orders.slice().sort((a, b) => {
            const ta = a.createdAt && a.createdAt.toDate ? a.createdAt.toDate().getTime() : 0;
            const tb = b.createdAt && b.createdAt.toDate ? b.createdAt.toDate().getTime() : 0;
            return tb - ta;
        }).forEach((order) => {
            const productName = Array.isArray(order.items) && order.items.length ? order.items.map(item => item.name || item.productName || 'Produit').join(', ') : 'Commande';
            const qty = Array.isArray(order.items) ? order.items.reduce((sum, item) => sum + Number(item.qty || item.quantity || 1), 0) : 1;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${order.createdAt && order.createdAt.toDate ? order.createdAt.toDate().toLocaleString() : 'Récemment'}</td>
                <td>${escapeHtml(productName)}</td>
                <td>${qty}</td>
                <td>${Number(order.totalAmount || 0).toLocaleString()} FC</td>
            `;
            salesBody.appendChild(tr);
        });
    }
}

function initQrCardsPage() {
    const grid = document.getElementById('qr-grid');
    if (!grid) return;

    const clients = Array.isArray(window.clientsCache) ? window.clientsCache : [];
    grid.innerHTML = '';
    if (!clients.length) {
        grid.innerHTML = '<div class="empty-state">Aucun client disponible.</div>';
        return;
    }

    const qEl = document.getElementById('qr-search');
    const query = qEl ? qEl.value.trim().toLowerCase() : '';
    const filtered = query ? clients.filter(c => {
        const name = (c.nom || c.name || '').toLowerCase();
        const email = (c.email || '').toLowerCase();
        return name.includes(query) || email.includes(query);
    }) : clients;

    filtered.forEach((client) => {
        const card = document.createElement('div');
        card.className = 'panel';
        card.style.padding = '16px';
        card.innerHTML = `
            <div style="display:flex;justify-content:center;margin-bottom:10px;">
                <div id="qr-${escapeHtml(client.id || client.uid || client.email || Math.random().toString(16))}" style="background:#fff;padding:12px;border-radius:12px;"></div>
            </div>
            <h3 style="margin:0 0 4px;">${escapeHtml(client.nom || client.name || 'Client')}</h3>
            <div style="color:var(--text-muted);font-size:12px;">${escapeHtml(client.email || 'Sans email')}</div>
        `;
        grid.appendChild(card);

        const qrNode = card.querySelector('[id^="qr-"]');
        if (qrNode && window.QRCode) {
            const code = client.email || client.id || client.uid || 'boulangerie-dana';
            window.QRCode.toCanvas(qrNode, code, { width: 140 }, function(error) {
                if (error) console.error('Erreur QR:', error);
            });
        }
    });

    if (qEl) {
        qEl.addEventListener('input', () => initQrCardsPage());
    }
}

function initLoyaltyPage() {
    const tbody = document.getElementById('loyalty-table-body');
    if (!tbody) return;

    const clients = Array.isArray(window.clientsCache) ? window.clientsCache : [];
    const q = (document.getElementById('loyalty-search')?.value || '').trim().toLowerCase();
    const rows = q ? clients.filter(c => ((c.nom || c.name || '').toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q))) : clients;

    tbody.innerHTML = '';
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Aucune donnée fidélité.</td></tr>';
        return;
    }

    rows.forEach((client) => {
        const tr = document.createElement('tr');
        const points = Number(client.points || client.loyaltyPoints || 0);
        const ordersCount = Number(client.ordersCount || 0);
        tr.innerHTML = `
            <td>${escapeHtml(client.nom || client.name || 'Client')}</td>
            <td>${points}</td>
            <td>${ordersCount}</td>
            <td style="text-align:right;">
                <button type="button" class="btn-ghost" data-id="${client.id || client.uid || ''}">Voir</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById('loyalty-search')?.addEventListener('input', () => initLoyaltyPage());
}

function initStatsPage() {
    const orders = Array.isArray(window.ordersCache) ? window.ordersCache : [];
    const clients = Array.isArray(window.clientsCache) ? window.clientsCache : [];
    const products = Array.isArray(window.productsCache) ? window.productsCache : [];

    const caTotal = orders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
    const ordersCount = orders.length;
    const clientsCount = clients.length;
    const soldProducts = products.reduce((sum, product) => sum + Number(product.stock || 0), 0);

    document.getElementById('stat-ca').textContent = `${caTotal.toLocaleString()} FC`;
    document.getElementById('stat-orders').textContent = ordersCount.toString();
    document.getElementById('stat-clients').textContent = clientsCount.toString();
    document.getElementById('stat-products').textContent = soldProducts.toString();

    renderStatsMonthChart(orders);
    renderStatsCategoryChart(products);
}

function renderStatsMonthChart(orders) {
    const canvas = document.getElementById('stats-chart-month');
    if (!canvas || !window.Chart) return;

    const monthMap = {};
    orders.forEach((order) => {
        if (!order.createdAt) return;
        const date = order.createdAt.toDate ? order.createdAt.toDate() : new Date(order.createdAt);
        const label = `${date.getMonth() + 1}/${date.getFullYear()}`;
        monthMap[label] = (monthMap[label] || 0) + Number(order.totalAmount || 0);
    });

    const labels = Object.keys(monthMap).slice(-6);
    const values = labels.map(label => monthMap[label]);

    new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels.length ? labels : ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin'],
            datasets: [{
                label: 'CA',
                data: values.length ? values : [0, 0, 0, 0, 0, 0],
                backgroundColor: 'rgba(217,119,6,0.75)'
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
}

function renderStatsCategoryChart(products) {
    const canvas = document.getElementById('stats-chart-categories');
    if (!canvas || !window.Chart) return;

    const map = {};
    products.forEach((product) => {
        const category = product.category || 'Divers';
        map[category] = (map[category] || 0) + Number(product.stock || 0);
    });

    const labels = Object.keys(map);
    const values = labels.map(label => map[label]);

    new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: labels.length ? labels : ['Pain', 'Viennoiserie', 'Pâtisserie'],
            datasets: [{
                data: values.length ? values : [30, 25, 15],
                backgroundColor: ['#d97706', '#f59e0b', '#fbbf24']
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
}

function initSettingsPage() {
    const form = document.getElementById('settings-form');
    if (!form) return;

    const stored = JSON.parse(localStorage.getItem('boulangerie-settings') || '{}');
    const keys = ['shop-name', 'shop-phone', 'shop-address', 'points-per-euro', 'reward-threshold', 'qr-code', 'shop-url'];
    keys.forEach((id) => {
        const el = document.getElementById(id);
        if (el && stored[id]) el.value = stored[id];
    });

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        const payload = {};
        keys.forEach((id) => {
            const el = document.getElementById(id);
            if (el) payload[id] = el.value;
        });
        localStorage.setItem('boulangerie-settings', JSON.stringify(payload));
        showToast('Paramètres enregistrés.', 'success');
    });
}


function setupDashboardRealtimeListeners() {
    // 1. Écoute des Ventes (Orders) pour le Cockpit & l'onglet Ventes
    const ordersRef = collection(db, "orders");
    onSnapshot(ordersRef, (snapshot) => {
        let totalRevenue = 0;
        let confirmedOrdersCount = 0;
        const salesList = [];

        snapshot.forEach((docSnap) => {
            const data = docSnap.val ? docSnap.val() : docSnap.data();
            salesList.push({ id: docSnap.id, ...data });

            if (data.status === "CONFIRMED") {
                totalRevenue += Number(data.totalAmount || 0);
                confirmedOrdersCount++;
            }
        });

        // Mise à jour des KPI sur le dashboard
        updateElementText("kpi-revenue", totalRevenue.toLocaleString() + " FC");
        updateElementText("kpi-orders", confirmedOrdersCount);

        // Cache orders for filtering/search
        window.ordersCache = salesList.slice();

        // Rendu du tableau des ventes et commandes si présent dans la page
        renderSalesTable(salesList);
        renderSalesChart(salesList);
        renderRecentActivities(salesList);
        renderTopProducts(salesList);
        applyOrdersFilterAndRender();

        // Update dashboard UI if present
        try { updateDashboardUI(); } catch (e) { /* ignore if dashboard not present */ }
    });

    // 2. Écoute des Utilisateurs (Clients et Employés)
    const usersRef = collection(db, "users");
    onSnapshot(usersRef, (snapshot) => {
        let clientsCount = 0;
        const teamList = [];
        const clientsList = [];

        snapshot.forEach((docSnap) => {
            const user = docSnap.data();
            if (user.role === "CLIENT") {
                clientsCount++;
                clientsList.push({ id: docSnap.id, ...user });
            } else if (user.role === "AGENT") {
                teamList.push({ id: docSnap.id, ...user });
            }
        });

        // Keep a local cache for client-side filtering/search
        window.clientsCache = clientsList.slice();

        updateElementText("kpi-clients", clientsCount);
        updateElementText("kpi-team", teamList.length);

        renderTeamTable(teamList);
        // Use filtered render to respect any search/filter UI
        applyClientsFilterAndRender();

        // Update dashboard UI if present
        try { updateDashboardUI(); } catch (e) { /* ignore */ }
    });

    // 3. Écoute des Produits et Stocks (Collection products)
    const productsRef = collection(db, "products");
    onSnapshot(productsRef, (snapshot) => {
        const productsList = [];
        snapshot.forEach((docSnap) => {
            productsList.push({ id: docSnap.id, ...docSnap.data() });
        });
        // Cache products for dashboard
        window.productsCache = productsList.slice();

        renderStockManagement(productsList);
        renderLowStock(productsList);

        // Update dashboard UI if present
        try { updateDashboardUI(); } catch (e) { /* ignore */ }
    });

    // Bind orders page search & filter
    const ordersSearchEl = document.getElementById('orders-search');
    if (ordersSearchEl) {
        let debounce = null;
        ordersSearchEl.addEventListener('input', () => {
            if (debounce) clearTimeout(debounce);
            debounce = setTimeout(() => applyOrdersFilterAndRender(), 200);
        });
    }
    const ordersFilterStatus = document.getElementById('orders-filter-status');
    if (ordersFilterStatus) ordersFilterStatus.addEventListener('change', () => applyOrdersFilterAndRender());
}

function applyOrdersFilterAndRender() {
    const qEl = document.getElementById('orders-search');
    const statusEl = document.getElementById('orders-filter-status');
    const q = qEl ? String(qEl.value||'').trim().toLowerCase() : '';
    const status = statusEl ? String(statusEl.value||'') : '';
    const cache = Array.isArray(window.ordersCache) ? window.ordersCache : [];

    let filtered = cache.slice();
    if (status) filtered = filtered.filter(o => (o.status||'').toString() === status);
    if (q) {
        filtered = filtered.filter(o => {
            const client = (o.clientName||o.customerName||o.client||o.customer||'').toString().toLowerCase();
            const id = (o.id||'').toString().toLowerCase();
            const amount = (o.totalAmount||'').toString().toLowerCase();
            return client.includes(q) || id.includes(q) || amount.includes(q);
        });
    }
    renderOrdersTable(filtered);
}

function renderOrdersTable(orders) {
    const tbody = document.getElementById('orders-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!Array.isArray(orders) || orders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:20px;">Aucune commande trouvée.</td></tr>';
        return;
    }

    orders.forEach(o => {
        const tr = document.createElement('tr');
        tr.className = 'border-b border-zinc-800 hover:bg-zinc-900/50 transition';
        const dateStr = o.createdAt && o.createdAt.toDate ? o.createdAt.toDate().toLocaleString() : (o.createdAt||'—');
        const client = o.clientName || o.customerName || o.client || o.customer || 'Client inconnu';
        const itemsSummary = Array.isArray(o.items) ? o.items.length + ' articles' : (Array.isArray(o.products) ? o.products.length + ' articles' : (o.itemsOrdered ? (o.itemsOrdered.length+' articles') : '—'));
        const amount = o.totalAmount != null ? (o.totalAmount + ' FC') : '—';
        const statusBadge = `<span class="px-2 py-1 rounded text-xs ${o.status==='CONFIRMED' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}">${o.status||'EN COURS'}</span>`;
        tr.innerHTML = `
            <td class="py-3 px-4 text-zinc-400 text-sm">${dateStr}</td>
            <td class="py-3 px-4 text-zinc-300">${escapeHtml(client)}</td>
            <td class="py-3 px-4">${escapeHtml(itemsSummary)}</td>
            <td class="py-3 px-4 text-emerald-400 font-semibold">${escapeHtml(amount)}</td>
            <td class="py-3 px-4">${statusBadge}</td>
            <td class="py-3 px-4">
                <button class="btn-view-order" data-id="${o.id||''}" style="margin-right:8px;background:transparent;border:1px solid rgba(255,255,255,0.04);padding:6px 8px;border-radius:6px;color:var(--text-muted);">Voir</button>
                <button class="btn-action-disabled" title="Modification désactivée par les règles Firestore" style="background:rgba(255,255,255,0.03);border:none;padding:6px 8px;border-radius:6px;color:var(--text-muted);cursor:not-allowed;">Modifier</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.btn-view-order').forEach(btn => btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const order = Array.isArray(window.ordersCache) ? window.ordersCache.find(x => x.id==id) : null;
        openOrderModal(order);
    }));
}

function openOrderModal(order) {
    if (!order) return alert('Données de la commande indisponibles.');
    let modal = document.getElementById('order-modal-root');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'order-modal-root';
        modal.style.position = 'fixed';
        modal.style.inset = '0';
        modal.style.background = 'rgba(0,0,0,0.6)';
        modal.style.display = 'flex';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';
        modal.style.zIndex = '9999';
        document.body.appendChild(modal);
    }

    const dateStr = order.createdAt && order.createdAt.toDate ? order.createdAt.toDate().toLocaleString() : (order.createdAt||'—');
    const client = order.clientName || order.customerName || order.client || order.customer || 'Client inconnu';

    let itemsHtml = '';
    const possibleFields = ['items','products','cart','orderItems','articles','itemsOrdered','lines'];
    let items = null;
    for (const k of possibleFields) { if (order[k] && Array.isArray(order[k])) { items = order[k]; break; } }
    if (!items && order.product && typeof order.product === 'object') items = [order.product];
    if (Array.isArray(items)) {
        itemsHtml = '<ul style="list-style:none;padding-left:0;margin:0;">' + items.map(it => {
            const name = typeof it === 'string' ? it : (it.name||it.productName||it.title||it.label||it.id||it.productId||'Article');
            const qty = typeof it === 'object' ? (it.qty||it.quantity||it.count||it.qte||1) : 1;
            return `<li style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.03);">${escapeHtml(name)} <span style="float:right;color:var(--text-muted)">x${qty}</span></li>`;
        }).join('') + '</ul>';
    } else {
        itemsHtml = '<p style="color:var(--text-muted)">Aucun détail d\'articles disponible.</p>';
    }

    modal.innerHTML = `
        <div style="background:var(--card-bg); padding:20px; width:640px; max-width:95%; border-radius:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <h3 style="margin:0">Détails de la commande</h3>
                <button id="order-modal-close" style="background:transparent;border:none;color:var(--text-muted);font-size:1.2rem;">✕</button>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
                <div><strong>Commande :</strong><div style="color:var(--text-muted)">${escapeHtml(order.id||'—')}</div></div>
                <div><strong>Date :</strong><div style="color:var(--text-muted)">${escapeHtml(dateStr)}</div></div>
                <div><strong>Client :</strong><div style="color:var(--text-muted)">${escapeHtml(client)}</div></div>
                <div><strong>Montant :</strong><div style="color:var(--text-muted)">${escapeHtml(order.totalAmount!=null?order.totalAmount+' FC':'—')}</div></div>
            </div>
            <div style="margin-bottom:12px;">
                <h4 style="margin:6px 0">Articles</h4>
                ${itemsHtml}
            </div>
            <div style="display:flex;justify-content:flex-end;gap:8px;">
                <button id="order-modal-close-2" style="background:transparent;border:1px solid rgba(255,255,255,0.04);padding:8px 12px;border-radius:8px;color:var(--text-muted);">Fermer</button>
            </div>
        </div>
    `;

    document.getElementById('order-modal-close').addEventListener('click', closeOrderModal);
    document.getElementById('order-modal-close-2').addEventListener('click', closeOrderModal);
}

function closeOrderModal() { const modal = document.getElementById('order-modal-root'); if (modal) modal.remove(); }

function updateElementText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function renderSalesTable(sales) {
    const tableBody = document.getElementById("sales-table-body");
    if (!tableBody) return;

    tableBody.innerHTML = "";
    sales.forEach(sale => {
        const tr = document.createElement("tr");
        tr.className = "border-b border-zinc-800 hover:bg-zinc-900/50 transition";
        tr.innerHTML = `
            <td class="py-3 px-4 text-zinc-300">${sale.clientName || 'Client Inconnu'}</td>
            <td class="py-3 px-4 text-emerald-400 font-semibold">${sale.totalAmount || 0} FC</td>
            <td class="py-3 px-4"><span class="px-2 py-1 rounded text-xs ${sale.status === 'CONFIRMED' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}">${sale.status || 'EN COURS'}</span></td>
            <td class="py-3 px-4 text-zinc-400 text-sm">${sale.createdAt?.toDate ? sale.createdAt.toDate().toLocaleString() : 'Récemment'}</td>
        `;
        tableBody.appendChild(tr);
    });
}

function renderClientsTable(clients) {
    const tableBody = document.getElementById("clients-table-body");
    if (!tableBody) return;

    tableBody.innerHTML = "";
    clients.forEach(client => {
        const tr = document.createElement("tr");
        tr.className = "border-b border-zinc-800 hover:bg-zinc-900/50 transition";
        const createdAt = client.createdAt && client.createdAt.toDate ? client.createdAt.toDate().toLocaleString() : (client.createdAt || '—');
        tr.innerHTML = `
            <td class="py-3 px-4 text-zinc-100 font-medium">${client.nom || client.name || 'Sans Nom'}</td>
            <td class="py-3 px-4 text-zinc-400">${client.email || 'N/A'}</td>
            <td class="py-3 px-4">${createdAt}</td>
            <td class="py-3 px-4 text-emerald-400">${client.solde || 0} FC</td>
            <td class="py-3 px-4">
                <button class="btn-view-client" data-id="${client.uid || client.id || client.userCode || ''}" style="margin-right:8px;background:transparent;border:1px solid rgba(255,255,255,0.04);padding:6px 8px;border-radius:6px;color:var(--text-muted);">Voir</button>
                <button class="btn-edit-client" data-id="${client.uid || client.id || client.userCode || ''}" style="margin-right:8px;background:rgba(255,255,255,0.03);border:none;padding:6px 8px;border-radius:6px;color:var(--text-main);">Modifier</button>
                <button class="btn-delete-client" data-id="${client.uid || client.id || client.userCode || ''}" style="background:#b91c1c;border:none;padding:6px 8px;border-radius:6px;color:white;">Supprimer</button>
            </td>
        `;
        tableBody.appendChild(tr);
    });

    // Bind actions
    tableBody.querySelectorAll('.btn-view-client').forEach(btn => btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        openClientModal(id, 'view');
    }));

    tableBody.querySelectorAll('.btn-edit-client').forEach(btn => btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        openClientModal(id, 'edit');
    }));

    tableBody.querySelectorAll('.btn-delete-client').forEach(btn => btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        if (!id) return alert('Impossible d\'identifier le client.');
        if (!confirm('Confirmer la suppression du client ? Cette opération est irréversible.')) return;
        try {
            await deleteDoc(doc(db, 'users', id));
            alert('Client supprimé.');
        } catch (err) {
            console.error('Erreur suppression client:', err);
            alert('Erreur lors de la suppression du client.');
        }
    }));
}

function renderTeamTable(team) {
    const tableBody = document.getElementById("team-table-body");
    if (!tableBody) return;

    tableBody.innerHTML = "";
    team.forEach(agent => {
        const tr = document.createElement("tr");
        tr.className = "border-b border-zinc-800 hover:bg-zinc-900/50 transition";
        tr.innerHTML = `
            <td class="py-3 px-4 text-zinc-100 font-medium">${agent.nom || 'Employé'}</td>
            <td class="py-3 px-4 text-zinc-400">${agent.userCode || 'N/A'}</td>
            <td class="py-3 px-4"><span class="px-2 py-1 rounded bg-emerald-500/20 text-emerald-400 text-xs">AGENT ACTIF</span></td>
        `;
        tableBody.appendChild(tr);
    });

    // Gestion du formulaire d'ajout d'employé
    const addAgentForm = document.getElementById("add-agent-form");
    if (addAgentForm && !addAgentForm.hasAttribute("data-bound")) {
        addAgentForm.setAttribute("data-bound", "true");
        addAgentForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const name = document.getElementById("agent-name").value;
            const code = document.getElementById("agent-code").value;
            const pin = document.getElementById("agent-pin").value;

            try {
                await setDoc(doc(db, "users", code), {
                    nom: name,
                    userCode: code,
                    pin: pin,
                    role: "AGENT",
                    status: true,
                    createdAt: serverTimestamp()
                });
                alert("Employé ajouté avec succès !");
                addAgentForm.reset();
            } catch (err) {
                console.error("Erreur ajout agent:", err);
                alert("Erreur lors de l'ajout de l'employé.");
            }
        });
    }
}

function renderStockManagement(products) {
    const container = document.getElementById("stock-products-container");
    if (!container) return;

    container.innerHTML = "";
    products.forEach(product => {
        const card = document.createElement("div");
        card.className = "bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 flex flex-col justify-between shadow-lg backdrop-blur-md";
        card.innerHTML = `
            <div>
                <div class="h-36 rounded-xl overflow-hidden mb-4 bg-zinc-800 flex items-center justify-center">
                    <img src="images/${product.imageUrl || 'pain3'}.png" alt="${product.name}" class="h-full object-cover" onerror="this.src='images/pain3.png'">
                </div>
                <h3 class="text-lg font-bold text-zinc-100">${product.name}</h3>
                <p class="text-emerald-400 font-semibold mb-3">${product.price} FC <span class="text-xs text-zinc-500">(Gros: ${product.wholesalePrice || 0} FC)</span></p>
            </div>
            <div>
                <label class="text-xs text-zinc-400 block mb-1">Stock journalier :</label>
                <div class="flex gap-2">
                    <input type="number" id="stock-input-${product.id}" value="${product.stock || 0}" class="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white w-full text-center font-bold">
                    <button onclick="updateStock('${product.id}')" class="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-medium transition">Mettre à jour</button>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

window.updateStock = async function(productId) {
    const input = document.getElementById(`stock-input-${productId}`);
    if (!input) return;
    const newStock = Number(input.value);

    try {
        await updateDoc(doc(db, "products", productId), {
            stock: newStock
        });
        alert("Stock mis à jour avec succès ! L'application mobile est synchronisée.");
    } catch (err) {
        console.error("Erreur mise à jour stock:", err);
        alert("Erreur lors de la mise à jour.");
    }
};

function renderSalesChart(sales, canvasId = "salesChart") {
    const ctx = document.getElementById(canvasId) || document.getElementById("salesChart") || document.getElementById("sales-chart");
    if (!ctx || !window.Chart) return;

    // Regroupement simple par date pour le graphique
    const salesByDate = {};
    sales.forEach(sale => {
        if (sale.status === "CONFIRMED" && sale.createdAt) {
            const dateStr = sale.createdAt.toDate ? sale.createdAt.toDate().toLocaleDateString() : 'Aujourd\'hui';
            salesByDate[dateStr] = (salesByDate[dateStr] || 0) + Number(sale.totalAmount || 0);
        }
    });

    const labels = Object.keys(salesByDate);
    const data = Object.values(salesByDate);

    if (salesChartInstance && salesChartInstance.ctx && salesChartInstance.ctx.canvas && salesChartInstance.ctx.canvas.id === ctx.id) {
        salesChartInstance.data.labels = labels;
        salesChartInstance.data.datasets[0].data = data;
        salesChartInstance.update();
    } else {
        salesChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels.length ? labels : ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'],
                datasets: [{
                    label: 'Chiffre d\'affaires (FC)',
                    data: data.length ? data : [0, 0, 0, 0, 0, 0, 0],
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#a1a1aa' } },
                    y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#a1a1aa' } }
                }
            }
        });
    }
}

// Affiche les dernières activités basées sur les ventes récentes
function renderRecentActivities(sales) {
    const container = document.getElementById('recent-activities');
    if (!container) return;

    container.innerHTML = '';
    if (!Array.isArray(sales) || sales.length === 0) {
        container.textContent = 'Aucune activité récente.';
        return;
    }

    // Trier par date de création (décroissant) si possible
    const sorted = sales.slice().sort((a, b) => {
        const ta = a.createdAt && a.createdAt.toDate ? a.createdAt.toDate().getTime() : 0;
        const tb = b.createdAt && b.createdAt.toDate ? b.createdAt.toDate().getTime() : 0;
        return tb - ta;
    }).slice(0, 6);

    const ul = document.createElement('ul');
    ul.style.listStyle = 'none';
    ul.style.paddingLeft = '0';
    ul.style.margin = '0';

    sorted.forEach(sale => {
        const li = document.createElement('li');
        li.style.padding = '8px 0';
        const clientName = sale.clientName || sale.customerName || sale.customer || sale.client || sale.user || 'Client inconnu';
        const amount = sale.totalAmount != null ? `${sale.totalAmount} FC` : '—';
        const when = sale.createdAt && sale.createdAt.toDate ? sale.createdAt.toDate().toLocaleString() : 'Récemment';
        const status = sale.status || 'EN COURS';
        li.innerHTML = `<strong>${clientName}</strong> — ${amount} <span style="color:var(--text-muted);font-size:0.9rem">(${status})</span><br/><small style="color:var(--text-muted)">${when}</small>`;
        ul.appendChild(li);
    });

    container.appendChild(ul);
}

// Liste des produits en stock faible
function renderLowStock(products) {
    const container = document.getElementById('low-stock-list');
    if (!container) return;

    if (!Array.isArray(products) || products.length === 0) {
        container.textContent = 'Aucun produit trouvé.';
        return;
    }

    // Filtrer uniquement les produits qui ont un champ stock numérique
    const productsWithStock = products.filter(p => typeof p.stock === 'number');
    if (productsWithStock.length === 0) {
        container.textContent = 'Aucun champ de stock détecté sur les produits.';
        return;
    }

    const LOW_THRESHOLD = 5; // valeur UI pour alerter
    const low = productsWithStock.filter(p => p.stock <= LOW_THRESHOLD).sort((a, b) => a.stock - b.stock);

    if (low.length === 0) {
        container.textContent = 'Aucun produit en stock faible.';
        return;
    }

    const ul = document.createElement('ul');
    ul.style.listStyle = 'none';
    ul.style.paddingLeft = '0';
    ul.style.margin = '0';

    low.forEach(p => {
        const li = document.createElement('li');
        li.style.padding = '8px 0';
        const name = p.name || p.nom || p.imageUrl || p.id || 'Produit';
        li.innerHTML = `<strong>${name}</strong> — <span style="color:var(--accent-gold);">${p.stock}</span> en stock`;
        ul.appendChild(li);
    });

    container.innerHTML = '';
    container.appendChild(ul);
}

// --- CLIENTS: filtering, searching, modal management ---
function applyClientsFilterAndRender() {
    const searchEl = document.getElementById('clients-search');
    const q = searchEl ? String(searchEl.value || '').trim().toLowerCase() : '';
    const cache = Array.isArray(window.clientsCache) ? window.clientsCache : [];

    if (!q) {
        renderClientsTable(cache);
        return;
    }

    const filtered = cache.filter(c => {
        const name = (c.nom || c.name || '').toString().toLowerCase();
        const email = (c.email || '').toString().toLowerCase();
        const id = (c.id || c.uid || c.userCode || '').toString().toLowerCase();
        return name.includes(q) || email.includes(q) || id.includes(q);
    });

    renderClientsTable(filtered);
}

async function openClientModal(id, mode) {
    // mode: 'view' | 'edit' | 'create'
    let client = null;
    if (id) {
        try {
            const snap = await getDoc(doc(db, 'users', id));
            if (snap.exists()) client = { id: snap.id, ...snap.data() };
        } catch (err) {
            console.error('Erreur lecture client:', err);
            alert('Erreur lors de la lecture du client.');
            return;
        }
    }

    // Build modal
    let modal = document.getElementById('client-modal-root');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'client-modal-root';
        modal.style.position = 'fixed';
        modal.style.inset = '0';
        modal.style.background = 'rgba(0,0,0,0.6)';
        modal.style.display = 'flex';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';
        modal.style.zIndex = '9999';
        document.body.appendChild(modal);
    }

    const isCreate = mode === 'create';
    const title = isCreate ? 'Ajouter un client' : (mode === 'edit' ? 'Modifier le client' : 'Détails du client');

    const nomVal = client ? (client.nom || client.name || '') : '';
    const emailVal = client ? (client.email || '') : '';
    const soldeVal = client ? (client.solde || 0) : 0;

    modal.innerHTML = `
        <div style="background:var(--card-bg); padding:20px; width:520px; max-width:95%; border-radius:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <h3 style="margin:0">${title}</h3>
                <button id="client-modal-close" style="background:transparent;border:none;color:var(--text-muted);font-size:1.2rem;">✕</button>
            </div>
            <form id="client-modal-form" style="display:flex;flex-direction:column;gap:8px;">
                <label>Nom complet</label>
                <input id="client-modal-name" type="text" value="${escapeHtml(nomVal)}" required />
                <label>Email</label>
                <input id="client-modal-email" type="email" value="${escapeHtml(emailVal)}" />
                <label>Solde (FC)</label>
                <input id="client-modal-solde" type="number" value="${escapeHtml(soldeVal)}" />
                <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px;">
                    ${isCreate ? `<button type="submit" id="client-modal-submit" style="background:var(--accent-brown);color:white;padding:8px 12px;border-radius:8px;border:none;">Créer</button>` : `<button type="submit" id="client-modal-submit" style="background:var(--accent-brown);color:white;padding:8px 12px;border-radius:8px;border:none;">Sauvegarder</button>`}
                    <button type="button" id="client-modal-cancel" style="background:transparent;border:1px solid rgba(255,255,255,0.04);padding:8px 12px;border-radius:8px;color:var(--text-muted);">Annuler</button>
                </div>
            </form>
        </div>
    `;

    document.getElementById('client-modal-close').addEventListener('click', closeClientModal);
    document.getElementById('client-modal-cancel').addEventListener('click', closeClientModal);

    const form = document.getElementById('client-modal-form');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('client-modal-name').value.trim();
        const email = document.getElementById('client-modal-email').value.trim();
        const solde = Number(document.getElementById('client-modal-solde').value) || 0;

        if (!name) return alert('Le nom est requis.');

        try {
            if (isCreate) {
                await addDoc(collection(db, 'users'), {
                    nom: name,
                    email: email || null,
                    solde: solde,
                    role: 'CLIENT',
                    createdAt: serverTimestamp()
                });
                alert('Client créé.');
            } else {
                if (!client || !client.id) return alert('Client introuvable.');
                await updateDoc(doc(db, 'users', client.id), {
                    nom: name,
                    email: email || null,
                    solde: solde
                });
                alert('Client mis à jour.');
            }
            closeClientModal();
        } catch (err) {
            console.error('Erreur sauvegarde client:', err);
            alert('Erreur lors de la sauvegarde.');
        }
    }, { once: true });
}

function closeClientModal() {
    const modal = document.getElementById('client-modal-root');
    if (modal) modal.remove();
}

function escapeHtml(str) {
    if (str == null) return '';
    return String(str).replace(/[&<>"']/g, function(m) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[m]; });
}


// Produits les plus vendus (aggrège différents schémas possibles d'articles dans les commandes)
function renderTopProducts(sales) {
    const container = document.getElementById('top-products-list') || document.getElementById('top-products-list-dashboard');
    if (!container) return;

    if (!Array.isArray(sales) || sales.length === 0) {
        container.textContent = 'Aucune commande trouvée pour calculer les produits les plus vendus.';
        return;
    }

    const possibleFields = ['items', 'products', 'cart', 'orderItems', 'articles', 'itemsOrdered', 'lines'];
    const map = new Map();

    sales.forEach(order => {
        let items = null;
        for (const k of possibleFields) {
            if (order[k] && Array.isArray(order[k])) { items = order[k]; break; }
        }
        // Some backends store a single 'product' field or productId and qty
        if (!items) {
            // try to detect a single product entry
            if (order.product && typeof order.product === 'object') items = [order.product];
        }

        if (!items) return;

        items.forEach(it => {
            // it may be a primitive (string id) or an object
            let id = null;
            let name = null;
            let qty = 1;

            if (typeof it === 'string') {
                id = it;
                name = it;
            } else if (typeof it === 'object') {
                id = it.productId || it.id || it.sku || it.code || it.product || null;
                name = it.name || it.productName || it.title || it.label || id;
                qty = Number(it.qty || it.quantity || it.count || it.qte || it.quantityOrdered || 1) || 1;
            }

            const key = id || name || JSON.stringify(it);
            const prev = map.get(key) || { name: name || key, qty: 0 };
            prev.qty += qty;
            map.set(key, prev);
        });
    });

    const arr = Array.from(map.entries()).map(([k, v]) => ({ id: k, name: v.name, qty: v.qty }));
    arr.sort((a, b) => b.qty - a.qty);

    if (arr.length === 0) {
        container.textContent = "Impossible de détecter des articles exploitables dans les commandes.";
        return;
    }

    const list = document.createElement('ol');
    list.style.paddingLeft = '16px';
    list.style.margin = '0';

    arr.slice(0, 10).forEach(entry => {
        const li = document.createElement('li');
        li.style.padding = '8px 0';
        li.innerHTML = `<strong>${entry.name}</strong> — <span style="color:var(--accent-gold)">${entry.qty}</span> vendus`;
        list.appendChild(li);
    });

    container.innerHTML = '';
    container.appendChild(list);
}

// Dashboard update utilities
function updateDashboardUI() {
    const orders = Array.isArray(window.ordersCache) ? window.ordersCache : [];
    const clients = Array.isArray(window.clientsCache) ? window.clientsCache : [];
    const products = Array.isArray(window.productsCache) ? window.productsCache : [];

    // KPI: clients
    const clientsCount = clients.length;
    updateElementText('kpi-clients', clientsCount || '—');

    // KPI: orders total
    const ordersCount = orders.length;
    updateElementText('kpi-orders', ordersCount || '—');

    // KPI: orders today
    const today = new Date();
    const isSameDay = (d) => {
        if (!d) return false;
        const t = d.toDate ? d.toDate() : new Date(d);
        return t.getFullYear() === today.getFullYear() && t.getMonth() === today.getMonth() && t.getDate() === today.getDate();
    };
    const ordersToday = orders.filter(o => isSameDay(o.createdAt)).length;
    updateElementText('kpi-orders-today', ordersToday || '—');

    // KPI: revenue
    const totalAmounts = orders.map(o => (o.totalAmount != null ? Number(o.totalAmount) : null)).filter(x => x !== null);
    const revenue = totalAmounts.length ? totalAmounts.reduce((a,b)=>a+b,0) : null;
    updateElementText('kpi-revenue', revenue != null ? revenue.toLocaleString() + ' FC' : '—');

    // KPI: products
    updateElementText('kpi-products', products.length || '—');

    // KPI: team
    const team = clients.filter(c => c.role === 'AGENT' || c.role === 'EMPLOYEE');
    updateElementText('kpi-team', team.length || '—');

    // Stock summary and top products
    renderStockSummary(products);
    renderTopProducts(orders);

    // Recent orders list on dashboard
    renderRecentOrders(orders);

    // Update chart according to selected range
    const rangeEl = document.getElementById('chart-range');
    const period = rangeEl ? Number(rangeEl.value) : 30;
    document.getElementById('chart-range-label') && (document.getElementById('chart-range-label').textContent = period + ' jours');
    renderSalesChartForPeriod(period);
}

function renderRecentOrders(orders) {
    const tbody = document.getElementById('recent-orders-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!Array.isArray(orders) || orders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:20px;">Aucune commande récente.</td></tr>';
        return;
    }
    const sorted = orders.slice().sort((a,b)=>{
        const ta = a.createdAt && a.createdAt.toDate ? a.createdAt.toDate().getTime() : 0;
        const tb = b.createdAt && b.createdAt.toDate ? b.createdAt.toDate().getTime() : 0;
        return tb - ta;
    }).slice(0,8);

    sorted.forEach(o => {
        const dateStr = o.createdAt && o.createdAt.toDate ? o.createdAt.toDate().toLocaleString() : (o.createdAt||'—');
        const client = o.clientName || o.customerName || o.client || o.customer || 'Client inconnu';
        const amount = o.totalAmount != null ? (o.totalAmount + ' FC') : '—';
        const status = o.status || '—';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="py-3 px-4">${escapeHtml(o.id||'—')}</td>
            <td class="py-3 px-4">${escapeHtml(client)}</td>
            <td class="py-3 px-4">${escapeHtml(amount)}</td>
            <td class="py-3 px-4">${escapeHtml(dateStr)}</td>
            <td class="py-3 px-4">${escapeHtml(status)}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderStockSummary(products) {
    const container = document.getElementById('stock-summary');
    if (!container) return;
    if (!Array.isArray(products) || products.length === 0) {
        container.textContent = 'Aucun produit trouvé.';
        return;
    }
    const productsWithStock = products.filter(p=>typeof p.stock === 'number');
    if (productsWithStock.length === 0) {
        container.textContent = 'Aucun champ stock détecté sur les produits.';
        return;
    }
    const LOW = 5;
    const low = productsWithStock.filter(p=>p.stock>0 && p.stock<=LOW).length;
    const out = productsWithStock.filter(p=>p.stock<=0).length;
    container.innerHTML = `<div><strong>Faible :</strong> ${low} &nbsp; <strong>Rupture :</strong> ${out}</div>`;
}

function renderSalesChartForPeriod(days, canvasId = "salesChart") {
    const orders = Array.isArray(window.ordersCache) ? window.ordersCache : [];
    if (!Array.isArray(orders) || orders.length === 0) {
        renderSalesChart([], canvasId);
        return;
    }
    const now = Date.now();
    const threshold = now - (days * 24 * 60 * 60 * 1000);
    const filtered = orders.filter(o => {
        const t = o.createdAt && o.createdAt.toDate ? o.createdAt.toDate().getTime() : (o.createdAt ? new Date(o.createdAt).getTime() : 0);
        return t >= threshold;
    });
    // Use existing renderSalesChart which reuses the chart instance
    renderSalesChart(filtered, canvasId);
}
