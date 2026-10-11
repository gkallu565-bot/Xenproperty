// Authentication Controller
document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('tab') === 'signup') {
    switchAuthTab('signup');
  }

  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
  }

  const registerForm = document.getElementById('registerForm');
  if (registerForm) {
    registerForm.addEventListener('submit', handleRegister);
  }
});

function switchAuthTab(tab) {
  const loginTabBtn = document.getElementById('tabLoginBtn');
  const signupTabBtn = document.getElementById('tabSignupBtn');
  const loginSection = document.getElementById('loginSection');
  const signupSection = document.getElementById('signupSection');

  if (tab === 'login') {
    loginTabBtn.classList.add('active');
    signupTabBtn.classList.remove('active');
    loginSection.style.display = 'block';
    signupSection.style.display = 'none';
  } else {
    loginTabBtn.classList.remove('active');
    signupTabBtn.classList.add('active');
    loginSection.style.display = 'none';
    signupSection.style.display = 'block';
  }
}

/**
 * Where to send someone once they are signed in.
 *
 * Admins go straight to the admin console, where their work is. Everyone else
 * lands on their profile, which is the page holding their saved properties,
 * listings and visits. A ?redirect= target is honoured so a guarded page (for
 * example sell.html) can bounce the visitor here and bring them straight back,
 * but only for a bare local filename - accepting an absolute URL would turn the
 * login form into an open redirect.
 */
function destinationAfterAuth(user, fallback = 'profile.html') {
  if (user && user.role === 'admin') return 'admin.html';

  const requested = new URLSearchParams(window.location.search).get('redirect');
  if (requested && /^[A-Za-z0-9_-]+\.html$/.test(requested)) return requested;

  return fallback;
}

async function handleLogin(e) {
  e.preventDefault();

  const emailInput = document.getElementById('loginEmail');
  const passwordInput = document.getElementById('loginPassword');
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    showAuthError('Please enter both your email address and password.');
    return;
  }

  const btn = document.getElementById('loginSubmitBtn');
  const originalLabel = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Authenticating...';

  try {
    const res = await api.login(email, password);
    showToast(`Welcome back, ${res.user.full_name}!`, 'success');
    window.location.href = destinationAfterAuth(res.user);
  } catch (err) {
    showAuthError(err.message);
    btn.disabled = false;
    btn.innerHTML = originalLabel;
    passwordInput.value = '';
    passwordInput.focus();
  }
}

async function handleRegister(e) {
  e.preventDefault();

  const nameInput = document.getElementById('regName');
  const emailInput = document.getElementById('regEmail');
  const phoneInput = document.getElementById('regPhone');
  const passwordInput = document.getElementById('regPassword');
  const roleSelect = document.getElementById('regRole');

  const full_name = nameInput.value.trim();
  const email = emailInput.value.trim();
  const phone = phoneInput.value.trim();
  const password = passwordInput.value;
  const role = roleSelect ? roleSelect.value : 'user';

  // Validate before hitting the network so problems are obvious.
  if (!full_name || !email || !phone || !password) {
    showAuthError('Please fill in every field to create your account.');
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    showAuthError('Please enter a valid email address.');
    emailInput.focus();
    return;
  }
  if (password.length < 6) {
    showAuthError('Your password must be at least 6 characters long.');
    passwordInput.focus();
    return;
  }

  const btn = document.getElementById('registerSubmitBtn');
  const originalLabel = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating Account...';

  try {
    await api.register({ full_name, email, password, phone, role });
    showToast('Account created successfully! Redirecting...', 'success');
    window.location.href = destinationAfterAuth(api.getCurrentUser());
  } catch (err) {
    showAuthError(err.message);
    btn.disabled = false;
    btn.innerHTML = originalLabel;
  }
}

/**
 * One-click demo sign-in.
 *
 * These buttons used to do nothing but fill the sign-in form. That was not
 * merely unhelpful, it was invisible: the form they filled lives on the "Sign
 * In" tab, so anyone looking at the "Create Account" tab - which is the tab
 * they had clicked from - saw no change at all, and no login happened.
 *
 * They now switch to the sign-in tab, show what they are doing, sign in for
 * real, and return to the home page.
 */
async function demoSignIn(email, password, label) {
  const emailInput = document.getElementById('loginEmail');
  const passwordInput = document.getElementById('loginPassword');
  const btn = document.getElementById('loginSubmitBtn');
  if (!emailInput || !passwordInput || !btn) return;

  switchAuthTab('login');
  emailInput.value = email;
  passwordInput.value = password;

  const originalLabel = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Signing in as ${escapeHtml(label)}...`;

  try {
    const res = await api.login(email, password);
    showToast(`Signed in as ${res.user.full_name}`, 'success');
    window.location.href = 'index.html';
  } catch (err) {
    showAuthError(err.message);
    btn.disabled = false;
    btn.innerHTML = originalLabel;
    passwordInput.value = '';
    passwordInput.focus();
  }
}

function demoLoginAsUser() {
  demoSignIn('rahul@xenproperty.com', 'user123', 'Demo User');
}

function demoLoginAsAdmin() {
  demoSignIn('admin@xenproperty.com', 'admin123', 'Demo Admin');
}
