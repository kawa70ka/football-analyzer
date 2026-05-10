import React, { useState, useRef, useEffect } from 'react';
import { Stage, Layer, Image as KonvaImage, Circle, RegularPolygon, Arrow, Line } from 'react-konva';
import useImage from 'use-image';
import { Download, Upload, Circle as CircleIcon, Triangle, Minus, ArrowRight, MousePointer2, Trash2 } from 'lucide-react';
import './index.css';

type Tool = 'select' | 'offense' | 'defense' | 'route' | 'block';

type Element = {
  id: string;
  type: Tool;
  x: number;
  y: number;
  points?: number[]; // For lines/arrows
};

function App() {
  const [tool, setTool] = useState<Tool>('select');
  const [elements, setElements] = useState<Element[]>([]);
  const [bgImageSrc, setBgImageSrc] = useState<string | null>(null);
  const [image] = useImage(bgImageSrc || '');
  const stageRef = useRef<any>(null);
  const isDrawing = useRef(false);

  // Resize canvas to fit window
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });
  const containerRef = useRef<HTMLDivElement>(null);

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

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setBgImageSrc(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleMouseDown = (e: any) => {
    if (tool === 'select') return;
    
    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();
    
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

  return (
    <div className="app-container">
      {/* Toolbar */}
      <div className="toolbar">
        <div className="app-title">
          <span>🏈</span>
          Football Analyzer
        </div>

        <div className="section-title">File Operations</div>
        <label className="action-btn secondary">
          <Upload size={18} />
          画像を読み込む
          <input type="file" className="hidden-input" accept="image/*" onChange={handleImageUpload} />
        </label>
        
        <button className="action-btn" onClick={exportCanvas}>
          <Download size={18} />
          画像を保存
        </button>

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
              {bgImageSrc && image && (
                <KonvaImage
                  image={image}
                  width={stageSize.width - 64}
                  height={stageSize.height - 64}
                />
              )}
            </Layer>
            <Layer>
              {elements.map((el, i) => {
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
