/* =========================================================
   SERVICE WORKER — conserva i frame dello storyboard

   Sta in mezzo fra la pagina e la rete, ma si occupa SOLO dei file
   in /frames: tutto il resto (html, css, js, svg, font) non viene
   nemmeno intercettato e continua a passare dalla rete come prima.
   È una scelta voluta: è il modo di non incorrere nel guaio classico
   dei service worker, cioè invitati bloccati per sempre su una
   versione vecchia del sito. Una modifica al testo o al codice arriva
   subito; i frame invece non cambiano mai una volta esportati, quindi
   conservarli per sempre è esattamente ciò che si vuole.

   Cosa ci si guadagna:
   - la seconda apertura non fa NESSUNA richiesta per i 229 frame
     (oggi, passati i 10 minuti di max-age di GitHub Pages, il browser
     li richiede tutti per sentirsi dire "non è cambiato nulla");
   - l'invito funziona senza campo, che è lo scenario del giorno del
     matrimonio fra Massa Lubrense e Sorrento.

   Se un giorno i frame vengono riesportati NON vanno sovrascritti con
   gli stessi nomi: si mette la nuova serie in una cartella nuova
   (frames-v2/) e si alza VERSIONE qui sotto. Con la cache-first, un
   file sovrascritto sarebbe l'unico caso in cui il vecchio continua a
   vincere sul nuovo.
   ========================================================= */

const VERSIONE = "storyboard-v1";

/* Solo i frame, e solo dal nostro stesso dominio */
const DA_CONSERVARE = /\/frames\/[^/]+\.webp$/;

self.addEventListener("install", () => {
    /* Niente da precaricare: la cache si riempie con i frame che la
       pagina chiede già durante il caricamento, senza scaricare
       niente due volte.
       skipWaiting per entrare in servizio subito, senza attendere che
       le schede aperte con la versione precedente si chiudano. */
    self.skipWaiting();
});

self.addEventListener("activate", (evento) => {
    evento.waitUntil((async () => {
        /* le cache di versioni precedenti se ne vanno qui */
        const nomi = await caches.keys();
        await Promise.all(nomi
            .filter((nome) => nome !== VERSIONE)
            .map((nome) => caches.delete(nome)));

        /* Prende il controllo della pagina che lo ha appena registrato
           invece di aspettare la prossima visita: così i frame di
           QUESTO primo caricamento passano già da qui e finiscono in
           cache. Senza questa riga il vantaggio arriverebbe solo alla
           terza apertura. */
        await self.clients.claim();
    })());
});

self.addEventListener("fetch", (evento) => {
    const richiesta = evento.request;
    if (richiesta.method !== "GET") return;

    const indirizzo = new URL(richiesta.url);
    if (indirizzo.origin !== self.location.origin) return;
    if (!DA_CONSERVARE.test(indirizzo.pathname)) return;

    /* solo per i frame si prende in carico la risposta: per tutto il
       resto non chiamare respondWith significa "fai come sempre" */
    evento.respondWith(dallaCache(richiesta));
});

async function dallaCache(richiesta) {
    const cache = await caches.open(VERSIONE);

    const conservato = await cache.match(richiesta);
    if (conservato) return conservato;

    const risposta = await fetch(richiesta);

    /* Si conserva solo ciò che è arrivato intero: un 404 o una
       risposta troncata resterebbero in cache per sempre.
       put() può fallire quando lo spazio è finito (su iPhone il tetto
       per sito è basso): non deve mai impedire alla pagina di
       ricevere il frame, quindi l'errore si ignora. */
    if (risposta && risposta.ok) {
        cache.put(richiesta, risposta.clone()).catch(() => { });
    }

    return risposta;
}
