/* =========================================================
   ANIMAZIONI GSAP — STORYBOARD A CAPITOLI

   La cartella /frames contiene la sequenza dipinta (webp
   1080x1920 con canale alfa): ogni capitolo si apre con una
   transizione e si chiude su un disegno finito.

       frame     capitolo        riposo
       0-23      copertina       23   (solo al caricamento)
       24-46     invito          46
       47-92     cerimonia       92
       93-138    ricevimento     138
       139-184   conferma        184
       185-228   lista nozze     228

   La sequenza è disegnata sul canvas #storyboard — fisso, a
   tutto schermo, dietro le scene e davanti al cielo.

   Come si muove:
   - al caricamento la pagina è FERMA sulla copertina e la
     sequenza si apre da sola dal frame 0 al 23: quei frame si
     vedono soltanto qui, poi non sono più raggiungibili;
   - dopo l'introduzione si viaggia solo fra i capitoli, dal
     frame 24 al 228: lo scroll libero è spento e ogni gesto
     porta al capitolo adiacente, attraversando i suoi frame e
     posandosi sul disegno finito, con il testo della scena.

   Oltre allo storyboard: il logo che si rimpicciolisce appena
   si lascia la copertina (.sticky), l'invito a scorrere che
   sparisce sull'ultimo capitolo (.nascosto) e i collegamenti
   del menu, che saltano da capitolo a capitolo — tutti agganci
   già previsti da style.css.
   ========================================================= */

gsap.registerPlugin(ScrollTrigger, ScrollToPlugin, Observer);

/* Sui dispositivi touch la tastiera (e la barra indirizzi)
   ridimensionano il viewport: senza questo flag ogni apertura
   della tastiera scatena un refresh di ScrollTrigger che fa
   perdere il focus ai campi del form */
ScrollTrigger.config({ ignoreMobileResize: true });

/* ---------------------------------------------------------
   LA SEQUENZA
   Se i frame cambiano, qui vanno aggiornati il totale e i
   punti di riposo: i file sono
   frames/frame_00000.webp ... frame_00228.webp
--------------------------------------------------------- */
const FRAME_TOTALI = 229;
const FRAME_CARTELLA = "frames/";
const FRAME_PREFISSO = "frame_";
const FRAME_ESTENSIONE = ".webp";
const FRAME_CIFRE = 5;

/* I capitoli, in ordine. "fine" è il frame su cui il capitolo
   si posa: è lo stato di riposo di quella schermata, e il primo
   frame del capitolo è quello dopo la fine del precedente
   (quindi la parte scorrevole comincia dal 24).
   "nome" è sia l'id della scena in index.html sia la voce del
   menu; la copertina non ha markup (è lo spazio in cima a
   <main> creato da animation.css), quindi sta a quota 0. */
const CAPITOLI = [
    { nome: "home", fine: 23 },
    { nome: "invito", fine: 46 },
    { nome: "cerimonia", fine: 92 },
    { nome: "ricevimento", fine: 138 },
    { nome: "conferma", fine: 184 },
    { nome: "lista", fine: 228 }
];

/* Introduzione: durata dell'apertura automatica (frame 0 -> 23)
   e attesa massima per averne i frame prima di partire — oltre
   quel tempo si parte comunque, al peggio a scatti */
const DURATA_INTRO = 2.4;
const ATTESA_INTRO = 3000;

/* ---------------------------------------------------------
   MEMORIA E BANDA
   La sequenza pesa ~54 MB e i 229 frame, tutti decodificati
   insieme (1080x1920x4 byte), occuperebbero quasi 2 GB: su
   telefono il browser verrebbe ucciso. Quindi non si precarica
   nulla in blocco: si tiene in memoria solo una FINESTRA di
   frame attorno a quello mostrato, più una SCALETTA fissa che
   garantisce sempre un disegno da mostrare — i punti di riposo
   dei capitoli ne fanno parte, così ogni salto (anche dal menu)
   trova il disegno pronto.
--------------------------------------------------------- */
const PASSO_SCALETTA = 24;      /* un frame di riferimento ogni 24 */
const FINESTRA_AVANTI = 40;     /* frame precaricati nel verso dello scroll */
const FINESTRA_DIETRO = 12;     /* ... e in quello opposto (si torna meno spesso) */
const FINESTRA_CACHE = 60;      /* oltre questa distanza i frame vengono scartati */
const RICHIESTE_PARALLELE = 4;  /* download in volo insieme */

