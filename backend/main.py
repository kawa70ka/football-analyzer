from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import cv2
import numpy as np
from ultralytics import YOLO
import tempfile
import os

app = FastAPI()

# Allow CORS for local frontend development and GitHub Pages
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins for testing
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load YOLO model (will download yolov8n.pt on first run)
model = YOLO('yolov8n.pt')

def is_white_uniform(crop_img):
    """
    Check if the cropped image of a player contains predominantly white pixels
    using HSV color space.
    """
    if crop_img.size == 0:
        return False
    
    hsv = cv2.cvtColor(crop_img, cv2.COLOR_BGR2HSV)
    # Define range for white color in HSV
    lower_white = np.array([0, 0, 200])
    upper_white = np.array([180, 30, 255])
    
    mask = cv2.inRange(hsv, lower_white, upper_white)
    white_ratio = cv2.countNonZero(mask) / (crop_img.shape[0] * crop_img.shape[1])
    
    # If more than 20% of the bounding box is white, consider it a white uniform
    return white_ratio > 0.20

@app.post("/analyze")
async def analyze_video(file: UploadFile = File(...)):
    # Save uploaded video to a temporary file
    temp_fd, temp_path = tempfile.mkstemp(suffix=".mp4")
    try:
        with os.fdopen(temp_fd, "wb") as f:
            f.write(await file.read())

        cap = cv2.VideoCapture(temp_path)
        if not cap.isOpened():
            return {"error": "Failed to open video file."}

        fps = cap.get(cv2.CAP_PROP_FPS)
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        
        # We will process a limited number of frames for testing (e.g., 60 frames = 2 seconds)
        # To process full video, remove max_frames limit.
        max_frames = 60 
        frame_count = 0
        
        # Results structure: { player_id: [{"x": x, "y": y, "frame": f}] }
        tracking_results = {}
        
        # Simple tracking using DeepSORT or ByteTrack is built into ultralytics YOLO
        # We will use YOLO's built-in tracker: model.track()
        
        # Run tracking on the video
        results = model.track(source=temp_path, persist=True, tracker="botsort.yaml", classes=[0]) # class 0 is person
        
        for frame_idx, r in enumerate(results):
            if frame_idx >= max_frames:
                break
                
            img = r.orig_img
            boxes = r.boxes
            
            if boxes.id is not None:
                ids = boxes.id.cpu().numpy().astype(int)
                xyxy = boxes.xyxy.cpu().numpy()
                
                for idx, track_id in enumerate(ids):
                    x1, y1, x2, y2 = map(int, xyxy[idx])
                    
                    # Ensure coordinates are within image bounds
                    x1 = max(0, x1)
                    y1 = max(0, y1)
                    x2 = min(width, x2)
                    y2 = min(height, y2)
                    
                    # Check if the player is wearing white
                    # To optimize, we could check this only once per track_id, but doing it every frame for now
                    crop = img[y1:y2, x1:x2]
                    if is_white_uniform(crop):
                        # Calculate center point for tracking path
                        cx = int((x1 + x2) / 2)
                        cy = int(y2) # Use bottom center (feet) for path
                        
                        if str(track_id) not in tracking_results:
                            tracking_results[str(track_id)] = []
                            
                        tracking_results[str(track_id)].append({
                            "frame": frame_idx,
                            "x": cx,
                            "y": cy
                        })

    finally:
        # Cleanup temp file
        if os.path.exists(temp_path):
            os.remove(temp_path)

    # Filter to only return paths that are long enough (e.g., tracked for at least 10 frames)
    filtered_results = {k: v for k, v in tracking_results.items() if len(v) > 10}

    return {
        "status": "success",
        "video_info": {"fps": fps, "width": width, "height": height},
        "tracks": filtered_results
    }

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
