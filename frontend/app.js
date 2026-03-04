// --- Simple storage keys for frontend ---
const STORAGE_KEYS = {
  name: "messUserName",
  role: "messUserRole",
  studentId: "messStudentId",
};

// Helpers
function getTodayISO() {
  return new Date().toISOString().slice(0, 10);
}

function getNameFromEmail(email) {
  const beforeAt = (email || "").split("@")[0] || "Student";
  const cleaned = beforeAt.replace(/[._-]+/g, " ").trim();
  if (!cleaned) return "Student";
  return cleaned
    .split(" ")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

// --- Login page ---
function initLoginPage() {
  const form = document.getElementById("loginForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");
    const roleSelect = document.getElementById("role");

    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();
    const role = roleSelect.value;

    if (!email || !password) return;

    const btn = form.querySelector("button[type='submit']");
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Signing in...";

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, role }),
      });

      if (!res.ok) {
        btn.textContent = originalText;
        btn.disabled = false;
        alert(
          "Invalid email/password/role. Try demo:\n\nStudent: student@college.edu / student123\nAdmin: admin@college.edu / admin123"
        );
        return;
      }

      const data = await res.json();
      const name = data.name || getNameFromEmail(email);

      localStorage.setItem(STORAGE_KEYS.name, name);
      localStorage.setItem(STORAGE_KEYS.role, data.role);
      localStorage.setItem(STORAGE_KEYS.studentId, String(data.id));

      const target = data.role === "admin" ? "admin.html" : "student.html";
      window.location.href = target;
    } catch (err) {
      console.error("Login error", err);
      alert("Unable to reach server. Make sure backend is running.");
      btn.textContent = originalText;
      btn.disabled = false;
    }
  });
}

// Logout
function attachLogout() {
  const btn = document.getElementById("logoutBtn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEYS.role);
    localStorage.removeItem(STORAGE_KEYS.studentId);
    window.location.href = "index.html";
  });
}

// --- Student dashboard ---
async function initStudentPage() {
  attachLogout();

  const nameEl = document.getElementById("studentName");
  const storedName = localStorage.getItem(STORAGE_KEYS.name);
  if (nameEl && storedName) {
    nameEl.textContent = storedName;
  }

  const studentId = Number(localStorage.getItem(STORAGE_KEYS.studentId));
  if (!studentId) {
    window.location.href = "index.html";
    return;
  }

  setupStudentTabs();

  const attendanceState = await fetchAttendanceState(studentId);
  applyAttendanceState(attendanceState);

  const attendanceButtons = document.querySelectorAll(".attendance-toggle");
  attendanceButtons.forEach((btn) => {
    const meal = btn.dataset.meal;
    const isAttending = attendanceState[meal] !== false;
    setAttendanceButtonState(btn, isAttending);
  });

  attendanceButtons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const meal = btn.dataset.meal;
      const current = btn.classList.contains("btn-toggle--active");
      const next = !current;

      setAttendanceButtonState(btn, next);
      updateAttendanceStatusLabels({
        ...attendanceState,
        [meal]: next,
      });

      try {
        await updateAttendanceOnServer(studentId, meal, next);
        attendanceState[meal] = next;
      } catch (err) {
        console.error("Attendance update failed", err);
        alert("Could not update attendance. Please try again.");
        setAttendanceButtonState(btn, current);
        updateAttendanceStatusLabels(attendanceState);
      }
    });
  });

  initFeedbackSection(studentId);
  scheduleAttendanceReminders();
  loadTimetableForStudent();
}

async function fetchAttendanceState(studentId) {
  try {
    const res = await fetch(
      `/api/student/${studentId}/attendance?date=${encodeURIComponent(
        getTodayISO()
      )}`
    );
    if (!res.ok) throw new Error("Failed to fetch attendance");
    const data = await res.json();
    return data.state || { breakfast: true, lunch: true, dinner: true };
  } catch (err) {
    console.error("Attendance fetch error", err);
    return { breakfast: true, lunch: true, dinner: true };
  }
}

async function updateAttendanceOnServer(studentId, meal, willAttend) {
  const res = await fetch(`/api/student/${studentId}/attendance`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      date: getTodayISO(),
      meal,
      willAttend,
    }),
  });
  if (!res.ok) throw new Error("Attendance update failed");
}

function applyAttendanceState(state) {
  updateAttendanceStatusLabels(state);
}

