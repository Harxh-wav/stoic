const STORAGE_KEY = "training-space-ios-v1";
const LEGACY_KEY = "forge-progress-app-v1";
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const SPLIT_PRESETS = {
  "Bro Split": ["Chest", "Back", "Legs", "Shoulders", "Arms"],
  PPL: ["Push", "Pull", "Legs"]
};

const EXERCISE_SUGGESTIONS = {
  Push: ["Bench Press", "Incline Dumbbell Press", "Shoulder Press", "Lateral Raise"],
  Pull: ["Pull Up", "Barbell Row", "Lat Pulldown", "Hammer Curl"],
  Legs: ["Back Squat", "Romanian Deadlift", "Leg Press", "Calf Raise"],
  Chest: ["Bench Press", "Incline Press", "Cable Fly"],
  Back: ["Pull Up", "Barbell Row", "Seated Row"],
  Shoulders: ["Shoulder Press", "Lateral Raise", "Rear Delt Fly"],
  Arms: ["Barbell Curl", "Triceps Pushdown", "Hammer Curl"],
  Default: ["Bench Press", "Barbell Row", "Back Squat"]
};

const state = {
  data: null,
  ui: {
    activeTab: "weight",
    weightChartVisible: false,
    workoutChartVisible: false,
    weightManualEdit: false,
    workoutView: "home",
    workoutSetupStep: 1,
    workoutSetupIndex: 0,
    workoutDraft: null,
    workoutLogDraft: null,
    workoutQuickDayId: "",
    selectedWorkoutExercise: ""
  },
  charts: {}
};

const dom = {};

const Utils = {
  id(prefix = "item") {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  },

  clone(value) {
    return JSON.parse(JSON.stringify(value));
  },

  today() {
    return this.toISODate(new Date());
  },

  toISODate(date) {
    const value = new Date(date);
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  },

  parseDate(dateString) {
    return new Date(`${dateString}T12:00:00`);
  },

  daysAgo(days) {
    const value = new Date();
    value.setDate(value.getDate() - days);
    return this.toISODate(value);
  },

  round(value, decimals = 1) {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
  },

  sum(items, selector = (item) => item) {
    return items.reduce((total, item) => total + Number(selector(item) || 0), 0);
  },

  average(values) {
    return values.length ? this.sum(values) / values.length : 0;
  },

  formatDate(dateString, options = { month: "short", day: "numeric" }) {
    if (!dateString) return "--";
    return new Intl.DateTimeFormat("en-US", options).format(this.parseDate(dateString));
  },

  formatLongDate(dateString) {
    return this.formatDate(dateString, { month: "short", day: "numeric", year: "numeric" });
  },

  formatWeight(value) {
    return Number.isFinite(value) ? `${this.round(value, 1).toFixed(1)} kg` : "--";
  },

  formatSignedWeight(value) {
    if (!Number.isFinite(value)) return "--";
    return `${value > 0 ? "+" : ""}${this.round(value, 1).toFixed(1)} kg`;
  },

  weekdayName(dateString) {
    return WEEKDAYS[this.parseDate(dateString).getDay()];
  },

  weekdayIndex(name) {
    return WEEKDAYS.indexOf(name);
  },

  nextWeekdayDistance(fromName, targetName) {
    const fromIndex = this.weekdayIndex(fromName);
    const targetIndex = this.weekdayIndex(targetName);
    if (fromIndex === -1 || targetIndex === -1) return 99;
    return (targetIndex - fromIndex + 7) % 7;
  },

  unique(values) {
    return [...new Set(values.filter(Boolean))];
  },

  escapeHtml(value = "") {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  },

  quotaError(error) {
    return /quota/i.test(error?.name || "") || /quota/i.test(error?.message || "");
  }
};

const SampleData = {
  build() {
    return {
      version: 1,
      meta: {
        hasSeenGreeting: false
      },
      profile: {
        name: "Alex",
        age: "",
        height: "178",
        startingWeight: ""
      },
      weights: [],
      workoutSetup: {
        completed: false,
        splitType: "",
        customSplitName: "",
        days: []
      },
      workoutLogs: []
    };
  },

  migrateLegacy(legacy) {
    const weights = Array.isArray(legacy?.weights)
      ? legacy.weights
          .map((entry) => ({
            id: entry.id || Utils.id("weight"),
            date: entry.date,
            weight: Number(entry.weight),
            note: entry.note || ""
          }))
          .filter((entry) => entry.date && Number.isFinite(entry.weight))
      : [];

    const workoutLogs = Array.isArray(legacy?.workouts)
      ? legacy.workouts
          .map((workout) => ({
            id: workout.id || Utils.id("log"),
            date: workout.date,
            dayId: "imported-day",
            dayName: "Training Day",
            notes: workout.notes || "",
            exercises: (workout.exercises || [])
              .map((exercise) => ({
                id: exercise.id || Utils.id("exercise"),
                name: exercise.name || "Exercise",
                sets: Array.from({ length: Number(exercise.sets) || 0 }, () => ({
                  reps: Number(exercise.reps) || 0,
                  weight: Number(exercise.weight) || 0
                })).filter((set) => set.reps > 0 || set.weight >= 0)
              }))
              .filter((exercise) => exercise.name && exercise.sets.length)
          }))
          .filter((workout) => workout.date && workout.exercises.length)
      : [];

    const latestWorkout = [...workoutLogs].sort((left, right) => right.date.localeCompare(left.date))[0];
    const importedExercises = latestWorkout
      ? Utils.unique(latestWorkout.exercises.map((exercise) => exercise.name)).slice(0, 8)
      : [];

    return {
      version: 1,
      meta: {
        hasSeenGreeting: false
      },
      profile: {
        name: "Athlete",
        age: "",
        height: "",
        startingWeight: weights[0] ? String(weights[0].weight) : ""
      },
      weights,
      workoutSetup: importedExercises.length
        ? {
            completed: true,
            splitType: "Other",
            customSplitName: "Imported Plan",
            days: [
              {
                id: "imported-day",
                name: "Training Day",
                weekday: latestWorkout ? Utils.weekdayName(latestWorkout.date) : "Monday",
                exercises: importedExercises
              }
            ]
          }
        : {
            completed: false,
            splitType: "",
            customSplitName: "",
            days: []
          },
      workoutLogs
    };
  }
};

