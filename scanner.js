// ========================================================
// ENTEGRE JANNERSTEN VERİTABANI (v5.25 - Dahili Database)
// ========================================================
const JANNERSTEN_DECK_MAP = {
    "I-D-K-D-I-D-I-G": "CA",
    "I-D-K-D-I-G-I-G": "CA",
    "G-I-D-K-G-K-G-K": "C3",
    "D-I-D-I-D-I-D-I": "C3",
    "I-D-I-D-I-D-I-D": "C3"
};

// ========================================================
// ORAN TABANLI ÇEKİRDEK MOTOR (v5.25)
// ========================================================
const BarcodeRatioEngine = {
    CONFIG: { 
        MIN_ELEMENT_VAL: 3,
        MAX_ELEMENT_VAL: 35,
        RATIO_THRESHOLD: 1.45
    },
    processToRatios(targetSequence) {
        if (!targetSequence || targetSequence.length < 8) return null;

        const blacks = targetSequence.filter(p => p.type === "B").map(p => p.val);
        const whites = targetSequence.filter(p => p.type === "W").map(p => p.val);
        if (blacks.length < 3 || whites.length < 3) return null;

        const sortedB = [...blacks].sort((a, b) => a - b);
        const sortedW = [...whites].sort((a, b) => a - b);
        const baseB = sortedB[0]; 
        const baseW = sortedW[0];

        if (baseB < 1 || baseW < 1) return null;

        return targetSequence.map(p => {
            if (p.type === "B") {
                return (p.val / baseB >= this.CONFIG.RATIO_THRESHOLD) ? "K" : "I";
            } else {
                return (p.val / baseW >= this.CONFIG.RATIO_THRESHOLD) ? "G" : "D";
            }
        }).join("-");
    }
};

// ========================================================
// KAMERA VE ARAYÜZ YÖNETİMİ (v5.25 - Part 1/2)
// ========================================================
const video = document.getElementById('webcam');
const canvas = document.getElementById('hidden-canvas');
const ctx = canvas.getContext('2d');
const debugCanvas = document.getElementById('debug-canvas');
const dctx = debugCanvas.getContext('2d');
const statusText = document.getElementById('status');
const cardNameText = document.getElementById('card-name');
const patternCodeText = document.getElementById('pattern-code');
const rawDataText = document.getElementById('raw-data');
const historyList = document.getElementById('history-list');

let lockedPattern = "-", matchCount = 0, lastLoggedCard = "";
let currentFacingMode = "environment";
let currentStream = null;
let audioCtx = null;
const REQUIRED_MATCHES = 3;

let latestActivePattern = "-";
let latestActiveRawString = "-";
let isCameraWarmedUp = false; 

function playBeep() {
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
        osc.type = 'sine'; osc.frequency.setValueAtTime(950, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(); osc.stop(audioCtx.currentTime + 0.18);
    } catch (e) { console.log(e); }
}

function addHistoryItem(cardName, pattern) {
    if (cardName === lastLoggedCard) return;
    lastLoggedCard = cardName;
    if (historyList.querySelector('li[style*="center"]')) historyList.innerHTML = "";
    const li = document.createElement('li');
    li.innerHTML = `<span class="card">${cardName}</span> <span class="pattern">[${pattern}]</span>`;
    historyList.prepend(li); playBeep();
}

function clearHistory() {
    historyList.innerHTML = '<li style="color: #666; text-align: center;">Henüz bilinen kart okunmadı</li>';
    lastLoggedCard = "";
}

async function startCamera() {
    isCameraWarmedUp = false; 
    if (currentStream) currentStream.getTracks().forEach(t => t.stop());
    try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { exact: currentFacingMode } }, audio: false });
        handleStream(s, "Kamera Isiniyor, Lütfen Bekleyin...");
    } catch (err) {
        try {
            const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: currentFacingMode }, audio: false });
            handleStream(s, "Kamera Isiniyor (Alternatif)...");
        } catch (e) {
            try {
                const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                handleStream(s, "Kamera Isiniyor (Genel)...");
            } catch (ex) { statusText.innerText = "Kamera Hatasi: " + ex.message; }
        }
    }
}

function handleStream(stream, msg) {
    currentStream = stream; video.srcObject = stream; statusText.innerText = msg; 
    setTimeout(() => {
        isCameraWarmedUp = true;
        statusText.innerText = "Tarama v5.25 Aktif (Tikir Tikir Modu)";
    }, 1500);
    requestAnimationFrame(processFrame);
}

function switchCamera() {
    currentFacingMode = (currentFacingMode === "environment") ? "user" : "environment";
    startCamera();
}

