// ─── Extract Product Image from URL ─────────────────────────────
const urlParams = new URLSearchParams(window.location.search);
const productUrl = urlParams.get('url');

const overlayImage = new Image();
if (productUrl) {
    overlayImage.src = productUrl;
} else {
    // Fallback glasses for testing if no URL provided
    overlayImage.src = 'https://freepngimg.com/thumb/glasses/34-glasses-png-image.png';
}

// ─── MediaPipe Initialization ───────────────────────────────────
const videoElement = document.querySelector('.input_video');
const canvasElement = document.querySelector('.output_canvas');
const canvasCtx = canvasElement.getContext('2d');
const loadingOverlay = document.getElementById('loading');

let isLoaded = false;

function onResults(results) {
    if (!isLoaded) {
        loadingOverlay.style.display = 'none';
        isLoaded = true;
    }

    // Prepare canvas
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // Draw the camera frame
    canvasCtx.drawImage(
        results.image, 0, 0, canvasElement.width, canvasElement.height);

    // If a face is detected
    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        const landmarks = results.multiFaceLandmarks[0];
        
        // MediaPipe Face Landmarks for Eyes
        // Left Eye Outer Corner: 33, Right Eye Outer Corner: 263
        // Nose bridge (center): 168
        
        const leftEye = landmarks[33];
        const rightEye = landmarks[263];
        
        // Convert normalized coordinates to canvas pixel coordinates
        const lx = leftEye.x * canvasElement.width;
        const ly = leftEye.y * canvasElement.height;
        const rx = rightEye.x * canvasElement.width;
        const ry = rightEye.y * canvasElement.height;

        // Calculate center between eyes
        const cx = (lx + rx) / 2;
        const cy = (ly + ry) / 2;

        // Reverting back to original dx/dy calculation (MediaPipe handles selfie-mode coordinates internally)
        const dx = rx - lx;
        const dy = ry - ly;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Calculate angle of rotation
        const angle = Math.atan2(dy, dx);
        
        // Offset Y slightly downwards so glasses sit on the nose bridge
        // cy is the exact center of the pupils, glasses usually sit lower
        const verticalOffset = distance * 0.2;

        // Define the scale for the glasses.
        // The glasses should be slightly wider than the eye-to-eye distance.
        const scaleMultiplier = 2.4; 
        const glassesWidth = distance * scaleMultiplier;
        const glassesHeight = (overlayImage.height / overlayImage.width) * glassesWidth;

        // Draw the overlay image
        canvasCtx.translate(cx, cy + verticalOffset);
        canvasCtx.rotate(angle);
        
        // Use 'multiply' blend mode to make the solid white background of the product image transparent!
        // This is a classic canvas trick for e-commerce images with white backgrounds.
        canvasCtx.globalCompositeOperation = 'multiply';
        
        canvasCtx.drawImage(
            overlayImage,
            -glassesWidth / 2,
            -glassesHeight / 2,
            glassesWidth,
            glassesHeight
        );
        
        // Reset composite operation so the next frame draws normally
        canvasCtx.globalCompositeOperation = 'source-over';
        
        // Optionally, draw a debug dot on the nose bridge
        // const nose = landmarks[168];
        // canvasCtx.fillStyle = 'red';
        // canvasCtx.fillRect(nose.x * canvasElement.width, nose.y * canvasElement.height, 5, 5);
    }
    
    canvasCtx.restore();
}

// ─── Setup Face Mesh ───────────────────────────────────────────
const faceMesh = new FaceMesh({locateFile: (file) => {
    return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
}});

faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

faceMesh.onResults(onResults);

// ─── Start Camera ──────────────────────────────────────────────
const camera = new Camera(videoElement, {
    onFrame: async () => {
        await faceMesh.send({image: videoElement});
    },
    width: 1280,
    height: 720
});
camera.start();
