/* =========================================================
   WEBSITE DESA - app.js (FULL) - BAGIAN 1/3
   Fokus BAGIAN 1:
   ✅ Firebase init via ./firebase.js (db, auth) — Storage TIDAK dipakai utk konten
   ✅ Firebase Auth (Login Admin Email/Password) + state listener
   ✅ Helpers (toast/loading/modal/format)
   ✅ Navigasi section + Tabs statistik/potensi
   ✅ Apply settings dasar ke UI (fallback local)
   ✅ Gambar: LINK SAJA + MULTI LINK (UI modal input + preview)
   ✅ Expose API global untuk BAGIAN 2 & 3
   ========================================================= */

import { db, auth } from "./firebase.js";

import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  collection,
  query,
  orderBy,
  where,
  getDocs,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

(() => {
  "use strict";

  /* =========================
     HELPERS
  ========================== */
  const $ = (id) => document.getElementById(id);
  const qs = (sel) => document.querySelector(sel);
  const qsa = (sel) => Array.from(document.querySelectorAll(sel));
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }
  function escapeHtmlAttr(str) {
    return escapeHtml(str).replaceAll("\n", "");
  }

  function uid(prefix = "id") {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function todayISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function toNumber(value) {
    return parseInt(String(value || "").replace(/[^\d]/g, ""), 10) || 0;
  }

  function toFloat(value) {
    const s = String(value ?? "").replace(",", ".").replace(/[^\d.]/g, "");
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  }

  function formatRupiah(value) {
    const num = typeof value === "number"
      ? value
      : parseInt(String(value || "").replace(/[^\d]/g, ""), 10) || 0;
    return "Rp " + num.toLocaleString("id-ID");
  }

  function safeSetText(id, text) {
    const el = $(id);
    if (!el) return;
    el.textContent = text ?? "";
  }

  function safeSetSrc(id, src) {
    const el = $(id);
    if (!el) return;
    if (!src) return;
    el.src = src;
  }

  /* =========================
     TOAST + LOADING
  ========================== */
  const toastEl = $("toast");
  const toastMsgEl = $("toast-message");
  const loadingEl = $("loading");
  let toastTimer = null;

  function showToast(message = "Berhasil!") {
    if (!toastEl || !toastMsgEl) {
      alert(message);
      return;
    }
    toastMsgEl.textContent = message;
    toastEl.classList.remove("translate-y-20", "opacity-0");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.add("translate-y-20", "opacity-0");
    }, 2600);
  }

  function setLoading(show) {
    if (!loadingEl) return;
    loadingEl.classList.toggle("hidden", !show);
  }

  window.showToast = window.showToast || showToast;
  window.setLoading = window.setLoading || setLoading;

  /* =========================
     MODAL HELPERS
  ========================== */
  function openModal(modalEl) {
    if (!modalEl) return;
    modalEl.classList.remove("hidden");
    document.body.classList.add("modal-open");
  }

  function closeModal(modalEl) {
    if (!modalEl) return;
    modalEl.classList.add("hidden");
    const anyOpen = qsa(".fixed.inset-0").some((m) => !m.classList.contains("hidden"));
    if (!anyOpen) document.body.classList.remove("modal-open");
  }

  /* =========================
     IMAGE LINKS (MULTI) - LINK ONLY
     - dipakai BAGIAN 2 saat save konten
  ========================== */
  function normalizeImageUrl(url) {
    const u = String(url || "").trim();
    if (!u) return "";
    if (!/^https?:\/\//i.test(u)) return "";
    return u;
  }

  // Ambil semua link dari modal -> array
  function getImageLinksFromModal() {
    const wrap = $("image-links-wrap");
    if (!wrap) return [];
    const inputs = Array.from(wrap.querySelectorAll(".image-link-input"));
    const links = inputs
      .map((inp) => normalizeImageUrl(inp.value))
      .filter(Boolean);

    // unik + urutan tetap
    const seen = new Set();
    const uniq = [];
    for (const l of links) {
      if (seen.has(l)) continue;
      seen.add(l);
      uniq.push(l);
    }
    return uniq;
  }

  // Isi modal dengan array link (untuk Edit)
  function setImageLinksToModal(links = []) {
    const wrap = $("image-links-wrap");
    if (!wrap) return;

    const arr = Array.isArray(links) ? links.filter(Boolean) : [];
    wrap.innerHTML = "";

    const makeRow = (value = "", removable = true) => {
      const row = document.createElement("div");
      row.className = "image-link-row flex gap-2 items-start";

      const input = document.createElement("input");
      input.type = "url";
      input.placeholder = "https://...";
      input.value = value || "";
      input.className = "image-link-input flex-1 px-4 py-3 border border-gray-300 rounded-2xl";

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "remove-image-link px-3 py-3 rounded-2xl bg-red-100 text-red-700 hover:bg-red-200";
      btn.textContent = "✖";
      btn.style.display = removable ? "" : "none";

      row.appendChild(input);
      row.appendChild(btn);

      // events
      on(input, "input", () => refreshImageLinksPreview());
      on(btn, "click", () => {
        row.remove();
        ensureAtLeastOneRow();
        refreshImageLinksPreview();
      });

      return row;
    };

    // minimal 1 baris
    if (arr.length === 0) {
      wrap.appendChild(makeRow("", false));
    } else {
      arr.forEach((l, idx) => wrap.appendChild(makeRow(l, idx !== 0)));
      // baris pertama tidak boleh hilang (biar selalu ada)
      const firstBtn = wrap.querySelector(".remove-image-link");
      if (firstBtn) firstBtn.style.display = "none";
    }

    refreshImageLinksPreview();
  }

  function ensureAtLeastOneRow() {
    const wrap = $("image-links-wrap");
    if (!wrap) return;
    const rows = wrap.querySelectorAll(".image-link-row");
    if (rows.length === 0) {
      // bikin 1 row default
      const row = document.createElement("div");
      row.className = "image-link-row flex gap-2 items-start";
      row.innerHTML = `
        <input type="url" class="image-link-input flex-1 px-4 py-3 border border-gray-300 rounded-2xl" placeholder="https://...">
        <button type="button" class="remove-image-link hidden px-3 py-3 rounded-2xl bg-red-100 text-red-700 hover:bg-red-200">✖</button>
      `;
      wrap.appendChild(row);

      const input = row.querySelector(".image-link-input");
      on(input, "input", () => refreshImageLinksPreview());
    }

    // aturan: tombol hapus hanya muncul untuk row ke-2 dst
    Array.from(wrap.querySelectorAll(".image-link-row")).forEach((r, idx) => {
      const btn = r.querySelector(".remove-image-link");
      if (!btn) return;
      btn.classList.toggle("hidden", idx === 0);
    });
  }

  function addImageLinkRow() {
    const wrap = $("image-links-wrap");
    if (!wrap) return;

    const row = document.createElement("div");
    row.className = "image-link-row flex gap-2 items-start";
    row.innerHTML = `
      <input type="url" class="image-link-input flex-1 px-4 py-3 border border-gray-300 rounded-2xl" placeholder="https://...">
      <button type="button" class="remove-image-link px-3 py-3 rounded-2xl bg-red-100 text-red-700 hover:bg-red-200">✖</button>
    `;
    wrap.appendChild(row);

    const input = row.querySelector(".image-link-input");
    const btn = row.querySelector(".remove-image-link");

    on(input, "input", () => refreshImageLinksPreview());
    on(btn, "click", () => {
      row.remove();
      ensureAtLeastOneRow();
      refreshImageLinksPreview();
    });

    ensureAtLeastOneRow();
    input?.focus();
  }

  function refreshImageLinksPreview() {
    const previewWrap = $("image-links-preview");
    const grid = $("image-preview-grid");
    if (!previewWrap || !grid) return;

    const links = getImageLinksFromModal();
    if (links.length === 0) {
      previewWrap.classList.add("hidden");
      grid.innerHTML = "";
      return;
    }

    previewWrap.classList.remove("hidden");
    grid.innerHTML = links.map((u) => `
      <div class="rounded-2xl overflow-hidden border border-gray-200 bg-gray-50 aspect-square">
        <img src="${escapeHtmlAttr(u)}" alt="Preview" class="w-full h-full object-cover" loading="lazy">
      </div>
    `).join("");
  }

  // bind tombol tambah link (jika ada)
  on($("add-image-link"), "click", () => {
    addImageLinkRow();
  });

  /* =========================
     LOCAL DB (fallback)
  ========================== */
  const DB_KEY = "desa_site_db_v1";

  const DEFAULT_SETTINGS = {
    villageName: "Desa Ciasihan",
    welcomeText: "Website resmi Pemerintah Desa Ciasihan",
    footerText: "© 2026 Desa Ciasihan. Hak Cipta Dilindungi.",

    logoSrc: "./assets/logo-desa.png",
    bannerSrc: "./assets/banner-desa.jpg",
    kadesPhoto: "./assets/kades.jpg",

    kadesName: "Budi Santoso",
    kadesPeriod: "Periode 2024–2030",

    visi: "Mewujudkan Desa Sejahtera yang Maju, Mandiri, dan Berkeadilan.",
    misi: "Meningkatkan pelayanan publik dan ekonomi desa berbasis potensi lokal.",

    alamat: "Jl. Raya Desa No. 1, Kecamatan Pamijahan",
    telepon: "(021) 1234-5678",
    email: "desa@ciasihan.go.id",
    jam: "Senin - Jumat: 08:00 - 16:00 WIB",
    mapSrc: "https://www.google.com/maps?q=desa%20indonesia&output=embed",

    statPenduduk: 0,
    statRtrw: 0,
    statHektar: 0,
    statProgram: 0,

    perangkat: [
      { id: uid("p"), name: "Budi Santoso", role: "Kepala Desa", photo: "./assets/kades.jpg" }
    ]
  };

  const DEFAULT_DB = {
    settings: DEFAULT_SETTINGS,
    contents: [], // fallback local bila firebase bermasalah (opsional)
    apbdes: {}
  };

  function loadDB() {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (!raw) return structuredClone(DEFAULT_DB);
      const parsed = JSON.parse(raw);

      const dbx = structuredClone(DEFAULT_DB);
      dbx.settings = { ...dbx.settings, ...(parsed.settings || {}) };
      dbx.contents = Array.isArray(parsed.contents) ? parsed.contents : [];
      dbx.apbdes = parsed.apbdes && typeof parsed.apbdes === "object" ? parsed.apbdes : {};
      return dbx;
    } catch {
      return structuredClone(DEFAULT_DB);
    }
  }

  function saveDB(dbx) {
    localStorage.setItem(DB_KEY, JSON.stringify(dbx));
  }

  let DB = loadDB();
  if (!localStorage.getItem(DB_KEY)) saveDB(DB);

  /* =========================
     GLOBAL API untuk BAGIAN 2/3
  ========================== */
  window.__DESA__ = window.__DESA__ || {};
  Object.assign(window.__DESA__, {
    db,
    auth,

    fs: {
      doc, setDoc, getDoc, updateDoc, deleteDoc, addDoc,
      collection, query, orderBy, where, getDocs, onSnapshot, serverTimestamp
    },

    DB_KEY,
    loadDB,
    saveDB,

    uid,
    todayISO,
    toNumber,
    toFloat,
    formatRupiah,
    clamp,
    escapeHtml,
    escapeHtmlAttr,
    openModal,
    closeModal,

    // image links API
    normalizeImageUrl,
    getImageLinksFromModal,
    setImageLinksToModal,
    refreshImageLinksPreview,

    // helper untuk cek admin mode (akan di-set di setAdminMode)
    isAdminMode: () => false
  });

  /* =========================
     STATE UI
  ========================== */
  let isAdmin = false;
  let currentSection = "beranda";

  /* =========================
     APPLY SETTINGS -> UI (fallback local)
  ========================== */
  function renderPerangkatPublic() {
    const wrap = $("perangkat-list");
    if (!wrap) return;

    DB = loadDB();
    const arr = Array.isArray(DB.settings?.perangkat) ? DB.settings.perangkat : [];
    if (arr.length === 0) {
      wrap.innerHTML = `
        <div class="p-3 rounded-xl bg-white/10 border border-white/15 text-emerald-100 text-sm">
          Belum ada data perangkat.
        </div>`;
      return;
    }

    wrap.innerHTML = arr.map((p) => {
      const photo = p.photo || "./assets/kades.jpg";
      return `
        <div class="flex items-center gap-3 bg-white/15 rounded-xl p-3 border border-white/15">
          <div class="w-12 h-12 bg-white/15 rounded-xl overflow-hidden border border-white/20">
            <img src="${escapeHtmlAttr(photo)}" alt="Foto ${escapeHtmlAttr(p.role || "Perangkat")}"
              class="w-full h-full object-cover" loading="lazy">
          </div>
          <div class="min-w-0">
            <p class="font-medium truncate">${escapeHtml(p.name || "Nama")}</p>
            <p class="text-emerald-100 text-sm truncate">${escapeHtml(p.role || "Jabatan")}</p>
          </div>
        </div>`;
    }).join("");
  }

  function renderStrukturPublic() {
    const wrap = $("struktur-container");
    if (!wrap) return;

    DB = loadDB();
    const arr = Array.isArray(DB.settings?.perangkat) ? DB.settings.perangkat : [];
    if (arr.length === 0) {
      wrap.innerHTML = `
        <div class="bg-white rounded-2xl p-5 shadow-lg border border-gray-100">
          <p class="text-gray-500 text-sm">Belum ada data struktur pemerintahan.</p>
        </div>`;
      return;
    }

    wrap.innerHTML = arr.map((p) => {
      const photo = p.photo || "./assets/kades.jpg";
      return `
        <div class="bg-white rounded-2xl p-5 shadow-lg border border-gray-100 card-hover">
          <div class="flex items-center gap-4">
            <div class="w-14 h-14 rounded-xl overflow-hidden bg-gray-100 border border-gray-200">
              <img src="${escapeHtmlAttr(photo)}" alt="Foto ${escapeHtmlAttr(p.role || "Perangkat")}"
                class="w-full h-full object-cover" loading="lazy">
            </div>
            <div class="min-w-0">
              <p class="font-semibold text-gray-800 truncate">${escapeHtml(p.name || "Nama")}</p>
              <p class="text-sm text-gray-500 truncate">${escapeHtml(p.role || "Jabatan")}</p>
            </div>
          </div>
        </div>`;
    }).join("");
  }

  function applySettingsToUI() {
    DB = loadDB();
    const s = DB.settings || {};

    safeSetText("village-name", s.villageName);
    safeSetText("welcome-text", s.welcomeText);
    safeSetText("footer-text", s.footerText);

    safeSetSrc("desa-logo", s.logoSrc);
    safeSetSrc("desa-banner", s.bannerSrc);

    safeSetSrc("foto-kades", s.kadesPhoto);
    safeSetText("nama-kades", s.kadesName);
    safeSetText("periode-kades", s.kadesPeriod);

    safeSetText("visi-display", s.visi);
    safeSetText("misi-display", s.misi);

    safeSetText("desa-alamat", s.alamat);
    safeSetText("desa-telepon", s.telepon);
    safeSetText("desa-email", s.email);
    safeSetText("desa-jam", s.jam);

    const map = $("desa-map");
    if (map && s.mapSrc) map.src = s.mapSrc;

    safeSetText("stat-penduduk", String(s.statPenduduk ?? 0));
    safeSetText("stat-rtrw", String(s.statRtrw ?? 0));
    safeSetText("stat-hektar", String(s.statHektar ?? 0));
    safeSetText("stat-program", String(s.statProgram ?? 0));

    renderPerangkatPublic();
    renderStrukturPublic();
  }

  window.__DESA__.applySettingsToUI = applySettingsToUI;

  /* =========================
     NAVIGATION SECTIONS
  ========================== */
  function showSection(section) {
    currentSection = section;

    qsa('[id^="section-"]').forEach((sec) => sec.classList.add("hidden"));

    const target = $(`section-${section}`);
    if (target) target.classList.remove("hidden");

    qsa(".nav-btn").forEach((btn) => {
      const active = btn.dataset.section === section;
      btn.classList.toggle("active", active);

      if (active) {
        btn.classList.add("text-emerald-700", "bg-emerald-100");
        btn.classList.remove("text-gray-600");
      } else {
        btn.classList.remove("text-emerald-700", "bg-emerald-100");
        btn.classList.add("text-gray-600");
      }
    });

    // scroll ke atas halaman (biar nyaman)
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function initNav() {
    qsa(".nav-btn").forEach((btn) => {
      on(btn, "click", () => showSection(btn.dataset.section || "beranda"));
    });
  }

  /* =========================
     TABS (STATISTIK / POTENSI)
  ========================== */
  function setStatTab(tab) {
    qsa(".stat-tab").forEach((b) => {
      const active = b.dataset.tab === tab;
      b.classList.toggle("is-active", active);
      if (active) {
        b.classList.add("bg-emerald-100", "text-emerald-700");
        b.classList.remove("bg-white", "text-gray-700");
      } else {
        b.classList.remove("bg-emerald-100", "text-emerald-700");
        b.classList.add("bg-white", "text-gray-700");
      }
    });

    if (typeof window.__desaRenderStatistik === "function") {
      window.__desaRenderStatistik(tab);
      return;
    }

    const container = $("statistik-container");
    if (container) {
      container.innerHTML = `
        <div class="p-4 rounded-xl bg-gray-50 border border-gray-200">
          <p class="text-gray-700 font-semibold">Tab: ${escapeHtml(tab)}</p>
          <p class="text-gray-500 text-sm mt-1">Render statistik menyusul di BAGIAN 2.</p>
        </div>`;
    }
  }

  function setPotTab(tab) {
    qsa(".pot-tab").forEach((b) => {
      const active = b.dataset.tab === tab;
      b.classList.toggle("is-active", active);
      if (active) {
        b.classList.add("bg-emerald-100", "text-emerald-700");
        b.classList.remove("bg-white", "text-gray-700");
      } else {
        b.classList.remove("bg-emerald-100", "text-emerald-700");
        b.classList.add("bg-white", "text-gray-700");
      }
    });

    if (typeof window.__desaRenderPotensi === "function") {
      window.__desaRenderPotensi(tab);
      return;
    }

    const container = $("potensi-container");
    if (container) {
      container.innerHTML = `
        <div class="text-center py-12 text-gray-400 col-span-full">
          <div class="text-5xl mb-3">🌟</div>
          <p>Tab: <b>${escapeHtml(String(tab).toUpperCase())}</b> — Render potensi menyusul di BAGIAN 2.</p>
        </div>`;
    }
  }

  function initTabs() {
    qsa(".stat-tab").forEach((b) => on(b, "click", () => setStatTab(b.dataset.tab || "demografi")));
    qsa(".pot-tab").forEach((b) => on(b, "click", () => setPotTab(b.dataset.tab || "umkm")));
  }

  /* =========================
     ADMIN LOGIN (FIREBASE AUTH)
  ========================== */
  const loginModal = $("login-modal");
  const adminPanel = $("admin-panel");
  const adminBtn = $("admin-btn");
  const adminBtnText = $("admin-btn-text");

  function setAdminMode(onOff) {
    isAdmin = !!onOff;
    if (adminBtnText) adminBtnText.textContent = isAdmin ? "Logout" : "Admin";
    if (adminPanel) adminPanel.classList.toggle("hidden", !isAdmin);

    window.__DESA__.isAdminMode = () => {
      const p = $("admin-panel");
      return p && !p.classList.contains("hidden");
    };

    // refresh render konten jika BAGIAN 2 sudah ada
    if (typeof window.__desaRenderAll === "function") {
      window.__desaRenderAll();
    }
  }

  function initAdminLogin() {
    on(adminBtn, "click", async () => {
      try {
        if (isAdmin) {
          await signOut(auth);
          showToast("Logout berhasil");
        } else {
          openModal(loginModal);
        }
      } catch (e) {
        console.error(e);
        showToast("Gagal proses admin");
      }
    });

    on($("login-cancel"), "click", () => {
      closeModal(loginModal);
      $("login-error")?.classList.add("hidden");
    });

    on($("login-submit"), "click", async () => {
      const email = ($("login-username")?.value || "").trim();
      const pass = ($("login-password")?.value || "").trim();

      if (!email || !pass) {
        $("login-error")?.classList.remove("hidden");
        return;
      }

      setLoading(true);
      try {
        await signInWithEmailAndPassword(auth, email, pass);
        closeModal(loginModal);
        $("login-error")?.classList.add("hidden");
        if ($("login-username")) $("login-username").value = "";
        if ($("login-password")) $("login-password").value = "";
        showToast("Berhasil login sebagai Admin");
      } catch (err) {
        console.error(err);
        $("login-error")?.classList.remove("hidden");
        showToast("Login gagal. Cek email/password");
      } finally {
        setLoading(false);
      }
    });

    on(loginModal, "click", (e) => {
      if (e.target === loginModal) closeModal(loginModal);
    });

    onAuthStateChanged(auth, (user) => {
      setAdminMode(!!user);
    });
  }

  /* =========================
     INIT
  ========================== */
  function init() {
    initNav();
    initTabs();
    initAdminLogin();

    // pastikan row pertama ada, aturan tombol hapus berlaku
    ensureAtLeastOneRow();

    applySettingsToUI();

    showSection("beranda");
    setStatTab("demografi");
    setPotTab("umkm");
  }

  init();
})();
/* =========================================================
   WEBSITE DESA - app.js (FULL) - BAGIAN 2/3
   Fokus BAGIAN 2:
   ✅ Firestore: contents
   ✅ CRUD konten (Admin)
   ✅ Render publik (Berita/Pengumuman/Agenda/Profil/Statistik/Potensi/Galeri)
   ✅ Realtime updates (onSnapshot)
   ✅ FOTO: LINK SAJA + MULTI (images: ["url1","url2",...])
   ✅ Tanpa Firebase Storage untuk konten
   ✅ NEW: Setelah simpan konten -> auto masuk Beranda
   ========================================================= */

