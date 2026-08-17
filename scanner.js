// ========================================================
// ENTEGRE JANNERSTEN VERİTABANI (v5.36 - Sabit 8 Bit Çekirdek)
// ========================================================
const JANNERSTEN_DECK_MAP = {
    "I-D-K-D-I-D-I-G": "CA",
    "I-D-K-D-I-G-I-G": "CA",
    "D-I-G-I-G-K-G-I": "C2",
    "I-D-I-D-I-G-K-G": "C3",
    "I-G-I-D-I-G-K-G": "C3",
    "I-D-I-D-I-D-I-D": "C3",
    "I-D-K-D-K-D-I-D": "C4",
    "I-D-K-D-I-D-K-G": "C4",
    "G-K-D-K-G-I-D-I": "CK",
    "G-K-D-K-G-K-D-I": "CK",
    "D-K-D-I-D-K-D-I": "DJ",
    "D-K-G-I-D-K-D-I": "DJ"
};

// ========================================================
// ORAN TABANLI ÇEKİRDEK MOTOR (v5.36)
// ========================================================
const BarcodeRatioEngine = {
    CONFIG: { MIN_ELEMENT_VAL: 3, MAX_ELEMENT_VAL: 35, RATIO_THRESHOLD: 1.45 },
    
    alignToBlackStart(seq) {
        if (!seq || seq.length === 0) return seq;
        let s = [...seq];
        if (s.length > 0 && s[0].type === "W") {
            s.shift();
        }
        return s;
    },

    processToRatios(targetSequence) {
        const aligned = this.alignToBlackStart(targetSequence);
        if (!aligned || aligned.length < 8) return null;

        const blacks = aligned.filter(p => p.type === "B").map(p => p.val);
        const whites = aligned.filter(p => p.type === "W").map(p => p.val);
        
        // KATI KURAL: Tam olarak 4 siyah ve en az 3-4 beyaz yoksa kart değildir!
        if (blacks.length !== 4 || whites.length < 3) return null;

        const sortedB = [...blacks].sort((a, b) => a - b);
        const sortedW = [...whites].sort((a, b) => a - b);
        const baseB = (sortedB[0] + sortedB[1]) / 2;
        const baseW = (sortedW[0] + sortedW[1]) / 2;
        
        if (baseB < this.CONFIG.MIN_ELEMENT_VAL || baseW < this.CONFIG.MIN_ELEMENT_VAL) return null;

        return aligned.map(p => {
            if (p.type === "B") return (p.val / baseB >= this.CONFIG.RATIO_THRESHOLD) ? "K" : "I";
            return (p.val / baseW >= this.CONFIG.RATIO_THRESHOLD) ? "G" : "D";
        }).join("-");
    },

    cyclicalLookup(pattern) {
        if (!pattern) return null;
        if (JANNERSTEN_DECK_MAP[pattern]) return JANNERSTEN_DECK_MAP[pattern];
        return null;
    }
};

const video = document.getElementById('webcam');
const canvas = document.getElementById('hidden-canvas'), ctx = canvas.getContext('2d');
const debugCanvas = document.getElementById('debug-canvas'), dctx = debugCanvas.getContext('2d');
const statusText = document.getElementById('status'), cardNameText = document.getElementById('card-name');
const patternCodeText = document.getElementById('pattern-code'), rawDataText = document.getElementById('raw-data');
const historyList = document.getElementById('history-list');

let lockedPattern = "-", matchCount = 0, lastLoggedCard = "";
let currentFacingMode = "environment", currentStream = null, audioCtx = null;
const REQUIRED_MATCHES = 3; 
let latestActivePattern = "-", latestActiveRawString = "-", isCameraWarmedUp = false;

function playBeep() {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
        osc.type = 'sine'; osc.frequency.setValueAtTime(950, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(); osc.stop(audioCtx.currentTime + 0.18);
    } catch (e) {}
}

function addHistoryItem(cardName, pattern) {
    if (cardName === lastLoggedCard) return; lastLoggedCard = cardName;
    if (historyList.querySelector('li[style*="center"]')) historyList.innerHTML = "";
    const li = document.createElement('li');
    li.innerHTML = `<span class="card">${cardName}</span> <span class="pattern">[${pattern}]</span>`;
    historyList.prepend(li); playBeep();
}

function clearHistory() { historyList.innerHTML = '<li style="color: #666; text-align: center;">Henüz bilinen kart okunmadı</li>'; lastLoggedCard = ""; }

async function startCamera() {
    isCameraWarmedUp = false; if (currentStream) currentStream.getTracks().forEach(t => t.stop());
    try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { exact: currentFacingMode } }, audio: false });
        handleStream(s, "Kamera Isiniyor...");
    } catch (err) {
        try { const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: currentFacingMode }, audio: false }); handleStream(s, "Kamera Isiniyor..."); }
        catch (e) { const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); handleStream(s, "Kamera Isiniyor..."); }
    }
}

function handleStream(stream, msg) {
    currentStream = stream; video.srcObject = stream; statusText.innerText = msg;
    setTimeout(() => { isCameraWarmedUp = true; statusText.innerText = "Tarama v5.36 Kurşun Geçirmez Aktif"; }, 1500);
    requestAnimationFrame(processFrame);
}

