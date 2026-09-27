/* ═══════════════════════════════════════════════════════════
   TryOn AI — Chrome Extension Logic
   Handles tabs, product detection, profile upload,
   AI try-on processing, and history management.
   ═══════════════════════════════════════════════════════════ */

const API_BASE_URL = "http://localhost:8000";

document.addEventListener('DOMContentLoaded', () => {
    // ─── DOM References ─────────────────────────────────────
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    // Header
    const statusDot = $('#statusDot');

    // Tabs
    const tabs = $$('.tab');
    const panels = $$('.tab-panel');

    // Try-On tab
    const productLoading = $('#productLoading');
    const productFound = $('#productFound');
    const noProduct = $('#noProduct');
    const productImage = $('#productImage');
    const productTitle = $('#productTitle');
    const refreshProductBtn = $('#refreshProductBtn');
    const tryOnBtn = $('#tryOnBtn');
    const resultCard = $('#resultCard');
    const processingState = $('#processingState');
    const resultState = $('#resultState');
    const resultImage = $('#resultImage');
    const downloadBtn = $('#downloadBtn');
    const progressFill = $('#progressFill');

    // Profile tab
    const uploadArea = $('#uploadArea');
    const profileInput = $('#profileInput');
    const uploadPlaceholder = $('#uploadPlaceholder');
    const uploadPreview = $('#uploadPreview');
    const profilePreview = $('#profilePreview');

    // History tab
    const historyList = $('#historyList');
    const historyEmpty = $('#historyEmpty');

    // State
    let currentProductUrl = null;
    let currentProductTitle = null;


    // ─── Backend Health Check ───────────────────────────────
    async function checkBackendStatus() {
        try {
            const res = await fetch(`${API_BASE_URL}/`);
            const data = await res.json();
            statusDot.classList.add('connected');
            statusDot.title = data.ai_configured 
                ? 'Backend connected & AI ready' 
                : 'Backend connected (AI key not set)';
        } catch {
            statusDot.classList.remove('connected');
            statusDot.title = 'Backend not running';
        }
    }
    checkBackendStatus();


    // ─── Tab Switching ──────────────────────────────────────
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.tab;
            
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            panels.forEach(p => {
                p.classList.remove('active');
                if (p.id === `panel-${target}`) {
                    p.classList.add('active');
                }
            });

            // Load history when switching to history tab
            if (target === 'history') {
                loadHistory();
            }
        });
    });


    // ─── Profile Management (Poses Wardrobe) ────────────────
    let profileImages = [];
    let activeProfileIndex = 0;
    const posesGrid = $('#posesGrid');

    function renderPoses() {
        posesGrid.innerHTML = '';
        if (profileImages.length === 0) {
            posesGrid.innerHTML = '<p class="select-hint" style="margin:auto">No poses added yet.</p>';
            return;
        }

        profileImages.forEach((imgSrc, index) => {
            const item = document.createElement('div');
            item.className = `product-item ${index === activeProfileIndex ? 'selected' : ''}`;
            item.innerHTML = `<img src="${imgSrc}" alt="Pose ${index + 1}">`;
            
            item.addEventListener('click', () => {
                activeProfileIndex = index;
                chrome.storage.local.set({ activeProfileIndex });
                renderPoses();
            });
            
            posesGrid.appendChild(item);
        });
    }

    // Load saved profiles
    chrome.storage.local.get(['profileImages', 'activeProfileIndex'], (result) => {
        if (result.profileImages && result.profileImages.length > 0) {
            profileImages = result.profileImages;
            activeProfileIndex = result.activeProfileIndex || 0;
            renderPoses();
        } else if (result.profileImage) { // Migrate old single profile
            profileImages = [result.profileImage];
            activeProfileIndex = 0;
            chrome.storage.local.set({ profileImages, activeProfileIndex });
            renderPoses();
        } else {
            renderPoses();
        }
    });

    // Click to upload
    uploadArea.addEventListener('click', () => profileInput.click());

    function resizeAndCompressImage(file, maxSize = 1500) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    let width = img.width;
                    let height = img.height;
                    
                    if (width > maxSize || height > maxSize) {
                        if (width > height) {
                            height = Math.round((height * maxSize) / width);
                            width = maxSize;
                        } else {
                            width = Math.round((width * maxSize) / height);
                            height = maxSize;
                        }
                    }
                    
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    resolve(canvas.toDataURL('image/jpeg', 0.90)); // Compress to 90% JPEG
                };
                img.onerror = reject;
                img.src = e.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    profileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (profileImages.length >= 4) {
            showToast('You can only save up to 4 poses.');
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            showToast('Image too large. Please use an image under 10MB.');
            return;
        }

        try {
            showToast('Processing image... ⏳');
            const compressedBase64 = await resizeAndCompressImage(file, 1500);
            
            profileImages.push(compressedBase64);
            activeProfileIndex = profileImages.length - 1; // Auto select new pose
            
            chrome.storage.local.set({ profileImages, activeProfileIndex });
            renderPoses();
            showToast('New pose added! ✅');
        } catch (err) {
            showToast('Error processing image.');
            console.error('Image compression error:', err);
        }
    });


    // ─── Product Detection ──────────────────────────────────
    function detectProductOnPage() {
        productLoading.classList.remove('hidden');
        productFound.classList.add('hidden');
        noProduct.classList.add('hidden');
        tryOnBtn.disabled = true;

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tab = tabs[0];
            if (!tab || !tab.url || !tab.url.startsWith('http')) {
                productLoading.classList.add('hidden');
                noProduct.classList.remove('hidden');
                return;
            }

            chrome.tabs.sendMessage(tab.id, { action: "getProductDetails" }, (response) => {
                productLoading.classList.add('hidden');

                // Normalize old content.js responses if the user hasn't refreshed the tab yet
                if (response && response.imageUrl && !response.products) {
                    response.products = [{ imageUrl: response.imageUrl, title: response.title }];
                }

                if (chrome.runtime.lastError || !response || !response.products || response.products.length === 0) {
                    noProduct.classList.remove('hidden');
                } else {
                    productFound.classList.remove('hidden');
                    const productGrid = $('#productGrid');
                    productGrid.innerHTML = '';
                    
                    response.products.forEach((product, index) => {
                        const item = document.createElement('div');
                        item.className = `product-item ${index === 0 ? 'selected' : ''}`;
                        item.innerHTML = `
                            <img src="${product.imageUrl}" alt="Product">
                            <p>${product.title || 'Clothing Item'}</p>
                        `;
                        
                        item.addEventListener('click', () => {
                            // Update selection UI
                            productGrid.querySelectorAll('.product-item').forEach(el => el.classList.remove('selected'));
                            item.classList.add('selected');
                            
                            // Update current target
                            currentProductUrl = product.imageUrl;
                            currentProductTitle = product.title || 'Clothing Item';
                            
                            // Auto-categorize buttons based on title
                            updateButtonVisibility(currentProductTitle);
                        });
                        
                        productGrid.appendChild(item);
                    });
                    
                    // Set default to first product
                    currentProductUrl = response.products[0].imageUrl;
                    currentProductTitle = response.products[0].title || 'Clothing Item';
                    
                    const arBtn = document.getElementById('arTryOnBtn');
                    if (arBtn) {
                        // Only add the event listener once!
                        if (!arBtn.dataset.listenerAdded) {
                            arBtn.addEventListener('click', () => {
                                chrome.tabs.create({
                                    url: `http://localhost:8000/ar/ar.html?url=${encodeURIComponent(currentProductUrl)}`
                                });
                            });
                            arBtn.dataset.listenerAdded = "true";
                        }
                    }
                    
                    // Initial categorization
                    updateButtonVisibility(currentProductTitle);
                }
            });
        });
    }
    
    // Auto-categorize button logic
    function updateButtonVisibility(title) {
        const titleLower = title.toLowerCase();
        const isAccessory = titleLower.includes('glass') || 
                            titleLower.includes('sunglass') || 
                            titleLower.includes('shoe') || 
                            titleLower.includes('sneaker') ||
                            titleLower.includes('boot');
                            
        const arBtn = document.getElementById('arTryOnBtn');
        
        if (isAccessory) {
            // It's an accessory, show AR Mirror, hide Virtual Try-On
            tryOnBtn.style.display = 'none';
            if (arBtn) {
                arBtn.style.display = 'flex';
                arBtn.disabled = false;
            }
        } else {
            // It's clothing, show Virtual Try-On, hide AR Mirror
            tryOnBtn.style.display = 'flex';
            tryOnBtn.disabled = false;
            if (arBtn) arBtn.style.display = 'none';
        }
        
        if (typeof calculateSize === 'function') {
            calculateSize();
        }
    }

    detectProductOnPage();
    refreshProductBtn.addEventListener('click', detectProductOnPage);


    // ─── Magic Color Swap ───────────────────────────────────
    let currentHueRotation = 0;
    
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('color-swatch')) {
            document.querySelectorAll('.color-swatch').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            currentHueRotation = parseInt(e.target.dataset.hue);
            
            // Apply visual filter to the selected product in the grid
            const selectedImg = document.querySelector('.product-item.selected img');
            if (selectedImg) {
                selectedImg.style.filter = `hue-rotate(${currentHueRotation}deg)`;
            }
        }
    });

    async function applyHueRotate(imgUrl, hueDegrees) {
        if (hueDegrees === 0) return imgUrl;
        
        try {
            // Fetch as blob to avoid canvas tainting
            const response = await fetch(imgUrl);
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    
                    ctx.filter = `hue-rotate(${hueDegrees}deg)`;
                    ctx.drawImage(img, 0, 0);
                    
                    resolve(canvas.toDataURL('image/png'));
                    URL.revokeObjectURL(blobUrl);
                };
                img.src = blobUrl;
            });
        } catch (e) {
            console.error("Failed to apply hue rotation", e);
            return imgUrl; // Fallback to original
        }
    }


    // ─── Try-On Processing ──────────────────────────────────
    tryOnBtn.addEventListener('click', async () => {
        // Check profile exists
        if (profileImages.length === 0) {
            showToast('Please add at least one pose first!');
            // Switch to profile tab
            tabs.forEach(t => t.classList.remove('active'));
            panels.forEach(p => p.classList.remove('active'));
            $$('.tab')[1].classList.add('active');
            $('#panel-profile').classList.add('active');
            return;
        }

        const activeImage = profileImages[activeProfileIndex] || profileImages[0];

        // Show processing UI
        tryOnBtn.disabled = true;
        resultCard.classList.remove('hidden');
        processingState.classList.remove('hidden');
        resultState.classList.add('hidden');
        downloadBtn.classList.add('hidden');

        // Animate progress bar
        let progress = 0;
        const progressInterval = setInterval(() => {
            progress += Math.random() * 3;
            if (progress > 90) progress = 90;
            progressFill.style.width = `${progress}%`;
        }, 500);

        try {
            // Apply color swap if needed
            let finalProductUrl = currentProductUrl;
            if (currentHueRotation > 0) {
                finalProductUrl = await applyHueRotate(currentProductUrl, currentHueRotation);
            }

            // Send to backend via background script
            const response = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({
                    action: "processTryOn",
                    profileImage: activeImage,
                    productImage: finalProductUrl,
                    productTitle: currentProductTitle,
                }, (res) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve(res);
                    }
                });
            });

            clearInterval(progressInterval);
            progressFill.style.width = '100%';

            if (response && response.success) {
                // Show result
                setTimeout(() => {
                    processingState.classList.add('hidden');
                    resultState.classList.remove('hidden');
                    resultImage.src = response.resultUrl;
                    downloadBtn.classList.remove('hidden');
                }, 300);
            } else {
                throw new Error(response?.error || 'Unknown error occurred');
            }

        } catch (err) {
            clearInterval(progressInterval);
            processingState.classList.add('hidden');
            resultCard.classList.add('hidden');
            showToast(`Error: ${err.message}`);
        } finally {
            tryOnBtn.disabled = false;
            progressFill.style.width = '0%';
        }
    });


    // ─── Download Result ────────────────────────────────────
    downloadBtn.addEventListener('click', () => {
        if (resultImage.src) {
            chrome.downloads?.download?.({
                url: resultImage.src,
                filename: `tryon_result_${Date.now()}.png`
            });
        }
    });


    // ─── AI Stylist (Gemini) ────────────────────────────────
    const aiStylistBtn = document.getElementById('aiStylistBtn');
    const aiStylistResult = document.getElementById('aiStylistResult');
    
    if (aiStylistBtn) {
        aiStylistBtn.addEventListener('click', async () => {
            const btnText = aiStylistBtn.querySelector('.btn-tryon-text');
            btnText.textContent = "Asking Gemini...";
            aiStylistBtn.disabled = true;
            aiStylistResult.classList.add('hidden');
            
            try {
                const res = await fetch(`${API_BASE_URL}/style-advisor`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        result_url: resultImage.src,
                        product_title: currentProductTitle
                    })
                });
                
                const data = await res.json();
                aiStylistResult.textContent = data.advice || data.error;
                aiStylistResult.classList.remove('hidden');
                
            } catch (err) {
                aiStylistResult.textContent = "Error connecting to AI Stylist.";
                aiStylistResult.classList.remove('hidden');
            } finally {
                btnText.textContent = "Ask AI Stylist (Gemini)";
                aiStylistBtn.disabled = false;
            }
        });
    }

    // ─── History / Virtual Closet ───────────────────────────
    let selectedForCompare = [];
    const compareBtn = document.getElementById('compareBtn');
    const compareModal = document.getElementById('compareModal');
    const closeCompareBtn = document.getElementById('closeCompareBtn');
    const compareImg1 = document.getElementById('compareImg1');
    const compareImg2 = document.getElementById('compareImg2');

    if (closeCompareBtn) {
        closeCompareBtn.addEventListener('click', () => {
            compareModal.classList.add('hidden');
        });
    }

    if (compareBtn) {
        compareBtn.addEventListener('click', () => {
            if (selectedForCompare.length === 2) {
                compareImg1.src = selectedForCompare[0];
                compareImg2.src = selectedForCompare[1];
                compareModal.classList.remove('hidden');
            }
        });
    }

    async function loadHistory() {
        try {
            const res = await fetch(`${API_BASE_URL}/history?limit=10`);
            const data = await res.json();

            if (data.items && data.items.length > 0) {
                historyEmpty.classList.add('hidden');
                historyList.querySelectorAll('.history-item').forEach(el => el.remove());
                selectedForCompare = [];
                if (compareBtn) compareBtn.classList.add('hidden');

                data.items.forEach(item => {
                    const el = document.createElement('div');
                    el.className = 'history-item';
                    el.style.position = 'relative';
                    el.innerHTML = `
                        <div class="compare-check hidden" style="position: absolute; top: 5px; right: 5px; background: white; border-radius: 50%; width: 20px; height: 20px; display: flex; justify-content: center; align-items: center; border: 2px solid #3b82f6; color: #3b82f6; font-weight: bold;">✓</div>
                        <img class="history-thumb" src="${item.result_url}" alt="Result">
                        <div class="history-info">
                            <span class="history-title">${item.product_title || 'Try-On Result'}</span>
                            <span class="history-date">${formatDate(item.created_at)}</span>
                            <button class="history-stylist-btn" style="margin-top: 5px; background: #1e293b; color: #a78bfa; border: 1px solid #334155; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; cursor: pointer;">Ask Stylist ✨</button>
                        </div>
                    `;
                    
                    const stylistBtn = el.querySelector('.history-stylist-btn');
                    stylistBtn.addEventListener('click', async (e) => {
                        e.stopPropagation(); // Don't trigger the selection
                        stylistBtn.textContent = "Asking...";
                        stylistBtn.disabled = true;
                        try {
                            const res = await fetch(`${API_BASE_URL}/style-advisor`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    result_url: item.result_url,
                                    product_title: item.product_title
                                })
                            });
                            const data = await res.json();
                            alert(data.advice || data.error);
                        } catch (err) {
                            alert("Error connecting to AI Stylist.");
                        } finally {
                            stylistBtn.textContent = "Ask Stylist ✨";
                            stylistBtn.disabled = false;
                        }
                    });

                    el.addEventListener('click', (e) => {
                        const check = el.querySelector('.compare-check');
                        const idx = selectedForCompare.indexOf(item.result_url);
                        
                        if (idx > -1) {
                            // Deselect
                            selectedForCompare.splice(idx, 1);
                            check.classList.add('hidden');
                            el.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                        } else {
                            // Select
                            if (selectedForCompare.length < 2) {
                                selectedForCompare.push(item.result_url);
                                check.classList.remove('hidden');
                                el.style.borderColor = '#3b82f6';
                            } else {
                                // If already 2 selected, open the image instead
                                window.open(item.result_url, '_blank');
                                return;
                            }
                        }
                        
                        if (compareBtn) {
                            if (selectedForCompare.length === 2) {
                                compareBtn.classList.remove('hidden');
                            } else {
                                compareBtn.classList.add('hidden');
                            }
                        }
                    });
                    historyList.appendChild(el);
                });
            } else {
                historyEmpty.classList.remove('hidden');
            }
        } catch {
            historyEmpty.classList.remove('hidden');
        }
    }


    // ─── Body Metrics & Size Recommendation ─────────────────
    const userHeight = document.getElementById('userHeight');
    const userWeight = document.getElementById('userWeight');
    const sizeRecommendation = document.getElementById('sizeRecommendation');

    function calculateSize() {
        if (!userHeight || !userWeight || !sizeRecommendation) return;
        
        const h = parseInt(userHeight.value);
        const w = parseInt(userWeight.value);
        if (!h || !w) {
            sizeRecommendation.classList.add('hidden');
            return;
        }

        // Basic heuristic sizing model
        let size = 'M';
        if (w < 60) size = 'S';
        else if (w > 85 || h > 185) size = 'XL';
        else if (w > 75 || h > 180) size = 'L';
        else size = 'M';

        sizeRecommendation.textContent = `Based on your profile, recommended size: ${size}`;
        
        // Don't show size recommendation if it's an accessory
        const isAccessory = currentProductTitle && (
            currentProductTitle.toLowerCase().includes('glass') || 
            currentProductTitle.toLowerCase().includes('shoe') ||
            currentProductTitle.toLowerCase().includes('sneaker')
        );
        
        if (!isAccessory && tryOnBtn.style.display !== 'none') {
            sizeRecommendation.classList.remove('hidden');
        } else {
            sizeRecommendation.classList.add('hidden');
        }
    }

    if (userHeight && userWeight) {
        userHeight.addEventListener('input', () => {
            chrome.storage.local.set({ userHeight: userHeight.value });
            calculateSize();
        });
        
        userWeight.addEventListener('input', () => {
            chrome.storage.local.set({ userWeight: userWeight.value });
            calculateSize();
        });

        // Load saved metrics
        chrome.storage.local.get(['userHeight', 'userWeight'], (result) => {
            if (result.userHeight) userHeight.value = result.userHeight;
            if (result.userWeight) userWeight.value = result.userWeight;
            calculateSize();
        });
    }

    // ─── Utilities ──────────────────────────────────────────
    function chromeStorageGet(keys) {
        return new Promise(resolve => {
            chrome.storage.local.get(keys, resolve);
        });
    }

    function formatDate(isoString) {
        try {
            const d = new Date(isoString);
            return d.toLocaleDateString('en-IN', {
                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
            });
        } catch {
            return '';
        }
    }

    function showToast(message) {
        // Create a simple toast notification
        const existing = document.querySelector('.toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            bottom: 16px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(30,41,59,0.95);
            color: #f1f5f9;
            padding: 10px 20px;
            border-radius: 8px;
            font-size: 0.8rem;
            border: 1px solid rgba(255,255,255,0.1);
            box-shadow: 0 4px 20px rgba(0,0,0,0.4);
            z-index: 1000;
            animation: toastIn 0.3s ease;
        `;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.animation = 'toastOut 0.3s ease forwards';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // Inject toast animations
    const style = document.createElement('style');
    style.textContent = `
        @keyframes toastIn { from { opacity:0; transform: translateX(-50%) translateY(10px); } to { opacity:1; transform: translateX(-50%) translateY(0); } }
        @keyframes toastOut { from { opacity:1; transform: translateX(-50%) translateY(0); } to { opacity:0; transform: translateX(-50%) translateY(10px); } }
    `;
    document.head.appendChild(style);
});
