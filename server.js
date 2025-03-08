const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const { questionAnswers, availableSubjects, questionsBySubject, MIN_QUESTIONS_REQUIRED } = require('./config');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Game constants
const MAX_PLAYERS = 2; // 1v1 format
const ROUNDS_TO_WIN = 4; // First to win 4 rounds wins the match
const MAX_ROUNDS = 7; // Maximum possible rounds in a match
const MATCH_TIME = 28 * 60; // 28 minutes in seconds
const ROUND_TIME = 4 * 60; // 4 minutes per round in seconds

// Game rooms storage
const gameRooms = {};

// No need to load question images from local files anymore
// The questions are now defined in the config.js file with direct URLs

// Generate a random room code
function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Find or create a room for the player
function findAvailableRoom(socket, playerName, requestedRoomId, selectedSubjects) {
    let room;

    if (requestedRoomId) {
        room = gameRooms[requestedRoomId];
        if (!room) {
            return { error: 'Room not found' };
        }
        if (room.players.length >= 2) {
            return { error: 'Room is full' };
        }
    } else {
        // Find an available room or create a new one
        for (const roomId in gameRooms) {
            if (gameRooms[roomId].players.length === 1) {
                room = gameRooms[roomId];
                break;
            }
        }

        if (!room) {
            const roomId = generateRoomCode();
            room = {
                roomId: roomId,
                players: [],
                scores: { player1: 0, player2: 0 },
                roundWins: { player1: 0, player2: 0 },
                currentRound: 0,
                roundAnswers: {},
                usedQuestions: [],
                subjects: selectedSubjects || availableSubjects,
                gameStarted: false,
                roundTimeRemaining: ROUND_TIME,
                matchTimeRemaining: MATCH_TIME
            };
            gameRooms[roomId] = room;
        }
    }

    // If this is the first player, set the subjects
    if (room.players.length === 0 && selectedSubjects) {
        room.subjects = selectedSubjects;
    }

    return { room };
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
    // Initialize usedQuestions array if it doesn't exist
    if (!room.usedQuestions) {
        room.usedQuestions = [];
    }
    
    // Initialize questionHistory array if it doesn't exist
    if (!room.questionHistory) {
        room.questionHistory = [];
    }

    // Get questions from selected subjects
    let availableQuestions = [];

    // If subjects array is empty or includes 'All', use all available subjects
    if (!room.subjects || room.subjects.length === 0 || room.subjects.includes('All')) {
        room.subjects = availableSubjects;
    }

    // Get questions from selected subjects
    room.subjects.forEach(subject => {
        if (questionsBySubject[subject] && questionsBySubject[subject].length > 0) {
            availableQuestions = [...availableQuestions, ...questionsBySubject[subject]];
        }
    });

    // Filter out used questions and questions without answers
    const unusedQuestions = availableQuestions.filter(
        question => !room.usedQuestions.includes(question) && questionAnswers[question]
    );

    if (unusedQuestions.length === 0) {
        console.log('No more unused questions available. Used questions:', room.usedQuestions);
        console.log('Available questions:', availableQuestions);
        return null;
    }

    const randomIndex = Math.floor(Math.random() * unusedQuestions.length);
    const questionUrl = unusedQuestions[randomIndex];
    room.usedQuestions.push(questionUrl);

    return {
        imagePath: questionUrl, // This is now a direct URL
        options: ['A', 'B', 'C', 'D'],
        correctAnswer: questionAnswers[questionUrl]
    };
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

    if (!room) return;

    // Check if someone has already won the match
    if (room.roundWins.player1 >= ROUNDS_TO_WIN || room.roundWins.player2 >= ROUNDS_TO_WIN) {
        endGame(roomId, false);
        return;
    }

    // Check if we've reached the maximum number of rounds
    if (room.currentRound >= MAX_ROUNDS) {
        endGame(roomId, false);
        return;
    }

    room.currentRound++;
    room.roundActive = true;
    room.lockedPlayers = [];
    room.playerAnswers = {}; // Reset player answers for this round
    room.roundTimeRemaining = ROUND_TIME;

    console.log(`[Round ${room.currentRound}] Starting new round for room ${roomId}`);
    console.log(`[Round ${room.currentRound}] Room subjects:`, room.subjects);
    console.log(`[Round ${room.currentRound}] Used questions:`, room.usedQuestions);

    const question = getRandomQuestion(room);

    if (!question) {
        console.log(`[Round ${room.currentRound}] No question available, ending game`);
        endGame(roomId, true);
        return;
    }

    console.log(`[Round ${room.currentRound}] Selected question: ${question.imagePath}`);
    console.log(`[Round ${room.currentRound}] Correct answer: ${question.correctAnswer}`);

    room.currentQuestion = question;
    
    // Add question to history with round number
    room.questionHistory.push({
        round: room.currentRound,
        imagePath: question.imagePath,
        correctAnswer: question.correctAnswer,
        playerAnswers: {} // Will be filled as players answer
    });

    // Send the new question to all players
    io.to(roomId).emit('new-round', {
        round: room.currentRound,
        roundWins: room.roundWins,
        questionImage: question.imagePath,
        options: question.options,
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
        roundWins: room.roundWins,
        timeExpired: timeExpired,
        roundWinner: null
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

    // Determine round winner
    if (room.scores.player1 > room.scores.player2) {
        room.roundWins.player1++;
        roundResults.roundWinner = 'player1';
    } else if (room.scores.player2 > room.scores.player1) {
        room.roundWins.player2++;
        roundResults.roundWinner = 'player2';
    }

    // Reset scores for the next round
    room.scores = { player1: 0, player2: 0 };

    // Update round wins in the results
    roundResults.roundWins = room.roundWins;

    // Send round results
    io.to(roomId).emit('round-update', roundResults);

    // Check if game should end (someone has won enough rounds)
    if (room.roundWins.player1 >= ROUNDS_TO_WIN || room.roundWins.player2 >= ROUNDS_TO_WIN || room.currentRound >= MAX_ROUNDS) {
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
    if (room.roundWins.player1 > room.roundWins.player2) {
        winner = 'player1';
    } else if (room.roundWins.player2 > room.roundWins.player1) {
        winner = 'player2';
    }
    // If round wins are equal, it's a tie (winner remains null)

    // Get player names
    const player1 = room.players.find(p => p.role === 'player1');
    const player2 = room.players.find(p => p.role === 'player2');

    // Prepare question history with player names
    const questionHistoryWithNames = room.questionHistory.map(q => {
        const playerAnswersWithNames = {};
        if (player1 && q.playerAnswers[player1.id] !== undefined) {
            playerAnswersWithNames[player1.name] = q.playerAnswers[player1.id];
        }
        if (player2 && q.playerAnswers[player2.id] !== undefined) {
            playerAnswersWithNames[player2.name] = q.playerAnswers[player2.id];
        }
        
        return {
            round: q.round,
            imagePath: q.imagePath,
            correctAnswer: q.correctAnswer,
            playerAnswers: playerAnswersWithNames
        };
    });

    // Send game over event
    io.to(roomId).emit('game-over', {
        winner: winner,
        roundWins: room.roundWins,
        player1: player1 ? player1.name : 'Player 1',
        player2: player2 ? player2.name : 'Player 2',
        timeExpired: timeExpired,
        questionHistory: questionHistoryWithNames
    });

    // Keep the room for a while before cleaning up
    setTimeout(() => {
        delete gameRooms[roomId];
    }, 60000); // Clean up after 1 minute
}

// Add this function to check if there are enough questions
function hasEnoughQuestions(room) {
    let totalQuestions = 0;

    if (room.subjects.includes('All')) {
        // Sum up questions from all subjects
        Object.values(questionsBySubject).forEach(questions => {
            totalQuestions += questions.length;
        });
    } else {
        room.subjects.forEach(subject => {
            if (questionsBySubject[subject]) {
                totalQuestions += questionsBySubject[subject].length;
            }
        });
    }

    // We need at least MAX_ROUNDS (7) questions for a full game
    return totalQuestions >= MAX_ROUNDS;
}

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    // Send available subjects to client on connection
    socket.emit('available-subjects', {
        subjects: availableSubjects,
        minRequired: MIN_QUESTIONS_REQUIRED
    });

    // Player joins a room
    socket.on('join-room', ({ name, roomId, subjects }) => {
        // Validate subjects
        let selectedSubjects = subjects;
        if (!selectedSubjects || selectedSubjects.length === 0 || selectedSubjects.includes('All')) {
            selectedSubjects = availableSubjects;
        } else {
            // Filter out subjects that don't have enough questions
            selectedSubjects = selectedSubjects.filter(subject =>
                questionsBySubject[subject] && questionsBySubject[subject].length >= MIN_QUESTIONS_REQUIRED
            );
            if (selectedSubjects.length === 0) {
                selectedSubjects = availableSubjects;
            }
        }

        const result = findAvailableRoom(socket, name, roomId, selectedSubjects);

        if (result.error) {
            socket.emit('error', { message: result.error });
            return;
        }

        const room = result.room;

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

        // If this is the first player, set the validated subjects
        if (role === 'player1') {
            room.subjects = selectedSubjects;
        }

        // Check if there are enough questions for the selected subjects
        if (!hasEnoughQuestions(room)) {
            socket.emit('error', {
                message: `Not enough questions available for the selected subjects. 
                  Only subjects with at least ${MIN_QUESTIONS_REQUIRED} questions are allowed.`
            });
            // Remove player from room
            room.players = room.players.filter(p => p.id !== socket.id);
            return;
        }

        // Join the socket room
        socket.join(room.roomId);

        // Send room info to the player
        socket.emit('room-joined', {
            roomId: room.roomId,
            role: role,
            subjects: room.subjects,
            availableSubjects: availableSubjects,
            players: room.players.map(p => ({ id: p.id, name: p.name, role: p.role }))
        });

        // Broadcast updated player list to all in the room
        io.to(room.roomId).emit('players-update', {
            players: room.players.map(p => ({ id: p.id, name: p.name, role: p.role })),
            subjects: room.subjects
        });

        // Store room ID in socket for later reference
        socket.data.roomId = room.roomId;
        socket.data.player = player;

        // Check if we have enough players to start
        if (room.players.length === MAX_PLAYERS && !room.gameStarted) {
            // Double check we have enough questions before starting
            if (!hasEnoughQuestions(room)) {
                io.to(room.roomId).emit('error-message', {
                    message: 'Cannot start game: Not enough questions available.'
                });
                return;
            }

            // Notify all players that game is starting
            io.to(room.roomId).emit('game-starting', {
                players: room.players.map(p => ({ id: p.id, name: p.name, role: p.role })),
                subjects: room.subjects
            });

            // Start the game after a short delay
            setTimeout(() => {
                startGame(room.roomId);
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
        
        // Also store in question history
        const currentQuestionHistory = room.questionHistory[room.currentRound - 1];
        if (currentQuestionHistory) {
            currentQuestionHistory.playerAnswers[player.id] = answer;
        }

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