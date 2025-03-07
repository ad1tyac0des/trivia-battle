const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Game constants
const MAX_PLAYERS = 2; // Changed from 8 to 2 for 1v1
const MAX_ROUNDS = 4; // Changed from 7 to 4 rounds
const MATCH_TIME = 14 * 60; // 14 minutes in seconds
const ROUND_TIME = 2 * 60; // 2 minutes per round in seconds

// Game rooms storage
const gameRooms = {};

// Trivia questions
const triviaQuestions = [
  {
    question: "What is the capital of France?",
    options: ["London", "Berlin", "Paris", "Madrid"],
    correctAnswer: "Paris"
  },
  {
    question: "Which planet is known as the Red Planet?",
    options: ["Venus", "Mars", "Jupiter", "Saturn"],
    correctAnswer: "Mars"
  },
  {
    question: "What is the largest mammal?",
    options: ["Elephant", "Giraffe", "Blue Whale", "Hippopotamus"],
    correctAnswer: "Blue Whale"
  },
  {
    question: "Who wrote 'Romeo and Juliet'?",
    options: ["Charles Dickens", "William Shakespeare", "Jane Austen", "Mark Twain"],
    correctAnswer: "William Shakespeare"
  },
  {
    question: "What is the chemical symbol for gold?",
    options: ["Go", "Gd", "Au", "Ag"],
    correctAnswer: "Au"
  },
  {
    question: "Which country is home to the kangaroo?",
    options: ["New Zealand", "South Africa", "Australia", "Brazil"],
    correctAnswer: "Australia"
  },
  {
    question: "What is the largest organ in the human body?",
    options: ["Heart", "Liver", "Brain", "Skin"],
    correctAnswer: "Skin"
  },
  {
    question: "Which of these is not a primary color?",
    options: ["Red", "Blue", "Green", "Yellow"],
    correctAnswer: "Green"
  },
  {
    question: "What is the tallest mountain in the world?",
    options: ["K2", "Mount Everest", "Kilimanjaro", "Matterhorn"],
    correctAnswer: "Mount Everest"
  },
  {
    question: "Which element has the chemical symbol 'O'?",
    options: ["Gold", "Oxygen", "Osmium", "Oganesson"],
    correctAnswer: "Oxygen"
  }
];

// Generate a random room code
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Find an available room or create a new one
function findAvailableRoom() {
  // Check for rooms with available slots
  for (const roomId in gameRooms) {
    if (gameRooms[roomId].players.length < MAX_PLAYERS && !gameRooms[roomId].gameStarted) {
      return roomId;
    }
  }
  
  // Create a new room if none available
  const newRoomId = generateRoomCode();
  gameRooms[newRoomId] = {
    roomId: newRoomId,
    players: [],
    scores: { player1: 0, player2: 0 }, // Changed from teamA/teamB to player1/player2
    currentRound: 0,
    gameStarted: false,
    roundActive: false,
    currentQuestion: null,
    matchTimer: null,
    roundTimer: null,
    matchTimeRemaining: MATCH_TIME,
    roundTimeRemaining: ROUND_TIME,
    lockedPlayers: [],
    usedQuestions: [],
    playerAnswers: {} // Track answers for each player
  };
  
  return newRoomId;
}

// Assign player role (player1 or player2)
function assignPlayerRole(room) {
  if (room.players.length === 0) {
    return 'player1';
  } else {
    return 'player2';
  }
}

// Get a random question that hasn't been used yet
function getRandomQuestion(room) {
  const availableQuestions = triviaQuestions.filter(
    (_, index) => !room.usedQuestions.includes(index)
  );
  
  if (availableQuestions.length === 0) {
    // If all questions used, reset the used questions
    room.usedQuestions = [];
    return triviaQuestions[Math.floor(Math.random() * triviaQuestions.length)];
  }
  
  const randomIndex = Math.floor(Math.random() * availableQuestions.length);
  const questionIndex = triviaQuestions.indexOf(availableQuestions[randomIndex]);
  room.usedQuestions.push(questionIndex);
  
  return availableQuestions[randomIndex];
}

