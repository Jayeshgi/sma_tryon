/* ═══════════════════════════════════════════════════════════
   TryOn AI — Background Service Worker
   Handles API communication securely from the extension context.
   ═══════════════════════════════════════════════════════════ */

const API_BASE_URL = "http://localhost:8000";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    
    if (request.action === "processTryOn") {
        processTryOn(request)
            .then(result => sendResponse(result))
            .catch(err => sendResponse({ 
                success: false, 
                error: err.message || "Unknown error" 
            }));
        
        // Return true to keep the message channel open for async response
        return true;
    }
});


/**
 * Send the profile image and product image to the backend
 * for AI virtual try-on processing.
 */
async function processTryOn({ profileImage, productImage, productTitle }) {
    try {
        const controller = new AbortController();
        // 5-minute timeout — AI models can take 2-4 min on cold starts
        const timeoutId = setTimeout(() => controller.abort(), 300000);
        
        const response = await fetch(`${API_BASE_URL}/try-on`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                profile_image_base64: profileImage,
                product_image_url: productImage,
                product_title: productTitle || null,
            }),
            signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`Server error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            return {
                success: true,
                resultUrl: data.result_url,
                resultId: data.result_id,
            };
        } else {
            return {
                success: false,
                error: data.error || "AI generation failed.",
            };
        }
        
    } catch (err) {
        if (err.name === 'AbortError') {
            return { success: false, error: "Request timed out (>5 min). Try again later." };
        }
        
        // Check if backend is unreachable
        if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
            return { 
                success: false, 
                error: "Cannot connect to AI backend. Make sure the server is running (python main.py)." 
            };
        }
        
        return { success: false, error: err.message };
    }
}