function switchCamera() { currentFacingMode = (currentFacingMode === "environment") ? "user" : "environment"; startCamera(); }

function parseBarPatternToObjects(binaryStr) {
    if (!binaryStr) return [];
    let rawResult = []; let currentBit = binaryStr; let count = 1;
    for (let i = 1; i < binaryStr.length; i++) {
        if (binaryStr[i] === currentBit) { count++; } 
        else {
            rawResult.push({ type: (currentBit === "0") ? "B" : "W", val: count });
            currentBit = binaryStr[i]; count = 1;
        }
    }
    rawResult.push({ type: (currentBit === "0") ? "B" : "W", val: count });
    
    let merged = [];
    for (let i = 0; i < rawResult.length; i++) {
        if (merged.length > 0 && merged[merged.length - 1].type === rawResult[i].type) {
            merged[merged.length - 1].val += rawResult[i].val;
        } else {
            merged.push(rawResult[i]);
        }
    }
    return merged.filter(o => o.val >= 3 && o.val <= 35);
}

function processFrame() {
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        const startX = Math.floor(canvas.width * 0.10), scanLength = Math.floor(canvas.width * 0.80);
        const startY = 0, scanHeight = 260; 
        
        const imgData = ctx.getImageData(startX, startY, scanLength, scanHeight), pixels = imgData.data;
        let validPatternFound = false; debugCanvas.width = scanLength; debugCanvas.height = 1; dctx.clearRect(0, 0, debugCanvas.width, debugCanvas.height);

        if (isCameraWarmedUp) {
            for (let y = 0; y < scanHeight; y += 3) {
                const rowOffset = y * scanLength * 4; let rowBrightnesses = new Array(scanLength), minB = 255, maxB = 0;
                for (let x = 0; x < scanLength; x++) {
                    const i = rowOffset + (x * 4), b = 0.299 * pixels[i] + 0.587 * pixels[i+1] + 0.114 * pixels[i+2];
                    rowBrightnesses[x] = b; if (b < minB) minB = b; if (b > maxB) maxB = b;
                }
                if ((maxB - minB) < 65) continue;
                let dynamicThreshold = (minB + maxB) / 2, binaryString = ""; let debugImgData = dctx.createImageData(scanLength, 1);
                for (let x = 0; x < scanLength; x++) {
                    const isWhite = rowBrightnesses[x] > dynamicThreshold; binaryString += isWhite ? "1" : "0";
                    const idx = x * 4;
                    debugImgData.data[idx] = isWhite ? 255 : 255; debugImgData.data[idx+1] = isWhite ? 255 : 0; debugImgData.data[idx+2] = isWhite ? 255 : 0; debugImgData.data[idx+3] = 255;
                }
                const runObjects = parseBarPatternToObjects(binaryString);
                
                // Siyah çizgileri filtrele ve sayısını say
                const blackCount = runObjects.filter(o => o.type === "B").length;
                
                // Sadece tam olarak 4 adet siyah çizgi barındıran gerçek barkod satırlarını kabul et!
                if (blackCount === 4) {
                    const targetSequence = runObjects.slice(-8); 
                    const pattern = BarcodeRatioEngine.processToRatios(targetSequence);
                    if (pattern !== null) {
                        dctx.putImageData(debugImgData, 0, 0);
                        const cardFound = BarcodeRatioEngine.cyclicalLookup(pattern); 
                        const isDefined = (cardFound !== null);
                        if (isDefined || !validPatternFound) {
                            latestActivePattern = pattern; 
                            latestActiveRawString = targetSequence.map(o => `${o.type}${o.val}`).join("-");
                            rawDataText.innerText = latestActiveRawString;
                            if (pattern === lockedPattern) { matchCount++; } else { lockedPattern = pattern; matchCount = 1; }
                            if (matchCount >= REQUIRED_MATCHES) {
                                cardNameText.innerText = isDefined ? cardFound : "Tanımsız: " + pattern;
                                cardNameText.style.color = isDefined ? "#00ffcc" : "#ff9900";
                                patternCodeText.innerText = lockedPattern;
                                if (isDefined) addHistoryItem(cardFound, lockedPattern);
                            }
                            validPatternFound = true;
                        }
                    }
                }
            }
        }
        if (!validPatternFound) resetScannerPanel();
    }
    requestAnimationFrame(processFrame);
}

function resetScannerPanel() {
    matchCount = Math.max(0, matchCount - 1);
    if (matchCount === 0) { cardNameText.innerText = "KART BEKLENİYOR..."; cardNameText.style.color = "#00ffcc"; patternCodeText.innerText = "-"; lastLoggedCard = ""; }
}

let snapshotCounter = 1;
window.addEventListener('keydown', function(e) {
    if (e.code === 'Space' || e.keyCode === 32) {
        e.preventDefault();
        if (latestActivePattern !== "-") {
            if (snapshotCounter === 1) console.log(`\n================ [ ANLIK SNAPSHOT LOGLARI ] ================`);
            console.log(`${snapshotCounter}.Satır > Oruntu: ${latestActivePattern} RLE: ${latestActiveRawString}`);
            snapshotCounter++;
        }
    }
});
window.addEventListener('DOMContentLoaded', startCamera);
