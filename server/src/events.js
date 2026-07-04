// events.js
import { createRoom, updateUser, getRoom, addUser, removeUser } from './roomManager.js';
import { removeFromQueue, reorderUser, getQueue } from './queueManager.js';


// The server only supports one room at a time

export default (io) => {
    io.on('connection', (socket) => {
        console.log('[server] User connected:', socket.id);

        socket.on('createRoom', ({ username, persona }) => {
            try {
                const existing = getRoom();
                if (existing) {
                    if (existing.hostId === socket.id) {
                        console.warn('[server] createRoom tekrar geldi, mevcut oda döndürülüyor.');
                        socket.emit('roomCreated', { roomId: existing.roomId });
                        return;
                    }
                    throw new Error('A room already exists (single-room server).');
                }

                createRoom(socket.id);
                updateUser(socket.id, username, persona);

                const room = getRoom();
                socket.join(room.roomId);
                socket.emit('roomCreated', { roomId: room.roomId });
                console.log('[server] Room created by host:', socket.id, 'room:', room.roomId);
            } catch (error) {
                console.error('[server] Error creating room:', error);
                socket.emit('error', { message: `createRoom: ${error.message}` });
            }
        });

        socket.on('joinRoom', ({ roomId, username, persona }) => {
            try {
                const room = getRoom();
                if (!room) throw new Error('No room exists with the provided ID.');
                if (room.roomId !== roomId) throw new Error('Room ID does not match the existing room.');

                const newUser = addUser(socket.id, username, persona);
                socket.join(room.roomId);

                socket.emit('joinedRoom', { roomId: room.roomId, user: newUser });

                io.to(roomId).emit('userJoined', {
                    socketId: socket.id,
                    username: newUser.username,
                    persona: newUser.persona,
                });

                if (room.hostId && room.hostId !== socket.id) {
                    io.to(room.hostId).emit('requestSnapshot', { targetSocketId: socket.id });
                    console.log('[server] requestSnapshot → host, for new joiner:', socket.id);
                }
            } catch (error) {
                console.error('[server] Error joining room:', error);
                socket.emit('error', { message: 'Error joining room.' });
            }
        });

        socket.on('provideSnapshot', ({ targetSocketId, messages }) => {
            try {
                const room = getRoom();
                if (!room) throw new Error('No room exists.');
                if (room.hostId !== socket.id) throw new Error('Only the host can provide a snapshot.');

                io.to(targetSocketId).emit('snapshot', { messages });
                console.log(`[server] snapshot relayed → ${targetSocketId} (${messages?.length ?? 0} msgs)`);
            } catch (error) {
                console.error('[server] Error providing snapshot:', error);
                socket.emit('error', { message: 'Error providing snapshot.' });
            }
        });

        socket.on('sendMessage', ({ inputContext, username }) => {
            try {
                const room = getRoom();
                if (!room) throw new Error('No room exists. Please create a room first.');
                if (socket.id === room.hostId) throw new Error('Host must use hostSendMessage event to send messages.');

                const user = room.users.get(socket.id);
                if (!user) throw new Error('User not in room.');
                const name = username ?? user.username;

                room.messages.push({ socketId: socket.id, username: name, inputContext });

                io.to(room.roomId).emit('messageSent', {
                    socketId: socket.id,
                    username: name,
                    inputContext,
                });
            } catch (error) {
                console.error('[server] Error sending message:', error);
                socket.emit('error', { message: `sendMessage: ${error.message}` });
            }
        });

        socket.on('hostSendMessage', ({ inputContext, username }) => {
            try {
                const room = getRoom();
                if (!room) {
                    socket.emit('error', { message: 'No room exists.' });
                    return;
                }
                if (room.hostId !== socket.id) {
                    socket.emit('error', { message: 'Only the host can send messages using this event.' });
                    return;
                }

                const hostName = username ?? room.users.get(socket.id).username;
                room.messages.push({ socketId: socket.id, username: hostName, inputContext });

                io.to(room.roomId).emit('messageSent', {
                    socketId: socket.id,
                    username: hostName,
                    inputContext,
                });
                console.log(`[server] host input broadcast: ${hostName}`);

                let combinedMessages = '';
                room.messages.forEach(m => { combinedMessages += `${m.username}: ${m.inputContext}\n`; });

                socket.emit('llmReady', {
                    combinedMessages,
                    users: [...room.users.values()],
                });

                room.messages = [];
            } catch (error) {
                console.error('[server] Error sending host message:', error);
                socket.emit('error', { message: `hostSendMessage: ${error.message}` });
            }
        });

        socket.on('llmResponse', ({ inputContext, name }) => {
            try {
                const room = getRoom();
                if (!room) throw new Error('No room exists.');
                if (room.hostId !== socket.id) throw new Error('Only the host can broadcast LLM responses.');

                io.to(room.roomId).emit('llmResponse', {
                    name: name ?? 'Assistant',
                    inputContext,
                });
                console.log(`[server] llmResponse broadcast: ${name ?? 'Assistant'}`);
            } catch (error) {
                console.error('[server] Error broadcasting llmResponse:', error);
                socket.emit('error', { message: `llmResponse: ${error.message}` });
            }
        });

        socket.on('disconnect', () => {
            try {
                const room = getRoom();
                if (!room) return;

                const isHostLeaving = room.hostId === socket.id;

                removeUser(socket.id);

                if (isHostLeaving) {
                    io.to(room.roomId).emit('roomClosed', { message: 'Host has left the room.' });
                    console.log('[server] Host left — room closed.');
                    return;
                }

                const updatedRoom = getRoom();
                if (updatedRoom) {
                    io.to(updatedRoom.roomId).emit('userLeft', { socketId: socket.id });
                }
                console.log('[server] User left:', socket.id);
            } catch (error) {
                console.error('[server] Error handling disconnect:', error);
            }
        });
    });
};