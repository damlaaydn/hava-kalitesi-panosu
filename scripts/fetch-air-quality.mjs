import fs from "node:fs/promises";
import path from "node:path";

const BASE_URL = "https://air-quality-api.open-meteo.com/v1/air-quality";

const locations = [
  { id: "manisa", name: "Manisa", latitude: 38.6191, longitude: 27.4289 },
  { id: "soma", name: "Soma", latitude: 39.1855, longitude: 27.6094 },
  { id: "aliaga", name: "Aliağa", latitude: 38.8000, longitude: 26.9720 },
  { id: "izmir-konak", name: "İzmir Konak", latitude: 38.4189, longitude: 27.1287 }
];

function getLocalDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

async function fetchLocation(location) {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    hourly: "pm2_5,pm10,ozone,nitrogen_dioxide,european_aqi",
    forecast_days: "5",
    timezone: "Europe/Istanbul"
  });

  const response = await fetch(`${BASE_URL}?${params}`, {
    signal: AbortSignal.timeout(30000)
  });

  if (!response.ok) {
    throw new Error(`${location.name}: API HTTP ${response.status}`);
  }

  const data = await response.json();

  if (
    !data.hourly ||
    !Array.isArray(data.hourly.time) ||
    data.hourly.time.length === 0
  ) {
    throw new Error(`${location.name}: Saatlik veri bulunamadı.`);
  }

  const requiredFields = [
    "pm2_5",
    "pm10",
    "ozone",
    "nitrogen_dioxide",
    "european_aqi"
  ];

  for (const field of requiredFields) {
    if (
      !Array.isArray(data.hourly[field]) ||
      data.hourly[field].length !== data.hourly.time.length
    ) {
      throw new Error(`${location.name}: ${field} verisi eksik veya tutarsız.`);
    }
  }

  return {
    ...location,
    timezone: data.timezone,
    elevation: data.elevation,
    units: data.hourly_units,
    hourly: data.hourly
  };
}

async function main() {
  console.log("Open-Meteo verileri alınıyor...");

  // Bir konum başarısız olursa eksik paketi kaydetme.
  // Böylece son başarılı dosyalar korunur.
  const results = await Promise.all(locations.map(fetchLocation));

  const nullCount = results.reduce((total, location) => {
    return total + Object.values(location.hourly)
      .filter(Array.isArray)
      .reduce((count, values) => {
        return count + values.filter(value => value === null).length;
      }, 0);
  }, 0);

  const payload = {
    schemaVersion: 1,
    source: {
      name: "Open-Meteo Air Quality API",
      url: "https://air-quality-api.open-meteo.com/",
      documentation: "https://open-meteo.com/en/docs/air-quality-api"
    },
    updatedAt: new Date().toISOString(),
    timezone: "Europe/Istanbul",
    dataType: "hourly_forecast",
    locationCount: results.length,
    locations: results
  };

  const outputDirectory = path.join("public", "data");
  const historyDirectory = path.join(outputDirectory, "history");
  const latestPath = path.join(outputDirectory, "latest.json");
  const historyPath = path.join(historyDirectory, `${getLocalDate()}.json`);

  await fs.mkdir(historyDirectory, { recursive: true });

  const json = JSON.stringify(payload, null, 2) + "\n";

  // Önce geçici dosyaya yaz; başarılı olursa hedefe taşı.
  const latestTempPath = `${latestPath}.tmp`;
  await fs.writeFile(latestTempPath, json, "utf8");
  await fs.rename(latestTempPath, latestPath);

  await fs.writeFile(historyPath, json, "utf8");

  console.log(`Başarılı: ${results.length} konum kaydedildi.`);
  console.log(`Güncelleme: ${payload.updatedAt}`);
  console.log(`Eksik saatlik değer sayısı: ${nullCount}`);
  console.log(`Güncel dosya: ${latestPath}`);
  console.log(`Günlük arşiv: ${historyPath}`);
}

main().catch(error => {
  console.error("Veri kaydı başarısız:", error.message);
  process.exitCode = 1;
});
