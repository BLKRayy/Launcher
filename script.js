// --- Simple state ---

let allGames = [];
let filteredGames = [];
let currentTab = "all";
let currentGameId = null;
let favorites = new Set();
let recent = [];
let totalGamesPlayed = 0;

let maintenanceState = {
  enabled: false,
  message:
    "The system is currently offline for maintenance. Please check back soon.",
  until: null // timestamp (ms) or null
};
let maintenanceTimerInterval = null;

const STORAGE_KEYS = {
  FAVORITES: "na_favorites",
  RECENT: "na_recent",
  THEME: "na_theme",
  USERNAME: "na_username",
  GAMES: "na_games_override",
  STATS: "na_stats",
  MAINTENANCE: "na_maintenance"
};

// --- DOM helpers ---

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// --- Init ---

document.addEventListener("DOMContentLoaded", () => {
  loadLocalState();
  attachEvents();
  loadGames().then(() => {
    renderCategoryFilter();
    applyFilters();
    updateStats();
    renderRecommended();
  });
  applyMaintenanceState();
});

// --- Load games (with local override) ---

async function loadGames() {
  try {
    const override = localStorage.getItem(STORAGE_KEYS.GAMES);
    if (override) {
      allGames = JSON.parse(override);
      return;
    }

    const res = await fetch("games.json");
    allGames = await res.json();
  } catch (e) {
    console.error("Failed to load games:", e);
    allGames = [];
  }
}

// --- Local state ---

function loadLocalState() {
  // Favorites
  const favRaw = localStorage.getItem(STORAGE_KEYS.FAVORITES);
  if (favRaw) {
    try {
      favorites = new Set(JSON.parse(favRaw));
    } catch {}
  }

  // Recent
  const recentRaw = localStorage.getItem(STORAGE_KEYS.RECENT);
  if (recentRaw) {
    try {
      recent = JSON.parse(recentRaw);
    } catch {}
  }

  // Theme
  const theme = localStorage.getItem(STORAGE_KEYS.THEME) || "dark";
  document.documentElement.dataset.theme = theme;

  // Username
  const username = localStorage.getItem(STORAGE_KEYS.USERNAME) || "";
  $("#usernameInput").value = username;
  $("#statUser").textContent = username || "Guest";

  // Stats
  const statsRaw = localStorage.getItem(STORAGE_KEYS.STATS);
  if (statsRaw) {
    try {
      const stats = JSON.parse(statsRaw);
      totalGamesPlayed = stats.totalGamesPlayed || 0;
    } catch {}
  }

  // Maintenance
  const maintRaw = localStorage.getItem(STORAGE_KEYS.MAINTENANCE);
  if (maintRaw) {
    try {
      const parsed = JSON.parse(maintRaw);
      maintenanceState = {
        enabled: !!parsed.enabled,
        message:
          parsed.message ||
          "The system is currently offline for maintenance. Please check back soon.",
        until: parsed.until || null
      };
    } catch {}
  }
}

function saveLocalState() {
  localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify([...favorites]));
  localStorage.setItem(STORAGE_KEYS.RECENT, JSON.stringify(recent));
  localStorage.setItem(
    STORAGE_KEYS.STATS,
    JSON.stringify({ totalGamesPlayed })
  );
  localStorage.setItem(STORAGE_KEYS.MAINTENANCE, JSON.stringify(maintenanceState));
}

// --- Events ---

