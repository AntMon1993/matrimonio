/* =========================================================
   ANIMAZIONI GSAP
   - post-processing degli svg .tratti iniettati da script.js
     (pathLength normalizzato + partenze scaglionate per il trim)
   - timeline narrativa guidata dallo scroll (ScrollTrigger)
   - copertina che si apre in 3D come due porte
   - logo che diventa .sticky all'arrivo di #cerimonia
   Si avvia quando script.js toglie la classe "caricare" dal body.
   ========================================================= */

gsap.registerPlugin(ScrollTrigger, ScrollToPlugin, Observer);

/* Sui dispositivi touch la tastiera (e la barra indirizzi) ridimensionano
   il viewport: senza questo flag ogni apertura della tastiera scatena un
   refresh di ScrollTrigger che fa perdere il focus ai campi del form */
ScrollTrigger.config({ ignoreMobileResize: true });

/* Sequenza delle scene DOPO la copertina (che ha un effetto dedicato) */
const SEQUENZA = ["#invito", "#cerimonia", "#ricevimento", "#conferma", "#lista"];

/* Frazione del progresso --p in cui ogni singolo path si disegna:
   più basso = tratti più sequenziali e secchi, più alto = più sovrapposti */
const FINESTRA_TRATTO = 0.2;

/* Quanto ogni scena resta completa prima di iniziare a smontarsi,
   in unità di timeline (si traduce in distanza di scroll) */
const PAUSA_SCENA = 0.8;

/* Durata (secondi) della transizione tra una scena e l'altra:
   più alta = tratti e pennellate più leggibili durante il viaggio */
const DURATA_TRANSIZIONE = 3;

/* Pennellate con cui i disegni vengono "dipinti" */
const PENNELLATE = 8;              /* numero di passate del pennello */
const FINESTRA_PENNELLATA = 0.35;  /* sovrapposizione temporale tra passate */

/* Finestra di comparsa di ogni lettera/glifo del contenuto */
const FINESTRA_LETTERA = 0.15;

const SVG_NS = "http://www.w3.org/2000/svg";

/* ---------------------------------------------------------
   Post-processing degli svg iniettati da script.js.
   Ogni path viene normalizzato a lunghezza 1 (pathLength) e
   riceve un istante di partenza --s proporzionale alla sua
   posizione nel documento (= ordine di disegno in Illustrator):
   una sola variabile --p disegna così tutti i tratti in
   cascata, uno dopo l'altro, come farebbe una mano.
--------------------------------------------------------- */
function preparaTratti() {
    /* sia gli svg delle scene sia quelli nelle ante della copertina
       ricevono il trattamento completo per il trim in cascata */
    document.querySelectorAll(".scena > svg, .cover > svg").forEach((svg) => {
        svg.classList.add("tratti");
        svg.setAttribute("preserveAspectRatio", "xMidYMax slice");
        svg.style.setProperty("--p", 0);
        svg.style.setProperty("--w", FINESTRA_TRATTO);

        /* le forme base (es. le ellissi in 5.svg) resterebbero fuori dal
           trim: le convertiamo in path equivalenti, al loro posto nel
           documento, così si disegnano in cascata come tutto il resto */
        svg.querySelectorAll("ellipse, circle").forEach((forma) => {
            const cx = parseFloat(forma.getAttribute("cx") || 0);
            const cy = parseFloat(forma.getAttribute("cy") || 0);
            const rx = parseFloat(forma.getAttribute("rx") || forma.getAttribute("r") || 0);
            const ry = parseFloat(forma.getAttribute("ry") || forma.getAttribute("r") || 0);
            const path = document.createElementNS(SVG_NS, "path");
            [...forma.attributes].forEach((attributo) => {
                if (!["cx", "cy", "rx", "ry", "r"].includes(attributo.name)) {
                    path.setAttribute(attributo.name, attributo.value);
                }
            });
            path.setAttribute("d",
                `M ${cx - rx} ${cy} a ${rx} ${ry} 0 1 0 ${2 * rx} 0 a ${rx} ${ry} 0 1 0 ${-2 * rx} 0`);
            forma.replaceWith(path);
        });

        const paths = svg.querySelectorAll("path");
        paths.forEach((path, i) => {
            path.setAttribute("pathLength", "1");
            /* l'ultimo path termina esattamente a --p = 1 */
            path.style.setProperty("--s", ((i / paths.length) * (1 - FINESTRA_TRATTO)).toFixed(4));
        });
    });
}

