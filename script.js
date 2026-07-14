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