(() => {
  "use strict";

  const H = window.__DESA__ || {};
  const $ = (id) => document.getElementById(id);
  const qs = (sel) => document.querySelector(sel);
  const qsa = (sel) => Array.from(document.querySelectorAll(sel));
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

  // Firebase handles
  const db = H.db;

  // Firestore funcs
  const {
    doc, setDoc, updateDoc, deleteDoc,
    collection, query, orderBy, onSnapshot, serverTimestamp
  } = (H.fs || {});

  // Utils
  const uid = H.uid || ((p="id") => `${p}_${Date.now()}_${Math.random().toString(16).slice(2)}`);
  const todayISO = H.todayISO || (() => new Date().toISOString().slice(0, 10));
  const escapeHtml = H.escapeHtml || ((s) => String(s ?? ""));
  const escapeHtmlAttr = H.escapeHtmlAttr || ((s) => String(s ?? ""));
  const openModal = H.openModal || ((m) => m && m.classList.remove("hidden"));
  const closeModal = H.closeModal || ((m) => m && m.classList.add("hidden"));
  const showToast = window.showToast || ((m) => alert(m));
  const setLoading = window.setLoading || (() => {});
  const clamp = H.clamp || ((n, min, max) => Math.min(max, Math.max(min, n)));

  const normalizeImageUrl = H.normalizeImageUrl || ((u) => String(u || "").trim());
  const getImageLinksFromModal = H.getImageLinksFromModal || (() => []);
  const setImageLinksToModal = H.setImageLinksToModal || (() => {});
  const refreshImageLinksPreview = H.refreshImageLinksPreview || (() => {});

  function isAdminMode() {
    return typeof H.isAdminMode === "function" ? !!H.isAdminMode() : false;
  }

  // ===== Guard =====
  if (!db || !collection || !onSnapshot) {
    console.warn("BAGIAN 2 tidak jalan: Firebase belum siap. Pastikan BAGIAN 1 & firebase.js benar.");
    return;
  }

  /* =========================
     NAV BRIDGE (AUTO KE BERANDA)
     - BAGIAN 1 tidak expose showSection, jadi di sini kita bikin helper yang aman
  ========================== */
  function goToBeranda() {
    // Cara 1: klik tombol nav beranda (paling aman karena pakai logic BAGIAN 1)
    const btn = document.querySelector('.nav-btn[data-section="beranda"]');
    if (btn) {
      btn.click();
      return;
    }

    // Cara 2: fallback manual (kalau tombol tidak ada)
    qsa('[id^="section-"]').forEach((sec) => sec.classList.add("hidden"));
    const target = $("section-beranda");
    if (target) target.classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* =========================
     FIRESTORE PATHS
  ========================== */
  const COL_CONTENTS = "contents";
  const contentsCol = collection(db, COL_CONTENTS);

  /* =========================
     STATE
  ========================== */
  let CONTENTS = [];
  let CONTENTS_UNSUB = null;

  /* =========================
     ELEMENTS (Modal Konten)
  ========================== */
  const contentModal = $("content-modal");
  const deleteModal = $("delete-modal");

  const btnAdd = $("add-content-btn");
  const btnSave = $("content-save");
  const btnCancel = $("content-cancel");

  const btnDelCancel = $("delete-cancel");
  const btnDelConfirm = $("delete-confirm");

  const modalTitle = $("modal-title");
  const typeSel = $("content-type");
  const titleInp = $("content-title");
  const bodyInp = $("content-body");
  const dateInp = $("published-date");

  const profilSectionSel = $("profil-section");
  const statistikTabSel = $("statistik-jenis");
  const potensiKindSel = $("potensi-kategori");

  // multi image link ui
  const addImageLinkBtn = $("add-image-link");
  const imageLinksWrap = $("image-links-wrap");

  let editingId = null;
  let deletingId = null;

  /* =========================
     SMALL HELPERS
  ========================== */
  function fmtDateID(iso) {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleDateString("id-ID", { year: "numeric", month: "long", day: "numeric" });
    } catch {
      return iso;
    }
  }

  function getCurrentStatTab() {
    return qs(".stat-tab.is-active")?.dataset?.tab || "demografi";
  }
  function getCurrentPotTab() {
    return qs(".pot-tab.is-active")?.dataset?.tab || "umkm";
  }

  function ensureAtLeastOneImageRow() {
    if (!imageLinksWrap) return;
    const rows = imageLinksWrap.querySelectorAll(".image-link-row");
    if (rows.length === 0) setImageLinksToModal([]);
  }

  function resetModalForm() {
    editingId = null;
    deletingId = null;

    if (modalTitle) modalTitle.textContent = "Tambah Konten";
    if (typeSel) {
      typeSel.disabled = false;
      typeSel.value = "berita";
    }

    if (titleInp) titleInp.value = "";
    if (bodyInp) bodyInp.value = "";
    if (dateInp) dateInp.value = todayISO();

    if (profilSectionSel) profilSectionSel.value = "sejarah";
    if (statistikTabSel) statistikTabSel.value = "demografi";
    if (potensiKindSel) potensiKindSel.value = "umkm";

    // image links -> reset jadi 1 row kosong
    setImageLinksToModal([]);
    ensureAtLeastOneImageRow();
    refreshImageLinksPreview();
  }

  /* =========================
     NORMALIZE FORM -> payload
     images: array of url
  ========================== */
  function normalizePayloadFromModal() {
    const type = (typeSel?.value || "berita").trim();
    const title = (titleInp?.value || "").trim();
    const content = (bodyInp?.value || "").trim();
    const published = (dateInp?.value || todayISO());

    if (!title) {
      showToast("Judul tidak boleh kosong");
      return null;
    }

    const images = getImageLinksFromModal(); // MULTI LINK

    const item = {
      type,
      title,
      content,
      published_date: published,

      profil_section: "",
      statistik_tab: "",
      potensi_kind: "",

      images,

      updated_at: serverTimestamp()
    };

    // jenis tanpa tanggal
    if (type === "profil") {
      item.profil_section = (profilSectionSel?.value || "sejarah");
      item.published_date = "";
    }
    if (type === "statistik") {
      item.statistik_tab = (statistikTabSel?.value || "demografi");
      item.published_date = "";
    }
    if (type === "potensi") {
      item.potensi_kind = (potensiKindSel?.value || "umkm");
      item.published_date = "";
    }

    const needsDate = (type === "berita" || type === "pengumuman" || type === "agenda");
    if (needsDate && !item.published_date) item.published_date = todayISO();

    return item;
  }

  /* =========================
     OPEN ADD MODAL
  ========================== */
  on(btnAdd, "click", () => {
    if (!isAdminMode()) return showToast("Khusus Admin");
    resetModalForm();
    openModal(contentModal);
  });

  on(btnCancel, "click", () => closeModal(contentModal));
  on(contentModal, "click", (e) => {
    if (e.target === contentModal) closeModal(contentModal);
  });

  // tombol tambah link (jaga-jaga kalau BAGIAN 1 belum bind)
  on(addImageLinkBtn, "click", () => {
    if (!imageLinksWrap) return;
    refreshImageLinksPreview();
  });

  /* =========================
     DELETE MODAL
  ========================== */
  on(btnDelCancel, "click", () => {
    deletingId = null;
    closeModal(deleteModal);
  });

  on(deleteModal, "click", (e) => {
    if (e.target === deleteModal) closeModal(deleteModal);
  });

  /* =========================
     CREATE / UPDATE
     ✅ NEW: setelah simpan -> auto ke Beranda
  ========================== */
  on(btnSave, "click", async () => {
    if (!isAdminMode()) return showToast("Khusus Admin");

    const payload = normalizePayloadFromModal();
    if (!payload) return;

    setLoading(true);
    try {
      // CREATE
      if (!editingId) {
        const id = uid("c");
        const ref = doc(db, COL_CONTENTS, id);
        payload.created_at = serverTimestamp();

        await setDoc(ref, payload);
        showToast("Konten berhasil ditambahkan");
        closeModal(contentModal);
        resetModalForm();

        // ✅ AUTO KE BERANDA
        goToBeranda();
        return;
      }

      // UPDATE
      const ref = doc(db, COL_CONTENTS, editingId);
      await updateDoc(ref, payload);

      showToast("Konten berhasil diperbarui");
      editingId = null;
      closeModal(contentModal);
      resetModalForm();

      // ✅ AUTO KE BERANDA
      goToBeranda();
    } catch (e) {
      console.error(e);
      showToast("Gagal menyimpan konten (cek Firestore Rules / Auth)");
    } finally {
      setLoading(false);
    }
  });

  /* =========================
     DELETE CONFIRM
  ========================== */
  on(btnDelConfirm, "click", async () => {
    if (!isAdminMode()) return showToast("Khusus Admin");
    if (!deletingId) return;

    setLoading(true);
    try {
      const ref = doc(db, COL_CONTENTS, deletingId);
      await deleteDoc(ref);

      deletingId = null;
      closeModal(deleteModal);
      showToast("Konten berhasil dihapus");
    } catch (e) {
      console.error(e);
      showToast("Gagal menghapus (cek Firestore Rules)");
    } finally {
      setLoading(false);
    }
  });

  /* =========================
     EDIT / DELETE GLOBAL
  ========================== */
  window.__desaEditItem = function (id) {
    if (!isAdminMode()) return showToast("Khusus Admin");
    const item = CONTENTS.find((x) => x.id === id);
    if (!item) return showToast("Data tidak ditemukan");

    editingId = id;
    deletingId = null;

    if (modalTitle) modalTitle.textContent = "Edit Konten";
    if (typeSel) {
      typeSel.value = item.type || "berita";
      typeSel.disabled = true;
    }

    if (titleInp) titleInp.value = item.title || "";
    if (bodyInp) bodyInp.value = item.content || "";
    if (dateInp) dateInp.value = item.published_date || todayISO();

    if (profilSectionSel) profilSectionSel.value = item.profil_section || "sejarah";
    if (statistikTabSel) statistikTabSel.value = item.statistik_tab || "demografi";
    if (potensiKindSel) potensiKindSel.value = item.potensi_kind || "umkm";

    // isi image links
    const imgs = Array.isArray(item.images) ? item.images : [];
    setImageLinksToModal(imgs);
    ensureAtLeastOneImageRow();
    refreshImageLinksPreview();

    openModal(contentModal);
  };

  window.__desaDeleteItem = function (id) {
    if (!isAdminMode()) return showToast("Khusus Admin");
    deletingId = id;
    openModal(deleteModal);
  };

  function adminActionsHtml(id) {
    if (!isAdminMode()) return "";
    return `
      <div class="flex gap-2 mt-4 pt-4 border-t border-gray-100">
        <button class="flex-1 px-3 py-2 bg-emerald-100 text-emerald-700 rounded-lg text-sm font-medium hover:bg-emerald-200 transition-all"
          onclick="__desaEditItem('${escapeHtmlAttr(id)}')">✏️ Edit</button>
        <button class="flex-1 px-3 py-2 bg-red-100 text-red-700 rounded-lg text-sm font-medium hover:bg-red-200 transition-all"
          onclick="__desaDeleteItem('${escapeHtmlAttr(id)}')">🗑️ Hapus</button>
      </div>
    `;
  }

  /* =========================
     RENDER: MULTI IMAGE
  ========================== */
  function getImages(item) {
    const arr = Array.isArray(item.images) ? item.images : [];
    const cleaned = arr.map(normalizeImageUrl).filter(Boolean);

    // kompatibilitas lama: image_url
    if (cleaned.length === 0 && item.image_url) {
      const one = normalizeImageUrl(item.image_url);
      if (one) return [one];
    }
    return cleaned;
  }

  function multiImageHtml(images, ratioClass = "h-44") {
    if (!images || images.length === 0) {
      return `
        <div class="${ratioClass} bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
          <div class="text-6xl">🖼️</div>
        </div>
      `;
    }

    if (images.length === 1) {
      return `
        <div class="${ratioClass} bg-gray-100 overflow-hidden">
          <img src="${escapeHtmlAttr(images[0])}" class="w-full h-full object-cover" alt="Gambar" loading="lazy">
        </div>
      `;
    }

    const sliderId = uid("slider");
    const dots = images.map((_, i) => `
      <button type="button"
        data-dot="${i}"
        class="w-2 h-2 rounded-full bg-white/60 hover:bg-white transition"
        aria-label="Gambar ${i + 1}">
      </button>
    `).join("");

    const slides = images.map((u, i) => `
      <div class="min-w-full ${ratioClass} bg-gray-100 overflow-hidden" data-slide="${i}">
        <img src="${escapeHtmlAttr(u)}" class="w-full h-full object-cover" alt="Gambar ${i + 1}" loading="lazy">
      </div>
    `).join("");

    return `
      <div class="relative overflow-hidden rounded-2xl">
        <div id="${escapeHtmlAttr(sliderId)}"
          class="flex transition-transform duration-300"
          data-slider="1"
          data-index="0">
          ${slides}
        </div>

        <button type="button"
          class="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/35 text-white hover:bg-black/50"
          data-prev="${escapeHtmlAttr(sliderId)}">‹</button>

        <button type="button"
          class="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/35 text-white hover:bg-black/50"
          data-next="${escapeHtmlAttr(sliderId)}">›</button>

        <div class="absolute bottom-2 left-0 right-0 flex justify-center gap-2" data-dots="${escapeHtmlAttr(sliderId)}">
          ${dots}
        </div>
      </div>
    `;
  }

  function bindAllSliders(root = document) {
    // prev
    root.querySelectorAll("[data-prev]").forEach((btn) => {
      if (btn.dataset.bound === "1") return;
      btn.dataset.bound = "1";
      on(btn, "click", () => {
        const id = btn.getAttribute("data-prev");
        const slider = document.getElementById(id);
        if (!slider) return;
        const max = slider.children.length - 1;
        const idx = parseInt(slider.getAttribute("data-index") || "0", 10);
        const next = idx <= 0 ? max : idx - 1;
        setSliderIndex(slider, next);
      });
    });

    // next
    root.querySelectorAll("[data-next]").forEach((btn) => {
      if (btn.dataset.bound === "1") return;
      btn.dataset.bound = "1";
      on(btn, "click", () => {
        const id = btn.getAttribute("data-next");
        const slider = document.getElementById(id);
        if (!slider) return;
        const max = slider.children.length - 1;
        const idx = parseInt(slider.getAttribute("data-index") || "0", 10);
        const next = idx >= max ? 0 : idx + 1;
        setSliderIndex(slider, next);
      });
    });

    // dots
    root.querySelectorAll("[data-dots]").forEach((dotsWrap) => {
      if (dotsWrap.dataset.bound === "1") return;
      dotsWrap.dataset.bound = "1";
      on(dotsWrap, "click", (e) => {
        const dot = e.target?.closest?.("[data-dot]");
        if (!dot) return;
        const sliderId = dotsWrap.getAttribute("data-dots");
        const slider = document.getElementById(sliderId);
        if (!slider) return;
        const i = parseInt(dot.getAttribute("data-dot") || "0", 10);
        setSliderIndex(slider, i);
      });
    });

    // init dots
    root.querySelectorAll('[data-slider="1"]').forEach((slider) => {
      updateDots(slider);
    });
  }

  function setSliderIndex(slider, index) {
    const max = slider.children.length - 1;
    const i = clamp(index, 0, max);
    slider.setAttribute("data-index", String(i));
    slider.style.transform = `translateX(-${i * 100}%)`;
    updateDots(slider);
  }

  function updateDots(slider) {
    const id = slider.id;
    if (!id) return;
    const idx = parseInt(slider.getAttribute("data-index") || "0", 10);
    const dotsWrap = document.querySelector(`[data-dots="${CSS.escape(id)}"]`);
    if (!dotsWrap) return;

    dotsWrap.querySelectorAll("[data-dot]").forEach((d) => {
      const i = parseInt(d.getAttribute("data-dot") || "0", 10);
      d.classList.toggle("bg-white", i === idx);
      d.classList.toggle("bg-white/60", i !== idx);
    });
  }

  /* =========================
     RENDER SECTIONS
  ========================== */
  function renderBerita() {
    const container = $("berita-container");
    if (!container) return;

    const items = CONTENTS.filter((x) => x.type === "berita");
    if (items.length === 0) {
      container.innerHTML = `
        <div class="text-center py-12 text-gray-400 col-span-full">
          <div class="text-5xl mb-3">📰</div>
          <p>Belum ada berita. ${isAdminMode() ? 'Klik "Tambah Konten" untuk menambahkan berita.' : ""}</p>
        </div>`;
      return;
    }

    container.innerHTML = items.map((it, i) => {
      const imgs = getImages(it);
      const top = multiImageHtml(imgs, "h-44");

      return `
        <article class="bg-white rounded-2xl overflow-hidden shadow-lg card-hover animate-fade-in" style="animation-delay:${i * 0.05}s">
          ${top}
          <div class="p-5">
            <p class="text-xs text-emerald-600 font-medium mb-2">📅 ${escapeHtml(fmtDateID(it.published_date || it.created_at_str || ""))}</p>
            <h3 class="font-heading font-bold text-gray-800 mb-2 line-clamp-2">${escapeHtml(it.title || "Tanpa Judul")}</h3>
            <p class="text-gray-600 text-sm line-clamp-3">${escapeHtml(it.content || "")}</p>
            ${adminActionsHtml(it.id)}
          </div>
        </article>
      `;
    }).join("");

    bindAllSliders(container);
  }

  function renderPengumuman() {
    const container = $("pengumuman-container");
    if (!container) return;

    const items = CONTENTS.filter((x) => x.type === "pengumuman");
    if (items.length === 0) {
      container.innerHTML = `
        <div class="text-center py-12 text-gray-400">
          <div class="text-5xl mb-3">📢</div>
          <p>Belum ada pengumuman. ${isAdminMode() ? 'Klik "Tambah Konten" untuk menambahkan pengumuman.' : ""}</p>
        </div>`;
      return;
    }

    container.innerHTML = items.map((it, i) => {
      const imgs = getImages(it);
      const thumb = imgs[0]
        ? `<img src="${escapeHtmlAttr(imgs[0])}" class="w-full h-full object-cover" alt="Gambar pengumuman" loading="lazy">`
        : `📢`;

      return `
        <div class="bg-white rounded-2xl p-5 shadow-lg card-hover animate-fade-in" style="animation-delay:${i * 0.05}s">
          <div class="flex items-start gap-4">
            <div class="w-14 h-14 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-3xl overflow-hidden">
              ${thumb}
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-xs text-amber-700 font-medium mb-1">📅 ${escapeHtml(fmtDateID(it.published_date || it.created_at_str || ""))}</p>
              <h3 class="font-heading font-bold text-gray-800 mb-1">${escapeHtml(it.title || "Tanpa Judul")}</h3>
              <p class="text-gray-600 text-sm">${escapeHtml(it.content || "")}</p>

              ${imgs.length > 1 ? `<div class="mt-3">${multiImageHtml(imgs, "h-40")}</div>` : ""}

              ${adminActionsHtml(it.id)}
            </div>
          </div>
        </div>
      `;
    }).join("");

    bindAllSliders(container);
  }

  function renderAgenda() {
    const container = $("agenda-container");
    if (!container) return;

    const items = CONTENTS.filter((x) => x.type === "agenda");
    if (items.length === 0) {
      container.innerHTML = `
        <div class="text-center py-12 text-gray-400">
          <div class="text-5xl mb-3">📅</div>
          <p>Belum ada agenda. ${isAdminMode() ? 'Klik "Tambah Konten" untuk menambahkan agenda.' : ""}</p>
        </div>`;
      return;
    }

    container.innerHTML = items.map((it, i) => {
      const imgs = getImages(it);
      const left = imgs[0]
        ? `<img src="${escapeHtmlAttr(imgs[0])}" alt="Gambar agenda" class="w-full h-full object-cover" loading="lazy">`
        : `📅`;

      return `
        <div class="bg-white rounded-2xl p-5 shadow-lg flex items-start gap-4 card-hover animate-fade-in" style="animation-delay:${i * 0.05}s">
          <div class="w-14 h-14 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center overflow-hidden ${imgs[0] ? "" : "text-3xl"}">
            ${left}
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-xs text-emerald-600 font-medium mb-1">📅 ${escapeHtml(fmtDateID(it.published_date || it.created_at_str || ""))}</p>
            <h3 class="font-heading font-bold text-gray-800 mb-1">${escapeHtml(it.title || "Tanpa Judul")}</h3>
            <p class="text-gray-600 text-sm">${escapeHtml(it.content || "")}</p>

            ${imgs.length > 1 ? `<div class="mt-3">${multiImageHtml(imgs, "h-44")}</div>` : ""}

            ${adminActionsHtml(it.id)}
          </div>
        </div>
      `;
    }).join("");

    bindAllSliders(container);
  }

  function profilSectionTitle(key) {
    const map = {
      "visi-misi": "Visi & Misi",
      "sejarah": "Sejarah Desa",
      "geografis": "Geografis & Lokasi",
      "pemerintahan": "Pemerintahan",
      "struktur": "Struktur Organisasi",
      "demografi": "Demografi",
      "potensi": "Potensi Desa",
    };
    return map[key] || "Profil Desa";
  }
  function profilIcon(key) {
    const map = {
      "visi-misi": "🎯",
      "sejarah": "📜",
      "geografis": "🗺️",
      "pemerintahan": "🏛️",
      "struktur": "🧭",
      "demografi": "👥",
      "potensi": "🌟",
    };
    return map[key] || "📋";
  }

  function renderProfil() {
    const container = $("profil-container");
    if (!container) return;

    const items = CONTENTS.filter((x) => x.type === "profil");
    if (items.length === 0) {
      container.innerHTML = `
        <div class="text-center py-12 text-gray-400">
          <div class="text-5xl mb-3">📋</div>
          <p>Belum ada konten profil tambahan. ${isAdminMode() ? 'Klik "Tambah Konten" untuk menambahkan profil.' : ""}</p>
        </div>`;
      return;
    }

    container.innerHTML = items.map((it, i) => {
      const imgs = getImages(it);
      const media = imgs.length
        ? `<div class="mt-4">${multiImageHtml(imgs, "h-56")}</div>`
        : "";

      return `
        <div class="bg-white rounded-2xl p-6 shadow-lg card-hover animate-fade-in" style="animation-delay:${i * 0.05}s">
          <div class="flex items-start gap-4 mb-3">
            <div class="w-14 h-14 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center text-3xl flex-shrink-0">
              ${profilIcon(it.profil_section)}
            </div>
            <div class="flex-1">
              <h3 class="font-heading text-xl font-bold text-gray-800 mb-1">${escapeHtml(profilSectionTitle(it.profil_section))}</h3>
              <h4 class="font-medium text-gray-700">${escapeHtml(it.title || "")}</h4>
            </div>
          </div>
          <p class="text-gray-600 leading-relaxed">${escapeHtml(it.content || "")}</p>
          ${media}
          ${adminActionsHtml(it.id)}
        </div>
      `;
    }).join("");

    bindAllSliders(container);
  }

  function renderStatistik(tab = null) {
    const container = $("statistik-container");
    if (!container) return;

    const items = CONTENTS.filter((x) => x.type === "statistik");
    const currentTab = tab || getCurrentStatTab();
    const filtered = items.filter((x) => (x.statistik_tab || "demografi") === currentTab);

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="p-6 rounded-2xl bg-white shadow-lg border border-gray-100">
          <div class="flex items-center justify-between gap-3 mb-2">
            <p class="font-semibold text-gray-800">📊 Statistik: ${escapeHtml(currentTab)}</p>
            ${isAdminMode() ? `<button class="px-3 py-2 rounded-xl bg-emerald-600 text-white text-sm hover:bg-emerald-700"
              onclick="document.getElementById('add-content-btn')?.click()">+ Tambah</button>` : ""}
          </div>
          <p class="text-gray-500 text-sm">Belum ada data statistik untuk tab ini.</p>
        </div>`;
      return;
    }

    container.innerHTML = `
      <div class="grid md:grid-cols-2 gap-4">
        ${filtered.map((it) => {
          const imgs = getImages(it);
          const media = imgs.length ? `<div class="mt-3">${multiImageHtml(imgs, "h-40")}</div>` : "";
          return `
            <div class="bg-white rounded-2xl p-5 shadow-lg border border-gray-100 card-hover">
              <h3 class="font-heading font-bold text-gray-800 mb-2">${escapeHtml(it.title || "Tanpa Judul")}</h3>
              <p class="text-gray-600 text-sm leading-relaxed">${escapeHtml(it.content || "")}</p>
              ${media}
              ${adminActionsHtml(it.id)}
            </div>
          `;
        }).join("")}
      </div>
    `;

    bindAllSliders(container);
  }

  function renderPotensi(kind = null) {
    const container = $("potensi-container");
    if (!container) return;

    const items = CONTENTS.filter((x) => x.type === "potensi");
    const currentKind = kind || getCurrentPotTab();
    const filtered = items.filter((x) => (x.potensi_kind || "umkm") === currentKind);

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="text-center py-12 text-gray-400 col-span-full">
          <div class="text-5xl mb-3">🌟</div>
          <p>Belum ada konten <b>${escapeHtml(String(currentKind).toUpperCase())}</b>. ${isAdminMode() ? 'Klik "Tambah Konten" untuk menambahkan.' : ""}</p>
        </div>`;
      return;
    }

    container.innerHTML = filtered.map((it) => {
      const imgs = getImages(it);
      const media = imgs.length ? multiImageHtml(imgs, "h-44") : `
        <div class="h-44 bg-gray-100 flex items-center justify-center text-5xl rounded-2xl">🌟</div>
      `;

      return `
        <div class="pot-card bg-white rounded-2xl overflow-hidden shadow-lg card-hover">
          <div class="p-0">${media}</div>
          <div class="pot-body p-5">
            <div class="pot-title font-heading font-bold text-gray-800">${escapeHtml(it.title || "Tanpa Judul")}</div>
            <div class="pot-desc text-gray-600 text-sm mt-1">${escapeHtml(it.content || "")}</div>
            ${adminActionsHtml(it.id)}
          </div>
        </div>
      `;
    }).join("");

    bindAllSliders(container);
  }

  function renderGaleri() {
    const container = $("galeri-container");
    if (!container) return;

    const items = CONTENTS.filter((x) => x.type === "galeri");
    if (items.length === 0) {
      container.innerHTML = `
        <div class="text-center py-12 text-gray-400 col-span-full">
          <div class="text-5xl mb-3">📷</div>
          <p>Belum ada galeri. ${isAdminMode() ? 'Klik "Tambah Konten" untuk menambahkan galeri.' : ""}</p>
        </div>`;
      return;
    }

    container.innerHTML = items.map((it) => {
      const imgs = getImages(it);
      const thumb = imgs[0]
        ? `<img src="${escapeHtmlAttr(imgs[0])}" alt="Foto galeri" class="w-full h-full object-cover" loading="lazy">`
        : `<div class="w-full h-full flex items-center justify-center text-6xl bg-gradient-to-br from-emerald-400 to-teal-500">📷</div>`;

      return `
        <div class="bg-white rounded-2xl overflow-hidden shadow-lg card-hover group">
          <div class="aspect-square relative">
            ${thumb}
            ${isAdminMode() ? `
              <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center gap-2">
                <button class="p-2 bg-white text-emerald-700 rounded-lg hover:bg-emerald-100"
                  onclick="__desaEditItem('${escapeHtmlAttr(it.id)}')">✏️</button>
                <button class="p-2 bg-white text-red-700 rounded-lg hover:bg-red-100"
                  onclick="__desaDeleteItem('${escapeHtmlAttr(it.id)}')">🗑️</button>
              </div>
            ` : ""}
          </div>
          <div class="p-3">
            <h4 class="font-medium text-gray-800 text-sm truncate">${escapeHtml(it.title || "Tanpa Judul")}</h4>
            <p class="text-gray-500 text-xs truncate">${escapeHtml(it.content || "")}</p>
            ${imgs.length > 1 ? `<p class="text-xs text-emerald-700 mt-1">+${imgs.length - 1} foto</p>` : ""}
          </div>
        </div>
      `;
    }).join("");
  }

  /* =========================
     OPTIONAL: Update Terbaru di Beranda
     - kalau HTML kamu punya container id="home-latest-container"
  ========================== */
  function renderHomeLatest(limit = 6) {
    const wrap = $("home-latest-container");
    if (!wrap) return; // aman kalau belum ada

    const latest = CONTENTS
      .filter((x) => ["berita", "pengumuman", "agenda"].includes(x.type))
      .slice(0, limit);

    if (latest.length === 0) {
      wrap.innerHTML = `
        <div class="p-4 rounded-2xl bg-white shadow border border-gray-100 text-sm text-gray-600">
          Belum ada update terbaru.
        </div>`;
      return;
    }

    wrap.innerHTML = `
      <div class="grid md:grid-cols-3 gap-4">
        ${latest.map((it) => {
          const imgs = getImages(it);
          const media = imgs[0]
            ? `<div class="h-32 rounded-xl overflow-hidden bg-gray-100">
                 <img src="${escapeHtmlAttr(imgs[0])}" class="w-full h-full object-cover" alt="thumb" loading="lazy">
               </div>`
            : `<div class="h-32 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-4xl">✨</div>`;

          const badge = it.type === "berita" ? "📰 Berita" : it.type === "pengumuman" ? "📢 Pengumuman" : "📅 Agenda";

          return `
            <div class="bg-white rounded-2xl p-4 shadow border border-gray-100">
              ${media}
              <div class="mt-3 text-xs text-emerald-700 font-semibold">${badge}</div>
              <div class="mt-1 font-semibold text-gray-800 line-clamp-2">${escapeHtml(it.title || "")}</div>
              <div class="text-xs text-gray-500 mt-1">${escapeHtml(fmtDateID(it.published_date || it.created_at_str || ""))}</div>
              <div class="text-sm text-gray-600 mt-2 line-clamp-2">${escapeHtml(it.content || "")}</div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderAll() {
    renderBerita();
    renderPengumuman();
    renderAgenda();
    renderProfil();
    renderGaleri();
    renderStatistik();
    renderPotensi();
    renderHomeLatest(6);
  }

  // expose untuk BAGIAN 1 & 3
  window.__desaRenderAll = renderAll;
  window.__desaRenderStatistik = renderStatistik;
  window.__desaRenderPotensi = renderPotensi;

  /* =========================
     SNAPSHOT (REALTIME)
  ========================== */
  function normalizeDoc(d) {
    const data = d.data() || {};
    const createdISO = data.created_at?.toDate ? data.created_at.toDate().toISOString() : "";

    // normalisasi images (kalau field lama image_url ada)
    let images = Array.isArray(data.images) ? data.images : [];
    if ((!images || images.length === 0) && data.image_url) {
      images = [data.image_url];
    }

    return {
      id: d.id,
      ...data,
      images,
      created_at_str: createdISO
    };
  }

  function startContentsListener() {
    const q = query(contentsCol, orderBy("created_at", "desc"));
    if (CONTENTS_UNSUB) CONTENTS_UNSUB();

    CONTENTS_UNSUB = onSnapshot(q, (snap) => {
      CONTENTS = snap.docs.map(normalizeDoc);
      renderAll();
    }, (err) => {
      console.error("onSnapshot contents error:", err);
      showToast("Realtime konten gagal (cek Rules Firestore)");
    });
  }

  /* =========================
     BOOT BAGIAN 2
  ========================== */
  startContentsListener();
  renderAll();

})();
/* =========================================================
   WEBSITE DESA - app.js (FULL) - BAGIAN 3/3
   Fokus BAGIAN 3:
   ✅ SETTINGS -> Firestore (site/settings) [LINK SAJA]
   ✅ Semua profil/visi-misi/logo/foto kades dll di Pengaturan (mudah)
   ✅ PERANGKAT -> settings.perangkat (photo pakai URL, bukan upload)
   ✅ APBDes -> Firestore (apbdes/{year})
   ✅ Render APBDes publik + Manager Admin (realtime)
   ✅ Tanpa Firebase Storage sama sekali
   ✅ NEW: Setelah simpan settings -> auto masuk Beranda
   ========================================================= */

