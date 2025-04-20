import { openDB } from "https://cdn.jsdelivr.net/npm/idb@8/+esm";

const db = await openDB("flashcardDB", 2);
let quizQuestions = [];
let userAnswers = {};

// DOM elements
const startScreen = document.getElementById('start-screen');
const quizScreen = document.getElementById('quiz-screen');
const questionsContainer = document.getElementById('questions-container');
const finishButton = document.getElementById('finish-quiz');
const resultsDiv = document.getElementById('results');

// Start quiz button handler
document.getElementById('start-quiz').addEventListener('click', startQuiz);

// Finish quiz button handler
finishButton.addEventListener('click', showResults);

async function startQuiz() {
    // Get all flashcards from IndexedDB
    const cards = await db.getAll('cards');
    
    if (cards.length < 5) {
        alert('You need at least 5 flashcards to take a quiz!');
        return;
    }

    // Get API key from IndexedDB or prompt user
    let apiKey = localStorage.getItem('openai_api_key');
    if (!apiKey) {
        apiKey = prompt('Please enter your OpenAI API key:');
        if (!apiKey) return;
        localStorage.setItem('openai_api_key', apiKey);
    }

    startScreen.style.display = 'none';
    quizScreen.style.display = 'block';
    questionsContainer.innerHTML = '<p>Generating questions...</p>';

    try {
        // Generate quiz questions
        quizQuestions = await generateQuizQuestions(cards, apiKey);
        displayQuestions(quizQuestions);
        finishButton.style.display = 'block';
    } catch (error) {
        questionsContainer.innerHTML = `<p>Error generating questions: ${error.message}</p>`;
    }
}

async function generateQuizQuestions(cards, apiKey, retries = 3) {
    try {
        const selectedCards = shuffleArray(cards).slice(0, 5);
        const flashcardContent = selectedCards.map(card => ({
            word: card.word,
            definition: card.definition,
            example: card.exampleSentence
        }));

        // Create AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        // Configure fetch options with proxy support
        const fetchOptions = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "gpt-4-1106-preview",
                messages: [{
                    role: "system",
                    content: "You are a quiz generator. Generate a JSON response with exactly this structure: {\"questions\": [{\"question\": \"question text\", \"options\": [\"option1\", \"option2\", \"option3\", \"option4\"], \"correctAnswer\": 0}]}. Create 5 questions based on the flashcard content."
                }, {
                    role: "user",
                    content: `Create a quiz in JSON format based on these flashcards: ${JSON.stringify(flashcardContent)}`
                }],
                response_format: { type: "json_object" }
            }),
            signal: controller.signal
        };

        // Try different endpoints if main one fails
        const endpoints = [
            'https://api.openai.com/v1/chat/completions',
            'https://api.openai.com/v1/chat/completions?timeout=30000',
            'https://api-inference.openai.com/v1/chat/completions'
        ];

        let lastError;
        for (const endpoint of endpoints) {
            try {
                const response = await fetch(endpoint, fetchOptions);
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error?.message || 'API request failed');
                }
                const data = await response.json();
                const parsedContent = JSON.parse(data.choices[0].message.content);
                
                if (!parsedContent.questions?.length) {
                    throw new Error('Invalid response format');
                }
                
                return parsedContent.questions;
            } catch (error) {
                lastError = error;
                console.warn(`Attempt failed for ${endpoint}:`, error);
                continue;
            }
        }

        // If we still have retries left, wait and try again
        if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            return generateQuizQuestions(cards, apiKey, retries - 1);
        }

        throw new Error(`Failed to connect after multiple attempts: ${lastError.message}`);

    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error('Request timed out. Please try again.');
        }
        if (error.message.includes('Failed to fetch')) {
            throw new Error('Network error. Please check your internet connection and try again.');
        }
        throw error;
    }
}

function displayQuestions(questions) {
    if (!Array.isArray(questions) || questions.length === 0) {
        questionsContainer.innerHTML = '<p>No questions available</p>';
        return;
    }

    questionsContainer.innerHTML = questions.map((q, i) => `
        <div class="question">
            <h3>Question ${i + 1}</h3>
            <p>${q.question || 'Question text unavailable'}</p>
            <div class="options">
                ${(q.options || []).map((option, j) => `
                    <div class="option" data-question="${i}" data-option="${j}">
                        ${option || 'Option unavailable'}
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');

    // Add click handlers for options
    document.querySelectorAll('.option').forEach(option => {
        option.addEventListener('click', selectOption);
    });
}

function selectOption(event) {
    const questionIndex = event.currentTarget.dataset.question;
    const optionIndex = event.currentTarget.dataset.option;

    // Remove previous selection for this question
    document.querySelectorAll(`.option[data-question="${questionIndex}"]`)
        .forEach(opt => opt.classList.remove('selected'));
    
    // Add selection to clicked option
    event.currentTarget.classList.add('selected');
    
    // Store user's answer
    userAnswers[questionIndex] = parseInt(optionIndex);
}

function showResults() {
    // Check if all questions are answered
    if (Object.keys(userAnswers).length < quizQuestions.length) {
        alert('Please answer all questions before finishing!');
        return;
    }

    // Calculate score and show results
    let score = 0;
    quizQuestions.forEach((q, i) => {
        const userAnswer = userAnswers[i];
        const correctAnswer = q.correctAnswer;
        
        if (userAnswer === correctAnswer) score++;

        // Highlight correct and incorrect answers
        const options = document.querySelectorAll(`.option[data-question="${i}"]`);
        options.forEach(option => {
            const optionIndex = parseInt(option.dataset.option);
            if (optionIndex === correctAnswer) {
                option.classList.add('correct');
            } else if (optionIndex === userAnswer) {
                option.classList.add('incorrect');
            }
        });
    });

    // Display results
    resultsDiv.style.display = 'block';
    resultsDiv.innerHTML = `
        <h2>Quiz Results</h2>
        <p>You scored ${score} out of ${quizQuestions.length}!</p>
        <button class="primary-button" onclick="location.reload()">Try Again</button>
    `;
    finishButton.style.display = 'none';
}

// Utility function to shuffle array
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}
