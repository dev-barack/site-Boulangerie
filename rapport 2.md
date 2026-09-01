# Rapport technique – Boulangerie DANA (référence pour l’application mobile)

## 1. Configuration Firebase exacte

Le site utilise Firebase Web SDK v10.8.0 avec la configuration suivante :

```js
const firebaseConfig = {
  apiKey: "AIzaSyA7YsFC0dtxU09zg8j3q6jv2UHoYQJqTRA",
  authDomain: "boulangerie-dana.firebaseapp.com",
  projectId: "boulangerie-dana",
  storageBucket: "boulangerie-dana.firebasestorage.app",
  messagingSenderId: "508760970095",
  appId: "1:508760970095:web:0be3c6fb78eb5426698e9a",
  measurementId: "G-53FLSWN3KF"
};
```

### Authentification actuelle

- L’authentification admin se fait via Firebase Authentication par email/mot de passe.
- Le flux principal utilise :
  - `signInWithEmailAndPassword(auth, email, password)`
  - `sendPasswordResetEmail(auth, email)`
- Les comptes client et agent ne sont pas conçus comme des comptes Firebase Auth standards dans le modèle actuel.
- Les rôles client/agent/admin sont gérés majoritairement dans Firestore via la collection `users`.

---

## 2. Structure des collections Firestore

### 2.1. `users`

Source de vérité principale pour les comptes applicatifs.

Champs principaux utilisés :

- `uid` : string — identifiant Firebase Auth si présent
- `email` : string — email principal (normalisé en minuscules)
- `phone` : string — téléphone du client / agent
- `telephone` : string — variante utilisée pour certains documents
- `nom` : string — nom complet
- `name` : string — variante utilisée selon écran
- `role` : string — valeurs attendues : `ADMIN`, `AGENT`, `CLIENT`
- `statut` : boolean — statut actif/inactif
- `status` : boolean — doublon de statut pour compatibilité
- `pin_hash` : string — hash SHA-256 du PIN
- `pin` : FieldValue/deleteField() — supprimé lors des mises à jour pour ne pas stocker le PIN brut
- `clientNumber` : string — identifiant public client, exemple `DANA-0001`
- `points` : number — points de fidélité
- `loyaltyPoints` : number — variante utilisée selon les écrans
- `createdAt` : timestamp / Date
- `updatedAt` : timestamp / Date

Notes importantes :

- Le site utilise une logique de compatibilité avec les deux champs `statut` et `status`.
- Le rôle est normalisé de façon insensible à la casse via `String(value || '').trim().toUpperCase()`.
- Le mail est normalisé avec `.trim().toLowerCase()`.
- Le PIN est hashé avec `CryptoJS.SHA256(pin).toString()` avant stockage.
- Les comptes client/agent ne doivent pas être créés dans Firebase Auth dans ce modèle.

### 2.2. `products`

Documents produits affichés dans l’interface d’administration et dans l’application mobile.

Champs principaux :

- `productId` : string
- `name` : string
- `category` : string
- `description` : string
- `price` : number
- `stock` : number
- `isAvailable` : boolean
- `imageUrl` : string
- `createdAt` : timestamp

Règles de gestion :

- `isAvailable` est calculé à partir de `stock > 0` et de la propriété `isAvailable !== false`.
- Le stock faible est détecté au seuil défini dans `settings/config` avec `stockAlertThreshold`.
- Les produits peuvent être ajoutés, modifiés ou masqués sans suppression physique si déjà vendus.

### 2.3. `orders`

Documents de commande.

Champs principaux :

- `clientId` : string — référence au client dans `users`
- `items` : array
  - `productId` : string
  - `productName` : string
  - `price` : number
  - `quantity` : number
- `total` : number
- `status` : string
- `createdAt` : timestamp
- `updatedAt` : timestamp
- `statusHistory` : array
  - `changedBy` : string
  - `fromStatus` : string
  - `toStatus` : string
  - `at` : timestamp
- `loyaltyAwarded` : boolean
- `loyaltyPointsAwarded` : number

Statuts possibles gérés :

- `PENDING`
- `VALIDATED`
- `READY`
- `PICKED_UP`
- `RETRIEVED`
- `CANCELLED`
- `COMPLETED`
- `IN_PROGRESS`

Le statut est normalisé côté frontend par la fonction `normalizeOrderStatus()`.

Règles métier :

- Lorsqu’une commande est validée/remise/retrouvée, le système peut attribuer des points de fidélité.
- Si la commande est annulée, les points déjà attribués peuvent être retirés.
- Les points sont mis à jour dans le document client dans `users/{clientId}` via `increment(...)`.

### 2.4. `settings`

Document central de configuration du site.