(() => {
  "use strict";

  const H = window.__DESA__ || {};
  const $ = (id) => document.getElementById(id);
  const qs = (sel) => document.querySelector(sel);
  const qsa = (sel) => Array.from(document.querySelectorAll(sel));
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

  // Firebase
  const db = H.db;

  const {
    doc, setDoc, getDoc,
    collection, onSnapshot, query, orderBy,
    serverTimestamp
  } = (H.fs || {});

  // Utils
  const uid = H.uid || ((p="id") => `${p}_${Date.now()}_${Math.random().toString(16).slice(2)}`);
  const escapeHtml = H.escapeHtml || ((s) => String(s ?? ""));
  const escapeHtmlAttr = H.escapeHtmlAttr || ((s) => String(s ?? ""));
  const openModal = H.openModal || ((m) => m && m.classList.remove("hidden"));
  const closeModal = H.closeModal || ((m) => m && m.classList.add("hidden"));
  const showToast = window.showToast || ((m) => alert(m));
  const setLoading = window.setLoading || (() => {});
  const clamp = H.clamp || ((n, min, max) => Math.min(max, Math.max(min, n)));
  const toNumber = H.toNumber || ((v) => parseInt(String(v || "").replace(/[^\d]/g, ""), 10) || 0);

  const normalizeImageUrl = H.normalizeImageUrl || ((u) => {
    const s = String(u || "").trim();
    if (!s) return "";
    if (!/^https?:\/\//i.test(s)) return "";
    return s;
  });

  function toFloat(v) {
    const s = String(v ?? "").replace(",", ".").replace(/[^\d.]/g, "");
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  }

  function formatRupiah(value) {
    const num = typeof value === "number"
      ? value
      : parseInt(String(value || "").replace(/[^\d]/g, ""), 10) || 0;
    return "Rp " + num.toLocaleString("id-ID");
  }

  function isAdminMode() {
    return typeof H.isAdminMode === "function" ? !!H.isAdminMode() : false;
  }

  function safeSetText(id, text) {
    const el = $(id);
    if (!el) return;
    el.textContent = text ?? "";
  }

  function safeSetSrc(id, src) {
    const el = $(id);
    if (!el) return;
    // boleh URL atau relative lokal (./assets/...)
    const u = normalizeImageUrl(src) || src;
    if (!u) return;
    el.src = u;
  }

  // Guard
  if (!db || !doc || !getDoc || !setDoc || !collection || !onSnapshot) {
    console.warn("BAGIAN 3 tidak jalan: Firebase belum siap. Pastikan BAGIAN 1 & firebase.js benar.");
    return;
  }

  /* =========================
     NAV BRIDGE (AUTO KE BERANDA)
  ========================== */
  function goToBeranda() {
    const btn = document.querySelector('.nav-btn[data-section="beranda"]');
    if (btn) {
      btn.click();
      return;
    }
    qsa('[id^="section-"]').forEach((sec) => sec.classList.add("hidden"));
    const target = $("section-beranda");
    if (target) target.classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* =========================
     PATHS (FIRESTORE)
  ========================== */
  const SETTINGS_DOC = doc(db, "site", "settings"); // site/settings
  const APBDES_COL = collection(db, "apbdes");      // apbdes/{year}

  /* =========================
     SETTINGS (CACHE + APPLY UI)
  ========================== */
  let SETTINGS = null;
  let APBDES = {};
  let APBDES_UNSUB = null;

  function renderPerangkatPublic(perangkat) {
    const wrap = $("perangkat-list");
    const wrap2 = $("struktur-container");
    const arr = Array.isArray(perangkat) ? perangkat : [];

    const cardPublic = (p) => {
      const photo = p.photo || "./assets/kades.jpg";
      return `
        <div class="flex items-center gap-3 bg-white/15 rounded-xl p-3 border border-white/15">
          <div class="w-12 h-12 bg-white/15 rounded-xl overflow-hidden border border-white/20">
            <img src="${escapeHtmlAttr(photo)}" alt="Foto ${escapeHtmlAttr(p.role || "Perangkat")}"
              class="w-full h-full object-cover" loading="lazy">
          </div>
          <div class="min-w-0">
            <p class="font-medium truncate">${escapeHtml(p.name || "Nama")}</p>
            <p class="text-emerald-100 text-sm truncate">${escapeHtml(p.role || "Jabatan")}</p>
          </div>
        </div>
      `;
    };

    const cardStruktur = (p) => {
      const photo = p.photo || "./assets/kades.jpg";
      return `
        <div class="bg-white rounded-2xl p-5 shadow-lg border border-gray-100 card-hover">
          <div class="flex items-center gap-4">
            <div class="w-14 h-14 rounded-xl overflow-hidden bg-gray-100 border border-gray-200">
              <img src="${escapeHtmlAttr(photo)}" alt="Foto ${escapeHtmlAttr(p.role || "Perangkat")}"
                class="w-full h-full object-cover" loading="lazy">
            </div>
            <div class="min-w-0">
              <p class="font-semibold text-gray-800 truncate">${escapeHtml(p.name || "Nama")}</p>
              <p class="text-sm text-gray-500 truncate">${escapeHtml(p.role || "Jabatan")}</p>
            </div>
          </div>
        </div>
      `;
    };

    if (wrap) {
      wrap.innerHTML = arr.length === 0
        ? `<div class="p-3 rounded-xl bg-white/10 border border-white/15 text-emerald-100 text-sm">Belum ada data perangkat.</div>`
        : arr.map(cardPublic).join("");
    }

    if (wrap2) {
      wrap2.innerHTML = arr.length === 0
        ? `<div class="bg-white rounded-2xl p-5 shadow-lg border border-gray-100"><p class="text-gray-500 text-sm">Belum ada data struktur pemerintahan.</p></div>`
        : arr.map(cardStruktur).join("");
    }
  }

  function applySettingsToUI(s) {
    if (!s) return;

    safeSetText("village-name", s.villageName || "Website Desa");
    safeSetText("welcome-text", s.welcomeText || "");
    safeSetText("footer-text", s.footerText || "");

    safeSetSrc("desa-logo", s.logoSrc);
    safeSetSrc("desa-banner", s.bannerSrc);

    safeSetSrc("foto-kades", s.kadesPhoto);
    safeSetText("nama-kades", s.kadesName || "");
    safeSetText("periode-kades", s.kadesPeriod || "");

    safeSetText("visi-display", s.visi || "");
    safeSetText("misi-display", s.misi || "");

    safeSetText("desa-alamat", s.alamat || "");
    safeSetText("desa-telepon", s.telepon || "");
    safeSetText("desa-email", s.email || "");
    safeSetText("desa-jam", s.jam || "");

    const map = $("desa-map");
    if (map && s.mapSrc) map.src = s.mapSrc;

    safeSetText("stat-penduduk", String(s.statPenduduk ?? 0));
    safeSetText("stat-rtrw", String(s.statRtrw ?? 0));
    safeSetText("stat-hektar", String(s.statHektar ?? 0));
    safeSetText("stat-program", String(s.statProgram ?? 0));

    renderPerangkatPublic(s.perangkat || []);
  }

  async function loadSettingsOnce() {
    try {
      const snap = await getDoc(SETTINGS_DOC);
      if (snap.exists()) {
        SETTINGS = snap.data();
        applySettingsToUI(SETTINGS);
      }
    } catch (e) {
      console.error("loadSettings error:", e);
    }
  }

  function startSettingsListener() {
    onSnapshot(SETTINGS_DOC, (snap) => {
      if (!snap.exists()) return;
      SETTINGS = snap.data();
      applySettingsToUI(SETTINGS);

      // sync placeholder BAGIAN 1 (kalau ada)
      if (typeof H.applySettingsToUI === "function") H.applySettingsToUI();
    }, (err) => {
      console.error("onSnapshot settings error:", err);
    });
  }

  /* =========================
     SETTINGS MODAL (ADMIN) - LINK SAJA
     Required HTML IDs:
     - settings-modal, open-settings-btn, settings-close, settings-save
     - set-village-name, set-welcome-text, set-footer-text
     - set-visi, set-misi
     - set-alamat, set-telepon, set-email, set-jam
     - set-map-src, set-map-preview
     - set-logo-url, set-banner-url, set-kades-url
     - set-logo-preview, set-banner-preview, set-kades-preview
     - set-kades-name, set-kades-period
     - set-stat-penduduk, set-stat-rtrw, set-stat-hektar, set-stat-program
     - set-perangkat-wrap, add-perangkat-btn
  ========================== */
  function perangkatRowHtml(p) {
    const photo = p.photo || "";
    return `
      <div class="p-4 rounded-2xl border border-gray-200 bg-white shadow-sm" data-pid="${escapeHtmlAttr(p.id)}">
        <div class="flex items-start gap-4">
          <div class="w-14 h-14 rounded-xl overflow-hidden bg-gray-100 border border-gray-200 flex-shrink-0">
            ${photo
              ? `<img src="${escapeHtmlAttr(photo)}" class="w-full h-full object-cover" alt="foto perangkat" loading="lazy">`
              : `<div class="w-full h-full flex items-center justify-center text-2xl">👤</div>`}
          </div>

          <div class="flex-1 min-w-0">
            <div class="grid md:grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-semibold text-gray-600 mb-1">Nama</label>
                <input data-field="name" value="${escapeHtmlAttr(p.name || "")}"
                  class="w-full px-3 py-2 border border-gray-300 rounded-xl" placeholder="Nama perangkat">
              </div>

              <div>
                <label class="block text-xs font-semibold text-gray-600 mb-1">Jabatan</label>
                <input data-field="role" value="${escapeHtmlAttr(p.role || "")}"
                  class="w-full px-3 py-2 border border-gray-300 rounded-xl" placeholder="Jabatan">
              </div>

              <div class="md:col-span-2">
                <label class="block text-xs font-semibold text-gray-600 mb-1">Link Foto (URL)</label>
                <input data-field="photoUrl" value="${escapeHtmlAttr(p.photo || "")}"
                  class="w-full px-3 py-2 border border-gray-300 rounded-xl" placeholder="https://.../foto.jpg">
                <p class="text-[11px] text-gray-500 mt-1">
                  Tips: pakai link langsung gambar (.jpg/.png) atau link public (CDN/Firebase Storage public).
                </p>
              </div>
            </div>

            <div class="flex gap-2 mt-4">
              <button class="px-4 py-2 rounded-xl bg-red-100 text-red-700 font-medium hover:bg-red-200"
                data-action="remove-perangkat">🗑️ Hapus</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderPerangkatAdminList(perangkat) {
    const wrap = $("set-perangkat-wrap");
    if (!wrap) return;

    const arr = Array.isArray(perangkat) ? perangkat : [];
    wrap.innerHTML = arr.length === 0
      ? `<div class="p-3 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-600">
           Belum ada perangkat. Klik <b>Tambah Perangkat</b>.
         </div>`
      : arr.map(perangkatRowHtml).join("");
  }

  function fillSettingsFormFromCache() {
    const s = SETTINGS || {};

    if ($("set-village-name")) $("set-village-name").value = s.villageName || "";
    if ($("set-welcome-text")) $("set-welcome-text").value = s.welcomeText || "";
    if ($("set-footer-text")) $("set-footer-text").value = s.footerText || "";

    if ($("set-visi")) $("set-visi").value = s.visi || "";
    if ($("set-misi")) $("set-misi").value = s.misi || "";

    if ($("set-alamat")) $("set-alamat").value = s.alamat || "";
    if ($("set-telepon")) $("set-telepon").value = s.telepon || "";
    if ($("set-email")) $("set-email").value = s.email || "";
    if ($("set-jam")) $("set-jam").value = s.jam || "";

    if ($("set-map-src")) $("set-map-src").value = s.mapSrc || "";
    if ($("set-map-preview") && s.mapSrc) $("set-map-preview").src = s.mapSrc;

    if ($("set-logo-url")) $("set-logo-url").value = s.logoSrc || "";
    if ($("set-banner-url")) $("set-banner-url").value = s.bannerSrc || "";
    if ($("set-kades-url")) $("set-kades-url").value = s.kadesPhoto || "";

    if ($("set-logo-preview") && s.logoSrc) $("set-logo-preview").src = s.logoSrc;
    if ($("set-banner-preview") && s.bannerSrc) $("set-banner-preview").src = s.bannerSrc;
    if ($("set-kades-preview") && s.kadesPhoto) $("set-kades-preview").src = s.kadesPhoto;

    if ($("set-kades-name")) $("set-kades-name").value = s.kadesName || "";
    if ($("set-kades-period")) $("set-kades-period").value = s.kadesPeriod || "";

    if ($("set-stat-penduduk")) $("set-stat-penduduk").value = s.statPenduduk ?? "";
    if ($("set-stat-rtrw")) $("set-stat-rtrw").value = s.statRtrw ?? "";
    if ($("set-stat-hektar")) $("set-stat-hektar").value = s.statHektar ?? "";
    if ($("set-stat-program")) $("set-stat-program").value = s.statProgram ?? "";

    renderPerangkatAdminList(s.perangkat || []);
  }

  function initSettingsModalFirestore_LinkOnly() {
    const settingsModal = $("settings-modal");
    const btnOpen = $("open-settings-btn");
    const btnSave = $("settings-save");
    const wrap = $("set-perangkat-wrap");
    const btnAddPerangkat = $("add-perangkat-btn");

    if (!btnSave || btnSave.dataset.boundFirestore === "1") return;
    btnSave.dataset.boundFirestore = "1";

    on(btnOpen, "click", async () => {
      if (!isAdminMode()) return showToast("Khusus Admin");
      await loadSettingsOnce();
      fillSettingsFormFromCache();
      openModal(settingsModal);
    });

    on($("settings-close"), "click", () => closeModal(settingsModal));
    on(settingsModal, "click", (e) => {
      if (e.target === settingsModal) closeModal(settingsModal);
    });

    // preview map
    on($("set-map-src"), "input", (e) => {
      const v = (e.target.value || "").trim();
      if ($("set-map-preview") && v) $("set-map-preview").src = v;
    });

    // preview logo/banner/kades via URL
    const bindPreview = (inputId, imgId) => {
      const inp = $(inputId);
      const img = $(imgId);
      on(inp, "input", (e) => {
        const v = (e.target.value || "").trim();
        if (img && v) img.src = v;
      });
    };
    bindPreview("set-logo-url", "set-logo-preview");
    bindPreview("set-banner-url", "set-banner-preview");
    bindPreview("set-kades-url", "set-kades-preview");

    // tambah perangkat
    on(btnAddPerangkat, "click", () => {
      if (!isAdminMode()) return showToast("Khusus Admin");
      SETTINGS = SETTINGS || {};
      SETTINGS.perangkat = Array.isArray(SETTINGS.perangkat) ? SETTINGS.perangkat : [];
      SETTINGS.perangkat.push({ id: uid("p"), name: "", role: "", photo: "" });
      renderPerangkatAdminList(SETTINGS.perangkat);
      showToast("Perangkat ditambahkan (jangan lupa SIMPAN)");
    });

    // edit perangkat text + photo URL
    on(wrap, "input", (e) => {
      const card = e.target?.closest?.("[data-pid]");
      if (!card) return;
      const pid = card.getAttribute("data-pid");
      if (!pid) return;

      SETTINGS = SETTINGS || {};
      SETTINGS.perangkat = Array.isArray(SETTINGS.perangkat) ? SETTINGS.perangkat : [];
      const idx = SETTINGS.perangkat.findIndex((x) => x.id === pid);
      if (idx === -1) return;

      const field = e.target?.dataset?.field;
      if (field === "name") SETTINGS.perangkat[idx].name = e.target.value;
      if (field === "role") SETTINGS.perangkat[idx].role = e.target.value;
      if (field === "photoUrl") SETTINGS.perangkat[idx].photo = normalizeImageUrl(e.target.value) || e.target.value;

      // refresh list supaya thumbnail ikut berubah kalau URL diisi
      renderPerangkatAdminList(SETTINGS.perangkat);
    });

    // hapus perangkat
    on(wrap, "click", (e) => {
      const btn = e.target?.closest?.("[data-action]");
      if (!btn) return;
      const act = btn.dataset.action;
      const card = btn.closest("[data-pid]");
      const pid = card?.getAttribute("data-pid");
      if (act !== "remove-perangkat" || !pid) return;

      SETTINGS = SETTINGS || {};
      SETTINGS.perangkat = (SETTINGS.perangkat || []).filter((x) => x.id !== pid);
      renderPerangkatAdminList(SETTINGS.perangkat);
      showToast("Perangkat dihapus (jangan lupa SIMPAN)");
    });

    // SAVE SETTINGS
    on(btnSave, "click", async () => {
      if (!isAdminMode()) return showToast("Khusus Admin");

      setLoading(true);
      try {
        SETTINGS = SETTINGS || {};

        SETTINGS.villageName = ($("set-village-name")?.value || "").trim() || SETTINGS.villageName || "";
        SETTINGS.welcomeText = ($("set-welcome-text")?.value || "").trim() || SETTINGS.welcomeText || "";
        SETTINGS.footerText = ($("set-footer-text")?.value || "").trim() || SETTINGS.footerText || "";

        SETTINGS.visi = ($("set-visi")?.value || "").trim() || SETTINGS.visi || "";
        SETTINGS.misi = ($("set-misi")?.value || "").trim() || SETTINGS.misi || "";

        SETTINGS.alamat = ($("set-alamat")?.value || "").trim() || SETTINGS.alamat || "";
        SETTINGS.telepon = ($("set-telepon")?.value || "").trim() || SETTINGS.telepon || "";
        SETTINGS.email = ($("set-email")?.value || "").trim() || SETTINGS.email || "";
        SETTINGS.jam = ($("set-jam")?.value || "").trim() || SETTINGS.jam || "";

        const mapSrc = ($("set-map-src")?.value || "").trim();
        if (mapSrc) SETTINGS.mapSrc = mapSrc;

        SETTINGS.logoSrc = ($("set-logo-url")?.value || "").trim() || SETTINGS.logoSrc || "";
        SETTINGS.bannerSrc = ($("set-banner-url")?.value || "").trim() || SETTINGS.bannerSrc || "";
        SETTINGS.kadesPhoto = ($("set-kades-url")?.value || "").trim() || SETTINGS.kadesPhoto || "";

        SETTINGS.kadesName = ($("set-kades-name")?.value || "").trim() || SETTINGS.kadesName || "";
        SETTINGS.kadesPeriod = ($("set-kades-period")?.value || "").trim() || SETTINGS.kadesPeriod || "";

        SETTINGS.statPenduduk = toNumber($("set-stat-penduduk")?.value || 0);
        SETTINGS.statRtrw = toNumber($("set-stat-rtrw")?.value || 0);
        SETTINGS.statHektar = toNumber($("set-stat-hektar")?.value || 0);
        SETTINGS.statProgram = toNumber($("set-stat-program")?.value || 0);

        // perangkat sudah ada di SETTINGS.perangkat
        SETTINGS.perangkat = Array.isArray(SETTINGS.perangkat) ? SETTINGS.perangkat : [];
        SETTINGS.updated_at = serverTimestamp();

        await setDoc(SETTINGS_DOC, SETTINGS, { merge: true });

        applySettingsToUI(SETTINGS);
        closeModal(settingsModal);
        showToast("Pengaturan tersimpan ke Firestore ✅");

        // ✅ AUTO KE BERANDA biar langsung terlihat
        goToBeranda();
      } catch (e) {
        console.error(e);
        showToast("Gagal simpan Settings (cek Rules Firestore/Auth)");
      } finally {
        setLoading(false);
      }
    });
  }

  /* =========================
     APBDes (FIRESTORE)
     Doc: apbdes/{year}
  ========================== */
  function defaultSectorsTemplate() {
    return [
      { id: uid("sec"), name: "Pendidikan", percentage: 20, subs: [] },
      { id: uid("sec"), name: "Kesehatan", percentage: 15, subs: [] },
      { id: uid("sec"), name: "Infrastruktur & Pekerjaan Umum", percentage: 25, subs: [] },
      { id: uid("sec"), name: "Belanja Pegawai", percentage: 30, subs: [] },
      { id: uid("sec"), name: "Pelayanan Publik & Sosial", percentage: 5, subs: [] },
      { id: uid("sec"), name: "Ekonomi & Pembangunan Desa", percentage: 3, subs: [] },
      { id: uid("sec"), name: "Operasional Pemerintahan", percentage: 2, subs: [] },
    ];
  }

  function getYearKey() {
    const y = $("apbdes-year")?.value || "";
    return String(y).trim();
  }

  function ensureApbdesYearLocal(year) {
    if (!APBDES[year]) {
      APBDES[year] = { year, total: 0, sectors: defaultSectorsTemplate() };
    }
    return APBDES[year];
  }

  function renderApbdesManagerSummary() {
    const box = $("apbdes-manager-summary");
    if (!box) return;

    const year = getYearKey();
    if (!year) return;

    const data = ensureApbdesYearLocal(year);
    const total = toNumber(data.total);

    const sumPct = (data.sectors || []).reduce((a, s) => a + (toFloat(s.percentage) || 0), 0);
    const sisaPct = Math.max(0, 100 - sumPct);

    box.innerHTML = `
      <div class="p-4 rounded-2xl bg-emerald-50 border border-emerald-200">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div class="text-sm font-semibold text-emerald-900">Ringkasan ${escapeHtml(year)}</div>
            <div class="text-xs text-emerald-700">Total: <b>${formatRupiah(total)}</b></div>
          </div>
          <div class="text-xs text-emerald-700">
            Total sektor: <b>${sumPct.toFixed(1)}%</b> • Sisa belum dibagi: <b>${sisaPct.toFixed(1)}%</b>
          </div>
        </div>
      </div>
    `;
  }

  function renderApbdesManager() {
    const wrap = $("apbdes-sectors-wrap");
    const year = getYearKey();
    if (!wrap || !year) return;

    const data = ensureApbdesYearLocal(year);

    if ($("apbdes-total")) $("apbdes-total").value = data.total ? String(data.total) : "";

    wrap.innerHTML = (data.sectors || []).map((sec) => `
      <div class="p-4 rounded-2xl border border-gray-200 bg-white shadow-sm" data-sec="${escapeHtmlAttr(sec.id)}">
        <div class="flex flex-col md:flex-row md:items-end gap-3">
          <div class="flex-1">
            <label class="block text-xs font-semibold text-gray-600 mb-1">Nama Sektor</label>
            <input class="w-full px-3 py-2 border border-gray-300 rounded-xl"
              data-field="sec-name" value="${escapeHtmlAttr(sec.name || "")}" placeholder="Contoh: Pendidikan">
          </div>
          <div class="w-full md:w-44">
            <label class="block text-xs font-semibold text-gray-600 mb-1">% dari Total</label>
            <input type="number" min="0" max="100" step="0.1"
              class="w-full px-3 py-2 border border-gray-300 rounded-xl"
              data-field="sec-pct" value="${escapeHtmlAttr(sec.percentage ?? 0)}">
          </div>
          <div class="flex gap-2">
            <button class="px-3 py-2 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-700"
              data-action="add-sub">+ Sub</button>
            <button class="px-3 py-2 rounded-xl bg-red-100 text-red-700 font-medium hover:bg-red-200"
              data-action="remove-sec">Hapus</button>
          </div>
        </div>

        <div class="mt-4">
          <div class="text-xs font-semibold text-gray-600 mb-2">Sub-kegiatan (% dari sektor)</div>
          <div class="space-y-3" data-subwrap>
            ${(sec.subs || []).map((sub) => `
              <div class="p-3 rounded-xl border border-gray-200 bg-gray-50" data-sub="${escapeHtmlAttr(sub.id)}">
                <div class="grid md:grid-cols-12 gap-3">
                  <div class="md:col-span-6">
                    <label class="block text-xs font-semibold text-gray-600 mb-1">Nama Sub</label>
                    <input class="w-full px-3 py-2 border border-gray-300 rounded-xl"
                      data-field="sub-name" value="${escapeHtmlAttr(sub.name || "")}" placeholder="Contoh: Bantuan sekolah">
                  </div>
                  <div class="md:col-span-3">
                    <label class="block text-xs font-semibold text-gray-600 mb-1">% dari sektor</label>
                    <input type="number" min="0" max="100" step="0.1"
                      class="w-full px-3 py-2 border border-gray-300 rounded-xl"
                      data-field="sub-pct" value="${escapeHtmlAttr(sub.percentage ?? 0)}">
                  </div>
                  <div class="md:col-span-3 flex items-end">
                    <button class="w-full px-3 py-2 rounded-xl bg-red-100 text-red-700 font-medium hover:bg-red-200"
                      data-action="remove-sub">Hapus Sub</button>
                  </div>
                  <div class="md:col-span-12">
                    <label class="block text-xs font-semibold text-gray-600 mb-1">Keterangan (opsional)</label>
                    <input class="w-full px-3 py-2 border border-gray-300 rounded-xl"
                      data-field="sub-note" value="${escapeHtmlAttr(sub.note || "")}" placeholder="Contoh: Program 2026">
                  </div>
                </div>
              </div>
            `).join("")}
          </div>
        </div>
      </div>
    `).join("");

    renderApbdesManagerSummary();
  }

  function syncApbdesFromManagerDOM() {
    const year = getYearKey();
    const wrap = $("apbdes-sectors-wrap");
    if (!year || !wrap) return;

    const data = ensureApbdesYearLocal(year);
    data.total = toNumber($("apbdes-total")?.value || 0);

    const sectors = [];
    qsa("#apbdes-sectors-wrap > [data-sec]").forEach((secEl) => {
      const sid = secEl.getAttribute("data-sec");
      const name = secEl.querySelector('[data-field="sec-name"]')?.value || "";
      const pct = clamp(toFloat(secEl.querySelector('[data-field="sec-pct"]')?.value || 0), 0, 100);

      const subs = [];
      secEl.querySelectorAll("[data-sub]").forEach((subEl) => {
        const subId = subEl.getAttribute("data-sub");
        const subName = subEl.querySelector('[data-field="sub-name"]')?.value || "";
        const subPct = clamp(toFloat(subEl.querySelector('[data-field="sub-pct"]')?.value || 0), 0, 100);
        const note = subEl.querySelector('[data-field="sub-note"]')?.value || "";
        subs.push({ id: subId || uid("sub"), name: subName, percentage: subPct, note });
      });

      sectors.push({ id: sid || uid("sec"), name, percentage: pct, subs });
    });

    data.sectors = sectors;
    APBDES[year] = data;
    renderApbdesManagerSummary();
  }

  async function saveApbdesYearToFirestore(year) {
    const data = APBDES[year];
    if (!data) return;
    const ref = doc(db, "apbdes", String(year));
    await setDoc(ref, {
      ...data,
      year: String(year),
      total: toNumber(data.total),
      updated_at: serverTimestamp()
    }, { merge: true });
  }

  function calcSectorAmounts(total, sectorPct, subs) {
    const sectorAmount = Math.round((total * sectorPct) / 100);
    const usedPct = (subs || []).reduce((a, s) => a + (toFloat(s.percentage) || 0), 0);
    const usedPctClamped = clamp(usedPct, 0, 100);
    const usedAmount = Math.round((sectorAmount * usedPctClamped) / 100);
    const remainingAmount = Math.max(0, sectorAmount - usedAmount);
    return { sectorAmount, usedPct: usedPctClamped, usedAmount, remainingAmount };
  }

  function renderApbdesPublic(filterYear = "all") {
    const container = $("apbdes-container");
    if (!container) return;

    const yearsAll = Object.keys(APBDES).sort((a, b) => Number(b) - Number(a));
    const years = filterYear === "all" ? yearsAll : yearsAll.filter((y) => y === filterYear);

    if (years.length === 0) {
      container.innerHTML = `
        <div class="text-center py-12 text-gray-400">
          <div class="text-5xl mb-3">💰</div>
          <p>Belum ada data APBDes. ${isAdminMode() ? 'Admin dapat mengisi lewat tombol "Kelola APBDes".' : ""}</p>
        </div>`;
      return;
    }

    container.innerHTML = years.map((y) => {
      const yearData = APBDES[y] || { total: 0, sectors: [] };
      const total = toNumber(yearData.total);

      const sectors = Array.isArray(yearData.sectors) ? yearData.sectors : [];
      const sumPct = sectors.reduce((a, s) => a + (toFloat(s.percentage) || 0), 0);
      const sisaPct = Math.max(0, 100 - sumPct);

      const sectorsHtml = sectors.map((sec) => {
        const secPct = clamp(toFloat(sec.percentage), 0, 100);
        const subs = Array.isArray(sec.subs) ? sec.subs : [];
        const calc = calcSectorAmounts(total, secPct, subs);
        const barWidth = clamp(secPct, 0, 100).toFixed(1);

        const subsHtml = subs.length === 0
          ? `<div class="text-sm text-gray-500">Belum ada sub-kegiatan.</div>`
          : subs.map((sub) => {
              const subPct = clamp(toFloat(sub.percentage), 0, 100);
              const subAmount = Math.round((calc.sectorAmount * subPct) / 100);
              return `
                <div class="apbdes-sub">
                  <div>
                    <div class="sub-name">• ${escapeHtml(sub.name || "Sub-kegiatan")}</div>
                    ${sub.note ? `<div class="sub-note">${escapeHtml(sub.note)}</div>` : ""}
                    <div class="sub-note">${subPct.toFixed(1)}% sektor • ${formatRupiah(subAmount)}</div>
                  </div>
                  <div class="sub-note text-right whitespace-nowrap">${formatRupiah(subAmount)}</div>
                </div>
              `;
            }).join("");

        return `
          <div class="apbdes-sector" data-apbdes-sector>
            <div class="sector-head">
              <div>
                <div class="sector-name">${escapeHtml(sec.name || "Sektor")}</div>
                <div class="sector-meta">
                  ${secPct.toFixed(1)}% dari total • Anggaran: <b>${formatRupiah(calc.sectorAmount)}</b>
                  • Terpakai: <b>${calc.usedPct.toFixed(1)}%</b> sektor
                  • Sisa: <b>${(100 - calc.usedPct).toFixed(1)}%</b> sektor
                </div>
              </div>
              <div class="sector-meta whitespace-nowrap">
                <b>${formatRupiah(calc.remainingAmount)}</b> sisa
              </div>
            </div>

            <div class="bar" aria-hidden="true">
              <span style="width:${barWidth}%"></span>
            </div>

            <div class="sector-body">
              <div class="mt-3 p-3 rounded-xl bg-gray-50 border border-gray-200">
                <div class="text-sm text-gray-700">
                  <b>Terpakai:</b> ${formatRupiah(calc.usedAmount)} • <b>Sisa:</b> ${formatRupiah(calc.remainingAmount)}
                </div>
                <div class="mt-3 space-y-2">
                  ${subsHtml}
                </div>
              </div>
            </div>
          </div>
        `;
      }).join("");

      return `
        <div class="apbdes-year-card p-6 mb-6">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div class="text-lg font-bold text-gray-800">APBDes Tahun ${escapeHtml(y)}</div>
              <div class="text-sm text-gray-600">Total APBDes: <b>${formatRupiah(total)}</b></div>
            </div>
            <div class="text-xs text-gray-600">
              Total sektor: <b>${sumPct.toFixed(1)}%</b> • Sisa belum dibagi: <b>${sisaPct.toFixed(1)}%</b>
            </div>
          </div>

          <div class="mt-4 space-y-3">
            ${sectorsHtml || `<div class="text-gray-500 text-sm">Belum ada sektor.</div>`}
          </div>
        </div>
      `;
    }).join("");

    // accordion toggle
    qsa("[data-apbdes-sector] .sector-head").forEach((head) => {
      on(head, "click", () => {
        const parent = head.closest("[data-apbdes-sector]");
        if (!parent) return;
        parent.classList.toggle("expanded");
      });
    });
  }

  function fillApbdesYearFilter() {
    const sel = $("apbdes-year-filter");
    if (!sel) return;

    const years = Object.keys(APBDES).sort((a, b) => Number(b) - Number(a));
    const current = sel.value || "all";

    sel.innerHTML = `
      <option value="all">Semua Tahun</option>
      ${years.map((y) => `<option value="${escapeHtmlAttr(y)}">${escapeHtml(y)}</option>`).join("")}
    `;

    sel.value = years.includes(current) ? current : "all";
  }

  function startApbdesListener() {
    const q = query(APBDES_COL, orderBy("year", "desc"));
    if (APBDES_UNSUB) APBDES_UNSUB();

    APBDES_UNSUB = onSnapshot(q, (snap) => {
      const next = {};
      snap.docs.forEach((d) => {
        const data = d.data() || {};
        const year = String(data.year || d.id);
        next[year] = {
          year,
          total: toNumber(data.total || 0),
          sectors: Array.isArray(data.sectors) ? data.sectors : []
        };
      });
      APBDES = next;

      fillApbdesYearFilter();
      const filter = $("apbdes-year-filter")?.value || "all";
      renderApbdesPublic(filter);
    }, (err) => {
      console.error("onSnapshot apbdes error:", err);
    });
  }

  function initApbdesUI() {
    const modal = $("apbdes-manager-modal");
    const btnOpen = $("open-apbdes-manager-btn");

    const btnAddSector = $("apbdes-add-sector");
    const btnReset = $("apbdes-reset-year");
    const btnSave = $("apbdes-save-year");

    if (btnSave && btnSave.dataset.boundApbdes === "1") return;
    if (btnSave) btnSave.dataset.boundApbdes = "1";

    on(btnOpen, "click", () => {
      if (!isAdminMode()) return showToast("Khusus Admin");
      openModal(modal);
      renderApbdesManager();
    });

    on($("apbdes-manager-close"), "click", () => closeModal(modal));
    on(modal, "click", (e) => {
      if (e.target === modal) closeModal(modal);
    });

    on($("apbdes-year"), "change", () => renderApbdesManager());
    on($("apbdes-total"), "input", () => syncApbdesFromManagerDOM());

    on(btnAddSector, "click", () => {
      const year = getYearKey();
      if (!year) return showToast("Pilih tahun dulu");
      const data = ensureApbdesYearLocal(year);
      data.sectors = Array.isArray(data.sectors) ? data.sectors : [];
      data.sectors.push({ id: uid("sec"), name: "", percentage: 0, subs: [] });
      APBDES[year] = data;
      renderApbdesManager();
      showToast("Sektor ditambahkan");
    });

    on(btnReset, "click", () => {
      const year = getYearKey();
      if (!year) return showToast("Pilih tahun dulu");
      APBDES[year] = { year, total: 0, sectors: defaultSectorsTemplate() };
      renderApbdesManager();
      showToast("Template APBDes direset");
    });

    on($("apbdes-sectors-wrap"), "click", (e) => {
      const btn = e.target?.closest?.("[data-action]");
      if (!btn) return;

      const secEl = btn.closest("[data-sec]");
      const year = getYearKey();
      if (!secEl || !year) return;

      const action = btn.dataset.action;
      const secId = secEl.getAttribute("data-sec");

      if (action === "remove-sec") {
        const data = ensureApbdesYearLocal(year);
        data.sectors = (data.sectors || []).filter((s) => s.id !== secId);
        APBDES[year] = data;
        renderApbdesManager();
        showToast("Sektor dihapus");
        return;
      }

      if (action === "add-sub") {
        const data = ensureApbdesYearLocal(year);
        const sec = (data.sectors || []).find((s) => s.id === secId);
        if (!sec) return;
        sec.subs = Array.isArray(sec.subs) ? sec.subs : [];
        sec.subs.push({ id: uid("sub"), name: "", percentage: 0, note: "" });
        renderApbdesManager();
        showToast("Sub-kegiatan ditambahkan");
        return;
      }

      if (action === "remove-sub") {
        const subEl = btn.closest("[data-sub]");
        const subId = subEl?.getAttribute("data-sub");
        if (!subId) return;

        const data = ensureApbdesYearLocal(year);
        const sec = (data.sectors || []).find((s) => s.id === secId);
        if (!sec) return;
        sec.subs = (sec.subs || []).filter((x) => x.id !== subId);

        renderApbdesManager();
        showToast("Sub-kegiatan dihapus");
        return;
      }
    });

    on($("apbdes-sectors-wrap"), "input", () => {
      syncApbdesFromManagerDOM();
    });

    on(btnSave, "click", async () => {
      const year = getYearKey();
      if (!year) return showToast("Pilih tahun dulu");

      setLoading(true);
      try {
        syncApbdesFromManagerDOM();
        await saveApbdesYearToFirestore(year);

        fillApbdesYearFilter();
        const filter = $("apbdes-year-filter")?.value || "all";
        renderApbdesPublic(filter);

        showToast("APBDes tersimpan ke Firestore ✅");
      } catch (e) {
        console.error(e);
        showToast("Gagal simpan APBDes (cek Rules)");
      } finally {
        setLoading(false);
      }
    });

    on($("apbdes-year-filter"), "change", (e) => {
      renderApbdesPublic(e.target.value || "all");
    });
  }

  /* =========================
     BOOT BAGIAN 3
  ========================== */
  function boot() {
    // settings realtime
    startSettingsListener();
    loadSettingsOnce();
    initSettingsModalFirestore_LinkOnly();

    // apbdes realtime
    startApbdesListener();
    initApbdesUI();

    // render apbdes awal
    renderApbdesPublic("all");

    // render konten lain dari BAGIAN 2
    if (typeof window.__desaRenderAll === "function") window.__desaRenderAll();
  }

  boot();
})();
