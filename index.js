// index.js
import { io } from "./lib/socket.io.esm.min.js";

const EXT_URL = new URL(".", import.meta.url).href;
const MODULE_NAME = "stmp";
const RELAY_URL = "http://localhost:3000";
const PERSONA_PROMPT_KEY = "stmp_personas";

let socket = null;
let isHost = false;
let tunnelUrl = null;
let mySocketId = null;
let injecting = false;

let stListenersRegistered = false;
let roomRequested = false;

const participants = new Map();
const members = new Map();

function makeJoinToken(url, roomId) {
  const payload = JSON.stringify({ v: 1, u: url, r: roomId });
  return btoa(payload).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function parseJoinToken(token) {
  try {
    const b64 = token.replace(/-/g, "+").replace(/_/g, "/");
    const { v, u, r } = JSON.parse(atob(b64));
    if (v !== 1) throw new Error("token version mismatch");
    if (!u.startsWith("http")) throw new Error("invalid url");
    return { url: u, roomId: r };
  } catch (e) {
    console.warn(`[${MODULE_NAME}] failed to parse token:`, e.message);
    return null;
  }
}

function getMyPersona() {
  const ctx = SillyTavern.getContext();
  const username = ctx.name1 ?? "Anon";
  const persona = ctx.powerUserSettings.persona_description ?? "";
  return { username, persona };
}

function updatePersonaPrompt() {
  const ctx = SillyTavern.getContext();
  if (participants.size === 0) {
    ctx.setExtensionPrompt(PERSONA_PROMPT_KEY, "", 0, 0);
    return;
  }
  let text = "[The following participants are present in this scene, each a real character controlled by another player:\n";
  for (const { name, persona } of participants.values()) {
    text += `- ${name}: ${persona || "(no description provided)"}\n`;
  }
  text += "]";
  ctx.setExtensionPrompt(PERSONA_PROMPT_KEY, text, 0, 0);
}

function resetConnection() {
  if (socket) {
    console.warn(`[${MODULE_NAME}] closing existing connection (restart).`);
    try { socket.removeAllListeners(); socket.disconnect(); } catch (e) {}
  }
  socket = null;
  isHost = false;
  mySocketId = null;
  roomRequested = false;
  participants.clear();
  members.clear();
}

async function hostRoom() {
  resetConnection();
  const { username, persona } = getMyPersona();
  socket = io(RELAY_URL, { transports: ["websocket"], reconnection: false });

  tunnelUrl = await fetchTunnelUrl();

  socket.on("connect", () => {
    mySocketId = socket.id;
    console.log(`[${MODULE_NAME}] host connected, socketId: ${mySocketId}`);
    if (roomRequested) return;
    roomRequested = true;
    socket.emit("createRoom", { username, persona });
  });

  socket.on("roomCreated", ({ roomId }) => {
    isHost = true;
    const token = makeJoinToken(tunnelUrl ?? RELAY_URL, roomId); // embeds tunnelUrl if available
    showToken(token);
    console.log(`[${MODULE_NAME}] room opened. tunnel: ${tunnelUrl ?? "none (localhost)"} | token:`, token);
  });

  socket.on("messageSent", (data) => {
    if (data.socketId === mySocketId) return;
    injectMessage({ name: data.username, text: data.inputContext, label: true });
  });

  socket.on("userJoined", ({ socketId, username, persona }) => {
    toastr.info(`${username} joined`);
    participants.set(socketId, { name: username, persona: persona ?? "" });
    members.set(socketId, username);
    renderMembers();
    updatePersonaPrompt();
    console.log(`[${MODULE_NAME}] participant added: ${username} (${socketId})`);
  });

  socket.on("userLeft", ({ socketId }) => {
    participants.delete(socketId);
    members.delete(socketId);
    renderMembers();
    updatePersonaPrompt();
    console.log(`[${MODULE_NAME}] participant left: ${socketId}`);
  });

  socket.on("requestSnapshot", ({ targetSocketId }) => {
    const ctx = SillyTavern.getContext();
    const messages = ctx.chat.map((m) => ({
      name: m.name ?? "?",
      isUser: !!m.is_user,
      mes: m.mes ?? "",
    }));
    console.log(`[${MODULE_NAME}] snapshot requested → ${messages.length} messages prepared, target: ${targetSocketId}`);
    socket.emit("provideSnapshot", { targetSocketId, messages });
  });

  socket.on("disconnect", () => {
    console.warn(`[${MODULE_NAME}] host connection lost.`);
    showState("idle");
    members.clear();
    renderMembers();
  });
  socket.on("connect_error", (e) => toastr.error(`Connection error: ${e.message}`));
  socket.on("error", ({ message }) => toastr.error(message));
}

function joinRoom(token) {
  const parsed = parseJoinToken(token);
  if (!parsed) return toastr.error("Invalid room code");

  const ctx = SillyTavern.getContext();
  if (ctx.chat.length > 0) {
    toastr.error("Start a new/empty chat before joining. Your current chat history would conflict.");
    return;
  }

  resetConnection();
  const { username, persona } = getMyPersona();
  socket = io(parsed.url, { transports: ["websocket"], reconnection: false });

  socket.on("connect", () => {
    mySocketId = socket.id;
    console.log(`[${MODULE_NAME}] participant connected, socketId: ${mySocketId}`);
    if (roomRequested) return;
    roomRequested = true;
    socket.emit("joinRoom", { roomId: parsed.roomId, username, persona });
  });

  socket.on("joinedRoom", () => {
    isHost = false;
    showState("participant"); // GUI: switch to participant view
    console.log(`[${MODULE_NAME}] joined room.`);
  });

  socket.on("messageSent", (data) => {
    if (data.socketId === mySocketId) return;
    injectMessage({ name: data.username, text: data.inputContext, label: true });
  });

  socket.on("llmResponse", (data) => {
    injectMessage({ name: data.name ?? "Assistant", text: data.inputContext, label: false });
  });

  socket.on("userJoined", ({ socketId, username }) => {
    members.set(socketId, username);
    renderMembers();
  });
  socket.on("userLeft", ({ socketId }) => {
    members.delete(socketId);
    renderMembers();
  });

  socket.on("snapshot", ({ messages }) => {
    applySnapshot(messages);
  });

  socket.on("yourTurn", onYourTurn);
  socket.on("disconnect", () => {
    console.warn(`[${MODULE_NAME}] connection lost.`);
    showState("idle");
    members.clear();
    renderMembers();
  });
  socket.on("connect_error", (e) => toastr.error(`Connection error: ${e.message}`));
  socket.on("error", ({ message }) => toastr.error(message));
  socket.on("roomClosed", ({ message }) => {
    toastr.warning(message ?? "Room closed");
    showState("idle");
    members.clear();
    renderMembers();
  });
}

function registerStListenersOnce() {
  if (stListenersRegistered) {
    console.warn(`[${MODULE_NAME}] ST listeners already registered, skipping.`);
    return;
  }
  const { eventSource, event_types } = SillyTavern.getContext();
  eventSource.on(event_types.MESSAGE_SENT, (idx) => onLocalMessage("sent", idx));
  eventSource.on(event_types.MESSAGE_RECEIVED, (idx) => onLocalMessage("received", idx));
  stListenersRegistered = true;
  console.log(`[${MODULE_NAME}] ST listeners registered (persistent).`);
}

function onLocalMessage(kind, messageIndex) {
  if (injecting) return;
  if (!socket) return;
  const ctx = SillyTavern.getContext();
  const msg = ctx.chat[messageIndex];
  if (!msg) return;

  if (isHost) {
    if (kind === "received") {
      socket.emit("llmResponse", { inputContext: msg.mes, name: msg.name });
      console.log(`[${MODULE_NAME}] llmResponse sent`);
    } else {
      socket.emit("hostSendMessage", { inputContext: msg.mes, username: ctx.name1 });
      console.log(`[${MODULE_NAME}] host input sent: ${ctx.name1}`);
    }
  } else {
    if (kind === "sent") {
      socket.emit("sendMessage", { inputContext: msg.mes, username: ctx.name1 });
      console.log(`[${MODULE_NAME}] participant input sent: ${ctx.name1}`);
    }
  }
}

function injectMessage({ name, text, label = false }) {
  const ctx = SillyTavern.getContext();
  const body = text ?? "";
  const mes = label && name ? `${name}: ${body}` : body;

  const message = {
    name: name ?? "?",
    is_user: false,
    is_system: false,
    send_date: new Date().toISOString(),
    mes,
    extra: {},
  };

  injecting = true;
  ctx.chat.push(message);
  if (typeof ctx.addOneMessage === "function") {
    ctx.addOneMessage(message);
  } else {
    console.warn(`[${MODULE_NAME}] addOneMessage missing — verify render method`);
  }
  injecting = false;
}

function applySnapshot(messages) {
  const ctx = SillyTavern.getContext();

  if (!Array.isArray(messages)) {
    console.warn(`[${MODULE_NAME}] invalid snapshot:`, messages);
    return;
  }
  if (ctx.chat.length > 0) {
    console.warn(`[${MODULE_NAME}] snapshot SKIPPED: chat not empty (${ctx.chat.length} messages). Join from a clean/new chat.`);
    toastr.warning("History not loaded: open an empty chat first, then join.");
    return;
  }

  console.log(`[${MODULE_NAME}] applying snapshot: ${messages.length} messages`);
  injecting = true;
  for (const m of messages) {
    const mes = m.isUser ? `${m.name}: ${m.mes}` : m.mes;
    const message = {
      name: m.name ?? "?",
      is_user: false,
      is_system: false,
      send_date: new Date().toISOString(),
      mes,
      extra: {},
    };
    ctx.chat.push(message);
    if (typeof ctx.addOneMessage === "function") ctx.addOneMessage(message);
  }
  injecting = false;
  console.log(`[${MODULE_NAME}] snapshot applied (${messages.length} messages).`);
  toastr.success(`History loaded (${messages.length} messages).`);
}

function leaveRoom() {
  if (socket) {
    try { socket.disconnect(); } catch (e) {}
  }
  socket = null;
  isHost = false;
  participants.clear();
  members.clear();
  renderMembers();
  updatePersonaPrompt();
  showState("idle");
  toastr.info("You left the room.");
}

async function fetchTunnelUrl() {
  try {
    const res = await fetch(`${RELAY_URL}/tunnel-url`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { tunnelUrl: url } = await res.json();
    if (url) {
      console.log(`[${MODULE_NAME}] tunnel URL received: ${url}`);
      return url;
    }
    console.warn(`[${MODULE_NAME}] relay returned no tunnel URL (localhost mode).`);
    return null;
  } catch (e) {
    console.warn(`[${MODULE_NAME}] could not fetch tunnel URL: ${e.message} (localhost mode).`);
    return null;
  }
}

async function loadGui() {
  try {
    const html = await $.get(`${EXT_URL}settings.html`);
    $("#extensions_settings").append(html);
    bindGuiEvents();
    showState("idle");
    console.log(`[${MODULE_NAME}] GUI loaded.`);
  } catch (e) {
    console.error(`[${MODULE_NAME}] GUI failed to load:`, e);
  }
}

function bindGuiEvents() {
  $("#stmp_host_btn").on("click", () => hostRoom());
  $("#stmp_join_btn").on("click", () => {
    const token = $("#stmp_token_input").val()?.trim();
    if (!token) return toastr.warning("Paste a room code first.");
    joinRoom(token);
  });
  $("#stmp_copy_btn").on("click", () => {
    const t = $("#stmp_token_display").val();
    if (t) { navigator.clipboard.writeText(t); toastr.success("Code copied."); }
  });
  $("#stmp_close_btn").on("click", () => leaveRoom());
  $("#stmp_leave_btn").on("click", () => leaveRoom());
}

function showState(state) {
  $("#stmp_idle").toggle(state === "idle");
  $("#stmp_host").toggle(state === "host");
  $("#stmp_participant").toggle(state === "participant");
  $("#stmp_members_wrap").toggle(state === "host" || state === "participant");
}

function renderMembers() {
  const $c = $("#stmp_members");
  if (!$c.length) return;
  $c.empty();
  for (const name of members.values()) {
    $c.append(`<div class="stmp-member menu_button" style="cursor:default;">${escapeHtml(name)}</div>`);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function onYourTurn() {
  toastr.info("It's your turn.");
}

function showToken(token) {
  $("#stmp_token_display").val(token);
  showState("host");
  toastr.success("Room opened — share the code.");
}

globalThis.stmpInterceptor = async function (chat, contextSize, abort, type) {
  if (!isHost) {
    if (socket) abort(true);
    return;
  }
  updatePersonaPrompt();
};

function init() {
  console.log(`[${MODULE_NAME}] loaded.`);
  registerStListenersOnce();
  loadGui();
  window.stmp = { hostRoom, joinRoom, ctx: () => SillyTavern.getContext() };
}

const _ctx = SillyTavern.getContext();
_ctx.eventSource.on(_ctx.event_types.APP_READY, init);