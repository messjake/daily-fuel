const STORAGE_KEY = "dailyFuelState.v1";
const HISTORY_DAYS = 31;

const defaults = {
  foods: [],
  logs: {},
  targets: {
    calories: 2000,
    protein: 150,
    carbs: 220,
    fat: 70,
    tolerance: 10
  }
};

let state = loadState();
let selectedDate = todayKey();
let activeView = "today";
let addMode = "manual";

const el = (selector) => document.querySelector(selector);
const els = (selector) => Array.from(document.querySelectorAll(selector));

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!stored || typeof stored !== "object") {
      return cloneDefaults();
    }

    return {
      foods: Array.isArray(stored.foods) ? stored.foods : [],
      logs: stored.logs && typeof stored.logs === "object" ? stored.logs : {},
      targets: { ...defaults.targets, ...(stored.targets || {}) }
    };
  } catch {
    return cloneDefaults();
  }
}

function cloneDefaults() {
  return JSON.parse(JSON.stringify(defaults));
}

function saveState() {
  pruneLogs();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function todayKey() {
  return dateKey(new Date());
}

function dateKey(date) {
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const year = local.getFullYear();
  const month = String(local.getMonth() + 1).padStart(2, "0");
  const day = String(local.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(key, amount) {
  const date = dateFromKey(key);
  date.setDate(date.getDate() + amount);
  return dateKey(date);
}

function minLogDate() {
  return addDays(todayKey(), -(HISTORY_DAYS - 1));
}

function clampDateKey(key) {
  if (key < minLogDate()) return minLogDate();
  if (key > todayKey()) return todayKey();
  return key;
}

function pruneLogs() {
  const min = minLogDate();
  const max = todayKey();
  for (const key of Object.keys(state.logs)) {
    if (key < min || key > max) {
      delete state.logs[key];
    }
  }
}

function uid() {
  if (window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function numberValue(id) {
  const value = Number.parseFloat(el(id).value);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function formatNumber(value, decimals = 0) {
  const rounded = Number(value.toFixed(decimals));
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: 0
  }).format(rounded);
}

function formatMacro(value) {
  return formatNumber(value, value % 1 === 0 ? 0 : 1);
}

function formatDateLabel(key) {
  const today = todayKey();
  if (key === today) return "Today";
  if (key === addDays(today, -1)) return "Yesterday";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric"
  }).format(dateFromKey(key));
}

function getEntries(key = selectedDate) {
  return state.logs[key] || [];
}

function getTotals(key = selectedDate) {
  return getEntries(key).reduce((totals, entry) => {
    totals.calories += entry.calories || 0;
    totals.protein += entry.protein || 0;
    totals.carbs += entry.carbs || 0;
    totals.fat += entry.fat || 0;
    return totals;
  }, { calories: 0, protein: 0, carbs: 0, fat: 0 });
}

function metricTargets() {
  return [
    ["calories", Number(state.targets.calories) || 0],
    ["protein", Number(state.targets.protein) || 0],
    ["carbs", Number(state.targets.carbs) || 0],
    ["fat", Number(state.targets.fat) || 0]
  ];
}

function dayStatus(key) {
  const entries = getEntries(key);
  if (!entries.length) {
    return { state: "empty", label: "No entries" };
  }

  const totals = getTotals(key);
  const tolerance = (Number(state.targets.tolerance) || 0) / 100;
  const activeTargets = metricTargets().filter(([, target]) => target > 0);

  if (!activeTargets.length) {
    return { state: "mixed", label: "Targets unset" };
  }

  const comparisons = activeTargets.map(([metric, target]) => {
    const low = target * (1 - tolerance);
    const high = target * (1 + tolerance);
    const total = totals[metric];
    if (total < low) return "under";
    if (total > high) return "over";
    return "in";
  });

  if (comparisons.every((item) => item === "in")) {
    return { state: "in", label: "In range" };
  }

  if (comparisons.every((item) => item === "under" || item === "in")) {
    return { state: "under", label: "Below target" };
  }

  if (comparisons.every((item) => item === "over" || item === "in")) {
    return { state: "over", label: "Above target" };
  }

  return { state: "mixed", label: "Mixed macros" };
}

function historyKeys() {
  const keys = [];
  let current = minLogDate();
  while (current <= todayKey()) {
    keys.push(current);
    current = addDays(current, 1);
  }
  return keys;
}

function render() {
  selectedDate = clampDateKey(selectedDate);
  pruneLogs();
  renderHeader();
  renderSummary();
  renderEntries();
  renderFoods();
  renderFoodSelect();
  renderMonth();
  renderActiveView();
}

function renderHeader() {
  el("#dateTitle").textContent = formatDateLabel(selectedDate);
  el("#logDate").min = minLogDate();
  el("#logDate").max = todayKey();
  el("#logDate").value = selectedDate;
  el("#prevDay").disabled = selectedDate <= minLogDate();
  el("#nextDay").disabled = selectedDate >= todayKey();
}

function renderSummary() {
  const totals = getTotals();
  renderMetric("calories", totals.calories, state.targets.calories, "kcal", 0);
  renderMetric("protein", totals.protein, state.targets.protein, "g", 1);
  renderMetric("carbs", totals.carbs, state.targets.carbs, "g", 1);
  renderMetric("fat", totals.fat, state.targets.fat, "g", 1);

  const status = dayStatus(selectedDate);
  const statusEl = el("#rangeStatus");
  statusEl.className = `status-text is-${status.state}`;
  statusEl.textContent = status.label;
}

function renderMetric(metric, total, target, unit, decimals) {
  const percent = target > 0 ? Math.round((total / target) * 100) : 0;
  const cappedPercent = Math.max(0, Math.min(percent, 130));
  const unitText = unit === "kcal" ? " kcal" : unit;
  const remaining = target - total;
  const remainingLabel = target > 0
    ? `${formatNumber(Math.abs(remaining), decimals)} ${remaining >= 0 ? "left" : "over"}`
    : `${formatNumber(total, decimals)} logged`;

  el(`#${metric}Total`).textContent = formatNumber(total, decimals);
  el(`#${metric}Percent`).textContent = `${percent}%`;
  el(`#${metric}Progress`).style.width = `${Math.min(cappedPercent, 100)}%`;
  el(`#${metric}Remaining`).textContent = remainingLabel;
  el(`#${metric}Target`).textContent = `of ${formatNumber(target, decimals)}${unitText}`;
}

function renderEntries() {
  const list = el("#entriesList");
  const entries = getEntries();

  if (!entries.length) {
    list.innerHTML = '<div class="empty-state">No entries for this day.</div>';
    return;
  }

  list.innerHTML = entries.map((entry) => `
    <article class="list-item" data-entry-id="${entry.id}">
      <div class="list-main">
        <h3>${escapeHtml(entry.label)}</h3>
        <p>${formatNumber(entry.calories, 0)} kcal | P ${formatMacro(entry.protein)}g | C ${formatMacro(entry.carbs)}g | F ${formatMacro(entry.fat)}g</p>
      </div>
      <div class="item-actions">
        <button class="danger" type="button" data-delete-entry="${entry.id}">Delete</button>
      </div>
    </article>
  `).join("");
}

function renderFoods() {
  const query = el("#foodSearch").value.trim().toLowerCase();
  const foods = [...state.foods]
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter((food) => !query || food.name.toLowerCase().includes(query) || food.unit.toLowerCase().includes(query));

  if (!foods.length) {
    el("#foodList").innerHTML = '<div class="empty-state">No foods saved.</div>';
    return;
  }

  el("#foodList").innerHTML = foods.map((food) => `
    <article class="list-item" data-food-id="${food.id}">
      <div class="list-main">
        <h3>${escapeHtml(food.name)}</h3>
        <p>Per ${escapeHtml(food.unit)}: ${formatNumber(food.calories, 0)} kcal | P ${formatMacro(food.protein)}g | C ${formatMacro(food.carbs)}g | F ${formatMacro(food.fat)}g</p>
      </div>
      <div class="item-actions">
        <button type="button" data-edit-food="${food.id}">Edit</button>
        <button class="danger" type="button" data-delete-food="${food.id}">Delete</button>
      </div>
    </article>
  `).join("");
}

function renderFoodSelect() {
  const select = el("#foodSelect");
  const selected = select.value;
  const foods = [...state.foods].sort((a, b) => a.name.localeCompare(b.name));

  if (!foods.length) {
    select.innerHTML = '<option value="">No foods saved</option>';
    select.disabled = true;
    el("#addFoodEntryButton").disabled = true;
    renderFoodPreview();
    return;
  }

  select.disabled = false;
  el("#addFoodEntryButton").disabled = false;
  select.innerHTML = foods.map((food) => `<option value="${food.id}">${escapeHtml(food.name)} / ${escapeHtml(food.unit)}</option>`).join("");

  if (foods.some((food) => food.id === selected)) {
    select.value = selected;
  }
  renderFoodPreview();
}

function renderFoodPreview() {
  const food = state.foods.find((item) => item.id === el("#foodSelect").value);
  const quantity = Number.parseFloat(el("#foodQuantity").value) || 0;

  if (!food || quantity <= 0) {
    el("#foodPreview").textContent = "0 kcal | P 0g | C 0g | F 0g";
    return;
  }

  el("#foodPreview").textContent = `${formatNumber(food.calories * quantity, 0)} kcal | P ${formatMacro(food.protein * quantity)}g | C ${formatMacro(food.carbs * quantity)}g | F ${formatMacro(food.fat * quantity)}g`;
}

function renderMonth() {
  const keys = historyKeys();
  const daysInRange = keys.filter((key) => dayStatus(key).state === "in").length;
  const loggedDays = keys.filter((key) => getEntries(key).length).length;

  el("#monthSummary").textContent = `${daysInRange} of ${loggedDays} logged days in range`;
  el("#monthChart").innerHTML = keys.map((key) => {
    const totals = getTotals(key);
    const target = Number(state.targets.calories) || 1;
    const percent = Math.max(4, Math.min(100, (totals.calories / target) * 100));
    const status = dayStatus(key);
    const dayNumber = dateFromKey(key).getDate();
    const aria = `${formatDateLabel(key)}: ${status.label}, ${formatNumber(totals.calories, 0)} calories`;

    return `
      <button class="day-bar is-${status.state}${key === selectedDate ? " is-selected" : ""}" type="button" data-select-date="${key}" aria-label="${aria}">
        <span class="bar-fill" style="height: ${percent}%"></span>
        <span class="day-label">${dayNumber}</span>
      </button>
    `;
  }).join("");

  const history = [...keys].reverse();
  el("#historyList").innerHTML = history.map((key) => {
    const totals = getTotals(key);
    const status = dayStatus(key);
    return `
      <article class="list-item" data-select-date="${key}">
        <div class="list-main">
          <h3>${formatDateLabel(key)}</h3>
          <p>${formatNumber(totals.calories, 0)} kcal | P ${formatMacro(totals.protein)}g | C ${formatMacro(totals.carbs)}g | F ${formatMacro(totals.fat)}g</p>
        </div>
        <div class="history-meta">${status.label}</div>
      </article>
    `;
  }).join("");
}

function renderActiveView() {
  els("[data-view-panel]").forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.viewPanel === activeView);
  });

  els("[data-view]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === activeView);
  });

  els("[data-add-panel]").forEach((panel) => {
    panel.classList.toggle("is-hidden", panel.dataset.addPanel !== addMode);
  });

  els("[data-add-mode]").forEach((button) => {
    button.classList.toggle("is-selected", button.dataset.addMode === addMode);
  });
}

