/* =========================================================
   ANIMAZIONI GSAP
   - tratti e disegni (png) avvolti in svg e "dipinti" da
     pennellate procedurali, diverse per ogni immagine
   - timeline narrativa guidata dallo scroll (ScrollTrigger)
   - copertina che si apre in 3D come due porte
   - navigazione a pagine stile TikTok (Observer)
   Si avvia quando script.js aggiunge "caricato" al body.
   ========================================================= */

gsap.registerPlugin(ScrollTrigger, ScrollToPlugin, Observer);

/* Sui dispositivi touch la tastiera (e la barra indirizzi) ridimensionano
   il viewport: senza questo flag ogni apertura della tastiera scatena un
   refresh di ScrollTrigger che fa perdere il focus ai campi del form */
ScrollTrigger.config({ ignoreMobileResize: true });

/* iOS Safari compone lo scroll in modo asincrono: l'elemento in pin
   "trema" e scatta. normalizeScroll unifica lo scroll in JS ed è il
   rimedio ufficiale GSAP per il jitter del pin su iOS.
   ATTENZIONE: il suo Observer interno fa preventDefault su tutti i
   tocchi — senza ignore sui campi del form, il tap apre la tastiera
   che si richiude subito */
const normalizzatore = ScrollTrigger.normalizeScroll({
    ignore: "#form input, #form textarea, #form button"
});

/* Sequenza delle scene DOPO la copertina (che ha un effetto dedicato) */
const SEQUENZA = ["#invito", "#cerimonia", "#ricevimento", "#conferma", "#lista"];

/* Quanto ogni scena resta completa prima di iniziare a smontarsi,
   in unità di timeline (si traduce in distanza di scroll) */
const PAUSA_SCENA = 0.8;

/* Passo della narrazione: secondi reali per ogni unità di timeline.
   La durata di una transizione è proporzionale a quanta storia
   attraversa. Più alto = tutto più lento e leggibile. */
const SECONDI_PER_UNITA = 0.8;

/* Finestra di comparsa di ogni lettera del contenuto */
const FINESTRA_LETTERA = 0.15;

const SVG_NS = "http://www.w3.org/2000/svg";