const canvas = document.getElementById("storyboard");
const contesto = canvas.getContext("2d");

/* indice -> Image pronta al disegno */
const cache = new Map();
/* indice -> Promise dei frame in arrivo (mai due richieste uguali) */
const inArrivo = new Map();
/* frame che non si sono caricati: non vanno richiesti all'infinito */
const mancanti = new Set();
/* indici mai scartati dalla cache */
const scaletta = new Set();
for (let i = 0; i < FRAME_TOTALI; i += PASSO_SCALETTA) scaletta.add(i);
CAPITOLI.forEach((voce) => scaletta.add(voce.fine));

/* Stato dell'introduzione (frame animato a tempo) */
const moviola = { indice: 0 };
/* Stato della sequenza scorrevole: 0 -> 1 lungo tutta la pagina */
const avanzamento = { quota: 0 };

/* Misure della pagina: quota di scroll di ogni capitolo.
   Ricalcolate a ogni refresh di ScrollTrigger (rotazione,
   cambio di altezza), mai date per buone. */
let misure = { limite: 0, quote: [0] };

let richiesto = 0;      /* fotogramma che la sequenza chiede adesso */
let disegnato = null;   /* fotogramma effettivamente sul canvas */
let inVolo = 0;         /* download in corso (riempimento della finestra) */
let avviato = false;
let sequenzaAperta = false;
let intro = null;

/* ---------------------------------------------------------
   CARICAMENTO DEI FRAME
--------------------------------------------------------- */

function percorso(indice) {
    const numero = String(indice).padStart(FRAME_CIFRE, "0");
    return FRAME_CARTELLA + FRAME_PREFISSO + numero + FRAME_ESTENSIONE;
}

function carica(indice) {
    if (cache.has(indice)) return Promise.resolve(cache.get(indice));
    if (inArrivo.has(indice)) return inArrivo.get(indice);

    const attesa = new Promise((risolvi) => {
        const immagine = new Image();
        immagine.decoding = "async";
        immagine.onload = () => {
            cache.set(indice, immagine);
            risolvi(immagine);
        };
        /* un frame mancante non deve fermare la sequenza:
           al suo posto resta il più vicino disponibile */
        immagine.onerror = () => {
            mancanti.add(indice);
            risolvi(null);
        };
        immagine.src = percorso(indice);
    }).then((immagine) => {
        inArrivo.delete(indice);
        /* è arrivato proprio quello che serve: si aggiorna subito */
        if (immagine && indice === richiesto) disegna();
        return immagine;
    });

    inArrivo.set(indice, attesa);
    return attesa;
}

/* Attende un gruppo di frame, ma non oltre il tempo dato */
function attendi(indici, tempoMassimo) {
    return Promise.race([
        Promise.all(indici.map(carica)),
        new Promise((risolvi) => setTimeout(risolvi, tempoMassimo))
    ]);
}

/* Il prossimo frame da scaricare: il più vicino a quello
   mostrato, con priorità al verso dello scroll (avanti) */
function prossimo(centro) {
    const manca = (indice) =>
        indice >= 0 && indice < FRAME_TOTALI &&
        !cache.has(indice) && !inArrivo.has(indice) && !mancanti.has(indice);

    for (let salto = 0; salto <= FINESTRA_AVANTI; salto++) {
        if (manca(centro + salto)) return centro + salto;
        if (salto <= FINESTRA_DIETRO && manca(centro - salto)) return centro - salto;
    }
    /* finestra completa: si completa la scaletta, che serve
       come ripiego per gli snap e per i salti dal menu */
    for (const indice of scaletta) if (manca(indice)) return indice;
    return null;
}