function syncTargetForm() {
  el("#targetCalories").value = state.targets.calories;
  el("#targetProtein").value = state.targets.protein;
  el("#targetCarbs").value = state.targets.carbs;
  el("#targetFat").value = state.targets.fat;
  el("#targetToleranceRange").value = state.targets.tolerance;
  el("#targetTolerance").value = state.targets.tolerance;
}

function resetFoodForm() {
  el("#foodId").value = "";
  el("#foodName").value = "";
  el("#foodUnit").value = "";
  el("#foodCalories").value = "";
  el("#foodProtein").value = "";
  el("#foodCarbs").value = "";
  el("#foodFat").value = "";
  el("#foodSaveButton").textContent = "Save Food";
  el("#foodCancelButton").classList.add("is-hidden");
}

function editFood(id) {
  const food = state.foods.find((item) => item.id === id);
  if (!food) return;

  el("#foodId").value = food.id;
  el("#foodName").value = food.name;
  el("#foodUnit").value = food.unit;
  el("#foodCalories").value = food.calories;
  el("#foodProtein").value = food.protein;
  el("#foodCarbs").value = food.carbs;
  el("#foodFat").value = food.fat;
  el("#foodSaveButton").textContent = "Update Food";
  el("#foodCancelButton").classList.remove("is-hidden");
  activeView = "foods";
  render();
  el("#foodName").focus();
}

