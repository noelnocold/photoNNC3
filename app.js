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

// --- STATE MANAGEMENT ---
let stream = null;
let photos = [];
let currentFilter = 'none';
let currentEffect = 'none';
let isCapturing = false;

// QR Code & Double Strip State
let isQrActive = false;
let isDoubleActive = false;
let qrImageObj = null;
const QR_FILE_PATH = 'asset/qr.png';

// Standard Dimensions
const STRIP_WIDTH = 480;
const STRIP_HEIGHT = 1480;
const PHOTO_WIDTH = 400;
const PHOTO_HEIGHT = 300;
const GAP = 40;

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
        'asset/template_1_fca5a5_fecaca.png',  // Template 1: 2 tone đỏ pastel
        'asset/template_2_bbf7d0_6ee7b7.png',  // Template 2: 2 tone xanh lá pastel
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

// --- INITIALIZE CAMERA ---
async function initCamera() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false
        });
        video.srcObject = stream;
        // Gọi play() tường minh để camera hiển thị ngay, không chờ autoplay browser
        video.play().catch(() => {});
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
                    <img src="${photos[i]}" class="w-full h-full object-cover transform scale-x-[-1]" />
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

    ctx.filter = currentFilter;
    ctx.translate(PHOTO_WIDTH, 0);
    ctx.scale(-1, 1);

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
const triggerFlash = () => {
    flash.classList.add('flash-active');
    setTimeout(() => flash.classList.remove('flash-active'), 100);
};

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
document.getElementById('btn-manual').addEventListener('click', () => {
    if (isCapturing) return;
    if (photos.length >= 4) {
        showRetakeModal();
        return;
    }
    triggerFlash();
    photos.push(captureVideoFrame());
    updateThumbnails();
});

// Auto 4-Shots Button
document.getElementById('btn-auto').addEventListener('click', async function () {
    if (isCapturing) return;
    if (photos.length >= 4) {
        showRetakeModal();
        return;
    }

    isCapturing = true;
    const originalHTML = this.innerHTML;
    this.innerHTML = "Đang chụp...";
    this.disabled = true;
    document.getElementById('btn-manual').disabled = true;

    while (photos.length < 4) {
        countdownText.classList.remove('hidden');
        for (let i = 3; i > 0; i--) {
            countdownText.innerText = i;
            await wait(1000);
        }
        countdownText.classList.add('hidden');

        triggerFlash();
        photos.push(captureVideoFrame());
        updateThumbnails();
        if (photos.length < 4) await wait(800);
    }
    isCapturing = false;
    this.disabled = false;
    document.getElementById('btn-manual').disabled = false;
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
                    ${photos.map(p => `<img src="${p}" class="w-full aspect-[4/3] object-cover rounded-sm shadow-inner" style="transform: scaleX(-1);" />`).join('')}
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
                ctx.save();
                ctx.translate(offsetX + GAP + PHOTO_WIDTH, yPos);
                ctx.scale(-1, 1);
                ctx.drawImage(img, 0, 0, PHOTO_WIDTH, PHOTO_HEIGHT);
                ctx.restore();
            }

            // Vẽ khung template đè lên trên từ thư mục asset
            ctx.drawImage(frameImg, offsetX, 0, STRIP_WIDTH, STRIP_HEIGHT);

            // Vẽ mã QR ở góc dưới cùng bên phải sát cạnh nếu được bật
            if (isQrActive && qrImg) {
                const qrSize = 85;
                const qrMargin = 12; // Sát mép phải và mép dưới
                const qrX = offsetX + STRIP_WIDTH - qrSize - qrMargin;
                const qrY = STRIP_HEIGHT - qrSize - qrMargin;

                // Card nền trắng viền bo nhẹ tạo độ tương phản cao cho QR
                ctx.save();
                ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
                ctx.shadowBlur = 6;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 2;
                ctx.fillStyle = '#ffffff';
                roundRect(ctx, qrX - 4, qrY - 4, qrSize + 8, qrSize + 8, 6);
                ctx.fill();
                ctx.restore();

                // Vẽ QR image
                ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
            }
        }

        // Nếu ở chế độ Double, vẽ đường nét đứt phân cách ở giữa để tiện cắt ảnh
        if (isDoubleActive) {
            ctx.save();
            ctx.setLineDash([12, 10]);
            ctx.strokeStyle = 'rgba(160, 160, 160, 0.45)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(STRIP_WIDTH, 20);
            ctx.lineTo(STRIP_WIDTH, STRIP_HEIGHT - 20);
            ctx.stroke();
            ctx.restore();
        }

        // Download JPG
        const dataURL = canvasFinal.toDataURL('image/jpeg', 0.95);
        const link = document.createElement('a');
        link.download = `photobooth_${frame ? frame.id : 'photo'}${isDoubleActive ? '_double' : ''}_${Date.now()}.jpg`;
        link.href = dataURL;
        link.click();
    } catch (err) {
        console.error('Download error:', err);
    } finally {
        this.innerHTML = originalHTML;
        this.disabled = false;
    }
});