/* ---------------------------------------------------------
   Trasformazione dei disegni in "quadri da dipingere".
   Ogni img.disegno delle scene viene avvolta in un piccolo svg:
   l'immagine è mascherata da larghe pennellate a serpentina
   (bordi sporcati da un filtro turbolenza, come setola secca)
   che si tirano una dopo l'altra. Le pennellate usano la stessa
   meccanica del trim dei tratti, pilotata dalla variabile
   --paint che la timeline già anima: 0 = tela vuota, 1 = dipinto.
--------------------------------------------------------- */
function preparaDisegni() {
    document.querySelectorAll(".scena > img.disegno, .cover > img.disegno").forEach((img, indice) => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        /* immagine non caricata: resta <img> col ripiego a maschera sfumata */
        if (!w || !h) return;

        const svg = document.createElementNS(SVG_NS, "svg");
        svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
        svg.setAttribute("preserveAspectRatio", "xMidYMax slice");
        svg.setAttribute("class", "disegno");
        svg.style.setProperty("--paint", 0);
        svg.style.setProperty("--w", FINESTRA_PENNELLATA);

        /* filtro che increspa i bordi delle pennellate */
        const filtro = document.createElementNS(SVG_NS, "filter");
        filtro.setAttribute("id", `ruvido-${indice}`);
        filtro.setAttribute("x", "-20%");
        filtro.setAttribute("y", "-20%");
        filtro.setAttribute("width", "140%");
        filtro.setAttribute("height", "140%");
        const turbolenza = document.createElementNS(SVG_NS, "feTurbulence");
        turbolenza.setAttribute("type", "fractalNoise");
        turbolenza.setAttribute("baseFrequency", `${(8 / w).toFixed(4)} ${(60 / h).toFixed(4)}`);
        turbolenza.setAttribute("numOctaves", "3");
        turbolenza.setAttribute("seed", String(indice * 7 + 1));
        turbolenza.setAttribute("result", "grana");
        const spostamento = document.createElementNS(SVG_NS, "feDisplacementMap");
        spostamento.setAttribute("in", "SourceGraphic");
        spostamento.setAttribute("in2", "grana");
        spostamento.setAttribute("scale", String(Math.round(w * 0.05)));
        filtro.append(turbolenza, spostamento);

        /* maschera: pennellate bianche = zone rivelate */
        const maschera = document.createElementNS(SVG_NS, "mask");
        maschera.setAttribute("id", `pennellate-${indice}`);
        const gruppo = document.createElementNS(SVG_NS, "g");
        gruppo.setAttribute("stroke", "#fff");
        gruppo.setAttribute("fill", "none");
        gruppo.setAttribute("stroke-linecap", "round");
        gruppo.setAttribute("filter", `url(#ruvido-${indice})`);

        const passo = h / PENNELLATE;
        for (let i = 0; i < PENNELLATE; i++) {
            const y = passo * (i + 0.5);
            const pendenza = passo * 0.18 * (i % 2 ? 1 : -1);
            const x0 = -w * 0.08;
            const x1 = w * 1.08;
            const path = document.createElementNS(SVG_NS, "path");
            /* passate alternate sx->dx e dx->sx, come una mano che dipinge */
            path.setAttribute("d", i % 2 === 0
                ? `M ${x0} ${Math.round(y - pendenza)} L ${x1} ${Math.round(y + pendenza)}`
                : `M ${x1} ${Math.round(y - pendenza)} L ${x0} ${Math.round(y + pendenza)}`);
            path.setAttribute("stroke-width", String(Math.round(passo * 1.5)));
            path.setAttribute("pathLength", "1");
            path.style.setProperty("--s", ((i / PENNELLATE) * (1 - FINESTRA_PENNELLATA)).toFixed(4));
            gruppo.appendChild(path);
        }
        maschera.appendChild(gruppo);

        const defs = document.createElementNS(SVG_NS, "defs");
        defs.append(filtro, maschera);
        svg.appendChild(defs);

        const image = document.createElementNS(SVG_NS, "image");
        image.setAttribute("href", img.src);
        image.setAttribute("width", String(w));
        image.setAttribute("height", String(h));
        image.setAttribute("mask", `url(#pennellate-${indice})`);
        svg.appendChild(image);

        img.replaceWith(svg);
    });
}

