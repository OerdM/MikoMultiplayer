//queueManager.js

import { getRoom } from './roomManager.js';

const queue = [];

// Initialize the queue based on the current room's users
function initQueue() {
    const room = getRoom();
    const hostId = room.hostId;
    queue.length = 0;
    queue.push(...room.users.keys());
    queue.splice(queue.indexOf(hostId), 1);
    queue.sort((a, b) => room.users.get(a).queueId - room.users.get(b).queueId);
    queue.push(hostId);
}

function getCurrentUser() {
    const room = getRoom();
    if (!room) {
        throw new Error('No room exists. Please create a room first.');
    }

    try {
        const currentUserId = queue[0];
        return {
            socketId: currentUserId,
            ...room.users.get(currentUserId)
        }
    } catch (error) {
        throw new Error('Error occurred while fetching current user.');
    }
}

function nextUser() {
    if (queue.length === 0) {
        throw new Error('Queue is empty. No users to rotate.');
    }
    try {
        queue.push(queue.shift());
        const cur = getCurrentUser();
        console.log('[server] nextUser() çağrıldı → yeni sıra:', cur.socketId, '| kuyruk:', JSON.stringify(queue));
        console.trace('[server] nextUser çağrı kaynağı');
        return cur;
    } catch (error) {
        throw new Error('Error occurred while rotating to the next user.');
    }
}

function addToQueue(socketId) {
    const room = getRoom();
    if (!room) {
        throw new Error('No room exists. Please create a room first.');
    }   
    if (!room.users.has(socketId)) {
        throw new Error('User not found in the room.');
    }
    
    try {
        const hostTemp = queue.pop(); // host is always at the end of queue
        queue.push(socketId);
        queue.push(hostTemp);
    } catch (error) {
        throw new Error('Error occurred while adding user to the queue.');
    }
}

function removeFromQueue(socketId) {
    try {
        const index = queue.indexOf(socketId);
        if (index !== -1) {
            queue.splice(index, 1);
        } else {
            throw new Error('User not found in the queue.');
        }
    } catch (error) {        
        throw new Error('Error occurred while removing user from the queue.');
    }
}

// Only host can reorder users in the queue
function reorderUser(callerSocketId, targetSocketId, newIndex) {

    if (callerSocketId !== getRoom().hostId) {
        throw new Error('Only the host can reorder users in the queue.');
    }

    try {
        const oldIndex = queue.indexOf(targetSocketId);
        if (oldIndex === -1) {
            throw new Error('User not found in the queue.');
        }
        queue.splice(oldIndex, 1);
        queue.splice(newIndex, 0, targetSocketId);
    } catch (error) {
        throw new Error('Error occurred while reordering users in the queue.');
    }
}

function getQueue() {
    return queue;
}

export { initQueue, getCurrentUser, nextUser, addToQueue, removeFromQueue, reorderUser, getQueue };
