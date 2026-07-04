// roomManager.js

import { v4 as uuidv4 } from 'uuid';

// There could be some old code remnants that suggest turn checks
// but current implementation is flexible and does not enforce strict turn-taking for users

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

const updateUser = (socketId, username, persona) => {
    try {
        if (!room) {
            throw new Error('No room exists. Please create a room first.');
        }
        if (!room.users.has(socketId)) {
            throw new Error('User not found in the room.');
        }
        const currentUser = room.users.get(socketId);
        const updatedUser = {
            username: username,
            persona: persona,
            queueId: currentUser.queueId
        };
        room.users.set(socketId, updatedUser);
        return updatedUser;
    } catch (error) {
        console.error('Error updating user:', error);
    }
};

export { createRoom, addUser, removeUser, getRoom, deleteRoom, updateUser };