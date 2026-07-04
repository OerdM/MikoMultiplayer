import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { spawn } from 'child_process';
import dotenv from 'dotenv';
dotenv.config();

import events from './events.js';

const PORT = process.env.PORT || 3000;

const app = express();

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' },
});

events(io);

let tunnelUrl = null;
let tunnelProc = null;

app.get('/tunnel-url', (req, res) => {
    res.json({ tunnelUrl });
});

// If the cloudflare tunnel fails to start (e.g. cloudflared not installed),
// the server falls back to localhost mode (tunnelUrl stays null).
function startTunnel() {
    console.log('[tunnel] starting cloudflared...');
    // shell: true makes PATH resolution reliable on Windows; harmless on Linux/macOS
    tunnelProc = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${PORT}`], { shell: true });

    const urlRegex = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;

    const onData = (buf) => {
        const text = buf.toString();
        const match = text.match(urlRegex);
        if (match && !tunnelUrl) {
            tunnelUrl = match[0];
            console.log(`[tunnel] URL captured: ${tunnelUrl}`);
        }
    };

    tunnelProc.stdout.on('data', onData);
    tunnelProc.stderr.on('data', onData);

    tunnelProc.on('error', (err) => {
        console.error('[tunnel] failed to start cloudflared:', err.message);
        console.error('[tunnel] is cloudflared installed? Falling back to localhost mode.');
        tunnelUrl = null;
        tunnelProc = null;
    });

    tunnelProc.on('exit', (code) => {
        console.warn(`[tunnel] cloudflared exited (code: ${code}). Resetting URL.`);
        tunnelUrl = null;
        tunnelProc = null;
    });

    setTimeout(() => {
        if (!tunnelUrl) {
            console.warn('[tunnel] no URL captured within 30s. Continuing in localhost mode.');
        }
    }, 30000);
}

function shutdown() {
    console.log('\n[server] shutting down...');
    if (tunnelProc) {
        console.log('[tunnel] terminating cloudflared...');
        try { tunnelProc.kill(); } catch (e) {}
    }
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(PORT, () => {
    console.log(`[server] listening on port ${PORT}.`);
    startTunnel();
});