# Rapport design du site – Boulangerie DANA

## 1. Identité visuelle

### Marque
- Nom : Boulangerie DANA
- Logo : image présente dans le site via `images/logo.png`
- Style général : premium chaleureux, artisanal, orienté boulangerie / boutique locale

### Palette de couleurs utilisée
- Brun profond / cacao : `#703313`
- Orange brûlé : `#a85722`
- Doré chaud : `#d97706`
- Beige chaud : `#fff8ed`
- Fond sombre / noir chocolat : `#080706`
- Fond cartes / panneaux : `#1b120f` ou variations de `var(--card-bg)`
- Texte principal : clair / beige / blanc
- Accent doré : utilisé pour les numéros clients et éléments de mise en valeur

### Typographie
- Police principale : `Arial, sans-serif`
- Usage de texte fort dans les titres et identifiants
- Titres épais pour les éléments de marque et données client
- Texte secondaire plus discret pour labels, infos complémentaires, outils UI

---

## 2. Design système du site

### 2.1. Structure générale
- Sidebar fixe à gauche avec navigation
- Header principal sur la partie droite
- Panneaux (`panel`) avec fond sombre semi-transparent et bordures discrètes
- Tableaux avec fond sombre, lignes séparées, texte lisible
- Boutons uniformisés : bouton principal, bouton fantôme, bouton danger

### 2.2. Éléments visuels récurrents
- Coins arrondis : environ `6px` à `10px`
- Ombres douces pour les modales et cartes
- Bordures fines et subtiles
- Contraste élevé sur les éléments clés
- Mode sombre dominant sur tout le site

### 2.3. Cartes et modales
- Fond des modales : `rgba(5, 4, 3, 0.78)`
- Dialogue modal : fond sombre, bordure claire, ombre forte
- Largeur typique : `min(430px, 96vw)` pour les cartes client
- Padding interne : environ `18px`
- Radius : `10px`

---

## 3. Design de la carte client QR

### 3.1. Présentation visuelle
La carte client est construite dans un conteneur HTML avec ce style visuel :

```css
.client-card {
  width: 350px;
  height: 200px;
  padding: 18px;
  overflow: hidden;
  color: #fff8ed;
  background: linear-gradient(130deg, #703313 0%, #a85722 58%, #d97706 100%);
  border: 1px solid rgba(255, 220, 170, 0.45);
  border-radius: 10px;
  box-shadow: 0 14px 28px rgba(0, 0, 0, 0.35);
  font-family: Arial, sans-serif;
}
```

### 3.2. Structure interne de la carte
La carte contient :
- en-tête avec logo et titre “Boulangerie DANA”
- label “CARTE CLIENT”
- bloc gauche avec :
  - nom du client
  - identifiant client
  - téléphone
- bloc droit avec le QR code

### 3.3. Mise en page exacte
```css
.client-card-heading,
.client-card-body {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.client-card-body {
  height: 136px;
  gap: 14px;
}
```

### 3.4. Bloc QR
```css
.qr-zone {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 128px;
  height: 128px;
  flex: 0 0 128px;
  padding: 4px;
  background: #fff;
  border-radius: 6px;
}

.qr-canvas {
  width: 120px;
  height: 120px;
}
```

### 3.5. Style du texte
- Nom du client : grand et gras
- Identifiant et téléphone : petits textes lisibles, labels en uppercase
- Couleur dominante : beige / crème largement utilisée
- QR code sur fond blanc pour assurer bon contraste

---

## 4. Logique utilisée pour la carte QR code

### 4.1. Valeur encodée dans le QR
La logique exact utilisée dans le site est la suivante :

```js
export function buildQrPayload(client) {
  if (!client?.clientNumber) throw new Error("Carte client invalide : numéro client manquant.");
  return client.clientNumber;
}
```

Cela signifie que le QR code contient uniquement :
- `client.clientNumber`

Exemples :
- `DANA-0001`
- `DANA-0045`

### 4.2. Génération du QR
Le QR est généré côté frontend avec la bibliothèque `QRCode` :

```js
new window.QRCode(qrNode, {
  text: buildQrPayload(client),
  width: 120,
  height: 120,
  correctLevel: window.QRCode.CorrectLevel.M
});
```

### 4.3. Affichage dans la carte
Le QR est injecté dans :

```html
<div class="qr-zone" aria-label="QR Code client">
  <div class="qr-canvas"></div>
</div>
```

### 4.4. Export PDF
Le PDF est produit à partir du rendu HTML de la carte :

```js
const canvas = await window.html2canvas(printableCard, { scale: 3, useCORS: true, backgroundColor: null });
const pdf = new JsPDF({ orientation: "landscape", unit: "mm", format: "a6" });
pdf.addImage(canvas.toDataURL("image/png"), "PNG", ...);
pdf.save(`carte-client-${client.clientNumber}.pdf`);
```

### 4.5. Impression
La carte peut aussi être imprimée directement :

```js
function printCard(printableCard) {
  if (!printableCard) return toast("Carte client introuvable.", "error");
  printableCard.classList.add("client-card-print-target");
  window.onafterprint = () => printableCard.classList.remove("client-card-print-target");
  window.print();
}
```

---

## 5. Données de design réellement utilisées

### Données client affichées sur la carte
- `client.nom` ou `client.name`
- `client.clientNumber`
- `client.phone` ou fallback

### Données non affichées dans le design
- données techniques Firebase
- règles Firestore
- logique métier de vente
- logique d’authentification

Le document ci-dessous se limite exclusivement au design et à la logique de génération / affichage de la carte QR.
