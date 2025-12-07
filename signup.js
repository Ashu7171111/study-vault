console.log("signup.js loaded");

/* -------------------- Supabase Init Check -------------------- */
const supa = window.supabase;
if (!supa) {
  alert("Supabase not initialized. Fix login.html script tag.");
  throw new Error("Supabase missing");
}

/* -------------------- DOM Elements -------------------- */
const loginTab = document.getElementById("loginTab");
const signupTab = document.getElementById("signupTab");

const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");

const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const loginBtn = document.getElementById("loginBtn");

const signupEmail = document.getElementById("signupEmail");
const signupPassword = document.getElementById("signupPassword");
const signupPasswordConfirm = document.getElementById("signupPasswordConfirm");
const signupBtn = document.getElementById("signupBtn");

const forgotPasswordBtn = document.getElementById("forgotPasswordBtn");
const backToLoginBtn = document.getElementById("backToLoginBtn");

const errorBox = document.getElementById("errorBox");
const successBox = document.getElementById("successBox");

/* -------------------- Helpers -------------------- */
function showError(msg) {
  errorBox.style.display = "block";
  errorBox.textContent = msg;

  successBox.style.display = "none";
}

function showSuccess(msg) {
  successBox.style.display = "block";
  successBox.textContent = msg;

  errorBox.style.display = "none";
}

function clearMessages() {
  errorBox.style.display = "none";
  successBox.style.display = "none";
}

function setLoading(btn, loading, text) {
  if (loading) {
    btn.disabled = true;
    btn.innerHTML = `<div class="spinner"></div>`;
  } else {
    btn.disabled = false;
    btn.innerHTML = text;
  }
}

function isValidEmail(email) {
  return email.includes("@") && email.includes(".");
}

/* -------------------- Tabs -------------------- */
function showLogin() {
  clearMessages();
  loginForm.classList.remove("hidden");
  signupForm.classList.add("hidden");

  loginTab.classList.add("active");
  signupTab.classList.remove("active");
}

function showSignup() {
  clearMessages();
  signupForm.classList.remove("hidden");
  loginForm.classList.add("hidden");

  signupTab.classList.add("active");
  loginTab.classList.remove("active");
}

loginTab.onclick = showLogin;
signupTab.onclick = showSignup;
backToLoginBtn.onclick = showLogin;

/* -------------------- Already Logged In -------------------- */
(async () => {
  try {
    const { data } = await supa.auth.getSession();
    if (data.session) {
      window.location.href = "index.html";
    }
  } catch {
    console.warn("Session check failed.");
  }
})();

/* -------------------- Login -------------------- */
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearMessages();

  const email = loginEmail.value.trim();
  const password = loginPassword.value;

  if (!isValidEmail(email)) return showError("Enter a valid email.");
  if (!password || password.length < 6) return showError("Password too short.");

  setLoading(
    loginBtn,
    true,
    `<span class="material-icons">login</span>Login`
  );

  const { data, error } = await supa.auth.signInWithPassword({ email, password });

  if (error) {
    showError("Invalid email or password.");
    return setLoading(loginBtn, false, `<span class="material-icons">login</span>Login`);
  }

  localStorage.setItem("sb-token", data.session.access_token);

  showSuccess("Login successful... redirecting");
  setTimeout(() => (window.location.href = "index.html"), 600);
});

/* -------------------- Signup -------------------- */
signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearMessages();

  const email = signupEmail.value.trim();
  const password = signupPassword.value;
  const confirm = signupPasswordConfirm.value;

  if (!isValidEmail(email)) return showError("Enter a valid email.");
  if (password.length < 6) return showError("Password too short.");
  if (password !== confirm) return showError("Passwords must match.");

  setLoading(
    signupBtn,
    true,
    `<span class="material-icons">person_add</span>Create account`
  );

  const { data: signupData, error: signupErr } = await supa.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: window.location.origin + "/login.html" }
  });

  if (signupErr) {
    showError(signupErr.message);
    return setLoading(
      signupBtn,
      false,
      `<span class="material-icons">person_add</span>Create account`
    );
  }

  showSuccess("Account created! Logging you in…");

  const { data: loginData } = await supa.auth.signInWithPassword({ email, password });

  if (loginData?.session) {
    localStorage.setItem("sb-token", loginData.session.access_token);
    setTimeout(() => (window.location.href = "index.html"), 800);
  }
});

/* -------------------- Forgot Password -------------------- */
forgotPasswordBtn.onclick = async () => {
  clearMessages();

  const email = loginEmail.value.trim();
  if (!isValidEmail(email)) return showError("Enter email above first.");

  setLoading(forgotPasswordBtn, true, "Reset...");

  const { error } = await supa.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + "/login.html"
  });

  if (error) showError(error.message);
  else showSuccess("Reset email sent.");

  setLoading(forgotPasswordBtn, false, "Reset via email");
};