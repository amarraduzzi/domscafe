import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

// ---------------------------------------------------------------------------
// Dom's Café — écran TV promo (domscafe.pages.dev/tv.html)
//
// Pensé pour tourner en boucle, sans surveillance, sur le navigateur déjà
// intégré à la Smart TV de la salle : ouvrir cette URL en plein écran une
// fois (voir la remarque plus bas pour garder l'écran allumé) suffit, tout
// le reste se met à jour tout seul.
//
// Lit la collection Firestore "tvSlides", gérée depuis l'onglet "TV" de
// l'écran caisse (PosApp.tsx) -- même Firebase, aucune configuration
// supplémentaire. onSnapshot() = live : un slide ajouté/modifié/supprimé
// depuis la caisse apparaît ici automatiquement, sans jamais avoir à
// rafraîchir la page sur la TV elle-même.
//
// Rien n'est filtré/trié côté Firestore (pas de `where`/`orderBy`) --
// exprès, pour ne pas dépendre d'un index composite Firestore à créer
// manuellement ; le nombre de slides reste de toute façon petit, filtrer et
// trier côté client suffit largement.
//
// Aucun slide actif (ou aucun slide du tout, ce qui est le cas au tout
// début) -> écran de secours avec juste le logo, jamais un écran noir.
// ---------------------------------------------------------------------------

interface TvSlide {
  id: string;
  title: string;
  subtitle?: string;
  price?: number;
  order?: number;
  active?: boolean;
}

function formatMAD(n: number): string {
  return `${n.toFixed(0)} MAD`;
}

// Durée d'affichage par slide. Un seul slide -> pas besoin de rotation, il
// reste juste affiché fixe (voir plus bas).
const SLIDE_DURATION_MS = 8000;

// Best effort : garde l'écran allumé tant que l'onglet est visible, pour
// éviter que la TV ne se mette en veille pendant les creux. Ignoré
// silencieusement si l'API n'existe pas ou si le navigateur refuse (aucune
// interaction utilisateur requise pour le reste de la page, donc rien ne
// casse si ça échoue).
function useWakeLock() {
  useEffect(() => {
    let sentinel: any = null;
    const request = async () => {
      try {
        const nav: any = navigator;
        if (!nav.wakeLock) return;
        sentinel = await nav.wakeLock.request('screen');
      } catch {
        // Ignoré -- pas critique, l'écran reste simplement soumis à la
        // gestion de veille normale de la TV dans ce cas.
      }
    };
    request();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') request();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      sentinel?.release?.().catch(() => {});
    };
  }, []);
}

export default function TvApp() {
  useWakeLock();

  const [slides, setSlides] = useState<TvSlide[]>([]);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'tvSlides'), (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<TvSlide, 'id'>) }))
        .filter((s) => s.active !== false)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      setSlides(list);
    });
    return () => unsub();
  }, []);

  const [index, setIndex] = useState(0);
  useEffect(() => {
    // Repart de zéro si la liste change de taille (évite un index qui
    // pointerait au-delà d'une liste raccourcie).
    setIndex(0);
  }, [slides.length]);
  useEffect(() => {
    if (slides.length <= 1) return;
    const t = window.setInterval(() => {
      setIndex((i) => (i + 1) % slides.length);
    }, SLIDE_DURATION_MS);
    return () => window.clearInterval(t);
  }, [slides.length]);

  const current = slides[index];

  // Un léger dégradé + le logo en filigrane derrière chaque slide -- pour
  // que l'écran reste identifiable "Dom's Café" en un coup d'œil même de
  // loin dans la salle, pas juste du texte flottant sur fond noir.
  const background = useMemo(
    () => ({
      backgroundImage:
        'radial-gradient(circle at 50% 30%, rgba(201,161,90,0.10), transparent 60%), linear-gradient(180deg, #1A1208 0%, #120D06 100%)',
    }),
    []
  );

  return (
    <div className="fixed inset-0 overflow-hidden text-[#F3ECDD] font-sans select-none" style={background}>
      <img src="/logo.webp" alt="" className="absolute top-10 left-1/2 -translate-x-1/2 h-16 w-auto object-contain opacity-90" />

      <div className="h-full w-full flex items-center justify-center px-16">
        {current ? (
          <div key={current.id} className="text-center max-w-5xl animate-fade-in">
            <h1 className="font-display font-black leading-tight text-[clamp(2.5rem,7vw,6rem)] mb-6">{current.title}</h1>
            {current.subtitle && (
              <p className="text-[clamp(1.1rem,2.4vw,2rem)] text-[#D8CFC2] mb-8">{current.subtitle}</p>
            )}
            {current.price !== undefined && (
              <span className="inline-block px-8 py-3 rounded-full bg-brand-orange text-[#1A1208] font-display font-black text-[clamp(1.5rem,3vw,2.75rem)] shadow-lg shadow-brand-orange/30">
                {formatMAD(current.price)}
              </span>
            )}
          </div>
        ) : (
          <div className="text-center animate-fade-in">
            <p className="font-display font-black text-[clamp(2rem,5vw,4rem)] mb-3">DOM'S CAFÉ</p>
            <p className="text-[#9A9490] text-lg">Rue Jabal Ayachi, Rabat</p>
          </div>
        )}
      </div>

      {slides.length > 1 && (
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-2">
          {slides.map((s, i) => (
            <span
              key={s.id}
              className={`h-1.5 rounded-full transition-all ${i === index ? 'w-8 bg-brand-orange' : 'w-1.5 bg-[#F3ECDD]/25'}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