function attachEvents() {
  // Search + filter
  $("#searchInput").addEventListener("input", applyFilters);
  $("#categoryFilter").addEventListener("change", applyFilters);

  // Tabs
  $$(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$(".tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentTab = btn.dataset.tab;
      applyFilters();
    });
  });

  // Theme toggle
  $("#themeToggle").addEventListener("click", () => {
    const current = document.documentElement.dataset.theme || "dark";
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem(STORAGE_KEYS.THEME, next);
  });

  // Username
  $("#usernameInput").addEventListener("input", (e) => {
    const name = e.target.value.trim();
    localStorage.setItem(STORAGE_KEYS.USERNAME, name);
    $("#statUser").textContent = name || "Guest";
  });

  // Fullscreen
  $("#fullscreenBtn").addEventListener("click", () => {
    const frame = $("#gameFrame");
    if (!frame.src) return;
    if (frame.requestFullscreen) frame.requestFullscreen();
  });

  // Favorite toggle
  $("#favoriteToggle").addEventListener("click", () => {
    if (!currentGameId) return;
    if (favorites.has(currentGameId)) {
      favorites.delete(currentGameId);
    } else {
      favorites.add(currentGameId);
    }
    saveLocalState();
    applyFilters();
    updateStats();
    updateFavoriteButton();
  });

  // Admin modal (normal topbar)
  $("#adminBtn").addEventListener("click", () => {
    openAdminModal();
  });

  // Admin modal (from System Offline overlay)
  $("#maintenanceAdminBtn").addEventListener("click", () => {
    openAdminModal();
  });

  $("#closeAdmin").addEventListener("click", () => {
    $("#adminModal").classList.add("hidden");
  });

  $("#adminLoginBtn").addEventListener("click", handleAdminLogin);
  $("#adminAddGameBtn").addEventListener("click", handleAdminAddGame);
  $("#exportJsonBtn").addEventListener("click", handleExportJson);

  // Maintenance controls in admin
  $("#maintApplyBtn").addEventListener("click", handleApplyMaintenance);
  $("#maintDisableBtn").addEventListener("click", handleDisableMaintenance);
}

function openAdminModal() {
  $("#adminModal").classList.remove("hidden");
  $("#adminAuth").classList.remove("hidden");
  $("#adminBody").classList.add("hidden");
  $("#adminUsername").value = "";
  $("#adminPassword").value = "";
}

// --- Filtering + rendering ---

function applyFilters() {
  const search = $("#searchInput").value.toLowerCase();
  const category = $("#categoryFilter").value;

  filteredGames = allGames.filter((g) => {
    if (currentTab === "favorites" && !favorites.has(g.id)) return false;
    if (currentTab === "recent" && !recent.includes(g.id)) return false;

    if (category !== "all" && g.category !== category) return false;

    if (
      search &&
      !g.title.toLowerCase().includes(search) &&
      !g.category.toLowerCase().includes(search)
    ) {
      return false;
    }

    return true;
  });

  renderGameList();
  updateStats();
}

function renderGameList() {
  const container = $("#gameList");
  container.innerHTML = "";

  filteredGames.forEach((game) => {
    const card = document.createElement("div");
    card.className = "game-card";
    card.dataset.id = game.id;

    if (game.id === currentGameId) {
      card.classList.add("active");
    }

    const thumb = document.createElement("div");
    thumb.className = "game-thumb";
    thumb.style.backgroundImage = `url("${game.thumbnail}")`;

    const info = document.createElement("div");
    info.className = "game-info";

    const title = document.createElement("div");
    title.className = "game-title";
    title.textContent = game.title;

    const meta = document.createElement("div");
    meta.className = "game-meta-line";
    meta.innerHTML = `
      <span>${game.category}</span>
      <span>${game.plays || 0} plays</span>
      <span>${favorites.has(game.id) ? "★ Favorite" : ""}</span>
    `;

    info.appendChild(title);
    info.appendChild(meta);

    card.appendChild(thumb);
    card.appendChild(info);

    card.addEventListener("click", () => {
      playGame(game.id);
    });

    container.appendChild(card);
  });
}

function renderCategoryFilter() {
  const select = $("#categoryFilter");
  // Clear existing except "all"
  select.innerHTML = '<option value="all">All Categories</option>';
  const categories = Array.from(new Set(allGames.map((g) => g.category))).sort();
  categories.forEach((cat) => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    select.appendChild(opt);
  });
}

// --- Play game ---