function setAttendanceButtonState(button, isAttending) {
  button.classList.remove("btn-toggle--active", "btn-toggle--inactive");
  if (isAttending) {
    button.classList.add("btn-toggle--active");
    button.textContent = "Will Attend";
  } else {
    button.classList.add("btn-toggle--inactive");
    button.textContent = "Not Attending";
  }
}

function updateAttendanceStatusLabels(state) {
  ["breakfast", "lunch", "dinner"].forEach((meal) => {
    const span = document.querySelector(
      `.attendance-status[data-status="${meal}"] strong`
    );
    if (!span) return;
    const attending = state[meal] !== false;
    span.textContent = attending ? "Will Attend" : "Not Attending";
  });
}

// Student tabs (Dashboard / Feedback)
function setupStudentTabs() {
  const dashboardMain = document.getElementById("dashboard");
  const feedbackMain = document.getElementById("feedbackPage");
  if (!dashboardMain || !feedbackMain) return;

  const links = document.querySelectorAll(".top-nav-right .nav-link[data-tab]");

  function setActiveTab(tab) {
    links.forEach((link) => {
      const isActive = link.getAttribute("data-tab") === tab;
      link.classList.toggle("active", isActive);
    });

    if (tab === "dashboard") {
      dashboardMain.classList.remove("tab-hidden");
      feedbackMain.classList.add("tab-hidden");
    } else {
      dashboardMain.classList.add("tab-hidden");
      feedbackMain.classList.remove("tab-hidden");
    }
  }

  links.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const tab = link.getAttribute("data-tab");
      if (!tab) return;
      setActiveTab(tab);
    });
  });

  setActiveTab("dashboard");
}

// --- Feedback (student page) ---
function initFeedbackSection(studentId) {
  const ratingContainer = document.getElementById("starRating");
  const statusEl = document.getElementById("feedbackStatus");
  const textarea = document.getElementById("feedbackText");
  const submitBtn = document.getElementById("feedbackSubmit");

  const tasteSelect = document.getElementById("feedbackTaste");
  const quantitySelect = document.getElementById("feedbackQuantity");
  const qualitySelect = document.getElementById("feedbackQuality");
  const maintenanceSelect = document.getElementById("feedbackMaintenance");

  if (!ratingContainer || !textarea || !submitBtn) return;

  const stars = Array.from(ratingContainer.querySelectorAll(".star"));

  function renderStars(activeRating) {
    stars.forEach((star) => {
      const value = Number(star.dataset.value);
      star.classList.toggle("filled", value <= activeRating);
    });
  }

  stars.forEach((star) => {
    star.addEventListener("mouseenter", () => {
      const value = Number(star.dataset.value);
      renderStars(value);
    });

    star.addEventListener("mouseleave", () => {
      const storedRating = Number(ratingContainer.dataset.rating || "0");
      renderStars(storedRating);
    });

    star.addEventListener("click", () => {
      const value = Number(star.dataset.value);
      ratingContainer.dataset.rating = String(value);
      renderStars(value);
    });
  });

  submitBtn.addEventListener("click", async () => {
    const message = textarea.value.trim();
    const rating = Number(ratingContainer.dataset.rating || "0");

    const taste = tasteSelect ? tasteSelect.value : "";
    const quantity = quantitySelect ? quantitySelect.value : "";
    const quality = qualitySelect ? qualitySelect.value : "";
    const maintenance = maintenanceSelect ? maintenanceSelect.value : "";

    if (!message && !rating && !taste && !quantity && !quality && !maintenance) {
      statusEl.textContent =
        "Please provide at least one rating or comment before submitting.";
      return;
    }

    const detailedMessageLines = [];
    if (taste) detailedMessageLines.push(`Food taste: ${taste}/5`);
    if (quantity) detailedMessageLines.push(`Food quantity: ${quantity}/5`);
    if (quality) detailedMessageLines.push(`Food quality: ${quality}/5`);
    if (maintenance)
      detailedMessageLines.push(`Maintenance & hygiene: ${maintenance}/5`);
    if (message) detailedMessageLines.push(`Other comments: ${message}`);

    const combinedMessage = detailedMessageLines.join("\n");

    submitBtn.classList.add("btn-pulse");

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId,
          rating: rating || null,
          message: combinedMessage || null,
        }),
      });

      if (!res.ok) throw new Error("Feedback failed");

      textarea.value = "";
      if (tasteSelect) tasteSelect.value = "";
      if (quantitySelect) quantitySelect.value = "";
      if (qualitySelect) qualitySelect.value = "";
      if (maintenanceSelect) maintenanceSelect.value = "";
      ratingContainer.dataset.rating = "0";
      renderStars(0);

      statusEl.textContent = "Thank you for your feedback!";
      setTimeout(() => {
        statusEl.textContent = "";
      }, 1800);
    } catch (err) {
      console.error("Feedback error", err);
      statusEl.textContent = "Could not submit feedback. Please try again.";
      setTimeout(() => {
        statusEl.textContent = "";
      }, 2000);
    } finally {
      setTimeout(() => submitBtn.classList.remove("btn-pulse"), 600);
    }
  });
}

