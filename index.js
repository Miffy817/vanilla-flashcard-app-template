import "./actions.js";
import { openDB } from "https://cdn.jsdelivr.net/npm/idb@8/+esm";

// IndexedDB initialization
export let db;
let cards = [];

async function initDB() {
	db = await openDB("flashcardDB", 1, {
		upgrade(db) {
			if (!db.objectStoreNames.contains("cards")) {
				db.createObjectStore("cards", { keyPath: "id" });
			}
		}
	});

	return reloadCardsFromDB();
}

export async function reloadCardsFromDB() {
	// Get all cards from DB
	cards = await db.getAll("cards");

	// Sort cards by due date
	cards.sort((a, b) => {
		const dateA = a.progress?.dueDate ? new Date(a.progress.dueDate) : Infinity;
		const dateB = b.progress?.dueDate ? new Date(b.progress.dueDate) : Infinity;
		return dateA - dateB;
	});

	// Render the UI
	initEntries();
	renderCard();
}

let currentIndex = 0;

const entriesBody = document.getElementById("entries-body");

/** Creates a table row for each card, allowing quick navigation. */
function initEntries() {
	// Clear existing rows
	entriesBody.innerHTML = "";

	// Build table rows
	cards.forEach((card, i) => {
		const row = document.createElement("tr");
		row.addEventListener("click", () => {
			currentIndex = i;
			renderCard();
		});

		const cellImage = document.createElement("td");
		const img = document.createElement("img");
		img.src = URL.createObjectURL(card.image);
		img.className = "entries-image";
		cellImage.appendChild(img);

		const cellWord = document.createElement("td");
		cellWord.textContent = card.word;

		const cellDue = document.createElement("td");
		cellDue.textContent = card.progress?.dueDate || "Unseen"; // If the card has not been learnt before, mark it as "Unseen"

		const cellAction = document.createElement("td");
		const deleteBtn = document.createElement("button");
		deleteBtn.textContent = "🗑️";
		deleteBtn.className = "delete-btn";
		deleteBtn.addEventListener("click", event => {
			event.stopPropagation(); // Prevent row click
			deleteCard(card.id, i);
		});
		cellAction.appendChild(deleteBtn);

		row.appendChild(cellImage);
		row.appendChild(cellWord);
		row.appendChild(cellDue);
		row.appendChild(cellAction);
		entriesBody.appendChild(row);
	});
}

// Function to delete a card
async function deleteCard(cardId, index) {
	if (!confirm("Are you sure you want to delete this flashcard?")) {
		return;
	}

	try {
		// Delete from the database
		await db.delete("cards", cardId);

		// Remove from local array
		cards.splice(index, 1);

		// Re-render entries
		initEntries();

		// Adjust current index if needed
		if (cards.length === 0) {
			// No cards left
			currentIndex = 0;
		} else if (currentIndex >= cards.length) {
			// Current card was deleted, move to the last card
			currentIndex = cards.length - 1;
		}

		renderCard();
	} catch (error) {
		console.error("Error deleting card:", error);
	}
}

/** Updates highlighted row and due dates each time we render or change data. */
function updateEntries() {
	// Update row highlight and due dates
	cards.forEach((card, i) => {
		const row = entriesBody.children[i];
		row.classList.toggle("row-highlight", i === currentIndex);

		const cellDue = row.children[2]; // Due date is at index 2
		const dueDateString = card.progress?.dueDate;
		if (dueDateString) {
			cellDue.textContent = dueDateString;
			// If the due date is earlier than today, mark it as overdue
			const dueDate = new Date(dueDateString);
			const today = new Date();
			cellDue.classList.toggle("overdue-date", dueDate.setHours(0, 0, 0, 0) < today.setHours(0, 0, 0, 0));
		} else {
			cellDue.textContent = "Unseen";
			cellDue.classList.remove("overdue-date");
		}
	});
}

/**
 * Mapping between abbreviated and full forms of parts of speech.
 * You can use the same technique to transform your data.
 */
const posMapping = {
	n: "noun",
	v: "verb",
	adj: "adjective",
	adv: "adverb",
	// Add more mappings as needed
};

// Grabs references to the flashcard UI elements needed to display data.
const frontWord = document.getElementById("front-word");
const frontImage = document.getElementById("front-image");
const backWord = document.getElementById("back-word");
const backPronunciationUK = document.getElementById("back-pronunciation-uk");
const backPronunciationUS = document.getElementById("back-pronunciation-us");
const backPosContainer = document.getElementById("back-pos-container");
const backDefinition = document.getElementById("back-definition");
const backExample = document.getElementById("back-example");
const backImage = document.getElementById("back-image");