function playGame(id) {
  const game = allGames.find((g) => g.id === id);
  if (!game) return;

  currentGameId = id;

  // Update iframe
  const frame = $("#gameFrame");
  frame.src = game.url;
  frame.style.display = "block";
  $("#playerPlaceholder").style.display = "none";

  // Update meta
  $("#playerTitle").textContent = game.title;
  $("#gameDescription").textContent = game.description || "";
  $("#gameCategory").textContent = game.category;
  game.plays = (game.plays || 0) + 1;
  $("#gamePlays").textContent = `${game.plays} plays`;
  $("#gameMeta").classList.remove("hidden");

  // Recent
  recent = [id, ...recent.filter((x) => x !== id)].slice(0, 15);

  // Stats
  totalGamesPlayed += 1;

  saveLocalState();
  applyFilters();
  updateStats();
  updateFavoriteButton();
  renderRecommended();
}

function updateFavoriteButton() {
  const btn = $("#favoriteToggle");
  if (!currentGameId) {
    btn.textContent = "★ Favorite";
    return;
  }
  if (favorites.has(currentGameId)) {
    btn.textContent = "★ Favorited";
  } else {
    btn.textContent = "★ Favorite";
  }
}

// --- Stats + recommended ---

function updateStats() {
  $("#statTotalGames").textContent = allGames.length;
  $("#statFavorites").textContent = favorites.size;
  $("#statGamesPlayed").textContent = totalGamesPlayed;
}

function renderRecommended() {
  const container = $("#recommendedList");
  container.innerHTML = "";

  // Simple "recommended": top 3 by plays, excluding current
  const sorted = [...allGames]
    .filter((g) => g.id !== currentGameId)
    .sort((a, b) => (b.plays || 0) - (a.plays || 0))
    .slice(0, 3);

  sorted.forEach((game) => {
    const item = document.createElement("div");
    item.className = "recommended-item";
    item.textContent = `${game.title} • ${game.category}`;
    item.addEventListener("click", () => playGame(game.id));
    container.appendChild(item);
  });

  if (!sorted.length) {
    const empty = document.createElement("div");
    empty.className = "recommended-item";
    empty.textContent = "Play some games to see recommendations.";
    container.appendChild(empty);
  }
}

// --- Admin ---

let adminAuthed = false;

function handleAdminLogin() {
  const user = $("#adminUsername").value.trim();
  const pwd = $("#adminPassword").value;

  if (user === "admin" && pwd === "loyal") {
    adminAuthed = true;
    $("#adminAuth").classList.add("hidden");
    $("#adminBody").classList.remove("hidden");
    renderAdminGameList();
    populateMaintenanceControls();
  } else {
    alert("Wrong username or password.");
  }
}

function handleAdminAddGame() {
  if (!adminAuthed) return;

  const title = $("#adminTitle").value.trim();
  const url = $("#adminUrl").value.trim();
  const thumb = $("#adminThumb").value.trim();
  const category = $("#adminCategory").value.trim() || "Other";
  const description = $("#adminDescription").value.trim();

  if (!title || !url) {
    alert("Title and URL are required.");
    return;
  }

  const id = title.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Date.now();

  const newGame = {
    id,
    title,
    url,
    thumbnail: thumb || "https://picsum.photos/seed/" + id + "/200/200",
    category,
    description,
    plays: 0
  };

  allGames.push(newGame);
  localStorage.setItem(STORAGE_KEYS.GAMES, JSON.stringify(allGames));

  $("#adminTitle").value = "";
  $("#adminUrl").value = "";
  $("#adminThumb").value = "";
  $("#adminCategory").value = "";
  $("#adminDescription").value = "";

  renderAdminGameList();
  renderCategoryFilter();
  applyFilters();
}

function renderAdminGameList() {
  const container = $("#adminGameList");
  container.innerHTML = "";

  allGames.forEach((game) => {
    const row = document.createElement("div");
    row.className = "admin-game-row";

    const label = document.createElement("span");
    label.textContent = `${game.title} • ${game.category}`;

    const btn = document.createElement("button");
    btn.className = "pill-btn pill-danger";
    btn.textContent = "Delete";
    btn.addEventListener("click", () => {
      if (!confirm(`Delete "${game.title}"?`)) return;
      allGames = allGames.filter((g) => g.id !== game.id);
      localStorage.setItem(STORAGE_KEYS.GAMES, JSON.stringify(allGames));
      renderAdminGameList();
      renderCategoryFilter();
      applyFilters();
    });

    row.appendChild(label);
    row.appendChild(btn);
    container.appendChild(row);
  });
}

