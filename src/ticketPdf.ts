// Génère un petit PDF "ticket" (police à chasse fixe, page 80mm x hauteur
// variable) à partir d'une liste de lignes -- format attendu par le pont
// d'impression (voir printer-bridge-extension/), qui l'envoie tel quel à
// chrome.printing.submitJob(). Volontairement simple (une police, pas de
// mise en page complexe) : ce PDF n'est jamais lu par un humain à l'écran,
// il part directement à l'impression thermique.
//
// Largeur fixée à 80mm -- la largeur de rouleau la plus courante pour ce
// type d'imprimante à reçus. Si les imprimantes Bar/Cuisine/Ticket de Dom's
// s'avèrent être en 58mm, il suffira de changer PAGE_WIDTH_MM ici (un seul
// endroit) plutôt que d'ajuster chaque appel.
import { jsPDF } from 'jspdf';

export interface TicketLine {
  text: string;
  bold?: boolean;
  size?: 'small' | 'normal' | 'large';
  align?: 'left' | 'center';
}

const SIZE_PT: Record<NonNullable<TicketLine['size']>, number> = {
  small: 8,
  normal: 10,
  large: 14,
};

const PAGE_WIDTH_MM = 80;
const MARGIN_MM = 4;
const CONTENT_WIDTH_MM = PAGE_WIDTH_MM - MARGIN_MM * 2;
const LINE_HEIGHT_MM = 5.2;

export function buildTicketPdfBase64(lines: TicketLine[]): string {
  const estimatedHeight =
    MARGIN_MM * 2 + lines.reduce((sum, l) => sum + LINE_HEIGHT_MM * ((SIZE_PT[l.size || 'normal'] > 10) ? 1.4 : 1), 8);
  const doc = new jsPDF({ unit: 'mm', format: [PAGE_WIDTH_MM, Math.max(estimatedHeight, 40)] });
  let y = MARGIN_MM + 4;
  for (const line of lines) {
    const sizePt = SIZE_PT[line.size || 'normal'];
    doc.setFontSize(sizePt);
    doc.setFont('courier', line.bold ? 'bold' : 'normal');
    const centered = line.align === 'center';
    const x = centered ? PAGE_WIDTH_MM / 2 : MARGIN_MM;
    doc.text(line.text, x, y, { align: centered ? 'center' : 'left', maxWidth: CONTENT_WIDTH_MM });
    y += LINE_HEIGHT_MM * (sizePt > 10 ? 1.4 : 1);
  }
  // "datauristring" renvoie "data:application/pdf;filename=...;base64,XXXX" --
  // on ne garde que la partie base64 après la dernière virgule.
  const dataUri = doc.output('datauristring');
  return dataUri.slice(dataUri.indexOf(',') + 1);
}
