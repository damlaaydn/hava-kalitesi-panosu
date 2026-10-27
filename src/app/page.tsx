"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowDownRight, ArrowUpRight, Clock3, CloudSun,
  ExternalLink, MapPin, RefreshCw, ShieldCheck, Wind
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell,
  ResponsiveContainer, Tooltip, XAxis, YAxis
} from "recharts";

type Place = {
  id: string;
  name: string;
  district: string;
  lat: number;
  lon: number;
};

type Hour = {
  time: string;
  pm2_5: number | null;
  pm10: number | null;
  ozone: number | null;
  nitrogen_dioxide: number | null;
  european_aqi: number | null;
};

type LocationData = {
  place: Place;
  hours: Hour[];
};

const PLACES: Place[] = [
  { id: "manisa", name: "Manisa", district: "Şehir merkezi", lat: 38.6191, lon: 27.4289 },
  { id: "soma", name: "Soma", district: "İlçe merkezi", lat: 39.1855, lon: 27.6094 },
  { id: "aliaga", name: "Aliağa", district: "İlçe merkezi", lat: 38.8000, lon: 26.9720 },
  { id: "konak", name: "İzmir Konak", district: "Şehir merkezi", lat: 38.4189, lon: 27.1287 }
];

const POLLUTANTS = {
  european_aqi: { label: "Hava Kalitesi İndeksi", unit: "AQI", color: "#72e0c0" },
  pm2_5: { label: "PM2.5 ince partikül", unit: "µg/m³", color: "#7aa8ff" },
  pm10: { label: "PM10 partikül", unit: "µg/m³", color: "#d4a7ff" },
  ozone: { label: "Ozon", unit: "µg/m³", color: "#ffc77d" },
  nitrogen_dioxide: { label: "Azot dioksit", unit: "µg/m³", color: "#ff8f9c" }
} as const;

type PollutantKey = keyof typeof POLLUTANTS;

function average(values: (number | null | undefined)[]) {
  const valid = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
}

function formatNumber(value: number | null | undefined, digits = 1) {
  return value == null ? "—" : value.toLocaleString("tr-TR", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0
  });
}

function formatTime(time: string) {
  return time ? time.slice(11, 16) : "—";
}

function airStatus(aqi: number | null | undefined) {
  if (aqi == null) return { label: "Veri yok", tone: "neutral" };
  if (aqi <= 20) return { label: "Çok iyi", tone: "good" };
  if (aqi <= 40) return { label: "İyi", tone: "good" };
  if (aqi <= 60) return { label: "Orta", tone: "moderate" };
  if (aqi <= 80) return { label: "Düşük kalite", tone: "poor" };
  return { label: "Yüksek kirlilik", tone: "bad" };
}

