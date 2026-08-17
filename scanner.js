// ========================================================
// SENİN BULDUĞUN GERÇEK CANLI VERİTABANI (v5.41 - Gömülü)
// ========================================================
const JANNERSTEN_DECK_MAP = {
    // CLUBS
    "I-G-K-D-I-G-I-G-I": "CA",
    "I-D-I-G-I-G-K-G-I": "C2",
    "I-G-I-D-I-G-K-G-I": "C3",
    "D-I-D-I-D-I-D-K-G": "C4",
    "I-D-K-I-G-K-D-K-D": "C5",
    "K-I-D-K-G-I-G-K-D": "C6",
    "I-G-K-D-I-G-K-D-I": "C7",
    "I-G-I-D-K-G-K-D-I": "C8",
    "I-D-I-G-K-G-K-D-I": "C9",
    "K-I-D-K-G-K-G-I-D": "CT",
    "I-D-I-D-K-G-K-D-I": "CJ",
    "I-D-I-D-K-G-K-G-I": "CQ",
    "I-G-K-D-K-G-I-D-I": "CK",

    // DIAMONDS
    "I-D-K-G-I-G-I-G-I": "DA",
    "I-G-I-G-I-G-K-D-I": "D2",
    "D-I-D-I-D-I-G-K-D": "D3",
    "G-I-D-I-D-K-D-D-I": "D4",
    "I-D-I-D-K-G-I-D-I": "D5",
    "I-D-I-D-I-G-I-D-I": "D6",
    "I-G-I-D-I-G-I-D-I": "D7",
    "I-G-K-D-I-G-I-D-I": "D8",
    "I-D-K-D-I-G-I-D-I": "D9",
    "G-I-G-I-D-I-D-I-D": "DT",
    "K-G-I-D-I-D-I-D-I": "DJ",
    "K-D-I-D-I-D-I-D-I": "DQ",
    "I-D-I-D-I-D-I-D-I": "DK",

    // HEARTS
    "I-D-I-D-I-D-I-D-I": "HA",
    "I-G-K-D-K-D-I-D-I": "H2",
    "I-G-I-G-K-D-I-D-I": "H3",
    "I-D-I-G-I-D-I-D-I": "H4",
    "I-G-I-G-I-D-I-D-I": "H5",
    "I-G-K-G-I-D-I-D-I": "H6",
    "I-D-K-G-I-D-I-D-I": "H7",
    "I-D-K-G-K-D-I-D-I": "H8",
    "K-I-G-K-G-K-D-I-D": "H9",
    "I-G-I-G-K-G-I-D-I": "HT",
    "I-G-I-D-K-D-I-D-I": "HJ",
    "D-I-D-I-G-K-D-I-D": "HQ",
    "D-I-G-K-G-K-D-I-D": "HK",

    // SPADES
    "I-D-I-D-I-G-I-G-I": "SA",
    "I-G-I-D-K-G-I-G-I": "S2",
    "I-D-I-G-K-G-I-G-I": "S3",
    "D-I-G-I-G-I-D-K-G": "S4",
    "G-K-I-D-I-D-K-D-I": "S5",
    "I-D-K-G-K-D-I-G-I": "S6",
    "I-G-K-G-I-D-I-G-I": "S7",
    "D-I-D-I-G-I-D-I-G": "S8",
    "I-D-I-D-I-D-I-G-I": "S9",
    "I-D-K-G-I-D-K-G-I": "ST",
    "I-G-K-D-I-D-K-G-I": "SJ",
    "I-D-K-D-I-D-I-G-I": "SQ",
    "D-I-G-I-D-I-D-I-G": "SK"
};

// ========================================================
// v4.3 RUHUNA SAHİP SABİT EŞİKLİ YAKIN MESAFE MOTORU
// ========================================================
const BarcodeRatioEngine = {
    processToRatios(targetSequence) {
        if (!targetSequence || targetSequence.length < 8) return null;

        // SENİN YAKIN MESAFE SENARYON: Çelik gibi sabit bıçak kesimi (7 piksel kuralı)
        // 4-5 cm mesafede ve flaş açıkken en hatasız ayrımı bu sabit sınırlar sağlar.
        const threshB = 11; 
        const threshW = 11; 

        return targetSequence.map(p => {
            if (p.type === "B") {
                return (p.val >= threshB) ? "K" : "I";
            } else {
                return (p.val >= threshW) ? "G" : "D";
            }
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
    setTimeout(() => { isCameraWarmedUp = true; statusText.innerText = "Tarama v5.41 Yakın Mesafe Hazır"; }, 1500);
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
    // Flaş patlamasındaki kılcal sızıntıları temizleyen katı alt sınır (val >= 3)
    return merged.filter(o => o.val >= 3 && o.val <= 35);
}

function processFrame() {
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // 4-5 cm yakın okuma için genişletilmiş ve ortalanmış tarama geometrisi
        const startX = Math.floor(canvas.width * 0.15), scanLength = Math.floor(canvas.width * 0.7);
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
                
                // Flaşlı yakın çekimde kontrast çok yüksek olacağı için alt eşiği (85) yukarı çekiyoruz
                if ((maxB - minB) < 85) continue;
                let dynamicThreshold = (minB + maxB) / 2, binaryString = ""; let debugImgData = dctx.createImageData(scanLength, 1);
                for (let x = 0; x < scanLength; x++) {
                    const isWhite = rowBrightnesses[x] > dynamicThreshold; binaryString += isWhite ? "1" : "0";
                    const idx = x * 4;
                    debugImgData.data[idx] = isWhite ? 255 : 255; debugImgData.data[idx+1] = isWhite ? 255 : 0; debugImgData.data[idx+2] = isWhite ? 255 : 0; debugImgData.data[idx+3] = 255;
                }
                const runObjects = parseBarPatternToObjects(binaryString);
                
                // Senin orijinal 9 elemanlı kararlı eşleme pencerene tam geri dönüş!
                if (runObjects.length >= 9) {
                    const targetSequence = runObjects.slice(-9); 
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
