import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    onSnapshot, 
    doc, 
    updateDoc, 
    setDoc, 
    addTimestamp, 
    query, 
    where, 
    orderBy, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Configuration Firebase
const firebaseConfig = {
    apiKey: "AIzaSyCm0oABAGT_NedJp2Ib-ANc9cOLO1u4gXs",
    authDomain: "appboulangeriecongo-6e680.firebaseapp.com",
    projectId: "appboulangeriecongo-6e680",
    storageBucket: "appboulangeriecongo-6e680.firebasestorage.app",
    messagingSenderId: "552628602722",
    appId: "1:552628602722:web:faac488be1ddbce9acce3b"
};

// Initialisation Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.getElementById("loginForm");
    const loginError = document.getElementById("login-error");

    if (loginForm) {
        loginForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const email = document.getElementById("email").value.trim();
            const password = document.getElementById("password").value.trim();
            const submitBtn = document.getElementById("btn-submit");

            submitBtn.textContent = "Connexion en cours...";
            submitBtn.disabled = true;
            loginError.textContent = "";

            try {
                await signInWithEmailAndPassword(auth, email, password);
                window.location.href = "dashboard.html";
            } catch (error) {
                console.error("Erreur de connexion :", error);
                loginError.textContent = "Identifiants invalides ou accès non autorisé.";
                submitBtn.textContent = "Connexion";
                submitBtn.disabled = false;
            }
        });
    }

    // Protection des pages Dashboard / Ventes / Stock / Équipe
    onAuthStateChanged(auth, (user) => {
        const currentPath = window.location.pathname;
        if (!user && currentPath.includes("dashboard")) {
            window.location.href = "index.html";
        } else if (user && currentPath.includes("index.html")) {
            window.location.href = "dashboard.html";
        } else if (user) {
            initAdminDashboard();
        }
    });
});

let salesChartInstance = null;

function initAdminDashboard() {
    // Gestion de la déconnexion
    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
            signOut(auth).then(() => {
                window.location.href = "index.html";
            });
        });
    }

    // Écouteurs en temps réel Firestore
    setupDashboardRealtimeListeners();
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

        // Rendu du tableau des ventes si présent dans la page
        renderSalesTable(salesList);
        renderSalesChart(salesList);
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
                clientsList.push(user);
            } else if (user.role === "AGENT") {
                teamList.push({ id: docSnap.id, ...user });
            }
        });

        updateElementText("kpi-clients", clientsCount);
        updateElementText("kpi-team", teamList.length);

        renderTeamTable(teamList);
        renderClientsTable(clientsList);
    });

    // 3. Écoute des Produits et Stocks (Collection products)
    const productsRef = collection(db, "products");
    onSnapshot(productsRef, (snapshot) => {
        const productsList = [];
        snapshot.forEach((docSnap) => {
            productsList.push({ id: docSnap.id, ...docSnap.data() });
        });
        renderStockManagement(productsList);
    });
}

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
        tr.innerHTML = `
            <td class="py-3 px-4 text-zinc-100 font-medium">${client.nom || client.name || 'Sans Nom'}</td>
            <td class="py-3 px-4 text-zinc-400">${client.email || 'N/A'}</td>
            <td class="py-3 px-4 text-emerald-400">${client.solde || 0} FC</td>
        `;
        tableBody.appendChild(tr);
    });
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

function renderSalesChart(sales) {
    const ctx = document.getElementById("salesChart");
    if (!ctx) return;

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

    if (salesChartInstance) {
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