function riempi() {
    while (inVolo < RICHIESTE_PARALLELE) {
        const indice = prossimo(richiesto);
        if (indice === null) return;
        inVolo++;
        carica(indice).then(() => {
            inVolo--;
            riempi();
        });
    }
}

/* Fuori dalla finestra la cache si svuota: la scaletta resta */
function pota(centro) {
    for (const indice of cache.keys()) {
        if (scaletta.has(indice)) continue;
        if (Math.abs(indice - centro) > FINESTRA_CACHE) cache.delete(indice);
    }
}

/* Il frame disponibile più vicino a quello chiesto: mentre i
   download rincorrono lo scroll, lo sfondo non resta mai vuoto */
function disponibile(indice) {
    if (cache.has(indice)) return indice;
    for (let salto = 1; salto < FRAME_TOTALI; salto++) {
        if (cache.has(indice - salto)) return indice - salto;
        if (cache.has(indice + salto)) return indice + salto;
    }
    return null;
}

/* ---------------------------------------------------------
   DISEGNO
--------------------------------------------------------- */

/* Il canvas segue il viewport (in pixel fisici, ma non oltre
   2x: a 3x il costo di riempimento raddoppia senza guadagno
   visibile su un acquerello) */
function dimensiona() {
    const densita = Math.min(window.devicePixelRatio || 1, 2);
    const riquadro = canvas.getBoundingClientRect();
    const largo = Math.round(riquadro.width * densita);
    const alto = Math.round(riquadro.height * densita);

    if (largo === canvas.width && alto === canvas.height) return false;

    /* cambiare le dimensioni azzera il canvas: va ridisegnato */
    canvas.width = largo;
    canvas.height = alto;
    disegnato = null;
    return true;
}

function disegna() {
    const indice = disponibile(richiesto);
    if (indice === null) return;
    if (indice === disegnato) return;

    const immagine = cache.get(indice);
    const largo = immagine.naturalWidth;
    const alto = immagine.naturalHeight;
    if (!largo || !alto) return;

    /* "cover" ancorato in basso al centro: il disegno poggia
       sempre sul fondo dello schermo e l'eventuale eccedenza si
       perde in alto / ai lati */
    const scala = Math.max(canvas.width / largo, canvas.height / alto);
    const finale = { largo: largo * scala, alto: alto * scala };

    /* i frame hanno il canale alfa: senza pulizia i disegni si
       sommerebbero uno sull'altro */
    contesto.clearRect(0, 0, canvas.width, canvas.height);
    contesto.drawImage(
        immagine,
        (canvas.width - finale.largo) / 2,
        canvas.height - finale.alto,
        finale.largo,
        finale.alto
    );

    disegnato = indice;
}

/* Porta sul canvas il fotogramma chiesto (e tiene in ordine
   cache e download). È l'unico punto da cui passa la sequenza:
   la chiamano sia l'introduzione sia lo scroll. */
function mostra(indice) {
    indice = Math.round(indice);
    if (indice === richiesto && disegnato !== null) return;

    richiesto = indice;
    carica(indice);   /* il frame che serve adesso salta la coda */
    pota(indice);
    riempi();
    disegna();
}

/* ---------------------------------------------------------
   CAPITOLI E QUOTE DI SCROLL
--------------------------------------------------------- */

/* Quota di scroll a cui un capitolo si posa. La copertina è in
   cima (0); le scene stanno in fila dentro <main>, che è statico
   e senza margini: offsetTop è già la loro quota nel documento
   e non dipende dallo scroll corrente (a differenza di
   getBoundingClientRect, che durante un refresh può ingannare). */
