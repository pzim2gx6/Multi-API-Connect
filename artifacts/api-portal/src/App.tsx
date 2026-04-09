import { useState, useEffect, useCallback } from "react";

const BG = "hsl(222, 47%, 11%)";
const BG_CARD = "hsl(222, 47%, 15%)";
const BG_CODE = "hsl(222, 47%, 8%)";
const BORDER = "hsl(222, 30%, 22%)";
const TEXT = "hsl(210, 40%, 96%)";
const TEXT_MUTED = "hsl(215, 20%, 65%)";
const ACCENT_BLUE = "hsl(217, 91%, 60%)";
const ACCENT_GREEN = "hsl(142, 71%, 45%)";
const ACCENT_PURPLE = "hsl(263, 70%, 50%)";
const ACCENT_ORANGE = "hsl(25, 95%, 53%)";
const ACCENT_RED = "hsl(0, 72%, 51%)";

const BASE_URL = window.location.origin;

const MODELS = [
  { id: "gpt-5.2", provider: "OpenAI" },
  { id: "gpt-5-mini", provider: "OpenAI" },
  { id: "gpt-5-nano", provider: "OpenAI" },
  { id: "o4-mini", provider: "OpenAI" },
  { id: "o3", provider: "OpenAI" },
  { id: "claude-opus-4-6", provider: "Anthropic" },
  { id: "claude-sonnet-4-6", provider: "Anthropic" },
  { id: "claude-haiku-4-5", provider: "Anthropic" },
];

const ENDPOINTS = [
  { method: "GET", path: "/v1/models", label: "List Models", compat: "both" },
  { method: "POST", path: "/v1/chat/completions", label: "Chat Completions", compat: "OpenAI" },
  { method: "POST", path: "/v1/messages", label: "Messages", compat: "Anthropic" },
];

const SETUP_STEPS = [
  { title: "Add Service", desc: "Open CherryStudio Settings > Model Services > Add a new service." },
  { title: "Configure Base URL", desc: `Set API Base URL to: ${typeof window !== "undefined" ? window.location.origin : ""}/v1. Choose OpenAI or Anthropic provider type.` },
  { title: "Enter API Key", desc: "Paste your PROXY_API_KEY as the API Key." },
  { title: "Select Model", desc: "Choose any model from the available list and start chatting." },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <button
      onClick={copy}
      style={{
        background: copied ? ACCENT_GREEN : "hsla(217, 91%, 60%, 0.15)",
        color: copied ? "#fff" : ACCENT_BLUE,
        border: "none",
        borderRadius: 6,
        padding: "6px 14px",
        fontSize: 13,
        fontWeight: 500,
        cursor: "pointer",
        transition: "all 0.2s",
        whiteSpace: "nowrap",
      }}
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function StatusDot({ online }: { online: boolean | null }) {
  const color = online === null ? TEXT_MUTED : online ? ACCENT_GREEN : ACCENT_RED;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: color,
          boxShadow: online ? `0 0 8px ${color}` : "none",
          display: "inline-block",
        }}
      />
      <span style={{ fontSize: 13, color: TEXT_MUTED }}>
        {online === null ? "Checking..." : online ? "Online" : "Offline"}
      </span>
    </span>
  );
}

function MethodBadge({ method }: { method: string }) {
  const bg = method === "GET" ? ACCENT_GREEN : ACCENT_PURPLE;
  return (
    <span
      style={{
        background: bg,
        color: "#fff",
        fontSize: 11,
        fontWeight: 700,
        padding: "3px 8px",
        borderRadius: 4,
        letterSpacing: 0.5,
      }}
    >
      {method}
    </span>
  );
}

function CompatTag({ compat }: { compat: string }) {
  let bg: string, label: string;
  if (compat === "OpenAI") {
    bg = "hsla(217, 91%, 60%, 0.15)";
    label = "OpenAI";
  } else if (compat === "Anthropic") {
    bg = "hsla(25, 95%, 53%, 0.15)";
    label = "Anthropic";
  } else {
    bg = "hsla(215, 20%, 65%, 0.12)";
    label = "Both";
  }
  return (
    <span
      style={{
        background: bg,
        color: compat === "OpenAI" ? ACCENT_BLUE : compat === "Anthropic" ? ACCENT_ORANGE : TEXT_MUTED,
        fontSize: 11,
        fontWeight: 600,
        padding: "3px 8px",
        borderRadius: 4,
      }}
    >
      {label}
    </span>
  );
}

function ProviderTag({ provider }: { provider: string }) {
  const isOpenAI = provider === "OpenAI";
  return (
    <span
      style={{
        background: isOpenAI ? "hsla(217, 91%, 60%, 0.15)" : "hsla(25, 95%, 53%, 0.15)",
        color: isOpenAI ? ACCENT_BLUE : ACCENT_ORANGE,
        fontSize: 11,
        fontWeight: 600,
        padding: "3px 8px",
        borderRadius: 4,
      }}
    >
      {provider}
    </span>
  );
}

const CURL_EXAMPLE = `curl ${typeof window !== "undefined" ? window.location.origin : ""}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_PROXY_API_KEY" \\
  -d '{
    "model": "gpt-5.2",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'`;

