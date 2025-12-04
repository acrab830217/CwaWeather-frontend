// ✅ 如果前端也是在本機，後端開在 3000 port，這樣寫就好
const API_BASE = "http://127.0.0.1:3000";
const DEFAULT_CITY = "臺北市";

// 台灣各縣市基準座標（約略中心點）
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

// 頁面載入
window.addEventListener("load", () => {
  const statusEl = document.getElementById("status");
  const locationEl = document.getElementById("location");
  const citySelect = document.getElementById("citySelect");

  // 先把縣市選單建立好，但先 disable，等健康檢查通過再啟用
  citySelect.innerHTML = "";
  CITY_COORDS.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.name;
    opt.textContent = c.name;
    citySelect.appendChild(opt);
  });

  citySelect.addEventListener("change", (e) => {
    const city = e.target.value;
    if (!city) return;
    statusEl.textContent = `已選擇：${city}`;
    fetchWeatherByCity(city);
  });

  // ✅ 第一步：打 /api/health 看前端到底連不連得到後端
  testBackendHealth().then((ok) => {
    if (!ok) {
      // 如果 health 都失敗，就不要再往下跑了
      citySelect.disabled = true;
      return;
    }

    citySelect.disabled = false;
    statusEl.textContent = "伺服器連線正常，正在取得您的位置...";

    // ✅ 第二步：伺服器 OK，再做自動定位
    autoDetectCityWithGeolocation(statusEl, locationEl, citySelect);
  });
});

// 檢查 /api/health
async function testBackendHealth() {
  const statusEl = document.getElementById("status");
  const weatherEl = document.getElementById("weather");

  const url = `${API_BASE}/api/health`;
  console.log("健康檢查 URL:", url);

  try {
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text();
      console.error("健康檢查 HTTP 錯誤：", res.status, text);
      statusEl.textContent =
        "無法連線到伺服器（/api/health HTTP " + res.status + "）。";
      weatherEl.innerHTML =
        '<div class="error">健康檢查失敗，請確認後端網址與 port。</div>';
      return false;
    }

    const json = await res.json();
    console.log("健康檢查回傳：", json);
    statusEl.textContent = "伺服器連線正常。";
    return true;
  } catch (err) {
    console.error("健康檢查發生錯誤：", err);
    statusEl.textContent = "無法連線到伺服器（health）。";
    const weatherEl = document.getElementById("weather");
    weatherEl.innerHTML =
      '<div class="error">無法連線到伺服器（health）：' +
      (err.message || err) +
      "</div>";
    return false;
  }
}

// 用定位自動選最近縣市
function autoDetectCityWithGeolocation(statusEl, locationEl, citySelect) {
  if (!navigator.geolocation) {
    statusEl.textContent =
      "此瀏覽器不支援定位功能，改用預設城市（" + DEFAULT_CITY + "）。";
    citySelect.value = DEFAULT_CITY;
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
        fetchWeatherByCity(DEFAULT_CITY);
        return;
      }

      statusEl.textContent += `（最近縣市：${nearest.name}）`;
      citySelect.value = nearest.name;
      fetchWeatherByCity(nearest.name);
    },
    (error) => {
      console.error("取得定位失敗：", error);
      statusEl.textContent =
        "無法取得您的位置，改用預設城市（" + DEFAULT_CITY + "）。";
      citySelect.value = DEFAULT_CITY;
      fetchWeatherByCity(DEFAULT_CITY);
    }
  );
}

// 使用平方距離找最近縣市
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

    // 後端格式：{ success: true, data: {...} }
    if (!json.success) {
      weatherEl.innerHTML =
        '<div class="error">取得天氣失敗：' +
        (json.message || "未知錯誤") +
        "</div>";
      return;
    }

    const data = json.data;
    renderWeather(data);
  } catch (err) {
    console.error("fetchWeatherByCity 發生錯誤：", err);
    weatherEl.innerHTML =
      '<div class="error">無法連線到伺服器（weather）：' +
      (err.message || err) +
      "</div>";
  }
}

// 把天氣資料畫到畫面上
function renderWeather(data) {
  const weatherEl = document.getElementById("weather");

  if (!data || !Array.isArray(data.forecasts)) {
    weatherEl.innerHTML =
      '<div class="error">天氣資料格式錯誤，請稍後再試。</div>';
    return;
  }

  const forecasts = data.forecasts.slice(0, 3); // 顯示前 3 筆預報

  let html = `
    <div class="city">${data.city}</div>
    <div class="meta">資料描述：${data.updateTime}</div>
    <ul>
  `;

  forecasts.forEach((f) => {
    html += `
      <li>
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
