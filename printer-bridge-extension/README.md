# Pont d'impression Dom's Café

Petite extension Chrome qui permet à l'écran caisse (domscafe.pages.dev) d'imprimer
automatiquement, sans aucune boîte de dialogue, sur la bonne imprimante Windows :
**TICKET** (caisse), **BAR**, **CUISINE**.

Une page web normale ne peut jamais choisir toute seule une imprimante différente de
celle par défaut — Chrome ouvre toujours sa fenêtre "Imprimer" pour ça. Cette extension
contourne cette limite via `chrome.printing`, une API réservée aux extensions.

## Installation (une seule fois, sur le pc du comptoir)

1. Ouvre `chrome://extensions` dans Chrome.
2. Active **Mode développeur** (interrupteur en haut à droite).
3. Clique **Charger l'extension non empaquetée**.
4. Choisis ce dossier : `domscafe/printer-bridge-extension`.
5. C'est tout — l'extension reste installée après un redémarrage du pc ou de Chrome.
   Recommencer uniquement si ce dossier est déplacé/supprimé, ou si Chrome est
   réinstallé entièrement.

L'écran caisse détecte automatiquement si l'extension est présente. Si elle ne l'est
pas (ou est désactivée), l'impression retombe sur l'ancien comportement (bouton
"🖨️ Imprimer" manuel avec boîte de dialogue) — rien ne casse en son absence.

## Vérifier que ça marche

Dans l'onglet **Cuisine** de l'écran caisse, un message en haut indique si le pont
d'impression est détecté ou non, avec un bouton de test par imprimante.

## Noms d'imprimantes attendus

Le nom Windows exact de chaque imprimante doit correspondre (insensible à la casse) à :
`TICKET`, `BAR`, `CUISINE` — ce sont déjà les noms utilisés sur ce pc.
