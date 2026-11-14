// ==========================================
// PHOTOBOOTH APPLICATION LOGIC (LIGHTWEIGHT & DIRECT ASSET)
// ==========================================

// --- DOM ELEMENTS ---
const video = document.getElementById('video');
const flash = document.getElementById('flash');
const countdownText = document.getElementById('countdown-text');
const effectOverlay = document.getElementById('effect-overlay');
const thumbnailsContainer = document.getElementById('thumbnails');
const photoCountSpan = document.getElementById('photo-count');
const captureView = document.getElementById('capture-view');
const resultView = document.getElementById('result-view');
const carousel = document.getElementById('frame-carousel');
const carouselDots = document.getElementById('carousel-dots');
const canvasFinal = document.getElementById('canvas-final');
const btnToggleQr = document.getElementById('btn-toggle-qr');
const qrStatusText = document.getElementById('qr-status-text');
const btnToggleDouble = document.getElementById('btn-toggle-double');
const doubleStatusText = document.getElementById('double-status-text');

// Background Animation Layers
const bgLayerBack = document.getElementById('carousel-bg-layer-back');
const bgLayerFront = document.getElementById('carousel-bg-layer-front');

// Modal Elements
const retakeModal = document.getElementById('retake-modal');
const retakeModalContent = document.getElementById('retake-modal-content');
const btnConfirmRetake = document.getElementById('btn-confirm-retake');
const btnCancelRetake = document.getElementById('btn-cancel-retake');

// Camera & Flash Toggle Elements
const btnSwitchCamera = document.getElementById('btn-switch-camera');
const switchCameraIcon = document.getElementById('switch-camera-icon');
const btnFlashToggle = document.getElementById('btn-flash-toggle');
const flashIconOff = document.getElementById('flash-icon-off');
const flashIconOn = document.getElementById('flash-icon-on');
const screenFlashOverlay = document.getElementById('screen-flash-overlay');

// --- STATE MANAGEMENT ---
let stream = null;
let photos = [];
let currentFilter = 'none';
let currentEffect = 'none';
let currentFacingMode = 'user';
let isSwitchingCamera = false;
let isCapturing = false;
let isFlashOn = false;

// QR Code & Double Strip State
let isQrActive = false;
let isDoubleActive = false;
let qrImageObj = null;
const QR_FILE_PATH = 'asset/qr.png';

// Standard Dimensions (Option B: Siêu nét 2.5x Scale cho chuẩn in ấn và hiển thị sắc nét)
const EXPORT_SCALE = 2.5;
const STRIP_WIDTH = Math.round(480 * EXPORT_SCALE);   // 1200 px
const STRIP_HEIGHT = Math.round(1480 * EXPORT_SCALE); // 3700 px
const PHOTO_WIDTH = Math.round(400 * EXPORT_SCALE);   // 1000 px
const PHOTO_HEIGHT = Math.round(300 * EXPORT_SCALE);  // 750 px
const GAP = Math.round(40 * EXPORT_SCALE);            // 100 px

// Frames: DUY NHẤT LẤY TỪ THƯ MỤC asset VỚI TIỀN TỐ template
let frameData = [];
let activeFrameIndex = 0;
let currentBgFrameIndex = -1;
let scrollSettleTimer = null;
const assetImageCache = {};

// --- LOAD TEMPLATES ---
// Tên file format: template_N_RRGGBB_RRGGBB.png (2 mã màu HEX không có #)
// Hệ thống tự thêm # khi sử dụng. Ví dụ: template_1_fca5a5_fecaca.png
function loadTemplatesFromAsset() {
    // Danh sách file template với 2 màu pastel mã hóa trong tên
    const templateFiles = [
        'asset/template_1_fca5a5_fecaca.png',
        'asset/template_2_fca5a5_fecaca.png',
        'asset/template_3_bbf7d0_6ee7b7.png',
        'asset/template_4_bbf7d0_6ee7b7.png',
        'asset/template_5_fcefdc_fff7d9.png',
        'asset/template_6_fcefdc_fff7d9.png'
    ];

    frameData = templateFiles.map((src, idx) => {
        // Trích 2 mã màu HEX từ tên file, tự động thêm # vào đầu
        const matches = src.match(/_([0-9a-fA-F]{6})_([0-9a-fA-F]{6})\./);
        const color1 = matches ? `#${matches[1]}` : '#f3f4f6';
        const color2 = matches ? `#${matches[2]}` : '#e5e7eb';

        const img = new Image();
        img.src = src;
        const id = `template_${idx + 1}`;
        assetImageCache[id] = img;

        return { id, name: `Template ${idx + 1}`, src, img, color1, color2 };
    });

    // Nạp sẵn ảnh QR
    qrImageObj = new Image();
    qrImageObj.src = QR_FILE_PATH;
}
loadTemplatesFromAsset();

