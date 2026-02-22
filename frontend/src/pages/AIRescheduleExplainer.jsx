import { useState, useEffect, useRef } from "react";

const API_BASE = "http://localhost:8000";

const DEPT_ACCENT = {
  Cardiology:  "#e74c3c", Neurology: "#9b59b6",
  Orthopedics: "#3498db", Pediatrics: "#f39c12",
  Dermatology: "#1abc9c", General:   "#10b981", ICU: "#ef4444",
};
const DEPT_ICON = {
  Cardiology: "❤️", Neurology: "🧠", Orthopedics: "🦴",
  Pediatrics: "👶", Dermatology: "🩺", General: "🏥", ICU: "🚨",
};

// ── Typing animation ──────────────────────────────────────────────────────────
function useTypingEffect(text, speed = 12) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);
  const idx = useRef(0);

  useEffect(() => {
    setDisplayed(""); setDone(false); idx.current = 0;
    if (!text) return;
    const interval = setInterval(() => {
      idx.current += 1;
      setDisplayed(text.slice(0, idx.current));
      if (idx.current >= text.length) { clearInterval(interval); setDone(true); }
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed]);

  return { displayed, done };
}

// ── Render bold + bullets ─────────────────────────────────────────────────────
function RichText({ text }) {
  if (!text) return null;
  return (
    <div style={{ lineHeight: 1.8, fontSize: 14 }}>
      {text.split("\n").map((line, i) => {
        const isBullet = /^[•\-]\s/.test(line.trim());
        const isHeader = /^###/.test(line.trim());
        const content  = line.replace(/^[•\-]\s/, "").replace(/^###\s*/, "");

        const renderInline = (str) =>
          str.split(/(\*\*[^*]+\*\*)/g).map((p, j) =>
            p.startsWith("**") && p.endsWith("**")
              ? <strong key={j} style={{ color: "#f0c27f" }}>{p.slice(2, -2)}</strong>
              : p
          );

        if (!content.trim()) return <div key={i} style={{ height: 8 }} />;
        if (isHeader) return (
          <div key={i} style={{
            color: "#e8b86d", fontWeight: 700, fontSize: 12,
            letterSpacing: "0.1em", textTransform: "uppercase",
            marginTop: 16, marginBottom: 6,
          }}>{renderInline(content)}</div>
        );
        if (isBullet) return (
          <div key={i} style={{ display: "flex", gap: 10, marginBottom: 5, paddingLeft: 4 }}>
            <span style={{ color: "#e8b86d", flexShrink: 0, fontSize: 12, marginTop: 2 }}>▸</span>
            <span style={{ color: "#ddd" }}>{renderInline(content)}</span>
          </div>
        );
        return <p key={i} style={{ margin: "0 0 8px", color: "#ccc" }}>{renderInline(content)}</p>;
      })}
    </div>
  );
}

// ── Fetch doctor queue from backend ──────────────────────────────────────────
async function fetchDoctorQueue(doctorId) {
  try {
    const res  = await fetch(`${API_BASE}/appointments/optimized-queue?doctor_id=${doctorId}`);
    const data = await res.json();
    return data.optimized_queue || [];
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// RULE-BASED RESCHEDULING ENGINE — no LLM, no API key needed
// ═══════════════════════════════════════════════════════════════════════════════
function generateRuleBasedExplanation(emergency, queue) {
  const { doctor_name, department, patient_name, age, problem, urgency_level } = emergency;
  const urgency = (urgency_level || "critical").toUpperCase();

  // ── Section 1: Why rescheduling is necessary ──────────────────────────────
  const section1 = [
    `### Why Rescheduling Is Necessary`,
    `**${patient_name}** (Age ${age}) has been admitted as a **Hyper Emergency** with severity score **10/10** in the **${department}** department.`,
    `Chief complaint: *${problem || "life-threatening condition"}* — urgency level **${urgency}**.`,
    `Dr. **${doctor_name}** must give this patient immediate and undivided attention. All existing appointments must be evaluated for rescheduling or transfer.`,
  ];

  // ── Section 2: Per-patient impact ─────────────────────────────────────────
  const section2 = [`### Impact on Current Queue`];

  if (queue.length === 0) {
    section2.push(`**No patients** are currently in Dr. ${doctor_name}'s queue. No rescheduling required.`);
  } else {
    queue.forEach((p) => {
      const severity    = p.severity_score || 0;
      const type        = (p.appointment_type || "routine").toLowerCase();
      const waitMin     = p.waiting_time_minutes || 0;
      const isEmergency = type === "emergency";
      const isElderly   = (p.age || 0) >= 65;
      const isChild     = (p.age || 0) <= 12;

      let action, reason;

      if (isEmergency && severity >= 7) {
        action = "🔴 **Immediate Transfer** to next available emergency doctor";
        reason = `severity ${severity}/10 emergency — cannot wait`;
      } else if (isEmergency && severity >= 4) {
        action = "🟠 **Transfer** to another available doctor in this department";
        reason = `emergency appointment with moderate severity (${severity}/10)`;
      } else if (isElderly && severity >= 6) {
        action = "🟠 **Priority Transfer** to next senior available doctor";
        reason = `elderly patient (age ${p.age}) with high severity`;
      } else if (isChild && severity >= 5) {
        action = "🟠 **Transfer** to Pediatrics or next available doctor";
        reason = `child patient (age ${p.age}) with elevated severity`;
      } else if (waitMin >= 60 || severity >= 7) {
        action = "🟡 **Reschedule** — offer next available slot today";
        reason = `already waited ${waitMin} min or severity is high (${severity}/10)`;
      } else if (type === "routine" && severity <= 3) {
        action = "🟢 **Reschedule** — can safely wait for tomorrow's slot";
        reason = `routine visit with low severity (${severity}/10)`;
      } else {
        action = "🟡 **Reschedule** — offer slot within next 2 hours";
        reason = `standard appointment, moderate priority`;
      }

      section2.push(
        `• **${p.name}** (Age ${p.age}, ${type}, severity ${severity}/10, wait ~${waitMin} min) — ${action} *(${reason})*`
      );
    });
  }

  // ── Section 3: Recommended actions ───────────────────────────────────────
  const criticalCount = queue.filter(
    (p) => (p.severity_score || 0) >= 7 || (p.appointment_type || "").toLowerCase() === "emergency"
  ).length;
  const routineCount   = queue.length - criticalCount;
  const estDisruption  = queue.length > 0 ? Math.max(30, queue.length * 15) : 0;

  const section3 = [
    `### Recommended Actions for Front Desk / Nursing Staff`,
    `• Notify all **${queue.length} patient(s)** in Dr. ${doctor_name}'s queue about the emergency delay immediately`,
    criticalCount > 0
      ? `• **${criticalCount} high-severity patient(s)** need immediate transfer — contact on-call doctors now`
      : `• No high-severity transfers required at this time`,
    routineCount > 0
      ? `• **${routineCount} routine patient(s)** can be rescheduled for later today or tomorrow`
      : null,
    `• Estimated disruption time: **~${estDisruption} minutes**`,
    `• Update the appointment board and notify waiting patients via SMS or call`,
    `• Log the emergency override in the hospital management system`,
  ].filter(Boolean);

  return [...section1, ``, ...section2, ``, ...section3].join("\n");
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODAL COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
function RescheduleModal({ emergency, onClose }) {
  const [queue,   setQueue]   = useState([]);
  const [aiText,  setAiText]  = useState("");
  const [loading, setLoading] = useState(true);
  const { displayed, done }   = useTypingEffect(aiText, 12);
  const accent = DEPT_ACCENT[emergency.department] || "#e8b86d";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const q = await fetchDoctorQueue(emergency.doctor_id);
      if (cancelled) return;
      setQueue(q);
      const explanation = generateRuleBasedExplanation(emergency, q);
      if (cancelled) return;
      setAiText(explanation);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [emergency.appointment_id]);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.82)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "1rem", animation: "fadeIn 0.25s ease",
    }}>
      <style>{`
        @keyframes fadeIn { from{opacity:0;transform:scale(0.96)} to{opacity:1;transform:scale(1)} }
        @keyframes pulse  { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes spin   { to{transform:rotate(360deg)} }
        .modal-scroll::-webkit-scrollbar{width:5px}
        .modal-scroll::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.12);border-radius:4px}
      `}</style>

      <div style={{
        width: "100%", maxWidth: 760,
        background: "linear-gradient(145deg,#141414,#0f0f0f)",
        border: `1px solid ${accent}33`, borderRadius: 20,
        boxShadow: `0 0 60px ${accent}18,0 24px 80px rgba(0,0,0,0.7)`,
        overflow: "hidden", maxHeight: "90vh",
        display: "flex", flexDirection: "column",
      }}>

        {/* Header */}
        <div style={{
          background: `linear-gradient(135deg,${accent}18,transparent 60%)`,
          borderBottom: `1px solid ${accent}22`,
          padding: "20px 24px", display: "flex", alignItems: "flex-start", gap: 14,
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: `${accent}22`, border: `1.5px solid ${accent}44`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 22, flexShrink: 0,
          }}>📋</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, letterSpacing: "0.15em", color: accent,
              fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>
              Rescheduling Analysis
            </div>
            <h2 style={{ margin: 0, fontSize: 18, color: "#f0f0f0", fontWeight: 700 }}>
              Queue Impact Report
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#666" }}>
              Dr. {emergency.doctor_name} · {DEPT_ICON[emergency.department]} {emergency.department} ·
              Patient: <strong style={{ color: "#aaa" }}>{emergency.patient_name}</strong>
            </p>
          </div>
          <button onClick={onClose} style={{
            background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8, width: 32, height: 32, color: "#888",
            fontSize: 16, cursor: "pointer", display: "flex",
            alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}
            onMouseEnter={e => { e.currentTarget.style.background="rgba(255,255,255,0.12)"; e.currentTarget.style.color="#fff"; }}
            onMouseLeave={e => { e.currentTarget.style.background="rgba(255,255,255,0.06)"; e.currentTarget.style.color="#888"; }}
          >✕</button>
        </div>

        {/* Summary bar */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1,
          background: "rgba(255,255,255,0.04)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}>
          {[
            { label: "Chief Complaint", value: emergency.problem, truncate: true },
            { label: "Urgency Level",   value: (emergency.urgency_level || "critical").toUpperCase(), color: accent },
            { label: "Queue Disrupted", value: `${queue.length} patient${queue.length !== 1 ? "s" : ""}` },
          ].map((item, i) => (
            <div key={i} style={{ padding: "12px 18px", background: i % 2 === 0 ? "rgba(255,255,255,0.015)" : "transparent" }}>
              <div style={{ fontSize: 10, color: "#555", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 3 }}>
                {item.label}
              </div>
              <div style={{
                fontSize: 13, fontWeight: 600, color: item.color || "#ddd",
                overflow: item.truncate ? "hidden" : undefined,
                textOverflow: item.truncate ? "ellipsis" : undefined,
                whiteSpace: item.truncate ? "nowrap" : undefined,
              }}>{item.value || "—"}</div>
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="modal-scroll" style={{ flex: 1, overflowY: "auto", padding: 24 }}>

          {loading && (
            <div style={{ textAlign: "center", padding: "3rem 1rem" }}>
              <div style={{
                width: 36, height: 36, border: `3px solid ${accent}33`,
                borderTopColor: accent, borderRadius: "50%",
                margin: "0 auto 16px", animation: "spin 0.9s linear infinite",
              }} />
              <div style={{ color: "#666", fontSize: 13 }}>Analysing queue data...</div>
            </div>
          )}

          {!loading && (
            <>
              {queue.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 11, color: "#555", letterSpacing: "0.1em",
                    textTransform: "uppercase", marginBottom: 10 }}>
                    Affected Queue — {queue.length} patients
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {queue.map((p, i) => (
                      <div key={i} style={{
                        display: "flex", alignItems: "center", gap: 12,
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.06)",
                        borderRadius: 8, padding: "8px 14px",
                      }}>
                        <span style={{ fontSize: 11, color: "#444", width: 18, textAlign: "center" }}>{i + 1}</span>
                        <span style={{ flex: 1, fontSize: 13, color: "#ccc", fontWeight: 500 }}>{p.name}</span>
                        <span style={{ fontSize: 11, color: "#666" }}>Age {p.age}</span>
                        <span style={{
                          fontSize: 10, padding: "2px 8px", borderRadius: 5, fontWeight: 600,
                          background: p.appointment_type === "emergency" ? "#e74c3c22" : "#3498db22",
                          color: p.appointment_type === "emergency" ? "#e74c3c" : "#3498db",
                        }}>{p.appointment_type}</span>
                        <span style={{ fontSize: 11, color: "#888" }}>~{p.waiting_time_minutes} min</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {queue.length === 0 && (
                <div style={{
                  background: "#2ecc7111", border: "1px solid #2ecc7122",
                  borderRadius: 8, padding: "10px 16px", marginBottom: 20,
                  fontSize: 13, color: "#2ecc71",
                }}>
                  ✓ No patients currently in queue — no rescheduling required.
                </div>
              )}

              <div style={{
                background: `linear-gradient(135deg,${accent}08,transparent)`,
                border: `1px solid ${accent}22`, borderRadius: 12,
                padding: "20px 22px", position: "relative",
              }}>
                <div style={{
                  position: "absolute", top: -1, left: 20,
                  background: "#141414", padding: "0 8px",
                  fontSize: 10, color: accent, letterSpacing: "0.12em",
                  textTransform: "uppercase", fontWeight: 700,
                }}>Rule-Based Analysis</div>
                <RichText text={displayed} />
                {!done && (
                  <span style={{
                    display: "inline-block", width: 2, height: 15,
                    background: accent, verticalAlign: "middle",
                    marginLeft: 2, animation: "pulse 0.7s ease infinite",
                  }} />
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          borderTop: "1px solid rgba(255,255,255,0.06)",
          padding: "14px 24px", display: "flex",
          alignItems: "center", justifyContent: "space-between",
          background: "rgba(0,0,0,0.3)",
        }}>
          <span style={{ fontSize: 11, color: "#444" }}>
            Rule-Based Engine · Live queue data · No external API
          </span>
          <button onClick={onClose} style={{
            background: `${accent}22`, border: `1px solid ${accent}44`,
            borderRadius: 8, padding: "8px 22px",
            color: accent, fontSize: 13, fontWeight: 700,
            cursor: "pointer", transition: "all 0.2s",
          }}
            onMouseEnter={e => { e.currentTarget.style.background = `${accent}44`; }}
            onMouseLeave={e => { e.currentTarget.style.background = `${accent}22`; }}
          >Close</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRIGGER BUTTON
// ═══════════════════════════════════════════════════════════════════════════════
export function RescheduleAIButton({ emergency }) {
  const [open, setOpen] = useState(false);
  const accent = DEPT_ACCENT[emergency.department] || "#e8b86d";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="View rescheduling explanation"
        style={{
          background: "none", border: `1.5px solid ${accent}66`,
          borderRadius: 8, padding: "4px 11px",
          cursor: "pointer", color: accent,
          fontSize: 12, fontWeight: 700,
          display: "flex", alignItems: "center", gap: 5,
          transition: "all 0.2s", whiteSpace: "nowrap",
        }}
        onMouseEnter={e => { e.currentTarget.style.background=`${accent}22`; e.currentTarget.style.borderColor=accent; }}
        onMouseLeave={e => { e.currentTarget.style.background="none"; e.currentTarget.style.borderColor=`${accent}66`; }}
      >
        📋 Reschedule Info
      </button>

      {open && <RescheduleModal emergency={emergency} onClose={() => setOpen(false)} />}
    </>
  );
}

export default RescheduleModal;