// Hamburger
document.getElementById("hamburger").addEventListener("click", () => {
    document.body.classList.toggle("nav");
});

// Collegamenti
document.querySelectorAll("nav a").forEach(a => {
    a.addEventListener("click", (event) => {
        event.preventDefault();
        window.location.hash = a.getAttribute("href");
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