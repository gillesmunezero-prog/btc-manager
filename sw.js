// ============================================================================================
// Service worker BTC Manager — Phase 8.
//
// Portee volontairement etroite : seul l'app shell (le HTML lui-meme, le manifest, les icones)
// est concerne, en strategie "reseau d'abord, cache en repli" (network-first) : en ligne, on sert
// toujours l'octet le plus frais possible (et on rafraichit le cache au passage) ; hors ligne, on
// sert la derniere version connue plutot qu'un ecran blanc. AUCUNE requete cross-origin
// (Firestore, Auth, cdnjs, gstatic...) n'est interceptee : le navigateur les traite normalement,
// comme si ce service worker n'existait pas. C'est deliberement le choix le plus simple et le
// plus sur — jamais de risque de "reponse Firestore perimee servie comme si elle etait fraiche".
//
// Versionnement : CACHE_VERSION doit etre incremente a chaque changement notable de
// BTC_Manager.html. Cela change aussi les octets de ce fichier sw.js, ce qui declenche la
// detection native de mise a jour du navigateur (install -> waiting) meme quand seule la page
// HTML a change — c'est ce qui alimente le bandeau "Nouvelle version disponible — Actualiser"
// cote UI. A l'activation, tous les caches d'une version differente sont supprimes, et
// clients.claim() prend le controle immediatement (utile apres le flux skipWaiting ci-dessous).
// ============================================================================================

const CACHE_VERSION = "btc-mgr-v8.0.0";
const CACHE_NAME = "btc-manager-shell-" + CACHE_VERSION;

const APP_SHELL = [
  "./BTC_Manager.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-512-maskable.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // {cache:"reload"} : on force un octet frais depuis le reseau (contourne le cache HTTP du
      // navigateur), sinon une nouvelle version du service worker pourrait re-cacher l'ancien HTML.
      await Promise.all(
        APP_SHELL.map(async (url) => {
          try {
            const resp = await fetch(url, { cache: "reload" });
            if (resp && resp.ok) await cache.put(url, resp);
          } catch (e) { /* hors ligne au moment de l'installation : pas bloquant */ }
        })
      );
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const noms = await caches.keys();
      await Promise.all(
        noms.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

// Permet a la page d'imposer l'activation immediate de la nouvelle version (bouton
// "Nouvelle version disponible — Actualiser" cote UI), plutot que d'attendre la fermeture
// de tous les onglets.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // jamais d'ecriture interceptee

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // cross-origin (Firestore/Auth/CDN) : intact

  // On ne se mele que des fichiers explicitement precaches (par nom de fichier, sans la query
  // string : ?lot=/?palette= restent transmis tels quels au document — les deep-links Phase 7
  // continuent de fonctionner normalement).
  const nomFichier = url.pathname.split("/").pop() || "BTC_Manager.html";
  const estAppShell = APP_SHELL.some((chemin) => chemin.endsWith(nomFichier));
  if (!estAppShell) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const reponseReseau = await fetch(req);
        if (reponseReseau && reponseReseau.ok) cache.put(req, reponseReseau.clone());
        return reponseReseau;
      } catch (e) {
        const reponseCache = await cache.match(req, { ignoreSearch: true });
        if (reponseCache) return reponseCache;
        throw e;
      }
    })()
  );
});