function updateFlashButtonTitle() {
    if (!btnFlashToggle) return;
    if (currentFacingMode === 'environment') {
        btnFlashToggle.title = isFlashOn ? 'Tắt Đèn Flash' : 'Bật Đèn Flash';
    } else {
        btnFlashToggle.title = isFlashOn ? 'Tắt Flash màn hình' : 'Bật Flash màn hình';
    }
}

// Lấy luồng camera đa tầng: thử deviceId chính xác -> exact facingMode -> ideal facingMode
async function getCameraStream(targetFacing) {
    const baseConstraints = { width: { ideal: 1920 }, height: { ideal: 1080 } };

    // 1. Thử tìm deviceId cụ thể nếu trình duyệt đã cấp quyền và có nhiều camera
    try {
        if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(d => d.kind === 'videoinput');

            if (videoDevices.length > 1) {
                let targetDevice = null;
                if (targetFacing === 'environment') {
                    targetDevice = videoDevices.find(d => /back|rear|environment|sau|world/i.test(d.label))
                        || videoDevices[videoDevices.length - 1];
                } else {
                    targetDevice = videoDevices.find(d => /front|user|trước|selfie/i.test(d.label))
                        || videoDevices[0];
                }

                if (targetDevice && targetDevice.deviceId) {
                    try {
                        return await navigator.mediaDevices.getUserMedia({
                            video: { ...baseConstraints, deviceId: { exact: targetDevice.deviceId } },
                            audio: false
                        });
                    } catch (deviceErr) {
                        console.warn('getUserMedia with deviceId failed, falling back:', deviceErr);
                    }
                }
            }
        }
    } catch (enumErr) {
        console.warn('enumerateDevices error:', enumErr);
    }

    // 2. Thử với facingMode { exact: targetFacing }
    try {
        return await navigator.mediaDevices.getUserMedia({
            video: { ...baseConstraints, facingMode: { exact: targetFacing } },
            audio: false
        });
    } catch (exactErr) {
        console.warn('exact facingMode failed, falling back to ideal:', exactErr);
    }

    // 3. Fallback an toàn nhất: facingMode { ideal: targetFacing }
    return await navigator.mediaDevices.getUserMedia({
        video: { ...baseConstraints, facingMode: { ideal: targetFacing } },
        audio: false
    });
}

// --- INITIALIZE CAMERA ---
async function initCamera(facingMode = currentFacingMode) {
    try {
        if (stream) {
            await setRearTorch(false);
            stream.getTracks().forEach(track => track.stop());
            stream = null;
        }

        stream = await getCameraStream(facingMode);

        const activeTrack = stream.getVideoTracks()[0];
        const actualFacing = activeTrack?.getSettings?.().facingMode;
        currentFacingMode = (actualFacing === 'user' || actualFacing === 'environment')
            ? actualFacing
            : facingMode;

        video.classList.toggle('video-rear', currentFacingMode === 'environment');
        updateFlashButtonTitle();

        video.srcObject = stream;
        // Gọi play() tường minh để camera hiển thị ngay, không chờ autoplay browser
        video.play().catch(() => { });
        document.getElementById('cam-error').classList.add('hidden');
    } catch (err) {
        console.error('Camera access error:', err);
        document.getElementById('cam-error').classList.remove('hidden');
    }
}

// Gọi camera ngay khi DOM sẵn sàng (không chờ load toàn bộ tài nguyên)
// DOMContentLoaded nhanh hơn 'load' vì không cần đợi Tailwind CDN
document.addEventListener('DOMContentLoaded', () => {
    initCamera();
    initDynamicTitle();
    initVisitCounter();
});


