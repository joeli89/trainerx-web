// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    // Mobile menu toggle
    const menuToggle = document.querySelector('.menu-toggle');
    const navLinks = document.querySelector('.nav-links');

    if (menuToggle && navLinks) {
        menuToggle.addEventListener('click', function() {
            navLinks.classList.toggle('active');
        });
    }

    // Smooth scroll for navigation links
    const navLinksArray = document.querySelectorAll('.nav-links a');
    navLinksArray.forEach(link => {
        link.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            
            // Only prevent default for anchor links
            if (href.startsWith('#')) {
                e.preventDefault();
                const targetId = href.substring(1);
                const targetElement = document.getElementById(targetId);
                
                if (targetElement) {
                    targetElement.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                    
                    // Close mobile menu if open
                    if (navLinks.classList.contains('active')) {
                        navLinks.classList.remove('active');
                    }
                }
            }
        });
    });

    // Get Started button functionality
    const getStartedBtn = document.getElementById('getStartedBtn');
    if (getStartedBtn) {
        getStartedBtn.addEventListener('click', function() {
            // Scroll to contact section or features section
            const contactSection = document.getElementById('contact');
            if (contactSection) {
                contactSection.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    }

    // Contact form handling
    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
        contactForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            // Get form values
            const name = document.getElementById('name').value;
            const email = document.getElementById('email').value;
            const message = document.getElementById('message').value;
            
            // Basic validation
            if (!name || !email || !message) {
                alert('Please fill in all fields.');
                return;
            }
            
            // Email validation
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                alert('Please enter a valid email address.');
                return;
            }
            
            // Here you would typically send the data to a server
            // For now, we'll just show an alert
            console.log('Form submitted:', { name, email, message });
            alert('Thank you for your message! We will get back to you soon.');
            
            // Reset form
            contactForm.reset();
        });
    }

    // Active navigation link highlighting on scroll
    const sections = document.querySelectorAll('section[id]');
    
    function highlightNavLink() {
        const scrollY = window.pageYOffset;
        
        sections.forEach(section => {
            const sectionHeight = section.offsetHeight;
            const sectionTop = section.offsetTop - 100;
            const sectionId = section.getAttribute('id');
            
            if (scrollY > sectionTop && scrollY <= sectionTop + sectionHeight) {
                navLinksArray.forEach(link => {
                    link.classList.remove('active-link');
                    if (link.getAttribute('href') === `#${sectionId}`) {
                        link.classList.add('active-link');
                    }
                });
            }
        });
    }

    // Add scroll event listener
    window.addEventListener('scroll', highlightNavLink);

    // Add active-link style via inline styles or extend CSS
    const style = document.createElement('style');
    style.textContent = `
        .nav-links a.active-link {
            color: var(--primary-color);
            font-weight: 600;
        }
    `;
    document.head.appendChild(style);

    // Add fade-in animation to welcome card container
    const welcomeCardContainer = document.querySelector('.welcome-card-container');
    if (welcomeCardContainer) {
        welcomeCardContainer.classList.add('fade-in');
    }
    
    // Initialize animated tagline
    const taglineContainer = document.querySelector('.animated-tagline-container');
    if (taglineContainer) {
        new AnimatedTagline(taglineContainer);
    }
});

// Utility function to handle page visibility
document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
        console.log('Page is now hidden');
    } else {
        console.log('Page is now visible');
    }
});

// Handle window resize
window.addEventListener('resize', function() {
    // Close mobile menu on resize if window is large enough
    if (window.innerWidth > 768) {
        const navLinks = document.querySelector('.nav-links');
        if (navLinks && navLinks.classList.contains('active')) {
            navLinks.classList.remove('active');
        }
    }
});

// Animated Tagline Component
class AnimatedTagline {
    constructor(container) {
        this.container = container;
        this.textElement = container.querySelector('.animated-tagline-text');
        this.cursorElement = container.querySelector('.animated-tagline-cursor');
        this.maskElement = container.querySelector('.animated-tagline-mask');
        
        this.taglines = [
            "Your AI personal trainer",
            "Learns how you train",
            "Coaches you in real time",
            "Plans that evolve",
            "Accountability, automated",
        ];
        
        this.currentIndex = 0;
        this.containerWidth = 0;
        this.centerX = 0;
        this.currentX = 0;
        this.labelWidth = 0;
        this.isAnimating = false;
        this.isAtStart = true;
        this.layoutReady = false;
        
        this.init();
    }
    
    init() {
        // Wait for layout
        setTimeout(() => {
            this.updateLayout();
            this.layoutReady = true;
            this.updateText();
            
            // Wait for text to be measured, then reset to center and start
            setTimeout(() => {
                this.resetToCenter();
                setTimeout(() => {
                    this.startAnimation();
                }, 200);
            }, 150);
        }, 100);
        
        // Handle resize
        window.addEventListener('resize', () => {
            this.updateLayout();
            if (this.isAtStart && !this.isAnimating) {
                this.resetToCenter();
            }
        });
    }
    
