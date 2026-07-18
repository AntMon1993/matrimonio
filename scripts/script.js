// Hamburger
document.getElementById("hamburger").addEventListener("click", () => {
    document.body.classList.toggle("nav");
});

// Collegamenti (lo scroll animato alla scena è gestito da animation.js)
document.querySelectorAll("nav a").forEach(a => {
    a.addEventListener("click", (event) => {
        event.preventDefault();
        document.body.classList.remove("nav");
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
document.getElementById("form").addEventListener("submit", async (event) => {
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
    const tratti = document.querySelectorAll(`img[data-src*=".svg"]`);
    const disegni = document.querySelectorAll(`img[data-src*=".png"]`);
    let daCaricare = tratti.length + disegni.length;

    // Carica tratti
    tratti.forEach(async function (img) {
        try {
            const risposta = await fetch(img.dataset.src);
            const testo = await risposta.text();
            const svg = new DOMParser().parseFromString(testo, "image/svg+xml").querySelector("svg");
            img.replaceWith(svg);
        } catch (err) {
            // ripiego: resta un'immagine normale (senza il loader non si sbloccherebbe mai)
            console.error("Iniezione svg fallita:", img.dataset.src, err);
            img.src = img.dataset.src;
        }
        loader();
    });

    // Carica disegni
    disegni.forEach(async function (img) {
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
        const percentuale = daCaricare / (tratti.length + disegni.length);
        firma.style.clipPath = `inset(0 ${percentuale * 100}% 0 0)`;
        if (daCaricare == 0) {
            document.body.classList.remove("caricare");
        }
    }
});



// Countdown al matrimonio (11/09/2026)
(function () {
    const dataMatrimonio = new Date(2026, 8, 11, 0, 0, 0, 0);
    const oggi = new Date();
    oggi.setHours(0, 0, 0, 0);
    const giorniMancanti = Math.round((dataMatrimonio - oggi) / (1000 * 60 * 60 * 24));
    document.querySelector("[data-countdown]").textContent = giorniMancanti === 1 ? "un giorno"
            : giorniMancanti < 1 ? "poche ore"
                : giorniMancanti + " giorni";
})();