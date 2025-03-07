# Trivia Battle - 1v1 Multiplayer Game

A real-time multiplayer trivia game where two players compete by answering trivia questions. Players earn points by answering questions correctly.

## Features

- Real-time multiplayer gameplay using Socket.IO
- 1v1 competitive format
- 4 rounds of trivia questions
- 14-minute total match time limit
- Players who answer incorrectly are locked out for the current round
- Responsive UI with real-time updates

## Technical Stack

- **Backend**: Node.js, Express, Socket.IO
- **Frontend**: Vanilla HTML, CSS, JavaScript
- **Communication**: Real-time bidirectional events with Socket.IO

## How to Run

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Start the server:
   ```
   npm start
   ```
4. Open your browser and navigate to `http://localhost:3000`

For development with auto-restart:
```
npm run dev
```

## How to Play

1. Enter your name and optionally a room code to join a specific game
2. If no room code is provided, you'll be placed in an available room or a new one will be created
3. Wait for another player to join
4. When the game starts, each round presents a multiple-choice question
5. Answer correctly to earn a point
6. If you answer incorrectly, you're locked out for the current round
7. The game consists of 4 rounds, with a total time limit of 14 minutes
8. The player with the most points at the end wins

## Game Flow

1. **Lobby**: Players enter their name and join a game
2. **Waiting Room**: Players wait for an opponent to join
3. **Game**: 4 rounds of trivia questions with a 14-minute total time limit
4. **Game Over**: Final scores and winner announcement

## Testing Locally

To test with two players locally:
1. Open two browser tabs/windows
2. Navigate to `http://localhost:3000` in each
3. Enter different player names
4. Use the same room code to join the same game
5. Once both players have joined, the game will start automatically

## How It Works

### Server-Side

The server manages:
- Game rooms and player assignments
- Question distribution
- Match timing (14-minute countdown)
- Score tracking
- Game state (waiting, in progress, game over)

### Client-Side

The client handles:
- User interface and interactions
- Real-time updates of game state
- Player answer submission
- Timer display
- Score and player status updates

### Socket.IO Events

- `join-room`: Player joins a game room
- `room-joined`: Server confirms room join
- `players-update`: Updates player lists
- `game-starting`: Game is about to start
- `new-round`: New question for a round
- `timer-update`: Updates countdown timer
- `submit-answer`: Player submits an answer
- `answer-result`: Result of player's answer
- `player-locked`: Player is locked for the round
- `player-answered`: Player has submitted an answer
- `round-update`: Round results
- `game-over`: Game results and winner 