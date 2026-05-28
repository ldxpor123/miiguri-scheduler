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
    };
  } catch { return { applications: [], reports: {}, memberPhotos: {}, fanProfile: { name: "Fan", photo: null }, lang: "en" }; }
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

export default function App() {
  const init = loadState();
  const [tab, setTab] = useState("apply");
  const [lang, setLang] = useState(init.lang);
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
  const [cropSrc, setCropSrc] = useState(null);
  const [cropTarget, setCropTarget] = useState(null); // "fan" | memberEnName

  const chatEndRef = useRef(null);
  const fanPhotoRef = useRef(null);
  const memberPhotoRef = useRef(null);
  const chatExportRef = useRef(null);

  const mn = (m) => memberName(m, lang);

  useEffect(() => {
    try {
      localStorage.setItem("mng_apps", JSON.stringify(applications));
      localStorage.setItem("mng_reports", JSON.stringify(reports));
      localStorage.setItem("mng_member_photos", JSON.stringify(memberPhotos));
      localStorage.setItem("mng_fan_profile", JSON.stringify(fanProfile));
      localStorage.setItem("mng_lang", lang);
    } catch {}
  }, [applications, reports, memberPhotos, fanProfile, lang]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [reports, reportKey]);

  const addApplication = () => {
    if (!selectedMember) return alert("Please select a member.");
    if (!applyDate) return alert("Please pick a date.");
    const memberObj = MEMBERS[group].find(m => m.en === selectedMember);
    if (!memberObj) return;
    setApplications(prev => [...prev, {
      id: Date.now() + Math.random(),
      memberEn: memberObj.en, memberJa: memberObj.ja,
      group, date: applyDate, round: applyRound, time: applyTime,
      slots: applySlots, single: applySingle, won: false,
    }]);
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

  const downloadICS = () => {
    if (wonApps.length === 0) return alert("No won slots to export.");
    let ics = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//MnG Scheduler//EN\r\n";
    wonApps.forEach(a => {
      ics += `BEGIN:VEVENT\r\nUID:mng-${a.id}@scheduler\r\nSUMMARY:MnG with ${a.memberEn}\r\nDTSTART;VALUE=DATE:${a.date.replace(/-/g,"")}\r\nDTEND;VALUE=DATE:${a.date.replace(/-/g,"")}\r\nDESCRIPTION:${GROUP_LABELS[a.group]?.en} Online MnG - ${a.round}\r\nEND:VEVENT\r\n`;
    });
    ics += "END:VCALENDAR";
    const blob = new Blob([ics], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "mng-schedule.ics"; a.click();
    URL.revokeObjectURL(url);
  };

  const downloadChatAsImage = async () => {
    if (!chatExportRef.current) return;
    setDownloading(true);
    try {
      const { default: html2canvas } = await import("html2canvas");
      const canvas = await html2canvas(chatExportRef.current, { backgroundColor: "#fdf7f9", scale: 2, useCORS: true, allowTaint: true, scrollY: 0 });
      const url = canvas.toDataURL("image/jpeg", 0.95);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `miiguri-${rMember?.replace(/ /g,"-")}-${rDate}.jpg`;
      anchor.click();
    } catch (e) { alert("Download failed. Make sure html2canvas is installed (npm install html2canvas)."); console.error(e); }
    setDownloading(false);
  };

  // Photo upload with cropper
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

      <div className="header">
        <div className="header-icon">♡</div>
        <div style={{ flex: 1 }}>
          <h1>Miiguri Scheduler</h1>
          <p>Sakurazaka46 · Nogizaka46 · Hinatazaka46</p>
        </div>
        <button className={`lang-toggle ${lang === "en" ? "active-left" : "active-right"}`} onClick={() => setLang(l => l === "en" ? "ja" : "en")}>
          <span className={lang === "en" ? "lt-active" : ""}>EN</span>
          <span className={lang === "ja" ? "lt-active" : ""}>JP</span>
        </button>
      </div>

      <div className="tabs">
        {[["apply","✉ Apply"],["results","🏆 Results"],["schedule","📅 Schedule"],["reports","💬 Reports"]].map(([key, label]) => (
          <button key={key} className={`tab ${tab === key ? "active" : ""}`} onClick={() => setTab(key)}>
            {label}
            {key === "apply" && applications.length > 0 && <span className="badge">{applications.length}</span>}
            {key === "results" && wonApps.length > 0 && <span className="badge won">{wonApps.length}</span>}
          </button>
        ))}
      </div>

      {/* ── APPLY ── */}
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
                        <span className="slot-meta">
                          {a.single && <span className="single-tag">{a.single}</span>}
                          {formatDate(a.date)} · {a.round} · {a.time || "—"} · {a.slots} ticket(s)
                        </span>
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

      {/* ── RESULTS ── */}
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
                        <span className="slot-meta">
                          {a.single && <span className="single-tag">{a.single}</span>}
                          {formatDate(a.date)} · {a.round} · {a.time || "—"}
                        </span>
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

      {/* ── SCHEDULE ── */}
      {tab === "schedule" && (
        <div>
          <div className="schedule-header">
            <p>Your won meet &amp; greet slots</p>
            <button className="btn small success" onClick={downloadICS}>⬇ Download .ics</button>
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
                        <p>
                          {a.single && <span className="single-tag">{a.single}</span>}
                          {GROUP_LABELS[a.group]?.[lang]} · {a.round}{a.time ? " · " + a.time : ""} · {a.slots} ticket(s)
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── REPORTS ── */}
      {tab === "reports" && (
        <div>
          {/* Profile settings */}
          <div className="card">
            <div className="profile-settings-header" onClick={() => setShowProfileSettings(v => !v)}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Avatar name={fanProfile.name} photo={fanProfile.photo} size={30} color="#7f77dd" />
                <span style={{ fontSize: 13, fontWeight: 600 }}>Your profile &amp; member photos</span>
              </div>
              <span style={{ fontSize: 12, color: "#a08090" }}>{showProfileSettings ? "▲ Hide" : "▼ Edit"}</span>
            </div>
            {showProfileSettings && (
              <div className="profile-settings-body">
                <div className="profile-row">
                  <div style={{ position: "relative", cursor: "pointer" }} onClick={triggerFanPhoto}>
                    <Avatar name={fanProfile.name} photo={fanProfile.photo} size={50} color="#7f77dd" />
                    <div style={{ position: "absolute", bottom: 0, right: 0, width: 18, height: 18, background: "#7f77dd", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "white" }}>+</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12, color: "#a08090", display: "block", marginBottom: 4 }}>Your display name</label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input type="text" value={fanNameInput} onChange={e => setFanNameInput(e.target.value)} placeholder="Your name / handle" style={{ flex: 1, fontSize: 13, fontFamily: "inherit", border: "1.5px solid #e0c8d0", borderRadius: 8, padding: "7px 10px" }} />
                      <button className="btn small primary" onClick={() => setFanProfile(p => ({ ...p, name: fanNameInput }))}>Save</button>
                    </div>
                  </div>
                  <input type="file" accept="image/*" ref={fanPhotoRef} style={{ display: "none" }} onChange={e => handleFileSelect(e, "fan")} />
                </div>

                <div style={{ marginTop: 14 }}>
                  <p style={{ fontSize: 12, color: "#a08090", marginBottom: 10 }}>Member photos — tap + to upload &amp; crop</p>
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
                    {wonApps.length === 0 && <p style={{ fontSize: 12, color: "#a08090" }}>No won slots yet.</p>}
                  </div>
                  <input type="file" accept="image/*" ref={memberPhotoRef} style={{ display: "none" }} onChange={e => handleFileSelect(e, memberPhotoTarget)} />
                </div>
              </div>
            )}
          </div>

          {/* Session selector */}
          <div className="card">
            <div className="report-select">
              <label>Session:</label>
              <select value={reportKey} onChange={e => setReportKey(e.target.value)}>
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
                  <span style={{ fontSize: 11, color: "#a08090", marginLeft: 8 }}>{formatDate(rDate)} · {rRound} · {rSlots} ticket(s){rSingle ? ` · ${rSingle}` : ""}</span>
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
                      if (msg.sender === "thought") return <div key={i} className="chat-thought">{msg.text}</div>;
                      if (msg.sender === "member") return (
                        <div key={i} className="chat-msg them">
                          <div className="chat-msg-inner">
                            <Avatar name={rMemberDisplay} photo={memberPhotos[rMember]} size={32} />
                            <div><div className="chat-sender">{rMemberDisplay}</div><div className="chat-bubble them">{msg.text}</div></div>
                          </div>
                        </div>
                      );
                      return (
                        <div key={i} className="chat-msg me">
                          <div className="chat-msg-inner">
                            <div><div className="chat-bubble me">{msg.text}</div></div>
                            <Avatar name={fanProfile.name} photo={fanProfile.photo} size={32} color="#7f77dd" />
                          </div>
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
