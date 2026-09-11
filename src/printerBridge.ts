// Pont d'impression -- voir printhost/README.md pour l'installation.
// Un petit programme (printhost.exe) tourne en arrière-plan sur le pc du
// comptoir et écoute sur http://127.0.0.1:8934. L'écran caisse lui envoie
// une requête réseau locale avec les octets ESC/POS du ticket (voir
// escpos.ts) et le nom exact de l'imprimante Windows visée ; le programme
// les écrit directement dans la file d'impression, sans boîte de dialogue.
//
// Chrome autorise ce type de requête (page https -> 127.0.0.1) nativement,
// sans extension ni permission particulière : 127.0.0.1 est considéré
// "sûr" même depuis une page https.
//
// (Version précédente : une extension Chrome utilisant chrome.printing --
// abandonnée car cette API n'existe que sur ChromeOS, jamais sur Windows.)
//
// Absence totale de dégradation si le programme n'est pas lancé : chaque
// fonction ci-dessous résout simplement en "pas de pont disponible" plutôt
// que d'échouer bruyamment, pour que PosApp.tsx puisse retomber sur
// l'ancien comportement (bouton "🖨️ Imprimer" manuel, boîte de dialogue).
const PRINTHOST_URL = 'http://127.0.0.1:8934';

async function callPrinthost<T = any>(path: string, init?: RequestInit, timeoutMs = 4000): Promise<T | null> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${PRINTHOST_URL}${path}`, { ...init, signal: controller.signal });
    if (!res.ok && res.status !== 200) return null;
    return (await res.json()) as T;
  } catch {
    // Programme non lancé, port fermé, ou timeout -- "pas de pont", pas une
    // vraie erreur.
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function pingPrinterBridge(): Promise<boolean> {
  const res = await callPrinthost<{ ok: boolean }>('/ping', undefined, 1500);
  return !!res?.ok;
}

export async function printEscPosViaBridge(
  printerName: string,
  title: string,
  dataBase64: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const res = await callPrinthost<{ ok: boolean; error?: string }>(
    '/print',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ printerName, title, dataBase64 }),
    },
    8000
  );
  if (!res) {
    return {
      ok: false,
      message: "Programme d'impression introuvable (printhost.exe non lancé sur ce pc -- voir printhost/README.md).",
    };
  }
  if (!res.ok) return { ok: false, message: res.error || "Échec de l'impression." };
  return { ok: true };
}