const Storage = {
  normalize(data) {
    const weights = Array.isArray(data?.weights)
      ? data.weights
          .map((entry) => ({
            id: entry.id || Utils.id("weight"),
            date: entry.date,
            weight: Number(entry.weight),
            note: entry.note || ""
          }))
          .filter((entry) => entry.date && Number.isFinite(entry.weight))
      : [];

    const setupDays = Array.isArray(data?.workoutSetup?.days)
      ? data.workoutSetup.days
          .map((day) => ({
            id: day.id || Utils.id("day"),
            name: day.name || "",
            weekday: day.weekday || "",
            exercises: Utils.unique((day.exercises || []).map((exercise) => String(exercise).trim()))
          }))
          .filter((day) => day.name)
      : [];

    const workoutLogs = Array.isArray(data?.workoutLogs)
      ? data.workoutLogs
          .map((log) => ({
            id: log.id || Utils.id("log"),
            dayId: log.dayId || Utils.id("day"),
            dayName: log.dayName || "Workout",
            date: log.date,
            notes: log.notes || "",
            exercises: Array.isArray(log.exercises)
              ? log.exercises
                  .map((exercise) => ({
                    id: exercise.id || Utils.id("exercise"),
                    name: exercise.name || "",
                    sets: Array.isArray(exercise.sets)
                      ? exercise.sets
                          .map((set) => ({
                            reps: Number(set.reps),
                            weight: Number(set.weight)
                          }))
                          .filter((set) => Number.isFinite(set.reps) && Number.isFinite(set.weight))
                      : []
                  }))
                  .filter((exercise) => exercise.name && exercise.sets.length)
              : []
          }))
          .filter((log) => log.date && log.exercises.length)
      : [];

    return {
      version: 1,
      meta: {
        hasSeenGreeting: Boolean(data?.meta?.hasSeenGreeting)
      },
      profile: {
        name: data?.profile?.name || "",
        age: data?.profile?.age || "",
        height: data?.profile?.height || "",
        startingWeight: data?.profile?.startingWeight || ""
      },
      weights,
      workoutSetup: {
        completed: Boolean(data?.workoutSetup?.completed && setupDays.length),
        splitType: data?.workoutSetup?.splitType || "",
        customSplitName: data?.workoutSetup?.customSplitName || "",
        days: setupDays
      },
      workoutLogs
    };
  },

  load() {
    const current = localStorage.getItem(STORAGE_KEY);
    if (current) {
      try {
        return this.normalize(JSON.parse(current));
      } catch (error) {
        const fallback = SampleData.build();
        this.save(fallback);
        return this.normalize(fallback);
      }
    }

    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      try {
        const migrated = SampleData.migrateLegacy(JSON.parse(legacy));
        this.save(migrated);
        return this.normalize(migrated);
      } catch (error) {
        const fallback = SampleData.build();
        this.save(fallback);
        return this.normalize(fallback);
      }
    }

    const sample = SampleData.build();
    this.save(sample);
    return this.normalize(sample);
  },

  save(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }
};

const Data = {
  weightsAsc() {
    return [...state.data.weights].sort((left, right) => left.date.localeCompare(right.date));
  },

  weightsDesc() {
    return [...state.data.weights].sort((left, right) => right.date.localeCompare(left.date));
  },

  latestWeight() {
    return this.weightsAsc().at(-1) || null;
  },

  todayWeight() {
    const today = Utils.today();
    return state.data.weights.find((entry) => entry.date === today) || null;
  },

  previousWeight(beforeId) {
    const weights = this.weightsAsc();
    const index = weights.findIndex((entry) => entry.id === beforeId);
    if (index <= 0) return null;
    return weights[index - 1];
  },

  weightDelta() {
    const weights = this.weightsAsc();
    if (weights.length < 2) return null;
    return Utils.round(weights.at(-1).weight - weights.at(-2).weight, 1);
  },

  recentWeights(limit = 6) {
    return this.weightsDesc().slice(0, limit);
  },

  workoutDays() {
    return [...state.data.workoutSetup.days].sort(
      (left, right) => Utils.weekdayIndex(left.weekday) - Utils.weekdayIndex(right.weekday)
    );
  },

  hasWorkoutSetup() {
    return Boolean(state.data.workoutSetup.completed && state.data.workoutSetup.days.length);
  },

  todayAssignedWorkout() {
    const todayName = WEEKDAYS[new Date().getDay()];
    return this.workoutDays().find((day) => day.weekday === todayName) || null;
  },

  nextAssignedWorkout() {
    const todayName = WEEKDAYS[new Date().getDay()];
    return [...this.workoutDays()]
      .sort(
        (left, right) =>
          Utils.nextWeekdayDistance(todayName, left.weekday) -
          Utils.nextWeekdayDistance(todayName, right.weekday)
      )[0] || null;
  },

  workoutLogsDesc() {
    return [...state.data.workoutLogs].sort((left, right) => right.date.localeCompare(left.date));
  },

  recentWorkoutLogs(limit = 4) {
    return this.workoutLogsDesc().slice(0, limit);
  },

  findWorkoutDay(dayId) {
    return state.data.workoutSetup.days.find((day) => day.id === dayId) || null;
  },

  findWorkoutLog(logId) {
    return state.data.workoutLogs.find((log) => log.id === logId) || null;
  },

  exerciseOptions() {
    return Utils.unique([
      ...state.data.workoutSetup.days.flatMap((day) => day.exercises),
      ...state.data.workoutLogs.flatMap((log) => log.exercises.map((exercise) => exercise.name))
    ]).sort((left, right) => left.localeCompare(right));
  },

  exerciseProgress(name) {
    if (!name) return [];

    return this.workoutLogsDesc()
      .filter((log) => log.exercises.some((exercise) => exercise.name === name))
      .map((log) => {
        const sets = log.exercises
          .filter((exercise) => exercise.name === name)
          .flatMap((exercise) => exercise.sets);

        return {
          date: log.date,
          maxWeight: Math.max(...sets.map((set) => set.weight)),
          volume: Utils.sum(sets, (set) => set.reps * set.weight)
        };
      })
      .reverse();
  },

  workoutSummary(log) {
    const setCount = Utils.sum(log.exercises, (exercise) => exercise.sets.length);
    const topWeight = Math.max(...log.exercises.flatMap((exercise) => exercise.sets.map((set) => set.weight)));
    return {
      exerciseCount: log.exercises.length,
      setCount,
      topWeight
    };
  }
};