function misura() {
    const limite = ScrollTrigger.maxScroll(window);
    const quote = [];
    let precedente = 0;

    CAPITOLI.forEach((voce, indice) => {
        const elemento = indice === 0 ? null : document.getElementById(voce.nome);
        /* le quote devono restare in ordine e dentro la pagina:
           una scena più alta del viewport (o assente) non deve
           rendere irraggiungibile la coda della sequenza */
        const quota = elemento ? Math.min(elemento.offsetTop, limite) : 0;
        precedente = Math.max(precedente, quota);
        quote.push(precedente);
    });

    misure = { limite, quote };
}

/* Il fotogramma che corrisponde a un avanzamento 0 -> 1.
   Non è una proporzione unica: ogni tratto di scroll attraversa
   il suo capitolo, dal disegno finito del precedente al proprio
   (così i capitoli restano allineati alle scene anche se una
   scena è più alta delle altre). */
function fotogrammaDa(quota) {
    const posizione = quota * misure.limite;
    const quote = misure.quote;

    for (let k = quote.length - 2; k >= 0; k--) {
        if (posizione >= quote[k] || k === 0) {
            const ampiezza = quote[k + 1] - quote[k];
            const parte = ampiezza > 0
                ? Math.min(Math.max((posizione - quote[k]) / ampiezza, 0), 1)
                : 1;
            return CAPITOLI[k].fine + (CAPITOLI[k + 1].fine - CAPITOLI[k].fine) * parte;
        }
    }
    return CAPITOLI[CAPITOLI.length - 1].fine;
}

/* Il capitolo più vicino a una quota di scroll: serve a
   risincronizzarsi dopo un salto dal menu o una rotazione */
function capitoloDaQuota(posizione) {
    let migliore = 0;
    misure.quote.forEach((quota, indice) => {
        if (Math.abs(quota - posizione) < Math.abs(misure.quote[migliore] - posizione)) {
            migliore = indice;
        }
    });
    return migliore;
}

/* ---------------------------------------------------------
   INTRODUZIONE
   La pagina è ferma sulla copertina e la sequenza si apre da
   sola: è l'unico momento in cui si vedono i frame 0-22.
--------------------------------------------------------- */

/* La pagina si ferma PRIMA di attendere i frame: nessuno deve
   poter scorrere mentre l'introduzione è ancora in arrivo */
function fermaLaPagina() {
    document.documentElement.classList.add("introduzione");

    const scroller = document.getElementById("scroller");
    if (scroller) scroller.classList.add("nascosto");

    /* chi ha fretta salta l'introduzione al primo gesto: nessuno
       resta fermo ad aspettare (e un reload non costringe a
       rivederla). Vale anche durante l'attesa dei frame. */
    const salta = () => {
        if (intro) intro.progress(1);
        apriLaSequenza();
    };
    ["wheel", "touchstart", "keydown", "pointerdown"].forEach((evento) => {
        window.addEventListener(evento, salta, { once: true, passive: true });
    });
}

function apriIntroduzione() {
    if (sequenzaAperta) return;   /* già saltata durante l'attesa */

    intro = gsap.to(moviola, {
        indice: CAPITOLI[0].fine,
        duration: DURATA_INTRO,
        ease: "none",
        onUpdate: () => mostra(moviola.indice),
        onComplete: apriLaSequenza
    });
}

/* ---------------------------------------------------------
   SEQUENZA SCORREVOLE — dal frame 24 al 228.
   La posizione della pagina comanda il fotogramma: il tween qui
   sotto è agganciato allo scroll (scrub), non al tempo.
--------------------------------------------------------- */

