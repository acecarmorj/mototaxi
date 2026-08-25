import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api";

const C = {
  bg: "#F3F4F6",
  white: "#FFFFFF",
  soft: "#F9FAFB",
  red: "#E11D2E",
  ink: "#111111",
  muted: "#6B7280",
  line: "rgba(17,17,17,0.1)",
  sidebar: "#111111",
};

const FONT = "'DM Sans', system-ui, sans-serif";
const DISPLAY = "'Space Grotesk', 'DM Sans', system-ui, sans-serif";
const ADMIN_PASS_KEY = "carmoto:admin:password";

const PERIODS = [
  { id: "today", label: "Hoje" },
  { id: "7d", label: "7 dias" },
  { id: "30d", label: "30 dias" },
  { id: "month", label: "Mês" },
  { id: "all", label: "Tudo" },
];

const NAV = [
  { id: "overview", label: "Visão geral" },
  { id: "rides", label: "Corridas" },
  { id: "drivers", label: "Motoristas" },
  { id: "passengers", label: "Passageiros" },
  { id: "finance", label: "Financeiro" },
  { id: "driver-reports", label: "Por motorista" },
];

function formatPhone(raw) {
  const d = String(raw || "").replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return raw || "—";
}

function money(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function statusLabel(s) {
  const map = {
    searching: "Buscando",
    accepted: "Aceita",
    in_progress: "Em andamento",
    completed: "Concluída",
    cancelled: "Cancelada",
    expired: "Expirada",
  };
  return map[s] || s;
}

function rideStatus(r) {
  return r.display_status || (r.cancel_reason === "expired" ? "expired" : r.status);
}

function StatusPill({ status }) {
  const tone =
    status === "searching"
      ? { bg: "#FEF2F2", fg: C.red }
      : status === "accepted" || status === "in_progress"
      ? { bg: "#111111", fg: "#fff" }
      : status === "completed"
      ? { bg: "#ECFDF5", fg: "#065F46" }
      : status === "expired"
      ? { bg: "#FFF7ED", fg: "#C2410C" }
      : { bg: "#F3F4F6", fg: C.muted };
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        background: tone.bg,
        color: tone.fg,
        whiteSpace: "nowrap",
      }}
    >
      {statusLabel(status)}
    </span>
  );
}

function StatCard({ label, value, hint }) {
  return (
    <div
      style={{
        background: C.white,
        border: `1px solid ${C.line}`,
        borderRadius: 12,
        padding: "14px 16px",
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 24, lineHeight: 1.1 }}>{value}</div>
      {hint ? <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>{hint}</div> : null}
    </div>
  );
}

function Panel({ title, children, extra }) {
  return (
    <div
      style={{
        background: C.white,
        border: `1px solid ${C.line}`,
        borderRadius: 12,
        overflow: "hidden",
        marginBottom: 16,
      }}
    >
      {(title || extra) && (
        <div
          style={{
            padding: "12px 16px",
            borderBottom: `1px solid ${C.line}`,
            display: "flex",
            alignItems: "center",
            gap: 12,
            justifyContent: "space-between",
          }}
        >
          <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 15 }}>{title}</div>
          {extra}
        </div>
      )}
      {children}
    </div>
  );
}

