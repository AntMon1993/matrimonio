// Caricamento
window.addEventListener("load", () => {
    document.body.classList.add("caricato");
});

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
    const countdown = document.getElementById("countdown");
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


/*
// Collegamenti (lo scroll animato alla scena è gestito da animation.js)
document.querySelectorAll("#menu a").forEach(a => {
    a.addEventListener("click", (event) => {
        event.preventDefault();
        document.body.classList.remove("menu");
    });
});

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
document.getElementById("form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    const bottone = form.querySelector("button");
    try {
        bottone.disabled = true;
        bottone.textContent = "Invio...";
        const formData = new FormData(form);
        const body = new URLSearchParams(formData);
        const risposta = await fetch("https://script.google.com/macros/s/AKfycbzo6iAXBmBKz6Ob4Pf13EP48MKaoINBwX73b29b8nljJInGsg5RUV1umRjVa65x5hIF/exec", { method: "POST", body });
        const esito = await risposta.json();
        if (!esito.ok) throw new Error(esito.errore || "risposta non valida");
        bottone.textContent = "Ricevuto, grazie! ✓";
        form.reset();
    } catch (err) {
        console.error("Errore invio:", err);
        bottone.textContent = "Errore, riprova";
    } finally {
        bottone.disabled = false;
    }
});

// Caricamento degli elementi della pagina
window.addEventListener("load", async function () {

    // Inizializza elementi
    const firma = document.querySelector(`#logo path.firma`);
    const immagini = document.querySelectorAll(`img[data-src]`);
    let daCaricare = immagini.length;

    // Carica immagini
    immagini.forEach(async function (img) {
        img.src = img.dataset.src;
        // decode() può restare appeso finché la pagina non è visibile
        // (es. tab in background): il loader non deve mai bloccarsi
        await Promise.race([
            img.decode(),
            new Promise(resolve => setTimeout(resolve, 4000))
        ]).catch(() => { });
        loader();
    });

    // Loader
    function loader() {
        daCaricare--;
        const percentuale = daCaricare / immagini.length;
        // firma.style.clipPath = `inset(0 ${percentuale * 100}% 0 0)`;
        // if (daCaricare == 0) {
            document.body.classList.add("caricato");
        // }
    }
});

*/