// Start the game
function startGame(roomId) {
  const room = gameRooms[roomId];
  
  if (!room) return;
  
  room.gameStarted = true;
  room.matchTimeRemaining = MATCH_TIME;
  
  // Start the match timer
  room.matchTimer = setInterval(() => {
    room.matchTimeRemaining--;
    
    // Broadcast match timer update
    io.to(roomId).emit('match-timer-update', room.matchTimeRemaining);
    
    // Check if match time is up
    if (room.matchTimeRemaining <= 0) {
      endGame(roomId, true);
    }
  }, 1000);
  
  // Start the first round
  startRound(roomId);
}

// Start a new round
function startRound(roomId) {
  const room = gameRooms[roomId];
  
  if (!room || room.currentRound >= MAX_ROUNDS) {
    endGame(roomId, false);
    return;
  }
  
  room.currentRound++;
  room.roundActive = true;
  room.lockedPlayers = [];
  room.playerAnswers = {}; // Reset player answers for this round
  room.roundTimeRemaining = ROUND_TIME;
  room.currentQuestion = getRandomQuestion(room);
  
  // Send the new question to all players
  io.to(roomId).emit('new-round', {
    round: room.currentRound,
    question: room.currentQuestion.question,
    options: room.currentQuestion.options,
    roundTimeRemaining: room.roundTimeRemaining
  });
  
  // Start the round timer
  if (room.roundTimer) {
    clearInterval(room.roundTimer);
  }
  
  room.roundTimer = setInterval(() => {
    room.roundTimeRemaining--;
    
    // Broadcast round timer update
    io.to(roomId).emit('round-timer-update', room.roundTimeRemaining);
    
    // Check if round time is up
    if (room.roundTimeRemaining <= 0) {
      // Time's up for this round, evaluate it even if not everyone answered
      evaluateRound(roomId, true);
    }
  }, 1000);
}

// Check if all players have answered and move to next round if needed
function checkAllAnswered(roomId) {
  const room = gameRooms[roomId];
  
  if (!room || !room.roundActive) return;
  
  // Check if all players have answered
  const allAnswered = room.players.every(player => 
    room.playerAnswers[player.id] !== undefined || room.lockedPlayers.includes(player.id)
  );
  
  if (allAnswered) {
    evaluateRound(roomId, false);
  }
}

// Evaluate the round results
function evaluateRound(roomId, timeExpired) {
  const room = gameRooms[roomId];
  
  if (!room || !room.roundActive) return;
  
  // Clear the round timer
  if (room.roundTimer) {
    clearInterval(room.roundTimer);
    room.roundTimer = null;
  }
  
  room.roundActive = false;
  
  // Calculate points for each player
  let roundResults = {
    round: room.currentRound,
    playerResults: {},
    scores: room.scores,
    timeExpired: timeExpired
  };
  
  // Check each player's answer
  room.players.forEach(player => {
    const answer = room.playerAnswers[player.id];
    const isCorrect = answer === room.currentQuestion.correctAnswer;
    
    if (isCorrect) {
      // Award a point for correct answer
      room.scores[player.role]++;
    }
    
    roundResults.playerResults[player.id] = {
      name: player.name,
      answer: answer || "No answer",
      isCorrect: answer ? isCorrect : false,
      role: player.role
    };
  });
  
  // Update scores in the results
  roundResults.scores = room.scores;
  
  // Send round results
  io.to(roomId).emit('round-update', roundResults);
  
  // Check if game should end
  if (room.currentRound >= MAX_ROUNDS) {
    // Game is over
    endGame(roomId, false);
  } else {
    // Start next round after a delay
    setTimeout(() => {
      startRound(roomId);
    }, 5000); // 5-second delay between rounds
  }
}

