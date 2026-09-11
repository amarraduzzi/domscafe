// Génère des octets ESC/POS bruts (le langage natif des imprimantes à
// reçus thermiques) à partir d'une liste de lignes -- envoyés tels quels
// au petit programme local (voir printhost/, printerBridge.ts) qui les
// écrit directement dans la file d'impression Windows en mode RAW.
//
// Pourquoi pas un PDF (ancienne approche) : ça demandait un moteur externe
// (chrome.printing, ChromeOS uniquement -- voir printhost/README.md) pour
// convertir/imprimer le PDF sans boîte de dialogue. L'ESC/POS brut est ce
// que ces imprimantes attendent nativement : plus simple, plus fiable, pas
// de dépendance externe.
export interface TicketLine {
  text: string;
  bold?: boolean;
  size?: 'small' | 'normal' | 'large';
  align?: 'left' | 'center';
}

const ESC = 0x1b;
const GS = 0x1d;

function stripAccents(text: string): string {
  // Décompose les accents (é -> e + ´) puis retire les diacritiques -- la
  // plupart des imprimantes à reçus n'ont pas une police fiable pour les
  // caractères accentués dans toutes les configurations, donc on simplifie
  // plutôt que de risquer des caractères illisibles sur le ticket.
  const decomposed = text.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return decomposed
    .replace(/œ/gi, 'oe')
    .replace(/æ/gi, 'ae')
    .replace(/[^\x00-\x7F]/g, (ch) => (ch === '€' ? 'EUR' : '?'));
}

function textBytes(text: string): number[] {
  const clean = stripAccents(text);
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i++) bytes.push(clean.charCodeAt(i) & 0xff);
  return bytes;
}

export function buildTicketEscPosBase64(lines: TicketLine[]): string {
  const bytes: number[] = [];
  const push = (...vals: number[]) => bytes.push(...vals);

  push(ESC, 0x40); // ESC @ : initialise l'imprimante

  for (const line of lines) {
    const align = line.align === 'center' ? 1 : 0;
    push(ESC, 0x61, align); // ESC a n : alignement

    push(ESC, 0x45, line.bold ? 1 : 0); // ESC E n : gras on/off

    let sizeByte = 0x00;
    if (line.size === 'large') sizeByte = 0x11; // largeur x2, hauteur x2
    push(GS, 0x21, sizeByte); // GS ! n : taille du texte

    push(...textBytes(line.text));
    push(0x0a); // saut de ligne
  }

  // Remet la taille/gras/alignement par défaut, avance le papier, puis coupe.
  push(ESC, 0x45, 0);
  push(GS, 0x21, 0x00);
  push(ESC, 0x61, 0);
  push(0x0a, 0x0a, 0x0a);
  push(GS, 0x56, 0x42, 0x00); // GS V 66 0 : coupe partielle

  const bin = String.fromCharCode(...bytes);
  return btoa(bin);
}