// ========================================================
// GÖRÜNTÜ ANALİZİ VEYA TARAMA DÖNGÜSÜ (v5.25 - Part 2/2)
// ========================================================
function processFrame() {
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const startX = Math.floor(canvas.width * 0.15), scanLength = Math.floor(canvas.width * 0.7);
        const startY = Math.floor(canvas.height * 0.35); 
        const scanHeight = 200; 

        const imgData = ctx.getImageData(startX, startY, scanLength, scanHeight), pixels = imgData.data;
        let validPatternFound = false;

        debugCanvas.width = scanLength; debugCanvas.height = 1; dctx.clearRect(0, 0, debugCanvas.width, debugCanvas.height);

        if (isCameraWarmedUp) {
            for (let y = 0; y < scanHeight; y += 3) {
                const rowOffset = y * scanLength * 4;
                let rowBrightnesses = new Array(scanLength), minB = 255, maxB = 0;

                for (let x = 0; x < scanLength; x++) {
                    const i = rowOffset + (x * 4);
                    const b = 0.299 * pixels[i] + 0.587 * pixels[i+1] + 0.114 * pixels[i+2];
                    rowBrightnesses[x] = b;
                    if (b < minB) minB = b; if (b > maxB) maxB = b;
                }

                if ((maxB - minB) < 65) continue; 
                let dynamicThreshold = (minB + maxB) / 2, binaryString = "";
                let debugImgData = dctx.createImageData(scanLength, 1);

                for (let x = 0; x < scanLength; x++) {
                    const isWhite = rowBrightnesses[x] > dynamicThreshold;
                    binaryString += isWhite ? "1" : "0";
                    const idx = x * 4;
                    if (isWhite) {
                        debugImgData.data[idx] = 255; debugImgData.data[idx+1] = 255; debugImgData.data[idx+2] = 255;
                    } else {
                        debugImgData.data[idx] = 255; debugImgData.data[idx+1] = 0; debugImgData.data[idx+2] = 0;
                    }
                    debugImgData.data[idx+3] = 255;
                }

                const runObjects = parseBarPatternToObjects(binaryString);
                if (runObjects.length >= 8 && runObjects.length <= 10) {
                    const targetSequence = runObjects.slice(-8);
                    const pattern = BarcodeRatioEngine.processToRatios(targetSequence);

                    if (pattern !== null) {
                        dctx.putImageData(debugImgData, 0, 0);
                        const isDefined = (typeof JANNERSTEN_DECK_MAP !== 'undefined' && JANNERSTEN_DECK_MAP[pattern]);

                        if (isDefined || !validPatternFound) {
                            const rawString = targetSequence.map(o => `${o.type}${o.val}`).join("-");
                            
                            latestActivePattern = pattern;
                            latestActiveRawString = rawString;
                            
                            rawDataText.innerText = rawString;
                            const cardFound = isDefined ? JANNERSTEN_DECK_MAP[pattern] : "Tanimlanmamis Oruntu: " + pattern;

                            if (pattern === lockedPattern) { 
                                matchCount++; 
                            } else { 
                                lockedPattern = pattern; 
                                matchCount = 1; 
                            }

                            if (matchCount >= REQUIRED_MATCHES) {
                                cardNameText.innerText = cardFound;
                                cardNameText.style.color = isDefined ? "#00ffff" : "#ff9900";
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

// KRİTİK DÜZELTME: Kart çekilince kilit temizlenir, bir sonraki gösterimde TIKIR TIKIR yeniden okur.
function resetScannerPanel() {
    matchCount = Math.max(0, matchCount - 1);
    if (matchCount === 0) { 
        cardNameText.innerText = "KART BEKLENIYOR..."; 
        cardNameText.style.color = "#888"; 
        patternCodeText.innerText = "-";
        latestActivePattern = "-";
        latestActiveRawString = "-";
        lastLoggedCard = ""; // Hafıza kilidi tamamen sıfırlandı!
    }
}

function parseBarPatternToObjects(binaryStr) {
    if (!binaryStr) return [];
    let rawResult = [];
    let currentBit = binaryStr;
    let count = 1;

    for (let i = 1; i < binaryStr.length; i++) {
        if (binaryStr[i] === currentBit) { 
            count++; 
        } else {
            const type = (currentBit === "0") ? "B" : "W";
            if (count >= 3 && count <= 35) {
                rawResult.push({ type: type, val: count });
            }
            currentBit = binaryStr[i]; 
            count = 1;
        }
    }
    
    let mergedResult = [];
    for (let i = 0; i < rawResult.length; i++) {
        if (mergedResult.length > 0 && mergedResult[mergedResult.length - 1].type === rawResult[i].type) {
            mergedResult[mergedResult.length - 1].val += rawResult[i].val;
        } else {
            mergedResult.push(rawResult[i]);
        }
    }

    return mergedResult.filter(o => o.val >= 3 && o.val <= 35);
}

let snapshotCounter = 1;

window.addEventListener('keydown', function(e) {
    if (e.code === 'Space' || e.keyCode === 32) {
        e.preventDefault();
        if (latestActivePattern !== "-") {
            if (snapshotCounter === 1) {
                console.log(`\n================ [ ANLIK SNAPSHOT LOGLARI ] ================`);
            }
            console.log(`${snapshotCounter}.Satir > Oruntu: ${latestActivePattern} RLE: ${latestActiveRawString}`);
            snapshotCounter++;
        } else {
            console.log("[UYARI] Kararli cizgi yok.");
        }
    }
});

window.addEventListener('DOMContentLoaded', startCamera);
