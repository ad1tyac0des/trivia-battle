// Connect to Socket.IO server
const socket = io();

// DOM Elements
const lobbyScreen = document.getElementById('lobby');
const waitingRoom = document.getElementById('waiting-room');
const gameScreen = document.getElementById('game-screen');
const gameOverScreen = document.getElementById('game-over');

const playerNameInput = document.getElementById('player-name');
const roomIdInput = document.getElementById('room-id');
const joinBtn = document.getElementById('join-btn');
const lobbyMessage = document.getElementById('lobby-message');
const subjectSelection = document.getElementById('subject-selection');

const displayRoomCode = document.getElementById('display-room-code');
const waitingMessage = document.getElementById('waiting-message');
const waitingPlayersList = document.getElementById('waiting-players-list');

const roundInfo = document.getElementById('round-info');
const matchTimerDisplay = document.getElementById('match-timer');
const roundTimerDisplay = document.getElementById('round-timer');
const player1Score = document.getElementById('player1-score');
const player2Score = document.getElementById('player2-score');
const questionImage = document.getElementById('question-image');
const optionsContainer = document.getElementById('options');
const playerNameDisplay = document.getElementById('player-name-display');
const playerStatus = document.getElementById('player-status');
const opponentNameDisplay = document.getElementById('opponent-name-display');
const opponentStatusDisplay = document.getElementById('opponent-status-display');
const gameMessage = document.getElementById('game-message');

// Round indicators
const player1RoundIndicators = [
    document.getElementById('p1-round-1'),
    document.getElementById('p1-round-2'),
    document.getElementById('p1-round-3'),
    document.getElementById('p1-round-4')
];

const player2RoundIndicators = [
    document.getElementById('p2-round-1'),
    document.getElementById('p2-round-2'),
    document.getElementById('p2-round-3'),
    document.getElementById('p2-round-4')
];

const winnerDisplay = document.getElementById('winner');
const finalScores = document.getElementById('final-scores');
const timeExpiredMessage = document.getElementById('time-expired-message');
const playAgainBtn = document.getElementById('play-again');

// Game state
let playerData = {
    name: '',
    role: '',
    roomId: '',
    selectedSubjects: []
};

let gameState = {
    isLocked: false,
    currentRound: 0,
    selectedOption: null,
    opponent: null,
    canConfirm: false
};

let availableSubjects = [];

// Event Listeners
joinBtn.addEventListener('click', joinGame);
playAgainBtn.addEventListener('click', () => {
    window.location.reload();
});

// Initialize subject selection
function initializeSubjectSelection(subjects) {
    // Clear existing buttons
    subjectSelection.innerHTML = '';

    // Add "All Available" button
    const allSubjectsBtn = document.createElement('button');
    allSubjectsBtn.className = 'subject-btn selected';
    allSubjectsBtn.dataset.subject = 'All';
    allSubjectsBtn.textContent = 'All Available';
    subjectSelection.appendChild(allSubjectsBtn);

    // Add individual subject buttons
    ['Physics', 'Chemistry', 'Maths'].forEach(subject => {
        const btn = document.createElement('button');
        btn.className = `subject-btn${subjects.includes(subject) ? '' : ' disabled'}`;
        btn.dataset.subject = subject;
        btn.textContent = subject;
        subjectSelection.appendChild(btn);
    });

    // Set initial selected subjects
    playerData.selectedSubjects = subjects;

    // Add click handlers
    document.querySelectorAll('.subject-btn:not(.disabled)').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.dataset.subject === 'All') {
                // If 'All' is selected, deselect others
                document.querySelectorAll('.subject-btn').forEach(b => {
                    b.classList.remove('selected');
                });
                btn.classList.add('selected');
                playerData.selectedSubjects = subjects;
            } else {
                // If specific subject is selected, deselect 'All'
                const allBtn = document.querySelector('.subject-btn[data-subject="All"]');
                allBtn.classList.remove('selected');

                btn.classList.toggle('selected');

                // Update selected subjects
                playerData.selectedSubjects = Array.from(
                    document.querySelectorAll('.subject-btn.selected:not([data-subject="All"])')
                ).map(b => b.dataset.subject);

                // If no subjects selected, select 'All'
                if (playerData.selectedSubjects.length === 0) {
                    allBtn.classList.add('selected');
                    playerData.selectedSubjects = subjects;
                }
            }
        });
    });
}

