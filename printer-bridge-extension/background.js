// Dom's Café — pont d'impression -----------------------------------------
// Reçoit des messages depuis https://domscafe.pages.dev (voir sendToExtension
// dans src/pos/PosApp.tsx) et imprime directement, sans boîte de dialogue,
// sur l'imprimante Windows demandée (par son nom exact : "TICKET", "BAR",
// "CUISINE" tels qu'ils apparaissent dans Windows > Imprimantes). C'est ce
// qui rend "zodra de bestelling wordt ingevoerd moet alles automatisch gaan"
// possible : l'API chrome.printing (réservée aux extensions) peut choisir
// une imprimante précise et lancer l'impression sans dialogue, ce qu'une
// page web normale ne peut jamais faire.
//
// Installation (une seule fois, sur le pc du comptoir) : chrome://extensions
// → activer "Mode développeur" → "Charger l'extension non empaquetée" →
// choisir ce dossier (printer-bridge-extension). Reste installée après un
// redémarrage du pc/navigateur ; à refaire uniquement si Chrome est
// réinstallé ou si ce dossier change d'emplacement.

function base64ToBlob(base64, contentType) {
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
  return new Blob([new Uint8Array(byteNumbers)], { type: contentType });
}

async function findPrinterByName(name) {
  const printers = await chrome.printing.getPrinters();
  const wanted = String(name || '').trim().toLowerCase();
  return printers.find((p) => String(p.name || '').trim().toLowerCase() === wanted);
}

chrome.runtime.onMessageExternal.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== 'object') return false;

  if (message.type === 'PING') {
    sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
    return false;
  }

  if (message.type === 'LIST_PRINTERS') {
    chrome.printing
      .getPrinters()
      .then((printers) => sendResponse({ ok: true, printers: printers.map((p) => ({ id: p.id, name: p.name })) }))
      .catch((err) => sendResponse({ ok: false, error: String((err && err.message) || err) }));
    return true; // réponse asynchrone
  }

  if (message.type === 'PRINT_TICKET') {
    (async () => {
      try {
        const printer = await findPrinterByName(message.printerName);
        if (!printer) {
          sendResponse({
            ok: false,
            error: `Imprimante "${message.printerName}" introuvable dans Windows (vérifie le nom exact dans Windows > Imprimantes).`,
          });
          return;
        }
        const blob = base64ToBlob(message.pdfBase64, 'application/pdf');
        const result = await chrome.printing.submitJob({
          job: {
            printerId: printer.id,
            title: message.title || 'Ticket',
            ticket: {},
            contentType: 'application/pdf',
            document: blob,
          },
        });
        sendResponse({ ok: result && result.status === 'OK', status: result && result.status });
      } catch (err) {
        sendResponse({ ok: false, error: String((err && err.message) || err) });
      }
    })();
    return true; // réponse asynchrone
  }

  return false;
});
