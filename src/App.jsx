import { useState, useEffect, useRef } from "react";
import "./App.css";
import { MEMBERS, GROUP_LABELS } from "./members.js";
import ImageCropper from "./ImageCropper.jsx";

const MEMBER_COLORS = ["#d4537e","#7f77dd","#1d9e75","#e07b39","#5b9bd5","#c0559a","#4da87c","#d4884f","#7b6bb5","#2a9d8f"];

function getMemberColor(name) {
  let hash = 0;
  for (let c of name) hash = (hash * 31 + c.charCodeAt(0)) % MEMBER_COLORS.length;
  return MEMBER_COLORS[hash];
}
function getInitials(name) {
  const parts = name.split(/[ 　]/);
  return parts.length >= 2 ? parts[0][0] + parts[1][0] : name.slice(0,2);
}
function formatDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en", { year: "numeric", month: "short", day: "numeric" });
}
function memberName(m, lang) { return lang === "ja" ? m.ja : m.en; }
function findMember(enName) {
  for (const g of Object.values(MEMBERS)) { const m = g.find(x => x.en === enName); if (m) return m; }
  return null;
}
function loadState() {
  try {
    return {
      applications: JSON.parse(localStorage.getItem("mng_apps") || "[]"),
      reports: JSON.parse(localStorage.getItem("mng_reports") || "{}"),
      memberPhotos: JSON.parse(localStorage.getItem("mng_member_photos") || "{}"),
      fanProfile: JSON.parse(localStorage.getItem("mng_fan_profile") || '{"name":"Fan","photo":null}'),
      lang: localStorage.getItem("mng_lang") || "en",
      darkMode: localStorage.getItem("mng_dark") === "1",
    };
  } catch { return { applications: [], reports: {}, memberPhotos: {}, fanProfile: { name: "Fan", photo: null }, lang: "en", darkMode: false }; }
}

function Avatar({ name, photo, size = 34, color }) {
  const bg = color || getMemberColor(name);
  if (photo) return <img src={photo} alt={name} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />;
  return (
    <div style={{ width: size, height: size, background: bg, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700, fontSize: size * 0.33, flexShrink: 0, userSelect: "none", fontFamily: "inherit" }}>
      {getInitials(name)}
    </div>
  );
}

// pad to 2 digits
function pad(n) { return String(n).padStart(2, "0"); }

