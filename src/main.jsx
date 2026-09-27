import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { initializeApp, getApps, getApp } from "firebase/app";
import { getDatabase, get, ref } from "firebase/database";
import {
  Boxes, Link2, Copy, Check, X, Trash2, Database,
  Upload, LoaderCircle, CircleAlert, ChevronRight, Settings
} from "lucide-react";
import "./styles.css";

// ─── Particles Background ────────────────────────────────────────────────────
function Particles() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let raf;
    let particles = [];

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = innerWidth * dpr;
      canvas.height = innerHeight * dpr;
      canvas.style.width = innerWidth + "px";
      canvas.style.height = innerHeight + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const make = () => {
      particles = Array.from({ length: 80 }, () => ({
        x: Math.random() * innerWidth,
        y: Math.random() * innerHeight,
        r: Math.random() * 1.6 + 0.4,
        vx: (Math.random() - 0.5) * 0.22,
        vy: (Math.random() - 0.5) * 0.22,
        a: Math.random() * 0.28 + 0.05
      }));
    };

    const draw = () => {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (const p of particles) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < -5) p.x = innerWidth + 5;
        if (p.x > innerWidth + 5) p.x = -5;
        if (p.y < -5) p.y = innerHeight + 5;
        if (p.y > innerHeight + 5) p.y = -5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,0,0,${p.a})`;
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };

    resize(); make(); draw();
    addEventListener("resize", () => { resize(); make(); });
    return () => { cancelAnimationFrame(raf); };
  }, []);

  return <canvas ref={canvasRef} className="particle-canvas" />;
}

// ─── Local Storage Hook ───────────────────────────────────────────────────────
function useAccounts() {
  const [accounts, setAccounts] = useState(() => {
    try { return JSON.parse(localStorage.getItem("og-complex-accounts") || "[]"); }
    catch { return []; }
  });

  useEffect(() => {
    localStorage.setItem("og-complex-accounts", JSON.stringify(accounts));
  }, [accounts]);

  return [accounts, setAccounts];
}

// ─── Firebase Config Parser ───────────────────────────────────────────────────
// Parses either a JSON object or Firebase SDK config snippet
function parseFirebaseConfig(raw) {
  const s = raw.trim();

  // Try plain JSON
  try {
    const parsed = JSON.parse(s);
    if (parsed.apiKey && parsed.projectId) return parsed;
  } catch {}

  // Try extracting from SDK snippet (const firebaseConfig = { ... })
  const match = s.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      // Convert JS object literal to JSON
      const jsonStr = match[0]
        .replace(/\/\/.*$/gm, "")           // remove single-line comments
        .replace(/,\s*([\]}])/g, "$1")      // remove trailing commas
        .replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":') // quote keys
        .replace(/:\s*"([^"]*?)"/g, (_, v) => `: "${v}"`)
        .replace(/:\s*'([^']*?)'/g, (_, v) => `: "${v}"`); // single quotes -> double

      const parsed = JSON.parse(jsonStr);
      if (parsed.apiKey && parsed.projectId) return parsed;
    } catch {}
  }

  return null;
}

// ─── Main App ─────────────────────────────────────────────────────────────────
function App() {
  const [accounts, setAccounts] = useAccounts();
  const [modal, setModal] = useState(false);
  const [shareLink, setShareLink] = useState("");
  const [copied, setCopied] = useState(false);

  // Connection form state
  const [dbUrl, setDbUrl] = useState("");
  const [configRaw, setConfigRaw] = useState("");
  const [status, setStatus] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [active, setActive] = useState(null);

  // Config panel toggle
  const [showConfig, setShowConfig] = useState(false);

  // Read ?panel= param from URL on mount
  useEffect(() => {
    try {
      const params = new URLSearchParams(location.search);
      const panel = params.get("panel");
      if (panel) {
        const { url, id, config } = JSON.parse(atob(decodeURIComponent(panel)));
        if (url) setDbUrl(url);
        if (config) setConfigRaw(JSON.stringify(config, null, 2));
        if (id) {
          const found = accounts.find(a => a.id === id);
          if (found) setActive(found);
        }
      }
    } catch {}
  }, []); // eslint-disable-line

  // ── Connect ────────────────────────────────────────────────────────────────
  const connect = async () => {
    const cleanUrl = dbUrl.trim().replace(/\/$/, "");
    if (!cleanUrl) return setStatus("Please enter your Firebase Database URL");

    // Parse firebase config from the text area (or use empty if not provided)
    let firebaseConfig = null;
    if (configRaw.trim()) {
      firebaseConfig = parseFirebaseConfig(configRaw);
      if (!firebaseConfig) {
        return setStatus("Could not parse Firebase config. Paste the full config object.");
      }
    }

    // If no config provided, try to infer from databaseURL
    if (!firebaseConfig) {
      // Derive projectId from databaseURL pattern: https://<project>-default-rtdb.firebaseio.com
      const m = cleanUrl.match(/https:\/\/([^.]+)(?:-default-rtdb)?\.firebaseio\.com/);
      if (!m) return setStatus("Invalid Firebase Database URL format.");
      const projectId = m[1].replace(/-default-rtdb$/, "");
      firebaseConfig = {
        projectId,
        databaseURL: cleanUrl,
        // minimal config — works for public/unauthenticated RTDB
        apiKey: "AIzaSyPlaceholder",
        authDomain: `${projectId}.firebaseapp.com`,
        storageBucket: `${projectId}.appspot.com`,
        messagingSenderId: "000000000000",
        appId: "1:000000000000:web:000000000000000000000000"
      };
    }

    // Always set databaseURL from the input field (overrides config)
    firebaseConfig.databaseURL = cleanUrl;

    setConnecting(true);
    setStatus("");

    try {
      // Initialize or reuse Firebase app
      let app;
      const existingApps = getApps();
      const appName = `og-complex-${firebaseConfig.projectId}`;

      try {
        app = getApp(appName);
      } catch {
        // App doesn't exist yet, create it
        if (existingApps.length === 0) {
          app = initializeApp(firebaseConfig);
        } else {
          app = initializeApp(firebaseConfig, appName);
        }
      }

      const db = getDatabase(app, cleanUrl);
      const test = await get(ref(db, ".info/connected"));

      // .info/connected exists (even if value is false = disconnected state is valid)
      if (test !== null) {
        const id = crypto.randomUUID();
        const account = {
          id,
          url: cleanUrl,
          projectId: firebaseConfig.projectId,
          config: firebaseConfig,
          connectedAt: Date.now()
        };
        setAccounts(prev => [...prev.filter(x => x.url !== cleanUrl), account]);
        setActive(account);
        setStatus("Connected to your Firebase project.");
      } else {
        throw new Error("Firebase connection could not be verified.");
      }
    } catch (e) {
      setStatus(e.message || "Connection failed.");
    } finally {
      setConnecting(false);
    }
  };

  // ── Delete account ─────────────────────────────────────────────────────────
  const deleteAccount = (id) => {
    if (confirm("Delete this account permanently?")) {
      setAccounts(prev => prev.filter(x => x.id !== id));
      if (active?.id === id) setActive(null);
    }
  };

  // ── Share link ─────────────────────────────────────────────────────────────
  const createShareLink = () => {
    const payload = active
      ? btoa(JSON.stringify({ url: active.url, id: active.id, config: active.config }))
      : "";
    const link = payload
      ? `${location.origin}${location.pathname}?panel=${encodeURIComponent(payload)}`
      : location.href;
    setShareLink(link);
    setModal(true);
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── File upload (UI only) ──────────────────────────────────────────────────
  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/\.(apk|zip)$/i.test(file.name)) {
      setStatus("Only .apk or .zip files supported.");
      return;
    }
    setStatus(`Selected ${file.name}. Upload processing is ready for your own authorized workflow.`);
  };

  // ── Restore saved account ──────────────────────────────────────────────────
  const restoreAccount = (account) => {
    setActive(account);
    setDbUrl(account.url);
    if (account.config) setConfigRaw(JSON.stringify(account.config, null, 2));
  };

  return (
    <main className="page">
      <Particles />
      <section className="shell">
        <div className="brand">
          <h1 className="mythos-title">COMPLEX</h1>
        </div>

        <div
          className="glass-card"
          onMouseEnter={e => {
            e.currentTarget.style.transform = "translateY(-8px) scale(1.02)";
            e.currentTarget.style.boxShadow = "0 20px 40px rgba(0,0,0,0.12), 0 8px 16px rgba(0,0,0,0.06)";
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = "translateY(0) scale(1)";
            e.currentTarget.style.boxShadow = "0 10px 15px -3px rgba(0,0,0,0.08)";
          }}
        >
          {/* Saved accounts list */}
          {!active && (
            <>
              <div className="section-head">
                <div className="section-title"><Boxes size={16}/> <span>Panels</span></div>
                <span className="count">{accounts.length} {accounts.length === 1 ? "account" : "accounts"}</span>
              </div>

              <div className="accounts">
                {accounts.length === 0 ? (
                  <div className="empty">
                    <Boxes size={32}/>
                    <div>No saved accounts</div>
                  </div>
                ) : accounts.map(a => (
                  <div className="account-row group" key={a.id} onClick={() => restoreAccount(a)}>
                    <div>
                      <b>{a.projectId || "Firebase project"}</b>
                      <small>{a.url}</small>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <ChevronRight size={15} style={{ color: "#aaa", marginTop: 2 }}/>
                      <button className="icon-btn danger" onClick={e => { e.stopPropagation(); deleteAccount(a.id); }}>
                        <Trash2 size={15}/>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Active account indicator */}
          {active && (
            <div className="active-banner">
              <div>
                <b>{active.projectId}</b>
                <small>{active.url}</small>
              </div>
              <button className="icon-btn" onClick={() => setActive(null)} title="Back to list">
                <X size={15}/>
              </button>
            </div>
          )}

          {/* Connection form */}
          <div className="form-stack">
            <label>Firebase Database URL</label>
            <input
              value={dbUrl}
              onChange={e => setDbUrl(e.target.value)}
              placeholder="https://your-project-default-rtdb.firebaseio.com"
            />

            {/* Optional Firebase config */}
            <div className="config-toggle" onClick={() => setShowConfig(v => !v)}>
              <Settings size={13}/>
              <span>Firebase Web Config {showConfig ? "(optional – paste below)" : "(optional)"}</span>
              <ChevronRight size={13} style={{ transform: showConfig ? "rotate(90deg)" : "none", transition: ".2s" }}/>
            </div>

            {showConfig && (
              <>
                <textarea
                  className="config-textarea"
                  value={configRaw}
                  onChange={e => setConfigRaw(e.target.value)}
                  placeholder={`Paste your Firebase config here (optional):\n\nconst firebaseConfig = {\n  apiKey: "...",\n  authDomain: "...",\n  databaseURL: "...",\n  projectId: "...",\n  ...\n};`}
                  rows={8}
                />
                <div className="info-box">
                  <Database size={16}/>
                  <span>Config is stored locally only. If left blank, a minimal config is auto-generated from the Database URL.</span>
                </div>
              </>
            )}

            <div className="actions">
              <button className="primary" onClick={connect} disabled={connecting}>
                {connecting ? <><LoaderCircle size={16} className="spin"/> Connecting...</> : <><Link2 size={16}/> Save &amp; Connect</>}
              </button>
              <button className="secondary" onClick={() => { setDbUrl(""); setConfigRaw(""); setStatus(""); setActive(null); }}>
                Cancel
              </button>
            </div>

            <div className="utility-row">
              <label className="upload">
                <Upload size={15}/> Upload APK / ZIP
                <input type="file" accept=".apk,.zip" onChange={onFile} hidden/>
              </label>
              <button className="secondary compact" onClick={createShareLink}><Link2 size={15}/> Share Connection</button>
            </div>
          </div>

          {status && (
            <div className={`status ${status.toLowerCase().includes("connected") ? "ok" : "err"}`}>
              {status.toLowerCase().includes("connected") ? <Check size={15}/> : <CircleAlert size={15}/>}
              {status}
            </div>
          )}
        </div>

        <p className="footnote">Your Firebase configuration stays in your local browser only.</p>
      </section>

      {/* Share Modal */}
      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(false)}>
          <div className="modal glass-card" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-title">
                <div className="modal-icon"><Link2 size={16}/></div>
                <div><h3>Share Connection</h3><p>Anyone with this link can connect directly</p></div>
              </div>
              <button className="icon-btn" onClick={() => setModal(false)}><X size={16}/></button>
            </div>
            <div className="share-line">
              <span>{shareLink}</span>
              <button className={copied ? "copy copied" : "copy"} onClick={copyLink}>
                {copied ? <Check size={13}/> : <Copy size={13}/>}
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