// Handle available subjects
socket.on('available-subjects', (data) => {
    availableSubjects = data.subjects;
    initializeSubjectSelection(availableSubjects);
});

// Add confirm button functionality
const confirmBtn = document.getElementById('confirm-answer');
confirmBtn.addEventListener('click', () => {
    if (!gameState.selectedOption || !gameState.canConfirm) return;

    submitAnswer(gameState.selectedOption);
    gameState.canConfirm = false;
    confirmBtn.classList.remove('visible');
});

// Add event listeners to option buttons
document.querySelectorAll('.option').forEach(option => {
    option.addEventListener('click', () => {
        if (gameState.isLocked) return;

        // Clear previous selection
        document.querySelectorAll('.option').forEach(opt => {
            opt.classList.remove('selected');
        });

        // Select this option
        option.classList.add('selected');
        gameState.selectedOption = option.dataset.option;

        // Show confirm button
        gameState.canConfirm = true;
        confirmBtn.classList.add('visible');
    });
});

// Functions
function joinGame() {
    const name = playerNameInput.value.trim();
    const roomId = roomIdInput.value.trim();

    if (!name) {
        showMessage(lobbyMessage, 'Please enter your name', 'error');
        return;
    }

    playerData.name = name;

    // Emit join-room event with selected subjects
    socket.emit('join-room', {
        name,
        roomId,
        subjects: playerData.selectedSubjects
    });
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function showMessage(element, message, type) {
    element.textContent = message;
    element.className = `message ${type}`;
    element.classList.remove('hidden');

    // Auto-hide success and info messages after 5 seconds
    if (type === 'success' || type === 'info') {
        setTimeout(() => {
            element.classList.add('hidden');
        }, 5000);
    }
}

function updatePlayersList(players) {
    // Clear list
    waitingPlayersList.innerHTML = '';

    // Add players
    players.forEach(player => {
        const li = document.createElement('li');
        li.textContent = player.name + (player.role === playerData.role ? ' (You)' : '');
        li.dataset.id = player.id;
        li.dataset.role = player.role;
        waitingPlayersList.appendChild(li);

        // Store opponent data if this is not the current player
        if (player.role !== playerData.role) {
            gameState.opponent = player;
        }
    });

    // Update waiting message
    if (players.length < 2) {
        waitingMessage.textContent = 'Waiting for another player to join...';
    } else {
        waitingMessage.textContent = 'Both players joined! Game starting soon...';
    }
}

function updateGameDisplay() {
    // Update player names
    playerNameDisplay.textContent = playerData.name + ' (You)';

    if (gameState.opponent) {
        opponentNameDisplay.textContent = gameState.opponent.name;
    } else {
        opponentNameDisplay.textContent = 'Opponent';
    }

    // Update score display based on player role
    if (playerData.role === 'player1') {
        player1Score.textContent = `You: 0`;
        player2Score.textContent = `Opponent: 0`;
    } else {
        player1Score.textContent = `Opponent: 0`;
        player2Score.textContent = `You: 0`;
    }
}

function updateRoundWins(roundWins) {
    // Update round indicators for player 1
    for (let i = 0; i < player1RoundIndicators.length; i++) {
        if (i < roundWins.player1) {
            player1RoundIndicators[i].classList.add('round-won');
        } else {
            player1RoundIndicators[i].classList.remove('round-won');
        }
    }

    // Update round indicators for player 2
    for (let i = 0; i < player2RoundIndicators.length; i++) {
        if (i < roundWins.player2) {
            player2RoundIndicators[i].classList.add('round-won');
        } else {
            player2RoundIndicators[i].classList.remove('round-won');
        }
    }
}

function displayQuestionImage(imagePath) {
    questionImage.src = imagePath;

    // Reset option selections
    document.querySelectorAll('.option').forEach(option => {
        option.classList.remove('selected');
        option.classList.remove('locked');
    });

    // Reset player statuses
    playerStatus.className = 'player-status status-waiting';
    playerStatus.textContent = 'Waiting';
    opponentStatusDisplay.className = 'player-status status-waiting';
    opponentStatusDisplay.textContent = 'Waiting';
}

function submitAnswer(answer) {
    // Lock the UI to prevent multiple submissions
    gameState.isLocked = true;

    // Update player status
    playerStatus.className = 'player-status status-answered';
    playerStatus.textContent = 'Answered';

    // Emit the answer to the server
    socket.emit('submit-answer', answer);
}

function updateScores(scores) {
    if (playerData.role === 'player1') {
        player1Score.textContent = `You: ${scores.player1}`;
        player2Score.textContent = `Opponent: ${scores.player2}`;
    } else {
        player1Score.textContent = `Opponent: ${scores.player1}`;
        player2Score.textContent = `You: ${scores.player2}`;
    }
}

function showScreen(screen) {
    // Hide all screens
    lobbyScreen.style.display = 'none';
    waitingRoom.style.display = 'none';
    gameScreen.style.display = 'none';
    gameOverScreen.style.display = 'none';

    // Show the requested screen
    screen.style.display = 'block';
}

// Socket.IO event handlers
socket.on('error', (data) => {
    showMessage(lobbyMessage, data.message, 'error');
});

socket.on('room-joined', (data) => {
    playerData.roomId = data.roomId;
    playerData.role = data.role;
    availableSubjects = data.availableSubjects;

    displayRoomCode.textContent = data.roomId;
    updatePlayersList(data.players);

    showScreen(waitingRoom);
});

socket.on('players-update', (data) => {
    updatePlayersList(data.players);
});

socket.on('game-starting', (data) => {
    updatePlayersList(data.players);
    showMessage(gameMessage, 'Game is starting!', 'info');

    // Update game display with player names
    updateGameDisplay();

    // Switch to game screen
    showScreen(gameScreen);
});

socket.on('new-round', (data) => {
    // Reset game state
    gameState.isLocked = false;
    gameState.currentRound = data.round;
    gameState.selectedOption = null;
    gameState.canConfirm = false;
    confirmBtn.classList.remove('visible');

    // Update UI
    roundInfo.textContent = `Round ${data.round} of 7`;
    roundTimerDisplay.textContent = `Round: ${formatTime(data.roundTimeRemaining)}`;
    displayQuestionImage(data.questionImage);
    updateRoundWins(data.roundWins);

    // Show message
    showMessage(gameMessage, `Round ${data.round} started!`, 'info');
});

socket.on('match-timer-update', (timeRemaining) => {
    matchTimerDisplay.textContent = `Match: ${formatTime(timeRemaining)}`;

    // Make match timer red when less than 60 seconds
    if (timeRemaining <= 60) {
        matchTimerDisplay.style.color = '#e74c3c';
    } else {
        matchTimerDisplay.style.color = '#333';
    }
});

socket.on('round-timer-update', (timeRemaining) => {
    roundTimerDisplay.textContent = `Round: ${formatTime(timeRemaining)}`;

    // Make round timer red when less than 30 seconds
    if (timeRemaining <= 30) {
        roundTimerDisplay.style.color = '#e74c3c';
    } else {
        roundTimerDisplay.style.color = '#333';
    }
});

socket.on('answer-result', (data) => {
    if (data.correct) {
        showMessage(gameMessage, data.message, 'success');
        playerStatus.className = 'player-status status-correct';
        playerStatus.textContent = 'Correct';
    } else {
        showMessage(gameMessage, data.message, 'error');

        if (data.message.includes('locked') || data.message.includes('already answered')) {
            playerStatus.className = 'player-status status-incorrect';
            playerStatus.textContent = 'Incorrect';
        }
    }
});

socket.on('player-locked', (data) => {
    // Update status for the locked player
    if (data.playerId === socket.id) {
        playerStatus.className = 'player-status status-incorrect';
        playerStatus.textContent = 'Incorrect';
    } else if (gameState.opponent && data.playerId === gameState.opponent.id) {
        opponentStatusDisplay.className = 'player-status status-incorrect';
        opponentStatusDisplay.textContent = 'Incorrect';
    }
});

socket.on('player-answered', (data) => {
    // Update status for the player who answered
    if (data.playerId !== socket.id && gameState.opponent && data.playerId === gameState.opponent.id) {
        opponentStatusDisplay.className = 'player-status status-answered';
        opponentStatusDisplay.textContent = 'Answered';
    }
});

socket.on('round-update', (data) => {
    // Update scores
    updateScores(data.scores);

    // Update round wins
    updateRoundWins(data.roundWins);

    // Process results for each player
    Object.keys(data.playerResults).forEach(playerId => {
        const result = data.playerResults[playerId];

        // Update player status based on results
        if (playerId === socket.id) {
            if (result.isCorrect) {
                playerStatus.className = 'player-status status-correct';
                playerStatus.textContent = 'Correct';
            } else if (result.answer !== "No answer") {
                playerStatus.className = 'player-status status-incorrect';
                playerStatus.textContent = 'Incorrect';
            }
        } else if (gameState.opponent && playerId === gameState.opponent.id) {
            if (result.isCorrect) {
                opponentStatusDisplay.className = 'player-status status-correct';
                opponentStatusDisplay.textContent = 'Correct';
            } else if (result.answer !== "No answer") {
                opponentStatusDisplay.className = 'player-status status-incorrect';
                opponentStatusDisplay.textContent = 'Incorrect';
            }
        }
    });

    // Show round results message
    let message = `Round ${data.round} complete!`;
    if (data.roundWinner) {
        const winnerName = data.roundWinner === playerData.role ? 'You' : 'Opponent';
        message += ` ${winnerName} won this round!`;
    } else {
        message += " It's a tie!";
    }

    if (data.timeExpired) {
        message += " Time's up!";
    }

    message += " Next round starting soon...";

    showMessage(gameMessage, message, 'info');
});

socket.on('player-left', (data) => {
    if (data.players.length < 2) {
        showMessage(gameMessage, `${data.playerName} has left the game.`, 'error');

        // If in waiting room, update the player list
        if (waitingRoom.style.display === 'block') {
            updatePlayersList(data.players);
        } else {
            // If game was in progress, show game over with forfeit message
            winnerDisplay.textContent = 'Opponent left the game. You win!';
            showScreen(gameOverScreen);
        }
    }
});

socket.on('game-over', (data) => {
    // Update final scores based on round wins
    let yourRoundWins, opponentRoundWins;

    if (playerData.role === 'player1') {
        yourRoundWins = data.roundWins.player1;
        opponentRoundWins = data.roundWins.player2;
    } else {
        yourRoundWins = data.roundWins.player2;
        opponentRoundWins = data.roundWins.player1;
    }

    finalScores.textContent = `You: ${yourRoundWins} - Opponent: ${opponentRoundWins}`;

    // Display winner
    if (data.winner === playerData.role) {
        winnerDisplay.textContent = 'You Win!';
    } else if (data.winner === null) {
        winnerDisplay.textContent = 'It\'s a Tie!';
    } else {
        winnerDisplay.textContent = 'Opponent Wins!';
    }

    // Show time expired message if applicable
    if (data.timeExpired) {
        timeExpiredMessage.textContent = 'Match time limit reached!';
        timeExpiredMessage.classList.remove('hidden');
    } else {
        timeExpiredMessage.classList.add('hidden');
    }

    // Show game over screen
    showScreen(gameOverScreen);
});