function BarChart({ data, valueKey = "revenue", labelKey = "day", color = C.red }) {
  const max = Math.max(1, ...data.map((d) => Number(d[valueKey]) || 0));
  if (!data.length) {
    return (
      <div style={{ padding: 24, color: C.muted, fontSize: 13, textAlign: "center" }}>
        Sem dados no período — zeros honestos.
      </div>
    );
  }
  return (
    <div style={{ padding: "16px 16px 12px", display: "flex", alignItems: "flex-end", gap: 6, minHeight: 160 }}>
      {data.map((d) => {
        const v = Number(d[valueKey]) || 0;
        const h = Math.max(2, Math.round((v / max) * 110));
        return (
          <div key={d[labelKey]} style={{ flex: 1, minWidth: 0, textAlign: "center" }} title={`${d[labelKey]}: ${v}`}>
            <div
              style={{
                height: h,
                background: color,
                borderRadius: "6px 6px 2px 2px",
                opacity: v ? 1 : 0.25,
                marginBottom: 6,
              }}
            />
            <div style={{ fontSize: 9, color: C.muted, overflow: "hidden", textOverflow: "ellipsis" }}>
              {String(d[labelKey]).slice(5)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatusBars({ byStatus }) {
  const items = [
    { key: "searching", label: "Buscando", color: C.red },
    { key: "accepted", label: "Aceitas", color: "#111" },
    { key: "in_progress", label: "Andamento", color: "#374151" },
    { key: "completed", label: "Concluídas", color: "#059669" },
    { key: "cancelled", label: "Canceladas", color: "#9CA3AF" },
    { key: "expired", label: "Expiradas", color: "#EA580C" },
  ];
  const total = Math.max(1, Number(byStatus?.total) || items.reduce((s, i) => s + (byStatus?.[i.key] || 0), 0));
  return (
    <div style={{ padding: 16 }}>
      {items.map((i) => {
        const n = Number(byStatus?.[i.key]) || 0;
        const pct = Math.round((n / total) * 100);
        return (
          <div key={i.key} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
              <span style={{ color: C.muted }}>{i.label}</span>
              <span style={{ fontWeight: 700 }}>
                {n} <span style={{ color: C.muted, fontWeight: 500 }}>({pct}%)</span>
              </span>
            </div>
            <div style={{ height: 8, background: C.soft, borderRadius: 999, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: i.color, borderRadius: 999 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function downloadCsv(filename, rows) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [keys.join(","), ...rows.map((r) => keys.map((k) => esc(r[k])).join(","))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function thStyle() {
  return {
    padding: "10px 12px",
    fontWeight: 600,
    color: C.muted,
    borderBottom: `1px solid ${C.line}`,
    whiteSpace: "nowrap",
    textAlign: "left",
  };
}

function tdStyle(extra = {}) {
  return { padding: "10px 12px", borderBottom: `1px solid ${C.line}`, ...extra };
}

export default function AdminApp() {
  const [password, setPassword] = useState(() => localStorage.getItem(ADMIN_PASS_KEY) || "");
  const [inputPass, setInputPass] = useState("");
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState("overview");
  const [period, setPeriod] = useState("30d");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [summary, setSummary] = useState(null);
  const [driverReports, setDriverReports] = useState([]);
  const [passengers, setPassengers] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [rides, setRides] = useState([]);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const loadAll = useCallback(
    async (pass = password) => {
      if (!pass) return;
      setBusy(true);
      setError("");
      try {
        const [sum, reports, pax, drv, rds] = await Promise.all([
          api.adminSummary(pass, period),
          api.adminDriverReports(pass, period),
          api.adminPassengers(pass, q),
          api.adminDrivers(pass, q),
          api.adminRides(pass, { q, status: statusFilter, period }),
        ]);
        setSummary(sum);
        setDriverReports(reports.drivers || []);
        setPassengers(pax.passengers || []);
        setDrivers(drv.drivers || []);
        setRides(rds.rides || []);
        setAuthed(true);
        localStorage.setItem(ADMIN_PASS_KEY, pass);
        setPassword(pass);
      } catch (e) {
        setAuthed(false);
        setError(e.message || "Falha ao autenticar");
      } finally {
        setBusy(false);
      }
    },
    [password, q, statusFilter, period]
  );

  useEffect(() => {
    if (password) loadAll(password);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!authed) return;
    const t = setTimeout(() => loadAll(password), 280);
    return () => clearTimeout(t);
  }, [q, statusFilter, period, tab, authed, loadAll, password]);

  async function cancelRide(id) {
    if (!confirm("Cancelar esta corrida?")) return;
    try {
      await api.adminCancelRide(password, id);
      setSelected(null);
      await loadAll(password);
    } catch (e) {
      setError(e.message);
    }
  }

  async function toggleBlock(driver) {
    const next = !driver.is_blocked;
    if (!confirm(next ? "Bloquear motorista?" : "Desbloquear motorista?")) return;
    try {
      await api.adminBlockDriver(password, driver.id || driver.driver_id, next);
      await loadAll(password);
    } catch (e) {
      setError(e.message);
    }
  }

  const completedRides = useMemo(
    () => rides.filter((r) => r.status === "completed"),
    [rides]
  );

  const periodLabel = PERIODS.find((p) => p.id === period)?.label || period;

  if (!authed) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: C.bg,
          fontFamily: FONT,
          color: C.ink,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 420,
            background: C.white,
            border: `1px solid ${C.line}`,
            borderRadius: 16,
            padding: 28,
          }}
        >
          <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 24, marginBottom: 6 }}>
            Admin <span style={{ color: C.red }}>MotoJá</span>
          </div>
          <p style={{ fontSize: 13, color: C.muted, marginBottom: 20, lineHeight: 1.45 }}>
            Painel operacional desktop — estatísticas, financeiro e relatórios por motorista.
          </p>
          <input
            type="password"
            value={inputPass}
            onChange={(e) => setInputPass(e.target.value)}
            placeholder="Senha admin"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && loadAll(inputPass)}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "12px 14px",
              borderRadius: 10,
              border: `1px solid ${C.line}`,
              background: C.soft,
              fontFamily: FONT,
              fontSize: 15,
              marginBottom: 12,
              outline: "none",
            }}
          />
          {error && <p style={{ color: C.red, fontSize: 13, marginBottom: 10 }}>{error}</p>}
          <button
            onClick={() => loadAll(inputPass)}
            disabled={busy || !inputPass}
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 10,
              border: "none",
              background: C.red,
              color: "#fff",
              fontWeight: 700,
              fontSize: 14,
              cursor: "pointer",
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? "Entrando…" : "Entrar no painel"}
          </button>
        </div>
      </div>
    );
  }

  const by = summary?.by_status || {};
  const fin = summary?.finance || {};

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.bg,
        fontFamily: FONT,
        color: C.ink,
        display: "flex",
      }}
    >
      <aside
        style={{
          width: 220,
          flexShrink: 0,
          background: C.sidebar,
          color: "#fff",
          padding: "22px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 20, marginBottom: 18, padding: "0 8px" }}>
          Moto<span style={{ color: C.red }}>Já</span>
          <div style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.55)", marginTop: 4 }}>
            Painel admin
          </div>
        </div>
        {NAV.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              setTab(item.id);
              setSelected(null);
            }}
            style={{
              textAlign: "left",
              padding: "10px 12px",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 14,
              background: tab === item.id ? C.red : "transparent",
              color: "#fff",
            }}
          >
            {item.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button
          onClick={() => loadAll(password)}
          style={{
            textAlign: "left",
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.15)",
            background: "transparent",
            color: "rgba(255,255,255,0.85)",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: 13,
          }}
        >
          {busy ? "Atualizando…" : "Atualizar dados"}
        </button>
        <button
          onClick={() => {
            localStorage.removeItem(ADMIN_PASS_KEY);
            setAuthed(false);
            setPassword("");
          }}
          style={{
            textAlign: "left",
            padding: "10px 12px",
            borderRadius: 8,
            border: "none",
            background: "transparent",
            color: "rgba(255,255,255,0.45)",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: 13,
          }}
        >
          Sair
        </button>
      </aside>

      <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <header
          style={{
            background: C.white,
            borderBottom: `1px solid ${C.line}`,
            padding: "14px 24px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 18 }}>
              {NAV.find((n) => n.id === tab)?.label}
            </div>
            <div style={{ fontSize: 12, color: C.muted }}>
              Carmo, RJ · período: {periodLabel} · dados reais do D1
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {PERIODS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                style={{
                  padding: "7px 10px",
                  borderRadius: 8,
                  border: `1px solid ${period === p.id ? C.red : C.line}`,
                  background: period === p.id ? C.red : C.white,
                  color: period === p.id ? "#fff" : C.ink,
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          {(tab === "rides" || tab === "drivers" || tab === "passengers") && (
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar…"
              style={{
                width: 220,
                maxWidth: "100%",
                padding: "9px 12px",
                borderRadius: 8,
                border: `1px solid ${C.line}`,
                background: C.soft,
                fontSize: 13,
                outline: "none",
              }}
            />
          )}
          {tab === "rides" && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                padding: "9px 12px",
                borderRadius: 8,
                border: `1px solid ${C.line}`,
                background: C.white,
                fontSize: 13,
              }}
            >
              <option value="">Todos status</option>
              <option value="searching">Buscando</option>
              <option value="accepted">Aceita</option>
              <option value="in_progress">Em andamento</option>
              <option value="completed">Concluída</option>
              <option value="cancelled">Cancelada</option>
              <option value="expired">Expirada</option>
            </select>
          )}
        </header>

        <div style={{ padding: 24, flex: 1, overflow: "auto" }}>
          {error && <div style={{ color: C.red, fontSize: 13, marginBottom: 12 }}>{error}</div>}

          {tab === "overview" && (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: 12,
                  marginBottom: 16,
                }}
              >
                <StatCard label="Corridas hoje" value={summary?.rides_today ?? 0} />
                <StatCard label="Corridas (7d)" value={summary?.rides_week ?? 0} />
                <StatCard label="Corridas (total)" value={summary?.rides_total ?? 0} />
                <StatCard
                  label="Online agora"
                  value={`${summary?.drivers_online ?? 0}/${summary?.drivers ?? 0}`}
                  hint="online / cadastrados"
                />
                <StatCard label="Passageiros" value={summary?.passengers ?? 0} />
                <StatCard
                  label="Tempo médio aceite"
                  value={
                    summary?.avg_accept_seconds != null ? `${summary.avg_accept_seconds}s` : "—"
                  }
                  hint="no período filtrado"
                />
                <StatCard label="Faturamento (período)" value={money(fin.revenue)} />
                <StatCard label="Ticket médio" value={money(fin.ticket_avg)} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16 }}>
                <Panel title={`Faturamento diário · ${periodLabel}`}>
                  <BarChart data={summary?.daily || []} valueKey="revenue" />
                </Panel>
                <Panel title={`Corridas por status · ${periodLabel}`}>
                  <StatusBars byStatus={by} />
                </Panel>
              </div>

              <Panel title="Volume diário (corridas)">
                <BarChart data={summary?.daily || []} valueKey="rides" color={C.ink} />
              </Panel>
            </>
          )}

          {tab === "finance" && (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                  gap: 12,
                  marginBottom: 16,
                }}
              >
                <StatCard label="Faturamento estimado" value={money(fin.revenue)} hint="só concluídas" />
                <StatCard label="Ticket médio" value={money(fin.ticket_avg)} />
                <StatCard label="Concluídas" value={fin.completed ?? 0} />
                <StatCard label="Canceladas (sem valor)" value={fin.cancelled ?? 0} />
                <StatCard label="Expiradas (sem valor)" value={fin.expired ?? 0} />
              </div>

              <Panel
                title="Faturamento por dia"
                extra={
                  <button
                    onClick={() =>
                      downloadCsv(
                        `motoja-financeiro-${period}.csv`,
                        (summary?.daily || []).map((d) => ({
                          dia: d.day,
                          corridas: d.rides,
                          concluidas: d.completed,
                          faturamento: d.revenue,
                        }))
                      )
                    }
                    style={{
                      padding: "6px 10px",
                      borderRadius: 8,
                      border: `1px solid ${C.line}`,
                      background: C.soft,
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    Export CSV diário
                  </button>
                }
              >
                <BarChart data={summary?.daily || []} valueKey="revenue" />
              </Panel>

              <Panel
                title="Faturamento por motorista"
                extra={
                  <button
                    onClick={() =>
                      downloadCsv(
                        `motoja-motoristas-${period}.csv`,
                        driverReports.map((d) => ({
                          rank: d.rank,
                          nome: d.name,
                          colete: d.colete,
                          concluidas: d.completed,
                          canceladas: d.cancelled,
                          faturamento: d.revenue,
                          ticket_medio: d.ticket_avg,
                        }))
                      )
                    }
                    style={{
                      padding: "6px 10px",
                      borderRadius: 8,
                      border: `1px solid ${C.line}`,
                      background: C.soft,
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    Export CSV
                  </button>
                }
              >
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: C.soft }}>
                      {["#", "Motorista", "Concluídas", "Canceladas", "Faturamento", "Ticket"].map((h) => (
                        <th key={h} style={thStyle()}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {driverReports.map((d) => (
                      <tr key={d.driver_id}>
                        <td style={tdStyle({ fontWeight: 700 })}>{d.rank}</td>
                        <td style={tdStyle({ fontWeight: 600 })}>
                          {d.name} <span style={{ color: C.muted }}>#{d.colete}</span>
                        </td>
                        <td style={tdStyle()}>{d.completed}</td>
                        <td style={tdStyle()}>{d.cancelled}</td>
                        <td style={tdStyle({ fontWeight: 700 })}>{money(d.revenue)}</td>
                        <td style={tdStyle()}>{money(d.ticket_avg)}</td>
                      </tr>
                    ))}
                    {!driverReports.length && (
                      <tr>
                        <td colSpan={6} style={{ padding: 24, color: C.muted, textAlign: "center" }}>
                          Nenhum motorista cadastrado
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </Panel>

              <Panel
                title="Corridas com valor (concluídas no período)"
                extra={
                  <button
                    onClick={() =>
                      downloadCsv(
                        `motoja-corridas-${period}.csv`,
                        completedRides.map((r) => ({
                          id: r.id,
                          criada: r.created_at,
                          passageiro: r.passenger_name,
                          telefone: r.passenger_phone,
                          destino: r.dest_address,
                          valor: r.fare_value ?? r.fare_final ?? r.fare_estimate ?? 0,
                          status: rideStatus(r),
                        }))
                      )
                    }
                    style={{
                      padding: "6px 10px",
                      borderRadius: 8,
                      border: `1px solid ${C.line}`,
                      background: C.soft,
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    Export CSV
                  </button>
                }
              >
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: C.soft }}>
                      {["Quando", "Passageiro", "Destino", "Valor"].map((h) => (
                        <th key={h} style={thStyle()}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {completedRides.map((r) => (
                      <tr key={r.id}>
                        <td style={tdStyle({ color: C.muted, whiteSpace: "nowrap" })}>{r.created_at}</td>
                        <td style={tdStyle({ fontWeight: 600 })}>{r.passenger_name || "—"}</td>
                        <td style={tdStyle({ color: C.muted })}>{r.dest_address || "—"}</td>
                        <td style={tdStyle({ fontWeight: 700 })}>
                          {money(r.fare_value ?? r.fare_final ?? r.fare_estimate)}
                        </td>
                      </tr>
                    ))}
                    {!completedRides.length && (
                      <tr>
                        <td colSpan={4} style={{ padding: 24, color: C.muted, textAlign: "center" }}>
                          Nenhuma corrida concluída no período (R$ 0,00)
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </Panel>
            </>
          )}

          {tab === "driver-reports" && (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                  gap: 12,
                  marginBottom: 16,
                }}
              >
                <StatCard
                  label="Motoristas no ranking"
                  value={driverReports.length}
                />
                <StatCard
                  label="Top faturamento"
                  value={driverReports[0] ? money(driverReports[0].revenue) : money(0)}
                  hint={driverReports[0]?.name || "—"}
                />
                <StatCard
                  label="Total concluídas"
                  value={driverReports.reduce((s, d) => s + (d.completed || 0), 0)}
                />
              </div>
              <Panel
                title={`Ranking por motorista · ${periodLabel}`}
                extra={
                  <button
                    onClick={() =>
                      downloadCsv(
                        `motoja-ranking-${period}.csv`,
                        driverReports.map((d) => ({
                          rank: d.rank,
                          nome: d.name,
                          colete: d.colete,
                          total: d.rides_total,
                          concluidas: d.completed,
                          canceladas: d.cancelled,
                          expiradas: d.expired,
                          ativas: d.active,
                          faturamento: d.revenue,
                          ticket_medio: d.ticket_avg,
                          online: d.is_online ? 1 : 0,
                          bloqueado: d.is_blocked ? 1 : 0,
                        }))
                      )
                    }
                    style={{
                      padding: "6px 10px",
                      borderRadius: 8,
                      border: `1px solid ${C.line}`,
                      background: C.soft,
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    Export CSV
                  </button>
                }
              >
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: C.soft }}>
                      {[
                        "#",
                        "Motorista",
                        "Status",
                        "Total",
                        "Concluídas",
                        "Canceladas",
                        "Expiradas",
                        "Faturamento",
                        "Ticket",
                      ].map((h) => (
                        <th key={h} style={thStyle()}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {driverReports.map((d) => (
                      <tr
                        key={d.driver_id}
                        onClick={() => setSelected({ type: "driver-report", data: d })}
                        style={{
                          cursor: "pointer",
                          background: selected?.data?.driver_id === d.driver_id ? "#FEF2F2" : "transparent",
                        }}
                      >
                        <td style={tdStyle({ fontWeight: 700 })}>{d.rank}</td>
                        <td style={tdStyle({ fontWeight: 600 })}>
                          {d.name} <span style={{ color: C.muted }}>#{d.colete}</span>
                        </td>
                        <td style={tdStyle()}>
                          {d.is_blocked ? (
                            <span style={{ color: C.red, fontWeight: 700 }}>Bloqueado</span>
                          ) : d.is_online ? (
                            <span style={{ fontWeight: 700 }}>Online</span>
                          ) : (
                            <span style={{ color: C.muted }}>Offline</span>
                          )}
                        </td>
                        <td style={tdStyle()}>{d.rides_total}</td>
                        <td style={tdStyle()}>{d.completed}</td>
                        <td style={tdStyle()}>{d.cancelled}</td>
                        <td style={tdStyle()}>{d.expired}</td>
                        <td style={tdStyle({ fontWeight: 700 })}>{money(d.revenue)}</td>
                        <td style={tdStyle()}>{money(d.ticket_avg)}</td>
                      </tr>
                    ))}
                    {!driverReports.length && (
                      <tr>
                        <td colSpan={9} style={{ padding: 24, color: C.muted, textAlign: "center" }}>
                          Sem motoristas — ranking vazio (0)
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </Panel>
            </>
          )}

          {(tab === "rides" || tab === "drivers" || tab === "passengers") && (
            <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Panel title={null}>
                  {tab === "rides" && (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: C.soft }}>
                          {["Status", "Passageiro", "Telefone", "Valor", "Origem → Destino", "Criada", ""].map(
                            (h) => (
                              <th key={h || "a"} style={thStyle()}>
                                {h}
                              </th>
                            )
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {rides.map((r) => (
                          <tr
                            key={r.id}
                            onClick={() => setSelected({ type: "ride", data: r })}
                            style={{
                              cursor: "pointer",
                              background: selected?.data?.id === r.id ? "#FEF2F2" : "transparent",
                            }}
                          >
                            <td style={tdStyle()}>
                              <StatusPill status={rideStatus(r)} />
                            </td>
                            <td style={tdStyle({ fontWeight: 600 })}>{r.passenger_name || "—"}</td>
                            <td style={tdStyle({ whiteSpace: "nowrap" })}>
                              {formatPhone(r.passenger_phone)}
                            </td>
                            <td style={tdStyle({ fontWeight: 700, whiteSpace: "nowrap" })}>
                              {r.status === "completed"
                                ? money(r.fare_value ?? r.fare_final ?? r.fare_estimate)
                                : money(r.fare_estimate ?? 0)}
                            </td>
                            <td
                              style={tdStyle({
                                color: C.muted,
                                maxWidth: 240,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              })}
                            >
                              {r.origin_address || "Origem"} → {r.dest_address || "Destino"}
                            </td>
                            <td style={tdStyle({ color: C.muted, whiteSpace: "nowrap" })}>{r.created_at}</td>
                            <td style={tdStyle()}>
                              {["searching", "accepted", "in_progress"].includes(r.status) && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    cancelRide(r.id);
                                  }}
                                  style={{
                                    padding: "5px 10px",
                                    borderRadius: 6,
                                    border: "none",
                                    background: C.red,
                                    color: "#fff",
                                    fontWeight: 700,
                                    fontSize: 12,
                                    cursor: "pointer",
                                  }}
                                >
                                  Cancelar
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                        {!rides.length && (
                          <tr>
                            <td colSpan={7} style={{ padding: 24, color: C.muted, textAlign: "center" }}>
                              Nenhuma corrida no período
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  )}

                  {tab === "passengers" && (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: C.soft }}>
                          {["Nome", "Telefone", "Device", "Cadastro"].map((h) => (
                            <th key={h} style={thStyle()}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {passengers.map((p) => (
                          <tr
                            key={p.id}
                            onClick={() => setSelected({ type: "passenger", data: p })}
                            style={{
                              cursor: "pointer",
                              background: selected?.data?.id === p.id ? "#FEF2F2" : "transparent",
                            }}
                          >
                            <td style={tdStyle({ fontWeight: 600 })}>{p.name}</td>
                            <td style={tdStyle()}>{p.phone_display || formatPhone(p.phone)}</td>
                            <td
                              style={tdStyle({
                                color: C.muted,
                                fontSize: 12,
                                fontFamily: "ui-monospace, monospace",
                              })}
                            >
                              {String(p.device_id || "").slice(0, 8)}…
                            </td>
                            <td style={tdStyle({ color: C.muted })}>{p.created_at}</td>
                          </tr>
                        ))}
                        {!passengers.length && (
                          <tr>
                            <td colSpan={4} style={{ padding: 24, color: C.muted, textAlign: "center" }}>
                              Nenhum passageiro
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  )}

                  {tab === "drivers" && (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: C.soft }}>
                          {["Nome", "Colete", "Status", "Placa", ""].map((h) => (
                            <th key={h || "x"} style={thStyle()}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {drivers.map((d) => (
                          <tr
                            key={d.id}
                            onClick={() => setSelected({ type: "driver", data: d })}
                            style={{
                              cursor: "pointer",
                              background: selected?.data?.id === d.id ? "#FEF2F2" : "transparent",
                            }}
                          >
                            <td style={tdStyle({ fontWeight: 600 })}>{d.name}</td>
                            <td style={tdStyle()}>#{d.colete}</td>
                            <td style={tdStyle()}>
                              {d.is_blocked ? (
                                <span style={{ color: C.red, fontWeight: 700 }}>Bloqueado</span>
                              ) : d.is_online ? (
                                <span style={{ fontWeight: 700 }}>Online</span>
                              ) : (
                                <span style={{ color: C.muted }}>Offline</span>
                              )}
                            </td>
                            <td style={tdStyle({ color: C.muted })}>{d.plate || "—"}</td>
                            <td style={tdStyle()}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleBlock(d);
                                }}
                                style={{
                                  padding: "5px 10px",
                                  borderRadius: 6,
                                  border: `1px solid ${C.line}`,
                                  background: d.is_blocked ? C.ink : C.soft,
                                  color: d.is_blocked ? "#fff" : C.ink,
                                  fontWeight: 700,
                                  fontSize: 12,
                                  cursor: "pointer",
                                }}
                              >
                                {d.is_blocked ? "Desbloquear" : "Bloquear"}
                              </button>
                            </td>
                          </tr>
                        ))}
                        {!drivers.length && (
                          <tr>
                            <td colSpan={5} style={{ padding: 24, color: C.muted, textAlign: "center" }}>
                              Nenhum motorista
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  )}
                </Panel>
              </div>

              <aside
                style={{
                  width: 320,
                  flexShrink: 0,
                  background: C.white,
                  border: `1px solid ${C.line}`,
                  borderRadius: 12,
                  padding: 16,
                  position: "sticky",
                  top: 16,
                  maxHeight: "calc(100vh - 120px)",
                  overflow: "auto",
                }}
              >
                <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 15, marginBottom: 10 }}>
                  Detalhes
                </div>
                {!selected && (
                  <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.45 }}>
                    Selecione uma linha na tabela para ver o registro.
                  </p>
                )}
                {selected && (
                  <>
                    <pre
                      style={{
                        fontSize: 11,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        color: C.muted,
                        margin: 0,
                        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                        lineHeight: 1.4,
                      }}
                    >
                      {JSON.stringify(selected.data, null, 2)}
                    </pre>
                    {selected.type === "ride" &&
                      ["searching", "accepted", "in_progress"].includes(selected.data.status) && (
                        <button
                          onClick={() => cancelRide(selected.data.id)}
                          style={{
                            marginTop: 14,
                            width: "100%",
                            padding: "10px 12px",
                            borderRadius: 8,
                            border: "none",
                            background: C.red,
                            color: "#fff",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          Cancelar corrida
                        </button>
                      )}
                    {selected.type === "driver" && (
                      <button
                        onClick={() => toggleBlock(selected.data)}
                        style={{
                          marginTop: 14,
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: 8,
                          border: "none",
                          background: C.ink,
                          color: "#fff",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        {selected.data.is_blocked ? "Desbloquear motorista" : "Bloquear motorista"}
                      </button>
                    )}
                  </>
                )}
              </aside>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