// --- DYNAMIC TYPEWRITER TITLE EFFECT ---
function initDynamicTitle() {
    const suffixEl = document.getElementById('dynamic-title-suffix');
    const iconEl = document.getElementById('dynamic-title-icon');
    if (!suffixEl || !iconEl) return;

    const wordList = [
        { text: 'Gay', icon: '🌈' },
        { text: 'Lesbian', icon: '🌈' },
        { text: 'Straight', icon: '✨' },
        { text: 'Capybara', icon: '🍊' },
        { text: 'Cutie', icon: '🎀' },
        { text: 'Legend', icon: '👑' },
        { text: 'Slay', icon: '💅' },
        { text: 'Champ', icon: '🏆' },
        { text: 'Booth', icon: '📸' },
        { text: 'Angel', icon: '👼' },
    ];

    let currentWordIndex = 0; // Bắt đầu bằng 'booth'
    let currentText = 'booth';

    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

    async function runTypewriterLoop() {
        while (true) {
            // Cứ sau khoảng 5s thì kích hoạt hiệu ứng xóa và đổi từ
            await delay(5000);

            // Hiệu ứng xóa lùi từng chữ một như phím backspace
            while (currentText.length > 0) {
                currentText = currentText.slice(0, -1);
                suffixEl.textContent = currentText;
                if (iconEl && currentText.length === 0) {
                    iconEl.style.opacity = '0';
                    iconEl.style.transform = 'scale(0.5)';
                }
                await delay(75);
            }

            // Nghỉ ngắn khi xóa hết chữ
            await delay(250);

            // Chọn ngẫu nhiên một từ trong danh sách (khác từ hiện tại)
            let nextIndex;
            do {
                nextIndex = Math.floor(Math.random() * wordList.length);
            } while (nextIndex === currentWordIndex && wordList.length > 1);

            currentWordIndex = nextIndex;
            const target = wordList[currentWordIndex];

            // Hiệu ứng gõ từng ký tự mới vào
            for (let i = 0; i < target.text.length; i++) {
                currentText += target.text[i];
                suffixEl.textContent = currentText;
                await delay(110);
            }

            // Cập nhật và hiện icon tương ứng với hiệu ứng nảy nhẹ
            if (iconEl) {
                iconEl.textContent = target.icon;
                iconEl.style.opacity = '1';
                iconEl.style.transform = 'scale(1.35)';
                setTimeout(() => {
                    iconEl.style.transform = 'scale(1)';
                }, 200);
            }
        }
    }

    runTypewriterLoop();
}

// --- FILTERS & EFFECTS CONTROLS ---
window.setFilter = function (val, btn) {
    currentFilter = val;
    video.style.filter = val;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
};

window.setEffect = function (val, btn) {
    currentEffect = val;
    effectOverlay.className = 'effect-overlay ' + (val !== 'none' ? `effect-${val}` : '');
    document.querySelectorAll('.effect-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
};

// --- THUMBNAILS UPDATE ---
function updateThumbnails() {
    photoCountSpan.innerText = photos.length;
    thumbnailsContainer.innerHTML = '';
    for (let i = 0; i < 4; i++) {
        if (photos[i]) {
            thumbnailsContainer.innerHTML += `
                <div class="rounded-xl border-2 border-white/80 shadow-md w-full h-full relative overflow-hidden">
                    <img src="${photos[i]}" class="w-full h-full object-cover" />
                </div>`;
        } else {
            thumbnailsContainer.innerHTML += `<div class="bg-white/50 rounded-xl border border-white/60 shadow-sm w-full h-full"></div>`;
        }
    }
    const btnReset = document.getElementById('btn-reset');
    photos.length > 0 ? btnReset.classList.remove('hidden') : btnReset.classList.add('hidden');

    if (photos.length === 4) {
        setTimeout(showResults, 500);
    }
}

document.getElementById('btn-reset').addEventListener('click', () => {
    photos = [];
    updateThumbnails();
});

// Capture a frame from video with filters and canvas effects
function captureVideoFrame() {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = PHOTO_WIDTH;
    tempCanvas.height = PHOTO_HEIGHT;
    const ctx = tempCanvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.filter = currentFilter;

    // Crop Center calculation
    const vW = video.videoWidth || 1280;
    const vH = video.videoHeight || 720;
    const targetRatio = PHOTO_WIDTH / PHOTO_HEIGHT;
    const videoRatio = vW / vH;
    let sx, sy, sW, sH;

    if (videoRatio > targetRatio) {
        sH = vH;
        sW = vH * targetRatio;
        sx = (vW - sW) / 2;
        sy = 0;
    } else {
        sW = vW;
        sH = vW / targetRatio;
        sx = 0;
        sy = (vH - sH) / 2;
    }

    ctx.drawImage(video, sx, sy, sW, sH, 0, 0, PHOTO_WIDTH, PHOTO_HEIGHT);

    // Reset transform for effects
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.filter = 'none';

    // Apply canvas effects
    if (currentEffect === 'vignette') {
        const grd = ctx.createRadialGradient(PHOTO_WIDTH / 2, PHOTO_HEIGHT / 2, PHOTO_HEIGHT / 4, PHOTO_WIDTH / 2, PHOTO_HEIGHT / 2, PHOTO_WIDTH / 1.2);
        grd.addColorStop(0, 'rgba(0,0,0,0)');
        grd.addColorStop(1, 'rgba(0,0,0,0.7)');
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, PHOTO_WIDTH, PHOTO_HEIGHT);
    } else if (currentEffect === 'lightleak') {
        const grd = ctx.createLinearGradient(0, 0, PHOTO_WIDTH, PHOTO_HEIGHT);
        grd.addColorStop(0, 'rgba(255,100,100,0.15)');
        grd.addColorStop(0.5, 'rgba(0,0,0,0)');
        grd.addColorStop(1, 'rgba(255,200,100,0.1)');
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, PHOTO_WIDTH, PHOTO_HEIGHT);
        ctx.globalCompositeOperation = 'source-over';
    } else if (currentEffect === 'grain') {
        const imgData = ctx.getImageData(0, 0, PHOTO_WIDTH, PHOTO_HEIGHT);
        const data = imgData.data;
        for (let i = 0; i < data.length; i += 4) {
            const noise = (Math.random() - 0.5) * 50;
            data[i] = Math.min(255, Math.max(0, data[i] + noise));
            data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
            data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
        }
        ctx.putImageData(imgData, 0, 0);
    }
    return tempCanvas.toDataURL('image/png');
}

