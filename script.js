// Initialize website functionality
function init() {
    console.log("Website loaded successfully!");
    
    // Explore Now button
    const exploreButton = document.querySelector('#home button');
    if (exploreButton) {
        exploreButton.addEventListener('click', () => {
            console.log("Explore Now clicked");
            // Future enhancement: Add navigation or modal
        });
    }
    
    // Book Now buttons
    const bookButtons = document.querySelectorAll('.service-box button');
    bookButtons.forEach(button => {
        button.addEventListener('click', () => {
            const service = button.parentElement.querySelector('h3').textContent;
            console.log(`Book Now clicked for ${service}`);
            // Future enhancement: Add booking form or link
        });
    });
}

// Run on page load
window.onload = init;