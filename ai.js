// Azure OpenAI API credentials
const AZURE_API_KEY = "Fill up the API key here";
const AZURE_API_ENDPOINT = "fill up the endpoint here";

// DOM elements
const imageForm = document.getElementById('image-upload-form');
const imageInput = document.getElementById('image-input');
const imagePreview = document.getElementById('image-preview');
const loadingIndicator = document.getElementById('loading-indicator');
const statusMessage = document.getElementById('status-message');

// Handle image upload and preview
imageInput.addEventListener('change', function() {
    const file = this.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            imagePreview.src = e.target.result;
            imagePreview.style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
});

// Handle form submission
imageForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const file = imageInput.files[0];
    if (!file) return;
    
    // Show loading indicator
    loadingIndicator.style.display = 'flex';
    statusMessage.textContent = "Analyzing image...";
    
    try {
        // Convert image to base64 for API request and storage
        const imageDataUrl = await fileToDataUrl(file);
        const base64Image = imageDataUrl.split(',')[1]; // Extract base64 part for API
        
        // Call Azure OpenAI API to analyze the image
        statusMessage.textContent = "Extracting word from image...";
        const wordData = await analyzeImageWithAzureOpenAI(base64Image);
        
        if (wordData.length === 0) {
            statusMessage.textContent = "No word detected in the image.";
            loadingIndicator.style.display = 'none';
            return;
        }
        
        // Display status
        statusMessage.textContent = `Found a word! Creating flashcard...`;
        
        // Automatically create flashcard from the detected word
        // Include the image data URL with the flashcard
        const flashcards = wordData.map(item => ({
            id: Date.now() + Math.floor(Math.random() * 1000), // Generate unique ID
            word: item.word,
            pos: item.pos,
            definition: item.definition,
            image: imageDataUrl // Store the complete data URL for direct display
        }));
        
        // Save flashcards to local storage
        saveFlashcards(flashcards);
        
        statusMessage.textContent = `Created flashcard. Redirecting...`;
        
        // Redirect to main flashcards page after a short delay
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 1500);
        
    } catch (error) {
        console.error('Error analyzing image:', error);
        statusMessage.textContent = `Error analyzing image: ${error.message}`;
    } finally {
        loadingIndicator.style.display = 'none';
    }
});

// Convert file to data URL (keeps the full format for image display)
function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            resolve(reader.result);
        };
        reader.onerror = error => reject(error);
    });
}

// Convert data URL to base64 (for API use if needed)
function dataUrlToBase64(dataUrl) {
    return dataUrl.split(',')[1];
}

// Call Azure OpenAI API to analyze image and get definitions
async function analyzeImageWithAzureOpenAI(base64Image) {
    try {
        const response = await fetch(AZURE_API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key': AZURE_API_KEY,
                'api-version': AZURE_API_VERSION
            },
            body: JSON.stringify({
                messages: [
                    {
                        role: "system",
                        content: "You are a language learning assistant. Extract only the most prominent word visible in the image and provide its definition and part of speech. Return ONLY a JSON array with a single object containing 'word', 'pos' (n, v, or adj), and 'definition' fields."
                    },
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: "Please identify the most prominent word in this image and provide its definition and part of speech (n, v, adj). Return as JSON array with a single item."
                            },
                            {
                                type: "image_url",
                                image_url: {
                                    url: `data:image/jpeg;base64,${base64Image}`
                                }
                            }
                        ]
                    }
                ]
            })
        });

        if (!response.ok) {
            throw new Error(`API responded with status: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.choices && data.choices[0] && data.choices[0].message) {
            const content = data.choices[0].message.content;
            
            // Extract JSON from the response
            const jsonMatch = content.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                try {
                    const wordData = JSON.parse(jsonMatch[0]);
                    return wordData;
                } catch (parseError) {
                    console.error('Error parsing JSON from API response:', parseError);
                }
            }
        }

        throw new Error('No valid data in API response');
    } catch (error) {
        console.error('Error calling Azure OpenAI API:', error);
        throw error;
    }
}

// Save flashcards to local storage
function saveFlashcards(newCards) {
    try {
        // Load existing flashcards if any
        let existingCardsJson = localStorage.getItem('customFlashcards');
        let existingCards = existingCardsJson ? JSON.parse(existingCardsJson) : [];
        
        // Combine with new cards
        const combinedCards = [...existingCards, ...newCards];
        
        // Save back to local storage
        localStorage.setItem('customFlashcards', JSON.stringify(combinedCards));
        
        console.log(`Saved ${newCards.length} flashcards`);
    } catch (error) {
        console.error('Error saving flashcards:', error);
    }
}