// build ICS content
function buildICS(wonApps, lang) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Miiguri Scheduler//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  wonApps.forEach(a => {
    const memberDisplay = lang === "ja" ? a.memberJa : a.memberEn;
    if (a.time) {
      // parse date + time into UTC (treat as local)
      const [y, mo, dy] = a.date.split("-").map(Number);
      const [hr, mn] = a.time.split(":").map(Number);
      const dtLocal = new Date(y, mo - 1, dy, hr, mn, 0);
      const dtEnd = new Date(dtLocal.getTime() + 75 * 60000); // 1h15m slot
      const fmt = (d) => `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
      lines.push("BEGIN:VEVENT",
        `UID:mng-${a.id}@miiguri`,
        `SUMMARY:Meeting with ${memberDisplay}`,
        `DTSTART;TZID=Asia/Tokyo:${fmt(dtLocal)}`,
        `DTEND;TZID=Asia/Tokyo:${fmt(dtEnd)}`,
        `DESCRIPTION:${GROUP_LABELS[a.group]?.[lang] || a.group} Online MnG - ${a.round}${a.single ? " - " + a.single : ""}`,
        "END:VEVENT");
    } else {
      const dateStr = a.date.replace(/-/g, "");
      lines.push("BEGIN:VEVENT",
        `UID:mng-${a.id}@miiguri`,
        `SUMMARY:Meeting with ${memberDisplay}`,
        `DTSTART;VALUE=DATE:${dateStr}`,
        `DTEND;VALUE=DATE:${dateStr}`,
        `DESCRIPTION:${GROUP_LABELS[a.group]?.[lang] || a.group} Online MnG - ${a.round}${a.single ? " - " + a.single : ""}`,
        "END:VEVENT");
    }
  });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export default function App() {
  const init = loadState();
  const [tab, setTab] = useState("apply");
  const [lang, setLang] = useState(init.lang);
  const [darkMode, setDarkMode] = useState(init.darkMode);
  const [group, setGroup] = useState("sakurazaka");
  const [selectedMember, setSelectedMember] = useState("");
  const [applyDate, setApplyDate] = useState("");
  const [applyRound, setApplyRound] = useState("Part 1");
  const [applyTime, setApplyTime] = useState("");
  const [applySlots, setApplySlots] = useState("1");
  const [applySingle, setApplySingle] = useState("");
  const [applications, setApplications] = useState(init.applications);
  const [reports, setReports] = useState(init.reports);
  const [memberPhotos, setMemberPhotos] = useState(init.memberPhotos);
  const [fanProfile, setFanProfile] = useState(init.fanProfile);
  const [reportKey, setReportKey] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [msgSender, setMsgSender] = useState("fan");
  const [showProfileSettings, setShowProfileSettings] = useState(false);
  const [fanNameInput, setFanNameInput] = useState(init.fanProfile.name);
  const [memberPhotoTarget, setMemberPhotoTarget] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);
  const [cropSrc, setCropSrc] = useState(null);
  const [cropTarget, setCropTarget] = useState(null);
  const [editingIdx, setEditingIdx] = useState(null);
  const [editText, setEditText] = useState("");
  const [showICSModal, setShowICSModal] = useState(false);
  const [icsEmail, setICSEmail] = useState("");

  const chatEndRef = useRef(null);
  const fanPhotoRef = useRef(null);
  const memberPhotoRef = useRef(null);
  const chatExportRef = useRef(null);

  const mn = (m) => memberName(m, lang);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", darkMode ? "dark" : "light");
    try {
      localStorage.setItem("mng_apps", JSON.stringify(applications));
      localStorage.setItem("mng_reports", JSON.stringify(reports));
      localStorage.setItem("mng_member_photos", JSON.stringify(memberPhotos));
      localStorage.setItem("mng_fan_profile", JSON.stringify(fanProfile));
      localStorage.setItem("mng_lang", lang);
      localStorage.setItem("mng_dark", darkMode ? "1" : "0");
    } catch {}
  }, [applications, reports, memberPhotos, fanProfile, lang, darkMode]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [reports, reportKey]);

  const addApplication = () => {
    if (!selectedMember) return alert("Please select a member.");
    if (!applyDate) return alert("Please pick a date.");
    const memberObj = MEMBERS[group].find(m => m.en === selectedMember);
    if (!memberObj) return;
    setApplications(prev => [...prev, { id: Date.now() + Math.random(), memberEn: memberObj.en, memberJa: memberObj.ja, group, date: applyDate, round: applyRound, time: applyTime, slots: applySlots, single: applySingle, won: false }]);
    setSelectedMember("");
  };

  const removeApp = (id) => setApplications(prev => prev.filter(a => a.id !== id));
  const toggleWon = (id) => setApplications(prev => prev.map(a => a.id === id ? { ...a, won: !a.won } : a));
  const wonApps = applications.filter(a => a.won).sort((a, b) => a.date.localeCompare(b.date));

  const [rMember, rDate, rRound, rSlots, rSingle] = reportKey ? reportKey.split("||") : [];
  const rMemberObj = rMember ? findMember(rMember) : null;
  const rMemberDisplay = rMemberObj ? mn(rMemberObj) : rMember;
  const currentMessages = reportKey ? (reports[reportKey] || []) : [];

  const sendMessage = () => {
    if (!reportKey || !chatInput.trim()) return;
    setReports(prev => ({ ...prev, [reportKey]: [...(prev[reportKey] || []), { sender: msgSender, text: chatInput.trim() }] }));
    setChatInput("");
  };

  const deleteMessage = (idx) => {
    setReports(prev => ({ ...prev, [reportKey]: prev[reportKey].filter((_, i) => i !== idx) }));
  };

  const startEdit = (idx, text) => { setEditingIdx(idx); setEditText(text); };

  const saveEdit = () => {
    if (!editText.trim()) return;
    setReports(prev => ({ ...prev, [reportKey]: prev[reportKey].map((m, i) => i === editingIdx ? { ...m, text: editText.trim() } : m) }));
    setEditingIdx(null); setEditText("");
  };

  // ICS download
  const downloadICS = () => {
    const ics = buildICS(wonApps, lang);
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "miiguri-schedule.ics"; a.click();
    URL.revokeObjectURL(url);
  };

  // ICS via email (mailto with data URI)
  const sendICSEmail = () => {
    if (!icsEmail.trim()) return alert("Please enter an email address.");
    const ics = buildICS(wonApps, lang);
    const subject = encodeURIComponent("My Miiguri Schedule");
    const body = encodeURIComponent("Hi!\n\nPlease find my meet & greet schedule attached.\n\nOpen the .ics file to add all events to your calendar.\n\n---\n" + ics);
    window.location.href = `mailto:${icsEmail.trim()}?subject=${subject}&body=${body}`;
    setShowICSModal(false);
  };

  // Chat image download
  const downloadChatAsImage = async () => {
    if (!chatExportRef.current) return;
    setDownloading(true);
    try {
      const { default: html2canvas } = await import("html2canvas");
      const node = chatExportRef.current;
      const prev = node.style.maxHeight;
      node.style.maxHeight = "none";
      const canvas = await html2canvas(node, { backgroundColor: darkMode ? "#1e1520" : "#fdf7f9", scale: 2, useCORS: true, allowTaint: true, scrollY: 0 });
      node.style.maxHeight = prev;
      const url = canvas.toDataURL("image/jpeg", 0.95);
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `miiguri-${rMember?.replace(/ /g,"-")}-${rDate}.jpg`; anchor.click();
    } catch (e) { alert("Download failed. Make sure html2canvas is installed."); console.error(e); }
    setDownloading(false);
  };

  // Export all reports as PDF
  const exportAllReportsPDF = async () => {
    const keys = Object.keys(reports).filter(k => (reports[k] || []).length > 0);
    if (keys.length === 0) return alert("No reports to export yet.");
    setExportingPDF(true);
    try {
      const { default: html2canvas } = await import("html2canvas");
      const { jsPDF } = await import("https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      let firstPage = true;

      for (const key of keys) {
        const [mEn, mDate, mRound, mSlots, mSingle] = key.split("||");
        const mObj = findMember(mEn);
        const mDisplay = mObj ? mn(mObj) : mEn;
        const msgs = reports[key] || [];

        // build a hidden div, render it, capture
        const div = document.createElement("div");
        div.style.cssText = `position:fixed;left:-9999px;top:0;width:600px;padding:24px;background:${darkMode?"#1e1520":"#fdf7f9"};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;`;

        const header = `<div style="display:flex;align-items:center;gap:12px;padding-bottom:12px;margin-bottom:12px;border-bottom:1.5px solid #f4c0d1;">
          <div style="width:42px;height:42px;border-radius:50%;background:${getMemberColor(mDisplay)};display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:14px;flex-shrink:0;">
            ${memberPhotos[mEn] ? `<img src="${memberPhotos[mEn]}" style="width:42px;height:42px;border-radius:50%;object-fit:cover;" />` : getInitials(mDisplay)}
          </div>
          <div><div style="font-size:15px;font-weight:700;color:${darkMode?"#f8e8f0":"#2c1020"};">${mDisplay}</div>
          <div style="font-size:12px;color:#a08090;">${formatDate(mDate)} · ${mRound} · ${mSlots} ticket(s)${mSingle ? " · " + mSingle : ""}</div></div>
        </div>`;

        const bubbles = msgs.map(m => {
          if (m.sender === "thought") return `<div style="text-align:center;padding:4px 0;font-size:12px;color:#888;font-style:italic;">${m.text}</div>`;
          if (m.sender === "member") return `<div style="display:flex;gap:8px;margin-bottom:10px;align-items:flex-end;">
            <div style="width:28px;height:28px;border-radius:50%;background:${getMemberColor(mDisplay)};display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:10px;flex-shrink:0;">${getInitials(mDisplay)}</div>
            <div><div style="font-size:10px;color:#a08090;margin-bottom:2px;">${mDisplay}</div>
            <div style="background:#fbeaf0;border:1.5px solid #f4c0d1;padding:8px 12px;border-radius:16px;border-top-left-radius:3px;font-size:13px;color:#3c1828;max-width:320px;">${m.text}</div></div>
          </div>`;
          return `<div style="display:flex;justify-content:flex-end;margin-bottom:10px;">
            <div style="background:#ebebeb;border:1px solid #ddd;padding:8px 12px;border-radius:16px;border-top-right-radius:3px;font-size:13px;color:#1a1a1a;max-width:320px;">${m.text}</div>
          </div>`;
        }).join("");

        div.innerHTML = header + bubbles;
        document.body.appendChild(div);
        const canvas = await html2canvas(div, { backgroundColor: darkMode ? "#1e1520" : "#fdf7f9", scale: 2, useCORS: true });
        document.body.removeChild(div);

        const imgData = canvas.toDataURL("image/jpeg", 0.92);
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        const imgH = (canvas.height / canvas.width) * (pageW - 20);

        if (!firstPage) pdf.addPage();
        firstPage = false;

        let y = 10;
        if (imgH <= pageH - 20) {
          pdf.addImage(imgData, "JPEG", 10, y, pageW - 20, imgH);
        } else {
          // tall content — split across pages
          const scale = (pageW - 20) / canvas.width;
          const sliceH = Math.floor((pageH - 20) / scale);
          let srcY = 0;
          while (srcY < canvas.height) {
            const sliceCanvas = document.createElement("canvas");
            sliceCanvas.width = canvas.width;
            sliceCanvas.height = Math.min(sliceH, canvas.height - srcY);
            sliceCanvas.getContext("2d").drawImage(canvas, 0, srcY, canvas.width, sliceCanvas.height, 0, 0, canvas.width, sliceCanvas.height);
            const sliceImg = sliceCanvas.toDataURL("image/jpeg", 0.92);
            const sliceRenderH = sliceCanvas.height * scale;
            pdf.addImage(sliceImg, "JPEG", 10, y, pageW - 20, sliceRenderH);
            srcY += sliceH;
            if (srcY < canvas.height) { pdf.addPage(); y = 10; }
          }
        }
      }
      pdf.save("miiguri-all-reports.pdf");
    } catch (e) { alert("PDF export failed."); console.error(e); }
    setExportingPDF(false);
  };

  const triggerFanPhoto = () => { fanPhotoRef.current.value = ""; fanPhotoRef.current.click(); };
  const triggerMemberPhoto = (enName) => { setMemberPhotoTarget(enName); setTimeout(() => { memberPhotoRef.current.value = ""; memberPhotoRef.current.click(); }, 50); };
  const handleFileSelect = (e, target) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { setCropSrc(ev.target.result); setCropTarget(target); };
    reader.readAsDataURL(file);
  };
  const onCropDone = (dataUrl) => {
    if (cropTarget === "fan") setFanProfile(p => ({ ...p, photo: dataUrl }));
    else setMemberPhotos(p => ({ ...p, [cropTarget]: dataUrl }));
    setCropSrc(null); setCropTarget(null);
  };
  const appMemberDisplay = (a) => lang === "ja" ? a.memberJa : a.memberEn;

  return (
    <div className="app">
      {cropSrc && <ImageCropper src={cropSrc} onDone={onCropDone} onCancel={() => { setCropSrc(null); setCropTarget(null); }} />}

      {/* ICS Email Modal */}
      {showICSModal && (
        <div className="modal-overlay" onClick={() => setShowICSModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3>Send schedule to email</h3>
            <p className="modal-hint">Enter your email address. Your mail app will open with the schedule attached — send it to yourself, then open the attachment on your iPhone to add all events to Calendar.</p>
            <input type="email" value={icsEmail} onChange={e => setICSEmail(e.target.value)} placeholder="your@email.com" onKeyDown={e => e.key === "Enter" && sendICSEmail()} />
            <div className="modal-actions">
              <button className="btn" onClick={() => setShowICSModal(false)}>Cancel</button>
              <button className="btn primary" onClick={sendICSEmail}>Open mail app</button>
            </div>
          </div>
        </div>
      )}

      <div className="header">
        <div className="header-icon">♡</div>
        <div style={{ flex: 1 }}>
          <h1>Miiguri Scheduler</h1>
          <p>Sakurazaka46 · Nogizaka46 · Hinatazaka46</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="icon-btn" onClick={() => setDarkMode(d => !d)} title="Toggle dark mode">{darkMode ? "☀️" : "🌙"}</button>
          <button className="lang-toggle" onClick={() => setLang(l => l === "en" ? "ja" : "en")}>
            <span className={lang === "en" ? "lt-active" : ""}>EN</span>
            <span className={lang === "ja" ? "lt-active" : ""}>JP</span>
          </button>
        </div>
      </div>

      <div className="tabs">
        {[["apply","📝 Apply"],["results","🏆 Results"],["schedule","📅 Schedule"],["reports","💬 Reports"]].map(([key, label]) => (
          <button key={key} className={`tab ${tab === key ? "active" : ""}`} onClick={() => setTab(key)}>
            {label}
            {key === "apply" && applications.length > 0 && <span className="badge">{applications.length}</span>}
            {key === "results" && wonApps.length > 0 && <span className="badge won">{wonApps.length}</span>}
          </button>
        ))}
      </div>

      {/* APPLY */}
      {tab === "apply" && (
        <div>
          <div className="card">
            <h3>Application details</h3>
            <div className="form-group" style={{ marginBottom: 10 }}>
              <label>Group</label>
              <select value={group} onChange={e => { setGroup(e.target.value); setSelectedMember(""); }}>
                {Object.entries(GROUP_LABELS).map(([key, val]) => <option key={key} value={key}>{val[lang]}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 10 }}>
              <label>Member</label>
              <select value={selectedMember} onChange={e => setSelectedMember(e.target.value)}>
                <option value="">— select a member —</option>
                {MEMBERS[group].map(m => <option key={m.en} value={m.en}>{mn(m)}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 10 }}>
              <label>Single / Event name</label>
              <input type="text" value={applySingle} onChange={e => setApplySingle(e.target.value)} placeholder="e.g. 9th Single, Summer Event 2026" />
            </div>
            <div className="form-row">
              <div className="form-group"><label>Event date</label><input type="date" value={applyDate} onChange={e => setApplyDate(e.target.value)} /></div>
              <div className="form-group"><label>Round / Part</label><select value={applyRound} onChange={e => setApplyRound(e.target.value)}>{["Part 1","Part 2","Part 3","Part 4","Part 5","Part 6"].map(p => <option key={p}>{p}</option>)}</select></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Time slot</label><input type="time" value={applyTime} onChange={e => setApplyTime(e.target.value)} /></div>
              <div className="form-group"><label>Tickets</label><select value={applySlots} onChange={e => setApplySlots(e.target.value)}>{["1","2","3","4","5"].map(n => <option key={n}>{n}</option>)}</select></div>
            </div>
            <button className="btn primary" onClick={addApplication}>+ Add application</button>
          </div>
          <div className="card">
            <h3>Applications {applications.length > 0 && <span className="badge">{applications.length}</span>}</h3>
            {applications.length === 0 ? <div className="empty-state">✉<br />No applications yet.</div> : (
              <div className="slot-list">
                {applications.map(a => (
                  <div key={a.id} className={`slot-item ${a.won ? "won-slot" : ""}`}>
                    <div className="slot-info">
                      <span className={`slot-badge ${a.won ? "won" : ""}`}>{a.won ? "✓ Won" : "Applied"}</span>
                      <div>
                        <span className="slot-member">{appMemberDisplay(a)}</span>
                        <span className="slot-meta">{a.single && <span className="single-tag">{a.single}</span>}{formatDate(a.date)} · {a.round} · {a.time || "—"} · {a.slots} ticket(s)</span>
                      </div>
                    </div>
                    <button className="btn small danger" onClick={() => removeApp(a.id)}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* RESULTS */}
      {tab === "results" && (
        <div>
          <div className="card info-banner"><p>After FortuneMusic announces results, tick the slots you won.</p></div>
          <div className="card">
            <h3>Mark what you won</h3>
            {applications.length === 0 ? <div className="empty-state">🏆<br />Add applications first.</div> : (
              <div className="slot-list">
                {applications.map(a => (
                  <div key={a.id} className={`slot-item ${a.won ? "won-slot" : ""}`}>
                    <div className="slot-info">
                      <div className={`won-check ${a.won ? "checked" : ""}`} onClick={() => toggleWon(a.id)}>{a.won && "✓"}</div>
                      <div>
                        <span className="slot-member">{appMemberDisplay(a)}</span>
                        <span className="slot-meta">{a.single && <span className="single-tag">{a.single}</span>}{formatDate(a.date)} · {a.round} · {a.time || "—"}</span>
                      </div>
                    </div>
                    <span className={`slot-badge ${a.won ? "won" : ""}`}>{a.won ? "Won 🎉" : "Pending"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SCHEDULE */}
      {tab === "schedule" && (
        <div>
          <div className="schedule-header">
            <p>Your won meet &amp; greet slots</p>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn small success" onClick={downloadICS}>⬇ Download .ics</button>
              <button className="btn small" onClick={() => setShowICSModal(true)}>✉ Send to email</button>
            </div>
          </div>
          <div className="card info-banner" style={{ fontSize: 12, padding: "10px 14px" }}>
            <p>💡 <strong>iOS tip:</strong> Tap "Send to email", send it to yourself, then open the attachment in Apple Mail to add all events to your Calendar with timings.</p>
          </div>
          <div className="card">
            {wonApps.length === 0 ? <div className="empty-state">📅<br />No won slots yet.</div> : (
              <div className="slot-list">
                {wonApps.map(a => {
                  const d = new Date(a.date + "T00:00:00");
                  return (
                    <div key={a.id} className="schedule-item">
                      <div className="schedule-date">
                        <div className="schedule-day">{d.getDate()}</div>
                        <div className="schedule-month">{d.toLocaleString("en", { month: "short" })}</div>
                      </div>
                      <div className="schedule-detail">
                        <h4>{appMemberDisplay(a)}</h4>
                        <p>{a.single && <span className="single-tag">{a.single}</span>}{GROUP_LABELS[a.group]?.[lang]} · {a.round}{a.time ? " · " + a.time : ""} · {a.slots} ticket(s)</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* REPORTS */}
      {tab === "reports" && (
        <div>
          {/* Profile settings */}
          <div className="card">
            <div className="profile-settings-header" onClick={() => setShowProfileSettings(v => !v)}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Avatar name={fanProfile.name} photo={fanProfile.photo} size={30} color="#7f77dd" />
                <span style={{ fontSize: 13, fontWeight: 600 }}>Your profile &amp; member photos</span>
              </div>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{showProfileSettings ? "▲ Hide" : "▼ Edit"}</span>
            </div>
            {showProfileSettings && (
              <div className="profile-settings-body">
                <div className="profile-row">
                  <div style={{ position: "relative", cursor: "pointer" }} onClick={triggerFanPhoto}>
                    <Avatar name={fanProfile.name} photo={fanProfile.photo} size={50} color="#7f77dd" />
                    <div style={{ position: "absolute", bottom: 0, right: 0, width: 18, height: 18, background: "#7f77dd", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "white" }}>+</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Your display name</label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input type="text" value={fanNameInput} onChange={e => setFanNameInput(e.target.value)} placeholder="Your name / handle" style={{ flex: 1, fontSize: 13, fontFamily: "inherit", border: "1.5px solid var(--border)", borderRadius: 8, padding: "7px 10px", background: "var(--input-bg)", color: "var(--text-primary)" }} />
                      <button className="btn small primary" onClick={() => setFanProfile(p => ({ ...p, name: fanNameInput }))}>Save</button>
                    </div>
                  </div>
                  <input type="file" accept="image/*" ref={fanPhotoRef} style={{ display: "none" }} onChange={e => handleFileSelect(e, "fan")} />
                </div>
                <div style={{ marginTop: 14 }}>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>Member photos — tap + to upload &amp; crop</p>
                  <div className="member-photo-grid">
                    {[...new Set(wonApps.map(a => a.memberEn))].map(en => {
                      const obj = findMember(en);
                      return (
                        <div key={en} className="member-photo-item" onClick={() => triggerMemberPhoto(en)} style={{ cursor: "pointer" }}>
                          <div style={{ position: "relative" }}>
                            <Avatar name={obj ? mn(obj) : en} photo={memberPhotos[en]} size={42} />
                            <div style={{ position: "absolute", bottom: 0, right: 0, width: 16, height: 16, background: "#d4537e", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "white" }}>+</div>
                          </div>
                          <span style={{ fontSize: 10, textAlign: "center", maxWidth: 52 }}>{obj ? mn(obj).split(" ")[0] : en}</span>
                        </div>
                      );
                    })}
                    {wonApps.length === 0 && <p style={{ fontSize: 12, color: "var(--text-muted)" }}>No won slots yet.</p>}
                  </div>
                  <input type="file" accept="image/*" ref={memberPhotoRef} style={{ display: "none" }} onChange={e => handleFileSelect(e, memberPhotoTarget)} />
                </div>
              </div>
            )}
          </div>

          {/* Export PDF */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
            <button className="btn small" onClick={exportAllReportsPDF} disabled={exportingPDF}>
              {exportingPDF ? "Exporting..." : "📄 Export all reports as PDF"}
            </button>
          </div>

          {/* Session selector */}
          <div className="card">
            <div className="report-select">
              <label>Session:</label>
              <select value={reportKey} onChange={e => { setReportKey(e.target.value); setEditingIdx(null); }}>
                <option value="">— select a meet &amp; greet —</option>
                {wonApps.map(a => {
                  const key = `${a.memberEn}||${a.date}||${a.round}||${a.slots}||${a.single || ""}`;
                  const disp = lang === "ja" ? a.memberJa : a.memberEn;
                  return <option key={a.id} value={key}>{disp} · {formatDate(a.date)} · {a.round} · {a.slots} ticket(s){a.single ? ` · ${a.single}` : ""}</option>;
                })}
              </select>
            </div>
            {reportKey && (
              <div className="report-meta-bar">
                <Avatar name={rMemberDisplay} photo={memberPhotos[rMember]} size={28} />
                <div>
                  <strong style={{ fontSize: 13 }}>{rMemberDisplay}</strong>
                  <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 8 }}>{formatDate(rDate)} · {rRound} · {rSlots} ticket(s){rSingle ? ` · ${rSingle}` : ""}</span>
                </div>
              </div>
            )}
          </div>

          {/* Chat */}
          {reportKey && (
            <div className="card chat-card">
              <div ref={chatExportRef} className="chat-export-wrapper">
                <div className="export-header">
                  <Avatar name={rMemberDisplay} photo={memberPhotos[rMember]} size={42} />
                  <div>
                    <div className="export-member-name">{rMemberDisplay}</div>
                    <div className="export-meta">{formatDate(rDate)} · {rRound} · {rSlots} ticket(s){rSingle ? ` · ${rSingle}` : ""}</div>
                  </div>
                </div>

                <div className="chat-log">
                  {currentMessages.length === 0 ? (
                    <div className="empty-state" style={{ padding: "1rem" }}>Start writing your experience with {rMemberDisplay?.split(" ")[0]}~</div>
                  ) : (
                    currentMessages.map((msg, i) => {
                      if (msg.sender === "thought") return (
                        <div key={i} className="chat-thought-wrap">
                          <div className="chat-thought">{msg.text}</div>
                          <div className="msg-actions">
                            <button className="msg-action-btn" onClick={() => startEdit(i, msg.text)}>✏️</button>
                            <button className="msg-action-btn" onClick={() => deleteMessage(i)}>🗑</button>
                          </div>
                        </div>
                      );
                      if (msg.sender === "member") return (
                        <div key={i} className="chat-msg them">
                          {editingIdx === i ? (
                            <div className="edit-row">
                              <input value={editText} onChange={e => setEditText(e.target.value)} onKeyDown={e => e.key === "Enter" && saveEdit()} className="edit-input" autoFocus />
                              <button className="btn small primary" onClick={saveEdit}>Save</button>
                              <button className="btn small" onClick={() => setEditingIdx(null)}>✕</button>
                            </div>
                          ) : (
                            <div className="chat-msg-inner">
                              <Avatar name={rMemberDisplay} photo={memberPhotos[rMember]} size={32} />
                              <div>
                                <div className="chat-sender">{rMemberDisplay}</div>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <div className="chat-bubble them">{msg.text}</div>
                                  <div className="msg-actions">
                                    <button className="msg-action-btn" onClick={() => startEdit(i, msg.text)}>✏️</button>
                                    <button className="msg-action-btn" onClick={() => deleteMessage(i)}>🗑</button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                      return (
                        <div key={i} className="chat-msg me">
                          {editingIdx === i ? (
                            <div className="edit-row">
                              <button className="btn small" onClick={() => setEditingIdx(null)}>✕</button>
                              <button className="btn small primary" onClick={saveEdit}>Save</button>
                              <input value={editText} onChange={e => setEditText(e.target.value)} onKeyDown={e => e.key === "Enter" && saveEdit()} className="edit-input" autoFocus />
                            </div>
                          ) : (
                            <div className="chat-msg-inner">
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <div className="msg-actions">
                                  <button className="msg-action-btn" onClick={() => startEdit(i, msg.text)}>✏️</button>
                                  <button className="msg-action-btn" onClick={() => deleteMessage(i)}>🗑</button>
                                </div>
                                <div className="chat-bubble me">{msg.text}</div>
                              </div>
                              <Avatar name={fanProfile.name} photo={fanProfile.photo} size={32} color="#7f77dd" />
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                  <div ref={chatEndRef} />
                </div>
              </div>

              {currentMessages.length > 0 && (
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10, marginBottom: 4 }}>
                  <button className="btn small success" onClick={downloadChatAsImage} disabled={downloading}>
                    {downloading ? "Saving..." : "⬇ Save as image"}
                  </button>
                </div>
              )}

              <div className="msg-type-selector">
                <button className={`msg-type-btn ${msgSender === "member" ? "active member-type" : ""}`} onClick={() => setMsgSender("member")}>
                  <Avatar name={rMemberDisplay} photo={memberPhotos[rMember]} size={20} />
                  <span>{rMemberDisplay?.split(" ")[0]}</span>
                </button>
                <button className={`msg-type-btn ${msgSender === "fan" ? "active fan-type" : ""}`} onClick={() => setMsgSender("fan")}>
                  <Avatar name={fanProfile.name} photo={fanProfile.photo} size={20} color="#7f77dd" />
                  <span>{fanProfile.name}</span>
                </button>
                <button className={`msg-type-btn ${msgSender === "thought" ? "active thought-type" : ""}`} onClick={() => setMsgSender("thought")}>
                  <span>💭</span><span>Inner thought</span>
                </button>
              </div>

              <div className="chat-input-row">
                <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && sendMessage()}
                  placeholder={msgSender === "member" ? `What did ${rMemberDisplay?.split(" ")[0]} say?` : msgSender === "thought" ? "Your inner thought..." : "What did you say?"} />
                <button className="btn primary small" onClick={sendMessage}>Send</button>
              </div>
            </div>
          )}

          {!reportKey && wonApps.length === 0 && (
            <div className="card"><div className="empty-state">💬<br />Mark your won slots in Results first.</div></div>
          )}
        </div>
      )}
    </div>
  );
}
