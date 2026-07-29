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
   - all'arrivo sulla pagina la A e la L del logo sono vuote e in
     sottofondo si scaricano TUTTI i frame: ogni frame arrivato le
     riempie un po' (è la barra di caricamento), fino al 100%;
   - solo allora, a pagina ancora ferma, la sequenza si apre da
     sola dal frame 0 al 23 e data e nomi del logo si scrivono:
     quei frame si vedono soltanto qui, poi non sono più
     raggiungibili;
   - dopo l'introduzione si viaggia solo fra i capitoli, dal
     frame 24 al 228: lo scroll libero è spento e ogni gesto
     porta al capitolo adiacente, attraversando i suoi frame e
     posandosi sul disegno finito, con il testo della scena.
     Nel primo tratto (24-46) data e nomi si cancellano e il logo
     si ritira nell'angolo, lasciando solo la A e la L.

   Oltre allo storyboard: l'invito a scorrere che sparisce
   sull'ultimo capitolo (.nascosto) e i collegamenti del menu, che
   portano di colpo al fotogramma del capitolo scelto senza
   sfogliare quelli in mezzo.
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

/* Introduzione: durata dell'apertura automatica (frame 0 -> 23) */
const DURATA_INTRO = 2.4;

/* Precaricamento: il logo è la barra di caricamento. La percentuale
   dei frame arrivati finisce nell'offset della 2ª e 3ª tappa dei
   gradienti della A e della L (le due tappe sono sovrapposte: sopra
   il colore, sotto il trasparente, quindi lo stacco si sposta e le
   lettere si riempiono). Solo al 100% parte l'introduzione. */
const PRECARICO_PARALLELE = 6;   /* il browser ne apre comunque ~6 per host */

/* Se per tutto questo tempo non arriva NEMMENO un frame la rete è
   ferma: si prosegue con quello che c'è, altrimenti la pagina
   resterebbe per sempre su un logo mezzo vuoto */
const ATTESA_STALLO = 20000;

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

/* ---------------------------------------------------------
   PRECARICAMENTO — il logo è la barra di caricamento
--------------------------------------------------------- */

/* Le due tappe centrali dei gradienti della A e della L: sono
   sovrapposte allo stesso offset (colore fin lì, poi trasparente),
   quindi spostarle riempie le lettere. Il logo è inline-izzato da
   script.js con una fetch, perciò si cercano finché non ci sono. */
let tappe = [];

function tappeGradiente() {
    if (!tappe.length) {
        tappe = document.querySelectorAll(
            "#logo_A_gradient stop:nth-child(2), #logo_A_gradient stop:nth-child(3)," +
            "#logo_L_gradient stop:nth-child(2), #logo_L_gradient stop:nth-child(3)"
        );
    }
    return tappe;
}

let percentualeMostrata = -1;

function mostraCaricamento(fatti) {
    const percentuale = Math.round((fatti / FRAME_TOTALI) * 100);
    if (percentuale === percentualeMostrata) return;
    percentualeMostrata = percentuale;
    tappeGradiente().forEach((tappa) => tappa.setAttribute("offset", percentuale + "%"));
}

/* Scarica TUTTI i frame, pochi per volta, e fa salire il loader.
   Si risolve al 100% — oppure se la rete si ferma del tutto
   (ATTESA_STALLO), per non lasciare la pagina bloccata a metà. */
function precarica() {
    return new Promise((finito) => {
        let daChiedere = 0;
        let fatti = 0;
        let attivi = 0;
        let ultimoProgresso = performance.now();
        let concluso = false;

        const chiudi = () => {
            if (concluso) return;
            concluso = true;
            clearInterval(guardia);
            finito();
        };

        const guardia = setInterval(() => {
            if (performance.now() - ultimoProgresso > ATTESA_STALLO) chiudi();
        }, 1000);

        const avanti = () => {
            while (!concluso && attivi < PRECARICO_PARALLELE && daChiedere < FRAME_TOTALI) {
                attivi++;
                carica(daChiedere++).then(() => {
                    attivi--;
                    fatti++;
                    ultimoProgresso = performance.now();
                    mostraCaricamento(fatti);
                    /* Scaricati sì, tenuti in memoria no: i byte restano
                       nella cache del browser, mentre in RAM si conservano
                       solo i frame utili adesso (finestra + scaletta).
                       229 immagini decodificate insieme sarebbero ~2 GB. */
                    pota(0);
                    if (fatti === FRAME_TOTALI) chiudi();
                    else avanti();
                });
            }
        };

        mostraCaricamento(0);
        avanti();
    });
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
    aggiornaLogo(indice);
}