function apriLaSequenza() {
    if (sequenzaAperta) return;
    sequenzaAperta = true;
    intro = null;

    /* si riparte dalla copertina e si restituisce il movimento */
    document.documentElement.classList.remove("introduzione");
    window.scrollTo(0, 0);
    capitolo = 0;

    const scroller = document.getElementById("scroller");
    if (scroller) scroller.classList.remove("nascosto");

    gsap.to(avanzamento, {
        quota: 1,
        ease: "none",
        onUpdate: () => mostra(fotogrammaDa(avanzamento.quota)),
        scrollTrigger: {
            trigger: "main",
            start: "top top",
            end: "bottom bottom",
            /* i frame seguono la pagina senza ritardo: l'andatura
               morbida la dà già il viaggio da capitolo a capitolo */
            scrub: true,
            /* le quote dei capitoli si rimisurano a ogni refresh */
            onRefresh: misura
            /* NIENTE invalidateOnRefresh: gli estremi dell'avanzamento
               (0 -> 1) sono fissi. Un invalidate a metà pagina farebbe
               ripartire il tween dal valore corrente, sfasando la
               sequenza per sempre */
        }
    });

    costruisciNavigazione();
    costruisciInterfaccia();
    ScrollTrigger.refresh();
    mostra(fotogrammaDa(avanzamento.quota));
}

/* ---------------------------------------------------------
   NAVIGAZIONE A CAPITOLI
   Lo scroll libero è spento (Observer con preventDefault): ogni
   gesto — rotella, swipe, freccia — porta al capitolo adiacente e
   la pagina ci arriva con un tween. Non si scorre "all'infinito":
   si passa da un disegno finito al successivo e i frame in mezzo
   scorrono durante il viaggio.
   È lo stesso schema della vecchia navigazione a pagine di questo
   progetto: più prevedibile dello snap di ScrollTrigger, che
   proietta la velocità del gesto e con un flick deciso salterebbe
   fino in fondo alla pagina.
--------------------------------------------------------- */

/* Campi del form: i tocchi che partono da qui restano nativi,
   altrimenti il preventDefault chiude la tastiera appena aperta */
const CAMPI = "#conferma input, #conferma textarea, #conferma button";

/* Secondi di viaggio per fotogramma attraversato */
const SECONDI_PER_FRAME = 0.014;

let capitolo = 0;      /* capitolo su cui siamo posati */
let bloccoFino = 0;    /* i gesti sono ignorati fino a questo istante */
let osservatore = null;

const liberi = () => performance.now() >= bloccoFino;

const stoDigitando = () => {
    const elemento = document.activeElement;
    return !!(elemento && elemento.matches && elemento.matches(CAMPI));
};

function vaiAlCapitolo(indice) {
    indice = Math.max(0, Math.min(CAPITOLI.length - 1, indice));
    if (indice === capitolo) return;

    /* durata proporzionale a quanta storia si attraversa; con
       "meno movimento" il salto è istantaneo, senza attraversare
       i fotogrammi in mezzo */
    const frame = Math.abs(CAPITOLI[indice].fine - CAPITOLI[capitolo].fine);
    const durata = ridottoMovimento()
        ? 0
        : Math.max(0.6, Math.min(2.2, frame * SECONDI_PER_FRAME));

    capitolo = indice;

    /* lucchetto A SCADENZA (mai infinito: se il tween morisse
       senza callback la navigazione resterebbe bloccata) */
    bloccoFino = performance.now() + durata * 1000 + 150;
    const sblocca = () => { bloccoFino = performance.now() + 100; };

    gsap.to(window, {
        duration: durata,
        /* mai oltre lo scroll raggiungibile: la barra del browser
           che si ritira può spostare il fondo pagina */
        scrollTo: {
            y: Math.min(misure.quote[indice], ScrollTrigger.maxScroll(window)),
            autoKill: false
        },
        ease: "power2.inOut",
        overwrite: true,
        onComplete: sblocca,
        onInterrupt: sblocca
    });
}

