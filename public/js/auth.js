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

  // Manager login has no signup tabs; it can still use demoSignIn safely.
  if (!loginTabBtn || !signupTabBtn || !loginSection || !signupSection) return;

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

function selectAccountType(type) {
  const value = type === 'seller' ? 'seller' : 'buyer';
  const input = document.getElementById('accountType');
  const buyer = document.getElementById('buyerTypeBtn');
  const seller = document.getElementById('sellerTypeBtn');
  if (input) input.value = value;
  localStorage.setItem('xen_selected_account_type', value);
  if (buyer && seller) {
    buyer.style.background = value === 'buyer' ? '#075743' : 'transparent';
    buyer.style.color = value === 'buyer' ? '#fff' : '#36564d';
    seller.style.background = value === 'seller' ? '#075743' : 'transparent';
    seller.style.color = value === 'seller' ? '#fff' : '#36564d';
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
  const requested = new URLSearchParams(window.location.search).get('redirect');
  if (requested && /^[A-Za-z0-9_-]+\.html$/.test(requested)) return requested;

  if (/\/manager-login(?:\.html)?$/.test(window.location.pathname)) return 'manager.html';

  if (user && user.role === 'admin') return 'admin.html';

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
    let res;
    if (window.firebase?.auth) {
      const credential = await firebase.auth().signInWithEmailAndPassword(email, password);
      const user = credential.user;
      const token = await user.getIdToken();
      api.setToken(token);
      const selectedRole = document.getElementById('accountType')?.value || localStorage.getItem('xen_selected_account_type') || 'buyer';
      const account = { id: user.uid, full_name: user.displayName || email.split('@')[0], email: user.email, role: selectedRole };
      if (window.firestoreDirect) {
        try { await firestoreDirect.update('users', user.uid, { role: selectedRole }); }
        catch (_) { try { await firestoreDirect.create('users', account); } catch (__) { /* profile will retry */ } }
      }
      res = { user: account };
      api.setCurrentUser(res.user);
    } else res = await api.login(email, password);
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

  const full_name = nameInput.value.trim();
  const email = emailInput.value.trim();
  const phone = phoneInput.value.trim();
  const password = passwordInput.value;
  const role = (document.getElementById('accountType')?.value || localStorage.getItem('xen_selected_account_type')) === 'seller' ? 'seller' : 'buyer';

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
    if (window.firebase?.auth) {
      const credential = await firebase.auth().createUserWithEmailAndPassword(email, password);
      const user = credential.user;
      await user.updateProfile({ displayName: full_name });
      const token = await user.getIdToken();
      api.setToken(token);
      const saved = { id: user.uid, full_name, email: user.email, phone, role };
      api.setCurrentUser(saved);
      if (window.firestoreDirect) await firestoreDirect.create('users', saved);
    } else await api.register({ full_name, email, password, phone, role });
    showToast('Account created successfully! Redirecting...', 'success');
    window.location.href = destinationAfterAuth(api.getCurrentUser());
  } catch (err) {
    showAuthError(err.message);
    btn.disabled = false;
    btn.innerHTML = originalLabel;
  }
}