/* ---------------------------------------------------------
   IL LOGO SEGUE LA SEQUENZA
   Tutto passa dal fotogramma in corso, così il logo si comporta
   allo stesso modo sia durante l'introduzione (che scorre a tempo)
   sia sotto lo scroll (che può anche tornare indietro):

     0-23    data e nomi si scrivono, un glifo dopo l'altro
             (--scrittura da 0 a 1)
     24-46   si cancellano riavvolgendo la stessa scrittura
             (--scrittura da 1 a 0) mentre il logo si ritira
             nell'angolo e la A/L ingrandiscono (--ritiro da 0 a 1)
     47+     logo piccolo, solo A e L

   I conti su opacità, misure e scala li fa animation.css.
--------------------------------------------------------- */

/* Quanto dura la comparsa di un singolo glifo, in frazione di
   --scrittura: l'ultimo parte a 0.75 e chiude con l'ultimo frame */
const FINESTRA_GLIFO = 0.25;

let scritturaMostrata = -1;
let ritiroMostrato = -1;

/* Prepara il logo per la sequenza: il rapporto del suo viewBox e
   l'istante di partenza di ogni glifo. Il logo arriva da una fetch
   (script.js), quindi si prepara quando serve; se non ci fosse, la
   regola CSS farebbe comparire i glifi tutti insieme — mai restare
   invisibili. */
function preparaLogo() {
    const logo = document.getElementById("logo");

    /* Il viewBox NON è quadrato (2716x2000): lo stato raccolto è
       alto --dimensione-logo, quindi la sua larghezza è quell'altezza
       per il rapporto. Senza questo dato il CSS non saprebbe dove
       fermare il ritiro. */
    const riquadro = logo && logo.viewBox && logo.viewBox.baseVal;
    if (riquadro && riquadro.height) {
        logo.style.setProperty("--rapporto-logo", (riquadro.width / riquadro.height).toFixed(4));
    }

    const glifi = document.querySelectorAll("#logo #logo_data path, #logo #logo_nomi path");
    glifi.forEach((glifo, indice) => {
        glifo.style.setProperty("--s", ((indice / glifi.length) * (1 - FINESTRA_GLIFO)).toFixed(4));
    });
    return glifi.length;
}