const UI = {
  cache() {
    dom.welcomeScreen = document.getElementById("welcome-screen");
    dom.welcomeCopy = document.getElementById("welcome-copy");
    dom.welcomeContinue = document.getElementById("welcome-continue");
    dom.headerKicker = document.getElementById("header-kicker");
    dom.headerTitle = document.getElementById("header-title");
    dom.headerDateLabel = document.getElementById("header-date-label");
    dom.tabScreens = [...document.querySelectorAll(".tab-screen")];
    dom.dockTabs = [...document.querySelectorAll(".dock-tab")];
    dom.toastStack = document.getElementById("toast-stack");

    dom.weightCurrentValue = document.getElementById("weight-current-value");
    dom.weightCurrentMeta = document.getElementById("weight-current-meta");
    dom.weightDeltaBadge = document.getElementById("weight-delta-badge");
    dom.weightForm = document.getElementById("weight-form");
    dom.weightEntryId = document.getElementById("weight-entry-id");
    dom.weightDate = document.getElementById("weight-date");
    dom.weightValue = document.getElementById("weight-value");
    dom.weightNote = document.getElementById("weight-note");
    dom.weightFormTitle = document.getElementById("weight-form-title");
    dom.weightSubmitBtn = document.getElementById("weight-submit-btn");
    dom.weightCancelBtn = document.getElementById("weight-cancel-btn");
    dom.weightChartToggle = document.getElementById("weight-chart-toggle");
    dom.weightChartPanel = document.getElementById("weight-chart-panel");
    dom.weightChart = document.getElementById("weight-chart");
    dom.weightList = document.getElementById("weight-list");

    dom.workoutView = document.getElementById("workout-view");

    dom.profileForm = document.getElementById("profile-form");
    dom.profileName = document.getElementById("profile-name");
    dom.profileAge = document.getElementById("profile-age");
    dom.profileHeight = document.getElementById("profile-height");
    dom.profileStartingWeight = document.getElementById("profile-starting-weight");
    dom.resetDataBtn = document.getElementById("reset-data-btn");
    dom.resetModal = document.getElementById("reset-modal");
    dom.resetCancelBtn = document.getElementById("reset-cancel-btn");
    dom.resetConfirmBtn = document.getElementById("reset-confirm-btn");
  },

  bindGlobal() {
    dom.welcomeContinue.addEventListener("click", () => App.dismissGreeting());

    dom.dockTabs.forEach((button) => {
      button.addEventListener("click", () => {
        state.ui.activeTab = button.dataset.tab;
        this.renderTabs();
        App.render();
      });
    });

    dom.resetDataBtn.addEventListener("click", () => {
      dom.resetModal.hidden = false;
    });

    dom.resetCancelBtn.addEventListener("click", () => {
      dom.resetModal.hidden = true;
    });

    dom.resetConfirmBtn.addEventListener("click", () => {
      localStorage.clear();
      window.location.reload();
    });

    dom.resetModal.addEventListener("click", (event) => {
      if (event.target === dom.resetModal) {
        dom.resetModal.hidden = true;
      }
    });
  },

  renderTabs() {
    dom.dockTabs.forEach((button) => {
      button.classList.toggle("active", button.dataset.tab === state.ui.activeTab);
    });

    dom.tabScreens.forEach((screen) => {
      screen.classList.toggle("active", screen.dataset.tab === state.ui.activeTab);
    });
  },

  updateHeader() {
    const titles = {
      weight: {
        kicker: "Weight",
        title: "Today's check-in"
      },
      settings: {
        kicker: "Settings",
        title: "Keep it simple"
      }
    };

    if (state.ui.activeTab === "workout") {
      if (!Data.hasWorkoutSetup() || state.ui.workoutView === "setup") {
        dom.headerKicker.textContent = "Workout";
        dom.headerTitle.textContent = "Build your split";
      } else if (state.ui.workoutView === "log") {
        dom.headerKicker.textContent = "Workout";
        dom.headerTitle.textContent = "Log your session";
      } else {
        dom.headerKicker.textContent = "Workout";
        dom.headerTitle.textContent = "Today's flow";
      }
    } else {
      dom.headerKicker.textContent = titles[state.ui.activeTab].kicker;
      dom.headerTitle.textContent = titles[state.ui.activeTab].title;
    }

    dom.headerDateLabel.textContent = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric"
    }).format(new Date());
  },

  showGreeting() {
    const name = state.data.profile.name || "there";
    dom.welcomeCopy.textContent = `${name}, let’s track today’s progress with a cleaner routine.`;
    dom.welcomeScreen.classList.toggle("is-hidden", state.data.meta.hasSeenGreeting);
  },

  showToast(message, type = "success") {
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;
    dom.toastStack.appendChild(toast);
    window.setTimeout(() => toast.remove(), 3200);
  },

  showActionMark(element, type = "success") {
    if (!element) return;

    const rect = element.getBoundingClientRect();
    const mark = document.createElement("div");
    mark.className = `action-mark ${type}`;
    mark.textContent = type === "delete" ? "x" : "✓";
    mark.style.left = `${rect.left + rect.width / 2}px`;
    mark.style.top = `${rect.top + rect.height / 2}px`;
    document.body.appendChild(mark);
    window.setTimeout(() => mark.remove(), 2000);
  },

  emptyState(message) {
    return `<div class="empty-state">${Utils.escapeHtml(message)}</div>`;
  }
};

const Charts = {
  baseOptions(extra = {}) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: "rgba(255,255,255,0.95)",
          titleColor: "#17212f",
          bodyColor: "#607086",
          borderColor: "rgba(74, 124, 255, 0.14)",
          borderWidth: 1,
          padding: 12
        }
      },
      scales: {
        x: {
          grid: {
            color: "rgba(163, 179, 204, 0.18)"
          },
          ticks: {
            color: "#8391a6"
          }
        },
        y: {
          grid: {
            color: "rgba(163, 179, 204, 0.18)"
          },
          ticks: {
            color: "#8391a6"
          }
        }
      },
      ...extra
    };
  },

  render(key, canvas, config) {
    if (!canvas || canvas.offsetParent === null || typeof Chart === "undefined") return;
    if (state.charts[key]) {
      state.charts[key].destroy();
    }
    state.charts[key] = new Chart(canvas.getContext("2d"), config);
  }
};