function costruisciNavigazione() {

    osservatore = Observer.create({
        target: window,
        type: "wheel,touch",
        wheelSpeed: -1,       /* allinea la rotella al verso dello swipe */
        tolerance: 10,
        preventDefault: true,
        allowClicks: true,
        lockAxis: true,
        ignore: CAMPI,
        onUp: () => { if (liberi()) vaiAlCapitolo(capitolo + 1); },
        onDown: () => { if (liberi()) vaiAlCapitolo(capitolo - 1); }
    });

    /* Cintura di sicurezza: mentre si DIGITA in un campo la
       navigazione è spenta. Lo stato si ricalcola sempre da
       document.activeElement, perché le coppie focusin/focusout
       possono perdersi (il bottone che viene disabilitato durante
       l'invio non emette focusout) e l'Observer resterebbe spento
       per sempre. Il bottone non è digitazione: non spegne nulla. */
    const aggiornaGesti = () => {
        if (stoDigitando()) {
            osservatore.disable();
        } else if (!osservatore.isEnabled) {
            osservatore.enable();
        }
    };
    document.addEventListener("focusin", aggiornaGesti);
    document.addEventListener("focusout", () => setTimeout(aggiornaGesti, 0));
    /* auto-riparazione: se un cambio di focus si è perso, il primo
       tocco o rotellata rimette le cose a posto */
    window.addEventListener("touchstart", aggiornaGesti, { passive: true });
    window.addEventListener("wheel", aggiornaGesti, { passive: true });

    /* Autoriparazione: se qualcosa muove la pagina per conto suo
       (la bolla di un campo obbligatorio, un salto a un'ancora)
       l'indice del capitolo si riallinea alla posizione reale */
    window.addEventListener("scroll", () => {
        if (!sequenzaAperta || !liberi()) return;
        capitolo = capitoloDaQuota(window.scrollY);
    }, { passive: true });

    /* Tastiera: frecce, pagina, spazio (non mentre si compila) */
    window.addEventListener("keydown", (evento) => {
        if (evento.target instanceof Element && evento.target.matches("input, textarea")) return;
        if (["ArrowDown", "PageDown", " "].includes(evento.key)) {
            evento.preventDefault();
            if (liberi()) vaiAlCapitolo(capitolo + 1);
        } else if (["ArrowUp", "PageUp"].includes(evento.key)) {
            evento.preventDefault();
            if (liberi()) vaiAlCapitolo(capitolo - 1);
        } else if (evento.key === "Home") {
            evento.preventDefault();
            if (liberi()) vaiAlCapitolo(0);
        } else if (evento.key === "End") {
            evento.preventDefault();
            if (liberi()) vaiAlCapitolo(CAPITOLI.length - 1);
        }
    });
}

/* ---------------------------------------------------------
   LOGO, INVITO A SCORRERE, MENU
   (le classi e le transizioni sono già in style.css)
--------------------------------------------------------- */

function costruisciInterfaccia() {

    /* Le due soglie qui sotto sono interruttori, non intervalli:
       vanno guidate dall'ATTRAVERSAMENTO (onEnter/onLeaveBack) e
       non da isActive. ScrollTrigger è attivo per
       start <= scroll < end e limita end al fondo pagina: con
       isActive l'ultimo capitolo spegnerebbe entrambi gli stati. */

    /* Il logo è grande sulla copertina; appena si scorre verso
       l'invito si rimpicciolisce nell'angolo */
    const logo = document.getElementById("logo");
    if (logo) {
        ScrollTrigger.create({
            start: 40,
            onEnter: () => logo.classList.add("sticky"),
            onLeaveBack: () => logo.classList.remove("sticky"),
            /* dopo un refresh lo stato va risincronizzato */
            onRefresh: (self) => logo.classList.toggle("sticky", self.scroll() >= self.start)
        });
    }

    /* L'invito a scorrere non serve più sull'ultimo capitolo */
    const scroller = document.getElementById("scroller");
    if (scroller) {
        ScrollTrigger.create({
            start: () => {
                const quote = misure.quote;
                /* a metà dell'ultimo tratto: l'invito sparisce
                   mentre si entra nei ringraziamenti */
                return quote.length > 1
                    ? (quote[quote.length - 2] + quote[quote.length - 1]) / 2
                    : ScrollTrigger.maxScroll(window);
            },
            onEnter: () => scroller.classList.add("nascosto"),
            onLeaveBack: () => scroller.classList.remove("nascosto"),
            onRefresh: (self) => scroller.classList.toggle("nascosto", self.scroll() >= self.start)
        });
    }

    /* Menu: chiude il pannello e accompagna al capitolo (le voci
       sono esattamente i nomi dei capitoli, "Home" compresa) */
    document.querySelectorAll("#menu a").forEach((collegamento) => {
        collegamento.addEventListener("click", (evento) => {
            evento.preventDefault();
            document.body.classList.remove("menu");

            const nome = collegamento.getAttribute("href").slice(1);
            const indice = CAPITOLI.findIndex((voce) => voce.nome === nome);
            /* un salto dal menu attraversa più capitoli in un colpo:
               il lucchetto dei gesti lo gestisce vaiAlCapitolo */
            if (indice >= 0) vaiAlCapitolo(indice);
        });
    });
}