/* ---------------------------------------------------------
   Preparazione del contenuto per l'effetto "scritto a mano".
   Ogni elemento del contenuto compare in cascata, pilotato
   dalla variabile --write che la timeline anima (0 -> 1):
   - svg calligrafici (data, nomi luoghi): i path sono glifi
     in ordine di scrittura -> compaiono uno dopo l'altro;
   - testi: spezzati in lettere, ognuna col suo istante --s;
   - campi del form e ripieghi: tendina rapida a bordo netto.
--------------------------------------------------------- */
function preparaContenuti() {
    document.querySelectorAll(".scena .contenuto > *").forEach((elemento) => {
        elemento.style.setProperty("--w", FINESTRA_LETTERA);

        /* svg calligrafico: cascata sui glifi */
        if (elemento.tagName.toLowerCase() === "svg") {
            const paths = elemento.querySelectorAll("path");
            paths.forEach((path, i) => {
                path.style.setProperty("--s", ((i / paths.length) * (1 - FINESTRA_LETTERA)).toFixed(4));
            });
            return;
        }

        /* elementi senza testo da spezzare: tendina a bordo netto */
        if (["INPUT", "TEXTAREA", "BUTTON", "IMG"].includes(elemento.tagName)) {
            elemento.classList.add("campo");
            return;
        }

        /* testo: spezzato in lettere, in ordine di lettura */
        const lettere = [];
        spezzaInLettere(elemento, lettere);
        lettere.forEach((lettera, i) => {
            lettera.style.setProperty("--s", ((i / lettere.length) * (1 - FINESTRA_LETTERA)).toFixed(4));
        });
    });
}

function spezzaInLettere(nodo, lettere) {
    [...nodo.childNodes].forEach((figlio) => {
        if (figlio.nodeType === Node.TEXT_NODE) {
            const frammento = document.createDocumentFragment();
            for (const carattere of figlio.textContent) {
                if (carattere.trim() === "") {
                    frammento.append(carattere); /* spazi: testo normale, il capo riga resta libero */
                    continue;
                }
                const span = document.createElement("span");
                span.className = "lettera";
                span.textContent = carattere;
                frammento.append(span);
                lettere.push(span);
            }
            figlio.replaceWith(frammento);
        } else if (figlio.nodeType === Node.ELEMENT_NODE && !["BR", "IMG", "SVG"].includes(figlio.tagName)) {
            spezzaInLettere(figlio, lettere); /* es. <strong> dentro uno <span> */
        }
    });
}

/* ---------------------------------------------------------
   Elementi animabili di una scena
--------------------------------------------------------- */
function elementiScena(selettore) {
    const scena = document.querySelector(selettore);
    return {
        /* svg se l'iniezione è riuscita, img come ripiego */
        tratti: scena.querySelector(":scope > svg.tratti, :scope > img.tratti"),
        disegno: scena.querySelector(":scope > .disegno"),
        contenuto: scena.querySelectorAll(".contenuto > *")
    };
}

