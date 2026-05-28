import { useState, useRef, useCallback } from "react";

// Simple circular crop using canvas — no external deps
export default function ImageCropper({ src, onDone, onCancel }) {
  const canvasRef = useRef(null);
  const [drag, setDrag] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const imgRef = useRef(null);
  const startRef = useRef(null);
  const CANVAS = 240;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, CANVAS, CANVAS);
    const iw = img.naturalWidth * scale;
    const ih = img.naturalHeight * scale;
    ctx.drawImage(img, offset.x, offset.y, iw, ih);
    // dim outside circle
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.beginPath();
    ctx.rect(0, 0, CANVAS, CANVAS);
    ctx.arc(CANVAS / 2, CANVAS / 2, CANVAS / 2, 0, Math.PI * 2, true);
    ctx.fill();
    // circle border
    ctx.strokeStyle = "#d4537e";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(CANVAS / 2, CANVAS / 2, CANVAS / 2 - 1, 0, Math.PI * 2);
    ctx.stroke();
  }, [offset, scale]);

  const onImgLoad = () => {
    const img = imgRef.current;
    const s = Math.max(CANVAS / img.naturalWidth, CANVAS / img.naturalHeight);
    setScale(s);
    setOffset({ x: (CANVAS - img.naturalWidth * s) / 2, y: (CANVAS - img.naturalHeight * s) / 2 });
  };

  // redraw whenever state changes
  const [, forceRender] = useState(0);
  const schedDraw = () => { forceRender(v => v + 1); requestAnimationFrame(draw); };

  const onMouseDown = (e) => {
    setDrag(true);
    startRef.current = { mx: e.clientX, my: e.clientY, ox: offset.x, oy: offset.y };
    e.preventDefault();
  };
  const onMouseMove = (e) => {
    if (!drag || !startRef.current) return;
    setOffset({ x: startRef.current.ox + e.clientX - startRef.current.mx, y: startRef.current.oy + e.clientY - startRef.current.my });
    schedDraw();
  };
  const onMouseUp = () => setDrag(false);

  const onTouchStart = (e) => {
    setDrag(true);
    const t = e.touches[0];
    startRef.current = { mx: t.clientX, my: t.clientY, ox: offset.x, oy: offset.y };
  };
  const onTouchMove = (e) => {
    if (!drag || !startRef.current) return;
    const t = e.touches[0];
    setOffset({ x: startRef.current.ox + t.clientX - startRef.current.mx, y: startRef.current.oy + t.clientY - startRef.current.my });
    schedDraw();
    e.preventDefault();
  };

  const onWheel = (e) => {
    const delta = e.deltaY > 0 ? 0.93 : 1.07;
    setScale(s => Math.max(0.2, Math.min(8, s * delta)));
    schedDraw();
    e.preventDefault();
  };

  const confirm = () => {
    const canvas = canvasRef.current;
    // Output circular crop
    const out = document.createElement("canvas");
    out.width = CANVAS; out.height = CANVAS;
    const ctx = out.getContext("2d");
    ctx.beginPath();
    ctx.arc(CANVAS / 2, CANVAS / 2, CANVAS / 2, 0, Math.PI * 2);
    ctx.clip();
    const img = imgRef.current;
    ctx.drawImage(img, offset.x, offset.y, img.naturalWidth * scale, img.naturalHeight * scale);
    onDone(out.toDataURL("image/jpeg", 0.9));
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "white", borderRadius: 16, padding: 24, maxWidth: 320, width: "90%", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: "#2c1020" }}>Crop your photo</h3>
        <p style={{ fontSize: 12, color: "#a08090", textAlign: "center" }}>Drag to reposition · scroll to zoom</p>

        <img ref={imgRef} src={src} onLoad={() => { onImgLoad(); requestAnimationFrame(draw); }} style={{ display: "none" }} alt="" />

        <canvas
          ref={canvasRef} width={CANVAS} height={CANVAS}
          style={{ borderRadius: "50%", cursor: drag ? "grabbing" : "grab", touchAction: "none" }}
          onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
          onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onMouseUp}
          onWheel={onWheel}
        />

        <input type="range" min="0.3" max="4" step="0.01"
          value={scale}
          onChange={e => { setScale(parseFloat(e.target.value)); schedDraw(); }}
          style={{ width: "100%" }}
        />

        <div style={{ display: "flex", gap: 10, width: "100%" }}>
          <button onClick={onCancel} style={{ flex: 1, padding: "9px", borderRadius: 10, border: "1.5px solid #e0c8d0", background: "transparent", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>Cancel</button>
          <button onClick={confirm} style={{ flex: 1, padding: "9px", borderRadius: 10, border: "none", background: "#d4537e", color: "white", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>Use photo</button>
        </div>
      </div>
    </div>
  );
}