Document principal : `settings/config`

Champs principaux :

- `adminEmails` : array<string>
- `adminEmail` : string (compat) 
- `shopName` : string
- `shopAddress` : string
- `shopPhone` : string
- `shopEmail` : string
- `shopLogoUrl` : string
- `loyaltyEnabled` : boolean
- `loyaltyType` : string (`fixed` ou `percentage`)
- `loyaltyValue` : number
- `stockAlertThreshold` : number
- `orderPickupDelay` : number
- `orderInitialStatus` : string
- `qrPrefix` : string (ex. `DANA-`)
- `adminScanEnabled` : boolean
- `updatedAt` : timestamp

Importance :

- La liste d’admins autorisés est lue ici, mais le site a aussi une logique de secours basée sur les documents `users` avec `role: 'ADMIN'` et statut actif.

---

## 3. Gestion des rôles et authentification

### 3.1. Rôles supportés

Les rôles utilisés par le site sont :

- `ADMIN`
- `AGENT`
- `CLIENT`

Le système normalise les valeurs de rôle avec :

```js
String(value || '').trim().toUpperCase()
```

Cela permet d’accepter :

- `ADMIN`
- `admin`
- `Admin`

sans rupture logique.

### 3.2. Vérification de connexion

Le flux de connexion admin est le suivant :

1. L’utilisateur saisit email + mot de passe sur la page `index.html`.
2. Le site appelle Firebase Auth :
   - `signInWithEmailAndPassword(auth, email, password)`
3. Le site vérifie ensuite :
   - `isAdminEmail(email)`
   - `resolveAdminEmails()`
   - correspondance avec la collection `users`
4. Il vérifie aussi que le document Firestore associé contient :
   - `role: 'ADMIN'`
   - `statut: true` ou `status: true`
5. Si le document manque, le code essaie de le créer ou le corriger automatiquement.

### 3.3. Source de vérité actuelle

Le site mélange deux mécanismes :

- liste `settings/config.adminEmails`
- documents `users` avec rôle `ADMIN`

La logique de validation privilégie en pratique :

- la liste des adminEmails dans `settings/config`
- puis la collection `users` si elle contient un compte `ADMIN` actif

### 3.4. Comptes AGENT / CLIENT dans Firebase Auth

Dans le modèle actuel :

- les comptes admin peuvent exister dans Firebase Auth
- les comptes agent et client sont majoritairement stockés dans Firestore seulement
- le PIN est géré en Firestore via `pin_hash`, pas via Firebase Auth

C’est une architecture “Firestore-first” pour les comptes non-admin.

---

## 4. Gestion des commandes

### 4.1. Structure d’une commande

Document Firestore typique :

```js
{
  clientId: "...",
  items: [
    {
      productId: "...",
      productName: "Pain au levain",
      price: 650,
      quantity: 2
    }
  ],
  total: 1300,
  status: "PENDING",
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  statusHistory: [
    {
      changedBy: "system",
      fromStatus: "",
      toStatus: "PENDING",
      at: serverTimestamp()
    }
  ],
  loyaltyAwarded: false,
  loyaltyPointsAwarded: 0
}
```

### 4.2. Statuts supports

- `PENDING`
- `VALIDATED`
- `READY`
- `PICKED_UP`
- `RETRIEVED`
- `CANCELLED`
- `COMPLETED`
- `IN_PROGRESS`

### 4.3. Modification / validation

Le code de `orders.js` supporte :

- création de commande dans `orders`
- activation d’un statut via `handleStatusChange()`
- mise à jour et historique dans `statusHistory`
- calcul de points de fidélité lors des changements de statut
- mise à jour du client dans `users/{clientId}` via `increment(...)`

---

## 5. Gestion des produits

### 5.1. Structure produit

```js
{
  productId: "...",
  name: "Pain au levain",
  category: "Pain",
  description: "Pain artisanal",
  price: 700,
  stock: 18,
  isAvailable: true,
  imageUrl: "https://...",
  createdAt: serverTimestamp()
}
```

### 5.2. Gestion stock et disponibilité

Le site applique les règles suivantes :

- `isAvailable` vaut `false` si produit indisponible
- `stock` est visible dans le tableau admin
- si `stock` est faible, un indicateur d’alerte est affiché
- la disponibilité mobile est calculée par :

```js
product.isAvailable !== false && Number(product.stock || 0) > 0
```

### 5.3. Données de référence pour l’application mobile

L’app mobile devra afficher :

- nom du produit
- catégorie
- description
- prix
- stock disponible
- image
- disponibilité

---

## 6. QR Code Client

Le QR Code est actuellement généré pour chaque client ayant un `clientNumber`.

### Format exact du QR

