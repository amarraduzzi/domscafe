// Pont d'impression -- voir printer-bridge-extension/README.md pour
// l'installation. Cette petite extension Chrome (installée une seule fois
// sur le pc du comptoir) reçoit un PDF via chrome.runtime.sendMessage et
// l'imprime directement sur l'imprimante Windows nommée, sans boîte de
// dialogue -- ce qu'une page web normale ne peut jamais faire seule
// (window.print() ouvre toujours la fenêtre "Imprimer" de Chrome).
//
// Absence totale de dégradation si l'extension n'est pas installée : chaque
// fonction ci-dessous résout simplement en "pas de pont disponible" plutôt
// que d'échouer bruyamment, pour que PosApp.tsx puisse retomber sur
// l'ancien comportement (bouton "🖨️ Imprimer" manuel, boîte de dialogue).
export const PRINTER_BRIDGE_EXTENSION_ID = 'mhghkbbdplfdfkalbladmlfmmpghdcka';

interface ChromeRuntimeLike {
  sendMessage: (extensionId: string, message: unknown, callback: (response: any) => void) => void;
  lastError?: { message?: string } | null;
}

function getChromeRuntime(): ChromeRuntimeLike | null {
  const w = window as any;
  return w.chrome?.runtime && typeof w.chrome.runtime.sendMessage === 'function' ? w.chrome.runtime : null;
}

function sendToBridge<T = any>(message: unknown, timeoutMs = 4000): Promise<T | null> {
  const runtime = getChromeRuntime();
  if (!runtime) return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    }, timeoutMs);
    try {
      runtime.sendMessage(PRINTER_BRIDGE_EXTENSION_ID, message, (response) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        // chrome.runtime.lastError se déclenche quand l'extension n'est pas
        // installée / n'écoute pas ("Could not establish connection...") --
        // ce n'est pas une vraie erreur ici, juste "pont absent".
        if (runtime.lastError) {
          resolve(null);
          return;
        }
        resolve((response as T) ?? null);
      });
    } catch {
      settled = true;
      window.clearTimeout(timer);
      resolve(null);
    }
  });
}

export async function pingPrinterBridge(): Promise<boolean> {
  const res = await sendToBridge<{ ok: boolean }>({ type: 'PING' });
  return !!res?.ok;
}

export async function listBridgePrinters(): Promise<{ id: string; name: string }[] | null> {
  const res = await sendToBridge<{ ok: boolean; printers?: { id: string; name: string }[] }>({ type: 'LIST_PRINTERS' });
  return res?.ok ? res.printers || [] : null;
}

export async function printPdfViaBridge(
  printerName: string,
  title: string,
  pdfBase64: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const res = await sendToBridge<{ ok: boolean; error?: string }>(
    { type: 'PRINT_TICKET', printerName, title, pdfBase64 },
    8000
  );
  if (!res) return { ok: false, message: "Pont d'impression introuvable (extension non installée, désactivée, ou hors service)." };
  if (!res.ok) return { ok: false, message: res.error || "Échec de l'impression." };
  return { ok: true };
}
