(() => {
  "use strict";

  const AUTH_KEY = "esdi-attendance-password-v1";
  const SESSION_KEY = "esdi-attendance-session-v1";
  const loginScreen = document.querySelector("#login-screen");
  const appContent = document.querySelector("#app-content");
  const loginForm = document.querySelector("#login-form");
  const passwordInput = document.querySelector("#login-password");
  const confirmPasswordInput = document.querySelector("#confirm-password");
  const confirmPasswordField = document.querySelector("#confirm-password-field");
  const loginError = document.querySelector("#login-error");
  const loginTitle = document.querySelector("#login-title");
  const loginDescription = document.querySelector("#login-description");
  const loginNote = document.querySelector("#login-note");
  const loginSubmit = document.querySelector("#login-submit");
  let registerInitialized = false;

  configureLogin();
  loginForm.addEventListener("submit", handleLogin);
  document.querySelector("#logout-button").addEventListener("click", () => {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch (error) {
      console.error("Unable to clear the browser login session.", error);
    }
    showLogin();
  });

  try {
    if (sessionStorage.getItem(SESSION_KEY) === "authenticated") showApp();
    else passwordInput.focus();
  } catch (error) {
    console.error("Unable to read the browser login session.", error);
    passwordInput.focus();
  }

  function configureLogin() {
    let firstVisit;
    try {
      firstVisit = localStorage.getItem(AUTH_KEY) === null;
    } catch (error) {
      console.error("Unable to check browser login setup.", error);
      loginError.textContent = "Browser storage is unavailable. Enable site storage to use the login page.";
      loginSubmit.disabled = true;
      return;
    }

    confirmPasswordField.hidden = !firstVisit;
    confirmPasswordInput.required = firstVisit;
    passwordInput.autocomplete = firstVisit ? "new-password" : "current-password";
    loginTitle.textContent = firstVisit ? "Set up access." : "Welcome back.";
    loginDescription.textContent = firstVisit
      ? "Create an access password for this browser to protect the department attendance register."
      : "Sign in to continue to the department attendance register.";
    loginSubmit.innerHTML = firstVisit
      ? 'Create password <span aria-hidden="true">→</span>'
      : 'Sign in <span aria-hidden="true">→</span>';
    loginNote.textContent = firstVisit
      ? "Use at least 8 characters. This password is saved only in this browser."
      : "This local login is a convenience barrier; it does not secure the public site.";
  }

  async function handleLogin(event) {
    event.preventDefault();
    loginError.textContent = "";
    loginSubmit.disabled = true;

    try {
      const password = passwordInput.value;
      const stored = localStorage.getItem(AUTH_KEY);
      if (stored === null) {
        if (password.length < 8) {
          loginError.textContent = "Choose a password with at least 8 characters.";
          return;
        }
        if (password !== confirmPasswordInput.value) {
          loginError.textContent = "The passwords do not match.";
          return;
        }
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const hash = await passwordHash(password, salt);
        localStorage.setItem(AUTH_KEY, JSON.stringify({
          salt: encodeBase64(salt),
          hash,
          iterations: 310000
        }));
      } else {
        let credentials;
        try {
          credentials = JSON.parse(stored);
        } catch (error) {
          console.error("Stored login credentials could not be read.", error);
          loginError.textContent = "Saved login details are invalid. Clear this site's data to set up access again.";
          return;
        }
        if (!credentials?.salt || !credentials?.hash || !Number.isInteger(credentials.iterations)) {
          loginError.textContent = "Saved login details are invalid. Clear this site's data to set up access again.";
          return;
        }
        const actualHash = await passwordHash(password, decodeBase64(credentials.salt), credentials.iterations);
        if (!sameValue(actualHash, credentials.hash)) {
          loginError.textContent = "That password doesn't match. Please try again.";
          passwordInput.value = "";
          passwordInput.focus();
          return;
        }
      }

      try {
        sessionStorage.setItem(SESSION_KEY, "authenticated");
      } catch (error) {
        console.error("Unable to save the browser login session.", error);
        loginError.textContent = "Browser session storage is unavailable. Enable site storage and try again.";
        return;
      }
      loginForm.reset();
      showApp();
    } catch (error) {
      console.error("Unable to verify the login password.", error);
      loginError.textContent = "Unable to verify the password. Check browser support and try again.";
    } finally {
      loginSubmit.disabled = false;
    }
  }

  async function passwordHash(password, salt, iterations = 310000) {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveBits"]
    );
    const derived = await crypto.subtle.deriveBits({
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations
    }, key, 256);
    return encodeBase64(new Uint8Array(derived));
  }

  function encodeBase64(bytes) {
    return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
  }

  function decodeBase64(value) {
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  }

  function sameValue(left, right) {
    if (left.length !== right.length) return false;
    let difference = 0;
    for (let index = 0; index < left.length; index += 1) {
      difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
    }
    return difference === 0;
  }

  function showLogin() {
    appContent.hidden = true;
    loginScreen.hidden = false;
    configureLogin();
    passwordInput.value = "";
    confirmPasswordInput.value = "";
    passwordInput.focus();
  }

  function showApp() {
    loginScreen.hidden = true;
    appContent.hidden = false;
    if (!registerInitialized) {
      initializeRegister();
      registerInitialized = true;
    }
  }

  function initializeRegister() {
  const STAFF_KEY = "esdi-attendance-staff-v1";
  const DAYS_KEY = "esdi-attendance-days-v1";
  const $ = (selector) => document.querySelector(selector);
  const dateInput = $("#attendance-date");
  const rows = $("#attendance-rows");
  const emptyState = $("#empty-state");
  const staffForm = $("#staff-form");
  const nameInput = $("#staff-name");
  const rankInput = $("#staff-rank");
  const dialog = $("#signature-dialog");
  const canvas = $("#signature-canvas");
  const context = canvas.getContext("2d");
  const typedSignature = $("#typed-signature");
  const toast = $("#toast");
  let staff = readStorage(STAFF_KEY, []);
  let days = readStorage(DAYS_KEY, {});
  let activeStaffId = null;
  let returnFocus = null;
  let drawing = false;
  let hasInk = false;
  let toastTimer;

  if (!Array.isArray(staff)) staff = [];
  if (!days || typeof days !== "object" || Array.isArray(days)) days = {};
  dateInput.value = localDate(new Date());

  function localDate(date) {
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  function readStorage(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : JSON.parse(value);
    } catch (error) {
      console.error(`Unable to read ${key} from browser storage.`, error);
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error(`Unable to save ${key} to browser storage.`, error);
      showToast("Could not save changes. Check available browser storage.");
      return false;
    }
  }

  function dayRecord() {
    const date = dateInput.value;
    if (!days[date] || typeof days[date] !== "object" || Array.isArray(days[date])) {
      days[date] = { entries: {}, submitted: false };
    }
    if (!days[date].entries || typeof days[date].entries !== "object" || Array.isArray(days[date].entries)) {
      days[date].entries = {};
    }
    return days[date];
  }

  function entryFor(member) {
    const day = dayRecord();
    const existing = day.entries[member.id];
    if (!existing || typeof existing !== "object") {
      day.entries[member.id] = { timeIn: "", timeOut: "", signature: null };
    }
    return day.entries[member.id];
  }

  function render() {
    const day = dayRecord();
    rows.replaceChildren();
    emptyState.hidden = staff.length !== 0;

    staff.forEach((member, index) => {
      const entry = entryFor(member);
      const row = document.createElement("tr");
      row.append(
        makeCell(String(index + 1).padStart(2, "0"), "number-cell"),
        makePersonCell(member),
        makeCell(member.rank, "rank-text"),
        makeTimeCell(member, "timeIn", "Time in"),
        makeTimeCell(member, "timeOut", "Time out"),
        makeSignatureCell(member, entry)
      );
      rows.append(row);
    });

    $("#staff-count").textContent = staff.length;
    $("#checked-in-count").textContent = staff.filter((member) => Boolean(entryFor(member).timeIn)).length;
    $("#signature-count").textContent = staff.filter((member) => Boolean(entryFor(member).signature)).length;
    $("#record-count").textContent = `${staff.length} ${staff.length === 1 ? "staff member" : "staff listed"}`;
    $("#submit-button").disabled = staff.length === 0;
    $("#export-button").disabled = staff.length === 0;
    $("#save-status").textContent = day.submitted ? "Submitted · saved on this device" : "Changes save automatically";
  }

  function makeCell(text, className) {
    const cell = document.createElement("td");
    if (className) cell.className = className;
    cell.textContent = text;
    return cell;
  }

  function makePersonCell(member) {
    const cell = document.createElement("td");
    const name = document.createElement("span");
    name.className = "person-name";
    name.textContent = member.name;
    const detail = document.createElement("span");
    detail.className = "person-detail";
    detail.textContent = "ESDI staff";
    cell.append(name, detail);
    return cell;
  }

  function makeTimeCell(member, field, label) {
    const cell = document.createElement("td");
    const input = document.createElement("input");
    input.className = "time-input";
    input.type = "time";
    input.value = entryFor(member)[field] || "";
    input.setAttribute("aria-label", `${label} for ${member.name}`);
    input.addEventListener("change", () => {
      entryFor(member)[field] = input.value;
      saveAttendanceChange();
    });
    cell.append(input);
    return cell;
  }

  function makeSignatureCell(member, entry) {
    const cell = document.createElement("td");
    cell.className = "signature-cell";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "signature-button";
    button.setAttribute("aria-label", `${entry.signature ? "Edit" : "Add"} signature for ${member.name}`);
    button.addEventListener("click", () => openSignature(member.id, button));

    if (!entry.signature) {
      button.textContent = "✎  Add signature";
    } else if (entry.signature.kind === "image") {
      const image = document.createElement("img");
      image.className = "signature-image";
      image.src = entry.signature.value;
      image.alt = "Handwritten signature recorded";
      button.append(image, signedMark());
    } else {
      const name = document.createElement("span");
      name.className = "signature-preview";
      name.textContent = entry.signature.value;
      button.append(name, signedMark());
    }
    cell.append(button);
    return cell;
  }

  function signedMark() {
    const mark = document.createElement("span");
    mark.className = "signed-mark";
    mark.setAttribute("aria-hidden", "true");
    mark.textContent = "✓";
    return mark;
  }

  function saveAttendanceChange() {
    const day = dayRecord();
    day.submitted = false;
    if (writeStorage(DAYS_KEY, days)) $("#save-status").textContent = "Changes save automatically";
    render();
  }

  function openSignature(staffId, trigger) {
    const member = staff.find((item) => item.id === staffId);
    if (!member) return;
    activeStaffId = staffId;
    returnFocus = trigger;
    $("#signature-person").textContent = `${member.name} · ${member.rank}`;
    $("#signature-error").textContent = "";
    typedSignature.value = "";
    clearCanvas();
    dialog.showModal();
    resizeCanvas();
  }

  function resizeCanvas() {
    const bounds = canvas.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(bounds.width * scale));
    canvas.height = Math.max(1, Math.round(bounds.height * scale));
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.lineWidth = 2.4;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#174f3d";
    hasInk = false;
  }

  function clearCanvas() {
    const scale = window.devicePixelRatio || 1;
    context.clearRect(0, 0, canvas.width / scale, canvas.height / scale);
    hasInk = false;
  }

  function pointFrom(event) {
    const bounds = canvas.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  canvas.addEventListener("pointerdown", (event) => {
    drawing = true;
    canvas.setPointerCapture(event.pointerId);
    const point = pointFrom(event);
    context.beginPath();
    context.moveTo(point.x, point.y);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!drawing) return;
    const point = pointFrom(event);
    context.lineTo(point.x, point.y);
    context.stroke();
    hasInk = true;
  });
  canvas.addEventListener("pointerup", () => { drawing = false; });
  canvas.addEventListener("pointercancel", () => { drawing = false; });

  $("#clear-signature").addEventListener("click", () => {
    clearCanvas();
    typedSignature.value = "";
    $("#signature-error").textContent = "";
  });

  $("#save-signature").addEventListener("click", () => {
    const typedName = typedSignature.value.trim();
    if (!hasInk && !typedName) {
      $("#signature-error").textContent = "Draw a signature or type your full name to continue.";
      return;
    }
    const entry = entryFor({ id: activeStaffId });
    entry.signature = hasInk
      ? { kind: "image", value: canvas.toDataURL("image/png") }
      : { kind: "text", value: typedName };
    dialog.close();
    saveAttendanceChange();
    showToast("Signature saved to the attendance register.");
  });

  dialog.addEventListener("close", () => {
    activeStaffId = null;
    if (returnFocus?.isConnected) returnFocus.focus();
    returnFocus = null;
  });

  staffForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = nameInput.value.trim();
    const rank = rankInput.value.trim();
    if (!name || !rank) return;
    const member = {
      id: globalThis.crypto?.randomUUID?.() || `staff-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name,
      rank
    };
    staff.push(member);
    if (!writeStorage(STAFF_KEY, staff)) {
      staff = staff.filter((person) => person.id !== member.id);
      return;
    }
    entryFor(member);
    if (writeStorage(DAYS_KEY, days)) {
      staffForm.reset();
      render();
      showToast(`${name} added to the attendance register.`);
      nameInput.focus();
    } else {
      staff = staff.filter((person) => person.id !== member.id);
      writeStorage(STAFF_KEY, staff);
      delete dayRecord().entries[member.id];
    }
  });

  dateInput.addEventListener("change", () => {
    render();
    writeStorage(DAYS_KEY, days);
  });

  $("#submit-button").addEventListener("click", () => {
    const day = dayRecord();
    const incomplete = staff.filter((member) => {
      const entry = entryFor(member);
      return !entry.timeIn || !entry.timeOut || !entry.signature;
    });
    if (incomplete.length) {
      showToast(`Complete time in, time out, and signature for ${incomplete.length} ${incomplete.length === 1 ? "staff member" : "staff members"} before submitting.`);
      return;
    }
    day.submitted = true;
    if (writeStorage(DAYS_KEY, days)) {
      render();
      showToast("Attendance submitted and saved on this device.");
    }
  });

  $("#export-button").addEventListener("click", () => {
    const records = staff.map((member) => {
      const entry = entryFor(member);
      const signature = entry.signature
        ? entry.signature.kind === "text" ? entry.signature.value : "Handwritten signature recorded"
        : "";
      return [member.name, member.rank, entry.timeIn, entry.timeOut, signature];
    });
    const content = [
      ["S.NO", "Fullname", "Rank", "Time IN", "Time OUT", "Signature"],
      ...records.map((record, index) => [String(index + 1), ...record])
    ].map((record) => record.map(csvValue).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `esdi-attendance-${dateInput.value}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("Attendance CSV downloaded.");
  });

  function csvValue(value) {
    return `"${String(value).replaceAll('"', '""')}"`;
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 3600);
  }

  render();
  }
})();
