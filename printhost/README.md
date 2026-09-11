# Dom's Café — programme d'impression locale (printhost)

Remplace l'ancienne extension Chrome (`printer-bridge-extension/`), qui ne
pouvait pas fonctionner sur Windows (l'API qu'elle utilisait n'existe que sur
ChromeOS). Ce petit programme tourne directement sur le pc du comptoir et
imprime lui-même, sans boîte de dialogue, sur l'imprimante Windows exacte
demandée par l'écran caisse (**TICKET**, **BAR**, **CUISINE**).

Compilé en C natif (pas Go) spécifiquement parce que le pc du comptoir
tourne sous **Windows 7** : les exécutables Go récents ne se lancent plus du
tout sur Windows 7/8 (minimum Windows 10). Ce `printhost.exe` n'utilise que
des fonctions Windows disponibles depuis Windows XP, donc pas de souci de
compatibilité.

## Installation (une seule fois, sur le pc du comptoir)

1. Copie tout le dossier `printhost` (avec `printhost.exe` et `install.bat`
   dedans) sur le disque dur de ce pc, par exemple sur le Bureau — pas besoin
   de le garder sur une clé USB.
2. Double-clique sur `install.bat`.
3. Une fenêtre noire s'ouvre brièvement et dit "Klaar." — c'est bon.
4. C'est tout. Le programme tourne maintenant en arrière-plan (invisible,
   pas d'icône, pas de fenêtre) et redémarre automatiquement à chaque
   démarrage du pc. Pas besoin de le relancer manuellement.

## Si Windows affiche un avertissement au double-clic

Comme ce programme n'est pas signé par un éditeur connu, Windows Defender
SmartScreen peut afficher "Windows a protégé votre ordinateur". Clique sur
**Informations complémentaires** puis **Exécuter quand même**. C'est normal
pour un petit programme interne comme celui-ci.

## Vérifier que ça marche

Dans l'onglet **Cuisine** de l'écran caisse (domscafe.pages.dev), un message
en haut indique si le programme est détecté ou non, avec un bouton de test
par imprimante.

## L'ancienne extension Chrome n'est plus nécessaire

Si `printer-bridge-extension` a été installée précédemment dans
`chrome://extensions`, elle peut être retirée (bouton "Supprimer") — elle
n'est plus utilisée.

## Noms d'imprimantes attendus

Le nom Windows exact de chaque imprimante doit correspondre (insensible à la
casse) à : `TICKET`, `BAR`, `CUISINE`.