function deleteFood(id) {
  if (!window.confirm("Delete this food?")) {
    return;
  }
  state.foods = state.foods.filter((food) => food.id !== id);
  saveState();
  render();
}

function addEntry(entry) {
  if (!state.logs[selectedDate]) {
    state.logs[selectedDate] = [];
  }
  state.logs[selectedDate].push(entry);
  saveState();
  render();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function bindEvents() {
  el("#prevDay").addEventListener("click", () => {
    selectedDate = clampDateKey(addDays(selectedDate, -1));
    render();
  });

  el("#nextDay").addEventListener("click", () => {
    selectedDate = clampDateKey(addDays(selectedDate, 1));
    render();
  });

  el("#logDate").addEventListener("change", (event) => {
    selectedDate = clampDateKey(event.target.value || todayKey());
    render();
  });

  els("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      activeView = button.dataset.view;
      render();
    });
  });

  els("[data-add-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      addMode = button.dataset.addMode;
      render();
    });
  });

  el("#manualForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const calories = numberValue("#manualCalories");
    const protein = numberValue("#manualProtein");
    const carbs = numberValue("#manualCarbs");
    const fat = numberValue("#manualFat");
    if (calories + protein + carbs + fat <= 0) return;

    addEntry({
      id: uid(),
      source: "manual",
      label: el("#manualNote").value.trim() || "Manual entry",
      calories,
      protein,
      carbs,
      fat,
      createdAt: new Date().toISOString()
    });

    el("#manualForm").reset();
  });

  el("#foodLogForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const food = state.foods.find((item) => item.id === el("#foodSelect").value);
    const quantity = Number.parseFloat(el("#foodQuantity").value) || 0;
    if (!food || quantity <= 0) return;

    addEntry({
      id: uid(),
      source: "food",
      foodId: food.id,
      label: `${food.name} (${formatMacro(quantity)} ${food.unit})`,
      calories: food.calories * quantity,
      protein: food.protein * quantity,
      carbs: food.carbs * quantity,
      fat: food.fat * quantity,
      quantity,
      unit: food.unit,
      createdAt: new Date().toISOString()
    });

    el("#foodQuantity").value = "1";
    renderFoodPreview();
  });

  el("#foodForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const id = el("#foodId").value || uid();
    const food = {
      id,
      name: el("#foodName").value.trim(),
      unit: el("#foodUnit").value.trim(),
      calories: numberValue("#foodCalories"),
      protein: numberValue("#foodProtein"),
      carbs: numberValue("#foodCarbs"),
      fat: numberValue("#foodFat")
    };

    if (!food.name || !food.unit) return;

    const existingIndex = state.foods.findIndex((item) => item.id === id);
    if (existingIndex >= 0) {
      state.foods[existingIndex] = food;
    } else {
      state.foods.push(food);
    }

    saveState();
    resetFoodForm();
    render();
  });

  el("#foodCancelButton").addEventListener("click", () => {
    resetFoodForm();
  });

  el("#foodSearch").addEventListener("input", renderFoods);

  el("#foodList").addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-edit-food]");
    const deleteButton = event.target.closest("[data-delete-food]");
    if (editButton) {
      editFood(editButton.dataset.editFood);
    }
    if (deleteButton) {
      deleteFood(deleteButton.dataset.deleteFood);
    }
  });

  el("#entriesList").addEventListener("click", (event) => {
    const deleteButton = event.target.closest("[data-delete-entry]");
    if (!deleteButton) return;
    if (!window.confirm("Delete this entry?")) return;
    state.logs[selectedDate] = getEntries().filter((entry) => entry.id !== deleteButton.dataset.deleteEntry);
    if (!state.logs[selectedDate].length) {
      delete state.logs[selectedDate];
    }
    saveState();
    render();
  });

  el("#targetForm").addEventListener("submit", (event) => {
    event.preventDefault();
    state.targets = {
      calories: Math.max(1, numberValue("#targetCalories")),
      protein: numberValue("#targetProtein"),
      carbs: numberValue("#targetCarbs"),
      fat: numberValue("#targetFat"),
      tolerance: Math.max(0, Math.min(25, numberValue("#targetTolerance")))
    };
    syncTargetForm();
    saveState();
    render();
  });

  el("#targetToleranceRange").addEventListener("input", (event) => {
    el("#targetTolerance").value = event.target.value;
  });

  el("#targetTolerance").addEventListener("input", (event) => {
    const value = Math.max(0, Math.min(25, Number.parseInt(event.target.value || "0", 10)));
    el("#targetToleranceRange").value = value;
  });

  el("#foodSelect").addEventListener("change", renderFoodPreview);
  el("#foodQuantity").addEventListener("input", renderFoodPreview);

  el("#monthChart").addEventListener("click", handleDateSelection);
  el("#historyList").addEventListener("click", handleDateSelection);
}

function handleDateSelection(event) {
  const target = event.target.closest("[data-select-date]");
  if (!target) return;
  selectedDate = clampDateKey(target.dataset.selectDate);
  activeView = "today";
  render();
}

pruneLogs();
saveState();
syncTargetForm();
bindEvents();
render();