// Load timetable for student
async function loadTimetableForStudent() {
  const link = document.getElementById("studentTimetableLink");
  const emptyEl = document.getElementById("studentTimetableEmpty");
  const actions = document.getElementById("studentTimetableActions");
  if (!link || !emptyEl || !actions) return;

  try {
    const res = await fetch("/api/timetable");
    if (!res.ok) throw new Error("Failed to fetch timetable");
    const data = await res.json();

    if (!data || !data.url) {
      emptyEl.style.display = "block";
      actions.style.display = "none";
      return;
    }

    emptyEl.textContent = data.originalName
      ? `Latest timetable: ${data.originalName}`
      : "Latest timetable uploaded by admin.";
    link.href = data.url;
    actions.style.display = "flex";
  } catch (err) {
    console.error("Student timetable fetch error", err);
    emptyEl.textContent = "Unable to load timetable at the moment.";
    actions.style.display = "none";
  }
}

// Attendance reminder notifications
let attendanceInteracted = false;

function scheduleAttendanceReminders() {
  const buttons = document.querySelectorAll(".attendance-toggle");
  if (!buttons.length) return;

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      attendanceInteracted = true;
    });
  });

  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }

  // Compute the next upcoming cutoff time (breakfast, lunch or dinner)
  const now = new Date();
  const cutoffs = [];

  // Breakfast cutoff: 9:00 pm today
  const breakfastCutoff = new Date(now.getTime());
  breakfastCutoff.setHours(21, 0, 0, 0);
  cutoffs.push(breakfastCutoff);

  // Lunch cutoff: 10:30 am today
  const lunchCutoff = new Date(now.getTime());
  lunchCutoff.setHours(10, 30, 0, 0);
  cutoffs.push(lunchCutoff);

  // Dinner cutoff: 5:00 pm today
  const dinnerCutoff = new Date(now.getTime());
  dinnerCutoff.setHours(17, 0, 0, 0);
  cutoffs.push(dinnerCutoff);

  const futureCutoffs = cutoffs.filter((d) => d.getTime() > now.getTime());
  if (!futureCutoffs.length) {
    // All cutoffs for today have passed; no reminders
    return;
  }

  futureCutoffs.sort((a, b) => a.getTime() - b.getTime());
  const nextCutoff = futureCutoffs[0];

  const msToCutoff = nextCutoff.getTime() - now.getTime();

  // First reminder 30 minutes before cutoff, second 10 minutes before cutoff.
  const firstDelay = msToCutoff - 30 * 60 * 1000;
  const secondDelay = msToCutoff - 10 * 60 * 1000;

  if (firstDelay > 0) {
    setTimeout(() => {
      if (!attendanceInteracted) {
        showAttendanceReminder(1);
      }
    }, firstDelay);
  }

  if (secondDelay > 0) {
    setTimeout(() => {
      if (!attendanceInteracted) {
        showAttendanceReminder(2);
      }
    }, secondDelay);
  }
}

function showAttendanceReminder(iteration) {
  const title =
    iteration === 1 ? "Mark your mess attendance" : "Final reminder for attendance";
  const body =
    "Please update your breakfast, lunch and dinner plans so we can reduce food wastage.";

  if (
    "Notification" in window &&
    Notification.permission === "granted" &&
    document.visibilityState === "hidden"
  ) {
    new Notification(title, { body });
  } else {
    showInAppAttendanceBanner(title, body);
  }
}

