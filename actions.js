import { db, reloadCardsFromDB } from "./index.js";

// DOM elements
const apiKeyInput = document.getElementById("api-key");
const imageUploadInput = document.getElementById("image-upload");
const uploadPreview = document.getElementById("upload-preview");
const generateBtn = document.getElementById("btn-generate");
const clearAllBtn = document.getElementById("btn-clear-all");
const progressBar = document.getElementById("operation-progress");
const progressStatus = document.getElementById("operation-status");
const operationResults = document.getElementById("operation-results");
const exportJsonBtn = document.getElementById("btn-export-json");
const importJsonInput = document.getElementById("json-upload");

// Load API key from URL query
const apiKey = new URLSearchParams(location.search).get("apiKey");
if (apiKey) {
	apiKeyInput.value = apiKey;
}

// Image handling
function handleImageUpload() {
	uploadPreview.innerHTML = "";

	for (const file of imageUploadInput.files) {
		const img = document.createElement("img");
		img.src = URL.createObjectURL(file);
		img.className = "preview-image";
		uploadPreview.appendChild(img);
	}
}

// Generate flashcards from images
async function generateFlashcards() {
	const files = imageUploadInput.files;
	if (files.length === 0) {
		alert("Please upload at least one image.");
		return;
	}

	const apiKey = apiKeyInput.value.trim();
	if (!apiKey) {
		alert("Please enter your OpenAI API key.");
		return;
	}

	// Set up progress tracking
	progressBar.max = files.length;
	progressBar.value = 0;
	progressStatus.textContent = `Processing 0/${files.length} images...`;
	operationResults.textContent = "Generation in progress...";

	let successCount = 0;
	const totalCount = files.length;

	// Process each image
	const promises = Array.from(files, async (file, index) => {
		try {
			const result = await processImageWithRetry(file, apiKey);
			if (result) {
				successCount++;
				await saveFlashcardToDB(result);
			}
			progressBar.value++;
			progressStatus.textContent = `Processing ${progressBar.value}/${files.length} images...`;
			return result;
		} catch (error) {
			console.error(`Failed to process image ${index + 1}:`, error);
			progressBar.value++;
			progressStatus.textContent = `Processing ${progressBar.value}/${files.length} images...`;
			return null;
		}
	});

	await Promise.all(promises);

	// Update final status
	progressStatus.textContent = `Completed: ${successCount}/${totalCount} flashcards generated`;
	operationResults.textContent = `${successCount} out of ${totalCount} images were successfully processed.`;

	// Clear file input
	imageUploadInput.value = "";
	uploadPreview.innerHTML = "";

	return reloadCardsFromDB();
}

// Process image with retry mechanism
async function processImageWithRetry(file, apiKey, retries = 0) {
	try {
		return await processImage(file, apiKey);
	} catch (error) {
		if (retries < 4) {
			// Exponential backoff: 4s, 8s, 16s, 32s. This sum up to 60s
			const delay = Math.pow(2, retries + 2) * 1000;
			await new Promise(resolve => setTimeout(resolve, delay));
			return processImageWithRetry(file, apiKey, retries + 1);
		}
		throw error;
	}
}