function handleExportJson() {
  console.log("=== Exported games.json ===");
  console.log(JSON.stringify(allGames, null, 2));
  alert(
    "Games JSON has been printed to the browser console.\nCopy it into your games.json file in GitHub."
  );
}

// --- System Offline / Maintenance mode ---

function applyMaintenanceState() {
  const overlay = $("#maintenanceOverlay");
  const msgEl = $("#maintenanceMessage");

  msgEl.textContent = maintenanceState.message;

  if (maintenanceState.enabled) {
    overlay.classList.remove("hidden");
    startMaintenanceTimer();
  } else {
    overlay.classList.add("hidden");
    stopMaintenanceTimer();
  }
}

function startMaintenanceTimer() {
  updateMaintenanceTimerDisplay();
  if (maintenanceTimerInterval) {
    clearInterval(maintenanceTimerInterval);
  }
  maintenanceTimerInterval = setInterval(updateMaintenanceTimerDisplay, 1000);
}

function stopMaintenanceTimer() {
  if (maintenanceTimerInterval) {
    clearInterval(maintenanceTimerInterval);
    maintenanceTimerInterval = null;
  }
  $("#maintenanceTimer").textContent = "Time remaining: —";
}

function showRebootOverlay() {
  const overlay = $("#rebootOverlay");
  overlay.classList.remove("hidden");
  setTimeout(() => {
    overlay.classList.add("hidden");
  }, 2000);
}

function updateMaintenanceTimerDisplay() {
  const timerEl = $("#maintenanceTimer");

  if (!maintenanceState.enabled) {
    timerEl.textContent = "Time remaining: —";
    return;
  }

  if (!maintenanceState.until) {
    timerEl.textContent = "Time remaining: Until further notice";
    return;
  }

  const now = Date.now();
  const diff = maintenanceState.until - now;

  if (diff <= 0) {
    // Auto-disable when timer expires
    maintenanceState.enabled = false;
    maintenanceState.until = null;
    saveLocalState();
    applyMaintenanceState();
    showRebootOverlay();
    return;
  }

  const totalSeconds = Math.floor(diff / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  timerEl.textContent = `Time remaining: ${minutes}m ${seconds}s`;
}

function populateMaintenanceControls() {
  $("#maintEnabled").checked = maintenanceState.enabled;
  $("#maintMessage").value = maintenanceState.message || "";
  if (maintenanceState.until) {
    const diff = maintenanceState.until - Date.now();
    if (diff > 0) {
      const minutes = Math.round(diff / 60000);
      $("#maintMinutes").value = minutes;
    } else {
      $("#maintMinutes").value = "";
    }
  } else {
    $("#maintMinutes").value = "";
  }
}

function handleApplyMaintenance() {
  if (!adminAuthed) return;

  const enabled = $("#maintEnabled").checked;
  const message =
    $("#maintMessage").value.trim() ||
    "The system is currently offline for maintenance. Please check back soon.";
  const minutesRaw = $("#maintMinutes").value;
  const minutes = minutesRaw ? parseInt(minutesRaw, 10) : 0;

  maintenanceState.enabled = enabled;
  maintenanceState.message = message;

  if (enabled && minutes > 0) {
    maintenanceState.until = Date.now() + minutes * 60000;
  } else if (enabled && minutes === 0) {
    maintenanceState.until = null; // until further notice
  } else {
    maintenanceState.until = null;
  }

  saveLocalState();
  applyMaintenanceState();
  alert("System Offline settings updated.");
}

function handleDisableMaintenance() {
  if (!adminAuthed) return;

  maintenanceState.enabled = false;
  maintenanceState.until = null;
  saveLocalState();
  applyMaintenanceState();
  $("#maintEnabled").checked = false;
  alert("System Offline mode disabled.");
}
