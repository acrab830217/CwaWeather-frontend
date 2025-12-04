const API_BASE = "http://localhost:3000";
const DEFAULT_CITY = "臺北市";

let hasShownModal = false;

// GeoJSON 縣市名稱 -> CWA 名稱
function normalizeCountyName(name) {
  if (!name) return "";
  return name
    .replace("台北市", "臺北市")
    .replace("台中市", "臺中市")
    .replace("台南市", "臺南市")
    .replace("台東縣", "臺東縣");
}

// 台灣各縣市基準坐標
const CITY_COORDS = [
  { name: "宜蘭縣", lat: 24.7302791, lng: 121.7631149 },
  { name: "花蓮縣", lat: 23.9913421, lng: 121.6197276 },
  { name: "臺東縣", lat: 22.7553667, lng: 121.1506 },
  { name: "澎湖縣", lat: 23.569694, lng: 119.5664543 },
  { name: "金門縣", lat: 24.4480637, lng: 118.3856331 },
  { name: "連江縣", lat: 26.1491915, lng: 119.9389047 },
  { name: "臺北市", lat: 25.0478, lng: 121.5319 },
  { name: "新北市", lat: 25.06199, lng: 121.45703 },
  { name: "桃園市", lat: 24.9937, lng: 121.297 },
  { name: "臺中市", lat: 24.1469, lng: 120.6839 },
  { name: "臺南市", lat: 22.99083, lng: 120.21333 },
  { name: "高雄市", lat: 22.61626, lng: 120.31333 },
  { name: "基隆市", lat: 25.1283, lng: 121.742 },
  { name: "新竹縣", lat: 24.8267, lng: 121.0128333 },
  { name: "新竹市", lat: 24.80361, lng: 120.96861 },
  { name: "苗栗縣", lat: 24.5647667, lng: 120.8205167 },
  { name: "彰化縣", lat: 24.0755667, lng: 120.5444667 },
  { name: "南投縣", lat: 23.90235, lng: 120.6909167 },
  { name: "雲林縣", lat: 23.6990775, lng: 120.5245511 },
  { name: "嘉義縣", lat: 23.46333, lng: 120.58166 },
  { name: "嘉義市", lat: 23.47917, lng: 120.44889 },
  { name: "屏東縣", lat: 22.6828017, lng: 120.487928 },
];

// 舒適度 -> 可愛文案
function getComfortCuteText(comfort) {
  if (!comfort) return "好好照顧自己，記得多補充水分喔 🧃";

  if (comfort.includes("舒適")) {
    return "溫度剛剛好，很適合出門散步或喝杯咖啡 ☕";
  }
  if (comfort.includes("稍有寒意") || comfort.includes("偏冷")) {
    return "有一點涼，出門記得帶件外套，會更舒服 🧣";
  }
  if (comfort.includes("寒冷")) {
    return "有點冷颼颼，適合窩在被窩裡追劇，記得保暖 ❄️";
  }
  if (comfort.includes("悶熱")) {
    return "空氣有點黏黏的，多喝水、找個涼的地方休息一下吧 💦";
  }
  if (comfort.includes("炎熱") || comfort.includes("酷熱")) {
    return "外面超級熱，記得防曬、多補充水分，別曬昏頭 🔥";
  }

  return "今天的天氣有自己的個性，照自己的步調，好好過一天吧 🌈";
}

// D3 地圖：縣市名稱 -> path id
const countyNameToIdMap = {};

window.addEventListener("load", () => {
  const statusEl = document.getElementById("status");
  const locationEl = document.getElementById("location");
  const citySelect = document.getElementById("citySelect");

  // 填入縣市選項
  citySelect.innerHTML = "";
  CITY_COORDS.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.name;
    opt.textContent = c.name;
    citySelect.appendChild(opt);
  });

  initModalEvents();
  initTaiwanMap();

  // 手動選縣市
  citySelect.addEventListener("change", (e) => {
    const city = e.target.value;
    if (!city) return;
    statusEl.textContent = `已選擇：${city}`;
    updateMapHighlight(city);
    fetchWeatherByCity(city);
  });

  // 自動偵測最近縣市
  autoDetectCityWithGeolocation(statusEl, locationEl, citySelect);
});