function showInAppAttendanceBanner(title, body) {
  const existing = document.querySelector(".attendance-reminder");
  if (existing) existing.remove();

  const container = document.createElement("div");
  container.className = "attendance-reminder";

  const titleEl = document.createElement("div");
  titleEl.className = "attendance-reminder-title";
  titleEl.textContent = title;

  const textEl = document.createElement("div");
  textEl.className = "attendance-reminder-text";
  textEl.textContent = body;

  const actions = document.createElement("div");
  actions.className = "attendance-reminder-actions";

  const laterBtn = document.createElement("button");
  laterBtn.className =
    "attendance-reminder-btn attendance-reminder-btn-ghost";
  laterBtn.textContent = "Dismiss";
  laterBtn.addEventListener("click", () => container.remove());

  const goBtn = document.createElement("button");
  goBtn.className =
    "attendance-reminder-btn attendance-reminder-btn-primary";
  goBtn.textContent = "Go to attendance";
  goBtn.addEventListener("click", () => {
    container.remove();
    const dashboardMain = document.getElementById("dashboard");
    const feedbackMain = document.getElementById("feedbackPage");
    if (dashboardMain && feedbackMain) {
      dashboardMain.classList.remove("tab-hidden");
      feedbackMain.classList.add("tab-hidden");
    }
    const dashboardLink = document.querySelector(
      '.top-nav-right .nav-link[data-tab="dashboard"]'
    );
    const feedbackLink = document.querySelector(
      '.top-nav-right .nav-link[data-tab="feedback"]'
    );
    if (dashboardLink) dashboardLink.classList.add("active");
    if (feedbackLink) feedbackLink.classList.remove("active");
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  actions.appendChild(laterBtn);
  actions.appendChild(goBtn);

  container.appendChild(titleEl);
  container.appendChild(textEl);
  container.appendChild(actions);

  document.body.appendChild(container);
}

// --- Admin dashboard ---
async function initAdminPage() {
  attachLogout();

  const role = localStorage.getItem(STORAGE_KEYS.role);
  if (role !== "admin") {
    window.location.href = "index.html";
    return;
  }

  setupAdminTabs();
  const summary = await fetchAdminSummary();
  applyAdminSummary(summary);
  loadTimetableAdmin();
}

async function fetchAdminSummary() {
  try {
    const res = await fetch(
      `/api/admin/summary?date=${encodeURIComponent(getTodayISO())}`
    );
    if (!res.ok) throw new Error("Failed to fetch summary");
    return await res.json();
  } catch (err) {
    console.error("Admin summary error", err);
    return {
      date: getTodayISO(),
      counts: { breakfast: 0, lunch: 0, dinner: 0 },
      feedback: [],
    };
  }
}

function applyAdminSummary(summary) {
  const { counts, feedback } = summary;

  const statBreakfast = document.getElementById("statBreakfast");
  const statLunch = document.getElementById("statLunch");
  const statDinner = document.getElementById("statDinner");

  if (statBreakfast) statBreakfast.textContent = counts.breakfast ?? 0;
  if (statLunch) statLunch.textContent = counts.lunch ?? 0;
  if (statDinner) statDinner.textContent = counts.dinner ?? 0;

  renderFeedbackListAdmin(feedback);
  renderFeedbackTable(feedback);
  initAttendanceChart(counts);
}

function renderFeedbackListAdmin(list) {
  const listEl = document.getElementById("feedbackList");
  const emptyEl = document.getElementById("feedbackEmpty");
  if (!listEl || !emptyEl) return;

  listEl.innerHTML = "";

  if (!list.length) {
    emptyEl.style.display = "block";
    return;
  }

  emptyEl.style.display = "none";

  list.slice(0, 6).forEach((item) => {
    const li = document.createElement("li");
    li.className = "feedback-item";

    const header = document.createElement("div");
    header.className = "feedback-item-header";

    const name = document.createElement("span");
    name.className = "feedback-item-name";
    name.textContent = item.name || "Student";

    const rating = document.createElement("span");
    rating.className = "feedback-item-rating";
    const stars = item.rating ? "★".repeat(item.rating) : "No rating";
    rating.textContent = stars;

    header.appendChild(name);
    header.appendChild(rating);

    const message = document.createElement("p");
    message.className = "feedback-item-message";
    message.textContent = item.message || "(No message provided.)";

    const time = document.createElement("span");
    time.className = "feedback-item-time";
    const date = item.created_at ? new Date(item.created_at) : new Date();
    time.textContent = date.toLocaleString([], {
      dateStyle: "short",
      timeStyle: "short",
    });

    li.appendChild(header);
    li.appendChild(message);
    li.appendChild(time);

    listEl.appendChild(li);
  });
}

// Parse structured feedback message into columns
function parseStructuredFeedback(message) {
  const result = {
    taste: "",
    quantity: "",
    quality: "",
    maintenance: "",
    comments: "",
  };

  if (!message) return result;

  const lines = String(message).split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (/^Food taste:/i.test(trimmed)) {
      result.taste = trimmed.replace(/^Food taste:\s*/i, "");
    } else if (/^Food quantity:/i.test(trimmed)) {
      result.quantity = trimmed.replace(/^Food quantity:\s*/i, "");
    } else if (/^Food quality:/i.test(trimmed)) {
      result.quality = trimmed.replace(/^Food quality:\s*/i, "");
    } else if (/^Maintenance & hygiene:/i.test(trimmed)) {
      result.maintenance = trimmed.replace(/^Maintenance & hygiene:\s*/i, "");
    } else if (/^Other comments:/i.test(trimmed)) {
      result.comments = trimmed.replace(/^Other comments:\s*/i, "");
    } else if (trimmed) {
      // Older free-text feedback or extra lines
      result.comments = result.comments
        ? `${result.comments}\n${trimmed}`
        : trimmed;
    }
  });

  return result;
}

