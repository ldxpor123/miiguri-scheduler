import { useState, useRef, useEffect } from "react";

export default function ImageCropper({ src, onDone, onCancel }) {
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [imgLoaded, setImgLoaded] = useState(false);
  const [initScale, setInitScale] = useState(1);
  const dragRef = useRef(null);
  const CANVAS = 260;

  useEffect(() => {
    const img = new window.Image();
    img.onload = () => {
      imgRef.current = img;
      const s = Math.max(CANVAS / img.naturalWidth, CANVAS / img.naturalHeight);
      setInitScale(s);
      setScale(s);
      setOffset({
        x: (CANVAS - img.naturalWidth * s) / 2,
        y: (CANVAS - img.naturalHeight * s) / 2,
      });
      setImgLoaded(true);
    };
    img.src = src;
  }, [src]);

  useEffect(() => {
    if (!imgLoaded) return;
    draw();
  });

  const draw = () => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, CANVAS, CANVAS);
    ctx.drawImage(img, offset.x, offset.y, img.naturalWidth * scale, img.naturalHeight * scale);
    // dim outside circle
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.beginPath();
    ctx.rect(0, 0, CANVAS, CANVAS);
    ctx.arc(CANVAS / 2, CANVAS / 2, CANVAS / 2, 0, Math.PI * 2, true);
    ctx.fill();
    ctx.restore();
    // circle border
    ctx.strokeStyle = "#d4537e";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(CANVAS / 2, CANVAS / 2, CANVAS / 2 - 1, 0, Math.PI * 2);
    ctx.stroke();
  };

  const getPos = (e) => {
    if (e.touches) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
  };

  const onDragStart = (e) => {
    const pos = getPos(e);
    dragRef.current = { startX: pos.x, startY: pos.y, ox: offset.x, oy: offset.y };
    e.preventDefault();
  };

  const onDragMove = (e) => {
    if (!dragRef.current) return;
    const pos = getPos(e);
    setOffset({
      x: dragRef.current.ox + pos.x - dragRef.current.startX,
      y: dragRef.current.oy + pos.y - dragRef.current.startY,
    });
    e.preventDefault();
  };

  const onDragEnd = () => { dragRef.current = null; };

  const onWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.93 : 1.07;
    setScale(s => Math.max(initScale * 0.5, Math.min(initScale * 8, s * delta)));
  };

  const confirm = () => {
    const img = imgRef.current;
    if (!img) return;
    const out = document.createElement("canvas");
    out.width = CANVAS; out.height = CANVAS;
    const ctx = out.getContext("2d");
    ctx.beginPath();
    ctx.arc(CANVAS / 2, CANVAS / 2, CANVAS / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, offset.x, offset.y, img.naturalWidth * scale, img.naturalHeight * scale);
    onDone(out.toDataURL("image/jpeg", 0.92));
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "white", borderRadius: 18, padding: 24, width: "100%", maxWidth: 340, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: "#2c1020", margin: 0 }}>Crop your photo</h3>
        <p style={{ fontSize: 12, color: "#a08090", textAlign: "center", margin: 0 }}>Drag to reposition · pinch or slide to zoom</p>

        <div style={{ position: "relative", width: CANVAS, height: CANVAS, borderRadius: "50%", overflow: "hidden", touchAction: "none" }}>
          <canvas
            ref={canvasRef}
            width={CANVAS}
            height={CANVAS}
            style={{ display: "block", cursor: dragRef.current ? "grabbing" : "grab", touchAction: "none", userSelect: "none" }}
            onMouseDown={onDragStart}
            onMouseMove={onDragMove}
            onMouseUp={onDragEnd}
            onMouseLeave={onDragEnd}
            onTouchStart={onDragStart}
            onTouchMove={onDragMove}
            onTouchEnd={onDragEnd}
            onWheel={onWheel}
          />
        </div>

        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 11, color: "#a08090" }}>Zoom</label>
          <input
            type="range"
            min={initScale * 0.5}
            max={initScale * 8}
            step={0.01}
            value={scale}
            onChange={e => setScale(parseFloat(e.target.value))}
            style={{ width: "100%", accentColor: "#d4537e" }}
          />
        </div>

        <div style={{ display: "flex", gap: 10, width: "100%" }}>
          <button onClick={onCancel} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1.5px solid #e0c8d0", background: "transparent", cursor: "pointer", fontSize: 14, fontFamily: "inherit" }}>Cancel</button>
          <button onClick={confirm} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "#d4537e", color: "white", cursor: "pointer", fontSize: 14, fontWeight: 600, fontFamily: "inherit" }}>Use photo</button>
        </div>
      </div>
    </div>
  );
}