const wait = ms => new Promise(r => setTimeout(r, ms));

// Flash trắng nhỏ trong khung camera (hiệu ứng chớp UI)
const triggerFlash = () => {
    flash.classList.add('flash-active');
    setTimeout(() => flash.classList.remove('flash-active'), 100);
};

// Flash toàn màn hình cho camera trước (giả lập đèn flash)
const triggerScreenFlash = () => new Promise(resolve => {
    if (!isFlashOn) { resolve(); return; }          // Nếu tắt flash → bỏ qua ngay
    screenFlashOverlay.style.transition = 'none';   // Tắt transition khi bật (tức thì)
    screenFlashOverlay.style.opacity = '1';          // Màn hình trắng hoàn toàn
    // Giữ màn hình trắng 220ms để camera kịp nhận sáng
    setTimeout(() => {
        screenFlashOverlay.style.transition = 'opacity 0.35s ease-out'; // Fade-out mượt
        screenFlashOverlay.style.opacity = '0';     // Tắt overlay
        resolve();                                   // Tiếp tục chụp
    }, 220);
});

// Bật/tắt đèn flash LED phần cứng cho camera sau (nếu trình duyệt & thiết bị hỗ trợ)
async function setRearTorch(enabled) {
    if (!stream) return false;
    const tracks = stream.getVideoTracks();
    if (!tracks || tracks.length === 0) return false;

    let success = false;
    for (const track of tracks) {
        try {
            await track.applyConstraints({
                advanced: [{ torch: !!enabled }]
            });
            success = true;
        } catch (err) {
            console.warn('applyConstraints torch failed on track:', err);
        }
    }
    return success;
}

// Chụp ảnh kèm xử lý Flash phù hợp cho cả cam trước và cam sau
async function captureWithFlash() {
    let usedTorch = false;

    if (isFlashOn) {
        if (currentFacingMode === 'environment') {
            // ==============================================================
            // CAMERA SAU: CHỈ DÙNG FLASH ĐÈN LED PHẦN CỨNG (KHÔNG DÙNG MÀN HÌNH)
            // ==============================================================
            usedTorch = await setRearTorch(true);
            if (usedTorch) {
                // Đợi 280ms để đèn LED sáng rực và camera tự động cân bằng phơi sáng
                await wait(280);
            }
        } else {
            // ==============================================================
            // CAMERA TRƯỚC: DÙNG FLASH MÀN HÌNH TRẮNG
            // ==============================================================
            await triggerScreenFlash();
        }
    }

    // Hiệu ứng chớp trắng viền trong khung camera:
    // CHỈ CHẠY CHO CAMERA TRƯỚC KHI BẬT FLASH, TUYỆT ĐỐI KHÔNG CHẠY CHO CAM SAU
    if (isFlashOn && currentFacingMode === 'user') {
        triggerFlash();
    }

    // Chụp lại frame ảnh từ video
    const frameDataUrl = captureVideoFrame();

    // Tắt đèn LED sau khi chụp xong
    if (usedTorch) {
        await setRearTorch(false);
    }

    return frameDataUrl;
}

// --- SWITCH CAMERA BUTTON ---
if (btnSwitchCamera) {
    btnSwitchCamera.addEventListener('click', async () => {
        if (isCapturing || isSwitchingCamera) return;
        isSwitchingCamera = true;
        btnSwitchCamera.disabled = true;
        await setRearTorch(false); // Đảm bảo tắt flash cũ trước khi đổi cam

        if (switchCameraIcon) {
            switchCameraIcon.classList.toggle('rotate-180');
        }

        const nextFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
        await initCamera(nextFacingMode);

        isSwitchingCamera = false;
        btnSwitchCamera.disabled = false;
    });
}

