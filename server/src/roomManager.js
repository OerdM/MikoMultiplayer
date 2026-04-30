const { v4: uuidv4 } = require('uuid');

let room;

const createRoom = (hostSocketId) => {
    room = {
        roomId: uuidv4(),
        hostId: hostSocketId,
        users: new Map([
            [hostSocketId, {
                'username': '',
                'persona': '',
                'queueId': 1
            }],
        ]),
        messages: [],
        nextQueue: 2
    }
    return room;
};

const addUser = (socketId, username, persona) => {
    try {
        if (!room) {
            throw new Error('No room exists. Please create a room first.');
        }

        const newUser = {
            username,
            persona,
            queueId: room.nextQueue
        }
        room.users.set(socketId, newUser);
        room.nextQueue++;
        return newUser;
    } catch (error) {
        console.error('Error adding user:', error);
    }
};

// Host leaving causes entire room to be deleted
const removeUser = (socketId) => {
    try {
        if (!room) {
            throw new Error('No room exists. Please create a room first.');
        }
        if (!room.users.has(socketId)) {
            throw new Error('User not found in the room.');
        }
        const removedUser = room.users.get(socketId);
        room.users.delete(socketId);
        if (socketId === room.hostId) {
            room = null;
        }
        return removedUser;
    } catch (error) {
        console.error('Error removing user:', error);
    }
};

const getRoom = () => {
    return room;
};

const deleteRoom = () => {
    try {
        if (!room) {
            throw new Error('No room exists. Please create a room first.');
        }
        const deletedRoom = room;
        room = null;
        return deletedRoom;
    } catch (error) {
        console.error('Error deleting room:', error);
    }
};

module.exports = { createRoom, addUser, removeUser, getRoom, deleteRoom };