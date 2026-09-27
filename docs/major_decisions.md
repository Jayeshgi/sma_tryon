# Major Decisions

This document outlines the key technical and design decisions made for the AI Virtual Try-On Chrome Extension.

## 1. Extension Architecture: Vanilla JS vs. Frameworks
- **Decision**: Use Vanilla JS, HTML, and CSS for the Chrome Extension.
- **Rationale**: While React or Vue are powerful, Chrome Extensions (especially Manifest V3) have specific lifecycles. A simple popup and content script can be built very efficiently without a build step (like Webpack/Vite). This reduces complexity, makes the codebase easier to understand for a student project, and ensures maximum performance.

## 2. Backend Framework: Python FastAPI
- **Decision**: Use Python with FastAPI instead of Node.js/Express.
- **Rationale**: Virtual Try-On is an AI-heavy domain. Python is the native language for AI, making it much easier to integrate with AI SDKs, process images (using Pillow/OpenCV), and potentially run local models in the future. FastAPI provides async capabilities which are essential when waiting 10-30 seconds for an AI model to generate an image.

## 3. AI Integration: Cloud API over Local Execution
- **Decision**: Utilize a cloud-based AI API (like Replicate/IDM-VTON) rather than bundling a local AI model.
- **Rationale**: 
  - Generative AI models for Virtual Try-On require high-end GPUs with substantial VRAM. 
  - Expecting end-users to have this hardware is unrealistic. 
  - Using an API offloads the computation, keeping the extension lightweight and universally accessible.

## 4. Product Detection Strategy
- **Decision**: Use heuristic DOM parsing in `content.js` to identify main product images.
- **Rationale**: Shopping websites have vastly different DOM structures. Instead of hardcoding selectors for specific sites (which breaks easily), the script will look for common patterns: e.g., large images, Open Graph tags (`og:image`), and structured JSON-LD data which are standardized across e-commerce platforms.

## 5. Security & Privacy
- **Decision**: API keys for the AI service will be stored *only* on the backend, never in the Chrome Extension.
- **Rationale**: If the Replicate API key is bundled in the Chrome extension code, anyone can inspect the extension and steal it. The extension must communicate through our FastAPI backend, which acts as a secure proxy.
- **Decision**: User images will be stored locally on the backend server for this prototype.

## 6. UI/UX Design Aesthetics
- **Decision**: Implement a modern, premium "Glassmorphism" UI with smooth transitions.
- **Rationale**: As requested by the project constraints, aesthetics are critical. A premium UI builds trust, especially when handling user photos. We will avoid generic layouts in favor of curated color palettes, hover effects, and loading animations.
