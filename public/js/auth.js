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
    if (res.user.role === 'admin') {
      window.location.href = 'admin.html';
    } else {
      window.location.href = 'index.html';
    }
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
    window.location.href = 'index.html';
  } catch (err) {
    showAuthError(err.message);
    btn.disabled = false;
    btn.innerHTML = originalLabel;
  }
}

// 1-Click Demo Logins
function fillDemoUser() {
  document.getElementById('loginEmail').value = 'rahul@xenproperty.com';
  document.getElementById('loginPassword').value = 'user123';
  showToast('Filled User credentials (rahul@xenproperty.com)', 'success');
}

function fillDemoAdmin() {
  document.getElementById('loginEmail').value = 'admin@xenproperty.com';
  document.getElementById('loginPassword').value = 'admin123';
  showToast('Filled Admin credentials (admin@xenproperty.com)', 'success');
}