function App() {
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/healthz")
      .then((r) => setOnline(r.ok))
      .catch(() => setOnline(false));
  }, []);

  const sectionStyle: React.CSSProperties = {
    background: BG_CARD,
    border: `1px solid ${BORDER}`,
    borderRadius: 12,
    padding: 24,
    marginBottom: 24,
  };

  const headingStyle: React.CSSProperties = {
    fontSize: 18,
    fontWeight: 700,
    color: TEXT,
    marginBottom: 16,
    display: "flex",
    alignItems: "center",
    gap: 8,
  };

  return (
    <div style={{ background: BG, minHeight: "100vh", color: TEXT, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "40px 20px" }}>
        <header style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={ACCENT_BLUE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
            <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, background: `linear-gradient(135deg, ${ACCENT_BLUE}, ${ACCENT_PURPLE})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              AI Proxy API
            </h1>
          </div>
          <p style={{ color: TEXT_MUTED, fontSize: 15, margin: 0 }}>
            OpenAI + Anthropic dual-compatible reverse proxy
          </p>
          <div style={{ marginTop: 12 }}>
            <StatusDot online={online} />
          </div>
        </header>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>Connection Details</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: BG_CODE, borderRadius: 8, padding: "12px 16px" }}>
              <div>
                <div style={{ fontSize: 12, color: TEXT_MUTED, marginBottom: 4 }}>Base URL</div>
                <code style={{ fontSize: 14, color: ACCENT_BLUE }}>{BASE_URL}/v1</code>
              </div>
              <CopyButton text={`${BASE_URL}/v1`} />
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: BG_CODE, borderRadius: 8, padding: "12px 16px" }}>
              <div>
                <div style={{ fontSize: 12, color: TEXT_MUTED, marginBottom: 4 }}>Authorization Header</div>
                <code style={{ fontSize: 14, color: ACCENT_BLUE }}>Authorization: Bearer YOUR_PROXY_API_KEY</code>
              </div>
              <CopyButton text="Authorization: Bearer YOUR_PROXY_API_KEY" />
            </div>
          </div>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>API Endpoints</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {ENDPOINTS.map((ep) => (
              <div key={ep.path} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: BG_CODE, borderRadius: 8, padding: "12px 16px", flexWrap: "wrap", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                  <MethodBadge method={ep.method} />
                  <code style={{ fontSize: 14, color: TEXT, overflow: "hidden", textOverflow: "ellipsis" }}>{BASE_URL}{ep.path}</code>
                  <CompatTag compat={ep.compat} />
                </div>
                <CopyButton text={`${BASE_URL}${ep.path}`} />
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12, fontSize: 13, color: TEXT_MUTED, lineHeight: 1.6 }}>
            <strong>/v1/chat/completions</strong> accepts OpenAI-format requests. Claude models are auto-converted.<br />
            <strong>/v1/messages</strong> accepts Anthropic Messages API format. GPT/o-series models are auto-converted.
          </div>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>Available Models</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
            {MODELS.map((m) => (
              <div key={m.id} style={{ background: BG_CODE, borderRadius: 8, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <code style={{ fontSize: 13, color: TEXT }}>{m.id}</code>
                <ProviderTag provider={m.provider} />
              </div>
            ))}
          </div>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>CherryStudio Setup Guide</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {SETUP_STEPS.map((step, i) => (
              <div key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: `linear-gradient(135deg, ${ACCENT_BLUE}, ${ACCENT_PURPLE})`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 14,
                    fontWeight: 700,
                    color: "#fff",
                    flexShrink: 0,
                  }}
                >
                  {i + 1}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15, color: TEXT, marginBottom: 4 }}>{step.title}</div>
                  <div style={{ fontSize: 13, color: TEXT_MUTED, lineHeight: 1.6 }}>{step.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>Quick Test</h2>
          <div style={{ position: "relative" }}>
            <pre
              style={{
                background: BG_CODE,
                borderRadius: 8,
                padding: 16,
                overflow: "auto",
                fontSize: 13,
                lineHeight: 1.6,
                margin: 0,
                color: TEXT_MUTED,
              }}
            >
              <code>
                <span style={{ color: ACCENT_GREEN }}>curl</span>{" "}
                <span style={{ color: ACCENT_BLUE }}>{BASE_URL}/v1/chat/completions</span>{" \\\n"}
                {"  "}<span style={{ color: ACCENT_ORANGE }}>-H</span>{" "}<span style={{ color: "hsl(35, 90%, 65%)" }}>"Content-Type: application/json"</span>{" \\\n"}
                {"  "}<span style={{ color: ACCENT_ORANGE }}>-H</span>{" "}<span style={{ color: "hsl(35, 90%, 65%)" }}>"Authorization: Bearer YOUR_PROXY_API_KEY"</span>{" \\\n"}
                {"  "}<span style={{ color: ACCENT_ORANGE }}>-d</span>{" "}<span style={{ color: "hsl(35, 90%, 65%)" }}>{"'"}</span>{"{\n"}
                {"    "}<span style={{ color: ACCENT_BLUE }}>"model"</span>: <span style={{ color: ACCENT_GREEN }}>"gpt-5.2"</span>,{"\n"}
                {"    "}<span style={{ color: ACCENT_BLUE }}>"messages"</span>: [{"\n"}
                {"      "}{"{"}<span style={{ color: ACCENT_BLUE }}>"role"</span>: <span style={{ color: ACCENT_GREEN }}>"user"</span>, <span style={{ color: ACCENT_BLUE }}>"content"</span>: <span style={{ color: ACCENT_GREEN }}>"Hello!"</span>{"}"}{"\n"}
                {"    "}]{"\n"}
                {"  "}{"}"}<span style={{ color: "hsl(35, 90%, 65%)" }}>{"'"}</span>
              </code>
            </pre>
            <div style={{ position: "absolute", top: 8, right: 8 }}>
              <CopyButton text={CURL_EXAMPLE} />
            </div>
          </div>
        </div>

        <footer style={{ textAlign: "center", padding: "24px 0", borderTop: `1px solid ${BORDER}` }}>
          <p style={{ color: TEXT_MUTED, fontSize: 13, margin: 0 }}>
            Powered by Replit AI Integrations &middot; OpenAI SDK + Anthropic SDK &middot; Express
          </p>
        </footer>
      </div>
    </div>
  );
}

export default App;
