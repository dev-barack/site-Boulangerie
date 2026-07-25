document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');

  if (loginForm) {
    loginForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;

      if (email === 'admin@boulangerie.com' && password === 'Admin2026!') {
        window.location.href = 'dashboard.html';
      } else {
        const button = loginForm.querySelector('button');
        button.textContent = 'Identifiants invalides';
        button.style.background = 'linear-gradient(90deg, #d67a2d, #c99430)';
        setTimeout(() => {
          button.textContent = 'Connexion';
          button.style.background = 'linear-gradient(90deg, #c99430, #f6d98d)';
        }, 1800);
      }
    });
  }

  const dateNode = document.getElementById('currentDate');
  if (dateNode) {
    const updateClock = () => {
      const now = new Date();
      dateNode.textContent = now.toLocaleString('fr-FR', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    };
    updateClock();
    setInterval(updateClock, 1000);
  }

  document.querySelectorAll('[data-counter]').forEach((element) => {
    const target = Number(element.dataset.counter);
    const duration = 1200;
    const startTime = performance.now();

    const tick = (time) => {
      const progress = Math.min((time - startTime) / duration, 1);
      const value = Math.floor(progress * target);
      element.textContent = `${value.toLocaleString('fr-FR')}`;
      if (progress < 1) requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  });

  document.querySelectorAll('.bar-fill').forEach((bar, index) => {
    const height = bar.style.height;
    bar.animate(
      [
        { height: '18px', opacity: 0.3 },
        { height, opacity: 1 }
      ],
      {
        duration: 700 + index * 120,
        fill: 'forwards'
      }
    );
  });

  const menuToggle = document.querySelector('.menu-toggle');
  const navLinks = document.querySelector('.top-nav__links');

  if (menuToggle && navLinks) {
    const closeMenu = () => {
      navLinks.classList.remove('open');
      menuToggle.classList.remove('active');
      menuToggle.setAttribute('aria-expanded', 'false');
    };

    menuToggle.addEventListener('click', (event) => {
      event.stopPropagation();
      const isOpen = navLinks.classList.toggle('open');
      menuToggle.classList.toggle('active', isOpen);
      menuToggle.setAttribute('aria-expanded', String(isOpen));
    });

    navLinks.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', closeMenu);
    });

    document.addEventListener('click', (event) => {
      if (!navLinks.contains(event.target) && !menuToggle.contains(event.target)) {
        closeMenu();
      }
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > 768) {
        closeMenu();
      }
    });
  }
});
