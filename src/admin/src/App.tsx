export interface BotConfig {
  username: string;
  telegram_token_set: boolean;
  webhook_secret_set: boolean;
  is_active: boolean;
  llm_key_id?: string;
  model: string;
  system_prompt: string;
  default_language: string;
  welcome_messages: Array<{ lang: string; text: string }>;
  max_history: number;
  session_ttl: number;
  group_mode: "all" | "mention_only" | "admin_only";
  admin_user_ids?: number[];
  mention_trigger?: string;
  reply_to_mentions: boolean;
  streaming: boolean;
}

export interface StoredApiKey {
  id: string;
  name: string;
  provider: "openrouter" | "openai" | "anthropic" | "custom";
  key_set: boolean;
}

interface Settings {
  default_model: string;
  default_system_prompt: string;
  default_language: string;
  default_welcome_messages: Array<{ lang: string; text: string }>;
  max_history: number;
  session_ttl: number;
}

const defaultBot: BotConfig = {
  username: "",
  telegram_token_set: false,
  webhook_secret_set: false,
  is_active: true,
  model: "openai/gpt-4o-mini",
  system_prompt: "You are a helpful assistant.",
  default_language: "en",
  welcome_messages: [{ lang: "en", text: "Test bot is online." }],
  max_history: 20,
  session_ttl: 3600,
  group_mode: "all",
  reply_to_mentions: true,
  streaming: true
};

const defaultKey = { name: "", provider: "openrouter" as const, key: "" };
const defaultSettings: Settings = {
  default_model: "openai/gpt-4o-mini",
  default_system_prompt: "You are a helpful assistant.",
  default_language: "en",
  default_welcome_messages: [{ lang: "en", text: "Hello. How can I help?" }],
  max_history: 20,
  session_ttl: 3600
};

