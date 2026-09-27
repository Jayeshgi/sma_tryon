/* ═══════════════════════════════════════════════════════════
   TryOn AI — Content Script
   Runs in the context of shopping websites.
   Detects the main product image and title using multiple
   fallback strategies for maximum compatibility.
   ═══════════════════════════════════════════════════════════ */

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getProductDetails") {
        const productInfo = detectMultipleProducts();
        sendResponse(productInfo);
    }
    return true;
});


/**
 * Detect multiple products on the current page.
 * Uses a cascading strategy but aggregates all found products.
 */
function detectMultipleProducts() {
    let productsMap = new Map(); // Use map to deduplicate by URL

    // Helper to add product
    const addProduct = (url, title, source) => {
        if (!url || !url.startsWith('http')) return;
        // Clean up URL parameters slightly to avoid duplicates
        const cleanUrl = url.split('?')[0]; 
        
        if (!productsMap.has(cleanUrl)) {
            productsMap.set(cleanUrl, {
                imageUrl: url, // Keep original URL for loading
                title: cleanTitle(title || document.title),
                source: source
            });
        }
    };

    // ── Strategy 1: JSON-LD (Schema.org Product) ────────────
    const jsonLdProducts = parseJsonLd();
    jsonLdProducts.forEach(p => addProduct(p.imageUrl, p.title, 'json-ld'));

    // ── Strategy 2: Site-specific selectors (Carousel/Grids) ──
    const siteProducts = detectFromKnownSites();
    siteProducts.forEach(p => addProduct(p.imageUrl, p.title, 'site-selector'));

    // ── Strategy 3: Heuristic — all large visible images ───────
    const heuristicProducts = findAllLargeImages();
    heuristicProducts.forEach(p => addProduct(p.imageUrl, p.title, 'heuristic'));

    // Convert map to array
    const products = Array.from(productsMap.values());
    
    // Sort so that the most likely "main" products are first
    products.sort((a, b) => {
        if (a.source === 'json-ld') return -1;
        if (b.source === 'json-ld') return 1;
        if (a.source === 'site-selector') return -1;
        if (b.source === 'site-selector') return 1;
        return 0;
    });

    return {
        products: products,
        mainProduct: products.length > 0 ? products[0] : null
    };
}


/**
 * Parse JSON-LD scripts for Product schema.
 */
function parseJsonLd() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    const results = [];
    
    for (const script of scripts) {
        try {
            const data = JSON.parse(script.textContent);
            const products = extractProducts(data);
            
            for (const product of products) {
                if (product.image) {
                    let img = product.image;
                    if (Array.isArray(img)) img = img[0];
                    if (typeof img === 'object' && img.url) img = img.url;
                    if (typeof img === 'string') {
                        results.push({
                            imageUrl: img,
                            title: product.name || null,
                        });
                    }
                }
            }
        } catch (e) {
            // Skip malformed JSON-LD
        }
    }
    return results;
}


/**
 * Recursively extract Product objects from JSON-LD data.
 */
function extractProducts(data) {
    const products = [];
    
    if (Array.isArray(data)) {
        data.forEach(item => products.push(...extractProducts(item)));
    } else if (data && typeof data === 'object') {
        if (data['@type'] === 'Product') {
            products.push(data);
        }
        if (data['@graph'] && Array.isArray(data['@graph'])) {
            data['@graph'].forEach(item => products.push(...extractProducts(item)));
        }
    }
    return products;
}


/**
 * Detect product images from well-known shopping sites (multiple items).
 */
function detectFromKnownSites() {
    const hostname = window.location.hostname;
    const results = [];

    // Helper to safely select multiple images
    const extractFromSelectors = (imgSelector, titleSelector) => {
        const imgs = document.querySelectorAll(imgSelector);
        const titles = titleSelector ? document.querySelectorAll(titleSelector) : [];
        
        imgs.forEach((img, i) => {
            const url = img.src || img.dataset.oldHires || img.dataset.aDynamicImage;
            if (url) {
                const title = (titles[i] && titles[i].textContent) ? titles[i].textContent.trim() : null;
                results.push({ imageUrl: url, title: title });
            }
        });
    };

    if (hostname.includes('amazon')) {
        // Main + Thumbnails
        extractFromSelectors('#landingImage, #imgBlkFront, #main-image, #altImages img');
    }
    else if (hostname.includes('flipkart')) {
        extractFromSelectors('img._396cs4, img._2r_T1I, div._3kidJX img');
    }
    else if (hostname.includes('myntra')) {
        extractFromSelectors('.image-grid-image img, .image-grid-imageContainer img');
    }
    else if (hostname.includes('hm.com') || hostname.includes('h&m')) {
        extractFromSelectors('.product-detail-main-image img, .product-image img, .mini-slider img');
    }
    else if (hostname.includes('zara')) {
        extractFromSelectors('.media-image img, .product-detail-image img, .product-grid-product__image img');
    }
    
    return results;
}


/**
 * Heuristic: find all large visible images that could be products.
 */
function findAllLargeImages() {
    return Array.from(document.querySelectorAll('img'))
        .filter(img => {
            const rect = img.getBoundingClientRect();
            const src = img.src || '';
            
            // Must be large enough to be a product image (e.g., gallery thumbs or main image)
            if (rect.width < 150 || rect.height < 150) return false;
            // Filter out common non-product patterns
            if (src.includes('logo') || src.includes('banner') || src.includes('sprite')) return false;
            if (src.includes('data:image/svg')) return false;
            
            return true;
        })
        .map(img => {
            return {
                imageUrl: img.src,
                title: img.alt || null
            }
        });
}


/**
 * Clean up a page title for display.
 */
function cleanTitle(raw) {
    if (!raw) return 'Product';
    return raw
        .split('|')[0]
        .split(' - ')[0]
        .split('–')[0]
        .split(':')[0]
        .trim()
        .substring(0, 80);
}