La fonction `buildQrPayload(client)` renvoie exactement :

```js
return client.clientNumber;
```

Exemple :

- `DANA-0001`
- `DANA-0045`

### Association au client

Le client est identifié dans Firestore par :

- `clientNumber`
- et parfois `uid` / `id`

La génération QR se fait côté front avec :

```js
new window.QRCode(qrNode, {
  text: buildQrPayload(client),
  width: 120,
  height: 120,
  correctLevel: window.QRCode.CorrectLevel.M
});
```

Le QR est utilisé pour :

- identifier client dans le scan de commande
- retrouver le profil client associé
- ouvrir la carte client dans le site

---

## 7. Génération de la carte client PDF

Le processus actuel :

1. Le site construit le `client-card` HTML avec :
   - nom du client
   - identifiant `clientNumber`
   - téléphone
   - QR Code
   - branding Boulangerie DANA
2. Il génère un canvas avec `html2canvas`
3. Il transforme ce canvas en PDF avec `jsPDF`
4. Il sauvegarde le fichier :
   - `carte-client-${client.clientNumber}.pdf`

Code utilisé :

```js
const canvas = await window.html2canvas(printableCard, { scale: 3, useCORS: true, backgroundColor: null });
const pdf = new JsPDF({ orientation: "landscape", unit: "mm", format: "a6" });
pdf.addImage(canvas.toDataURL("image/png"), "PNG", ...);
pdf.save(`carte-client-${client.clientNumber}.pdf`);
```

### Contenu du PDF

- nom du client
- identifiant client
- téléphone
- QR Code
- marque Boulangerie DANA

---

## 8. Règles de sécurité Firestore

Le fichier courant est : `firestore.rules`.

Résumé actuel :

```firestore
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    function isAuthenticated() {
      return request.auth != null && request.auth.token.email != null;
    }

    function isAdminSession() {
      return isAuthenticated() && (
        request.auth.token.email == 'devbarack2000@gmail.com' ||
        request.auth.token.email == 'devbrck@gmail.com'
      );
    }

    match /users/{userId} {
      allow get, list: if true;
      allow create, update, delete: if isAdminSession();
    }

    match /orders/{orderId} {
      allow read: if true;
      allow create, update, delete: if isAdminSession();
    }

    match /products/{productId} {
      allow read: if true;
      allow create, update, delete: if isAdminSession();
    }

    match /settings/{settingId} {
      allow get, list: if true;
      allow create, update, delete: if isAdminSession();
    }
  }
}
```

### Ce que cela signifie

- les lectures de base sont ouvertes pour les documents utilitaires
- les écritures sont limitées par session admin
- la sécurité actuelle repose encore sur les emails admin de la session Firebase, pas sur un modèle RBAC complet

### Limite importante pour l’application mobile

- Le mobile ne doit pas supposer que les données sont totalement protégées par un système hiérarchique strict.
- L’application mobile doit respecter la même structure de données et les mêmes champs, surtout pour :
  - `users`
  - `products`
  - `orders`
  - `settings`

---

## 9. Recommandations techniques pour le développement mobile

### 9.1. Modèle de données à reproduire

L’application mobile doit s’appuyer sur les collections suivantes :

- `users`
- `products`
- `orders`
- `settings`

### 9.2. Champs obligatoires côté mobile

Pour éviter les erreurs de compatibilité, l’app mobile doit supposer que les documents peuvent avoir les variantes suivantes :

- `role`, `statut`, `status`
- `phone`, `telephone`
- `email`, `userEmail`
- `nom`, `name`
- `points`, `loyaltyPoints`
- `clientNumber`
- `pin_hash`

### 9.3. Contraintes fonctionnelles importantes

- Les comptes client/agent ne sont pas dans Firebase Auth ; ils vivent dans Firestore.
- Les identifications opérées côté mobile doivent tenir compte de ce modèle.
- Le QR code lit `clientNumber`, pas le document ID.
- Les commandes sont liées à `clientId`.
- Le statut commande est central pour la logique de fidélité et de validation.

---

## 10. Résumé opérationnel

La référence technique actuelle est la suivante :

- Frontend web statique en HTML/CSS/JS
- Firebase project : `boulangerie-dana`
- Auth admin via Firebase Authentication (email/password)
- Base métier côté Firestore dans `users`, `products`, `orders`, `settings`
- Rôles administrés dans Firestore et validés côté frontend
- Gestion client via `clientNumber`, QR code et carte PDF
- PIN client/agent stocké sous forme hashée dans `pin_hash`
- Modèle actuel compatible avec une app mobile qui reprend la même structure de données

Ce document constitue la base technique de référence pour le développement de l’application mobile Boulangerie DANA.
