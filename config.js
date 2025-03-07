// Question answers configuration
// Format: '/assets/Subject/filename': 'CorrectOption'

// Only include answers for questions that exist in the assets folder
const correctAnswerPhysics = ['C', 'B', 'C', 'A', 'B', 'A', 'B'];  // 7 physics questions
const correctAnswerChemistry = [];  // No chemistry questions yet
const correctAnswerMaths = [];      // No math questions yet

const MIN_QUESTIONS_REQUIRED = 7;  // Minimum questions needed for a subject

// Function to generate question answers mapping
function generateQuestionAnswers() {
    const answers = {};

    // Only generate mappings for subjects that have questions
    if (correctAnswerPhysics.length > 0) {
        correctAnswerPhysics.forEach((answer, index) => {
            answers[`/assets/Physics/pq${index + 1}.png`] = answer;
        });
    }

    if (correctAnswerChemistry.length > 0) {
        correctAnswerChemistry.forEach((answer, index) => {
            answers[`/assets/Chemistry/cq${index + 1}.png`] = answer;
        });
    }

    if (correctAnswerMaths.length > 0) {
        correctAnswerMaths.forEach((answer, index) => {
            answers[`/assets/Maths/mq${index + 1}.png`] = answer;
        });
    }

    return answers;
}

const questionAnswers = generateQuestionAnswers();

// Get question counts for each subject
const questionCounts = {
    Physics: correctAnswerPhysics.length,
    Chemistry: correctAnswerChemistry.length,
    Maths: correctAnswerMaths.length
};

// Determine which subjects have enough questions
const availableSubjects = Object.entries(questionCounts)
    .filter(([_, count]) => count >= MIN_QUESTIONS_REQUIRED)
    .map(([subject]) => subject);

console.log('Question counts:', questionCounts);
console.log('Available subjects:', availableSubjects);
console.log('Generated Question Answers:', questionAnswers);

module.exports = {
    questionAnswers,
    questionCounts,
    availableSubjects,
    MIN_QUESTIONS_REQUIRED
}; 