// 自動偵測＋最近縣市
function autoDetectCityWithGeolocation(statusEl, locationEl, citySelect) {
  if (!navigator.geolocation) {
    statusEl.textContent =
      "此瀏覽器不支援定位功能，改用預設城市（" + DEFAULT_CITY + "）。";
    citySelect.value = DEFAULT_CITY;
    updateMapHighlight(DEFAULT_CITY);
    fetchWeatherByCity(DEFAULT_CITY);
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords;

      statusEl.textContent = "已取得您的位置 ✅";
      locationEl.textContent = `座標：${latitude.toFixed(
        4
      )}, ${longitude.toFixed(4)}`;

      const nearest = getNearestCity(latitude, longitude);

      if (!nearest) {
        statusEl.textContent +=
          "（無法判斷最近縣市，改用 " + DEFAULT_CITY + "）";
        citySelect.value = DEFAULT_CITY;
        updateMapHighlight(DEFAULT_CITY);
        fetchWeatherByCity(DEFAULT_CITY);
        return;
      }

      statusEl.textContent += `（最近縣市：${nearest.name}）`;
      citySelect.value = nearest.name;
      updateMapHighlight(nearest.name);
      fetchWeatherByCity(nearest.name);
    },
    (error) => {
      console.error("取得定位失敗：", error);
      statusEl.textContent =
        "無法取得您的位置，改用預設城市（" + DEFAULT_CITY + "）。";
      citySelect.value = DEFAULT_CITY;
      updateMapHighlight(DEFAULT_CITY);
      fetchWeatherByCity(DEFAULT_CITY);
    }
  );
}

// 用平方距離找最近縣市
function getNearestCity(lat, lng) {
  let nearest = null;
  let minDist = Infinity;

  CITY_COORDS.forEach((c) => {
    const dLat = lat - c.lat;
    const dLng = lng - c.lng;
    const dist = dLat * dLat + dLng * dLng;

    if (dist < minDist) {
      minDist = dist;
      nearest = c;
    }
  });

  return nearest;
}

// 呼叫 /api/weather?city=xxx
async function fetchWeatherByCity(city) {
  const weatherEl = document.getElementById("weather");
  const url = `${API_BASE}/api/weather?city=${encodeURIComponent(city)}`;
  console.log("天氣查詢 URL:", url);

  weatherEl.innerHTML = `正在載入 ${city} 的天氣資料...`;

  try {
    const res = await fetch(url);

    if (!res.ok) {
      const text = await res.text();
      console.error("weather API HTTP error:", res.status, text);
      weatherEl.innerHTML =
        '<div class="error">取得天氣失敗（HTTP ' +
        res.status +
        "）</div>";
      return;
    }

    const json = await res.json();
    console.log("weather API 回傳：", json);

    if (json.success === false) {
      weatherEl.innerHTML =
        '<div class="error">取得天氣失敗：' +
        (json.message || "未知錯誤") +
        "</div>";
      return;
    }

    const data = json.data || json;
    renderWeather(data);
    updateTodaySummary(data);
  } catch (err) {
    console.error("fetchWeatherByCity 發生錯誤：", err);
    weatherEl.innerHTML =
      '<div class="error">無法連線到伺服器（weather）：' +
      (err.message || err) +
      "</div>";
  }
}

// 畫出 3 筆預報（含 NOW 高亮）
function renderWeather(data) {
  const weatherEl = document.getElementById("weather");

  if (!data || !Array.isArray(data.forecasts)) {
    weatherEl.innerHTML =
      '<div class="error">天氣資料格式錯誤，請稍後再試。</div>';
    return;
  }

  const forecasts = data.forecasts.slice(0, 3); // ✅ 保留 3 筆
  const now = new Date();

  let html = `
    <div class="city">${data.city}</div>
    <div class="meta">資料描述：${data.updateTime}</div>
    <ul class="forecast-list">
  `;

  forecasts.forEach((f) => {
    const start = new Date(f.startTime.replace(" ", "T"));
    const end = new Date(f.endTime.replace(" ", "T"));
    const isCurrent = now >= start && now < end;

    html += `
      <li class="forecast-item ${isCurrent ? "current" : ""}">
        <div>${f.startTime} ~ ${f.endTime}</div>
        <div>天氣：${f.weather}</div>
        <div>氣溫：${f.minTemp} - ${f.maxTemp}</div>
        <div>降雨機率：${f.rain}</div>
        <div>舒適度：${f.comfort}</div>
      </li>
    `;
  });

  html += "</ul>";

  weatherEl.innerHTML = html;
}