/* ---------------------------------------------------------
   AVVIO
   Il canvas ha dimensione zero finché <main> è display:none
   (fallback desktop / telefono in orizzontale): in quel caso
   non si scarica un solo frame e si aspetta la rotazione.
--------------------------------------------------------- */

function ridottoMovimento() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function visibile() {
    return canvas.getBoundingClientRect().width > 0;
}

async function avvia() {
    if (avviato || !visibile()) return;
    avviato = true;

    /* si riparte sempre dalla copertina: dopo un reload il
       browser ripristinerebbe lo scroll a metà pagina */
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    window.scrollTo(0, 0);

    dimensiona();

    /* Chi ha chiesto meno movimento salta l'introduzione: la
       copertina è già al suo frame di riposo */
    if (ridottoMovimento()) {
        mostra(CAPITOLI[0].fine);
        apriLaSequenza();
        return;
    }

    /* pagina ferma sulla copertina da subito, poi il primo
       fotogramma: il riempimento della finestra parte proprio
       dai frame dell'introduzione */
    fermaLaPagina();
    mostra(0);

    const introduzione = [];
    for (let i = 0; i <= CAPITOLI[0].fine; i++) introduzione.push(i);
    await attendi(introduzione, ATTESA_INTRO);

    apriIntroduzione();
}

/* Rotazione, barra dinamica, tastiera: il canvas segue il
   viewport. Il ridisegno avviene solo se le misure cambiano
   davvero (dimensiona() lo verifica) */
let attesaMisure;
function misureCambiate() {
    clearTimeout(attesaMisure);
    attesaMisure = setTimeout(() => {
        if (!avviato) {
            avvia();   /* telefono ruotato in verticale: si parte ora */
            return;
        }
        if (dimensiona()) disegna();

        /* dopo una rotazione (o il ritiro della barra del browser)
           le quote cambiano: si torna esattamente sul capitolo in
           corso, senza restare a metà di una transizione.
           Mentre si digita no: sposterebbe la pagina sotto la
           tastiera aperta. */
        if (!sequenzaAperta || stoDigitando() || !liberi()) return;
        misura();
        window.scrollTo(0, Math.min(misure.quote[capitolo], misure.limite));
    }, 150);
}

window.addEventListener("resize", misureCambiate);
window.addEventListener("orientationchange", misureCambiate);

/* script.js aggiunge "caricato" al body a fine caricamento:
   è il segnale d'avvio (se è già arrivato, si parte subito) */
if (document.body.classList.contains("caricato")) {
    avvia();
} else {
    /* nome diverso da "osservatore" (l'Observer dei gesti): qui
       si guarda solo la classe del body */
    const sentinella = new MutationObserver(() => {
        if (document.body.classList.contains("caricato")) {
            sentinella.disconnect();
            avvia();
        }
    });
    sentinella.observe(document.body, { attributes: true, attributeFilter: ["class"] });
}
