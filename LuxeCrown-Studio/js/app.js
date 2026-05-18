// ===== SHARED STATE & DATA =====

const USERS_KEY = 'ue_users';
const SESSION_KEY = 'ue_session';
const BOOKINGS_KEY = 'ue_bookings';
const SERVICES_KEY = 'ue_services';
const API_BASE = 'http://localhost:5000/api';
// Default admin account
const DEFAULT_ADMIN = { id:'admin001', name:'Admin', email:'admin@luxecrown-studio.co.ke', password:'admin123!', phone:'+254700000000', role:'admin', joined:'2024-01-01' };

// Seed users if empty
function seedUsers() {
  let users = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
  if (!users.find(u => u.email === DEFAULT_ADMIN.email)) {
    users.push(DEFAULT_ADMIN);
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }
}

// default services
const DEFAULT_SERVICES = [
  { id:'s1', name:'Classic Haircut', category:'Barber', icon:'✂️', desc:'Precision cut with clippers & scissors. Any style, any length — fade, taper, skin cut, you name it.', price:300, duration:'45 min', images:[
    'images/classic cut.jpg',
    'images/Classic 2.png',
    'images/classic.png'
  ]},
  { id:'s2', name:'Beard Trim & Shape', category:'Barber', icon:'🪒', desc:'Clean beard line-up with razor finish and hot towel treatment. Sharp edges guaranteed.', price:200, duration:'30 min', images:[
    'images/beared trim.jpg',
    'images/High-Top-Beard.jpg',
    'images/Sculpted-Beard.jpg'
  ]},
  { id:'s3', name:'Hair Dye & Colour', category:'Barber', icon:'🎨', desc:'Full colour, highlights, ombre, or balayage. Premium dyes, vibrant results.', price:800, duration:'90 min', images:[
    'images/female dye.jpg',
    'images/men dye.jpg'
  ]},
  { id:'s4', name:'Kids Haircut', category:'Barber', icon:'👦', desc:'Fun, patient cuts for kids aged 2–12. We make it enjoyable every time.', price:200, duration:'30 min', images:[
    'images/Kids.jpg'
  ]},
  { id:'s5', name:'Braiding', category:'Salon', icon:'💆', desc:'Box braids, cornrows, knotless, Senegalese twists and more. Any style, done with care.', price:1200, duration:'2–4 hrs', images:[
    'images/Braiding.jpg'
  ]},
  { id:'s6', name:'Hair Wash & Blow Dry', category:'Salon', icon:'💧', desc:'Deep cleanse shampoo with conditioning treatment, scalp massage and blow dry.', price:500, duration:'45 min', images:[
    'images/20-male-afro-stretch-hairstyle.jpg'
  ]},
  { id:'s7', name:'Wig Installation', category:'Salon', icon:'👑', desc:'Full wig install — lace front, glueless, half wigs. Natural look guaranteed.', price:1000, duration:'1.5 hrs', images:[
    'images/Wig inst 1.jpeg',
    'images/Wig inst 2.jpeg',
    'images/Wig inst 3.jpeg'
  ]},
  { id:'s8', name:'Nail Services', category:'Salon', icon:'💅', desc:'Manicure, pedicure, gel nails, acrylic and nail art. Your nails, your statement.', price:600, duration:'1 hr', images:[
    'images/Nails 1.png',
    'images/Nails 2.png',
    'images/Nails 3.png'
  ]},
  { id:'s9', name:'Fade & Taper', category:'Barber', icon:'💈', desc:'Skin fade, taper, afro fade, freeform and buzz cut styles. Clean lines, sharp finish every time.', price:350, duration:'45 min', images:[
    'images/Afrofade.png',
    'images/Buzz cut.png',
    'images/37-uniform-buzz-cut-fade.jpg',
    'images/FreeForm fade.png',
    'images/Taperfade.png'
  ]},
];

function seedServices() {
  if (!localStorage.getItem(SERVICES_KEY)) {
    localStorage.setItem(SERVICES_KEY, JSON.stringify(DEFAULT_SERVICES));
  }
}

