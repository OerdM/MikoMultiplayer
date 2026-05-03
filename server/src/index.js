import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import events from './events.js';

const app = express();
const server = http.createServer(app);
const io = new Server(server);

events(io);

server.listen(3000, () => {
  console.log('Server is running on port 3000');
});