const Weight = {
  bind() {
    dom.weightForm.addEventListener("submit", (event) => {
      event.preventDefault();
      this.handleSubmit();
    });

    dom.weightCancelBtn.addEventListener("click", () => {
      state.ui.weightManualEdit = false;
      this.resetForm();
    });

    dom.weightChartToggle.addEventListener("click", () => {
      state.ui.weightChartVisible = !state.ui.weightChartVisible;
      this.render();
    });

    dom.weightList.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;
      if (button.dataset.action === "edit") this.startEdit(button.dataset.id);
      if (button.dataset.action === "delete") this.deleteEntry(button.dataset.id, button);
    });
  },

  resetForm() {
    const todayEntry = Data.todayWeight();
    state.ui.weightManualEdit = false;

    if (todayEntry) {
      dom.weightEntryId.value = todayEntry.id;
      dom.weightDate.value = todayEntry.date;
      dom.weightValue.value = todayEntry.weight;
      dom.weightNote.value = todayEntry.note || "";
      dom.weightFormTitle.textContent = "Update today’s weight";
      dom.weightSubmitBtn.textContent = "Save Changes";
      dom.weightCancelBtn.hidden = true;
      return;
    }

    dom.weightForm.reset();
    dom.weightEntryId.value = "";
    dom.weightDate.value = Utils.today();
    dom.weightFormTitle.textContent = "Log today’s weight";
    dom.weightSubmitBtn.textContent = "Save Weight";
    dom.weightCancelBtn.hidden = true;
  },

  startEdit(entryId) {
    const entry = state.data.weights.find((item) => item.id === entryId);
    if (!entry) return;

    dom.weightEntryId.value = entry.id;
    dom.weightDate.value = entry.date;
    dom.weightValue.value = entry.weight;
    dom.weightNote.value = entry.note || "";
    dom.weightFormTitle.textContent = "Edit weight entry";
    dom.weightSubmitBtn.textContent = "Save Changes";
    dom.weightCancelBtn.hidden = entry.date === Utils.today();
    state.ui.weightManualEdit = entry.date !== Utils.today();
    dom.weightForm.scrollIntoView({ behavior: "smooth", block: "start" });
  },

  handleSubmit() {
    const id = dom.weightEntryId.value;
    const date = dom.weightDate.value;
    const weight = Number(dom.weightValue.value);
    const note = dom.weightNote.value.trim();

    if (!date || !Number.isFinite(weight) || weight < 20 || weight > 400) {
      UI.showToast("Enter a valid date and weight.", "error");
      return;
    }

    const duplicate = state.data.weights.find((entry) => entry.date === date && entry.id !== id);
    if (duplicate) {
      UI.showToast("There is already a weight entry for that date.", "error");
      return;
    }

    const payload = {
      id: id || Utils.id("weight"),
      date,
      weight: Utils.round(weight, 1),
      note
    };

    if (id) {
      state.data.weights = state.data.weights.map((entry) => (entry.id === id ? payload : entry));
      if (App.commit("")) {
        UI.showActionMark(dom.weightSubmitBtn, "success");
        this.resetForm();
      }
      return;
    }

    state.data.weights.push(payload);
    if (App.commit("")) {
      UI.showActionMark(dom.weightSubmitBtn, "success");
      this.resetForm();
    }
  },

  deleteEntry(entryId, button) {
    if (!window.confirm("Delete this weight entry?")) return;
    state.data.weights = state.data.weights.filter((entry) => entry.id !== entryId);
    if (App.commit("")) {
      UI.showActionMark(button, "delete");
      this.resetForm();
    }
  },

  renderHero() {
    const latest = Data.latestWeight();
    const delta = Data.weightDelta();

    dom.weightCurrentValue.textContent = latest ? Utils.formatWeight(latest.weight) : "--";
    dom.weightCurrentMeta.textContent = latest
      ? `Latest check-in • ${Utils.formatLongDate(latest.date)}`
      : "No weight logged yet.";

    dom.weightDeltaBadge.className = "soft-badge";
    if (delta === null) {
      dom.weightDeltaBadge.textContent = "Fresh start";
      dom.weightDeltaBadge.classList.add("neutral");
      return;
    }

    dom.weightDeltaBadge.textContent = Utils.formatSignedWeight(delta);
    dom.weightDeltaBadge.classList.add(delta < 0 ? "positive" : delta > 0 ? "warning" : "neutral");
  },

  renderList() {
    const entries = Data.recentWeights();
    dom.weightList.innerHTML = entries.length
      ? entries
          .map((entry) => `
            <div class="compact-item">
              <div class="compact-main">
                <div class="compact-title">${Utils.formatWeight(entry.weight)}</div>
                <div class="compact-meta">${Utils.formatLongDate(entry.date)}${entry.note ? ` • ${Utils.escapeHtml(entry.note)}` : ""}</div>
              </div>
              <div class="compact-actions">
                <button class="icon-button" type="button" data-action="edit" data-id="${entry.id}">Edit</button>
                <button class="icon-button danger" type="button" data-action="delete" data-id="${entry.id}">Delete</button>
              </div>
            </div>
          `)
          .join("")
      : UI.emptyState("Your recent weights will appear here.");
  },

  renderChart() {
    dom.weightChartPanel.hidden = !state.ui.weightChartVisible;
    dom.weightChartToggle.classList.toggle("is-active", state.ui.weightChartVisible);
    dom.weightChartToggle.setAttribute("aria-pressed", String(state.ui.weightChartVisible));
    dom.weightChartToggle.textContent = state.ui.weightChartVisible ? "Hide Graph" : "Show Graph";

    const points = Data.weightsAsc();
    if (!state.ui.weightChartVisible) return;
    if (!points.length) {
      if (state.charts.weight) {
        state.charts.weight.destroy();
        delete state.charts.weight;
      }
      dom.weightChartPanel.innerHTML = UI.emptyState("Log your first weight to start the trend line.");
      return;
    }

    if (!dom.weightChartPanel.querySelector("#weight-chart")) {
      dom.weightChartPanel.innerHTML = '<canvas id="weight-chart"></canvas>';
      dom.weightChart = dom.weightChartPanel.querySelector("#weight-chart");
    }

    Charts.render("weight", dom.weightChart, {
      type: "line",
      data: {
        labels: points.map((entry) => Utils.formatDate(entry.date)),
        datasets: [
          {
            data: points.map((entry) => entry.weight),
            borderColor: "#4a7cff",
            backgroundColor: "rgba(74, 124, 255, 0.12)",
            borderWidth: 3,
            tension: 0.35,
            fill: true,
            pointRadius: 2.8,
            pointHoverRadius: 4
          }
        ]
      },
      options: Charts.baseOptions({
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: "#8a97aa" }
          },
          y: {
            grid: { color: "rgba(163, 179, 204, 0.16)" },
            ticks: {
              color: "#8a97aa",
              callback(value) {
                return `${value} kg`;
              }
            }
          }
        }
      })
    });
  },

  render() {
    this.renderHero();
    this.renderList();
    this.renderChart();
  }
};

