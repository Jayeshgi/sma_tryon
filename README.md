# TryOn AI — Universal Virtual Fitting Room 🛍️✨

TryOn AI is a powerful Google Chrome Extension that transforms any e-commerce website (Amazon, Myntra, Flipkart, Zara, H&M) into a personalized virtual fitting room. 

Unlike standard e-commerce tools, TryOn AI utilizes a **Dual-Architecture AI Pipeline** to handle both clothing and accessories seamlessly, providing a state-of-the-art consumer experience right in the browser.

---

## 🌟 Key Features

### 1. 👕 Virtual Try-On (For Clothing)
When a user selects a clothing item (shirts, tops, dresses, jackets), the extension leverages the **FASHN-VTON 1.5** model via Hugging Face.
- **Advanced Warping:** The neural network mathematically maps the fabric, patterns, and stitching of the product onto the user's body.
- **Identity Preservation:** Perfectly maintains the user's facial features and body shape.
- **Poses Wardrobe:** Users can upload up to 4 different poses (front, side, back) and instantly swap between them for a 360-degree understanding of the fit.

### 2. 🕶️ AR Mirror (For Accessories)
When a user selects an accessory (glasses, sunglasses), the UI dynamically adapts and launches the **AR Mirror**.
- **Real-Time Tracking:** Uses **Google MediaPipe Face Mesh** to detect 468 facial landmarks locally in the browser.
- **Lenskart-Style Experience:** Dynamically calculates pupillary distance and head rotation to pin 2D product images onto the user's face in real-time.
- **Zero API Costs:** Runs entirely client-side via WebAssembly for zero latency and infinite free usage.

### 3. 🧠 Smart Auto-Categorization
The extension features a smart UI that automatically categorizes scraped products based on their titles. It intelligently hides the Virtual Try-On button for accessories (preventing AI hallucinations) and hides the AR Mirror for clothing.

### 4. 🛒 Universal Scraping
Works out-of-the-box on major retailers. The content script scans the DOM and aggregates all product images from carousels and grids, allowing users to select exactly which variation they want to try.

---

## 🛠️ Technology Stack

- **Frontend:** Vanilla JavaScript, HTML5, CSS3 (Glassmorphism UI)
- **Extension:** Chrome Manifest V3
- **AR Engine:** Google MediaPipe (`@mediapipe/face_mesh`)
- **Backend:** Python, FastAPI
- **AI Model:** FASHN-VTON 1.5 (via `gradio_client`)

---

## 🚀 Installation & Setup

### 1. Start the Backend Server
The FastAPI backend acts as a secure bridge for the Hugging Face AI generation and serves the AR Mirror UI to bypass strict extension security policies.

1. Navigate to the `backend` directory:
   ```bash
   cd backend
   ```
2. Create and activate a Python virtual environment:
   ```bash
   python -m venv .venv
   .venv\Scripts\activate  # Windows
   # source .venv/bin/activate # Mac/Linux
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Set up your API token:
   - Rename `.env.example` to `.env`.
   - Add your free Hugging Face token (`HF_TOKEN=hf_...`).
5. Run the server:
   ```bash
   python main.py
   ```
   *The server will start on `http://localhost:8000`.*

### 2. Install the Chrome Extension
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** (toggle in the top right corner).
3. Click **Load unpacked**.
4. Select the `extension` folder from this repository.
5. Pin the TryOn AI extension to your toolbar!

---

## 🎮 How to Use

1. Open any product page on Amazon, Myntra, or Flipkart.
2. Click the TryOn AI extension icon.
3. Choose a product from the scraped grid.
4. Go to the **Profile** tab and upload a full-body photo (for clothes) or just use the camera for the AR Mirror.
5. Click **Virtual Try-On** (for clothes) or **AR Mirror** (for glasses)!

---
*Built as an internship project demonstrating full-stack development, applied machine learning integration, and browser extension architecture.*