// --- FLASH TOGGLE BUTTON ---
btnFlashToggle.addEventListener('click', () => {
    isFlashOn = !isFlashOn;        // Đảo trạng thái
    if (isFlashOn) {
        flashIconOff.classList.add('hidden');       // Ẩn icon outline
        flashIconOn.classList.remove('hidden');     // Hiện icon solid vàng
        btnFlashToggle.classList.add('flash-btn-on'); // Áp style CSS active
    } else {
        flashIconOff.classList.remove('hidden');    // Hiện lại icon outline
        flashIconOn.classList.add('hidden');        // Ẩn icon solid
        btnFlashToggle.classList.remove('flash-btn-on');
        if (currentFacingMode === 'environment') {
            setRearTorch(false);
        }
    }
    updateFlashButtonTitle();
});

// --- RETAKE MODAL POP-UP ---
function showRetakeModal() {
    retakeModal.classList.remove('hidden');
    retakeModal.classList.add('flex');
    setTimeout(() => {
        retakeModal.classList.remove('opacity-0');
        retakeModalContent.classList.remove('scale-95');
    }, 10);
}

function hideRetakeModal() {
    retakeModal.classList.add('opacity-0');
    retakeModalContent.classList.add('scale-95');
    setTimeout(() => {
        retakeModal.classList.add('hidden');
        retakeModal.classList.remove('flex');
    }, 300);
}

btnCancelRetake.addEventListener('click', hideRetakeModal);
btnConfirmRetake.addEventListener('click', () => {
    photos = [];
    updateThumbnails();
    hideRetakeModal();
});

// Manual Shot Button
document.getElementById('btn-manual').addEventListener('click', async () => {
    if (isCapturing || isSwitchingCamera) return;
    if (photos.length >= 4) {
        showRetakeModal();
        return;
    }
    photos.push(await captureWithFlash());
    updateThumbnails();
});

// Auto 4-Shots Button
document.getElementById('btn-auto').addEventListener('click', async function () {
    if (isCapturing || isSwitchingCamera) return;
    if (photos.length >= 4) {
        showRetakeModal();
        return;
    }

    isCapturing = true;
    const originalHTML = this.innerHTML;
    this.innerHTML = "Đang chụp...";
    this.disabled = true;
    document.getElementById('btn-manual').disabled = true;
    if (btnSwitchCamera) btnSwitchCamera.disabled = true;

    while (photos.length < 4) {
        countdownText.classList.remove('hidden');
        for (let i = 3; i > 0; i--) {
            countdownText.innerText = i;
            await wait(1000);
        }
        countdownText.classList.add('hidden');

        photos.push(await captureWithFlash());
        updateThumbnails();
        if (photos.length < 4) await wait(800);
    }
    isCapturing = false;
    this.disabled = false;
    document.getElementById('btn-manual').disabled = false;
    if (btnSwitchCamera) btnSwitchCamera.disabled = false;
    this.innerHTML = originalHTML;
});

// --- QR CODE TOGGLE FEATURE ---
btnToggleQr.addEventListener('click', () => {
    isQrActive = !isQrActive;
    if (isQrActive) {
        btnToggleQr.classList.add('active');
        qrStatusText.innerText = 'Đã Bật QR';
        if (!qrImageObj) {
            qrImageObj = new Image();
            qrImageObj.src = QR_FILE_PATH;
        }
    } else {
        btnToggleQr.classList.remove('active');
        qrStatusText.innerText = 'Chèn QR';
    }
    updateQrBadgesVisibility();
});

function updateQrBadgesVisibility() {
    const badges = document.querySelectorAll('.qr-preview-badge');
    badges.forEach(badge => {
        if (isQrActive) {
            badge.classList.add('visible');
        } else {
            badge.classList.remove('visible');
        }
    });
}

// --- DOUBLE STRIP (BẢN ĐÔI x2) TOGGLE FEATURE ---
btnToggleDouble.addEventListener('click', () => {
    isDoubleActive = !isDoubleActive;
    if (isDoubleActive) {
        btnToggleDouble.classList.add('active');
        doubleStatusText.innerText = 'Đã Bật Đôi';
    } else {
        btnToggleDouble.classList.remove('active');
        doubleStatusText.innerText = 'Bản Đôi (x2)';
    }
    renderCarousel();
});