// End the game
function endGame(roomId, timeExpired) {
  const room = gameRooms[roomId];
  
  if (!room) return;
  
  // Clear any active timers
  if (room.matchTimer) {
    clearInterval(room.matchTimer);
  }
  
  if (room.roundTimer) {
    clearInterval(room.roundTimer);
  }
  
  // Determine the winner
  let winner = null;
  if (room.scores.player1 > room.scores.player2) {
    winner = 'player1';
  } else if (room.scores.player2 > room.scores.player1) {
    winner = 'player2';
  }
  // If scores are equal, it's a tie (winner remains null)
  
  // Get player names
  const player1 = room.players.find(p => p.role === 'player1');
  const player2 = room.players.find(p => p.role === 'player2');
  
  // Send game over event
  io.to(roomId).emit('game-over', {
    winner: winner,
    scores: room.scores,
    player1: player1 ? player1.name : 'Player 1',
    player2: player2 ? player2.name : 'Player 2',
    timeExpired: timeExpired
  });
  
  // Keep the room for a while before cleaning up
  setTimeout(() => {
    delete gameRooms[roomId];
  }, 60000); // Clean up after 1 minute
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);
  
  // Player joins a room
  socket.on('join-room', ({ name, roomId: requestedRoomId }) => {
    // Find or create a room
    const roomId = requestedRoomId || findAvailableRoom();
    const room = gameRooms[roomId];
    
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }
    
    if (room.gameStarted) {
      socket.emit('error', { message: 'Game already in progress' });
      return;
    }
    
    if (room.players.length >= MAX_PLAYERS) {
      socket.emit('error', { message: 'Room is full' });
      return;
    }
    
    // Assign player role
    const role = assignPlayerRole(room);
    
    // Create player object
    const player = {
      id: socket.id,
      name: name,
      role: role
    };
    
    // Add player to room
    room.players.push(player);
    
    // Join the socket room
    socket.join(roomId);
    
    // Send room info to the player
    socket.emit('room-joined', {
      roomId: roomId,
      role: role,
      players: room.players.map(p => ({ id: p.id, name: p.name, role: p.role }))
    });
    
    // Broadcast updated player list to all in the room
    io.to(roomId).emit('players-update', {
      players: room.players.map(p => ({ id: p.id, name: p.name, role: p.role }))
    });
    
    // Store room ID in socket for later reference
    socket.data.roomId = roomId;
    socket.data.player = player;
    
    // Check if we have enough players to start
    if (room.players.length === MAX_PLAYERS && !room.gameStarted) {
      // Notify all players that game is starting
      io.to(roomId).emit('game-starting', {
        players: room.players.map(p => ({ id: p.id, name: p.name, role: p.role }))
      });
      
      // Start the game after a short delay
      setTimeout(() => {
        startGame(roomId);
      }, 3000);
    }
  });
  
  // Player submits an answer
  socket.on('submit-answer', (answer) => {
    const roomId = socket.data.roomId;
    const player = socket.data.player;
    
    if (!roomId || !player) return;
    
    const room = gameRooms[roomId];
    
    if (!room || !room.roundActive) return;
    
    // Check if player is already locked for this round
    if (room.lockedPlayers.includes(player.id)) {
      socket.emit('answer-result', {
        correct: false,
        message: 'You are locked out for this round'
      });
      return;
    }
    
    // Check if player has already answered
    if (room.playerAnswers[player.id] !== undefined) {
      socket.emit('answer-result', {
        correct: false,
        message: 'You have already answered this question'
      });
      return;
    }
    
    // Store the player's answer
    room.playerAnswers[player.id] = answer;
    
    // Check if answer is correct
    const isCorrect = answer === room.currentQuestion.correctAnswer;
    
    if (isCorrect) {
      socket.emit('answer-result', {
        correct: true,
        message: 'Correct answer!'
      });
    } else {
      // Wrong answer - lock the player for this round
      room.lockedPlayers.push(player.id);
      
      socket.emit('answer-result', {
        correct: false,
        message: 'Wrong answer!'
      });
      
      // Notify all players about the locked player
      io.to(roomId).emit('player-locked', {
        playerId: player.id,
        playerName: player.name,
        role: player.role
      });
    }
    
    // Notify others that this player has answered
    io.to(roomId).emit('player-answered', {
      playerId: player.id,
      playerName: player.name,
      role: player.role
    });
    
    // Check if all players have answered
    checkAllAnswered(roomId);
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    const player = socket.data.player;
    
    if (!roomId || !player) return;
    
    const room = gameRooms[roomId];
    
    if (!room) return;
    
    // Remove player from room
    room.players = room.players.filter(p => p.id !== player.id);
    
    // Notify remaining players
    io.to(roomId).emit('player-left', {
      playerId: player.id,
      playerName: player.name,
      role: player.role,
      players: room.players.map(p => ({ id: p.id, name: p.name, role: p.role }))
    });
    
    // If game hasn't started yet and a player leaves, we can continue waiting
    // If game has started and a player leaves, end the game
    if (room.gameStarted) {
      endGame(roomId, false);
    }
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 