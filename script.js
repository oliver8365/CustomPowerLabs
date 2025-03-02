// script.js (optimized)
function toggleMenu() {
    const nav = document.querySelector('.nav-links');
    nav.classList.toggle('open');
}

// Close menu on click outside
document.addEventListener('click', (e) => {
    const nav = document.querySelector('.nav-links');
    if (!nav.contains(e.target) && !e.target.matches('.menu-toggle')) {
        nav.classList.remove('open');
    }
});

// Smooth scroll for navigation
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
        e.preventDefault();
        const target = document.querySelector(anchor.getAttribute('href'));
        target.scrollIntoView({ behavior: 'smooth' });
    });
});

// Initialize
window.addEventListener('DOMContentLoaded', () => {
    console.log('Site loaded');
    // Add any additional initialization code
});