    updateLayout() {
        const rect = this.container.getBoundingClientRect();
        this.containerWidth = rect.width;
        this.centerX = this.containerWidth / 2; // Center of container
        // Initialize currentX at center (absolute position from left)
        if (this.currentX === 0) {
            this.currentX = this.centerX;
        }
        this.updateCursorPosition();
        this.updateMaskWidth();
    }
    
    updateText() {
        this.textElement.textContent = this.taglines[this.currentIndex];
        // Measure text width after it renders
        requestAnimationFrame(() => {
            // Force a reflow to ensure text is rendered
            void this.textElement.offsetWidth;
            this.labelWidth = this.textElement.offsetWidth + 4;
        });
    }
    
    resetToCenter() {
        if (!this.layoutReady || this.labelWidth === 0) return;
        
        this.currentX = this.centerX;
        this.isAtStart = true;
        this.isAnimating = false;
        this.updateCursorPosition();
        this.updateMaskWidth();
        this.updateTextPosition();
    }
    
    updateCursorPosition() {
        // currentX is absolute position from left edge of container
        // Cursor CSS starts at left: 50%, so we offset by the difference
        const offset = this.currentX - this.centerX;
        this.cursorElement.style.transform = `translateX(calc(-50% + ${offset}px))`;
    }
    
    updateMaskWidth() {
        // Mask extends from left: 0 to cover everything left of the cursor
        // Cursor center is at currentX (absolute position from left)
        // Match React Native: width = currentX + 1 for slight overlap
        this.maskElement.style.width = `${Math.max(0, this.currentX + 1)}px`;
        this.maskElement.style.transform = `translateX(0)`;
    }
    
    updateTextPosition() {
        if (this.isAtStart) {
            // Text starts at center + 4px offset
            this.textElement.style.transform = `translateX(calc(-50% + 4px))`;
        } else {
            // Interpolate text position based on cursor position
            // Maps currentX from [centerX, centerX + labelWidth/2] 
            // to translateX from [centerX + 4, centerX - labelWidth/2]
            const fromStart = this.centerX;
            const fromEnd = this.centerX + this.labelWidth / 2;
            const toStart = this.centerX + 4;
            const toEnd = this.centerX - this.labelWidth / 2;
            
            const progress = (this.currentX - fromStart) / (fromEnd - fromStart);
            const interpolatedX = toStart + (toEnd - toStart) * progress;
            const offset = interpolatedX - this.centerX;
            
            this.textElement.style.transform = `translateX(calc(-50% + ${offset}px))`;
        }
    }
    
    animateToRight() {
        if (!this.layoutReady || this.labelWidth === 0 || this.isAnimating) return;
        
        this.isAnimating = true;
        
        // Wait 2 seconds before starting
        setTimeout(() => {
            const targetX = this.centerX + this.labelWidth / 2;
            const duration = 1200; // 1.2 seconds
            const startX = this.currentX;
            const distance = targetX - startX;
            const startTime = performance.now();
            
            const animate = (currentTime) => {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);
                
                // Easing function (ease-in-out)
                const eased = progress < 0.5
                    ? 2 * progress * progress
                    : 1 - Math.pow(-2 * progress + 2, 2) / 2;
                
                this.currentX = startX + distance * eased;
                this.updateCursorPosition();
                this.updateMaskWidth();
                this.updateTextPosition();
                
                if (progress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    this.isAtStart = false;
                    this.canGoToNext();
                }
            };
            
            requestAnimationFrame(animate);
        }, 2000); // Initial delay of 2 seconds
    }
    
    animateToCenter() {
        if (!this.layoutReady || this.isAnimating) return;
        
        this.isAnimating = true;
        
        // Wait 2.5 seconds before returning
        setTimeout(() => {
            const targetX = this.centerX;
            const startX = this.currentX;
            const distance = targetX - startX;
            const startTime = performance.now();
            const duration = 1200; // 1.2 seconds
            
            const animate = (currentTime) => {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);
                
                // Easing function (ease-in-out)
                const eased = progress < 0.5
                    ? 2 * progress * progress
                    : 1 - Math.pow(-2 * progress + 2, 2) / 2;
                
                this.currentX = startX + distance * eased;
                this.updateCursorPosition();
                this.updateMaskWidth();
                this.updateTextPosition();
                
                if (progress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    // Move to next tagline
                    this.currentIndex = (this.currentIndex + 1) % this.taglines.length;
                    this.updateText();
                    
                    // Reset to center and start next cycle
                    setTimeout(() => {
                        this.resetToCenter();
                        setTimeout(() => {
                            this.startAnimation();
                        }, 100);
                    }, 50);
                }
            };
            
            requestAnimationFrame(animate);
        }, 2500); // Delay before returning
    }
    
    canGoToNext() {
        this.isAnimating = false;
        this.animateToCenter();
    }
    
    startAnimation() {
        if (!this.layoutReady || this.labelWidth === 0) {
            // Retry after text is measured
            setTimeout(() => this.startAnimation(), 100);
            return;
        }
        
        this.animateToRight();
    }
}