function seedBookings() {
  if (!localStorage.getItem(BOOKINGS_KEY)) {
    const sample = [
      { id:'BK001', userId:'admin001', customer:'Brian Mutua', service:'Classic Haircut', serviceId:'s1', date:'May 10, 2025', time:'9:00 AM', amount:300, phone:'0712345678', txnId:'QJK8X3M1', status:'confirmed', payStatus:'paid', created: Date.now()-86400000 },
      { id:'BK002', userId:'admin001', customer:'Amina Waweru', service:'Wig Installation', serviceId:'s7', date:'May 10, 2025', time:'11:00 AM', amount:1000, phone:'0723456789', txnId:'PLM4N2K9', status:'confirmed', payStatus:'paid', created: Date.now()-72000000 },
      { id:'BK003', userId:'admin001', customer:'James Kariuki', service:"Kids Haircut", serviceId:'s4', date:'May 11, 2025', time:'1:00 PM', amount:200, phone:'0734567890', txnId:'BHT7X9P3', status:'pending', payStatus:'pending', created: Date.now()-36000000 },
    ];
    localStorage.setItem(BOOKINGS_KEY, JSON.stringify(sample));
  }
}

// Init all seeds
seedUsers(); seedServices(); seedBookings();

// ===== AUTH HELPERS =====
function getSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
}
function setSession(user) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
}
function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}
function isLoggedIn() { return !!getSession(); }
function isAdmin() { const s = getSession(); return s && s.role === 'admin'; }
function requireLogin(redirect='login.html') {
  if (!isLoggedIn()) { window.location.href = redirect; return false; }
  return true;
}
function requireAdmin(redirect='index.html') {
  if (!isAdmin()) { window.location.href = redirect; return false; }
  return true;
}

// ===== SERVICES HELPERS =====
function getServices() {
  return JSON.parse(localStorage.getItem(SERVICES_KEY) || '[]');
}
function saveServices(svcs) {
  localStorage.setItem(SERVICES_KEY, JSON.stringify(svcs));
}

// ===== BOOKINGS HELPERS =====
function getBookings() {
  return JSON.parse(localStorage.getItem(BOOKINGS_KEY) || '[]');
}
function saveBookings(bks) {
  localStorage.setItem(BOOKINGS_KEY, JSON.stringify(bks));
}
function addBooking(bk) {
  const bks = getBookings();
  bks.push(bk);
  saveBookings(bks);
}
function isSlotBooked(date, time) {
  return getBookings().some(b => b.date === date && b.time === time && b.status !== 'cancelled');
}

// ===== USERS HELPERS =====
function getUsers() {
  return JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
}
function saveUsers(u) { localStorage.setItem(USERS_KEY, JSON.stringify(u)); }

// ===== TOAST =====
function showToast(title, msg, icon='✅') {
  let t = document.getElementById('toast');
  if (!t) return;
  document.getElementById('t-icon').textContent = icon;
  document.getElementById('t-title').textContent = title;
  document.getElementById('t-msg').textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3600);
}

// ===== CURSOR =====
function initCursor() {
  const c = document.getElementById('cursor');
  if (!c) return;
  document.addEventListener('mousemove', e => {
    c.style.left = e.clientX + 'px';
    c.style.top = e.clientY + 'px';
  });
  document.querySelectorAll('a,button,[data-hover]').forEach(el => {
    el.addEventListener('mouseenter', () => c.classList.add('big'));
    el.addEventListener('mouseleave', () => c.classList.remove('big'));
  });
}