/* ---------------------------------------------------------
   Generatore di casualità DETERMINISTICO, seminato con una
   stringa. Fondamentale: il seme è il percorso del file, così
   le due copie della copertina (anta sinistra e destra) hanno
   pennellate IDENTICHE e le metà combaciano alla giunzione.
--------------------------------------------------------- */
function creaCaso(seme) {
    let h = 1779033703 ^ seme.length;
    for (let i = 0; i < seme.length; i++) {
        h = Math.imul(h ^ seme.charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }
    return function () {
        h = Math.imul(h ^ (h >>> 16), 2246822507);
        h = Math.imul(h ^ (h >>> 13), 3266489909);
        h ^= h >>> 16;
        return (h >>> 0) / 4294967296;
    };
}

/* ---------------------------------------------------------
   Avvolge una <img> in un <svg> con l'immagine mascherata da
   pennellate procedurali. Ogni immagine ha le sue: numero di
   passate, verso (orizzontale/verticale), ordine (dall'alto o
   dal basso), curvatura, inclinazione, spessore e "sporcizia"
   dei bordi variano con il caso seminato dal percorso.
   La variabile --p (0 -> 1) tira le passate una dopo l'altra.
--------------------------------------------------------- */
let contatoreMaschere = 0;

function avvolgiPennellate(img, posizione) {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    /* immagine non pronta: resta <img> col ripiego in dissolvenza */
    if (!w || !h) return null;

    const caso = creaCaso(img.dataset.src || img.getAttribute("src") || "");

    /* carattere di questa immagine */
    const verticale = caso() < 0.3;                 /* ~1 su 3 dipinta a colonne */
    const passate = 6 + Math.floor(caso() * 4);     /* 6..9 pennellate */
    const dalFondo = caso() < 0.5;                  /* ordine di stesura */
    const finestra = 0.3 + caso() * 0.15;           /* sovrapposizione temporale */

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svg.setAttribute("preserveAspectRatio", posizione);
    svg.setAttribute("class", img.className + " pennellato");
    svg.style.setProperty("--p", 0);
    svg.style.setProperty("--w", finestra.toFixed(3));

    const id = ++contatoreMaschere;

    /* maschera: pennellate bianche = zone rivelate.
       NESSUN filtro feTurbulence: iOS Safari lo rasterizza su CPU
       a ogni frame ed era la fonte principale del lag — la
       "ruvidità" della setola ora è nella geometria dei tratti */
    const maschera = document.createElementNS(SVG_NS, "mask");
    maschera.setAttribute("id", `pennellate-${id}`);
    const gruppo = document.createElementNS(SVG_NS, "g");
    gruppo.setAttribute("stroke", "#fff");
    gruppo.setAttribute("fill", "none");
    gruppo.setAttribute("stroke-linecap", "round");
    gruppo.setAttribute("stroke-linejoin", "round");

    const lungo = verticale ? h : w;   /* direzione di corsa della pennellata */
    const corto = verticale ? w : h;   /* direzione di accumulo delle passate */
    const passo = corto / passate;
    let direzione = caso() < 0.5 ? 1 : -1;

    for (let i = 0; i < passate; i++) {
        /* i = ordine temporale; la posizione sulla tela dipende
           dal verso di stesura scelto (dall'alto o dal fondo) */
        const banda = dalFondo ? passate - 1 - i : i;
        const pos = passo * (banda + 0.5) + (caso() - 0.5) * passo * 0.4;
        const inclinazione = (caso() - 0.5) * passo * 0.5;
        const curvatura = (caso() - 0.5) * passo * 1.1;
        const spessore = passo * (1.35 + caso() * 0.5);

        const a0 = -lungo * 0.08;
        const a1 = lungo * 1.08;
        const da = direzione > 0 ? a0 : a1;
        const a = direzione > 0 ? a1 : a0;
        /* quasi sempre la mano torna indietro, ogni tanto
           riparte dallo stesso lato */
        if (caso() > 0.15) direzione *= -1;

        /* la pennellata è una spezzata di 8 segmenti con tremolio:
           arco della mano (seno) + jitter per punto = bordo vivo,
           senza filtri da rasterizzare a ogni frame */
        const SEGMENTI = 8;
        const punti = [];
        for (let k = 0; k <= SEGMENTI; k++) {
            const t = k / SEGMENTI;
            const corsa = da + (a - da) * t;
            const deriva = pos - inclinazione + inclinazione * 2 * t
                + curvatura * Math.sin(Math.PI * t)
                + (caso() - 0.5) * passo * 0.22;
            punti.push(verticale
                ? `${Math.round(deriva)} ${Math.round(corsa)}`
                : `${Math.round(corsa)} ${Math.round(deriva)}`);
        }

        const path = document.createElementNS(SVG_NS, "path");
        path.setAttribute("d", "M " + punti.join(" L "));
        path.setAttribute("stroke-width", String(Math.round(spessore)));
        path.setAttribute("pathLength", "1");
        path.style.setProperty("--s", ((i / passate) * (1 - finestra)).toFixed(4));
        gruppo.appendChild(path);
    }
    maschera.appendChild(gruppo);

    /* sigillo: velo bianco che si stende nell'ultima finestra della
       pittura e chiude i micro-spiragli tra le passate (i bordi
       ruvidi della turbolenza possono lasciare buchi attraverso cui
       si vedrebbe ciò che sta sotto, es. la penombra dell'apertura) */
    const sigillo = document.createElementNS(SVG_NS, "rect");
    sigillo.setAttribute("class", "sigillo");
    sigillo.setAttribute("x", String(Math.round(-w * 0.05)));
    sigillo.setAttribute("y", String(Math.round(-h * 0.05)));
    sigillo.setAttribute("width", String(Math.round(w * 1.1)));
    sigillo.setAttribute("height", String(Math.round(h * 1.1)));
    sigillo.setAttribute("fill", "#fff");
    sigillo.style.setProperty("--s", (1 - finestra).toFixed(4));
    maschera.appendChild(sigillo);

    const defs = document.createElementNS(SVG_NS, "defs");
    defs.append(maschera);
    svg.appendChild(defs);

    const image = document.createElementNS(SVG_NS, "image");
    image.setAttribute("href", img.src);
    image.setAttribute("width", String(w));
    image.setAttribute("height", String(h));
    image.setAttribute("mask", `url(#pennellate-${id})`);
    svg.appendChild(image);

    img.replaceWith(svg);
    return svg;
}

/* ---------------------------------------------------------
   Avvolge tutte le immagini di tratti e disegni.
   L'ancoraggio (preserveAspectRatio) replica gli object-position
   del CSS: centro-basso nelle scene, i due bordi nelle ante.
--------------------------------------------------------- */
function preparaImmagini() {
    document.querySelectorAll(".scena > img.tratti, .scena > img.disegno")
        .forEach((img) => avvolgiPennellate(img, "xMidYMax slice"));
    document.querySelectorAll("#anta-sinistra img")
        .forEach((img) => avvolgiPennellate(img, "xMinYMax slice"));
    document.querySelectorAll("#anta-destra img")
        .forEach((img) => avvolgiPennellate(img, "xMaxYMax slice"));
}

/* ---------------------------------------------------------
   Preparazione del contenuto per l'effetto "scritto a mano":
   - svg calligrafici inline (data, nomi dei luoghi): ogni path
     è un glifo, scritto in cascata nell'ordine del documento;
   - testi spezzati in lettere, ognuna col suo istante --s;
   - campi del form e immagini: tendina rapida a bordo netto.
--------------------------------------------------------- */
function preparaContenuti() {
    document.querySelectorAll(".scena .contenuto > *").forEach((elemento) => {
        elemento.style.setProperty("--w", FINESTRA_LETTERA);

        if (elemento.tagName.toLowerCase() === "svg") {
            /* l'attributo alt sui <svg> non è standard: lo si traduce
               in ciò che gli screen reader capiscono davvero */
            if (elemento.hasAttribute("alt")) {
                elemento.setAttribute("role", "img");
                elemento.setAttribute("aria-label", elemento.getAttribute("alt"));
            }
            const paths = elemento.querySelectorAll("path");
            paths.forEach((path, i) => {
                path.style.setProperty("--s", ((i / paths.length) * (1 - FINESTRA_LETTERA)).toFixed(4));
            });
            return;
        }

        if (["INPUT", "TEXTAREA", "BUTTON", "IMG"].includes(elemento.tagName)) {
            elemento.classList.add("campo");
            return;
        }

        const lettere = [];
        spezzaInLettere(elemento, lettere);
        lettere.forEach((lettera, i) => {
            lettera.style.setProperty("--s", ((i / lettere.length) * (1 - FINESTRA_LETTERA)).toFixed(4));
        });

        /* i marker 📍 (pseudo-elementi dei link) compaiono insieme
           al collegamento: ereditano l'istante dell'ultima lettera */
        elemento.querySelectorAll("a").forEach((link) => {
            const lettereLink = link.querySelectorAll(".lettera");
            if (lettereLink.length) {
                const ultima = lettereLink[lettereLink.length - 1];
                link.style.setProperty("--s-marker", ultima.style.getPropertyValue("--s"));
            }
        });
    });
}

function spezzaInLettere(nodo, lettere) {
    [...nodo.childNodes].forEach((figlio) => {
        if (figlio.nodeType === Node.TEXT_NODE) {
            const frammento = document.createDocumentFragment();
            let parola = null;
            for (const carattere of figlio.textContent) {
                if (carattere.trim() === "") {
                    frammento.append(carattere); /* spazi: unico punto di a capo */
                    parola = null;
                    continue;
                }
                /* le lettere (inline-block) spezzerebbero le parole a fine
                   riga: ogni parola vive in uno span non divisibile */
                if (!parola) {
                    parola = document.createElement("span");
                    parola.className = "parola";
                    frammento.append(parola);
                }
                const span = document.createElement("span");
                span.className = "lettera";
                span.textContent = carattere;
                parola.append(span);
                lettere.push(span);
            }
            figlio.replaceWith(frammento);
        } else if (figlio.nodeType === Node.ELEMENT_NODE && !["BR", "IMG", "SVG"].includes(figlio.tagName)) {
            spezzaInLettere(figlio, lettere); /* es. <strong>, <a>, lo span del countdown */
        }
    });
}

/* ---------------------------------------------------------
   Elementi animabili di una scena
--------------------------------------------------------- */
function elementiScena(selettore) {
    const scena = document.querySelector(selettore);
    return {
        /* svg se l'avvolgimento è riuscito, img come ripiego:
           entrambi rispondono alla stessa variabile --p */
        tratti: scena.querySelector(":scope > .tratti"),
        disegno: scena.querySelector(":scope > .disegno"),
        contenuto: scena.querySelectorAll(".contenuto > *")
    };
}

/* ---------------------------------------------------------
   Comparsa di una scena: prima i tratti dipinti a pennellate,
   poi il disegno (pennellate diverse), infine il contenuto
   scritto a mano.
--------------------------------------------------------- */
function comparsaScena(selettore) {
    const { tratti, disegno, contenuto } = elementiScena(selettore);
    const tl = gsap.timeline();

    if (tratti) {
        tl.to(tratti, { "--p": 1, duration: 1.6, ease: "none" }, 0);
    }
    if (disegno) {
        tl.to(disegno, { "--p": 1, duration: 1.4, ease: "none" }, 1.3);
    }
    if (contenuto.length) {
        /* un elemento alla volta, come righe scritte in successione */
        tl.to(contenuto, { "--write": 1, duration: 1, stagger: 0.25, ease: "none" }, 2.8);
    }
    return tl;
}

/* ---------------------------------------------------------
   Scomparsa di una scena: procedimento inverso.
   Le pennellate si ritirano nell'ordine opposto alla stesura.
--------------------------------------------------------- */
function scomparsaScena(selettore) {
    const { tratti, disegno, contenuto } = elementiScena(selettore);
    const tl = gsap.timeline();

    if (contenuto.length) {
        tl.to(contenuto, { "--write": 0, duration: 0.5, stagger: { each: 0.08, from: "end" }, ease: "none" }, 0);
    }
    if (disegno) {
        tl.to(disegno, { "--p": 0, duration: 0.6, ease: "none" }, 0.4);
    }
    if (tratti) {
        tl.to(tratti, { "--p": 0, duration: 0.8, ease: "none" }, 0.8);
    }
    return tl;
}

/* ---------------------------------------------------------
   Apertura della copertina: le due ante ruotano in 3D sui
   cardini esterni, come porte. Oltre i 90 gradi il retro è
   nascosto (backface-visibility) e le ante spariscono.
   NB: transformOrigin va passato a GSAP, che altrimenti
   sovrascriverebbe quello definito nel CSS.
--------------------------------------------------------- */
function aperturaCopertina() {
    const tl = gsap.timeline();
    /* rotazione lunga e a velocità quasi uniforme: è lei il cuore
       dell'effetto 3D, occupa buona parte del viaggio verso l'invito */
    tl.to("#anta-sinistra", { rotationY: -105, transformOrigin: "left center", duration: 2.4, ease: "power1.inOut" }, 0)
      .to("#anta-destra", { rotationY: 105, transformOrigin: "right center", duration: 2.4, ease: "power1.inOut" }, 0)
      /* ombra che cresce durante la rotazione e svanisce a fine apertura */
      .to("#anta-sinistra, #anta-destra", { "--ombra": 0.7, duration: 1.2, ease: "power1.in" }, 0)
      .to("#anta-sinistra, #anta-destra", { "--ombra": 0, duration: 1.1, ease: "power1.out" }, 1.3)
      /* penombra sulla scena rivelata: sale al primo spiraglio e si
         schiarisce con l'apertura. Vive SOLO dentro questa timeline
         (due .to concatenati): a copertina chiusa è sempre 0 */
      .to("#home", { "--buio": 0.55, duration: 0.2, ease: "power1.out" }, 0.01)
      .to("#home", { "--buio": 0, duration: 2, ease: "sine.out" }, 0.3);
    return tl;
}

/* ---------------------------------------------------------
   Intro della copertina: appena il caricamento finisce, la
   copertina si dipinge da sola — prima i tratti, poi il
   disegno. Timeline a tempo, indipendente dallo scroll.
--------------------------------------------------------- */
function introCopertina() {
    const tl = gsap.timeline();
    tl.to("#home .tratti", { "--p": 1, duration: 1.6, ease: "none" }, 0)
      .to("#home .disegno", { "--p": 1, duration: 1.3, ease: "none" }, 1.1);
    return tl;
}

/* ---------------------------------------------------------
   Costruzione della narrazione + collegamenti
--------------------------------------------------------- */
function costruisci() {
    /* Stato iniziale: nessun elemento delle scene è visibile */
    gsap.set(".scena .contenuto > *", { "--write": 0 });

    const master = gsap.timeline();
    master.addLabel("home", 0);

    /* La copertina si apre e l'invito inizia a comporsi
       già mentre le ante sono ancora in movimento (overlap) */
    master.add(aperturaCopertina());
    master.add(comparsaScena("#invito"), "-=0.9");
    master.addLabel("invito");

    /* Ogni transizione: la scena resta completa per PAUSA_SCENA,
       poi scompare del tutto e appare la successiva.
       L'etichetta "inizio-..." marca il momento esatto in cui la
       nuova scena comincia a comparire (usata per la scena attiva) */
    let precedente = "#invito";
    SEQUENZA.slice(1).forEach((selettore) => {
        master.add(scomparsaScena(precedente), "+=" + PAUSA_SCENA);
        master.addLabel("inizio-" + selettore.slice(1));
        master.add(comparsaScena(selettore));
        master.addLabel(selettore.slice(1));
        precedente = selettore;
    });

    /* coda: anche l'ultima scena resta completa per un tratto di scroll */
    master.to({}, { duration: PAUSA_SCENA });

    /* Stato della navigazione a pagine (stile TikTok) */
    const nomiScene = ["home", ...SEQUENZA.map((s) => s.slice(1))];
    let indiceScena = 0;
    let bloccoFino = 0; /* timestamp fino a cui i gesti sono ignorati */
    const libero = () => performance.now() >= bloccoFino;

    /* L'invito a scorrere sparisce quando si arriva all'ultima scena
       (e ricompare tornando indietro) */
    const scroller = document.getElementById("scroller");
    const aggiornaScroller = () => {
        if (scroller) scroller.classList.toggle("nascosto", indiceScena === nomiScene.length - 1);
    };

    /* Scena attiva = l'unica che riceve i click. È quella
       dell'ultima soglia "inizio-..." superata dallo scroll. */
    let scenaAttiva = null;
    function aggiornaScenaAttiva(self) {
        let corrente = "#invito";
        SEQUENZA.slice(1).forEach((selettore) => {
            if (self.scroll() >= self.labelToScroll("inizio-" + selettore.slice(1))) {
                corrente = selettore;
            }
        });
        if (corrente !== scenaAttiva) {
            if (scenaAttiva) document.querySelector(scenaAttiva).classList.remove("attiva");
            document.querySelector(corrente).classList.add("attiva");
            scenaAttiva = corrente;
        }

        /* fuori transizione (es. trascinamento della barra di scroll)
           l'indice segue la scena più vicina */
        if (libero()) {
            let vicino = 0;
            let distanzaMinima = Infinity;
            nomiScene.forEach((nome, i) => {
                const distanza = Math.abs(self.scroll() - self.labelToScroll(nome));
                if (distanza < distanzaMinima) {
                    distanzaMinima = distanza;
                    vicino = i;
                }
            });
            indiceScena = vicino;
            aggiornaScroller();
        }
    }

    /* ScrollTrigger: stage in pin, timeline agganciata allo scroll */
    const st = ScrollTrigger.create({
        animation: master,
        trigger: ".stage",
        start: "top top",
        end: () => "+=" + Math.round(master.duration() * 380),
        pin: true,
        scrub: 1,
        onUpdate: aggiornaScenaAttiva,
        onRefresh: aggiornaScenaAttiva
    });

    /* Logo: grande solo sulla copertina chiusa. Appena le ante
       iniziano ad aprirsi — e in tutte le altre scene — riceve
       .sticky (il rimpicciolimento lo fa il CSS con transizione).
       onEnter/onLeaveBack coprono i due versi dello scroll,
       onRefresh risincronizza dopo un reload a metà pagina. */
    const logo = document.getElementById("logo");
    ScrollTrigger.create({
        start: () => st.start + 2,
        onEnter: () => logo.classList.add("sticky"),
        onLeaveBack: () => logo.classList.remove("sticky"),
        onRefresh: (self) => logo.classList.toggle("sticky", self.scroll() >= self.start)
    });

    /* --- Navigazione a pagine stile TikTok ---------------------
       Observer intercetta rotella e swipe (lo scroll nativo è
       disattivato): ogni gesto, anche leggero, porta alla scena
       adiacente riproducendo l'intera transizione. */
    function vaiAScena(indice) {
        indice = Math.max(0, Math.min(nomiScene.length - 1, indice));
        if (indice === indiceScena) return;
        /* durata proporzionale a quanta timeline si attraversa */
        const unita = Math.abs(master.labels[nomiScene[indice]] - master.labels[nomiScene[indiceScena]]);
        const durata = Math.max(1.5, unita * SECONDI_PER_UNITA);
        indiceScena = indice;
        aggiornaScroller(); /* sparisce già in viaggio verso l'ultima scena */
        /* lucchetto A SCADENZA (mai Infinity: se il tween morisse senza
           callback, la navigazione resterebbe bloccata per sempre) */
        bloccoFino = performance.now() + durata * 1000 + 300;
        gsap.to(window, {
            duration: durata,
            /* mai oltre lo scroll raggiungibile: la barra del browser
               che si ritira (nessun refresh, ignoreMobileResize) può
               spingere l'ultima etichetta oltre il fondo pagina */
            scrollTo: Math.min(st.labelToScroll(nomiScene[indice]), ScrollTrigger.maxScroll(window)),
            ease: "power1.inOut",
            overwrite: true,
            onComplete: () => { bloccoFino = performance.now() + 300; },
            onInterrupt: () => { bloccoFino = performance.now() + 300; }
        });
    }

    const osservatoreGesti = Observer.create({
        target: window,
        type: "wheel,touch",
        wheelSpeed: -1, /* allinea la rotella alla semantica dello swipe */
        tolerance: 10,
        preventDefault: true,
        allowClicks: true,
        lockAxis: true,
        /* i tocchi che INIZIANO sui campi del form restano nativi:
           il preventDefault sul touchstart farebbe richiudere la
           tastiera subito dopo il focus */
        ignore: "#form input, #form textarea, #form button",
        onDown: () => { if (libero()) vaiAScena(indiceScena - 1); },
        onUp: () => { if (libero()) vaiAScena(indiceScena + 1); }
    });

    /* Cintura di sicurezza: mentre si DIGITA in un campo di testo
       (tastiera aperta) l'Observer è spento. Lo stato si ricalcola
       sempre da document.activeElement: le coppie focusin/focusout
       possono perdersi (es. il bottone che tiene il focus e viene
       disabilitato durante l'invio non emette focusout) e l'Observer
       resterebbe spento per sempre, bloccando la navigazione.
       Il bottone NON è digitazione: non spegne nulla. */
    const stoDigitando = () => {
        const el = document.activeElement;
        return !!(el && el.matches && el.matches("#form input, #form textarea"));
    };
    const aggiornaGesti = () => {
        if (stoDigitando()) {
            /* tastiera aperta: TUTTO nativo, anche il normalizer */
            osservatoreGesti.disable();
            if (normalizzatore) normalizzatore.disable();
        } else {
            if (!osservatoreGesti.isEnabled) osservatoreGesti.enable();
            if (normalizzatore && !normalizzatore.isEnabled) normalizzatore.enable();
        }
    };
    document.addEventListener("focusin", aggiornaGesti);
    document.addEventListener("focusout", () => setTimeout(aggiornaGesti, 0));
    /* auto-riparazione: se un cambio di focus si è perso, il primo
       tocco o rotellata rimette le cose a posto */
    window.addEventListener("touchstart", aggiornaGesti, { passive: true });
    window.addEventListener("wheel", aggiornaGesti, { passive: true });

    /* tastiera: frecce, pagina, spazio (ma non mentre si compila il form) */
    window.addEventListener("keydown", (evento) => {
        if (evento.target instanceof Element && evento.target.matches("input, textarea")) return;
        if (["ArrowDown", "PageDown", " "].includes(evento.key)) {
            evento.preventDefault();
            if (libero()) vaiAScena(indiceScena + 1);
        } else if (["ArrowUp", "PageUp"].includes(evento.key)) {
            evento.preventDefault();
            if (libero()) vaiAScena(indiceScena - 1);
        }
    });

    /* Menu: i link saltano direttamente al punto di visualizzazione
       della scena, già completa, senza attraversare le intermedie.
       Oltre allo scroll istantaneo va azzerata l'inerzia dello scrub.
       (script.js chiude il menu) */
    document.querySelectorAll("#menu a").forEach((a) => {
        a.addEventListener("click", () => {
            const nome = a.getAttribute("href").slice(1);
            gsap.killTweensOf(window); /* interrompe un'eventuale transizione in corso */
            indiceScena = nomiScene.indexOf(nome);
            aggiornaScroller();
            bloccoFino = performance.now() + 300;
            st.scroll(Math.min(st.labelToScroll(nome), ScrollTrigger.maxScroll(window)));
            const scrub = st.getTween();
            if (scrub) scrub.progress(1);
            ScrollTrigger.update();
        });
    });

    ScrollTrigger.refresh();
}

/* ---------------------------------------------------------
   Avvio: quando script.js ha caricato tutte le immagini
   aggiunge "caricato" al body — è il nostro segnale.
--------------------------------------------------------- */
function avvia() {
    preparaImmagini();
    preparaContenuti();
    costruisci();
    introCopertina();
}

if (document.body.classList.contains("caricato")) {
    avvia();
} else {
    const osservatore = new MutationObserver(() => {
        if (document.body.classList.contains("caricato")) {
            osservatore.disconnect();
            avvia();
        }
    });
    osservatore.observe(document.body, { attributes: true, attributeFilter: ["class"] });
}
