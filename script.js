class ExPlayer {
    constructor() {
        this.audio = new Audio();
        this.playlist = [];
        this.currentTrackIndex = 0;
        this.isPlaying = false;
        this.isShuffled = false;
        this.repeatMode = 'none'; // none, one, all
        this.favorites = new Set();
        this.db = null;
        this.currentTime = 0;
        
        this.initializeElements();
        this.setupEventListeners();
        this.initDatabase();
    }

    initializeElements() {
        // Кнопки управления
        this.playBtn = document.getElementById('playBtn');
        this.prevBtn = document.getElementById('prevBtn');
        this.nextBtn = document.getElementById('nextBtn');
        this.shuffleBtn = document.getElementById('shuffleBtn');
        this.repeatBtn = document.getElementById('repeatBtn');
        
        // Элементы плеера
        this.progressBar = document.querySelector('.progress');
        this.volumeSlider = document.getElementById('volumeSlider');
        this.currentTimeSpan = document.getElementById('currentTime');
        this.durationSpan = document.getElementById('duration');
        this.currentTrackTitle = document.getElementById('currentTrack');
        this.currentArtistTitle = document.getElementById('currentArtist');
        
        // Контейнеры
        this.playlistContainer = document.getElementById('playlist');
        this.favoritesList = document.getElementById('favoritesList');
        this.dropZone = document.getElementById('dropZone');
        this.fileInput = document.getElementById('fileInput');
        
        // Вкладки
        this.tabButtons = document.querySelectorAll('.tab-btn');
        this.tabContents = document.querySelectorAll('.tab-content');
    }

    setupEventListeners() {
        // Управление воспроизведением
        this.playBtn.addEventListener('click', () => this.togglePlay());
        this.prevBtn.addEventListener('click', () => this.playPrevious());
        this.nextBtn.addEventListener('click', () => this.playNext());
        this.shuffleBtn.addEventListener('click', () => this.toggleShuffle());
        this.repeatBtn.addEventListener('click', () => this.toggleRepeat());
        
        // Прогресс и громкость
        this.audio.addEventListener('timeupdate', () => this.updateProgress());
        this.audio.addEventListener('loadedmetadata', () => this.updateDuration());
        this.audio.addEventListener('ended', () => this.handleTrackEnd());
        this.volumeSlider.addEventListener('input', (e) => this.setVolume(e.target.value));
        
        // Добавляем обработчик клика по прогресс-бару
        const progressBar = document.querySelector('.progress-bar');
        progressBar.addEventListener('click', (e) => {
            const rect = progressBar.getBoundingClientRect();
            const pos = (e.clientX - rect.left) / rect.width;
            this.seekTo(pos);
        });

        // Добавляем обработчик перетаскивания прогресс-бара
        let isDragging = false;
        progressBar.addEventListener('mousedown', () => isDragging = true);
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const rect = progressBar.getBoundingClientRect();
            const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            this.seekTo(pos);
        });
        document.addEventListener('mouseup', () => isDragging = false);
        
        // Загрузка файлов
        this.dropZone.addEventListener('click', () => this.fileInput.click());
        this.dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.dropZone.style.background = 'rgba(108, 92, 231, 0.1)';
        });
        this.dropZone.addEventListener('dragleave', () => {
            this.dropZone.style.background = 'none';
        });
        this.dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            this.dropZone.style.background = 'none';
            const files = e.dataTransfer.files;
            this.handleFiles(files);
        });
        this.fileInput.addEventListener('change', (e) => this.handleFiles(e.target.files));
        
        // Переключение вкладок
        this.tabButtons.forEach(button => {
            button.addEventListener('click', () => this.switchTab(button.dataset.tab));
        });
    }

    async initDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('ExPlayerDB', 1);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                this.loadFromDatabase();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('tracks')) {
                    db.createObjectStore('tracks', { keyPath: 'id' });
                }
            };
        });
    }

    async saveToDatabase(track) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['tracks'], 'readwrite');
            const store = transaction.objectStore('tracks');
            const request = store.put(track);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async loadFromDatabase() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['tracks'], 'readonly');
            const store = transaction.objectStore('tracks');
            const request = store.getAll();

            request.onsuccess = () => {
                this.playlist = request.result;
                this.updatePlaylist();
                this.updateFavorites();
                resolve();
            };

            request.onerror = () => reject(request.error);
        });
    }

    async deleteFromDatabase(trackId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['tracks'], 'readwrite');
            const store = transaction.objectStore('tracks');
            const request = store.delete(trackId);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async handleFiles(files) {
        for (const file of Array.from(files)) {
            if (file.type.startsWith('audio/')) {
                try {
                    const arrayBuffer = await file.arrayBuffer();
                    const track = {
                        id: Date.now() + Math.random(),
                        title: file.name.replace(/\.[^/.]+$/, ""),
                        artist: 'Неизвестный исполнитель',
                        data: arrayBuffer,
                        duration: 0
                    };
                    await this.saveToDatabase(track);
                    this.addTrack(track);
                } catch (error) {
                    console.error('Ошибка при загрузке файла:', error);
                }
            }
        }
    }

    async addTrack(track) {
        this.playlist.push(track);
        this.updatePlaylist();
        this.saveToLocalStorage();
    }

    async removeTrack(trackId) {
        try {
            await this.deleteFromDatabase(trackId);
            this.playlist = this.playlist.filter(track => track.id !== trackId);
            this.favorites.delete(trackId);
            this.updatePlaylist();
            this.updateFavorites();
            this.saveToLocalStorage();
        } catch (error) {
            console.error('Ошибка при удалении трека:', error);
        }
    }

    toggleFavorite(trackId) {
        if (this.favorites.has(trackId)) {
            this.favorites.delete(trackId);
        } else {
            this.favorites.add(trackId);
        }
        this.updatePlaylist();
        this.updateFavorites();
        this.saveToLocalStorage();
    }

    playTrack(track) {
        const blob = new Blob([track.data], { type: 'audio/mpeg' });
        const url = URL.createObjectURL(blob);
        this.audio.src = url;
        this.currentTrackTitle.textContent = track.title;
        this.currentArtistTitle.textContent = track.artist;
        
        // Восстанавливаем время воспроизведения из localStorage
        const savedState = this.getTrackState(track.id);
        if (savedState && savedState.currentTime) {
            this.audio.currentTime = savedState.currentTime;
        }
        
        this.audio.play();
        this.isPlaying = true;
        this.updatePlayButton();
    }

    togglePlay() {
        if (this.playlist.length === 0) return;
        
        if (this.isPlaying) {
            this.audio.pause();
            this.playBtn.innerHTML = '<i class="fas fa-play"></i>';
        } else {
            this.audio.play();
            this.playBtn.innerHTML = '<i class="fas fa-pause"></i>';
        }
        this.isPlaying = !this.isPlaying;
    }

    playNext() {
        if (this.playlist.length === 0) return;
        
        if (this.isShuffled) {
            this.currentTrackIndex = Math.floor(Math.random() * this.playlist.length);
        } else {
            this.currentTrackIndex = (this.currentTrackIndex + 1) % this.playlist.length;
        }
        this.playTrack(this.playlist[this.currentTrackIndex]);
    }

    playPrevious() {
        if (this.playlist.length === 0) return;
        
        if (this.isShuffled) {
            this.currentTrackIndex = Math.floor(Math.random() * this.playlist.length);
        } else {
            this.currentTrackIndex = (this.currentTrackIndex - 1 + this.playlist.length) % this.playlist.length;
        }
        this.playTrack(this.playlist[this.currentTrackIndex]);
    }

    toggleShuffle() {
        this.isShuffled = !this.isShuffled;
        this.shuffleBtn.style.color = this.isShuffled ? 'var(--primary-color)' : 'var(--text-color)';
    }

    toggleRepeat() {
        const modes = ['none', 'one', 'all'];
        const currentIndex = modes.indexOf(this.repeatMode);
        this.repeatMode = modes[(currentIndex + 1) % modes.length];
        
        const icons = ['fa-redo', 'fa-redo-alt', 'fa-redo-alt'];
        this.repeatBtn.innerHTML = `<i class="fas ${icons[currentIndex]}"></i>`;
    }

    handleTrackEnd() {
        switch (this.repeatMode) {
            case 'one':
                this.audio.currentTime = 0;
                this.audio.play();
                break;
            case 'all':
                this.playNext();
                break;
            default:
                if (this.currentTrackIndex < this.playlist.length - 1) {
                    this.playNext();
                }
        }
    }

    updateProgress() {
        const progress = (this.audio.currentTime / this.audio.duration) * 100;
        this.progressBar.style.width = `${progress}%`;
        this.currentTimeSpan.textContent = this.formatTime(this.audio.currentTime);
        this.currentTime = this.audio.currentTime;
    }

    updateDuration() {
        this.durationSpan.textContent = this.formatTime(this.audio.duration);
    }

    setVolume(value) {
        this.audio.volume = value / 100;
    }

    formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    updatePlayButton() {
        this.playBtn.innerHTML = this.isPlaying ? 
            '<i class="fas fa-pause"></i>' : 
            '<i class="fas fa-play"></i>';
    }

    updatePlaylist() {
        this.playlistContainer.innerHTML = '';
        this.playlist.forEach((track, index) => {
            const item = document.createElement('div');
            item.className = 'playlist-item';
            item.innerHTML = `
                <span class="number">${index + 1}</span>
                <span class="title">${track.title}</span>
                <div class="actions">
                    <button onclick="player.toggleFavorite(${track.id})">
                        <i class="fas ${this.favorites.has(track.id) ? 'fa-heart' : 'fa-heart'}"></i>
                    </button>
                    <button onclick="player.removeTrack(${track.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            item.addEventListener('click', () => {
                this.currentTrackIndex = index;
                this.playTrack(track);
            });
            this.playlistContainer.appendChild(item);
        });
    }

    updateFavorites() {
        this.favoritesList.innerHTML = '';
        this.playlist
            .filter(track => this.favorites.has(track.id))
            .forEach((track, index) => {
                const item = document.createElement('div');
                item.className = 'playlist-item';
                item.innerHTML = `
                    <span class="number">${index + 1}</span>
                    <span class="title">${track.title}</span>
                    <div class="actions">
                        <button onclick="player.toggleFavorite(${track.id})">
                            <i class="fas fa-heart"></i>
                        </button>
                        <button onclick="player.removeTrack(${track.id})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                `;
                item.addEventListener('click', () => {
                    this.currentTrackIndex = this.playlist.findIndex(t => t.id === track.id);
                    this.playTrack(track);
                });
                this.favoritesList.appendChild(item);
            });
    }

    switchTab(tabId) {
        this.tabButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });
        this.tabContents.forEach(content => {
            content.classList.toggle('active', content.id === tabId);
        });
    }

    saveToLocalStorage() {
        // Сохраняем плейлист
        localStorage.setItem('explayer_playlist', JSON.stringify(this.playlist));
        
        // Сохраняем избранное
        localStorage.setItem('explayer_favorites', JSON.stringify([...this.favorites]));
        
        // Сохраняем текущее состояние воспроизведения
        if (this.playlist.length > 0) {
            const currentTrack = this.playlist[this.currentTrackIndex];
            const trackState = {
                currentTime: this.currentTime,
                isPlaying: this.isPlaying,
                currentTrackIndex: this.currentTrackIndex,
                isShuffled: this.isShuffled,
                repeatMode: this.repeatMode
            };
            localStorage.setItem('explayer_current_state', JSON.stringify(trackState));
        }
    }

    loadFromLocalStorage() {
        // Загружаем плейлист
        const savedPlaylist = localStorage.getItem('explayer_playlist');
        if (savedPlaylist) {
            this.playlist = JSON.parse(savedPlaylist);
        }

        // Загружаем избранное
        const savedFavorites = localStorage.getItem('explayer_favorites');
        if (savedFavorites) {
            this.favorites = new Set(JSON.parse(savedFavorites));
        }

        // Загружаем состояние воспроизведения
        const savedState = localStorage.getItem('explayer_current_state');
        if (savedState) {
            const state = JSON.parse(savedState);
            this.currentTrackIndex = state.currentTrackIndex;
            this.isShuffled = state.isShuffled;
            this.repeatMode = state.repeatMode;
            this.currentTime = state.currentTime;
            
            // Обновляем UI
            this.updatePlaylist();
            this.updateFavorites();
            this.updatePlayButton();
            
            // Восстанавливаем воспроизведение
            if (state.isPlaying && this.playlist.length > 0) {
                this.playTrack(this.playlist[this.currentTrackIndex]);
            }
        }
    }

    getTrackState(trackId) {
        const savedState = localStorage.getItem('explayer_current_state');
        if (savedState) {
            const state = JSON.parse(savedState);
            if (state.currentTrackIndex !== undefined && 
                this.playlist[state.currentTrackIndex]?.id === trackId) {
                return state;
            }
        }
        return null;
    }

    seekTo(position) {
        if (this.audio.duration) {
            this.audio.currentTime = position * this.audio.duration;
            this.currentTime = this.audio.currentTime;
            this.saveToLocalStorage();
        }
    }
}

// Инициализация плеера
const player = new ExPlayer(); 