const flipCardCheckbox = document.getElementById("flip-card-checkbox");
const cardInner = document.getElementById("card-inner");
const transitionHalfDuration = parseFloat(getComputedStyle(cardInner).transitionDuration) * 1000 / 2;

/** Renders the current card on both front and back. */
function renderCard() {
	if (cards.length === 0) {
		frontWord.textContent = "No flashcards available";
		flipCardCheckbox.checked = false;

		// Clear all fields
		frontImage.removeAttribute("src");
		backWord.textContent = "";
		backPronunciationUK.textContent = "—";
		backPronunciationUS.textContent = "—";
		backPosContainer.innerHTML = "";
		backDefinition.textContent = "";
		backExample.textContent = "";
		backImage.removeAttribute("src");
		return;
	}

	// STUDENTS: Start of recommended modifications
	// If there are more fields in the dataset (e.g., synonyms, example sentences),
	// display them here (e.g., backSynonym.textContent = currentCard.synonym).

	// Update the front side with the current card's word
	const currentCard = cards[currentIndex];
	frontWord.textContent = currentCard.word;

	// Display image on front side
	frontImage.src = URL.createObjectURL(currentCard.image);

	// Reset flashcard to the front side
	flipCardCheckbox.checked = false;

	// Wait for the back side to become invisible before updating the content
	setTimeout(() => {
		// Update word on back side
		backWord.textContent = currentCard.word;

		// Update pronunciations
		backPronunciationUK.textContent = currentCard.pronunciationUK || "—";
		backPronunciationUS.textContent = currentCard.pronunciationUS || "—";

		// Clear previous parts of speech
		backPosContainer.innerHTML = "";

		// Create a span for each part of speech
		for (const pos of Array.isArray(currentCard.pos) ? currentCard.pos : [currentCard.pos]) {
			const span = document.createElement("span");
			span.className = "back-pos";
			span.textContent = posMapping[pos] || pos;
			backPosContainer.appendChild(span);
		}

		// Update definition
		backDefinition.textContent = currentCard.definition || "";

		// Update example sentence
		backExample.textContent = currentCard.exampleSentence || "";

		// Update image on back side
		backImage.src = URL.createObjectURL(currentCard.image);
		
		// Update audio players
        const audioUK = document.getElementById("back-audio-uk");
        const audioUS = document.getElementById("back-audio-us");
        
        if (currentCard.audioUK) {
            audioUK.src = currentCard.audioUK;
        }
        if (currentCard.audioUS) {
            audioUS.src = currentCard.audioUS;
        }
	}, transitionHalfDuration);
	// STUDENTS: End of recommended modifications

	updateEntries();
}

/** Navigates to the previous card. */
function previousCard() {
	currentIndex = (currentIndex - 1 + cards.length) % cards.length;
}

/** Navigates to the next card. */
function nextCard() {
	currentIndex = (currentIndex + 1) % cards.length;
}

document.getElementById("btn-back").addEventListener("click", () => {
	previousCard();
	renderCard();
});
document.getElementById("btn-skip").addEventListener("click", () => {
	nextCard();
	renderCard();
});

/**
 * Mapping between the user's selection (Again, Good, Easy) and the number of days to wait before reviewing the card again.
 */
const dayOffset = { again: 1, good: 3, easy: 7 };

/**
 * Records learning progress by updating the card's due date based on the user's selection (Again, Good, Easy).
 */
async function updateDueDate(type) {
	const card = cards[currentIndex];
	const today = new Date();
	const dueDate = new Date(today.setDate(today.getDate() + dayOffset[type]) - today.getTimezoneOffset() * 60 * 1000);
	const dueDateString = dueDate.toISOString().split("T")[0]; // Format in YYYY-MM-DD format

	// Update card's progress in memory
	(card.progress ??= {}).dueDate = dueDateString;

	// Save to IndexedDB
	await db.put("cards", card);

	updateEntries();
}

document.getElementById("btn-again").addEventListener("click", async () => {
	await updateDueDate("again");
	nextCard();
	renderCard();
});
document.getElementById("btn-good").addEventListener("click", async () => {
	await updateDueDate("good");
	nextCard();
	renderCard();
});
document.getElementById("btn-easy").addEventListener("click", async () => {
	await updateDueDate("easy");
	nextCard();
	renderCard();
});

// Initialize database and the app
initDB();
