// Burger menu toggle functionality
document.addEventListener('DOMContentLoaded', () => {
    const menuToggle = document.querySelector('.menu-toggle');
    const navLinks = document.querySelector('.nav-links');

    menuToggle.addEventListener('click', () => {
        navLinks.classList.toggle('open');
    });

    // Optional: Close menu when a nav link is clicked (for mobile)
    const navLinksItems = navLinks.querySelectorAll('a');
    navLinksItems.forEach(link => {
        link.addEventListener('click', () => {
            navLinks.classList.remove('open');
        });
    });
});

document.addEventListener("DOMContentLoaded", function() {
    const services = document.querySelectorAll(".service-class");

    function checkScroll() {
        services.forEach(service => {
            const servicePosition = service.getBoundingClientRect().top;
            const screenPosition = window.innerHeight / 1.3;

            if (servicePosition < screenPosition) {
                service.classList.add("show");
            }
        });
    }

    window.addEventListener("scroll", checkScroll);
    checkScroll(); // Run on page load
});
