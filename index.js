export default class SyncedAudio {
    _volume = 1;

    constructor({
        trackCount = 1,
        chunkCount = 1,
        chunkDuration = 10,
        src = (trackIndex, chunkIndex) => `/track-${trackIndex}-chunk-${chunkIndex}.mp3`,
        currentTime = 0,
        loop = false,
        timeupdatePerSecond = 4,
        volume = 1
    }) {
        this.tracks = new Map();
        this._tracks = new Map(); // Used to store pan and volume before audioContext initialized.
        this.paused = true;
        this.stopPlaybackList = new Set();
        this.isSeekPending = false;
        this.startTime = 0;
        this.timeupdatePerSecond = timeupdatePerSecond;

        this.currentChunkIndex = 0;
        this.lastChunkOffset = 0;

        this.events = {
            play: [],
            pause: [],
            ended: [],
            timeupdate: [],
            chunkchange: []
        };

        this.trackCount = trackCount;
        this.chunkCount = chunkCount;
        this.chunkDuration = chunkDuration; // in seconds
        this.src = src; // function to get the source of the audio
        if (currentTime !== 0) this.currentTime = currentTime; // in seconds
        this.loop = loop;
        this._volume = volume;

        this.initiateTrackList();
    }

    get currentTime() {
        return this.currentChunkIndex * this.chunkDuration + (this.paused ? this.lastChunkOffset : this.audioContext.currentTime - this.startTime);
    }

    set currentTime(value) {
        this.updateCurrentTime(value);
    }

    get volume() {
        return this._volume;
    }

    set volume(value) {
        this.setVolume(value);
    }

    async initiateTrackList() {
        for (let i = 0; i < this.trackCount; i++) {
            this._tracks.set(i, {
                volume: 0,
                pan: 1
            });
        }
    }

    async play() {
        if (this.paused) {
            await this.resumeContext();
            await this.playChunk();
            this.paused = false;
            this.triggerEvent('play');
        }
    }

    pause() {
        if (!this.paused) {
            Array.from(this.stopPlaybackList).map(stop => stop(true));
            this.paused = true;
            this.triggerEvent('pause');
            this.lastChunkOffset = this.audioContext.currentTime - this.startTime;
        }
    }

    setVolume(volume) {
        this._volume = volume;
        Array.from(this.tracks).forEach(([_, track]) => {
            track.gainNode.gain.value = track.volume * this._volume;
        });
    }

    setTrackPan(pan, trackIndex = 0) {
        const track = this.tracks.get(trackIndex);
        if (track) {
            track.pan = pan;
            track.pannerNode.pan.value = pan;
        }

        const _track = this._tracks.get(trackIndex);
        if (_track) _track.pan = pan;
    }

    setTrackVolume(volume, trackIndex = 0) {
        const track = this.tracks.get(trackIndex);
        if (track) {
            track.volume = volume;
            track.gainNode.gain.value = volume * this._volume;
        }

        const _track = this._tracks.get(trackIndex);
        if (_track) _track.volume = volume;
    }

    cleanupChunks() {
        const currentChunkIndex = this.currentChunkIndex;

        for (let [_, track] of this.tracks) {
            if (track.buffers.size <= 8) break;
            Array.from(track.buffers).forEach(([index]) => {
                if (index < currentChunkIndex - 4 || index > currentChunkIndex + 3) {
                    track.buffers.delete(index)
                }
            });
        }
    }

    async updateCurrentTime(value) {
        const chunkIndex = Math.floor(value / this.chunkDuration);
        const offset = value % this.chunkDuration;

        this.currentChunkIndex = chunkIndex;
        this.lastChunkOffset = offset;

        if (this.isPendingSeek) return;
        this.isPendingSeek = true;

        if (!this.paused) {
            Array.from(this.stopPlaybackList).map(stop => stop(true));
            await this.playChunk();
        }

        this.isPendingSeek = false;
    }

    async playChunk() {
        if (this.currentChunkIndex >= this.chunkCount) return;
        const chunkIndex = this.currentChunkIndex;

        let playbackStopped = false;
        const sources = [];
        let timeupdateInterval = null;

        const stopPlayback = (manually = false) => {
            this.stopPlaybackList.delete(stopPlayback);
            clearInterval(timeupdateInterval);
            playbackStopped = true;
            sources.forEach(source => {
                source.stop();
                source.disconnect();
            });

            if (!manually) {
                this.handleChunkEnd(chunkIndex);
            } else {
                this.lastChunkOffset = this.audioContext.currentTime - this.startTime;
            }
        };

        this.stopPlaybackList.add(stopPlayback);

        this.loadChunk(chunkIndex);

        const buffers = await Promise.all(Array.from(this.tracks).map(([_, track]) => track.buffers.get(chunkIndex)));
        if (playbackStopped) return;

        buffers.forEach((buffer, index) => {
            if (!buffer) return sources.push(null);

            const track = this.tracks.get(index);

            const source = this.audioContext.createBufferSource();
            source.buffer = buffer;
            source.connect(track.gainNode)
                .connect(track.pannerNode)
                .connect(this.audioContext.destination);

            sources.push(source);
        });

        if (playbackStopped) return;

        const startTime = this.audioContext.currentTime;
        this.startTime = startTime - this.lastChunkOffset;

        sources.forEach((source, index) => {
            source.start(startTime, this.lastChunkOffset);
            source.onended = () => {
                if (!playbackStopped && index === sources.length - 1) {
                    stopPlayback(false);
                }
            }
        });

        timeupdateInterval = setInterval(() => {
            this.triggerEvent('timeupdate', this.currentTime);
        }, 1000 / this.timeupdatePerSecond);

        this.loadChunk(chunkIndex + 1); // Preload next chunk
    }

    handleChunkEnd(chunkIndex) {
        if (chunkIndex + 1 >= this.chunkCount) {
            if (this.loop) {
                this.currentChunkIndex = 0;
                this.lastChunkOffset = 0;
                this.playChunk();
            } else {
                this.paused = true;
                this.triggerEvent('ended');
            }
        } else {
            this.currentChunkIndex = chunkIndex + 1;
            this.lastChunkOffset = 0;
            this.playChunk();
            this.triggerEvent('chunkchange');
        }
    }

    loadChunk(chunkIndex) {
        if (chunkIndex >= this.chunkCount) return;

        for (let i = 0; i < this.trackCount; i++) {
            const trackId = i;

            const track = this.tracks.get(trackId) || {
                buffers: new Map(),
                pan: 0,
                volume: 1,
                gainNode: this.audioContext.createGain(),
                pannerNode: this.audioContext.createStereoPanner()
            };

            if (!this.tracks.has(trackId)) {
                this.tracks.set(trackId, track);

                const _track = this._tracks.get(trackId);

                track.gainNode.gain.value = _track.volume * this._volume;
                track.pannerNode.pan.value = _track.pan;

                track.volume = _track.volume;
                track.pan = _track.pan;
            }

            if (track.buffers.has(chunkIndex)) continue; // Already loaded

            const url = this.getURL(i, chunkIndex);
            const buffer = this.fetchAudio(url);
            track.buffers.set(chunkIndex, buffer); // Store the buffer promise in the track
        }

        this.cleanupChunks();
    }

    getURL(trackIndex, chunkIndex) {
        if (typeof this.src === 'string') {
            const url = new URL(this.src, location.href);
            url.searchParams.set('track', trackIndex);
            url.searchParams.set('chunk', chunkIndex);
            return url.toString();
        }

        return this.src(trackIndex, chunkIndex);
    }

    isChunkLoaded(chunkIndex) {
        const tracks = Array.from(this.tracks.values());
        if (tracks.length === 0) return false;
        return tracks.every(track =>
            track.buffers.has(chunkIndex)
        );
    }

    async fetchAudio(url) {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        return this.audioContext.decodeAudioData(arrayBuffer);
    }

    // ========================= Events ====================================

    addEvent(eventName, callback) {
        this.events[eventName].push(callback);
    }

    removeEvent(eventName, callback) {
        const index = this.events[eventName].findIndex(clb => clb == callback);
        if (index < 0) return;

        this.events[eventName].splice(index, 1);
    }

    triggerEvent(eventName) {
        this.events[eventName].forEach((callback) => callback(this.currentTime));
    }

    // =============================================================
    async resumeContext() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
    }
}