# Technology Stack & Architecture

## 1. Chrome Extension (Frontend)
The user interface and web-scraping component of the project.
- **Languages**: HTML5, Vanilla JavaScript, CSS3
- **Framework**: None (Vanilla JS is lightweight and sufficient for a Chrome Extension popup and content scripts). We will avoid heavy frameworks to keep the extension fast.
- **Design/Styling**: Custom CSS prioritizing modern, rich aesthetics (glassmorphism, vibrant colors, smooth micro-animations).
- **Key Components**:
  - `manifest.json`: Manifest V3 configuration.
  - `popup.html` / `popup.js`: The main user interface when the extension icon is clicked.
  - `content.js`: Injected into shopping sites to detect product images and details.
  - `background.js`: Service worker to handle API requests to the backend securely.

## 2. Backend (API Service)
The intermediary layer that manages data and communicates with the AI models.
- **Framework**: Python with FastAPI.
- **Why FastAPI?**: It's incredibly fast, supports asynchronous requests (crucial for waiting on AI model generation), and automatically generates API documentation (Swagger UI).
- **Database**: SQLite (via SQLAlchemy ORM).
  - Used for storing user profiles (paths to their photos) and metadata. SQLite is chosen for simplicity and ease of setup for an internship project.
- **Image Storage**: Local file system (or optionally AWS S3 if deployed).

## 3. AI & Image Processing
The core intelligence generating the virtual try-on images.
- **Model Provider**: Replicate API (or similar providers like Fashn.ai).
- **Model Architecture**: IDM-VTON (Improving Diffusion Models for Authentic Virtual Try-on in the Wild) or similar open-source models available via API.
- **Why an API?**: Running stable diffusion/try-on models locally requires massive GPU resources. Using a cloud API ensures the extension works for any user regardless of their hardware.

## System Architecture Flow
1. **Scraping**: `content.js` identifies a product image on a store page and sends the URL to `popup.js`.
2. **User Action**: The user clicks "Try On" in the popup.
3. **API Request**: The extension sends a request to the FastAPI backend containing the product image URL and the user's ID.
4. **AI Trigger**: The backend fetches the user's profile picture from the database and sends both the user image and product image to the AI Model API.
5. **Result**: The AI model returns the generated image. The backend saves a record and forwards the image back to the Chrome Extension.
6. **Display**: The extension displays the generated "Try On" result to the user.
