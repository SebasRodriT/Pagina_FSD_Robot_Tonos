const MIN_FREQUENCY = 100;
const MAX_FREQUENCY = 2000;
const COMMANDS = {
  forward: { label: "Adelante", frequency: 650 },
  backward: { label: "Atrás", frequency: 950 },
  left: { label: "Girar a la izquierda", frequency: 1250 },
  right: { label: "Girar a la derecha", frequency: 1550 },
};

const numberInput = document.querySelector("#frequency-number");
const rangeInput = document.querySelector("#frequency-range");
const presetSelect = document.querySelector("#tone-preset");
const waveformCanvas = document.querySelector("#waveform");
const waveformContext = waveformCanvas.getContext("2d");
const playButton = document.querySelector("#play-tone");
const playbackStatus = document.querySelector("#playback-status");
const commandStatus = document.querySelector("#command-status");
const audioStatus = document.querySelector("#audio-status");
const commandButtons = [...document.querySelectorAll(".direction-button")];
const waveButtons = [...document.querySelectorAll(".wave-option")];

let selectedWave = "sine";
let audioContext;
let oscillator;
let gainNode;
let activeCommandButton;
let commandSession = 0;
let activePointerId;
let activeTouchId;

function getFrequency() {
  return Number(numberInput.value);
}

function updateFrequency(value, { markCustom = true } = {}) {
  const frequency = Math.round(Math.min(MAX_FREQUENCY, Math.max(MIN_FREQUENCY, value)));
  numberInput.value = String(frequency);
  rangeInput.value = String(frequency);
  document.querySelector("#wave-frequency").textContent = String(frequency);
  rangeInput.style.setProperty(
    "--range-progress",
    `${((frequency - MIN_FREQUENCY) / (MAX_FREQUENCY - MIN_FREQUENCY)) * 100}%`,
  );
  if (markCustom && presetSelect.value !== "custom") {
    presetSelect.value = "custom";
  }
  drawWaveform();
}

function drawWaveform() {
  const bounds = waveformCanvas.getBoundingClientRect();
  const pixelRatio = window.devicePixelRatio || 1;
  waveformCanvas.width = Math.max(1, Math.round(bounds.width * pixelRatio));
  waveformCanvas.height = Math.max(1, Math.round(bounds.height * pixelRatio));
  waveformContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

  const width = bounds.width;
  const height = bounds.height;
  const middle = height * 0.46;
  const amplitude = height * 0.29;
  const cycles = 4;
  waveformContext.clearRect(0, 0, width, height);
  waveformContext.beginPath();

  for (let x = 0; x <= width; x += 1) {
    const phase = (x / width) * Math.PI * 2 * cycles;
    let value;
    if (selectedWave === "square") {
      value = Math.sin(phase) >= 0 ? 1 : -1;
    } else if (selectedWave === "sawtooth") {
      value = 2 * ((phase / (Math.PI * 2)) % 1) - 1;
    } else if (selectedWave === "triangle") {
      value = (2 / Math.PI) * Math.asin(Math.sin(phase));
    } else {
      value = Math.sin(phase);
    }
    const y = middle - value * amplitude;
    if (x === 0) waveformContext.moveTo(x, y);
    else waveformContext.lineTo(x, y);
  }

  waveformContext.strokeStyle = "#81da91";
  waveformContext.lineWidth = 2.5;
  waveformContext.lineJoin = "round";
  waveformContext.lineCap = "round";
  waveformContext.stroke();
}

function ensureAudioContext() {
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      throw new Error("Este navegador no es compatible con Web Audio.");
    }
    audioContext = new AudioContextClass();
  }
  return audioContext.resume();
}

async function startTone(frequency, wave = selectedWave) {
  await ensureAudioContext();
  stopTone();

  createTone(frequency, wave);
}

function createTone(frequency, wave) {
  oscillator = audioContext.createOscillator();
  gainNode = audioContext.createGain();
  oscillator.type = wave;
  oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
  gainNode.gain.setValueAtTime(0, audioContext.currentTime);
  gainNode.gain.linearRampToValueAtTime(0.12, audioContext.currentTime + 0.025);
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  oscillator.start();
}

function stopTone() {
  if (!oscillator || !audioContext || !gainNode) return;

  const currentOscillator = oscillator;
  const currentGain = gainNode;
  oscillator = undefined;
  gainNode = undefined;
  currentGain.gain.cancelScheduledValues(audioContext.currentTime);
  currentGain.gain.setTargetAtTime(0, audioContext.currentTime, 0.015);
  currentOscillator.stop(audioContext.currentTime + 0.08);
  currentOscillator.addEventListener("ended", () => {
    currentOscillator.disconnect();
    currentGain.disconnect();
  }, { once: true });
}

function setPlaybackState(isPlaying, text) {
  playButton.classList.toggle("is-playing", isPlaying);
  playButton.setAttribute("aria-pressed", String(isPlaying));
  playButton.querySelector("span").textContent = isPlaying ? "Detener tono" : "Reproducir tono";
  playButton.querySelector("svg").innerHTML = isPlaying
    ? '<path d="M5 5h10v10H5z" />'
    : '<path d="M5 3.8v12.4L16 10 5 3.8Z" />';
  playbackStatus.textContent = text;
}

function showAudioError(error) {
  console.error(error);
  audioStatus.innerHTML = '<span class="status-dot" aria-hidden="true"></span> Audio no disponible';
  audioStatus.classList.add("has-error");
  playbackStatus.textContent = error.message || "No se pudo iniciar el audio.";
}