function aggiornaLogo(frame) {
    const fineIntro = CAPITOLI[0].fine;    /* 23 */
    const fineRitiro = CAPITOLI[1].fine;   /* 46 */

    let scrittura;
    let ritiro;

    if (frame <= fineIntro) {
        scrittura = fineIntro ? frame / fineIntro : 1;
        ritiro = 0;
    } else if (frame < fineRitiro) {
        ritiro = (frame - fineIntro) / (fineRitiro - fineIntro);
        scrittura = 1 - ritiro;   /* la scrittura si riavvolge */
    } else {
        scrittura = 0;
        ritiro = 1;
    }

    /* si scrive solo quando cambia qualcosa: sono variabili che
       ridisegnano il logo, non vanno toccate a ogni tick */
    scrittura = Math.round(scrittura * 1000) / 1000;
    ritiro = Math.round(ritiro * 1000) / 1000;

    const radice = document.documentElement.style;
    if (scrittura !== scritturaMostrata) {
        scritturaMostrata = scrittura;
        radice.setProperty("--scrittura", scrittura);
    }
    if (ritiro !== ritiroMostrato) {
        ritiroMostrato = ritiro;
        radice.setProperty("--ritiro", ritiro);
    }
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

/* ---------------------------------------------------------
   INTRODUZIONE
   La pagina è ferma sulla copertina e la sequenza si apre da
   sola: è l'unico momento in cui si vedono i frame 0-22.
--------------------------------------------------------- */

/* La pagina si ferma PRIMA del precaricamento: mentre il logo si
   riempie non c'è niente da scorrere */
function fermaLaPagina() {
    document.documentElement.classList.add("introduzione");

    const scroller = document.getElementById("scroller");
    if (scroller) scroller.classList.add("nascosto");

}

function apriIntroduzione() {
    if (sequenzaAperta) return;

    preparaLogo();

    intro = gsap.to(moviola, {
        indice: CAPITOLI[0].fine,
        duration: DURATA_INTRO,
        ease: "none",
        onUpdate: () => mostra(moviola.indice),
        onComplete: apriLaSequenza
    });

    /* Adesso che i frame ci sono, chi ha fretta salta l'introduzione
       al primo gesto (e un reload non costringe a rivederla).
       Durante il caricamento non c'era nulla da saltare. */
    const salta = () => {
        if (intro) intro.progress(1);
        apriLaSequenza();
    };
    ["wheel", "touchstart", "keydown", "pointerdown"].forEach((evento) => {
        window.addEventListener(evento, salta, { once: true, passive: true });
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

    preparaScene();

    gsap.to(avanzamento, {
        quota: 1,
        ease: "none",
        onUpdate: aggiornaSequenza,
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
    aggiornaSequenza();
}

/* ---------------------------------------------------------
   ENTRATA DELLE SCENE
   Ogni scena entra in dissolvenza: trasparente mentre si viaggia,
   piena quando è al suo posto. La misura è la distanza dalla propria
   quota, in frazione di schermata, così la dissolvenza segue lo
   scroll ed è reversibile come tutto il resto — e non serve nessuna
   transizione CSS.
--------------------------------------------------------- */

/* In quanta parte di schermata la scena passa da 0 a 1: con 0.5 la
   scena che esce si spegne esattamente a metà viaggio, dove l'altra
   comincia ad accendersi (nessuna sovrapposizione) */
const RAGGIO_ENTRATA = 0.5;

/* le scene con la loro posizione fra i capitoli e l'ultimo valore
   scritto (le variabili si toccano solo quando cambiano) */
let scene = [];

function preparaScene() {
    scene = [];
    CAPITOLI.forEach((voce, indice) => {
        if (indice === 0) return;   /* la copertina non ha markup */
        const elemento = document.getElementById(voce.nome);
        if (elemento) scene.push({ elemento, indice, mostrata: -1 });
    });
}

function aggiornaScene(posizione) {
    const raggio = Math.max(1, window.innerHeight * RAGGIO_ENTRATA);

    scene.forEach((scena) => {
        const quota = misure.quote[scena.indice];
        if (quota === undefined) return;

        const presenza = Math.max(0, 1 - Math.abs(posizione - quota) / raggio);
        const valore = Math.round(presenza * 100) / 100;
        if (valore === scena.mostrata) return;

        scena.mostrata = valore;
        scena.elemento.style.setProperty("--presenza", valore);
    });
}

/* Un solo punto per tutto ciò che segue lo scroll: il fotogramma e
   l'entrata delle scene */
function aggiornaSequenza() {
    mostra(fotogrammaDa(avanzamento.quota));
    aggiornaScene(avanzamento.quota * misure.limite);
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

/* Campi del form: l'Observer principale non li tocca, altrimenti il
   preventDefault chiuderebbe la tastiera appena aperta. Perché un
   gesto che parte da un campo non scorra la pagina in modo nativo
   (finendo fuori dalla griglia dei capitoli) ci pensano due cose:
   il touch-action in animation.css e l'Observer dedicato al form
   qui sotto, che non fa preventDefault ma naviga. */
const CAMPI = "#conferma input, #conferma textarea, #conferma button";

/* Scarto oltre il quale la pagina è "fuori griglia" e va riportata
   sul capitolo (in pixel: sotto questa soglia è solo arrotondamento) */
const TOLLERANZA_GRIGLIA = 2;

/* Durata del viaggio fra due capitoli vicini. È il tempo in cui
   si leggono i frame di transizione — la parte dipinta che si
   trasforma — quindi va sentito: non è un semplice scorrimento.
   Un salto dal menu attraversa più capitoli e dura di più, ma non
   in proporzione: dalla copertina alla lista nozze non deve
   diventare un viaggio di dieci secondi. */
const DURATA_TRANSIZIONE = 2;
const DURATA_MASSIMA = 4;

let capitolo = 0;      /* capitolo su cui siamo posati */
let bloccoFino = 0;    /* i gesti sono ignorati fino a questo istante */

const menuAperto = () => document.body.classList.contains("menu");

/* Il cancello di TUTTA la navigazione: gesti, tastiera,
   riallineamento della griglia e riassestamento dopo una rotazione.
   Con il menu aperto non si muove nulla — le sue voci chiamano
   vaiAlCapitolo solo dopo aver chiuso il pannello. */
const liberi = () => performance.now() >= bloccoFino && !menuAperto();

const stoDigitando = () => {
    const elemento = document.activeElement;
    return !!(elemento && elemento.matches && elemento.matches(CAMPI));
};

/* "immediato" = salto secco, senza attraversare i frame in mezzo:
   lo usano i collegamenti del menu (e chi ha chiesto meno
   movimento). I gesti, invece, viaggiano sempre. */
function vaiAlCapitolo(indice, immediato) {
    indice = Math.max(0, Math.min(CAPITOLI.length - 1, indice));
    if (indice === capitolo) return;

    const capitoliAttraversati = Math.abs(indice - capitolo);
    const durata = (immediato || ridottoMovimento())
        ? 0
        : Math.min(DURATA_MASSIMA, DURATA_TRANSIZIONE * Math.sqrt(capitoliAttraversati));

    capitolo = indice;

    /* mai oltre lo scroll raggiungibile: la barra del browser
       che si ritira può spostare il fondo pagina */
    const quota = Math.min(misure.quote[indice], ScrollTrigger.maxScroll(window));

    /* lucchetto A SCADENZA (mai infinito: se il tween morisse
       senza callback la navigazione resterebbe bloccata) */
    bloccoFino = performance.now() + durata * 1000 + 150;
    const sblocca = () => { bloccoFino = performance.now() + 100; };

    if (!durata) {
        /* La pagina si sposta e compare DIRETTAMENTE il disegno del
           capitolo: niente sfogliata veloce dei frame intermedi.
           Il fotogramma di riposo è nella scaletta, quindi è già in
           memoria e appare nello stesso istante.
           Va interrotto un eventuale viaggio in corso, altrimenti
           riporterebbe la pagina indietro. */
        gsap.killTweensOf(window);
        window.scrollTo(0, quota);
        ScrollTrigger.update();
        mostra(CAPITOLI[indice].fine);
        sblocca();
        return;
    }

    gsap.to(window, {
        duration: durata,
        scrollTo: { y: quota, autoKill: false },
        /* andatura quasi uniforme: con un'accelerazione marcata
           (power2+) i fotogrammi centrali della transizione
           passerebbero troppo in fretta per essere letti */
        ease: "power1.inOut",
        overwrite: true,
        onComplete: sblocca,
        onInterrupt: sblocca
    });
}

/* Riporta la pagina sul capitolo quando qualcosa l'ha spostata per
   conto suo: la tastiera che si apre, il browser che porta in vista
   un campo, un gesto sfuggito al controllo. Senza questa rete la
   pagina resta fuori griglia — scena a metà e sfondo su un
   fotogramma di transizione — e non ci torna più da sola.
   Mentre si digita non interviene: sposterebbe il campo da sotto le
   dita (si riallinea appena il campo perde il fuoco). */
let attesaGriglia;
function riallinea() {
    clearTimeout(attesaGriglia);
    attesaGriglia = setTimeout(() => {
        if (!sequenzaAperta || !liberi() || stoDigitando()) return;

        const quota = Math.min(misure.quote[capitolo], ScrollTrigger.maxScroll(window));
        if (Math.abs(window.scrollY - quota) <= TOLLERANZA_GRIGLIA) return;

        gsap.to(window, {
            duration: ridottoMovimento() ? 0 : 0.4,
            scrollTo: { y: quota, autoKill: false },
            ease: "power2.out",
            overwrite: true
        });
    }, 140);
}

/* Un gesto vale un capitolo. Se si stava scrivendo, prima chiude la
   tastiera: il browser tiene la pagina spostata per mostrare il
   campo, e senza toglierle il fuoco resterebbe lì.
   L'Observer NON viene mai spento mentre un campo ha il fuoco: senza
   il suo preventDefault lo scorrimento nativo tornerebbe libero da
   tutta la pagina e la griglia dei capitoli si romperebbe. Il tocco
   sui campi resta comunque intatto grazie a "ignore" e al
   touch-action di animation.css. */
function gesto(passo) {
    if (!liberi()) return;
    if (stoDigitando()) document.activeElement.blur();
    vaiAlCapitolo(capitolo + passo);
}

function costruisciNavigazione() {

    Observer.create({
        target: window,
        type: "wheel,touch",
        wheelSpeed: -1,       /* allinea la rotella al verso dello swipe */
        tolerance: 10,
        preventDefault: true,
        allowClicks: true,
        lockAxis: true,
        ignore: CAMPI,
        onUp: () => gesto(1),
        onDown: () => gesto(-1)
    });

    /* Sul form i campi occupano quasi tutta la scena: senza questo
       secondo Observer scorrere lì non farebbe nulla. Non fa
       preventDefault (il tocco sul campo resta intatto: a fermare
       lo scorrimento nativo pensa il touch-action) e chiede una
       distanza maggiore, così trascinare il cursore dentro un campo
       non viene letto come navigazione. */
    Observer.create({
        target: document.getElementById("conferma") || window,
        type: "wheel,touch",
        wheelSpeed: -1,
        tolerance: 30,
        preventDefault: false,
        allowClicks: true,
        lockAxis: true,
        onUp: () => gesto(1),
        onDown: () => gesto(-1)
    });

    /* La tastiera si chiude e la pagina può essere rimasta spostata
       per mostrare il campo: si torna sul capitolo */
    document.addEventListener("focusout", () => riallinea());

    /* Ogni scroll che non sia un nostro viaggio finisce qui: se ha
       lasciato la pagina fuori griglia, riallinea() la riporta sul
       capitolo. Il capitolo corrente resta la verità — è la pagina
       che torna da lui, non il contrario. */
    window.addEventListener("scroll", riallinea, { passive: true });

    /* Tastiera: frecce, pagina, spazio (non mentre si compila) */
    window.addEventListener("keydown", (evento) => {
        if (evento.target instanceof Element && evento.target.matches("input, textarea")) return;
        if (["ArrowDown", "PageDown", " "].includes(evento.key)) {
            evento.preventDefault();
            gesto(1);
        } else if (["ArrowUp", "PageUp"].includes(evento.key)) {
            evento.preventDefault();
            gesto(-1);
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
   INVITO A SCORRERE E MENU
   (il logo non è qui: si ritira insieme ai frame 24-46, vedi
   aggiornaLogo)
--------------------------------------------------------- */

function costruisciInterfaccia() {

    /* La soglia qui sotto è un interruttore, non un intervallo: va
       guidata dall'ATTRAVERSAMENTO (onEnter/onLeaveBack) e non da
       isActive. ScrollTrigger è attivo per start <= scroll < end e
       limita end al fondo pagina: con isActive l'ultimo capitolo
       spegnerebbe lo stato appena raggiunto. */

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

    /* Menu: chiude il pannello e porta di colpo al capitolo, sul
       suo fotogramma (le voci sono esattamente i nomi dei capitoli,
       "Home" compresa). Chi sceglie una voce vuole ARRIVARE là: i
       frame in mezzo non li attraversa, li vedrà scorrendo. */
    document.querySelectorAll("#menu a").forEach((collegamento) => {
        collegamento.addEventListener("click", (evento) => {
            evento.preventDefault();
            document.body.classList.remove("menu");

            const nome = collegamento.getAttribute("href").slice(1);
            const indice = CAPITOLI.findIndex((voce) => voce.nome === nome);
            if (indice >= 0) vaiAlCapitolo(indice, true);
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

    /* Pagina ferma sulla copertina e lettere vuote: l'unica cosa che
       accade è il precaricamento di tutti i frame, che riempie la A e
       la L dallo 0% al 100% */
    fermaLaPagina();
    await precarica();

    /* Chi ha chiesto meno movimento non vede l'introduzione: la
       copertina è già al suo frame di riposo (e il logo con lei) */
    if (ridottoMovimento()) {
        preparaLogo();
        mostra(CAPITOLI[0].fine);
        apriLaSequenza();
        return;
    }

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
        /* quote nuove e schermata di altezza diversa: la dissolvenza
           delle scene va ricalcolata sulle misure di adesso */
        aggiornaScene(misure.quote[capitolo]);
    }, 150);
}

window.addEventListener("resize", misureCambiate);
window.addEventListener("orientationchange", misureCambiate);

/* script.js aggiunge "caricato" al body a fine caricamento:
   è il segnale d'avvio (se è già arrivato, si parte subito) */
if (document.body.classList.contains("caricato")) {
    avvia();
} else {
    /* niente a che vedere con gli Observer dei gesti: qui si guarda
       solo la classe del body */
    const sentinella = new MutationObserver(() => {
        if (document.body.classList.contains("caricato")) {
            sentinella.disconnect();
            avvia();
        }
    });
    sentinella.observe(document.body, { attributes: true, attributeFilter: ["class"] });
}
