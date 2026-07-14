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
})