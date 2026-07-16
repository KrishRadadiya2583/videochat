(function () {
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");

  function showError(el, msg) {
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
  }

  async function post(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  }

  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = document.getElementById("loginError");
      err.hidden = true;
      const fd = new FormData(loginForm);
      try {
        const { token, user } = await post("/api/auth/login", {
          identifier: fd.get("identifier"),
          password: fd.get("password"),
        });
        localStorage.setItem("connect.token", token);
        localStorage.setItem("connect.user", JSON.stringify(user));
        window.location.href = "/app";
      } catch (e) {
        showError(err, e.message);
      }
    });
  }

  if (registerForm) {
    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = document.getElementById("registerError");
      err.hidden = true;
      const fd = new FormData(registerForm);
      try {
        const { token, user } = await post("/api/auth/register", {
          username: fd.get("username"),
          email: fd.get("email"),
          password: fd.get("password"),
          displayName: fd.get("displayName"),
        });
        localStorage.setItem("connect.token", token);
        localStorage.setItem("connect.user", JSON.stringify(user));
        window.location.href = "/app";
      } catch (e) {
        showError(err, e.message);
      }
    });
  }

  // If already logged in and on auth page, redirect to app.
  const token = localStorage.getItem("connect.token");
  if (token && (loginForm || registerForm)) {
    fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    }).then((r) => {
      if (r.ok) window.location.href = "/app";
    });
  }
})();