// ===== NAV RENDER =====
function renderNav(activePage) {
  const session = getSession();
  const admin = session && session.role === 'admin';

  const navLinks = `
    <a href="index.html" class="${activePage==='home'?'active':''}">Home</a>
    <a href="services.html" class="${activePage==='services'?'active':''}">Services</a>
    <a href="booking.html" class="${activePage==='booking'?'active':''}">Book Now</a>
    <a href="contact.html" class="${activePage==='contact'?'active':''}">Contact</a>
    ${admin ? `<a href="admin.html" class="nav-admin ${activePage==='admin'?'active':''}" style="display:inline;color:var(--red)">⚙ Admin</a>` : ''}
  `;

  const navRight = session ? `
    <div class="nav-user">
      <div class="nav-avatar">${session.name.charAt(0).toUpperCase()}</div>
      <span style="font-size:13px;color:var(--gray-light)">${session.name.split(' ')[0]}</span>
    </div>
    <a href="dashboard.html"><button class="btn btn-outline-gold" style="font-size:12px;padding:8px 16px">My Bookings</button></a>
    <button class="btn btn-outline-gold" style="font-size:12px;padding:8px 16px;color:var(--red);border-color:var(--red)" onclick="logout()">Logout</button>
  ` : `
    <a href="login.html"><button class="btn btn-outline-gold" style="font-size:12px;padding:8px 16px">Login</button></a>
    <a href="login.html?mode=register"><button class="btn btn-gold">Sign Up</button></a>
  `;

  document.getElementById('nav-links').innerHTML = navLinks;
  document.getElementById('nav-right').innerHTML = navRight;
  if (admin) document.body.classList.add('is-admin');
}

function logout() {
  clearSession();
  window.location.href = 'index.html';
}

// ===== LIGHTBOX =====
function openLightbox(src) {
  let lb = document.getElementById('lightbox');
  if (!lb) return;
  lb.querySelector('img').src = src;
  lb.classList.add('open');
}
function closeLightbox() {
  document.getElementById('lightbox')?.classList.remove('open');
}

// ===== SHARED HTML CHUNKS =====
const TOAST_HTML = `
<div class="toast" id="toast">
  <div class="toast-icon" id="t-icon">✅</div>
  <div class="toast-msg">
    <strong id="t-title"></strong>
    <span id="t-msg"></span>
  </div>
</div>`;

const LIGHTBOX_HTML = `
<div class="lightbox" id="lightbox" onclick="closeLightbox()">
  <button class="lightbox-close" onclick="closeLightbox()">✕</button>
  <img src="" alt="Preview">
</div>`;

const NAV_HTML = `
<nav>
  <a href="index.html" class="nav-logo">LuxeCrown<span>Studio</span></a>
  <div class="nav-links" id="nav-links"></div>
  <div class="nav-right" id="nav-right"></div>
</nav>`;

const FOOTER_HTML = `
<footer>
  <div class="footer-grid">
    <div>
      <div class="footer-brand">LuxeCrown Studio</div>
      <div class="footer-desc">Nairobi's premium salon & barbershop. Where African urban style meets precision craftsmanship. GenZ approved.</div>
      <div class="footer-socials">
        <a class="social-btn" title="Instagram">📸</a>
        <a class="social-btn" title="TikTok">🎵</a>
        <a class="social-btn" title="WhatsApp" href="https://wa.me/254700000000" target="_blank">💬</a>
        <a class="social-btn" title="Twitter/X">🐦</a>
      </div>
    </div>
    <div>
      <div class="footer-heading">Pages</div>
      <ul class="footer-links">
        <li><a href="index.html">Home</a></li>
        <li><a href="services.html">Services</a></li>
        <li><a href="booking.html">Book Now</a></li>
        <li><a href="contact.html">Contact</a></li>
      </ul>
    </div>
    <div>
      <div class="footer-heading">Services</div>
      <ul class="footer-links">
        <li><a href="services.html">Haircuts</a></li>
        <li><a href="services.html">Beard Trim</a></li>
        <li><a href="services.html">Braiding</a></li>
        <li><a href="services.html">Nail Services</a></li>
      </ul>
    </div>
    <div>
      <div class="footer-heading">Contact</div>
      <ul class="footer-links">
        <li><a href="contact.html">Tom Mboya St, Nairobi</a></li>
        <li><a href="tel:+254700000000">+254 700 000 000</a></li>
        <li><a href="mailto:hello@LuxeCrown Studio.co.ke">hello@LuxeCrown Studio.co.ke</a></li>
        <li><a>Mon–Sat: 9AM–4PM</a></li>
      </ul>
    </div>
  </div>
  <div class="footer-bottom">
    <div class="footer-copy">© 2026 <em>LuxeCrown Studio</em> · Made with ❤️  🇰🇪</div>
  
  </div>
</footer>`;