// Process a single image through OpenAI API
async function processImage(file, apiKey) {
    const base64Image = await blobToBase64(file);

    // First API call - Vision analysis
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: "You are a language learning assistant that analyzes images and creates flashcards. Extract the most prominent object or concept from the image and create a flashcard entry. Provide accurate dictionary-like definitions, example sentences, and traditional Chinese translations that relate directly to what's shown in the image."
                },
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: "Create a language learning flashcard from this image. Identify the most prominent object or text in the image."
                        },
                        {
                            type: "image_url",
                            image_url: {
                                url: base64Image
                            }
                        }
                    ]
                }
            ],
            response_format: {
                type: "json_schema",
                json_schema: {
                    name: "flashcard",
                    description: "Creates a flashcard entry from an image",
                    schema: {
                        type: "object",
                        properties: {
                            word: {
                                type: "string",
                                description: "The word or short phrase to learn. DO NOT capitalize the first letter except for proper nouns. Prefer UK spelling."
                            },
                            zhTraditional: {
                                type: "string",
                                description: "Traditional Chinese translation of the word"
                            },
                            pronunciationUK: {
                                type: "string",
                                description: "UK pronunciation in IPA notation, enclosed with slashes"
                            },
                            pronunciationUS: {
                                type: "string",
                                description: "US pronunciation in IPA notation, enclosed with slashes"
                            },
                            pos: {
                                type: "array",
                                items: {
                                    type: "string"
                                },
                                description: "Part of speech (n, v, adj, adv, etc.) as an array of strings"
                            },
                            definition: {
                                type: "string",
                                description: "Precise dictionary-like definition of the word"
                            },
                            exampleSentence: {
                                type: "string",
                                description: "An example sentence using the word, related to what is shown in the image"
                            }
                        },
                        required: ["word", "zhTraditional", "pronunciationUK", "pronunciationUS", "pos", "definition", "exampleSentence"],
                        additionalProperties: false
                    },
                    strict: true
                }
            }
        })
    });

    if (!response.ok) {
        const errorData = await response.json();
        console.error("Vision API error:", errorData);
        throw new Error(`Vision API error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    console.log("Vision API response:", data); // Debug log

    const flashcardData = JSON.parse(data.choices[0].message.content || "''");

    if (!flashcardData?.word) {
        throw new Error("Invalid response from Vision API");
    }

    // Generate audio using text-to-speech API
    try {
        // UK voice
        const ukAudioResponse = await fetch("https://api.openai.com/v1/audio/speech", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "tts-1",
                input: flashcardData.word,
                voice: "shimmer", // UK voice
                response_format: "mp3"
            })
        });

        // US voice
        const usAudioResponse = await fetch("https://api.openai.com/v1/audio/speech", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "tts-1",
                input: flashcardData.word,
                voice: "alloy", // US voice
                response_format: "mp3"
            })
        });

        if (ukAudioResponse.ok && usAudioResponse.ok) {
            // Convert audio blobs to base64
            const ukAudioBlob = await ukAudioResponse.blob();
            const usAudioBlob = await usAudioResponse.blob();

            flashcardData.audioUK = await blobToBase64(ukAudioBlob);
            flashcardData.audioUS = await blobToBase64(usAudioBlob);

            console.log('Audio generation successful:');
            console.log('UK audio generated:', !!flashcardData.audioUK);
            console.log('US audio generated:', !!flashcardData.audioUS);
        } else {
            console.error("TTS API error:", await ukAudioResponse.text(), await usAudioResponse.text());
        }
    } catch (error) {
        console.error("Error generating audio:", error);
    }

    // Add image and other data
    flashcardData.image = file;
    flashcardData.id = crypto.randomUUID();
    flashcardData.progress = {};

    return flashcardData;
}

// Convert blob (including file) to base64 string
function blobToBase64(blob) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.addEventListener("load", () => resolve(reader.result));
		reader.addEventListener("error", reject);
		reader.readAsDataURL(blob);
	});
}

// Save flashcard to IndexedDB
async function saveFlashcardToDB(flashcardData) {
	// Create a copy to avoid modifying the original object
	const cardToSave = { ...flashcardData };
	
	// Store the base64 audio strings directly
	console.log('Saving audio data to DB:');
	console.log('UK audio present:', !!cardToSave.audioUK);
	console.log('US audio present:', !!cardToSave.audioUS);
	
	await db.put("cards", cardToSave);
}

// Clear all data
async function clearAllData() {
	if (confirm("Are you sure you want to delete ALL flashcards? This cannot be undone.")) {
		try {
			// Update status
			progressStatus.textContent = "Clearing data...";
			operationResults.textContent = "Deleting all flashcard data...";

			// Clear IndexedDB
			await db.clear("cards");

			// Clear file input and preview
			imageUploadInput.value = "";
			uploadPreview.innerHTML = "";
			importJsonInput.value = "";

			// Update status
			progressStatus.textContent = "Data cleared";
			operationResults.textContent = "All flashcard data has been deleted.";

			return reloadCardsFromDB();
		} catch (error) {
			console.error("Error clearing data:", error);
			operationResults.textContent = "Error clearing data: " + error.message;
		}
	}
}

// Export all cards to JSON file
async function exportCardsToJson() {
	try {
		// Get all cards from DB
		const allCards = await db.getAll("cards");

		// Process cards for export (convert binary to base64 for JSON serialization)
		const exportCards = await Promise.all(allCards.map(async card => {
			// Clone the card to avoid modifying the original
			const exportCard = { ...card };

			// Convert binary image to base64 if present
			if (exportCard.image && exportCard.image instanceof Blob) {
				exportCard.image = await blobToBase64(exportCard.image);
			}

			// Convert audio ArrayBuffers to base64
			if (exportCard.audioUK instanceof ArrayBuffer) {
				const blob = new Blob([exportCard.audioUK], { type: 'audio/mp3' });
				exportCard.audioUK = await blobToBase64(blob);
			}
			if (exportCard.audioUS instanceof ArrayBuffer) {
				const blob = new Blob([exportCard.audioUS], { type: 'audio/mp3' });
				exportCard.audioUS = await blobToBase64(blob);
			}

			return exportCard;
		}));

		// Create downloadable JSON file
		const jsonContent = JSON.stringify(exportCards, null, 2);
		const blob = new Blob([jsonContent], { type: "application/json" });
		const url = URL.createObjectURL(blob);

		const currentTime = new Date();
		const localTime = new Date(currentTime - currentTime.getTimezoneOffset() * 60 * 1000);
		const localTimeString = localTime.toISOString().slice(0, -5).replace("T", "_").replace(/-|:/g, ""); // Format in YYYYMMDD_HHMMSS format

		const a = document.createElement("a");
		a.href = url;
		a.download = `flashcards_export_${localTimeString}.json`;
		a.click();

		URL.revokeObjectURL(url);

		progressStatus.textContent = "Export complete";
		operationResults.textContent = `${exportCards.length} cards exported successfully.`;
	} catch (error) {
		console.error("Error exporting cards:", error);
		operationResults.textContent = "Error exporting cards: " + error.message;
	}
}

// Import cards from JSON file
async function handleJsonImport() {
	const file = importJsonInput.files[0];
	if (!file) return;

	try {
		const jsonContent = await file.text();
		const importedCards = JSON.parse(jsonContent);

		if (!Array.isArray(importedCards)) {
			throw new Error("Invalid JSON format: Expected an array of cards");
		}

		// Set up progress tracking
		progressBar.max = importedCards.length;
		progressBar.value = 0;
		progressStatus.textContent = `Importing 0/${importedCards.length} cards...`;
		operationResults.textContent = "Processing import file...";

		let successCount = 0;

		// Process each card
		await Promise.all(importedCards.map(async card => {
			try {
				// Ensure card has required fields
				if (!card.id || !card.word || !card.definition) {
					return;
				}

				// Convert base64 image back to binary if needed
				if (card.image && typeof card.image === "string" && card.image.startsWith("data:")) {
					const response = await fetch(card.image);
					card.image = await response.blob();
				}

				// Convert base64 audio back to ArrayBuffer if needed
				if (card.audioUK && typeof card.audioUK === "string") {
					const response = await fetch(card.audioUK);
					card.audioUK = await response.arrayBuffer();
				}
				if (card.audioUS && typeof card.audioUS === "string") {
					const response = await fetch(card.audioUS);
					card.audioUS = await response.arrayBuffer();
				}

				// Ensure progress is initialized
				card.progress ??= {};

				// Ensure pos is an array
				if (!Array.isArray(card.pos)) {
					card.pos = [card.pos].filter(Boolean);
				}

				// Save card to DB
				await db.put("cards", card);

				successCount++;
			} catch (error) {
				console.error("Error importing card:", error);
			}

			progressBar.value++;
			progressStatus.textContent = `Importing ${progressBar.value}/${importedCards.length} cards...`;
		}));

		// Update final status
		progressStatus.textContent = `Completed: ${successCount}/${importedCards.length} cards imported`;
		operationResults.textContent = `${successCount} out of ${importedCards.length} cards were successfully imported.`;

		// Clear input
		importJsonInput.value = "";

		return reloadCardsFromDB();
	} catch (error) {
		console.error("Error importing JSON:", error);
		operationResults.textContent = "Error importing JSON: " + error.message;
	}
}

// Event listeners
imageUploadInput.addEventListener("change", handleImageUpload);
generateBtn.addEventListener("click", generateFlashcards);
clearAllBtn.addEventListener("click", clearAllData);
exportJsonBtn.addEventListener("click", exportCardsToJson);
importJsonInput.addEventListener("change", handleJsonImport);
