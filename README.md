# Miko Multiplayer

> A SillyTavern extension for real-time multiplayer roleplay. One **host** shares their SillyTavern chat with multiple **participants** who join from anywhere over the internet. The host controls the LLM; participants write messages that appear in the shared scene.

> ⚠️ **Beta.** This is an early release and may be unstable. Only share room codes with people you trust, see [Security](#security) below.

---

## How it works

Miko Multiplayer has two roles:

- **Host** runs SillyTavern, the extension, *and* a small relay server. The host's SillyTavern is the single source of truth: only the host triggers the LLM, and the host's chat is shared with everyone.
- **Participant** just runs SillyTavern with the extension. They paste a room code and join. No server, no tunnel, nothing else to install.

Messages flow through the host's relay. Participant messages appear in the host's chat and get bundled into the LLM prompt; the host's LLM responses are broadcast back to everyone. Participant personas are injected into the prompt so the AI knows who's in the scene.

---

## Installation

### Everyone: install the extension

In SillyTavern, go to **Extensions → Install Extension**, and paste this URL:

```
https://github.com/OerdM/MikoMultiplayer
```

This installs the frontend extension. Participants are done here, skip to [Usage](#usage).

### Host only: set up the relay

The host also needs Node.js and cloudflared, then runs the relay server.

**1. Install Node.js** (if you don't have it) from [nodejs.org](https://nodejs.org).

**2. Install cloudflared:**

- **Windows:** `winget install --id Cloudflare.cloudflared`
- **macOS:** `brew install cloudflared`
- **Linux:** via your package manager, or download from the [official releases](https://github.com/cloudflare/cloudflared/releases)

Verify it works — open a new terminal and run `cloudflared --version`. You should see a version number.

> Note: on Windows, cloudflared does **not** auto-update. Run `winget upgrade --id Cloudflare.cloudflared` occasionally, since Cloudflare only supports versions from the last year.

**3. Set up the relay** — the server lives in the `server/` folder of this repo:

```bash
cd server
npm install
```

**4. Start the relay:**

```bash
node src/index.js
```

The relay starts a Cloudflare tunnel automatically. When you see `[tunnel] URL captured: https://...trycloudflare.com` in the terminal, it's ready.

> Optional: the relay listens on port `3000` by default. To change it, create a `.env` file in `server/` with `PORT=xxxx`.

---

## Usage

### Host

1. Start your relay (see above) and open SillyTavern.
2. Select your character, **Start a fresh chat** (Create New Chat) or use the chat you want to share.
3. Open the **Extensions** panel → **SillyTavern Multiplayer (STMP)**.
4. Click **Open Room**. A room code appears — click **Copy**.
5. Send that code to your participants.

### Participant

1. Open SillyTavern, without selecting a character, **close the chat** (Close chat) and **start a fresh, empty chat** (Start new chat). *This is required*, see [Important rules](#important-rules).
2. Open the **Extensions** panel → **SillyTavern Multiplayer (STMP)**.
3. Paste the room code into the input and click **Join Room**.
4. You'll receive the host's chat history, and messages will sync in real time.

To leave, click **Leave Room** (participants) or **Close Room** (host closes the room for everyone).

---

## Important rules

- **Participants must join from a fresh, empty chat.** When you join, the host's history is loaded into your chat. If your chat already has messages, the join is blocked to prevent conflicts. Always Create New Chat before joining.
- **Only the host triggers the LLM.** Participants write messages; the host decides when to send them to the AI. Participant SillyTavern instances won't generate responses on their own. If you leave the room and want to continue using SillyTavern like normal, refresh the page or your sent messages will not trigger the LLM.
- **Personas are captured at join time.** Set your persona *before* joining. Changing it mid-session won't update what the AI knows.
- **Each session generates a new room code.** Codes are tied to the host's current relay session and don't persist across restarts.

---

## Security

Miko Multiplayer works by exposing the host's relay server to the internet through a Cloudflare tunnel while a room is open. This means:

- Anyone with the room code can connect to the host's relay.
- The room code contains the connection URL. Treat it like a temporary password, only share it with people you trust.
- When the host closes the room (or stops the relay), the tunnel closes and the connection is gone.

Because this is beta and the trust model is "share codes with friends," don't run public rooms or share codes openly.

---

## Known limitations (beta)

- **Swipes, edits, and message deletions do not sync.** If the host swipes a response or edits a message, participants won't see the change.
- **Persona changes mid-session are not reflected** in the AI's context.
- **One room at a time.** The relay supports a single room.
- **Quick tunnels are ephemeral.** The `trycloudflare.com` URL changes every time the relay restarts, and these tunnels aren't rate-limit guaranteed, fine for casual use, not for heavy traffic.

---

## Bundled dependency

The extension bundles the official **socket.io-client** browser build so it works without a build step:

- File: `lib/socket.io.esm.min.js`
- Version: **4.8.3**
- Source: official npm package `socket.io-client@4.8.3`, `dist/socket.io.esm.min.js`
- SHA256: `72a57408c85583436488d4dc29231cbb9b805b6e9bec8c7a73a43ff7f21f6c95`

To verify: `npm pack socket.io-client@4.8.3`, extract, and run `sha256sum dist/socket.io.esm.min.js`.

> The accompanying `.map` file is intentionally omitted; the source-map warning in the browser console is harmless.

---

## Acknowledgments

- [SillyTavern](https://github.com/SillyTavern/SillyTavern) this project is built on top of SillyTavern.
- [Socket.IO](https://socket.io/) real-time communication.
- [Cloudflare Tunnel](https://github.com/cloudflare/cloudflared) exposing the host relay.

## License

Released under [The Unlicense](LICENSE) — public domain.