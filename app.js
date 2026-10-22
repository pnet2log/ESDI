import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  setDoc
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

const firebaseApp = initializeApp({
  apiKey: "AIzaSyCuxjwTnyMu0pBVNS9xYcJxWNKP5UaEB9g",
  authDomain: "attendance-register-88830.firebaseapp.com",
  projectId: "attendance-register-88830",
  storageBucket: "attendance-register-88830.firebasestorage.app",
  messagingSenderId: "121493239187",
  appId: "1:121493239187:web:985e43ef75e7059e926466"
});
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const $ = (selector) => document.querySelector(selector);
const loginScreen = $("#login-screen");
const appContent = $("#app-content");
const loginForm = $("#login-form");
const emailInput = $("#login-email");
const passwordInput = $("#login-password");
const confirmPasswordInput = $("#confirm-password");
const confirmPasswordField = $("#confirm-password-field");
const loginError = $("#login-error");
const loginTitle = $("#login-title");
const loginDescription = $("#login-description");
const loginNote = $("#login-note");
const loginSubmit = $("#login-submit");
const authModeButton = $("#toggle-auth-mode");
let authMode = "signin";
let registerOwner = null;

authModeButton.addEventListener("click", () => {
  setAuthMode(authMode === "signin" ? "signup" : "signin");
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.textContent = "";
  loginSubmit.disabled = true;
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  try {
    if (authMode === "signup") {
      if (password !== confirmPasswordInput.value) {
        loginError.textContent = "The passwords do not match.";
        return;
      }
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await sendEmailVerification(credential.user);
      await signOut(auth);
      setAuthMode("signin");
      loginNote.textContent = "Account created. Verify your email, then sign in to open the shared register.";
      loginError.textContent = "";
      passwordInput.value = "";
      confirmPasswordInput.value = "";
      emailInput.focus();
    } else {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      if (!credential.user.emailVerified) {
        await signOut(auth);
        loginError.textContent = "Verify your email using the link we sent before signing in.";
        return;
      }
    }
  } catch (error) {
    console.error("Authentication request failed.", error);
    loginError.textContent = authErrorMessage(error);
  } finally {
    loginSubmit.disabled = false;
  }
});

$("#reset-password").addEventListener("click", async () => {
  loginError.textContent = "";
  const email = emailInput.value.trim();
  if (!email) {
    loginError.textContent = "Enter your email address first, then select Forgot password.";
    emailInput.focus();
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email);
    loginNote.textContent = "If that account exists, a password-reset link has been sent.";
  } catch (error) {
    console.error("Password reset request failed.", error);
    loginError.textContent = authErrorMessage(error);
  }
});

$("#logout-button").addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Sign out failed.", error);
    showToast("Unable to sign out. Please try again.");
  }
});

function setAuthMode(mode) {
  authMode = mode;
  const signup = mode === "signup";
  confirmPasswordField.hidden = !signup;
  confirmPasswordInput.required = signup;
  passwordInput.autocomplete = signup ? "new-password" : "current-password";
  loginTitle.textContent = signup ? "Create your account." : "Welcome back.";
  loginDescription.textContent = signup
    ? "Create an account, verify your email, and request access from the register administrator."
    : "Sign in to continue to the shared department attendance register.";
  loginSubmit.innerHTML = signup
    ? 'Create account <span aria-hidden="true">→</span>'
    : 'Sign in <span aria-hidden="true">→</span>';
  authModeButton.textContent = signup ? "Back to sign in" : "Create an account";
  loginNote.textContent = signup
    ? "Creating an account does not grant register access. Only administrator-approved email addresses can sign in."
    : "Only verified email addresses approved by the register administrator can access the shared register.";
  loginError.textContent = "";
}