export default function Home() {
  const [data, setData] = useState<LocationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");
  const [dataSource, setDataSource] = useState<"live" | "backup" | "">("");
  const [selectedPlace, setSelectedPlace] = useState("manisa");
  const [pollutant, setPollutant] = useState<PollutantKey>("european_aqi");
  const [horizon, setHorizon] = useState("24");
  const [sortBy, setSortBy] = useState<"name" | "aqi" | "pm2_5" | "pm10">("aqi");
  const [sortAscending, setSortAscending] = useState(true);

  async function loadData() {
    setLoading(true);
    setError("");

    function mapLocations(json: any): LocationData[] {
      if (!Array.isArray(json.locations)) {
        throw new Error("JSON veri yap?s? beklenen bi?imde de?il.");
      }

      return json.locations.map((item: any) => {
        const place = PLACES.find((p) => p.id === item.id) ?? {
          id: item.id,
          name: item.name,
          district: "Konum",
          lat: item.latitude,
          lon: item.longitude
        };

        const hourly = item.hourly ?? {};
        const times = Array.isArray(hourly.time) ? hourly.time : [];

        const hours: Hour[] = times.map((time: string, i: number) => ({
          time,
          pm2_5: hourly.pm2_5?.[i] ?? null,
          pm10: hourly.pm10?.[i] ?? null,
          ozone: hourly.ozone?.[i] ?? null,
          nitrogen_dioxide: hourly.nitrogen_dioxide?.[i] ?? null,
          european_aqi: hourly.european_aqi?.[i] ?? null
        }));

        return { place, hours };
      });
    }

    try {
      const results = await Promise.all(PLACES.map(async (place) => {
        const params = new URLSearchParams({
          latitude: String(place.lat),
          longitude: String(place.lon),
          hourly: "pm2_5,pm10,ozone,nitrogen_dioxide,european_aqi",
          forecast_days: "5",
          timezone: "Europe/Istanbul"
        });

        const response = await fetch(
          `https://air-quality-api.open-meteo.com/v1/air-quality?${params.toString()}`,
          { cache: "no-store" }
        );

        if (!response.ok) {
          throw new Error(`${place.name} verisi al?namad?.`);
        }

        const json = await response.json();
        const times: string[] = json.hourly?.time ?? [];

        if (!times.length) {
          throw new Error(`${place.name} i?in saatlik veri bulunamad?.`);
        }

        const hours: Hour[] = times.map((time: string, i: number) => ({
          time,
          pm2_5: json.hourly.pm2_5?.[i] ?? null,
          pm10: json.hourly.pm10?.[i] ?? null,
          ozone: json.hourly.ozone?.[i] ?? null,
          nitrogen_dioxide: json.hourly.nitrogen_dioxide?.[i] ?? null,
          european_aqi: json.hourly.european_aqi?.[i] ?? null
        }));

        return { place, hours };
      }));

      setData(results);
      setDataSource("live");
      setUpdatedAt(new Date().toLocaleString("tr-TR", {
        timeZone: "Europe/Istanbul",
        dateStyle: "medium",
        timeStyle: "short"
      }));
    } catch (liveError) {
      console.warn("Canl? API verisi al?namad?; kay?tl? veri deneniyor.", liveError);

      try {
        const response = await fetch("/data/latest.json", {
          cache: "no-store"
        });

        if (!response.ok) {
          throw new Error("Kay?tl? JSON yede?i okunamad?.");
        }

        const json = await response.json();
        const results = mapLocations(json);

        if (!results.length) {
          throw new Error("Kay?tl? veride konum bulunamad?.");
        }

        setData(results);
        setDataSource("backup");

        const savedDate = json.updatedAt
          ? new Date(json.updatedAt)
          : null;

        setUpdatedAt(
          savedDate && !Number.isNaN(savedDate.getTime())
            ? savedDate.toLocaleString("tr-TR", {
                timeZone: "Europe/Istanbul",
                dateStyle: "medium",
                timeStyle: "short"
              })
            : "Bilinmiyor"
        );

        setError("Canl? veri al?namad?. Son kay?tl? tahmin verisi g?steriliyor.");
      } catch (backupError) {
        console.error("Canl? veri ve JSON yede?i kullan?lamad?.", backupError);
        setError("Canl? veriye ula??lamad? ve kay?tl? yedek okunamad?. ?nternet ba?lant?n?z? kontrol edip yeniden deneyin.");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadData(); }, []);

  const active = data.find((d) => d.place.id === selectedPlace);
  const now = new Date();
  const currentHour = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Istanbul",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23"
  }).format(now).replace(" ", "T");
  const currentIndex = active?.hours.findIndex((h) => h.time.slice(0, 13) === currentHour) ?? -1;
  const current = active?.hours[currentIndex >= 0 ? currentIndex : 0];

  const windowHours = Number(horizon);
  const chartData = useMemo(() => {
    if (!active) return [];
    return active.hours.slice(0, windowHours).map((h) => ({
      ...h,
      label: `${h.time.slice(5, 10)} ${formatTime(h.time)}`
    }));
  }, [active, windowHours]);

  const recommendation = useMemo(() => {
    if (!active) return null;
    const start = Math.max(currentIndex, 0);
    const future = active.hours.slice(start, start + 24);
    if (future.length < 3) return null;
    let best: { start: number; score: number } | null = null;
    for (let i = 0; i <= future.length - 3; i++) {
      const score = average(future.slice(i, i + 3).map((h) => h.european_aqi));
      if (score != null && (best == null || score < best.score)) best = { start: i, score };
    }
    if (!best) return null;
    return {
      from: formatTime(future[best.start].time),
      to: formatTime(future[best.start + 2].time),
      score: best.score
    };
  }, [active, currentIndex]);

  const comparisons = useMemo(() => data.map((d) => ({
    ...d,
    aqi: average(d.hours.slice(0, 24).map((h) => h.european_aqi)),
    pm2_5: average(d.hours.slice(0, 24).map((h) => h.pm2_5)),
    pm10: average(d.hours.slice(0, 24).map((h) => h.pm10))
  })), [data]);

  const sorted = [...comparisons].sort((a, b) => {
    const av = sortBy === "name" ? a.place.name : a[sortBy];
    const bv = sortBy === "name" ? b.place.name : b[sortBy];
    const result = typeof av === "string" && typeof bv === "string"
      ? av.localeCompare(bv, "tr")
      : ((av as number | null) ?? Infinity) - ((bv as number | null) ?? Infinity);
    return sortAscending ? result : -result;
  });

  const chartSummary = chartData.length
    ? `${active?.place.name} için ${POLLUTANTS[pollutant].label} tahmini gösteriliyor.`
    : "Grafik oluşturmak için henüz yeterli veri yok.";

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" aria-label="Temiz Hava ana sayfa">
          <span className="brand-mark"><Wind size={23} strokeWidth={1.8} /></span>
          <span className="brand-copy"><strong>nefes.</strong><small>HAVA KALİTESİ</small></span>
        </a>

        <div className="side-label">PANOLAR</div>
        <a className="side-link active" href="#overview"><Activity size={17} /> Genel bakış <span className="side-dot" /></a>
        <a className="side-link" href="#forecast"><CloudSun size={17} /> Saatlik tahmin</a>
        <a className="side-link" href="#locations"><MapPin size={17} /> Bölge karşılaştırma</a>

        <div className="sidebar-bottom">
          <div className="side-status"><span className="live-dot" /> Canlı veri bağlantısı</div>
          <p>Veriye dayalı küçük kararlar, daha iyi bir gün.</p>
          <span className="side-version">OPEN-METEO · AIR QUALITY</span>
        </div>
      </aside>

      <section className="main-content" id="overview">
        <header className="topbar">
          <div className="breadcrumb">Hava kalitesi <span>/</span> <strong>Genel bakış</strong></div>
          <div className="topbar-right">
            <span className="live-pill"><span className="live-dot" /> Tahmin görünümü</span>
            <button className="icon-button" onClick={() => void loadData()} aria-label="Verileri yenile" title="Verileri yenile">
              <RefreshCw size={17} className={loading ? "spin" : ""} />
            </button>
          </div>
        </header>

        <div className="page-intro">
          <div>
            <div className="eyebrow"><span className="eyebrow-line" /> DIŞARI ÇIKMADAN ÖNCE</div>
            <h1>Bugün dışarı<br /><span>çıkılır mı?</span></h1>
            <p className="intro-copy">Hava kalitesini anlayın, daha uygun saatleri seçin.</p>
          </div>
          <div className="intro-date">
            <span className="date-icon"><CloudSun size={21} /></span>
            <div><small>TAHMİN DÖNEMİ</small><strong>Önümüzdeki 5 gün</strong><span>Saatlik hava kalitesi verisi</span></div>
          </div>
        </div>

        {error && <div className="error-banner" role="alert">{error} <button onClick={() => void loadData()}>Yeniden dene</button></div>}

        <div className="section-heading">
          <div><span className="section-index">01</span><h2>Günün özeti</h2></div>
          <span className="section-note">Seçili konum için anlık tahmin</span>
        </div>

        <div className="control-strip">
          <label htmlFor="location-select"><MapPin size={15} /> Konum</label>
          <select id="location-select" value={selectedPlace} onChange={(e) => setSelectedPlace(e.target.value)}>
            {PLACES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <span className="control-divider" />
          <span className="control-caption">Göstergeler tahmin verilerine dayanır.</span>
        </div>

        <div className="kpi-grid">
          <article className="kpi-card featured">
            <div className="kpi-top"><span>HAVA KALİTESİ</span><span className="kpi-icon"><Activity size={18} /></span></div>
            {loading ? <div className="skeleton-value" /> : <div className="kpi-value">{formatNumber(current?.european_aqi, 0)}<small> AQI</small></div>}
            <div className="kpi-bottom"><span className={`status-pill ${airStatus(current?.european_aqi).tone}`}>{airStatus(current?.european_aqi).label}</span><span>Avrupa indeksi</span></div>
            <div className="kpi-accent" />
          </article>
          <article className="kpi-card">
            <div className="kpi-top"><span>İNCE PARTİKÜLLER</span><span className="kpi-icon blue"><Wind size={18} /></span></div>
            {loading ? <div className="skeleton-value" /> : <div className="kpi-value">{formatNumber(current?.pm2_5)}<small> µg/m³</small></div>}
            <div className="kpi-bottom"><span className="metric-name">PM2.5</span><span>Akciğere ulaşabilen parçacıklar</span></div>
          </article>
          <article className="kpi-card">
            <div className="kpi-top"><span>PARTİKÜL MADDE</span><span className="kpi-icon purple"><Activity size={18} /></span></div>
            {loading ? <div className="skeleton-value" /> : <div className="kpi-value">{formatNumber(current?.pm10)}<small> µg/m³</small></div>}
            <div className="kpi-bottom"><span className="metric-name">PM10</span><span>Havadaki parçacıklar</span></div>
          </article>
          <article className="kpi-card">
            <div className="kpi-top"><span>İZLENEN BÖLGE</span><span className="kpi-icon amber"><MapPin size={18} /></span></div>
            <div className="kpi-value location-value">{active?.place.name ?? "—"}</div>
            <div className="kpi-bottom"><span className="metric-name">4 bölge</span><span>Karşılaştırmaya dahil</span></div>
          </article>
        </div>

        <section className="recommendation">
          <div className="recommend-icon"><Clock3 size={22} /></div>
          <div className="recommend-copy">
            <span className="recommend-label">AKILLI SAAT ÖNERİSİ</span>
            <h3>{recommendation ? `Dışarı çıkmak için daha uygun aralık: ${recommendation.from}–${recommendation.to}` : "Saat önerisi hazırlanıyor"}</h3>
            <p>{recommendation ? `Seçili konumda, önümüzdeki 24 saatin üç saatlik aralıkları arasında en düşük tahmini ortalama AQI: ${formatNumber(recommendation.score)}.` : "Saatlik veriler alındığında öneri burada görüntülenir."}</p>
          </div>
          <div className="recommend-badge"><span>ÖNERİ</span><strong>{recommendation ? `${recommendation.from}–${recommendation.to}` : "—"}</strong></div>
        </section>

        <div className="section-heading chart-section-title" id="forecast">
          <div><span className="section-index">02</span><h2>Saatlik hava görünümü</h2></div>
          <span className="section-note">Tahmin, ölçüm değildir</span>
        </div>

        <section className="panel main-chart-panel">
          <div className="panel-heading">
            <div><h3>{POLLUTANTS[pollutant].label}</h3><p>{active?.place.name ?? "Seçili konum"} · Saatlik tahmin</p></div>
            <div className="chart-controls">
              <label className="sr-only" htmlFor="pollutant-select">Gösterge seçin</label>
              <select id="pollutant-select" value={pollutant} onChange={(e) => setPollutant(e.target.value as PollutantKey)}>
                {Object.entries(POLLUTANTS).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}
              </select>
              <div className="segmented" aria-label="Grafik dönemi">
                <button className={horizon === "24" ? "selected" : ""} onClick={() => setHorizon("24")}>24 sa</button>
                <button className={horizon === "48" ? "selected" : ""} onClick={() => setHorizon("48")}>48 sa</button>
                <button className={horizon === "72" ? "selected" : ""} onClick={() => setHorizon("72")}>72 sa</button>
              </div>
            </div>
          </div>
          <div className="chart-legend"><span style={{ background: POLLUTANTS[pollutant].color }} /> {POLLUTANTS[pollutant].unit}<span className="legend-muted">· Saatlik tahmin</span></div>
          <div className="chart-wrap" role="img" aria-label={chartSummary}>
            {loading ? <div className="chart-skeleton" /> : chartData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 12, right: 10, left: -18, bottom: 0 }}>
                  <defs><linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={POLLUTANTS[pollutant].color} stopOpacity={0.28} /><stop offset="95%" stopColor={POLLUTANTS[pollutant].color} stopOpacity={0.01} /></linearGradient></defs>
                  <CartesianGrid stroke="#273344" strokeDasharray="3 5" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "#8997ab", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={32} />
                  <YAxis tick={{ fill: "#8997ab", fontSize: 11 }} tickLine={false} axisLine={false} width={48} />
                  <Tooltip contentStyle={{ background: "#111b29", border: "1px solid #344357", borderRadius: 12, color: "#edf3fa" }} labelStyle={{ color: "#aab7c9", marginBottom: 4 }} formatter={(value) => [`${formatNumber(Number(value))} ${POLLUTANTS[pollutant].unit}`, POLLUTANTS[pollutant].label]} />
                  <Area type="monotone" dataKey={pollutant} stroke={POLLUTANTS[pollutant].color} strokeWidth={2.5} fill="url(#areaFill)" connectNulls={false} activeDot={{ r: 5, strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : <div className="empty-state">Grafik için veri bulunamadı.</div>}
          </div>
          <p className="chart-summary"><span className="summary-mark">i</span>{chartSummary} <span>Değerler saatlik tahmindir; gerçek koşullar değişebilir.</span></p>
        </section>

        <div className="lower-grid">
          <section className="panel comparison-panel" id="locations">
            <div className="panel-heading"><div><h3>Bölgeler arasında karşılaştırma</h3><p>Önümüzdeki 24 saatin ortalama AQI değeri</p></div><span className="mini-tag">4 BÖLGE</span></div>
            <div className="comparison-chart" role="img" aria-label="Dört bölgenin tahmini ortalama hava kalitesi indeksi karşılaştırması">
              {loading ? <div className="chart-skeleton" /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={comparisons} layout="vertical" margin={{ top: 2, right: 18, left: 4, bottom: 0 }}>
                    <CartesianGrid stroke="#273344" strokeDasharray="3 5" horizontal={false} />
                    <XAxis type="number" tick={{ fill: "#8997ab", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey={(d) => d.place.name} tick={{ fill: "#d2dbe7", fontSize: 11 }} axisLine={false} tickLine={false} width={82} />
                    <Tooltip contentStyle={{ background: "#111b29", border: "1px solid #344357", borderRadius: 12, color: "#edf3fa" }} formatter={(value) => [`${formatNumber(Number(value))} AQI`, "Ortalama AQI"]} />
                    <Bar dataKey="aqi" radius={[0, 5, 5, 0]} barSize={18}>
                      {comparisons.map((d) => <Cell key={d.place.id} fill={d.place.id === selectedPlace ? "#72e0c0" : "#49647a"} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            <p className="chart-summary"><span className="summary-mark">i</span>Daha düşük AQI, bu indeks kapsamında daha düşük hava kirliliğine işaret eder.</p>
          </section>

          <section className="panel explainer-panel">
            <div className="explain-symbol"><Wind size={24} /></div>
            <span className="recommend-label">KÜÇÜK BİR REHBER</span>
            <h3>PM2.5 ne anlama geliyor?</h3>
            <p>PM2.5, çapı 2,5 mikrometre veya daha küçük olan ince parçacıkları ifade eder. Küçük boyutları nedeniyle solunum yollarının derinlerine ulaşabilirler.</p>
            <div className="explain-foot"><ShieldCheck size={16} /><span>Hassas çocuklar için yalnızca bu panele bakarak karar vermeyin.</span></div>
          </section>
        </div>

        <section className="panel table-panel">
          <div className="panel-heading table-heading"><div><h3>Bölge detayları</h3><p>Önümüzdeki 24 saatin ortalama tahminleri</p></div><span className="mini-tag">SIRALANABİLİR</span></div>
          <div className="table-scroll">
            <table>
              <thead><tr>
                <th><button onClick={() => { setSortBy("name"); setSortAscending(!sortAscending); }}>Bölge ↕</button></th>
                <th><button onClick={() => { setSortBy("aqi"); setSortAscending(!sortAscending); }}>Ort. AQI ↕</button></th>
                <th><button onClick={() => { setSortBy("pm2_5"); setSortAscending(!sortAscending); }}>PM2.5 ↕</button></th>
                <th><button onClick={() => { setSortBy("pm10"); setSortAscending(!sortAscending); }}>PM10 ↕</button></th>
                <th>Değerlendirme</th>
              </tr></thead>
              <tbody>
                {sorted.map((d) => <tr key={d.place.id} className={d.place.id === selectedPlace ? "current-row" : ""}>
                  <td><button className="place-cell" onClick={() => setSelectedPlace(d.place.id)}><span className="place-dot" />{d.place.name}</button></td>
                  <td className="numeric">{formatNumber(d.aqi)}</td><td className="numeric">{formatNumber(d.pm2_5)} <small>µg/m³</small></td><td className="numeric">{formatNumber(d.pm10)} <small>µg/m³</small></td>
                  <td><span className={`status-pill ${airStatus(d.aqi).tone}`}>{airStatus(d.aqi).label}</span></td>
                </tr>)}
                {!loading && !sorted.length && <tr><td colSpan={5} className="empty-table">Gösterilecek veri yok.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <footer className="footer">
          <div className="footer-brand"><span className="brand-mark small"><Wind size={17} /></span><strong>nefes.</strong><span>Bilgiyle daha bilinçli seçimler.</span></div>
          <div className="footer-meta"><span><span className="live-dot" /> Son güncelleme: {updatedAt || "Henüz güncellenmedi"}</span><a href="https://open-meteo.com/en/docs/air-quality-api" target="_blank" rel="noreferrer">Veri kaynağı <ExternalLink size={13} /></a></div>
          <p className="disclaimer">Bilgilendirme amaçlıdır; tıbbi tavsiye değildir. Tahminler değişebilir. Özellikle solunum hassasiyeti olan çocuklar için resmi sağlık ve hava kalitesi duyurularını da kontrol edin.</p>
        </footer>
      </section>
    </main>
  );
}
