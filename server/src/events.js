import { createRoom, updateUser, getRoom, addUser, removeUser } from './roomManager.js';
import { addToQueue, getCurrentUser, initQueue, nextUser, removeFromQueue, reorderUser, getQueue } from './queueManager.js';

export default (io) => {
    io.on('connection', (socket) => {
        console.log('User connected:', socket.id);

        socket.on('createRoom', ({ username, persona }) => {
            try {
                createRoom(socket.id);
                updateUser(socket.id, username, persona);
                initQueue();

                const room = getRoom();
                socket.join(room.roomId);

                socket.emit('roomCreated', { roomId: room.roomId });
            
            } catch (error) {
                console.error('Error creating room:', error);
                socket.emit('error', { message: 'Error creating room.' });
            }
        });

        socket.on('joinRoom', ({ roomId, username, persona }) => {
            try {
                const room = getRoom(); // Check if room exists
                if (!room) {
                    throw new Error('No room exists with the provided ID.');
                }
                if(room.roomId !== roomId) {
                    throw new Error('Room ID does not match the existing room.');
                }
                
                const newUser = addUser(socket.id, username, persona);
                addToQueue(socket.id);
                socket.join(room.roomId);
                socket.emit('joinedRoom', {
                    roomId: room.roomId,
                    user: newUser
                });

                io.to(roomId).emit('userJoined', {
                    socketId: socket.id,
                    username: newUser.username,
                    persona: newUser.persona
                })

            } catch (error) {
                console.error('Error joining room:', error);
                socket.emit('error', { message: 'Error joining room.' });
            } 
        });

        socket.on('sendMessage', ({ inputContext }) => {
            try {
                const room = getRoom(); // Ensure room exists before sending message
                if (!room) {
                    throw new Error('No room exists. Please create a room first.');
                }
                if(getCurrentUser().socketId !== socket.id) {
                    throw new Error('You are not the current user.');
                }

                const { username } = room.users.get(socket.id);
                room.messages.push({
                    socketId: socket.id,
                    username,
                    inputContext
                });
                nextUser();

                io.to(room.roomId).emit('messageSent', {
                    socketId: socket.id,
                    username,
                    inputContext
                });

                const next = getCurrentUser();
                io.to(next.socketId).emit('yourTurn');

            } catch (error) {
                console.error('Error sending message:', error);
                socket.emit('error', { message: 'Error sending message.' });
            }
        })

        socket.on('hostSendMessage', ({ inputContext }) => {
            try {
                const room = getRoom(); // Ensure room exists before sending message
            if (!room) {
                console.error('No room exists. Please create a room first.');
                socket.emit('error', { message: 'No room exists. Please create a room first.' });
                return;
            }

            if(room.hostId !== socket.id) {
                console.error('Only the host can send messages using this event.');
                socket.emit('error', { message: 'Only the host can send messages using this event.' });
                return;
            }

            room.messages.push({
                socketId: socket.id,
                username: room.users.get(socket.id).username,
                inputContext
            });

            let combinedMessages = '';
            room.messages.forEach(message => {
                combinedMessages += `${message.username}: ${message.inputContext}\n`;
            });

            socket.emit('llmReady', { 
                combinedMessages, 
                users: [...room.users.values()] 
            });

            room.messages = [];

            nextUser();

            } catch (error) {
                console.error('Error sending host message:', error);
                socket.emit('error', { message: 'Error sending host message.' });
            }
        });

        socket.on('reorderQueue', ({ targetSocketId, newIndex }) => {
            try {
                const room = getRoom(); // Ensure room exists before reordering queue
                if (!room) {
                    throw new Error('No room exists. Please create a room first.');
                }

                if(room.hostId !== socket.id) {
                    throw new Error('Only the host can reorder the queue.');
                }

                reorderUser(socket.id, targetSocketId, newIndex);
                
                io.to(room.roomId).emit('queueReordered', {
                    queue: getQueue() // Send the updated queue to all clients
                });

            } catch (error) {
                console.error('Error reordering queue:', error);
                socket.emit('error', { message: 'Error reordering queue.' });
            }
        });

        socket.on('disconnect', () => {
            try {
                const room = getRoom();
                removeFromQueue(socket.id);
                removeUser(socket.id);

                const updatedRoom = getRoom();
                if (updatedRoom) {
                    io.to(updatedRoom.roomId).emit('userLeft', { socketId: socket.id });
                }

            } catch (error) {
                console.error('Error handling disconnect:', error);
            }
        });
    });
}