// --- DYNAMIC BACKGROUND: 2 hình tròn blurred, hiệu ứng mở rộng từ tâm ---
function updateCarouselBackground(newIndex, animate = true) {
    if (!frameData || frameData.length === 0) return;
    if (newIndex < 0 || newIndex >= frameData.length) return;
    if (newIndex === currentBgFrameIndex) return;

    const frame = frameData[newIndex];
    if (!frame) return;

    // 2 màu pastel từ tên file (# đã được thêm tự động khi load)
    const c1 = frame.color1 || '#fca5a5';
    const c2 = frame.color2 || '#fecaca';

    // 2 hình tròn nhỏ gọn để blur rõ nét, không lan thành dải gradient
    const gradient = `radial-gradient(circle at 22% 28%, ${c1} 0%, transparent 38%),
                      radial-gradient(circle at 76% 70%, ${c2} 0%, transparent 33%)`;

    currentBgFrameIndex = newIndex;

    // Set gradient lên back layer ngay (không animate)
    bgLayerBack.style.background = gradient;

    if (!animate) {
        bgLayerFront.style.transition = 'none';
        bgLayerFront.style.clipPath = 'circle(150% at 50% 50%)';
        bgLayerFront.style.background = gradient;
        return;
    }

    // Front layer: nhận gradient mới → bắt đầu đóng → mở ra từ tâm
    bgLayerFront.style.transition = 'none';
    bgLayerFront.style.background = gradient;
    bgLayerFront.style.clipPath = 'circle(0% at 50% 50%)';

    void bgLayerFront.offsetWidth; // Force reflow

    bgLayerFront.style.transition = 'clip-path 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    bgLayerFront.style.clipPath = 'circle(150% at 50% 50%)';
}

// --- CAROUSEL RENDERING & CONTROLS ---
async function showResults() {
    captureView.classList.add('hidden');
    resultView.classList.remove('hidden');
    resultView.classList.add('flex');

    if (frameData.length === 0) {
        await loadTemplatesFromAsset();
    }
    renderCarousel();

    carousel.scrollLeft = 0;
    activeFrameIndex = 0;
    updateDots(0);

    // Reset và hiển thị ngay background của template đầu tiên (không animate)
    currentBgFrameIndex = -1;
    bgLayerBack.style.transition = 'none';
    bgLayerFront.style.transition = 'none';
    bgLayerFront.style.clipPath = 'circle(150% at 50% 50%)';
    updateCarouselBackground(0, false);
}

document.getElementById('btn-back-capture').addEventListener('click', () => {
    resultView.classList.add('hidden');
    resultView.classList.remove('flex');
    captureView.classList.remove('hidden');
});

function renderCarousel() {
    carousel.innerHTML = '';
    carouselDots.innerHTML = '';

    frameData.forEach((frame, idx) => {
        const slide = document.createElement('div');
        slide.className = 'w-full flex-shrink-0 snap-center flex justify-center items-center px-4 relative z-10 py-2';

        const singleStripHtml = `
            <div class="relative shadow-[0_25px_60px_rgba(0,0,0,0.25)] rounded-md overflow-hidden transition-transform duration-300 hover:scale-[1.02] ${isDoubleActive ? 'h-[360px] sm:h-[440px] md:h-[500px]' : 'h-[440px] sm:h-[480px] md:h-[540px]'}" style="aspect-ratio: 480/1480;">
                <div class="absolute inset-0 bg-white"></div>
                <!-- Khung chứa 4 ảnh -->
                <div class="absolute inset-0 flex flex-col" style="padding: 8.333%; gap: 2.7%;">
                    ${photos.map(p => `<img src="${p}" class="w-full aspect-[4/3] object-cover rounded-sm shadow-inner" />`).join('')}
                </div>
                <!-- Khung template từ thư mục asset -->
                <img class="absolute inset-0 w-full h-full object-cover pointer-events-none z-10" src="${frame.src}" onerror="this.style.display='none'" />
                <!-- Mã QR ở góc dưới cùng bên phải sát cạnh -->
                <div class="qr-preview-badge ${isQrActive ? 'visible' : ''}">
                    <img src="${QR_FILE_PATH}" class="w-full h-full object-contain" />
                </div>
            </div>
        `;

        if (isDoubleActive) {
            slide.innerHTML = `
                <div class="flex items-center justify-center gap-2 sm:gap-3">
                    ${singleStripHtml}
                    <div class="h-64 border-r border-dashed border-gray-400/50 hidden sm:block"></div>
                    ${singleStripHtml}
                </div>
            `;
        } else {
            slide.innerHTML = singleStripHtml;
        }

        carousel.appendChild(slide);

        // Dot indicator
        const dot = document.createElement('div');
        dot.id = `dot-${idx}`;
        dot.className = `h-2 rounded-full transition-all duration-300 cursor-pointer ${idx === activeFrameIndex ? 'bg-[#b91c1c] w-5 shadow-sm' : 'bg-white/60 w-2'}`;
        dot.addEventListener('click', () => {
            const targetSlide = carousel.querySelectorAll('.snap-center')[idx];
            if (targetSlide) {
                targetSlide.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            } else {
                carousel.scrollTo({
                    left: carousel.clientWidth * idx,
                    behavior: 'smooth'
                });
            }
            activeFrameIndex = idx;
            updateDots(idx);
            if (scrollSettleTimer) clearTimeout(scrollSettleTimer);
            scrollSettleTimer = setTimeout(() => {
                onCarouselSettled(idx);
            }, 300);
        });
        carouselDots.appendChild(dot);
    });
}

