// Caricamento
window.addEventListener("load", () => {
    document.body.classList.add("caricato");
});

// Service worker
// Conserva i frame dello storyboard (solo quelli: vedi worker.js), così la
// seconda apertura non ripassa dalla rete e l'invito funziona anche
// senza campo. Si installa da sé, senza chiedere niente all'invitato.
// Registrato subito e non al "load": ha bisogno di quel mezzo secondo
// per entrare in servizio prima che animation.js cominci a chiedere i
// 229 frame, altrimenti il primo caricamento gli passa davanti.
if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./worker.js").catch(function (errore) {
        console.warn("Service worker non registrato:", errore);
    });
}

// Hamburger
document.getElementById("hamburger")?.addEventListener("click", () => {
    document.body.classList.toggle("menu");
});

// Carica SVG da remoto
document.querySelectorAll(`svg[src]`).forEach(async function (element) {

    const src = element.getAttribute('src');
    if (!src) return;

    const request = await fetch(src);
    const response = await request.text();
    const svg = new DOMParser().parseFromString(response, "image/svg+xml").documentElement;

    element.removeAttribute('src');
    for (const attr of svg.attributes) {
        if (attr.name === "class") {
            element.classList.add(...element.classList);
        } else {
            element.setAttribute(attr.name, attr.value);
        }
    }

    element.replaceChildren(...svg.childNodes);
});


// Countdown al matrimonio (11/09/2026)
(function () {
    const oggi = new Date();
    const countdown = document.querySelector("#countdown strong");
    const dataMatrimonio = new Date(2026, 8, 11, 15, 30, 0, 0);
    const differenza = dataMatrimonio - oggi;
    const giorni = Math.floor(differenza / (1000 * 60 * 60 * 24));
    const ore = Math.floor((differenza / (1000 * 60 * 60)) % 24);
    const minuti = Math.floor((differenza / (1000 * 60)) % 60);
    const secondi = Math.floor((differenza / 1000) % 60);

    if(giorni > 1) {
        countdown.textContent = `${giorni} giorni`;
    } else if(ore > 1) {
        countdown.textContent = `${ore} ore`;
    } else if(minuti > 1) {
        countdown.textContent = `${minuti} minuti`;
    } else if(secondi > 1) {
        countdown.textContent = `${secondi} secondi`;
    } else {
        countdown.parentNode.remove();
    }
})();

// Copia
document.querySelectorAll("[data-copia]").forEach(element => {
    element.addEventListener("click", async (event) => {
        try {
            const testo = element.textContent;
            await navigator.clipboard.writeText(testo);
        } catch (err) {
            console.error("Errore durante la copia:", err);
        }
    });
});

// Invia form
document.getElementById("conferma")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    const bottone = form.querySelector("button");
    const testoBottone = bottone.textContent;
    try {
        bottone.disabled = true;
        bottone.textContent = "Invio...";
        const formData = new FormData(form);
        const body = new URLSearchParams(formData);
        const risposta = await fetch("https://script.google.com/macros/s/AKfycbzo6iAXBmBKz6Ob4Pf13EP48MKaoINBwX73b29b8nljJInGsg5RUV1umRjVa65x5hIF/exec", { method: "POST", body });
        const esito = await risposta.json();
        if (!esito.ok) throw new Error(esito.errore || "risposta non valida");
        form.classList.add("confermato");
        bottone.textContent = "Ricevuto, grazie! ✓";
        form.reset();

        form.querySelectorAll(`input, textarea`).forEach(function(input){
            input.addEventListener('input', function(event){
                form.classList.remove("confermato");
                bottone.textContent = testoBottone;
            }, { once: true });
        });
    } catch (err) {
        console.error("Errore invio:", err);
        bottone.textContent = "Errore, riprova";
    } finally {
        bottone.disabled = false;
    }
});

// Cambia indirizzo navigatore
if (/iPhone|iPad|iPod/.test(navigator.userAgent) || window.CSS?.supports("-webkit-touch-callout", "none")) {
    document.querySelectorAll(`a[data-ios]`).forEach(function(a){
        a.href = a.getAttribute("data-ios");
    });
}