(() => {
  "use strict";

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
})();