const Workout = {
  bind() {
    dom.workoutView.addEventListener("click", (event) => {
      const actionButton = event.target.closest("button[data-action]");
      if (!actionButton) return;
      this.handleAction(actionButton);
    });

    dom.workoutView.addEventListener("submit", (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      event.preventDefault();
      this.handleSubmit(form);
    });

    dom.workoutView.addEventListener("input", (event) => {
      this.handleInput(event.target);
    });

    dom.workoutView.addEventListener("change", (event) => {
      this.handleInput(event.target);
    });
  },

  ensureState() {
    if (!Data.hasWorkoutSetup()) {
      state.ui.workoutView = "setup";
      if (!state.ui.workoutDraft) {
        this.startSetup(false);
      }
    } else if (state.ui.workoutView === "setup" && !state.ui.workoutLogDraft) {
      state.ui.workoutView = "home";
      state.ui.workoutDraft = null;
    }

    if (!state.ui.workoutQuickDayId) {
      state.ui.workoutQuickDayId =
        Data.todayAssignedWorkout()?.id || Data.workoutDays()[0]?.id || "";
    }

    const options = Data.exerciseOptions();
    if (!options.includes(state.ui.selectedWorkoutExercise)) {
      state.ui.selectedWorkoutExercise = options[0] || "";
    }
  },

  blankSet() {
    return {
      reps: "",
      weight: ""
    };
  },

  suggestionList(dayName) {
    return EXERCISE_SUGGESTIONS[dayName] || EXERCISE_SUGGESTIONS.Default;
  },

  createDraftFromSetup() {
    if (Data.hasWorkoutSetup()) {
      return Utils.clone({
        splitType: state.data.workoutSetup.splitType,
        customSplitName: state.data.workoutSetup.customSplitName,
        days: state.data.workoutSetup.days
      });
    }

    return {
      splitType: "",
      customSplitName: "",
      days: []
    };
  },

  buildDaysForSplit(splitType) {
    if (splitType === "Other") {
      return Array.from({ length: 3 }, () => ({
        id: Utils.id("day"),
        name: "",
        weekday: "",
        exercises: []
      }));
    }

    return (SPLIT_PRESETS[splitType] || []).map((name) => ({
      id: Utils.id("day"),
      name,
      weekday: "",
      exercises: [...this.suggestionList(name)]
    }));
  },

  startSetup(fromExisting = false) {
    state.ui.workoutDraft = fromExisting ? this.createDraftFromSetup() : this.createDraftFromSetup();
    state.ui.workoutSetupStep = 1;
    state.ui.workoutSetupIndex = 0;
    state.ui.workoutView = "setup";
    this.render();
  },

  createLogDraftFromDay(day) {
    return {
      id: "",
      dayId: day.id,
      dayName: day.name,
      date: Utils.today(),
      notes: "",
      exercises: day.exercises.map((name) => ({
        id: Utils.id("exercise"),
        name,
        sets: [this.blankSet(), this.blankSet(), this.blankSet()]
      }))
    };
  },

  createLogDraftFromLog(log) {
    return {
      id: log.id,
      dayId: log.dayId,
      dayName: log.dayName,
      date: log.date,
      notes: log.notes || "",
      exercises: log.exercises.map((exercise) => ({
        id: exercise.id,
        name: exercise.name,
        sets: exercise.sets.map((set) => ({
          reps: String(set.reps),
          weight: String(set.weight)
        }))
      }))
    };
  },

  openLogger(dayId) {
    const day = Data.findWorkoutDay(dayId);
    if (!day) {
      UI.showToast("Choose a workout day before opening the logger.", "error");
      return;
    }

    state.ui.workoutQuickDayId = dayId;
    state.ui.workoutLogDraft = this.createLogDraftFromDay(day);
    state.ui.workoutView = "log";
    this.render();
  },

  openLoggerForEdit(logId) {
    const log = Data.findWorkoutLog(logId);
    if (!log) return;
    state.ui.workoutLogDraft = this.createLogDraftFromLog(log);
    state.ui.workoutView = "log";
    this.render();
  },

  closeLogger() {
    state.ui.workoutLogDraft = null;
    state.ui.workoutView = Data.hasWorkoutSetup() ? "home" : "setup";
    this.render();
  },

  handleSubmit(form) {
    if (form.id === "setup-step-1-form") {
      this.submitStepOne(form);
      return;
    }

    if (form.id === "setup-step-2-form") {
      this.submitStepTwo(form);
      return;
    }

    if (form.id === "workout-log-form") {
      this.saveWorkoutLog();
    }
  },

  handleInput(target) {
    if (!(target instanceof HTMLElement)) return;

    if (target.id === "quick-log-day") {
      state.ui.workoutQuickDayId = target.value;
      return;
    }

    if (target.id === "workout-chart-exercise") {
      state.ui.selectedWorkoutExercise = target.value;
      this.renderChart();
      return;
    }

    if (target.id === "log-date" && state.ui.workoutLogDraft) {
      state.ui.workoutLogDraft.date = target.value;
      return;
    }

    if (target.id === "log-note" && state.ui.workoutLogDraft) {
      state.ui.workoutLogDraft.notes = target.value;
      return;
    }

    if (target.dataset.exerciseIndex && target.dataset.setIndex && target.dataset.field && state.ui.workoutLogDraft) {
      const exercise = state.ui.workoutLogDraft.exercises[Number(target.dataset.exerciseIndex)];
      const set = exercise?.sets[Number(target.dataset.setIndex)];
      if (!set) return;
      set[target.dataset.field] = target.value;
    }
  },

  handleAction(button) {
    const { action } = button.dataset;

    if (action === "select-split") {
      state.ui.workoutDraft.splitType = button.dataset.value;
      if (button.dataset.value !== "Other") {
        state.ui.workoutDraft.customSplitName = "";
      }
      this.render();
      return;
    }

    if (action === "setup-back-to-split") {
      state.ui.workoutSetupStep = 1;
      this.render();
      return;
    }

    if (action === "setup-back-to-mapping") {
      state.ui.workoutSetupStep = 2;
      this.render();
      return;
    }

    if (action === "setup-add-exercise") {
      const input = dom.workoutView.querySelector("#setup-exercise-input");
      const value = input?.value.trim();
      if (!value) return;
      this.addExerciseToDraftDay(value);
      if (input) input.value = "";
      return;
    }

    if (action === "setup-add-suggested") {
      this.addExerciseToDraftDay(button.dataset.value);
      return;
    }

    if (action === "setup-remove-exercise") {
      const day = state.ui.workoutDraft.days[state.ui.workoutSetupIndex];
      day.exercises.splice(Number(button.dataset.index), 1);
      this.render();
      return;
    }

    if (action === "setup-prev-day") {
      state.ui.workoutSetupIndex = Math.max(0, state.ui.workoutSetupIndex - 1);
      this.render();
      return;
    }

    if (action === "setup-next-day") {
      if (!this.ensureCurrentDayHasExercises()) return;
      state.ui.workoutSetupIndex += 1;
      this.render();
      return;
    }

    if (action === "setup-finish") {
      if (!this.ensureCurrentDayHasExercises()) return;
      this.finishSetup();
      return;
    }

    if (action === "open-quick-log") {
      const select = dom.workoutView.querySelector("#quick-log-day");
      this.openLogger(select?.value || state.ui.workoutQuickDayId);
      return;
    }

    if (action === "open-today-log") {
      this.openLogger(button.dataset.dayId);
      return;
    }

    if (action === "edit-setup") {
      this.startSetup(true);
      return;
    }

    if (action === "toggle-workout-chart") {
      state.ui.workoutChartVisible = !state.ui.workoutChartVisible;
      this.render();
      return;
    }

    if (action === "edit-log") {
      this.openLoggerForEdit(button.dataset.id);
      return;
    }

    if (action === "delete-log") {
      if (!window.confirm("Delete this workout log?")) return;
      state.data.workoutLogs = state.data.workoutLogs.filter((log) => log.id !== button.dataset.id);
      App.commit("Workout deleted.");
      return;
    }

    if (action === "close-log") {
      this.closeLogger();
      return;
    }

    if (action === "log-add-set") {
      const exercise = state.ui.workoutLogDraft?.exercises[Number(button.dataset.exerciseIndex)];
      if (!exercise) return;
      exercise.sets.push(this.blankSet());
      this.render();
      return;
    }

    if (action === "log-remove-set") {
      const exercise = state.ui.workoutLogDraft?.exercises[Number(button.dataset.exerciseIndex)];
      if (!exercise) return;
      if (exercise.sets.length === 1) {
        exercise.sets[0] = this.blankSet();
      } else {
        exercise.sets.splice(Number(button.dataset.setIndex), 1);
      }
      this.render();
      return;
    }

    if (action === "log-add-exercise") {
      const input = dom.workoutView.querySelector("#log-extra-exercise");
      const value = input?.value.trim();
      if (!value) {
        UI.showToast("Add a name for the extra exercise first.", "error");
        return;
      }
      state.ui.workoutLogDraft.exercises.push({
        id: Utils.id("exercise"),
        name: value,
        sets: [this.blankSet(), this.blankSet(), this.blankSet()]
      });
      if (input) input.value = "";
      this.render();
      return;
    }

    if (action === "log-remove-exercise") {
      state.ui.workoutLogDraft.exercises.splice(Number(button.dataset.exerciseIndex), 1);
      this.render();
    }
  },

  submitStepOne(form) {
    const splitType = state.ui.workoutDraft.splitType;
    const customSplitName = form.querySelector("#setup-custom-name")?.value.trim() || "";
    const previousDays = Utils.clone(state.ui.workoutDraft.days);

    if (!splitType) {
      UI.showToast("Choose a split to continue.", "error");
      return;
    }

    if (splitType === "Other" && !customSplitName) {
      UI.showToast("Give your custom split a name first.", "error");
      return;
    }

    state.ui.workoutDraft.customSplitName = customSplitName;
    if (splitType === "Other" && previousDays.length && state.ui.workoutDraft.splitType === "Other") {
      state.ui.workoutDraft.days = previousDays;
    } else {
      state.ui.workoutDraft.days = this.buildDaysForSplit(splitType).map((day, index) => {
        const previous = previousDays.find((item) => item.name === day.name) || previousDays[index];
        if (!previous) return day;

        return {
          ...day,
          id: previous.id || day.id,
          weekday: previous.weekday || "",
          exercises: previous.exercises?.length ? [...previous.exercises] : [...day.exercises]
        };
      });
    }
    state.ui.workoutSetupStep = 2;
    this.render();
  },

  submitStepTwo(form) {
    const splitType = state.ui.workoutDraft.splitType;
    let days = [];

    if (splitType === "Other") {
      const rows = [...form.querySelectorAll("[data-other-day-row]")];
      days = rows
        .map((row) => ({
          id: row.dataset.dayId || Utils.id("day"),
          name: row.querySelector("[data-other-name]")?.value.trim() || "",
          weekday: row.querySelector("[data-other-weekday]")?.value || "",
          exercises: []
        }))
        .filter((day) => day.name || day.weekday);

      const hasPartial = rows.some((row) => {
        const name = row.querySelector("[data-other-name]")?.value.trim() || "";
        const weekday = row.querySelector("[data-other-weekday]")?.value || "";
        return (name && !weekday) || (!name && weekday);
      });

      if (hasPartial) {
        UI.showToast("Each custom workout row needs both a name and a weekday.", "error");
        return;
      }

      if (!days.length) {
        UI.showToast("Add at least one workout day to continue.", "error");
        return;
      }
    } else {
      const rows = [...form.querySelectorAll("[data-preset-day-row]")];
      days = rows.map((row) => ({
        id: row.dataset.dayId || Utils.id("day"),
        name: row.dataset.dayName,
        weekday: row.querySelector("select")?.value || "",
        exercises: [...this.suggestionList(row.dataset.dayName)]
      }));

      if (days.some((day) => !day.weekday)) {
        UI.showToast("Assign a weekday to each workout day.", "error");
        return;
      }
    }

    const weekdays = days.map((day) => day.weekday);
    if (new Set(weekdays).size !== weekdays.length) {
      UI.showToast("Use each weekday only once for a cleaner plan.", "error");
      return;
    }

    days = days.map((day) => ({
      ...day,
      exercises: day.exercises.length ? day.exercises : [...this.suggestionList(day.name)]
    }));

    state.ui.workoutDraft.days = days;
    state.ui.workoutSetupStep = 3;
    state.ui.workoutSetupIndex = 0;
    this.render();
  },

  ensureCurrentDayHasExercises() {
    const day = state.ui.workoutDraft.days[state.ui.workoutSetupIndex];
    if (!day || !day.exercises.length) {
      UI.showToast("Add at least one default exercise for this day.", "error");
      return false;
    }
    return true;
  },

  addExerciseToDraftDay(name) {
    const day = state.ui.workoutDraft.days[state.ui.workoutSetupIndex];
    if (!day) return;
    if (day.exercises.some((exercise) => exercise.toLowerCase() === name.toLowerCase())) return;
    day.exercises.push(name.trim());
    this.render();
  },

  finishSetup() {
    state.data.workoutSetup = {
      completed: true,
      splitType: state.ui.workoutDraft.splitType,
      customSplitName: state.ui.workoutDraft.customSplitName,
      days: Utils.clone(state.ui.workoutDraft.days)
    };
    state.ui.workoutDraft = null;
    state.ui.workoutView = "home";
    state.ui.workoutQuickDayId =
      Data.todayAssignedWorkout()?.id || Data.workoutDays()[0]?.id || "";
    App.commit("Workout plan saved.");
  },

  normalizeLogDraft() {
    const draft = state.ui.workoutLogDraft;
    if (!draft?.date) {
      throw new Error("Choose a workout date before saving.");
    }

    const exercises = draft.exercises
      .map((exercise) => {
        const sets = exercise.sets
          .map((set, index) => {
            const repsRaw = String(set.reps).trim();
            const weightRaw = String(set.weight).trim();

            if (!repsRaw && !weightRaw) return null;
            if (!repsRaw || !weightRaw) {
              throw new Error(`Complete or clear set ${index + 1} for ${exercise.name}.`);
            }

            const reps = Number(repsRaw);
            const weight = Number(weightRaw);
            if (!Number.isFinite(reps) || !Number.isFinite(weight) || reps < 1 || weight < 0) {
              throw new Error(`Use valid reps and weight values for ${exercise.name}.`);
            }

            return {
              reps,
              weight: Utils.round(weight, 1)
            };
          })
          .filter(Boolean);

        return {
          id: exercise.id || Utils.id("exercise"),
          name: exercise.name.trim(),
          sets
        };
      })
      .filter((exercise) => exercise.name && exercise.sets.length);

    if (!exercises.length) {
      throw new Error("Add at least one completed exercise before saving.");
    }

    return {
      id: draft.id || Utils.id("log"),
      dayId: draft.dayId || Utils.id("day"),
      dayName: draft.dayName || "Workout",
      date: draft.date,
      notes: draft.notes.trim(),
      exercises
    };
  },

  saveWorkoutLog() {
    let payload;
    try {
      payload = this.normalizeLogDraft();
    } catch (error) {
      UI.showToast(error.message, "error");
      return;
    }

    if (payload.id && state.data.workoutLogs.some((log) => log.id === payload.id)) {
      state.data.workoutLogs = state.data.workoutLogs.map((log) => (log.id === payload.id ? payload : log));
    } else {
      state.data.workoutLogs.push(payload);
    }

    state.ui.workoutLogDraft = null;
    state.ui.workoutView = "home";
    state.ui.workoutQuickDayId = payload.dayId;
    App.commit("Workout saved.");
  },

  renderProgressDots(count, activeIndex) {
    return `
      <div class="progress-dots">
        ${Array.from({ length: count }, (_, index) => `
          <span class="progress-dot ${index === activeIndex ? "active" : ""}"></span>
        `).join("")}
      </div>
    `;
  },

  renderSetup() {
    const draft = state.ui.workoutDraft;
    if (!draft) return;

    if (state.ui.workoutSetupStep === 1) {
      dom.workoutView.innerHTML = `
        <form id="setup-step-1-form" class="glass-panel workflow-card">
          <div class="workflow-top">
            <div>
              <p class="section-label">Setup</p>
              <h3>Choose your split</h3>
            </div>
            ${this.renderProgressDots(3, 0)}
          </div>
          <p class="workflow-subtitle">Start with the training pattern you want this app to remember.</p>
          <div class="option-grid">
            ${["Bro Split", "PPL", "Other"]
              .map(
                (option) => `
                  <button class="option-button ${draft.splitType === option ? "active" : ""}" type="button" data-action="select-split" data-value="${option}">
                    ${option}
                  </button>
                `
              )
              .join("")}
          </div>
          ${
            draft.splitType === "Other"
              ? `
                <label>
                  <span>Custom split name</span>
                  <input type="text" id="setup-custom-name" placeholder="Hybrid Upper Lower" value="${Utils.escapeHtml(draft.customSplitName || "")}">
                </label>
              `
              : ""
          }
          <div class="workflow-actions">
            <span class="tiny-copy">Step 1 of 3</span>
            <button class="primary-button" type="submit">Continue</button>
          </div>
        </form>
      `;
      return;
    }

    if (state.ui.workoutSetupStep === 2) {
      dom.workoutView.innerHTML = `
        <form id="setup-step-2-form" class="glass-panel workflow-card">
          <div class="workflow-top">
            <div>
              <p class="section-label">Setup</p>
              <h3>Map your workout days</h3>
            </div>
            ${this.renderProgressDots(3, 1)}
          </div>
          <p class="workflow-subtitle">Match each workout day to the weekday you usually train it.</p>
          <div class="day-assignment-list">
            ${
              draft.splitType === "Other"
                ? draft.days
                    .map(
                      (day) => `
                        <div class="day-assignment-row" data-other-day-row data-day-id="${day.id}">
                          <div class="day-assignment-grid">
                            <label>
                              <span>Workout day</span>
                              <input type="text" data-other-name value="${Utils.escapeHtml(day.name || "")}" placeholder="Upper">
                            </label>
                            <label>
                              <span>Weekday</span>
                              <select data-other-weekday>
                                <option value="">Select</option>
                                ${WEEKDAYS.map(
                                  (weekday) => `
                                    <option value="${weekday}"${weekday === day.weekday ? " selected" : ""}>${weekday}</option>
                                  `
                                ).join("")}
                              </select>
                            </label>
                          </div>
                        </div>
                      `
                    )
                    .join("")
                : draft.days
                    .map(
                      (day) => `
                        <div class="day-assignment-row" data-preset-day-row data-day-id="${day.id}" data-day-name="${Utils.escapeHtml(day.name)}">
                          <div class="compact-main">
                            <div class="compact-title">${Utils.escapeHtml(day.name)}</div>
                            <div class="compact-meta">Choose the weekday you usually run it.</div>
                          </div>
                          <select>
                            <option value="">Select</option>
                            ${WEEKDAYS.map(
                              (weekday) => `
                                <option value="${weekday}"${weekday === day.weekday ? " selected" : ""}>${weekday}</option>
                              `
                            ).join("")}
                          </select>
                        </div>
                      `
                    )
                    .join("")
            }
          </div>
          <div class="workflow-actions">
            <button class="secondary-button" type="button" data-action="setup-back-to-split">Back</button>
            <button class="primary-button" type="submit">Continue</button>
          </div>
        </form>
      `;
      return;
    }

    const day = draft.days[state.ui.workoutSetupIndex];
    const suggestions = this.suggestionList(day.name).filter((exercise) => !day.exercises.includes(exercise));

    dom.workoutView.innerHTML = `
      <article class="glass-panel workflow-card">
        <div class="workflow-top">
          <div>
            <p class="section-label">Setup</p>
            <h3>${Utils.escapeHtml(day.name || `Workout ${state.ui.workoutSetupIndex + 1}`)}</h3>
          </div>
          ${this.renderProgressDots(draft.days.length, state.ui.workoutSetupIndex)}
        </div>
        <p class="workflow-subtitle">${day.weekday ? `${day.weekday}` : "Unassigned"} • Add only the default exercises you want ready every time.</p>
        <div class="chip-row">
          ${
            day.exercises.length
              ? day.exercises
                  .map(
                    (exercise, index) => `
                      <span class="exercise-chip">
                        ${Utils.escapeHtml(exercise)}
                        <button class="text-button" type="button" data-action="setup-remove-exercise" data-index="${index}">x</button>
                      </span>
                    `
                  )
                  .join("")
              : '<div class="empty-state">Add a few defaults to make logging feel instant.</div>'
          }
        </div>
        <label>
          <span>Add exercise</span>
          <input type="text" id="setup-exercise-input" placeholder="Bench Press">
        </label>
        <button class="secondary-button" type="button" data-action="setup-add-exercise">Add Exercise</button>
        ${
          suggestions.length
            ? `
              <div class="chip-row">
                ${suggestions
                  .slice(0, 6)
                  .map(
                    (exercise) => `
                      <button class="chip-button" type="button" data-action="setup-add-suggested" data-value="${Utils.escapeHtml(exercise)}">${Utils.escapeHtml(exercise)}</button>
                    `
                  )
                  .join("")}
              </div>
            `
            : ""
        }
        <div class="workflow-actions">
          <button class="secondary-button" type="button" data-action="setup-back-to-mapping">Back</button>
          ${
            state.ui.workoutSetupIndex > 0
              ? '<button class="secondary-button" type="button" data-action="setup-prev-day">Previous</button>'
              : ""
          }
          ${
            state.ui.workoutSetupIndex < draft.days.length - 1
              ? '<button class="primary-button" type="button" data-action="setup-next-day">Next Day</button>'
              : '<button class="primary-button" type="button" data-action="setup-finish">Finish Setup</button>'
          }
        </div>
      </article>
    `;
  },

  renderHome() {
    const todayDay = Data.todayAssignedWorkout();
    const nextDay = Data.nextAssignedWorkout();
    const quickDayId = state.ui.workoutQuickDayId || todayDay?.id || Data.workoutDays()[0]?.id || "";
    const logs = Data.recentWorkoutLogs();
    const options = Data.exerciseOptions();
    const chartExercise = state.ui.selectedWorkoutExercise;
    const chartPoints = Data.exerciseProgress(chartExercise);

    dom.workoutView.innerHTML = `
      <article class="glass-panel focus-card">
        <p class="section-label">Today</p>
        <div class="workflow-card">
          <h3>${Utils.escapeHtml(todayDay ? `${todayDay.name} day` : "No workout assigned today")}</h3>
          <p class="workflow-subtitle">
            ${
              todayDay
                ? `${todayDay.weekday} • ${todayDay.exercises.length} default exercises ready to log.`
                : nextDay
                  ? `Next up: ${nextDay.name} on ${nextDay.weekday}.`
                  : "Finish setup to get a workout day ready here."
            }
          </p>
          ${
            todayDay
              ? `
                <div class="chip-row">
                  ${todayDay.exercises.slice(0, 5).map((exercise) => `<span class="exercise-chip">${Utils.escapeHtml(exercise)}</span>`).join("")}
                </div>
              `
              : ""
          }
          <div class="workflow-actions">
            ${
              todayDay
                ? `<button class="primary-button" type="button" data-action="open-today-log" data-day-id="${todayDay.id}">Log Today</button>`
                : `<button class="primary-button" type="button" data-action="open-quick-log">Open Logger</button>`
            }
            <button class="text-button" type="button" data-action="edit-setup">Edit Plan</button>
          </div>
        </div>
      </article>

      <article class="glass-panel workflow-card">
        <div class="section-head">
          <div>
            <p class="section-label">Quick Log</p>
            <h3>Choose a workout day</h3>
          </div>
        </div>
        <label>
          <span>Workout day</span>
          <select id="quick-log-day">
            ${Data.workoutDays()
              .map(
                (day) => `
                  <option value="${day.id}"${day.id === quickDayId ? " selected" : ""}>${Utils.escapeHtml(day.name)} • ${day.weekday}</option>
                `
              )
              .join("")}
          </select>
        </label>
        <button class="primary-button" type="button" data-action="open-quick-log">Open Logger</button>
      </article>

      <article class="glass-panel workflow-card">
        <div class="inline-row">
          <div>
            <p class="section-label">Progress</p>
            <h3>Exercise trend</h3>
          </div>
          <button class="toggle-button ${state.ui.workoutChartVisible ? "is-active" : ""}" type="button" data-action="toggle-workout-chart">
            ${state.ui.workoutChartVisible ? "Hide Graph" : "Show Graph"}
          </button>
        </div>
        ${
          state.ui.workoutChartVisible
            ? options.length
              ? `
                <label>
                  <span>Exercise</span>
                  <select id="workout-chart-exercise">
                    ${options
                      .map(
                        (exercise) => `
                          <option value="${Utils.escapeHtml(exercise)}"${exercise === chartExercise ? " selected" : ""}>${Utils.escapeHtml(exercise)}</option>
                        `
                      )
                      .join("")}
                  </select>
                </label>
                ${
                  chartPoints.length
                    ? `
                      <div class="chart-panel">
                        <canvas id="workout-chart"></canvas>
                      </div>
                    `
                    : UI.emptyState("Log this exercise to start seeing progression over time.")
                }
              `
              : UI.emptyState("Log a few sessions first to unlock exercise progress.")
            : ""
        }
      </article>

      <article class="glass-panel workflow-card">
        <div class="section-head">
          <div>
            <p class="section-label">Recent</p>
            <h3>Recent workouts</h3>
          </div>
        </div>
        <div class="compact-list">
          ${
            logs.length
              ? logs
                  .map((log) => {
                    const summary = Data.workoutSummary(log);
                    return `
                      <div class="compact-item">
                        <div class="compact-main">
                          <div class="compact-title">${Utils.escapeHtml(log.dayName)}</div>
                          <div class="compact-meta">${Utils.formatLongDate(log.date)} • ${summary.exerciseCount} exercises • Top set ${Utils.formatWeight(summary.topWeight)}</div>
                        </div>
                        <div class="compact-actions">
                          <button class="icon-button" type="button" data-action="edit-log" data-id="${log.id}">Edit</button>
                          <button class="icon-button danger" type="button" data-action="delete-log" data-id="${log.id}">Delete</button>
                        </div>
                      </div>
                    `;
                  })
                  .join("")
              : UI.emptyState("Your recent workout logs will appear here.")
          }
        </div>
      </article>
    `;

    if (state.ui.workoutChartVisible) {
      this.renderChart();
    }
  },

  renderLog() {
    const draft = state.ui.workoutLogDraft;
    if (!draft) return;

    dom.workoutView.innerHTML = `
      <form id="workout-log-form" class="glass-panel workflow-card">
        <div class="workflow-top">
          <div>
            <p class="section-label">${Utils.escapeHtml(draft.dayName)}</p>
            <h3>${draft.id ? "Edit session" : "Log your workout"}</h3>
          </div>
          <button class="text-button" type="button" data-action="close-log">Back</button>
        </div>

        <div class="log-top-fields">
          <label class="log-field-card">
            <span>Date</span>
            <input type="date" id="log-date" value="${draft.date}">
          </label>

          <label class="log-field-card">
            <span>Session note</span>
            <textarea id="log-note" rows="2" placeholder="Optional">${Utils.escapeHtml(draft.notes || "")}</textarea>
          </label>
        </div>

        <div class="log-exercise-list">
          ${draft.exercises
            .map(
              (exercise, exerciseIndex) => `
                <div class="log-exercise-card">
                  <div class="section-head">
                    <div>
                      <p class="section-label">Exercise ${exerciseIndex + 1}</p>
                      <h3>${Utils.escapeHtml(exercise.name)}</h3>
                    </div>
                    <div class="exercise-actions">
                      <button class="text-button" type="button" data-action="log-add-set" data-exercise-index="${exerciseIndex}">Add Set</button>
                      <button class="text-button" type="button" data-action="log-remove-exercise" data-exercise-index="${exerciseIndex}">Remove</button>
                    </div>
                  </div>
                  <div class="set-list">
                    ${exercise.sets
                      .map(
                        (set, setIndex) => `
                          <div class="set-row">
                            <span class="set-index">Set ${setIndex + 1}</span>
                            <div class="set-fields">
                              <label>
                                <span>Reps</span>
                                <input type="number" min="0" data-exercise-index="${exerciseIndex}" data-set-index="${setIndex}" data-field="reps" value="${Utils.escapeHtml(set.reps)}" placeholder="-">
                              </label>
                              <label>
                                <span>Weight</span>
                                <input type="number" min="0" step="0.5" data-exercise-index="${exerciseIndex}" data-set-index="${setIndex}" data-field="weight" value="${Utils.escapeHtml(set.weight)}" placeholder="-">
                              </label>
                            </div>
                            <button class="icon-button" type="button" data-action="log-remove-set" data-exercise-index="${exerciseIndex}" data-set-index="${setIndex}">X</button>
                          </div>
                        `
                      )
                      .join("")}
                  </div>
                </div>
              `
            )
            .join("")}
        </div>

        <div class="log-field-card">
          <label>
            <span>Add another exercise</span>
            <input type="text" id="log-extra-exercise" placeholder="Optional">
          </label>
          <button class="secondary-button" type="button" data-action="log-add-exercise">Add Exercise</button>
        </div>

        <div class="workflow-actions">
          <button class="secondary-button" type="button" data-action="close-log">Back</button>
          <button class="primary-button" type="submit">${draft.id ? "Save Changes" : "Save Workout"}</button>
        </div>
      </form>
    `;
  },

  renderChart() {
    if (state.ui.workoutView !== "home" || !state.ui.workoutChartVisible) return;
    const points = Data.exerciseProgress(state.ui.selectedWorkoutExercise);
    if (!points.length) return;
    const canvas = dom.workoutView.querySelector("#workout-chart");
    if (!canvas) return;

    Charts.render("workout", canvas, {
      type: "line",
      data: {
        labels: points.map((entry) => Utils.formatDate(entry.date)),
        datasets: [
          {
            data: points.map((entry) => entry.maxWeight),
            borderColor: "#4a7cff",
            backgroundColor: "rgba(74, 124, 255, 0.10)",
            borderWidth: 3,
            tension: 0.34,
            fill: true,
            pointRadius: 2.8
          }
        ]
      },
      options: Charts.baseOptions({
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: "#8a97aa" }
          },
          y: {
            grid: { color: "rgba(163, 179, 204, 0.16)" },
            ticks: {
              color: "#8a97aa",
              callback(value) {
                return `${value} kg`;
              }
            }
          }
        }
      })
    });
  },

  render() {
    this.ensureState();
    if (state.ui.activeTab === "workout") {
      UI.updateHeader();
    }

    if (!Data.hasWorkoutSetup() || state.ui.workoutView === "setup") {
      this.renderSetup();
      return;
    }

    if (state.ui.workoutView === "log") {
      this.renderLog();
      return;
    }

    this.renderHome();
  }
};