function clearCommandState() {
  commandSession += 1;
  activeCommandButton = undefined;
  commandButtons.forEach((button) => button.classList.remove("is-active"));
  commandStatus.classList.remove("is-active");
}

async function sendCommand(button) {
  const command = COMMANDS[button.dataset.command];
  if (!command) return;

  clearCommandState();
  stopTone();
  setPlaybackState(false, "Listo para reproducir");
  activeCommandButton = button;
  const session = ++commandSession;
  button.classList.add("is-active");
  commandStatus.classList.add("is-active");
  commandStatus.querySelector("span:last-child").textContent =
    `Comando: ${command.label} · ${command.frequency} Hz`;

  try {
    await ensureAudioContext();
    if (session === commandSession) createTone(command.frequency, "sine");
  } catch (error) {
    if (session === commandSession) {
      clearCommandState();
      showAudioError(error);
    }
  }
}

function stopCommand() {
  const commandWasActive = Boolean(activeCommandButton);
  activePointerId = undefined;
  activeTouchId = undefined;
  if (!commandWasActive) return;
  clearCommandState();
  stopTone();
  commandStatus.querySelector("span:last-child").textContent = "Comando detenido";
}

function handleTouchStart(event) {
  if (activeCommandButton) return;
  const touch = event.changedTouches[0];
  if (!touch) return;

  event.preventDefault();
  activeTouchId = touch.identifier;
  sendCommand(event.currentTarget);
}

function handleTouchEnd(event) {
  if (activeTouchId === undefined) return;
  const touchReleased = Array.from(event.changedTouches).some(
    (touch) => touch.identifier === activeTouchId,
  );
  if (touchReleased) stopCommand();
}

numberInput.addEventListener("input", () => {
  const value = Number(numberInput.value);
  if (Number.isFinite(value)) updateFrequency(value);
});
numberInput.addEventListener("change", () => {
  updateFrequency(Number(numberInput.value) || MIN_FREQUENCY);
});
rangeInput.addEventListener("input", () => updateFrequency(Number(rangeInput.value)));
document.querySelector("#decrease-frequency").addEventListener("click", () => {
  updateFrequency(getFrequency() - 10);
});
document.querySelector("#increase-frequency").addEventListener("click", () => {
  updateFrequency(getFrequency() + 10);
});

presetSelect.addEventListener("change", () => {
  if (presetSelect.value !== "custom") updateFrequency(Number(presetSelect.value), { markCustom: false });
});

waveButtons.forEach((button) => {
  button.addEventListener("click", () => {
    selectedWave = button.dataset.wave;
    waveButtons.forEach((option) => {
      const selected = option === button;
      option.classList.toggle("is-selected", selected);
      option.setAttribute("aria-pressed", String(selected));
    });
    document.querySelector("#wave-label").textContent =
      `ONDA ${button.querySelector("span").textContent.toLocaleUpperCase("es")}`;
    if (oscillator) oscillator.type = selectedWave;
    drawWaveform();
  });
});

playButton.addEventListener("click", async () => {
  if (oscillator) {
    clearCommandState();
    stopTone();
    setPlaybackState(false, "Tono detenido");
    commandStatus.querySelector("span:last-child").textContent = "Esperando un comando";
    return;
  }
  clearCommandState();
  commandStatus.querySelector("span:last-child").textContent = "Esperando un comando";
  try {
    await startTone(getFrequency());
    setPlaybackState(true, `Reproduciendo ${getFrequency()} Hz`);
  } catch (error) {
    showAudioError(error);
  }
});

commandButtons.forEach((button) => {
  button.addEventListener("pointerdown", (event) => {
    if ((event.pointerType === "mouse" && event.button !== 0) || activeCommandButton) return;
    event.preventDefault();
    activePointerId = event.pointerId;
    sendCommand(button);
  });
  button.addEventListener("touchstart", handleTouchStart, { passive: false });
  button.addEventListener("keydown", (event) => {
    if ((event.code === "Space" || event.code === "Enter") && !activeCommandButton) {
      event.preventDefault();
      sendCommand(button);
    }
  });
  button.addEventListener("keyup", (event) => {
    if (event.code === "Space" || event.code === "Enter") stopCommand();
  });
});

document.addEventListener("pointerup", (event) => {
  if (activePointerId === event.pointerId) stopCommand();
});
document.addEventListener("pointercancel", (event) => {
  if (activePointerId === event.pointerId) stopCommand();
});
document.addEventListener("touchend", handleTouchEnd, { passive: true });
document.addEventListener("touchcancel", handleTouchEnd, { passive: true });

document.addEventListener("keydown", (event) => {
  if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
  const target = event.target;
  if (target instanceof HTMLElement && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;
  const command = { w: "forward", s: "backward", a: "left", d: "right" }[event.key.toLowerCase()];
  if (!command) return;
  event.preventDefault();
  const button = commandButtons.find((item) => item.dataset.command === command);
  if (button) sendCommand(button);
});

document.addEventListener("keyup", (event) => {
  const command = { w: "forward", s: "backward", a: "left", d: "right" }[event.key.toLowerCase()];
  if (activeCommandButton?.dataset.command === command) stopCommand();
});

window.addEventListener("blur", stopCommand);
window.addEventListener("resize", drawWaveform);
updateFrequency(getFrequency());