// Render admin feedback table
function renderFeedbackTable(list) {
  const tbody = document.getElementById("feedbackTableBody");
  const emptyEl = document.getElementById("feedbackTableEmpty");
  if (!tbody || !emptyEl) return;

  tbody.innerHTML = "";

  if (!list || !list.length) {
    emptyEl.style.display = "block";
    return;
  }

  emptyEl.style.display = "none";

  list.forEach((item) => {
    const parsed = parseStructuredFeedback(item.message);
    const tr = document.createElement("tr");

    const tdName = document.createElement("td");
    tdName.textContent = item.name || "Student";

    const tdTaste = document.createElement("td");
    tdTaste.textContent = parsed.taste || "-";

    const tdQuantity = document.createElement("td");
    tdQuantity.textContent = parsed.quantity || "-";

    const tdQuality = document.createElement("td");
    tdQuality.textContent = parsed.quality || "-";

    const tdMaintenance = document.createElement("td");
    tdMaintenance.textContent = parsed.maintenance || "-";

    const tdComments = document.createElement("td");
    tdComments.className = "feedback-comments";
    tdComments.textContent = parsed.comments || "-";

    const tdTime = document.createElement("td");
    const date = item.created_at ? new Date(item.created_at) : new Date();
    tdTime.textContent = date.toLocaleString([], {
      dateStyle: "short",
      timeStyle: "short",
    });

    tr.appendChild(tdName);
    tr.appendChild(tdTaste);
    tr.appendChild(tdQuantity);
    tr.appendChild(tdQuality);
    tr.appendChild(tdMaintenance);
    tr.appendChild(tdComments);
    tr.appendChild(tdTime);

    tbody.appendChild(tr);
  });
}

// Admin tabs (Analytics / Feedbacks)
function setupAdminTabs() {
  const analyticsPage = document.getElementById("adminAnalyticsPage");
  const feedbackPage = document.getElementById("adminFeedbackPage");
  const buttons = document.querySelectorAll(
    ".top-nav-right .nav-link-button[data-admin-tab]"
  );
  if (!analyticsPage || !feedbackPage || !buttons.length) return;

  function setAdminTab(tab) {
    buttons.forEach((btn) => {
      const active = btn.getAttribute("data-admin-tab") === tab;
      btn.classList.toggle("active", active);
    });

    if (tab === "analytics") {
      analyticsPage.classList.remove("tab-hidden");
      feedbackPage.classList.add("tab-hidden");
    } else {
      analyticsPage.classList.add("tab-hidden");
      feedbackPage.classList.remove("tab-hidden");
    }
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.getAttribute("data-admin-tab");
      if (!tab) return;
      setAdminTab(tab);
    });
  });

  setAdminTab("analytics");

  const csvBtn = document.getElementById("downloadCsvBtn");
  const printBtn = document.getElementById("printFeedbackBtn");
  const uploadBtn = document.getElementById("uploadTimetableBtn");
  const fileInput = document.getElementById("timetableFile");

  if (csvBtn) {
    csvBtn.addEventListener("click", () => {
      const tbody = document.getElementById("feedbackTableBody");
      if (!tbody || !tbody.rows.length) return;
      downloadFeedbackCsv();
    });
  }

  if (printBtn) {
    printBtn.addEventListener("click", () => {
      window.print();
    });
  }

  if (uploadBtn && fileInput) {
    uploadBtn.addEventListener("click", async () => {
      const file = fileInput.files[0];
      if (!file) {
        alert("Please choose a file to upload.");
        return;
      }

      const formData = new FormData();
      formData.append("file", file);

      const originalText = uploadBtn.textContent;
      uploadBtn.disabled = true;
      uploadBtn.textContent = "Uploading...";

      try {
        const res = await fetch("/api/admin/timetable", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) throw new Error("Upload failed");
        await res.json();
        fileInput.value = "";
        await loadTimetableAdmin();
        alert("Timetable uploaded successfully.");
      } catch (err) {
        console.error("Timetable upload error", err);
        alert("Unable to upload timetable. Please try again.");
      } finally {
        uploadBtn.disabled = false;
        uploadBtn.textContent = originalText;
      }
    });
  }
}

