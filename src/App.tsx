import React, { useState, useRef, useEffect } from 'react';
import { Stage, Layer, Image as KonvaImage, Circle, RegularPolygon, Arrow, Line } from 'react-konva';
import useImage from 'use-image';
import { Download, Upload, Circle as CircleIcon, Triangle, Minus, ArrowRight, MousePointer2, Trash2, Target, Play, Pause } from 'lucide-react';
import Konva from 'konva';
import './index.css';

declare const cv: any;

type Tool = 'select' | 'offense' | 'defense' | 'route' | 'block' | 'ai_track';

type Element = {
  id: string;
  type: Tool | 'tracking_path';
  x: number;
  y: number;
  points?: number[]; // For lines/arrows/paths
};

function App() {
  const [tool, setTool] = useState<Tool>('select');
  const [elements, setElements] = useState<Element[]>([]);
  
  const [mediaSrc, setMediaSrc] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null);
  const [image] = useImage(mediaType === 'image' ? (mediaSrc || '') : '');
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const imageNodeRef = useRef<any>(null);

  const stageRef = useRef<any>(null);
  const isDrawing = useRef(false);

  // Resize canvas to fit window
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });
  const containerRef = useRef<HTMLDivElement>(null);

  // AI Tracking state
  const trackingDataRef = useRef<{
    active: boolean;
    path: number[];
    oldGray: any;
    p0: any;
    cap: any;
    elementId: string;
  }>({ active: false, path: [], oldGray: null, p0: null, cap: null, elementId: '' });

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setStageSize({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight,
        });
      }
    };
    window.addEventListener('resize', updateSize);
    updateSize();
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Update canvas with video frames
  useEffect(() => {
    if (mediaType === 'video' && videoRef.current && isVideoLoaded) {
      const anim = new Konva.Animation(() => {
        // Redraw the layer containing the video image
      }, imageNodeRef.current?.getLayer());
      
      if (isPlaying) {
        anim.start();
        // Setup OpenCV VideoCapture if not done
        if (!trackingDataRef.current.cap) {
            try {
                trackingDataRef.current.cap = new cv.VideoCapture(videoRef.current);
            } catch (e) {
                console.warn("OpenCV VideoCapture error", e);
            }
        }
      } else {
        anim.stop();
      }
      return () => { anim.stop(); };
    }
  }, [mediaType, isPlaying, isVideoLoaded]);

  // AI Tracking Loop
  useEffect(() => {
    let animationFrameId: number;

    const processFrame = () => {
      const tData = trackingDataRef.current;
      if (tData.active && isPlaying && videoRef.current && tData.cap) {
        try {
          const video = videoRef.current;
          // Only process if we have video dimensions
          if (video.videoWidth > 0 && video.videoHeight > 0) {
            const frame = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC4);
            tData.cap.read(frame);

            // Scale factor between video actual size and canvas size
            const scaleX = video.videoWidth / (stageSize.width - 64);
            const scaleY = video.videoHeight / (stageSize.height - 64);

            const frameGray = new cv.Mat();
            cv.cvtColor(frame, frameGray, cv.COLOR_RGBA2GRAY);

            const p1 = new cv.Mat();
            const st = new cv.Mat();
            const err = new cv.Mat();
            const winSize = new cv.Size(15, 15);
            const maxLevel = 2;
            const criteria = new cv.TermCriteria(cv.TERM_CRITERIA_EPS | cv.TERM_CRITERIA_COUNT, 10, 0.03);

            cv.calcOpticalFlowPyrLK(tData.oldGray, frameGray, tData.p0, p1, st, err, winSize, maxLevel, criteria);

            if (st.data[0] === 1) {
              const newX = p1.data32F[0];
              const newY = p1.data32F[1];

              // Add to path (scale back to canvas coordinates)
              tData.path.push(newX / scaleX, newY / scaleY);

              // Update state to render the path
              setElements(prev => {
                const elIndex = prev.findIndex(el => el.id === tData.elementId);
                if (elIndex === -1) return prev;
                const newEls = [...prev];
                newEls[elIndex] = {
                    ...newEls[elIndex],
                    points: [...tData.path]
                };
                return newEls;
              });

              // Prepare for next frame
              tData.oldGray.delete();
              tData.oldGray = frameGray.clone();
              tData.p0.data32F[0] = newX;
              tData.p0.data32F[1] = newY;
            } else {
              // Lost tracking
              tData.active = false;
              console.log("Lost tracking");
            }

            frame.delete();
            frameGray.delete();
            p1.delete();
            st.delete();
            err.delete();
          }
        } catch (error) {
          console.error("Tracking error:", error);
          tData.active = false;
        }
      }
      animationFrameId = requestAnimationFrame(processFrame);
    };

    if (isPlaying) {
      animationFrameId = requestAnimationFrame(processFrame);
    }

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isPlaying, stageSize]);

  const handleMediaUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type.startsWith('video/')) {
        setMediaType('video');
        const url = URL.createObjectURL(file);
        setMediaSrc(url);
        if (videoRef.current) {
            videoRef.current.src = url;
            videoRef.current.load();
        }
      } else {
        setMediaType('image');
        const reader = new FileReader();
        reader.onload = () => {
          setMediaSrc(reader.result as string);
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const handleMouseDown = (e: any) => {
    if (tool === 'select') return;
    
    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();
    
    if (tool === 'ai_track') {
        if (mediaType !== 'video' || !videoRef.current || !isVideoLoaded) {
            alert('動画を読み込んでください。');
            return;
        }
        
        // Setup initial point for tracking
        const video = videoRef.current;
        if (typeof cv === 'undefined') {
            alert('OpenCV.jsがまだ読み込まれていません。数秒お待ちください。');
            return;
        }

        try {
            const scaleX = video.videoWidth / (stageSize.width - 64);
            const scaleY = video.videoHeight / (stageSize.height - 64);
            
            const frame = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC4);
            trackingDataRef.current.cap = new cv.VideoCapture(video);
            trackingDataRef.current.cap.read(frame);
            
            const oldGray = new cv.Mat();
            cv.cvtColor(frame, oldGray, cv.COLOR_RGBA2GRAY);
            
            const p0 = new cv.Mat(1, 1, cv.CV_32FC2);
            // Convert canvas pos to video real pixel pos
            p0.data32F[0] = pos.x * scaleX;
            p0.data32F[1] = pos.y * scaleY;

            const elementId = Date.now().toString();

            trackingDataRef.current = {
                active: true,
                path: [pos.x, pos.y],
                oldGray: oldGray,
                p0: p0,
                cap: trackingDataRef.current.cap,
                elementId: elementId
            };

            const newElement: Element = {
                id: elementId,
                type: 'tracking_path',
                x: 0,
                y: 0,
                points: [pos.x, pos.y]
            };
            setElements([...elements, newElement]);
            setIsPlaying(true);
            video.play();
            frame.delete();

        } catch(err) {
            console.error("Failed to init tracking", err);
        }
        return;
    }

    if (tool === 'offense' || tool === 'defense') {
      const newElement: Element = {
        id: Date.now().toString(),
        type: tool,
        x: pos.x,
        y: pos.y,
      };
      setElements([...elements, newElement]);
    } else if (tool === 'route' || tool === 'block') {
      isDrawing.current = true;
      const newElement: Element = {
        id: Date.now().toString(),
        type: tool,
        x: 0,
        y: 0,
        points: [pos.x, pos.y, pos.x, pos.y],
      };
      setElements([...elements, newElement]);
    }
  };

  const handleMouseMove = (e: any) => {
    if (!isDrawing.current) return;
    if (tool !== 'route' && tool !== 'block') return;

    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();

    let lastElement = elements[elements.length - 1];
    if (lastElement && lastElement.points) {
      const updatedElement = {
        ...lastElement,
        points: [lastElement.points[0], lastElement.points[1], pos.x, pos.y],
      };
      setElements(elements.slice(0, -1).concat(updatedElement));
    }
  };

  const handleMouseUp = () => {
    isDrawing.current = false;
  };

  const clearCanvas = () => {
    setElements([]);
    trackingDataRef.current.active = false;
  };

  const exportCanvas = () => {
    if (!stageRef.current) return;
    const uri = stageRef.current.toDataURL({ pixelRatio: 2 });
    const link = document.createElement('a');
    link.download = 'assignment.png';
    link.href = uri;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const togglePlay = () => {
    if (videoRef.current) {
        if (isPlaying) {
            videoRef.current.pause();
            trackingDataRef.current.active = false;
        } else {
            videoRef.current.play();
        }
        setIsPlaying(!isPlaying);
    }
  };

  return (
    <div className="app-container">
      {/* Hidden Video Element */}
      <video
        ref={videoRef}
        style={{ display: 'none' }}
        onLoadedData={() => setIsVideoLoaded(true)}
        onEnded={() => {
            setIsPlaying(false);
            trackingDataRef.current.active = false;
        }}
        muted
        playsInline
      />

      {/* Toolbar */}
      <div className="toolbar">
        <div className="app-title">
          <span>🏈</span>
          Football Analyzer
        </div>

        <div className="section-title">File Operations</div>
        <label className="action-btn secondary">
          <Upload size={18} />
          画像/動画を読み込む
          <input type="file" className="hidden-input" accept="image/*,video/*" onChange={handleMediaUpload} />
        </label>
        
        <button className="action-btn" onClick={exportCanvas}>
          <Download size={18} />
          画像を保存
        </button>

        {mediaType === 'video' && (
             <div style={{ marginTop: '1rem', background: '#f3f4f6', padding: '0.5rem', borderRadius: '8px', display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                 <button className="action-btn secondary" style={{ margin: 0, padding: '0.5rem' }} onClick={togglePlay}>
                     {isPlaying ? <Pause size={18} /> : <Play size={18} />}
                 </button>
             </div>
        )}

        <div className="section-title">Tools</div>
        <button className={`tool-btn ${tool === 'select' ? 'active' : ''}`} onClick={() => setTool('select')}>
          <MousePointer2 size={18} /> 選択・移動
        </button>
        <button className={`tool-btn ${tool === 'offense' ? 'active' : ''}`} onClick={() => setTool('offense')}>
          <CircleIcon size={18} /> オフェンス (O)
        </button>
        <button className={`tool-btn ${tool === 'defense' ? 'active' : ''}`} onClick={() => setTool('defense')}>
          <Triangle size={18} /> ディフェンス (△)
        </button>
        <button className={`tool-btn ${tool === 'route' ? 'active' : ''}`} onClick={() => setTool('route')}>
          <ArrowRight size={18} /> ルート (矢印)
        </button>
        <button className={`tool-btn ${tool === 'block' ? 'active' : ''}`} onClick={() => setTool('block')}>
          <Minus size={18} /> ブロック (線)
        </button>

        <div className="section-title" style={{ marginTop: '1.5rem', color: '#8b5cf6' }}>AI Analysis</div>
        <button className={`tool-btn ${tool === 'ai_track' ? 'active' : ''}`} style={tool === 'ai_track' ? { backgroundColor: '#8b5cf6', borderColor: '#8b5cf6', color: 'white' } : { borderColor: '#c4b5fd' }} onClick={() => setTool('ai_track')}>
          <Target size={18} /> 選手を追跡する
        </button>

        <div style={{ flexGrow: 1 }}></div>

        <button className="action-btn secondary" onClick={clearCanvas} style={{ color: '#ef4444', borderColor: '#fca5a5' }}>
          <Trash2 size={18} />
          すべて消去
        </button>
      </div>

      {/* Canvas Area */}
      <div className="canvas-area" ref={containerRef}>
        <div className="canvas-wrapper">
          <Stage
            width={stageSize.width - 64} // padding
            height={stageSize.height - 64}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            ref={stageRef}
          >
            <Layer>
              {mediaType === 'image' && image && (
                <KonvaImage
                  image={image}
                  width={stageSize.width - 64}
                  height={stageSize.height - 64}
                />
              )}
              {mediaType === 'video' && videoRef.current && isVideoLoaded && (
                <KonvaImage
                  image={videoRef.current as unknown as HTMLImageElement}
                  ref={imageNodeRef}
                  width={stageSize.width - 64}
                  height={stageSize.height - 64}
                />
              )}
            </Layer>
            <Layer>
              {elements.map((el) => {
                const isDraggable = tool === 'select';
                if (el.type === 'offense') {
                  return (
                    <Circle
                      key={el.id}
                      x={el.x}
                      y={el.y}
                      radius={15}
                      stroke="#2563eb"
                      strokeWidth={3}
                      fill="#eff6ff"
                      draggable={isDraggable}
                    />
                  );
                } else if (el.type === 'defense') {
                  return (
                    <RegularPolygon
                      key={el.id}
                      x={el.x}
                      y={el.y}
                      sides={3}
                      radius={18}
                      stroke="#dc2626"
                      strokeWidth={3}
                      fill="#fef2f2"
                      draggable={isDraggable}
                    />
                  );
                } else if (el.type === 'route' && el.points) {
                  return (
                    <Arrow
                      key={el.id}
                      points={el.points}
                      stroke="#f59e0b"
                      strokeWidth={4}
                      fill="#f59e0b"
                      pointerLength={10}
                      pointerWidth={10}
                      draggable={isDraggable}
                    />
                  );
                } else if (el.type === 'block' && el.points) {
                  return (
                    <Line
                      key={el.id}
                      points={el.points}
                      stroke="#16a34a"
                      strokeWidth={4}
                      lineCap="square"
                      draggable={isDraggable}
                    />
                  );
                } else if (el.type === 'tracking_path' && el.points && el.points.length > 0) {
                    return (
                        <React.Fragment key={el.id}>
                            <Circle
                                x={el.points[0]}
                                y={el.points[1]}
                                radius={15}
                                stroke="#8b5cf6"
                                strokeWidth={3}
                                fill="#ede9fe"
                                draggable={isDraggable}
                            />
                            {el.points.length > 2 && (
                                <Arrow
                                    points={el.points}
                                    stroke="#8b5cf6"
                                    strokeWidth={4}
                                    fill="#8b5cf6"
                                    tension={0.5}
                                    pointerLength={10}
                                    pointerWidth={10}
                                    draggable={isDraggable}
                                />
                            )}
                        </React.Fragment>
                    )
                }
                return null;
              })}
            </Layer>
          </Stage>
        </div>
      </div>
    </div>
  );
}

export default App;