function authErrorMessage(error) {
  switch (error?.code) {
    case "auth/email-already-in-use": return "An account already uses this email. Sign in instead.";
    case "auth/invalid-email": return "Enter a valid email address.";
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
    case "auth/wrong-password":
    case "auth/user-not-found": return "Email or password is incorrect.";
    case "auth/weak-password": return "Choose a stronger password with at least 6 characters.";
    case "auth/too-many-requests": return "Too many attempts. Wait a little and try again.";
    case "auth/unauthorized-domain": return "This website is not authorized in Firebase Authentication settings.";
    case "auth/network-request-failed": return "Network error. Check your connection and try again.";
    default: return "Authentication failed. Please try again.";
  }
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    if (registerOwner) {
      stopRegisterListeners();
      clearLocalRegisterCache();
      registerOwner = null;
    }
    loginScreen.hidden = false;
    appContent.hidden = true;
    return;
  }
  if (!user.emailVerified) {
    loginScreen.hidden = false;
    appContent.hidden = true;
    return;
  }
  const approvalEmail = user.email?.toLowerCase();
  if (!approvalEmail) {
    denyRegisterAccess("This account does not have a verified email address.");
    return;
  }
  try {
    const approval = await getDoc(doc(db, "approvedUsers", approvalEmail));
    if (!approval.exists()) {
      denyRegisterAccess("This account has not been approved. Contact the register administrator.");
      return;
    }
  } catch (error) {
    console.error("Unable to verify register access.", error);
    denyRegisterAccess("Unable to verify account approval. Check your connection and try again.");
    return;
  }
  if (auth.currentUser?.uid !== user.uid) return;
  loginScreen.hidden = true;
  appContent.hidden = false;
  if (registerOwner !== user.uid) {
    stopRegisterListeners();
    registerOwner = user.uid;
    watchRegisterApproval(user, approvalEmail);
    try {
      await initializeRegister(user);
    } catch (error) {
      console.error("Unable to load shared attendance records.", error);
      showToast("Could not load shared records. Check the connection and Firebase access settings.");
    }
  }
});

const STAFF_CACHE_KEY = "esdi-attendance-staff-v1";
const DAYS_CACHE_KEY = "esdi-attendance-days-v1";
const staffForm = $("#staff-form");
const nameInput = $("#staff-name");
const rankInput = $("#staff-rank");
const dateInput = $("#attendance-date");
const rows = $("#attendance-rows");
const emptyState = $("#empty-state");
const signatureDialog = $("#signature-dialog");
const signatureCanvas = $("#signature-canvas");
const canvasContext = signatureCanvas.getContext("2d");
const typedSignature = $("#typed-signature");
const toast = $("#toast");
let staff = [];
let days = {};
let activeStaffId = null;
let returnFocus = null;
let drawing = false;
let hasInk = false;
let toastTimer;
let unsubscribeStaff = null;
let unsubscribeDay = null;
let unsubscribeEntries = null;
let unsubscribeApproval = null;

function readCache(key, fallback) {
  try {
    const stored = localStorage.getItem(key);
    return stored === null ? fallback : JSON.parse(stored);
  } catch (error) {
    console.error(`Unable to read local cache ${key}.`, error);
    return fallback;
  }
}