const Settings = {
  bind() {
    dom.profileForm.addEventListener("submit", (event) => {
      event.preventDefault();
      this.saveProfile();
    });
  },

  saveProfile() {
    state.data.profile = {
      name: dom.profileName.value.trim(),
      age: dom.profileAge.value.trim(),
      height: dom.profileHeight.value.trim(),
      startingWeight: dom.profileStartingWeight.value.trim()
    };
    App.commit("Profile saved.");
  },

  render() {
    dom.profileName.value = state.data.profile.name || "";
    dom.profileAge.value = state.data.profile.age || "";
    dom.profileHeight.value = state.data.profile.height || "";
    dom.profileStartingWeight.value = state.data.profile.startingWeight || "";
  }
};

const App = {
  init() {
    UI.cache();
    state.data = Storage.load();
    if (
      state.data.weights.length &&
      state.data.weights.every((entry) => entry.id.startsWith("weight-demo-")) &&
      !state.data.workoutLogs.length &&
      !state.data.workoutSetup.completed
    ) {
      state.data.weights = [];
      state.data.profile.startingWeight = "";
      Storage.save(state.data);
    }
    UI.bindGlobal();
    Weight.bind();
    Workout.bind();
    Settings.bind();
    Weight.resetForm();
    UI.renderTabs();
    UI.showGreeting();
    this.render();
  },

  dismissGreeting() {
    state.data.meta.hasSeenGreeting = true;
    if (this.commit("")) {
      dom.welcomeScreen.classList.add("is-hidden");
    }
  },

  commit(message) {
    try {
      Storage.save(state.data);
      this.render();
      if (message) UI.showToast(message);
      return true;
    } catch (error) {
      state.data = Storage.load();
      this.render();
      UI.showToast(
        Utils.quotaError(error)
          ? "Storage is full. Remove a few entries and try again."
          : "The latest change could not be saved.",
        "error"
      );
      return false;
    }
  },

  render() {
    UI.renderTabs();
    UI.updateHeader();
    UI.showGreeting();
    Weight.render();
    Workout.render();
    Settings.render();
  }
};

document.addEventListener("DOMContentLoaded", () => {
  App.init();
});