export default function App() {
  const [password, setPassword] = React.useState(localStorage.getItem("adminPassword") ?? "");
  const [authenticated, setAuthenticated] = React.useState(Boolean(password));
  const [error, setError] = React.useState("");
  const [health, setHealth] = React.useState<unknown>(null);
  const [bots, setBots] = React.useState<BotConfig[]>([]);
  const [keys, setKeys] = React.useState<StoredApiKey[]>([]);
  const [settings, setSettings] = React.useState<Settings>(defaultSettings);
  const [botForm, setBotForm] = React.useState<BotConfig & { telegram_token?: string; webhook_secret?: string }>(defaultBot);
  const [keyForm, setKeyForm] = React.useState(defaultKey);
  const [status, setStatus] = React.useState("");

  async function api(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Basic ${btoa(`admin:${password}`)}`);
    headers.set("Content-Type", "application/json");
    const response = await fetch(path, { ...init, headers });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) {
      throw new Error(data?.error ?? `${response.status} ${text}`);
    }
    return data;
  }

  async function login() {
    try {
      const response = await fetch("/admin", { headers: { Authorization: `Basic ${btoa(`admin:${password}`)}` } });
      if (!response.ok) {
        throw new Error("Invalid admin password");
      }
      localStorage.setItem("adminPassword", password);
      setAuthenticated(true);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    }
  }

  async function refresh() {
    try {
      const [healthData, botsData, keysData, settingsData] = await Promise.all([
        fetch("/health").then((response) => response.json()),
        api("/api/bots"),
        api("/api/keys"),
        api("/api/settings")
      ]);
      setHealth(healthData);
      setBots(botsData.bots ?? []);
      setKeys(keysData.keys ?? []);
      setSettings(settingsData.settings ?? defaultSettings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed");
    }
  }

  async function saveBot() {
    const payload: Record<string, unknown> = { ...botForm };
    if (botForm.telegram_token) payload.telegram_token = botForm.telegram_token;
    if (botForm.webhook_secret) payload.webhook_secret = botForm.webhook_secret;
    await api(`/api/bots/${encodeURIComponent(botForm.username)}`, {
      method: bots.some((bot) => bot.username === botForm.username) ? "PUT" : "POST",
      body: JSON.stringify(payload)
    });
    setStatus("Bot saved");
    await refresh();
  }

  async function saveKey() {
    await api("/api/keys", { method: "POST", body: JSON.stringify(keyForm) });
    setKeyForm(defaultKey);
    setStatus("API key saved");
    await refresh();
  }

  async function saveSettings() {
    await api("/api/settings", { method: "PUT", body: JSON.stringify(settings) });
    setStatus("Settings saved");
    await refresh();
  }

  async function registerWebhook(username: string) {
    await api(`/api/bots/${encodeURIComponent(username)}/register-webhook`, { method: "POST" });
    setStatus(`Webhook registered for ${username}`);
  }

  async function webhookInfo(username: string) {
    const data = await api(`/api/bots/${encodeURIComponent(username)}/webhook-info`);
    setStatus(JSON.stringify(data, null, 2));
  }

  React.useEffect(() => {
    if (authenticated) {
      void refresh();
    }
  }, [authenticated]);

  if (!authenticated) {
    return (
      <main className="shell">
        <section className="card">
          <h1>Telegram Bot Platform</h1>
          <label>
            Admin password
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          <button onClick={login}>Sign in</button>
          {error ? <p className="error">{error}</p> : null}
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="header">
        <div>
          <h1>Telegram Bot Platform</h1>
          <p>Cloudflare Worker admin for Telegram bots, KV persistence, and AI provider routing.</p>
        </div>
        <button onClick={() => { localStorage.removeItem("adminPassword"); setAuthenticated(false); }}>Sign out</button>
      </header>

      <section className="grid">
        <div className="card">
          <h2>Health</h2>
          <pre>{JSON.stringify(health, null, 2)}</pre>
        </div>
        <div className="card">
          <h2>Status</h2>
          <p>{status || "Ready"}</p>
          {error ? <p className="error">{error}</p> : null}
        </div>
      </section>

      <section className="grid">
        <div className="card wide">
          <h2>Bot configuration</h2>
          <div className="grid two">
            <label>
              Username
              <input value={botForm.username} onChange={(event) => setBotForm({ ...botForm, username: event.target.value })} />
            </label>
            <label>
              Telegram token
              <input type="password" value={botForm.telegram_token ?? ""} onChange={(event) => setBotForm({ ...botForm, telegram_token: event.target.value })} />
            </label>
            <label>
              Webhook secret
              <input type="password" value={botForm.webhook_secret ?? ""} onChange={(event) => setBotForm({ ...botForm, webhook_secret: event.target.value })} />
            </label>
            <label>
              Model
              <input value={botForm.model} onChange={(event) => setBotForm({ ...botForm, model: event.target.value })} />
            </label>
          </div>
          <label>
            System prompt
            <textarea value={botForm.system_prompt} onChange={(event) => setBotForm({ ...botForm, system_prompt: event.target.value })} />
          </label>
          <div className="grid two">
            <label>
              Default language
              <input value={botForm.default_language} onChange={(event) => setBotForm({ ...botForm, default_language: event.target.value })} />
            </label>
            <label>
              Group mode
              <select value={botForm.group_mode} onChange={(event) => setBotForm({ ...botForm, group_mode: event.target.value as BotConfig["group_mode"] })}>
                <option value="all">all</option>
                <option value="mention_only">mention_only</option>
                <option value="admin_only">admin_only</option>
              </select>
            </label>
          </div>
          <div className="grid two">
            <label>
              Max history
              <input type="number" value={botForm.max_history} onChange={(event) => setBotForm({ ...botForm, max_history: Number(event.target.value) })} />
            </label>
            <label>
              Session TTL seconds
              <input type="number" value={botForm.session_ttl} onChange={(event) => setBotForm({ ...botForm, session_ttl: Number(event.target.value) })} />
            </label>
          </div>
          <label className="check">
            <input type="checkbox" checked={botForm.is_active} onChange={(event) => setBotForm({ ...botForm, is_active: event.target.checked })} />
            Active
          </label>
          <button onClick={saveBot}>Save bot</button>
        </div>

        <div className="card">
          <h2>API keys</h2>
          <input placeholder="Key name" value={keyForm.name} onChange={(event) => setKeyForm({ ...keyForm, name: event.target.value })} />
          <select value={keyForm.provider} onChange={(event) => setKeyForm({ ...keyForm, provider: event.target.value as typeof keyForm.provider })}>
            <option value="openrouter">openrouter</option>
            <option value="openai">openai</option>
            <option value="anthropic">anthropic</option>
            <option value="custom">custom</option>
          </select>
          <input type="password" placeholder="Provider key" value={keyForm.key} onChange={(event) => setKeyForm({ ...keyForm, key: event.target.value })} />
          <button onClick={saveKey}>Save key</button>
          <ul>
            {keys.map((key) => <li key={key.id}>{key.name} ({key.provider}, {key.key_set ? "set" : "missing"})</li>)}
          </ul>
        </div>
      </section>

      <section className="grid">
        <div className="card wide">
          <h2>Bots</h2>
          <table>
            <thead><tr><th>Bot</th><th>Token</th><th>Webhook</th><th>Active</th><th>Actions</th></tr></thead>
            <tbody>
              {bots.map((bot) => (
                <tr key={bot.username}>
                  <td>{bot.username}</td>
                  <td>{bot.telegram_token_set ? "set" : "missing"}</td>
                  <td>{bot.webhook_secret_set ? "set" : "missing"}</td>
                  <td>{bot.is_active ? "yes" : "no"}</td>
                  <td>
                    <button onClick={() => setBotForm({ ...bot })}>Edit</button>
                    <button onClick={() => registerWebhook(bot.username)}>Register webhook</button>
                    <button onClick={() => webhookInfo(bot.username)}>Check status</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card wide">
          <h2>Global settings</h2>
          <input value={settings.default_model} onChange={(event) => setSettings({ ...settings, default_model: event.target.value })} />
          <textarea value={settings.default_system_prompt} onChange={(event) => setSettings({ ...settings, default_system_prompt: event.target.value })} />
          <button onClick={saveSettings}>Save settings</button>
        </div>
      </section>
    </main>
  );
}