function writeCache(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Unable to update local cache ${key}.`, error);
  }
}

function currentDay(date = dateInput.value) {
  if (!days[date]) days[date] = { submitted: false, entries: {} };
  if (!days[date].entries) days[date].entries = {};
  return days[date];
}

function entryFor(member) {
  const day = currentDay();
  if (!day.entries[member.id]) day.entries[member.id] = { timeIn: "", timeOut: "", signature: null };
  return day.entries[member.id];
}

function stopRegisterListeners() {
  unsubscribeApproval?.();
  unsubscribeStaff?.();
  unsubscribeDay?.();
  unsubscribeEntries?.();
  unsubscribeApproval = null;
  unsubscribeStaff = null;
  unsubscribeDay = null;
  unsubscribeEntries = null;
}

function clearLocalRegisterCache() {
  try {
    localStorage.removeItem(STAFF_CACHE_KEY);
    localStorage.removeItem(DAYS_CACHE_KEY);
  } catch (error) {
    console.error("Unable to clear the local attendance cache.", error);
  }
  staff = [];
  days = {};
}

function denyRegisterAccess(message) {
  stopRegisterListeners();
  registerOwner = null;
  clearLocalRegisterCache();
  loginScreen.hidden = false;
  appContent.hidden = true;
  loginError.textContent = message;
  if (auth.currentUser) {
    signOut(auth).catch((error) => console.error("Unable to sign out after access was denied.", error));
  }
}

function watchRegisterApproval(user, approvalEmail) {
  unsubscribeApproval = onSnapshot(doc(db, "approvedUsers", approvalEmail), (snapshot) => {
    if (!snapshot.exists() && auth.currentUser?.uid === user.uid) {
      denyRegisterAccess("Register access has been revoked. Contact the register administrator.");
    }
  }, (error) => {
    console.error("Unable to monitor register approval.", error);
    if (auth.currentUser?.uid === user.uid) {
      denyRegisterAccess("Unable to verify account approval. Sign in again when your connection is available.");
    }
  });
}

async function initializeRegister(user) {
  staff = readCache(STAFF_CACHE_KEY, []);
  days = readCache(DAYS_CACHE_KEY, {});
  if (!Array.isArray(staff)) staff = [];
  staff = [...new Map(staff.filter((member) => member?.id).map((member) => [member.id, member])).values()];
  if (!days || typeof days !== "object" || Array.isArray(days)) days = {};
  dateInput.value = localDate(new Date());
  $("#save-status").textContent = "Loading shared records…";
  render();
  await migrateLegacyCacheIfNeeded();
  if (registerOwner !== user.uid) return;
  await selectResumeDate();
  if (registerOwner !== user.uid) return;
  subscribeToStaff();
  subscribeToDay(dateInput.value);
}

async function migrateLegacyCacheIfNeeded() {
  const remoteStaff = await getDocs(collection(db, "staff"));
  if (!remoteStaff.empty || staff.length === 0) return;

  for (const member of staff) {
    await setDoc(doc(db, "staff", member.id), {
      name: member.name,
      rank: member.rank,
      createdAt: new Date().toISOString()
    });
  }
  for (const [date, day] of Object.entries(days)) {
    await setDoc(doc(db, "attendanceDays", date), {
      date,
      submitted: Boolean(day.submitted),
      updatedAt: new Date().toISOString()
    });
    for (const [staffId, entry] of Object.entries(day.entries || {})) {
      await setDoc(doc(db, "attendanceDays", date, "entries", staffId), {
        timeIn: entry.timeIn || "",
        timeOut: entry.timeOut || "",
        signature: entry.signature || null
      });
    }
  }
  showToast("Saved records from this device were copied to the shared register.");
}

async function selectResumeDate() {
  const snapshot = await getDocs(query(collection(db, "attendanceDays")));
  const openDates = snapshot.docs
    .map((item) => ({ date: item.id, submitted: Boolean(item.data().submitted) }))
    .filter((item) => !item.submitted)
    .map((item) => item.date)
    .sort();
  if (openDates.length) dateInput.value = openDates[openDates.length - 1];
}

function subscribeToStaff() {
  unsubscribeStaff?.();
  unsubscribeStaff = onSnapshot(query(collection(db, "staff")), (snapshot) => {
    staff = snapshot.docs
      .map((item) => ({ id: item.id, name: item.data().name, rank: item.data().rank }))
      .sort((a, b) => a.name.localeCompare(b.name));
    writeCache(STAFF_CACHE_KEY, staff);
    render();
  }, (error) => {
    console.error("Unable to sync the staff roster.", error);
    showToast("Could not sync the staff roster. Check your connection and access.");
  });
}

function subscribeToDay(date) {
  unsubscribeDay?.();
  unsubscribeEntries?.();
  const dayRef = doc(db, "attendanceDays", date);
  const entriesRef = collection(db, "attendanceDays", date, "entries");
  unsubscribeDay = onSnapshot(dayRef, (snapshot) => {
    const day = currentDay(date);
    day.submitted = snapshot.exists() && Boolean(snapshot.data().submitted);
    writeCache(DAYS_CACHE_KEY, days);
    render();
  }, (error) => {
    console.error(`Unable to sync attendance status for ${date}.`, error);
    showToast("Could not load the selected day's attendance.");
  });
  unsubscribeEntries = onSnapshot(entriesRef, (snapshot) => {
    const day = currentDay(date);
    day.entries = Object.fromEntries(snapshot.docs.map((item) => [item.id, item.data()]));
    writeCache(DAYS_CACHE_KEY, days);
    render();
  }, (error) => {
    console.error(`Unable to sync attendance entries for ${date}.`, error);
    showToast("Could not load attendance entries for the selected date.");
  });
}

function render() {
  const day = currentDay();
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
  $("#save-status").textContent = day.submitted ? "Submitted · synced across devices" : "Synced attendance register";
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
  input.addEventListener("change", async () => {
    entryFor(member)[field] = input.value;
    await saveAttendanceChange(member.id);
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

async function saveAttendanceChange(staffId) {
  const day = currentDay();
  day.submitted = false;
  writeCache(DAYS_CACHE_KEY, days);
  render();
  try {
    await Promise.all([
      setDoc(doc(db, "attendanceDays", dateInput.value), {
        date: dateInput.value,
        submitted: false,
        updatedAt: new Date().toISOString()
      }, { merge: true }),
      setDoc(doc(db, "attendanceDays", dateInput.value, "entries", staffId), entryFor({ id: staffId }), { merge: true })
    ]);
  } catch (error) {
    console.error("Unable to save attendance to Firestore.", error);
    showToast("Attendance was not synced. Check your connection and try again.");
  }
}

function localDate(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
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
  signatureDialog.showModal();
  resizeCanvas();
}

function resizeCanvas() {
  const bounds = signatureCanvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  signatureCanvas.width = Math.max(1, Math.round(bounds.width * scale));
  signatureCanvas.height = Math.max(1, Math.round(bounds.height * scale));
  canvasContext.setTransform(scale, 0, 0, scale, 0, 0);
  canvasContext.lineWidth = 2.4;
  canvasContext.lineCap = "round";
  canvasContext.lineJoin = "round";
  canvasContext.strokeStyle = "#174f3d";
  hasInk = false;
}

function clearCanvas() {
  const scale = window.devicePixelRatio || 1;
  canvasContext.clearRect(0, 0, signatureCanvas.width / scale, signatureCanvas.height / scale);
  hasInk = false;
}

function canvasPoint(event) {
  const bounds = signatureCanvas.getBoundingClientRect();
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
}

signatureCanvas.addEventListener("pointerdown", (event) => {
  drawing = true;
  signatureCanvas.setPointerCapture(event.pointerId);
  const point = canvasPoint(event);
  canvasContext.beginPath();
  canvasContext.moveTo(point.x, point.y);
});
signatureCanvas.addEventListener("pointermove", (event) => {
  if (!drawing) return;
  const point = canvasPoint(event);
  canvasContext.lineTo(point.x, point.y);
  canvasContext.stroke();
  hasInk = true;
});
signatureCanvas.addEventListener("pointerup", () => { drawing = false; });
signatureCanvas.addEventListener("pointercancel", () => { drawing = false; });

$("#clear-signature").addEventListener("click", () => {
  clearCanvas();
  typedSignature.value = "";
  $("#signature-error").textContent = "";
});

$("#save-signature").addEventListener("click", async () => {
  const typedName = typedSignature.value.trim();
  if (!hasInk && !typedName) {
    $("#signature-error").textContent = "Draw a signature or type your full name to continue.";
    return;
  }
  const entry = entryFor({ id: activeStaffId });
  entry.signature = hasInk
    ? { kind: "image", value: signatureCanvas.toDataURL("image/png") }
    : { kind: "text", value: typedName };
  const staffId = activeStaffId;
  signatureDialog.close();
  await saveAttendanceChange(staffId);
  showToast("Signature synced to the shared register.");
});

signatureDialog.addEventListener("close", () => {
  activeStaffId = null;
  if (returnFocus?.isConnected) returnFocus.focus();
  returnFocus = null;
});

staffForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();
  const rank = rankInput.value.trim();
  if (!name || !rank) return;
  const memberRef = doc(collection(db, "staff"));
  const member = { id: memberRef.id, name, rank };
  try {
    await setDoc(memberRef, { name, rank, createdAt: new Date().toISOString() });
    if (!staff.some((item) => item.id === member.id)) staff.push(member);
    entryFor(member);
    writeCache(STAFF_CACHE_KEY, staff);
    await saveAttendanceChange(member.id);
    staffForm.reset();
    render();
    showToast(`${name} added to the shared register.`);
    nameInput.focus();
  } catch (error) {
    console.error("Unable to add staff member to Firestore.", error);
    showToast("Could not add staff member. Check your connection and account access.");
  }
});

dateInput.addEventListener("change", () => {
  writeCache(DAYS_CACHE_KEY, days);
  render();
  subscribeToDay(dateInput.value);
});

$("#submit-button").addEventListener("click", async () => {
  const incomplete = staff.filter((member) => {
    const entry = entryFor(member);
    return !entry.timeIn || !entry.timeOut || !entry.signature;
  });
  if (incomplete.length) {
    showToast(`Complete time in, time out, and signature for ${incomplete.length} ${incomplete.length === 1 ? "staff member" : "staff members"} before submitting.`);
    return;
  }
  try {
    await setDoc(doc(db, "attendanceDays", dateInput.value), {
      date: dateInput.value,
      submitted: true,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    currentDay().submitted = true;
    writeCache(DAYS_CACHE_KEY, days);
    render();
    showToast("Attendance submitted and synced across devices.");
  } catch (error) {
    console.error("Unable to submit attendance.", error);
    showToast("Attendance was not submitted. Check your connection and try again.");
  }
});

$("#export-button").addEventListener("click", () => {
  const records = staff.map((member) => {
    const entry = entryFor(member);
    const signature = entry.signature
      ? entry.signature.kind === "text" ? entry.signature.value : "Handwritten signature recorded"
      : "";
    return [member.name, member.rank, entry.timeIn || "", entry.timeOut || "", signature];
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
