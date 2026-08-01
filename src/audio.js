// Web Audio & Microphone Recording Module for MedsTrack
let audioCtx = null;
let mediaRecorder = null;
let audioChunks = [];
let recordingStartTime = 0;
let animationFrameId = null;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// Get estimated duration per sound sequence in ms
function getSoundDurationMs(soundName) {
  switch (soundName) {
    case 'bell': return 1400;
    case 'vital': return 700;
    case 'alert': return 900;
    case 'zen': return 2200;
    case 'echo': return 750;
    default: return 1200;
  }
}

// Synthesize notification tones using Web Audio API or play custom recorded voice memo
export async function playNotificationSound(soundName = 'bell', volumePercent = 75, repeatCount = 3) {
  try {
    if (soundName === 'voice' || soundName.startsWith('voice_')) {
      const voiceId = soundName.replace('voice_', '');
      let blobToPlay = null;

      try {
        const { getVoiceMemo, getVoiceMemos } = await import('./db.js');
        if (voiceId && voiceId !== 'voice') {
          const memo = await getVoiceMemo(voiceId);
          if (memo && memo.blob) blobToPlay = memo.blob;
        }
        if (!blobToPlay) {
          const allMemos = await getVoiceMemos();
          if (allMemos && allMemos.length > 0) {
            blobToPlay = allMemos[allMemos.length - 1].blob;
          }
        }
        if (blobToPlay) {
          for (let r = 0; r < repeatCount; r++) {
            await playAudioBlob(blobToPlay);
            if (r < repeatCount - 1) {
              await new Promise(resolve => setTimeout(resolve, 500));
            }
          }
          return;
        }
      } catch (err) {
        console.warn('Voice memo playback note:', err);
      }
      soundName = 'bell';
    }

    const durationMs = getSoundDurationMs(soundName);

    for (let r = 0; r < repeatCount; r++) {
      playSingleToneSequence(soundName, volumePercent);
      if (r < repeatCount - 1) {
        await new Promise(resolve => setTimeout(resolve, durationMs));
      }
    }
  } catch (err) {
    console.warn('Audio synthesis warning:', err);
  }
}

function playSingleToneSequence(soundName, volumePercent) {
  const ctx = getAudioContext();
  const gainNode = ctx.createGain();
  const volume = (volumePercent / 100) * 0.3; // safe max volume
  gainNode.gain.setValueAtTime(volume, ctx.currentTime);
  gainNode.connect(ctx.destination);

  const now = ctx.currentTime;

  if (soundName === 'bell') {
    // Crystal Bell Chime (C5 -> E5 -> G5)
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const noteGain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.15);
      noteGain.gain.setValueAtTime(volume, now + i * 0.15);
      noteGain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 1.2);
      osc.connect(noteGain);
      noteGain.connect(ctx.destination);
      osc.start(now + i * 0.15);
      osc.stop(now + i * 0.15 + 1.2);
    });
  } else if (soundName === 'vital') {
    // Pulse Vital (Double Beep)
    [0, 0.15].forEach(t => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(587.33, now + t);
      osc.connect(gainNode);
      osc.start(now + t);
      osc.stop(now + t + 0.08);
    });
  } else if (soundName === 'alert') {
    // Urgent Medical Alert
    [0, 0.12, 0.24, 0.36].forEach((t, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(i % 2 === 0 ? 880 : 1100, now + t);
      osc.connect(gainNode);
      osc.start(now + t);
      osc.stop(now + t + 0.09);
    });
  } else if (soundName === 'zen') {
    // Relaxing Zen Bowl
    const osc = ctx.createOscillator();
    const noteGain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, now); // A3
    noteGain.gain.setValueAtTime(volume * 1.5, now);
    noteGain.gain.exponentialRampToValueAtTime(0.0001, now + 2.0);
    osc.connect(noteGain);
    noteGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 2.0);
  } else if (soundName === 'echo') {
    // Digital Echo
    [0, 0.1, 0.2].forEach((t, i) => {
      const osc = ctx.createOscillator();
      const noteGain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1046.50 / (i + 1), now + t);
      noteGain.gain.setValueAtTime(volume / (i + 1), now + t);
      noteGain.gain.exponentialRampToValueAtTime(0.001, now + t + 0.3);
      osc.connect(noteGain);
      noteGain.connect(ctx.destination);
      osc.start(now + t);
      osc.stop(now + t + 0.3);
    });
  }
}

// MediaRecorder Voice Memo API
export async function startRecording(onVolumeUpdate) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('Microfonul nu este suportat în acest browser.');
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const ctx = getAudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 64;
  source.connect(analyser);

  audioChunks = [];
  mediaRecorder = new MediaRecorder(stream);

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) {
      audioChunks.push(e.data);
    }
  };

  recordingStartTime = Date.now();
  mediaRecorder.start(100);

  // Live Waveform Visualizer Feedback
  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  function updateWaveform() {
    analyser.getByteFrequencyData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    const avg = sum / dataArray.length;
    if (onVolumeUpdate) {
      onVolumeUpdate(avg, dataArray);
    }
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      animationFrameId = requestAnimationFrame(updateWaveform);
    }
  }
  updateWaveform();

  return stream;
}

export function stopRecording() {
  return new Promise((resolve) => {
    if (!mediaRecorder || mediaRecorder.state !== 'recording') {
      resolve(null);
      return;
    }

    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }

    mediaRecorder.onstop = () => {
      const durationSeconds = Math.max(1, Math.round((Date.now() - recordingStartTime) / 1000));
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      
      // Stop stream tracks
      if (mediaRecorder.stream) {
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
      }

      mediaRecorder = null;
      resolve({ blob: audioBlob, durationSeconds });
    };

    mediaRecorder.stop();
  });
}

export function playAudioBlob(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => {
      URL.revokeObjectURL(url);
      resolve();
    };
    audio.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    audio.play().catch(reject);
  });
}