// Hàm xác định slide đang nằm ở vị trí trung tâm chính xác nhất
function getCarouselCurrentIndex() {
    const slides = carousel.querySelectorAll('.snap-center');
    if (!slides || slides.length === 0) return 0;
    const carouselCenter = carousel.scrollLeft + carousel.clientWidth / 2;
    let closestIndex = 0;
    let minDistance = Infinity;
    slides.forEach((slide, idx) => {
        const slideCenter = slide.offsetLeft + slide.offsetWidth / 2;
        const distance = Math.abs(carouselCenter - slideCenter);
        if (distance < minDistance) {
            minDistance = distance;
            closestIndex = idx;
        }
    });
    return closestIndex;
}

// Carousel Scroll listener with debounce for settling
carousel.addEventListener('scroll', () => {
    const newIndex = getCarouselCurrentIndex();

    if (newIndex !== activeFrameIndex) {
        activeFrameIndex = newIndex;
        updateDots(activeFrameIndex);
    }

    // Debounce scroll settle: khi dừng lướt hoàn toàn
    if (scrollSettleTimer) clearTimeout(scrollSettleTimer);
    scrollSettleTimer = setTimeout(() => {
        onCarouselSettled(activeFrameIndex);
    }, 180);
});

// Native scrollend event support
if ('onscrollend' in window) {
    carousel.addEventListener('scrollend', () => {
        if (scrollSettleTimer) clearTimeout(scrollSettleTimer);
        const settledIndex = getCarouselCurrentIndex();
        activeFrameIndex = settledIndex;
        updateDots(settledIndex);
        onCarouselSettled(settledIndex);
    });
}

function onCarouselSettled(index) {
    if (index >= 0 && index < frameData.length) {
        updateCarouselBackground(index, true);
    }
}

function updateDots(index) {
    for (let i = 0; i < frameData.length; i++) {
        const dot = document.getElementById(`dot-${i}`);
        if (!dot) continue;
        if (i === index) {
            dot.className = 'h-2 rounded-full transition-all duration-300 bg-[#b91c1c] w-5 shadow-sm';
        } else {
            dot.className = 'h-2 rounded-full transition-all duration-300 bg-white/60 w-2';
        }
    }
}

// Helper for drawing rounded rectangle on canvas
function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

