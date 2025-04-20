class DictionaryChat {
    constructor() {
        this.apiKey = '';
        this.chatBox = document.getElementById('chat-box');
        this.form = document.getElementById('chat-form');
        this.input = document.getElementById('user-input');
        this.sendButton = document.getElementById('send-button');
        this.loadingContainer = document.getElementById('loading-container');

        this.initializeEventListeners();
        this.initApiKey();

        // Configure marked options
        marked.setOptions({
            highlight: function(code, lang) {
                const language = hljs.getLanguage(lang) ? lang : 'plaintext';
                return hljs.highlight(code, { language }).value;
            },
            langPrefix: 'hljs language-'
        });
    }

    async initApiKey() {
        this.apiKey = localStorage.getItem('openai_api_key');
        if (!this.apiKey) {
            this.apiKey = prompt('Please enter your OpenAI API key:');
            if (this.apiKey) {
                localStorage.setItem('openai_api_key', this.apiKey);
            }
        }
    }

    initializeEventListeners() {
        this.form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSubmit();
        });
    }

    addMessage(content, type = 'assistant') {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        
        // Parse markdown for assistant messages only
        if (type === 'assistant') {
            messageDiv.innerHTML = `<div class="message-content">${marked.parse(content)}</div>`;
        } else {
            messageDiv.innerHTML = `<div class="message-content">${content}</div>`;
        }
        
        this.chatBox.appendChild(messageDiv);
        
        // Highlight any code blocks in the message
        if (type === 'assistant') {
            messageDiv.querySelectorAll('pre code').forEach(block => {
                hljs.highlightBlock(block);
            });
        }
        
        this.scrollToBottom();
    }

    scrollToBottom() {
        this.chatBox.scrollTop = this.chatBox.scrollHeight;
    }

    setLoading(isLoading) {
        this.sendButton.disabled = isLoading;
        this.input.disabled = isLoading;
        this.loadingContainer.style.display = isLoading ? 'flex' : 'none';
        if (isLoading) {
            this.sendButton.innerHTML = '<span class="material-icons">sync</span>';
        } else {
            this.sendButton.innerHTML = '<span class="material-icons">send</span>';
        }
    }

    async handleSubmit() {
        const message = this.input.value.trim();
        if (!message) return;

        this.addMessage(message, 'user');
        this.input.value = '';
        this.setLoading(true);

        try {
            if (!this.apiKey) await this.initApiKey();
            if (!this.apiKey) {
                throw new Error('API key is required');
            }

            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-4',
                    messages: [{
                        role: 'system',
                        content: 'You are a helpful dictionary assistant. When users ask about words, provide detailed explanations including definitions, examples, synonyms, and usage tips. Focus on being clear and educational.'
                    }, {
                        role: 'user',
                        content: message
                    }]
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error?.message || 'Failed to get response');
            }

            const data = await response.json();
            this.addMessage(data.choices[0].message.content);
        } catch (error) {
            console.error('Error:', error);
            this.addMessage(`Error: ${error.message}`, 'error');
        } finally {
            this.setLoading(false);
        }
    }
}

// Initialize the chat
new DictionaryChat();