/* ====== 今天概況：小卡 + 浮動視窗 ====== */
function updateTodaySummary(data) {
  if (!data || !Array.isArray(data.forecasts) || data.forecasts.length === 0) {
    return;
  }

  const first = data.forecasts[0];
  const summaryCard = document.getElementById("summaryCard");
  if (!summaryCard) return;

  const baseLine = `${data.city}：${first.weather}，氣溫 ${first.minTemp} – ${first.maxTemp}，降雨機率 ${first.rain}，舒適度 ${first.comfort}`;
  const cuteText = getComfortCuteText(first.comfort);

  summaryCard.innerHTML = `
    <div class="summary-title">今天概況重點</div>
    <div class="summary-main">
      <p>${baseLine}</p>
    </div>
  `;
  summaryCard.classList.remove("hidden");

  if (!hasShownModal) {
    const modal = document.getElementById("todayModal");
    const modalContent = document.getElementById("modalContent");
    if (modal && modalContent) {
      modalContent.innerHTML = `
        <p>目前偵測到你所在位置為 <strong>${data.city}</strong>。</p>
        <p>這個時段的預報是：<strong>${first.weather}</strong>，氣溫約 <strong>${first.minTemp} – ${first.maxTemp}</strong>，降雨機率 <strong>${first.rain}</strong>，體感 <strong>${first.comfort}</strong>。</p>
        <p class="modal-cute-text">${cuteText}</p>
      `;
      modal.classList.add("show");
      hasShownModal = true;
    }
  }
}

// Modal 關閉
function initModalEvents() {
  const modal = document.getElementById("todayModal");
  if (!modal) return;

  const closeBtn = modal.querySelector(".modal-close");
  const knowBtn = document.getElementById("modalKnowBtn");

  [closeBtn, knowBtn].forEach((btn) => {
    if (btn) {
      btn.addEventListener("click", () => {
        modal.classList.remove("show");
      });
    }
  });
}

/* ====== D3 台灣地圖：使用 map-box 的實際高度，填滿右邊方框 ====== */
function initTaiwanMap() {
  const mapBox = document.getElementById("taiwanMap");
  if (!mapBox || typeof d3 === "undefined") {
    console.warn("找不到地圖容器或 D3 未載入");
    return;
  }

  const svg = d3.select("#taiwanSvg");

  // 讀取容器實際尺寸（右側長形卡片）
  const rect = mapBox.getBoundingClientRect();
  const width = rect.width || 320;
  const height = rect.height || 260;

  svg
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", "0 0 " + width + " " + height);

  const projection = d3.geo
    .mercator()
    .center([121, 24])
    .scale(1)
    .translate([0, 0]);

  const path = d3.geo.path().projection(projection);

  const url =
    "https://letswritetw.github.io/letswrite-taiwan-map-basic/dist/taiwan.geojson";

  d3.json(url, function (error, geometry) {
    if (error) {
      console.error("載入台灣 GeoJSON 失敗：", error);
      return;
    }

    const b = path.bounds(geometry);
    const s =
      0.9 /
      Math.max(
        (b[1][0] - b[0][0]) / width,
        (b[1][1] - b[0][1]) / height
      );
    const t = [
      (width - s * (b[1][0] + b[0][0])) / 2,
      (height - s * (b[1][1] + b[0][1])) / 2,
    ];

    projection.scale(s).translate(t);
    path.projection(projection);

    svg
      .selectAll("path")
      .data(geometry.features)
      .enter()
      .append("path")
      .attr("d", path)
      .attr("id", function (d) {
        const id = "city" + d.properties.COUNTYCODE;
        const normalizedName = normalizeCountyName(d.properties.COUNTYNAME);
        countyNameToIdMap[normalizedName] = id;
        return id;
      })
      .on("click", function (d) {
        const rawName = d.properties.COUNTYNAME;
        const cityName = normalizeCountyName(rawName);
        const citySelect = document.getElementById("citySelect");
        const statusEl = document.getElementById("status");

        if (citySelect) {
          citySelect.value = cityName;
        }
        if (statusEl) {
          statusEl.textContent = `已選擇：${cityName}`;
        }

        updateMapHighlight(cityName);
        fetchWeatherByCity(cityName);
      });

    const citySelect = document.getElementById("citySelect");
    if (citySelect && citySelect.value) {
      updateMapHighlight(citySelect.value);
    }
  });
}

// 根據縣市名稱更新地圖高亮
function updateMapHighlight(city) {
  const label = document.getElementById("mapSelectedLabel");
  if (label) {
    label.textContent = `目前縣市：${city}`;
  }

  const svgEl = document.getElementById("taiwanSvg");
  if (!svgEl) return;

  const paths = svgEl.querySelectorAll("path");
  paths.forEach((p) => p.classList.remove("active"));

  const id = countyNameToIdMap[city];
  if (id) {
    const target = document.getElementById(id);
    if (target) {
      target.classList.add("active");
    }
  }
}