function downloadFeedbackCsv() {
  const tbody = document.getElementById("feedbackTableBody");
  if (!tbody) return;

  const rows = Array.from(tbody.rows);
  if (!rows.length) return;

  const headers = [
    "Student",
    "Taste",
    "Quantity",
    "Quality",
    "Maintenance & hygiene",
    "Other comments",
    "Submitted at",
  ];

  const csvRows = [headers.join(",")];

  rows.forEach((row) => {
    const cells = Array.from(row.cells).map((cell) => {
      const text = cell.textContent.replace(/\r?\n/g, " ").trim();
      if (text.includes(",") || text.includes('"')) {
        return `"${text.replace(/"/g, '""')}"`;
      }
      return text;
    });
    csvRows.push(cells.join(","));
  });

  const blob = new Blob([csvRows.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mess-feedback-${getTodayISO()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Admin: load timetable meta
async function loadTimetableAdmin() {
  const infoEl = document.getElementById("timetableCurrentInfo");
  const linkEl = document.getElementById("studentTimetableLink"); // reuse link text for naming
  if (!infoEl) return;

  try {
    const res = await fetch("/api/timetable");
    if (!res.ok) throw new Error("Failed to fetch timetable");
    const data = await res.json();

    if (!data || !data.url) {
      infoEl.textContent = "No timetable uploaded yet.";
      return;
    }

    const uploadedAt = data.uploadedAt
      ? new Date(data.uploadedAt).toLocaleString([], {
          dateStyle: "short",
          timeStyle: "short",
        })
      : "";

    infoEl.textContent = `Current timetable: ${
      data.originalName || "File"
    } (uploaded ${uploadedAt})`;
  } catch (err) {
    console.error("Admin timetable fetch error", err);
    infoEl.textContent = "Unable to load current timetable.";
  }
}

// Chart.js bar chart
function initAttendanceChart(counts) {
  const canvas = document.getElementById("attendanceChart");
  if (!canvas || typeof Chart === "undefined") return;

  const ctx = canvas.getContext("2d");
  const data = [
    counts.breakfast ?? 0,
    counts.lunch ?? 0,
    counts.dinner ?? 0,
  ];

  new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["Breakfast", "Lunch", "Dinner"],
      datasets: [
        {
          label: "Expected attendees",
          data,
          backgroundColor: [
            "rgba(79, 70, 229, 0.85)",
            "rgba(16, 185, 129, 0.85)",
            "rgba(56, 189, 248, 0.85)",
          ],
          borderRadius: 10,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#0f172a",
          borderColor: "rgba(148, 163, 184, 0.8)",
          borderWidth: 1,
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            font: { family: "Poppins", size: 11 },
            color: "#6b7280",
          },
        },
        y: {
          beginAtZero: true,
          grid: { color: "rgba(226, 232, 240, 0.8)" },
          ticks: {
            stepSize: 10,
            font: { family: "Poppins", size: 11 },
            color: "#6b7280",
          },
        },
      },
    },
  });
}

// Button pulse animation
const style = document.createElement("style");
style.textContent = `
  .btn-pulse {
    animation: btnPulse 0.6s ease-out 1;
  }
  @keyframes btnPulse {
    0% { transform: translateY(0) scale(1); box-shadow: 0 14px 30px rgba(79,70,229,0.35); }
    50% { transform: translateY(-1px) scale(1.03); box-shadow: 0 20px 40px rgba(79,70,229,0.40); }
    100% { transform: translateY(0) scale(1); box-shadow: 0 14px 30px rgba(79,70,229,0.35); }
  }
`;
document.head.appendChild(style);

// Router
document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.dataset.page;
  if (page === "login") initLoginPage();
  if (page === "student") initStudentPage();
  if (page === "admin") initAdminPage();
});