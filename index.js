import "./actions.js";
import { openDB } from "https://cdn.jsdelivr.net/npm/idb@8/+esm";

// Section management
const sectionsCheckboxes = [
    document.getElementById("toggle-entries-checkbox"),
    document.getElementById("toggle-tools-checkbox"),
    document.getElementById("toggle-playlist-checkbox")
];

// Close all sections except the one being opened
function closeOtherSections(exceptCheckbox) {
    sectionsCheckboxes.forEach(checkbox => {
        if (checkbox !== exceptCheckbox) {
            checkbox.checked = false;
        }
    });
}

// Add event listeners for section toggles
sectionsCheckboxes.forEach(checkbox => {
    checkbox.addEventListener('change', function() {
        if (this.checked) {
            closeOtherSections(this);
        }
    });
});

// IndexedDB initialization
export let db;
let cards = [];

async function initDB() {
    db = await openDB("flashcardDB", 2, {
        upgrade(db, oldVersion, newVersion) {
            // Create cards store if it doesn't exist
            if (!db.objectStoreNames.contains("cards")) {
                db.createObjectStore("cards", { keyPath: "id" });
            }
            // Create playlists store if it doesn't exist
            if (!db.objectStoreNames.contains("playlists")) {
                const playlistStore = db.createObjectStore("playlists", { keyPath: "id" });
                playlistStore.createIndex('name', 'name', { unique: true });
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

    // If no cards, show empty state
    if (cards.length === 0) {
        const emptyRow = document.createElement("tr");
        const emptyCell = document.createElement("td");
        emptyCell.colSpan = 4;
        emptyCell.textContent = "No flashcards available";
        emptyCell.style.textAlign = "center";
        emptyRow.appendChild(emptyCell);
        entriesBody.appendChild(emptyRow);
        return;
    }

    // Build table rows
    cards.forEach((card, i) => {
        const row = document.createElement("tr");
        row.addEventListener("click", () => {
            currentIndex = i;
            renderCard();
        });

        // Image cell with error handling
        const cellImage = document.createElement("td");
        const img = document.createElement("img");
        try {
            if (card.image instanceof Blob) {
                img.src = URL.createObjectURL(card.image);
            } else {
                img.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50"><rect width="50" height="50" fill="%23ddd"/></svg>';
            }
        } catch (error) {
            console.error("Error creating image URL:", error);
        }

        // Action cell
        const cellAction = document.createElement("td");
        const deleteBtn = document.createElement("button");
        deleteBtn.textContent = "🗑️";
        deleteBtn.className = "delete-btn";
        deleteBtn.title = "Delete card";
        deleteBtn.addEventListener("click", event => {
            event.stopPropagation();
            deleteCard(card.id, i);
        });
        cellAction.appendChild(deleteBtn);

        // Append all cells
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

// Add new playlist management functions
const playlistNameInput = document.getElementById("playlist-name");
const createPlaylistBtn = document.getElementById("btn-create-playlist");
const playlistItems = document.getElementById("playlist-items");

// Function to create a new playlist
async function createPlaylist() {
    const name = playlistNameInput.value.trim();
    if (!name) {
        alert("Please enter a playlist name");
        return;
    }

    try {
        const playlist = {
            id: crypto.randomUUID(),
            name: name,
            cards: []  // Array to store card IDs
        };

        await db.add("playlists", playlist);
        playlistNameInput.value = ""; // Clear input
        await loadPlaylists(); // Refresh playlist display
    } catch (error) {
        if (error.name === 'ConstraintError') {
            alert("A playlist with this name already exists");
        } else {
            console.error("Error creating playlist:", error);
            alert("Failed to create playlist");
        }
    }
}

// Add DOM references for playlist detail view
const playlistDetailSection = document.createElement("div");
playlistDetailSection.id = "playlist-detail";
playlistDetailSection.className = "playlist-panel tool-panel";
document.querySelector("#playlist-container").appendChild(playlistDetailSection);

// Modified loadPlaylists function to add click handlers for viewing playlist details
async function loadPlaylists() {
    try {
        const playlists = await db.getAll("playlists");
        playlistItems.innerHTML = "";

        playlists.forEach(playlist => {
            const div = document.createElement("div");
            div.className = "playlist-item";
            div.innerHTML = `
                <span class="playlist-name">${playlist.name} (${playlist.cards.length} cards)</span>
                <div class="playlist-actions">
                    <button class="view-btn" title="View Playlist">👁️</button>
                    <button class="delete-btn" data-playlist-id="${playlist.id}">🗑️</button>
                </div>
            `;

            // Add click handler for viewing playlist
            div.querySelector('.view-btn').addEventListener('click', () => showPlaylistDetail(playlist));
            
            // Add delete button handler
            div.querySelector('.delete-btn').addEventListener('click', () => deletePlaylist(playlist.id));
            
            playlistItems.appendChild(div);
        });
    } catch (error) {
        console.error("Error loading playlists:", error);
    }
}

// Function to show playlist detail view
async function showPlaylistDetail(playlist) {
    try {
        // Hide playlist list and show detail view
        document.querySelector("#playlist-list").style.display = "none";
        playlistDetailSection.style.display = "block";

        // Get all cards in the playlist
        const playlistCards = [];
        for (const cardId of playlist.cards) {
            const card = await db.get("cards", cardId);
            if (card) playlistCards.push(card);
        }

        // Render playlist detail view
        playlistDetailSection.innerHTML = `
            <div class="detail-header">
                <button class="back-btn">← Back to Playlists</button>
                <h2>${playlist.name}</h2>
                <p>${playlistCards.length} cards</p>
            </div>
            <div class="cards-grid">
                ${playlistCards.map(card => `
                    <div class="card-preview">
                        <img src="${URL.createObjectURL(card.image)}" alt="${card.word}">
                        <div class="card-info">
                            <h3>${card.word}</h3>
                            <p>${card.definition}</p>
                        </div>
                        <button class="remove-from-playlist" data-card-id="${card.id}">❌</button>
                    </div>
                `).join('')}
            </div>
        `;

        // Add back button handler
        playlistDetailSection.querySelector('.back-btn').addEventListener('click', () => {
            playlistDetailSection.style.display = "none";
            document.querySelector("#playlist-list").style.display = "block";
        });

        // Add remove card handlers
        playlistDetailSection.querySelectorAll('.remove-from-playlist').forEach(btn => {
            btn.addEventListener('click', async () => {
                const cardId = btn.dataset.cardId;
                const cardIndex = playlist.cards.indexOf(cardId);
                if (cardIndex !== -1) {
                    playlist.cards.splice(cardIndex, 1);
                    await db.put("playlists", playlist);
                    showPlaylistDetail(playlist); // Refresh view
                }
            });
        });

    } catch (error) {
        console.error("Error showing playlist detail:", error);
    }
}

// Function to delete a playlist
async function deletePlaylist(playlistId) {
    if (!confirm("Are you sure you want to delete this playlist?")) {
        return;
    }

    try {
        await db.delete("playlists", playlistId);
        await loadPlaylists(); // Refresh playlist display
    } catch (error) {
        console.error("Error deleting playlist:", error);
        alert("Failed to delete playlist");
    }
}

// Add event listeners
createPlaylistBtn.addEventListener("click", createPlaylist);

// Load playlists when the page loads
document.addEventListener("DOMContentLoaded", () => {
    initDB().then(() => {
        loadPlaylists();
    });
});

// Initialize database and the app
initDB();

// Add DOM references for playlist modal
const playlistModal = document.getElementById("playlist-modal");
const playlistCheckboxes = document.getElementById("playlist-checkboxes");
const btnAddToPlaylist = document.getElementById("btn-add-to-playlist");
const btnSaveToPlaylist = document.getElementById("btn-save-to-playlist");
const btnCloseModal = document.getElementById("btn-close-modal");

// Function to show modal with playlist checkboxes
async function showPlaylistModal() {
    try {
        const playlists = await db.getAll("playlists");
        const currentCard = cards[currentIndex];

        // Clear existing checkboxes
        playlistCheckboxes.innerHTML = "";

        // Create checkbox for each playlist
        playlists.forEach(playlist => {
            const div = document.createElement("div");
            div.className = "playlist-checkbox-item";
            
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.id = `playlist-${playlist.id}`;
            checkbox.checked = playlist.cards.includes(currentCard.id);
            
            const label = document.createElement("label");
            label.htmlFor = `playlist-${playlist.id}`;
            label.textContent = playlist.name;

            div.appendChild(checkbox);
            div.appendChild(label);
            playlistCheckboxes.appendChild(div);
        });

        // Show modal
        playlistModal.style.display = "block";
    } catch (error) {
        console.error("Error showing playlist modal:", error);
    }
}

// Function to save card to selected playlists
async function saveToPlaylists() {
    try {
        const currentCard = cards[currentIndex];
        const playlists = await db.getAll("playlists");
        
        // Update each playlist
        for (const playlist of playlists) {
            const checkbox = document.getElementById(`playlist-${playlist.id}`);
            const isChecked = checkbox.checked;
            
            // If checkbox is checked and card isn't in playlist, add it
            // If checkbox is unchecked and card is in playlist, remove it
            const cardIndex = playlist.cards.indexOf(currentCard.id);
            if (isChecked && cardIndex === -1) {
                playlist.cards.push(currentCard.id);
                await db.put("playlists", playlist);
            } else if (!isChecked && cardIndex !== -1) {
                playlist.cards.splice(cardIndex, 1);
                await db.put("playlists", playlist);
            }
        }

        // Close modal and refresh playlist display
        playlistModal.style.display = "none";
        await loadPlaylists();
    } catch (error) {
        console.error("Error saving to playlists:", error);
        alert("Failed to save to playlists");
    }
}

// Event listeners for playlist modal
btnAddToPlaylist.addEventListener("click", showPlaylistModal);
btnSaveToPlaylist.addEventListener("click", saveToPlaylists);
btnCloseModal.addEventListener("click", () => {
    playlistModal.style.display = "none";
});

// Close modal when clicking outside
window.addEventListener("click", (event) => {
    if (event.target === playlistModal) {
        playlistModal.style.display = "none";
    }
});