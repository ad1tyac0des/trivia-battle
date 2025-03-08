// Format: { url: 'URL_TO_IMAGE', answer: 'CorrectOption' }

const MIN_QUESTIONS_REQUIRED = 7;

// Define questions with direct URLs
const physicsQuestions = [
    { url: 'https://i.imgur.com/okFdmAg.png', answer: 'C' },
    { url: 'https://i.imgur.com/AXkgH1a.png', answer: 'B' },
    { url: 'https://i.imgur.com/hOw44zn.png', answer: 'C' },
    { url: 'https://i.imgur.com/WJehbW7.png', answer: 'A' },
    { url: 'https://i.imgur.com/1fRFUdx.png', answer: 'B' },
    { url: 'https://i.imgur.com/0ZiPKkx.png', answer: 'A' },
    { url: 'https://i.imgur.com/nWEVcGe.png', answer: 'B' },
];

const chemistryQuestions = [
    {url: 'https://i.imgur.com/n5ollph.png', answer: 'A'},
    {url: 'https://i.imgur.com/7OERkhn.png', answer: 'D'},
    {url: 'https://i.imgur.com/8whpoGa.png', answer: 'A'},
    {url: 'https://i.imgur.com/eVhpykK.png', answer: 'B'},
    {url: 'https://i.imgur.com/cFWlQbR.png', answer: 'A'},
    {url: 'https://i.imgur.com/KyxYeEV.png', answer: 'A'},
    {url: 'https://i.imgur.com/IP17nJP.png', answer: 'C'},
];

const mathsQuestions = [
];

// Organize questions by subject
const questionsBySubject = {
    Physics: physicsQuestions.map(q => q.url),
    Chemistry: chemistryQuestions.map(q => q.url),
    Maths: mathsQuestions.map(q => q.url)
};

// Function to generate question answers mapping
function generateQuestionAnswers() {
    const answers = {};
    
    // Add answers from each subject
    const allQuestions = [...physicsQuestions, ...chemistryQuestions, ...mathsQuestions];
    allQuestions.forEach(question => {
        answers[question.url] = question.answer;
    });
    
    return answers;
}

// Generate the question answers mapping
const questionAnswers = generateQuestionAnswers();

// Get question counts for each subject
const questionCounts = {
    Physics: physicsQuestions.length,
    Chemistry: chemistryQuestions.length,
    Maths: mathsQuestions.length
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
    questionsBySubject,
    MIN_QUESTIONS_REQUIRED
}; 