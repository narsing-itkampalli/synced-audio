# synced-audio

A robust audio synchronization library for precise multi-track playback management in web applications.

[![npm version](https://img.shields.io/npm/v/synced-audio.svg)](https://www.npmjs.com/package/synced-audio)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features ✨

- **Multi-track synchronization** - Perfectly aligned audio playback across multiple tracks
- **Chunk-based loading** - Efficient streaming of audio segments
- **Precise timing control** - Sample-accurate seeking and playback
- **Dynamic volume/pan control** - Per-track audio adjustments
- **Looping support** - Seamless looping functionality
- **Automatic preloading** - Intelligent buffer management
- **Event-driven API** - Play, pause, timeupdate, and chunk change events

## Installation 📦

```bash
npm install synced-audio
```

## Basic Usage 🚀

```javascript
import SyncedAudio from 'synced-audio';

const audioManager = new SyncedAudio({
  trackCount: 2,
  chunkCount: 10,
  chunkDuration: 5, // seconds
  src: (trackIndex, chunkIndex) => 
    `https://example.com/audio/track-${trackIndex}-chunk-${chunkIndex}.mp3`
});

// Play/pause control
document.getElementById('play').addEventListener('click', () => audioManager.play());
document.getElementById('pause').addEventListener('click', () => audioManager.pause());

// Seek to 25 seconds
audioManager.currentTime = 25;

// Adjust master volume
audioManager.volume = 0.75;

// Control individual track
audioManager.setTrackVolume(0.8, 1); // Track 2 volume
audioManager.setTrackPan(-0.5, 0); // Pan Track 1 left
```

## Advanced Usage 🔧

### Event Handling
```javascript
audioManager.addEvent('timeupdate', (currentTime) => {
  console.log(`Current playback time: ${currentTime.toFixed(2)}s`);
});

audioManager.addEvent('chunkchange', () => {
  console.log('New audio chunk loaded');
});
```

## API Reference 📚

### Constructor Options
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `trackCount` | number | 1 | Number of audio tracks |
| `chunkCount` | number | 1 | Total audio chunks |
| `chunkDuration` | number | 10 | Chunk duration in seconds |
| `src` | string/function | See code | Audio source template/function |
| `currentTime` | number | 0 | Initial playback position |
| `loop` | boolean | false | Enable looping |
| `timeupdatePerSecond` | number | 4 | Frequency of timeupdate events |
| `volume` | number | 1 | Initial master volume (0-1) |

### Key Methods
- `play()`: Start/resume playback
- `pause()`: Pause playback
- `setVolume(value)`: Set master volume (0-1)
- `setTrackVolume(value, trackIndex)`: Set individual track volume
- `setTrackPan(value, trackIndex)`: Set track panning (-1 to 1)
- `addEvent(type, callback)`: Register event listener

## Browser Support 🌐

Modern browsers with [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) support:
- Chrome 35+
- Firefox 25+
- Safari 14.1+
- Edge 12+

**Note:** Requires user interaction to initialize audio context in most browsers.

## License 📄
`synced-audio` is open-source and licensed under the [MIT License](./LICENSE).