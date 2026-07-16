(function () {
  const TOKEN_KEY = "connect.token";
  const USER_KEY = "connect.user";

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }
  function getUser() {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || "null");
    } catch {
      return null;
    }
  }
  function setSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  async function request(path, opts = {}) {
    const token = getToken();
    const headers = {
      "Content-Type": "application/json",
      ...(opts.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
    if (opts.body && typeof opts.body !== "string" && !(opts.body instanceof FormData)) {
      opts.body = JSON.stringify(opts.body);
    }
    if (opts.body instanceof FormData) {
      delete headers["Content-Type"];
    }
    const res = await fetch(path, { ...opts, headers });
    if (res.status === 401) {
      clearSession();
      window.location.href = "/login";
      throw new Error("Unauthorized");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  }

  window.API = {
    getToken,
    getUser,
    setSession,
    clearSession,
    request,
    me: () => request("/api/auth/me"),
    listConversations: () => request("/api/conversations"),
    createDM: (userId) =>
      request("/api/conversations/dm", { method: "POST", body: { userId } }),
    createGroup: (name, memberIds) =>
      request("/api/conversations/group", {
        method: "POST",
        body: { name, memberIds },
      }),
    getMessages: (convId, opts = {}) => {
      const params = new URLSearchParams();
      if (opts.before) params.set("before", opts.before);
      if (opts.limit) params.set("limit", opts.limit);
      const q = params.toString();
      return request(`/api/conversations/${convId}/messages${q ? "?" + q : ""}`);
    },
    searchUsers: (q) =>
      request(`/api/users/search?q=${encodeURIComponent(q)}`),
    upload: (file) => {
      const fd = new FormData();
      fd.append("file", file);
      return request("/api/upload", { method: "POST", body: fd });
    },
    addGroupMembers: (convId, userIds) =>
      request(`/api/conversations/${convId}/members`, {
        method: "POST",
        body: { userIds },
      }),
    removeGroupMember: (convId, userId) =>
      request(`/api/conversations/${convId}/members/${userId}`, {
        method: "DELETE",
      }),
  };
})();