// --- EXPORT FINAL IMAGE (HỖ TRỢ CẢ BẢN ĐƠN VÀ BẢN ĐÔI DOUBLE STRIP) ---
document.getElementById('btn-download').addEventListener('click', async function () {
    const originalHTML = this.innerHTML;
    this.innerHTML = `
        <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
        </svg>
        Đang xử lý...
    `;
    this.disabled = true;
    await wait(100);

    try {
        const totalStrips = isDoubleActive ? 2 : 1;
        canvasFinal.width = STRIP_WIDTH * totalStrips;
        canvasFinal.height = STRIP_HEIGHT;
        const ctx = canvasFinal.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        const frame = frameData[activeFrameIndex];

        // Nạp trước frame template
        let frameImg = assetImageCache[frame.id] || frame.img;
        if (!frameImg || !frameImg.complete) {
            frameImg = new Image();
            frameImg.src = frame.src;
            await new Promise(r => frameImg.onload = r);
        }

        // Nạp trước QR image nếu bật
        let qrImg = null;
        if (isQrActive) {
            qrImg = qrImageObj;
            if (!qrImg || !qrImg.complete) {
                qrImg = new Image();
                qrImg.src = QR_FILE_PATH;
                await new Promise(r => qrImg.onload = r);
            }
        }

        // Nạp 4 ảnh chụp
        const loadedPhotos = [];
        for (let i = 0; i < 4; i++) {
            if (photos[i]) {
                const img = new Image();
                img.src = photos[i];
                await new Promise(r => img.onload = r);
                loadedPhotos.push(img);
            }
        }

        // Vẽ từng dải ảnh (1 dải đơn hoặc 2 dải đôi)
        for (let s = 0; s < totalStrips; s++) {
            const offsetX = s * STRIP_WIDTH;

            // Nền trắng cơ bản
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(offsetX, 0, STRIP_WIDTH, STRIP_HEIGHT);

            // Vẽ 4 ảnh chụp
            for (let i = 0; i < loadedPhotos.length; i++) {
                const img = loadedPhotos[i];
                const yPos = GAP + (i * (PHOTO_HEIGHT + GAP));
                ctx.drawImage(img, offsetX + GAP, yPos, PHOTO_WIDTH, PHOTO_HEIGHT);
            }

            // Vẽ khung template đè lên trên từ thư mục asset
            ctx.drawImage(frameImg, offsetX, 0, STRIP_WIDTH, STRIP_HEIGHT);

            // Vẽ mã QR ở góc dưới cùng bên phải sát cạnh nếu được bật
            if (isQrActive && qrImg) {
                const qrSize = Math.round(85 * EXPORT_SCALE);
                const qrMargin = Math.round(12 * EXPORT_SCALE);
                const qrX = offsetX + STRIP_WIDTH - qrSize - qrMargin;
                const qrY = STRIP_HEIGHT - qrSize - qrMargin;
                const qrPad = Math.round(4 * EXPORT_SCALE);

                ctx.save();
                ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
                ctx.shadowBlur = Math.round(6 * EXPORT_SCALE);
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = Math.round(2 * EXPORT_SCALE);
                ctx.fillStyle = '#ffffff';
                roundRect(ctx, qrX - qrPad, qrY - qrPad, qrSize + (qrPad * 2), qrSize + (qrPad * 2), Math.round(6 * EXPORT_SCALE));
                ctx.fill();
                ctx.restore();

                ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
            }
        }

        // Đường nét đứt phân cách ở giữa khi bật Double Strip
        if (isDoubleActive) {
            ctx.save();
            ctx.setLineDash([Math.round(12 * EXPORT_SCALE), Math.round(10 * EXPORT_SCALE)]);
            ctx.strokeStyle = 'rgba(160, 160, 160, 0.45)';
            ctx.lineWidth = Math.round(2 * EXPORT_SCALE);
            ctx.beginPath();
            ctx.moveTo(STRIP_WIDTH, Math.round(20 * EXPORT_SCALE));
            ctx.lineTo(STRIP_WIDTH, STRIP_HEIGHT - Math.round(20 * EXPORT_SCALE));
            ctx.stroke();
            ctx.restore();
        }

        // =========================================================
        // XỬ LÝ TẢI VỀ: ƯU TIÊN SHARE SHEET CHO IPHONE/IPAD, TẢI TRỰC TIẾP CHO THIẾT BỊ KHÁC
        // =========================================================
        const fileName = `photobooth_${frame ? frame.id : 'photo'}${isDoubleActive ? '_double' : ''}_${Date.now()}.jpg`;

        // 1. Chuyển Canvas sang dạng Blob binary
        const blob = await new Promise(resolve => canvasFinal.toBlob(resolve, 'image/jpeg', 0.95));
        if (!blob) throw new Error('Không thể tạo file ảnh.');

        // 2. Nhận diện thiết bị iOS / iPadOS (bao gồm cả iPad chạy Safari chế độ Desktop)
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

        // 3. Nếu là iPhone/iPad và hỗ trợ Web Share API -> Mở Share Sheet của iOS
        if (isIOS && navigator.canShare) {
            const file = new File([blob], fileName, { type: 'image/jpeg' });
            if (navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share({
                        files: [file],
                        title: 'Photobooth Image',
                        text: 'Ảnh chụp từ Photobooth'
                    });
                    return; // Lưu/chia sẻ thành công qua iOS Native Sheet
                } catch (err) {
                    if (err.name === 'AbortError') return; // Người dùng bấm Hủy
                    // Nếu lỗi khác trên iOS, rơi xuống phương án fallback bên dưới
                }
            }
        }

        // 4. Tải trực tiếp file .jpg về máy cho Android, Windows, macOS...
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = fileName;
        link.href = blobUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Giải phóng bộ nhớ Blob URL sau khi tải
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);

    } catch (err) {
        console.error('Download error:', err);
        alert('Không thể tải ảnh tự động. Bạn có thể nhấn giữ vào hình ảnh preview để chọn "Lưu ảnh".');
    } finally {
        this.innerHTML = originalHTML;
        this.disabled = false;
    }
});

// --- VISIT COUNTER API ---
async function initVisitCounter() {
    const countSpan = document.getElementById('visit-count');
    if (!countSpan) return;

    try {
        // Thay thế 'hoang-photobooth-official-01' bằng tên dự án thực tế của bạn
        const uniqueKey = 'noelnocold-photobooth-v1';

        // Gọi API để đếm lượt truy cập (Count API)
        const response = await fetch(`https://countapi.mileshilliard.com/api/v1/hit/${uniqueKey}`);
        const data = await response.json();

        if (data.value) {
            const count = parseInt(data.value, 10);
            countSpan.innerText = count.toLocaleString('vi-VN');
        }
    } catch (err) {
        console.error('Lỗi bộ đếm:', err);
        countSpan.innerText = '-';
    }
}