/* ---------------------------------------------------------
   Comparsa di una scena: prima i tratti (disegnati), poi il
   disegno (pennello), infine il contenuto (scritto a mano).
--------------------------------------------------------- */
function comparsaScena(selettore) {
    const { tratti, disegno, contenuto } = elementiScena(selettore);
    const tl = gsap.timeline();

    if (tratti) {
        const target = tratti.tagName.toLowerCase() === "svg" ? { "--p": 1 } : { opacity: 1 };
        tl.to(tratti, { ...target, duration: 1.5, ease: "none" }, 0);
    }
    if (disegno) {
        tl.to(disegno, { "--paint": 1, duration: 1.3, ease: "none" }, 1.2);
    }
    if (contenuto.length) {
        /* un elemento alla volta, come righe scritte in successione */
        tl.to(contenuto, { "--write": 1, duration: 1, stagger: 0.25, ease: "none" }, 2.3);
    }
    return tl;
}

/* ---------------------------------------------------------
   Scomparsa di una scena: procedimento inverso.
   Prima il contenuto, poi il disegno, infine i tratti
   (che si "cancellano" in ordine inverso al disegno).
--------------------------------------------------------- */
function scomparsaScena(selettore) {
    const { tratti, disegno, contenuto } = elementiScena(selettore);
    const tl = gsap.timeline();

    if (contenuto.length) {
        tl.to(contenuto, { "--write": 0, duration: 0.5, stagger: { each: 0.08, from: "end" }, ease: "none" }, 0);
    }
    if (disegno) {
        tl.to(disegno, { "--paint": 0, duration: 0.5, ease: "power1.in" }, 0.4);
    }
    if (tratti) {
        const target = tratti.tagName.toLowerCase() === "svg" ? { "--p": 0 } : { opacity: 0 };
        tl.to(tratti, { ...target, duration: 0.8, ease: "none" }, 0.7);
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
    tl.to(".anta-sx", { rotationY: -105, transformOrigin: "left center", duration: 1.4, ease: "power2.inOut" }, 0)
      .to(".anta-dx", { rotationY: 105, transformOrigin: "right center", duration: 1.4, ease: "power2.inOut" }, 0)
      /* ombra che cresce durante la rotazione e svanisce a fine apertura */
      .to(".anta", { "--ombra": 0.7, duration: 0.7, ease: "power1.in" }, 0)
      .to(".anta", { "--ombra": 0, duration: 0.6, ease: "power1.out" }, 0.8)
      /* penombra sulla scena rivelata: sale al primo spiraglio e si
         schiarisce con l'apertura. Vive SOLO dentro questa timeline
         (due .to concatenati): a copertina chiusa è sempre 0,
         qualunque sia la storia della pagina */
      .to("#home", { "--buio": 0.55, duration: 0.12, ease: "power1.out" }, 0.01)
      .to("#home", { "--buio": 0, duration: 1.15, ease: "sine.out" }, 0.18);
    return tl;
}

/* ---------------------------------------------------------
   Intro della copertina: appena il caricamento finisce, la
   copertina si compone da sola — prima i tratti disegnati,
   poi il disegno a pennellate. È una timeline a tempo,
   indipendente dallo scroll.
--------------------------------------------------------- */
function introCopertina() {
    const tl = gsap.timeline();
    tl.to(".cover > svg.tratti", { "--p": 1, duration: 1.6, ease: "none" }, 0)
      .to(".cover > svg.disegno", { "--paint": 1, duration: 1.2, ease: "none" }, 1.1);
    return tl;
}

/* ---------------------------------------------------------
   Costruzione della narrazione + collegamenti
--------------------------------------------------------- */
function costruisci() {
    /* Stato iniziale: nessun elemento delle scene è visibile */
    gsap.set(".scena > .disegno", { "--paint": 0 });
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
       nuova scena comincia a comparire (utile per il logo sticky) */
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
    const hint = document.getElementById("scroll-hint");
    const aggiornaHint = () => {
        hint.classList.toggle("nascosto", indiceScena === nomiScene.length - 1);
    };

    /* Scena attiva = l'unica che riceve i click (le scene sono
       sovrapposte a tutto schermo: quelle invisibili non devono
       intercettare il form e i tocchi). È quella dell'ultima
       soglia "inizio-..." superata dallo scroll. */
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
            aggiornaHint();
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

    /* --- Navigazione a pagine stile TikTok ---------------------
       Observer intercetta rotella e swipe (lo scroll nativo è
       disattivato): ogni gesto, anche leggero, porta alla scena
       adiacente riproducendo l'intera transizione. Il lucchetto
       bloccoFino impedisce a gesti e inerzia del trackpad di
       accavallare le transizioni. */
    function vaiAScena(indice) {
        indice = Math.max(0, Math.min(nomiScene.length - 1, indice));
        if (indice === indiceScena) return;
        indiceScena = indice;
        aggiornaHint(); /* sparisce già mentre si viaggia verso l'ultima scena */
        /* lucchetto A SCADENZA (mai Infinity: se il tween morisse senza
           callback, la navigazione resterebbe bloccata per sempre) */
        bloccoFino = performance.now() + DURATA_TRANSIZIONE * 1000 + 300;
        gsap.to(window, {
            duration: DURATA_TRANSIZIONE,
            scrollTo: st.labelToScroll(nomiScene[indice]),
            ease: "power1.inOut",
            overwrite: true,
            /* se la transizione finisce o viene interrotta prima,
               il lucchetto si accorcia di conseguenza */
            onComplete: () => { bloccoFino = performance.now() + 300; },
            onInterrupt: () => { bloccoFino = performance.now() + 300; }
        });
    }

    Observer.create({
        target: window,
        type: "wheel,touch",
        wheelSpeed: -1, /* allinea la rotella alla semantica dello swipe */
        tolerance: 10,
        preventDefault: true,
        allowClicks: true,
        lockAxis: true,
        onDown: () => { if (libero()) vaiAScena(indiceScena - 1); },
        onUp: () => { if (libero()) vaiAScena(indiceScena + 1); }
    });

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

    /* Logo. Finché c'è body.caricare non lo tocca nessuno (le
       animazioni si costruiscono solo dopo). Poi:
       - prime due scene (home, invito): posizione normale da CSS;
       - dal momento esatto in cui #cerimonia inizia a comparire
         in avanti: classe .sticky (la transizione la fa il CSS).
       onEnter/onLeaveBack gestiscono lo scroll nei due versi;
       onRefresh risincronizza lo stato se la pagina viene
       ricaricata con lo scroll già oltre la soglia. */
    const logo = document.getElementById("logo");
    ScrollTrigger.create({
        start: () => st.labelToScroll("inizio-cerimonia"),
        onEnter: () => logo.classList.add("sticky"),
        onLeaveBack: () => logo.classList.remove("sticky"),
        onRefresh: (self) => logo.classList.toggle("sticky", self.scroll() >= self.start)
    });

    /* Navigazione: i link saltano direttamente al punto di
       visualizzazione della scena (scena completa), senza
       attraversare in corsa quelle intermedie. Oltre allo
       scroll istantaneo va azzerata l'inerzia dello scrub,
       che altrimenti "rincorrerebbe" il punto per un secondo.
       (script.js chiude il menu) */
    document.querySelectorAll("nav a").forEach((a) => {
        a.addEventListener("click", () => {
            const nome = a.getAttribute("href").slice(1);
            gsap.killTweensOf(window); /* interrompe un'eventuale transizione in corso */
            indiceScena = nomiScene.indexOf(nome);
            aggiornaHint();
            bloccoFino = performance.now() + 300;
            st.scroll(st.labelToScroll(nome));
            const scrub = st.getTween();
            if (scrub) scrub.progress(1);
            ScrollTrigger.update();
        });
    });

    ScrollTrigger.refresh();
}

/* ---------------------------------------------------------
   Avvio: quando script.js ha finito di caricare e iniettare
   tutto, toglie "caricare" dal body — è il nostro segnale.
--------------------------------------------------------- */
function avvia() {
    preparaTratti();
    preparaDisegni();
    preparaContenuti();
    costruisci();
    introCopertina();
}

if (!document.body.classList.contains("caricare")) {
    /* caso limite: caricamento già completato */
    avvia();
} else {
    const osservatore = new MutationObserver(() => {
        if (!document.body.classList.contains("caricare")) {
            osservatore.disconnect();
            avvia();
        }
    });
    osservatore.observe(document.body, { attributes: true, attributeFilter: ["class"] });
}
