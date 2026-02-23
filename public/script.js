// ===========================
// Configuration & Data
// ===========================
const CONFIG = {
  almaty: {
    name: 'Алматы',
    district: 'Бостандыкский район',
    coords: [43.2389, 76.8897],
    timezone: 6 // UTC+6
  }
};

let map;
let markers = {};
let charts = {};
let dataHistory = {
  almaty: []
};

// ===========================
// Utility Functions
// ===========================
function formatTimestamp(timestamp) {
  const date = new Date();
  const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}, ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function updateCurrentTime() {
  const now = new Date();
  const timeString = now.toLocaleString('ru-RU', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  document.getElementById('currentTime').textContent = timeString;
}

// ===========================
// Alert System
// ===========================
let lastAlert = null;

function initAlertSystem() {
  // Создаем алерт элемент если его нет
  if (!document.getElementById('eventAlert')) {
    const alertDiv = document.createElement('div');
    alertDiv.id = 'eventAlert';
    alertDiv.className = 'event-alert';
    alertDiv.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #ff3b3b;
      color: white;
      padding: 14px 20px;
      border-radius: 10px;
      display: none;
      font-weight: 600;
      box-shadow: 0 10px 30px rgba(0,0,0,.35);
      z-index: 9999;
      transform: translateX(0);
      transition: all 0.3s ease;
    `;
    document.body.appendChild(alertDiv);
    
    // Добавляем звуковой элемент (можно заменить на реальный звуковой файл)
    const audio = document.createElement('audio');
    audio.id = 'alertSound';
    audio.preload = 'auto';
    // Используем data URI для простого звука (можно заменить на mp3 файл)
    audio.innerHTML = '<source src="data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmGgU7k9n1unEiBC13yO/eizEIHWq+8+OWT" type="audio/wav">';
    document.body.appendChild(audio);
  }
}

function triggerAlert(prediction) {
  // Защита от спама одинаковых алертов
  if (lastAlert === prediction.summary) return;
  lastAlert = prediction.summary;

  const alertBox = document.getElementById('eventAlert');
  alertBox.innerHTML = `
    <div style="display: flex; align-items: center; gap: 10px;">
      <i class="fas fa-exclamation-triangle" style="font-size: 20px;"></i>
      <div>
        <div style="font-weight: bold;">⚠️ Внимание!</div>
        <div style="font-size: 14px;">${prediction.summary} (${prediction.confidence}%)</div>
      </div>
    </div>
  `;
  
  alertBox.style.display = 'block';
  alertBox.style.animation = 'slideInRight 0.3s ease';
  
  // Пытаемся воспроизвести звук
  try {
    const audio = document.getElementById('alertSound');
    if (audio) {
      audio.play().catch(e => console.log('Audio play failed:', e));
    }
  } catch (e) {
    console.log('Audio error:', e);
  }
  
  // Автоматически скрываем через 6 секунд
  setTimeout(() => {
    alertBox.style.animation = 'slideOutRight 0.3s ease';
    setTimeout(() => {
      alertBox.style.display = 'none';
    }, 300);
  }, 6000);
}

// ===========================
// Real-time Data Fetching
// ===========================
async function fetchLatestData() {
  try {
    const response = await fetch('/api/latest');
    const data = await response.json();
    
    if (!data || Object.keys(data).length === 0) {
      console.warn('Нет данных с Firebase - станция оффлайн');
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('Ошибка получения данных:', error);
    return null;
  }
}

async function fetchPrediction() {
  try {
    const response = await fetch('/api/predict');
    const prediction = await response.json();
    
    if (prediction.error) {
      console.warn('Prediction error:', prediction.error);
      return null;
    }
    
    return prediction;
  } catch (error) {
    console.error('Error fetching prediction:', error);
    return null;
  }
}

function calculateRainProbability(city, data, history) {
  const humidity = data.bme280_humidity;
  const pressure = data.bme280_pressure;
  
  // Проверяем падение давления
  let pressureDrop = 0;
  if (history.length >= 2) {
    const prevPressure = history[history.length - 2].bme280_pressure;
    pressureDrop = prevPressure - pressure;
  }
  
  let probability = 0;
  
  // Алматы - горный климат, более резкие изменения
  if (humidity > 55 && pressureDrop > 0.5) {
    probability = Math.min(95, 60 + humidity * 0.5 + pressureDrop * 10);
  } else if (humidity > 55) {
    probability = 40 + humidity * 0.3;
  } else if (pressureDrop > 1) {
    probability = 50 + pressureDrop * 8;
  }
  
  return Math.max(0, Math.min(100, probability));
}

function getRainStatus(probability) {
  if (probability < 30) return { status: 'clear', text: 'Осадков не ожидается', class: 'low' };
  if (probability < 60) return { status: 'possible', text: 'Возможен дождь', class: 'medium' };
  return { status: 'rain', text: 'Ожидается дождь', class: 'high' };
}

function getMarkerClass(probability) {
  if (probability < 30) return 'clear';
  if (probability < 60) return 'possible';
  return 'rain';
}

function scrollToMap() {
  document.getElementById('mapSection').scrollIntoView({ behavior: 'smooth' });
}

// ===========================
// UI Update Functions
// ===========================
function updateRealtimeCard(city, data) {
  const prefix = city.toLowerCase();
  const card = document.getElementById(`${prefix}Card`);
  
  // Добавляем анимацию обновления
  card.classList.add('updating');
  setTimeout(() => card.classList.remove('updating'), 500);
  
  // Обновляем значения
  document.getElementById(`${prefix}Temp`).textContent = data.bme280_temperature.toFixed(1) + '°C';
  document.getElementById(`${prefix}Humidity`).textContent = data.bme280_humidity.toFixed(1) + '%';
  document.getElementById(`${prefix}Pressure`).textContent = Math.round(data.bme280_pressure);
  document.getElementById(`${prefix}Light`).textContent = data.bh1750_illuminance.toFixed(1);
  
  // Обновляем бейдж
  const badge = document.getElementById(`${prefix}Update`);
  badge.textContent = 'Обновлено';
  badge.style.animation = 'none';
  setTimeout(() => badge.style.animation = 'fadeIn 0.3s', 10);
}

function updateMiniChart(city, history) {
  const prefix = city.toLowerCase();
  const ctx = document.getElementById(`${prefix}MiniChart`);
  
  if (charts[prefix]) {
    charts[prefix].destroy();
  }
  
  const last5 = history.slice(-5);
  const labels = last5.map((_, i) => `-${(5-i)*10}мин`);
  const tempData = last5.map(d => d.bme280_temperature.toFixed(1));
  const humidityData = last5.map(d => d.bme280_humidity.toFixed(1));
  
  charts[prefix] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Температура',
          data: tempData,
          borderColor: '#00F0FF',
          backgroundColor: 'rgba(0, 240, 255, 0.1)',
          tension: 0.4,
          fill: true
        },
        {
          label: 'Влажность',
          data: humidityData,
          borderColor: '#00FFA3',
          backgroundColor: 'rgba(0, 255, 163, 0.1)',
          tension: 0.4,
          fill: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            color: '#8E9AB0',
            font: { size: 10 }
          }
        }
      },
      scales: {
        y: {
          display: true,
          grid: { color: 'rgba(0, 240, 255, 0.1)' },
          ticks: { color: '#8E9AB0', font: { size: 10 } }
        },
        x: {
          display: true,
          grid: { display: false },
          ticks: { color: '#8E9AB0', font: { size: 10 } }
        }
      }
    }
  });
}

// ===========================
// Weather Predictions Functions
// ===========================
function getPredictionStatus(probability) {
  if (probability < 30) {
    return {
      icon: 'fa-sun',
      iconClass: 'clear',
      text: 'Ясная погода',
      subtitle: 'Осадков не ожидается'
    };
  } else if (probability < 60) {
    return {
      icon: 'fa-cloud-sun',
      iconClass: 'possible',
      text: 'Переменная облачность',
      subtitle: 'Возможны кратковременные осадки'
    };
  } else {
    return {
      icon: 'fa-cloud-rain',
      iconClass: 'rain',
      text: 'Дождливая погода',
      subtitle: 'Ожидаются осадки'
    };
  }
}

function getChangeIndex(probability, prevProbability) {
  const change = Math.abs(probability - prevProbability);
  if (change < 10) return { text: 'Низкий', color: 'var(--success)' };
  if (change < 25) return { text: 'Средний', color: 'var(--warning)' };
  return { text: 'Высокий', color: 'var(--danger)' };
}

function generateHourlyForecast(currentProbability) {
  const forecast = [];
  let probability = currentProbability;
  
  for (let i = 0; i < 6; i++) {
    const change = (Math.random() - 0.4) * 15;
    probability = Math.max(0, Math.min(100, probability + change));
    
    const status = getPredictionStatus(probability);
    forecast.push({
      time: `+${i + 1}ч`,
      probability: Math.round(probability),
      icon: status.icon,
      iconClass: status.iconClass
    });
  }
  
  return forecast;
}

function updatePredictionCard(cityId, prediction, history) {
  const prefix = cityId.toLowerCase();
  const card = document.getElementById(`${prefix}PredictionCard`);
  
  if (!card) return;
  
  // Если нет GPT предикта, используем fallback
  if (!prediction) {
    const latestData = history[history.length - 1];
    if (latestData) {
      const localProbability = calculateRainProbability(cityId, latestData, history);
      const fallbackPrediction = {
        rainChance: localProbability,
        summary: getRainStatus(localProbability).text,
        changeIndex: localProbability > 60 ? 'Высокий' : localProbability > 30 ? 'Средний' : 'Низкий',
        confidence: 70
      };
      updatePredictionCard(cityId, fallbackPrediction, history);
    }
    return;
  }
  
  // Используем данные от GPT как основной источник
  const rainChance = prediction.rainChance || 0;
  const rainStatus = getRainStatus(rainChance);
  
  // Обновляем иконку и статус
  const iconElement = document.getElementById(`${prefix}PredictionIcon`);
  iconElement.innerHTML = `<i class="${rainStatus.icon}"></i>`;
  iconElement.className = `prediction-icon ${rainStatus.status}`;
  
  // Обновляем текст статуса
  const statusElement = document.getElementById(`${prefix}PredictionStatus`);
  statusElement.querySelector('.status-text').textContent = prediction.summary || rainStatus.text;
  statusElement.querySelector('.status-subtitle').textContent = 
    rainChance > 60 ? 'Высокая вероятность осадков' : 
    rainChance > 30 ? 'Возможны осадки' : 'Осадков не ожидается';
  
  // Обновляем детали
  document.getElementById(`${prefix}RainChance`).textContent = `${rainChance}%`;
  document.getElementById(`${prefix}ChangeIndex`).textContent = prediction.changeIndex || 'Низкий';
  
  // Обновляем уверенность
  const confidence = prediction.confidence || 70;
  document.getElementById(`${prefix}Confidence`).style.width = `${confidence}%`;
  document.querySelector(`#${prefix}PredictionCard .confidence-text strong`).textContent = `${confidence}%`;
  
  // Генерируем почасовой прогноз
  const hourlyForecast = generateHourlyForecast(rainChance);
  const hourlyContainer = document.getElementById(`${prefix}HourlyForecast`);
  hourlyContainer.innerHTML = hourlyForecast.map(hour => `
    <div class="hourly-item">
      <div class="hourly-time">${hour.time}</div>
      <div class="hourly-icon ${hour.iconClass}">
        <i class="fas ${hour.icon}"></i>
      </div>
      <div class="hourly-chance">${hour.probability}%</div>
    </div>
  `).join('');
  
  // Анимация обновления
  card.classList.add('updating');
  setTimeout(() => card.classList.remove('updating'), 500);
}

function updatePredictionTimers() {
  const countdown = 10;
  let seconds = countdown;
  
  const timer = setInterval(() => {
    seconds--;
    document.getElementById('astanaNextUpdate').textContent = `Обновление через ${seconds}с`;
    document.getElementById('almatyNextUpdate').textContent = `Обновление через ${seconds}с`;
    
    if (seconds <= 0) {
      clearInterval(timer);
      setTimeout(() => {
        document.getElementById('astanaNextUpdate').textContent = 'Обновление...';
        document.getElementById('almatyNextUpdate').textContent = 'Обновление...';
      }, 100);
    }
  }, 1000);
}

// ===========================
// Map Functions
// ===========================
function initMap() {
  map = L.map('map', {
    center: [48.0, 68.0], // Центр Казахстана
    zoom: 5,
    zoomControl: true,
    scrollWheelZoom: true
  });
  
  // Устанавливаем границы карты на Казахстан
  const kazakhstanBounds = [[40.0, 46.0], [55.0, 87.0]]; // Юго-запад, север-восток
  map.setMaxBounds(kazakhstanBounds);
  
  // Базовые слои карты
  const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 18
  });
  
  // NASA спутниковые слои
  const currentDate = new Date().toISOString().split('T')[0];
  
  const nasaTrueColor = L.tileLayer(
    'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/' +
    'MODIS_Terra_CorrectedReflectance_TrueColor/default/{time}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg',
    {
      time: currentDate,
      attribution: 'NASA GIBS',
      maxZoom: 9,
      opacity: 0.8
    }
  );
  
  const nasaClouds = L.tileLayer(
    'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/' +
    'MODIS_Terra_CloudFraction/default/{time}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg',
    {
      time: currentDate,
      attribution: 'NASA GIBS',
      maxZoom: 9,
      opacity: 0.7
    }
  );
  
  // Добавляем базовый слой по умолчанию
  osmLayer.addTo(map);
  
  // Создаем контрол для переключения слоев
  const baseMaps = {
    "OpenStreetMap": osmLayer,
    "NASA Спутник (True Color)": nasaTrueColor,
    "NASA Облака": nasaClouds
  };
  
  L.control.layers(baseMaps, {}, {
    position: 'topright'
  }).addTo(map);
  
  // Добавляем маркер для Алматы
  addCityMarker('almaty', CONFIG.almaty);
}

function addCityMarker(cityId, config) {
  const iconHtml = `<div class="marker-icon clear"><i class="fas fa-tower-broadcast"></i></div>`;
  
  const customIcon = L.divIcon({
    className: 'custom-marker',
    html: iconHtml,
    iconSize: [50, 50],
    iconAnchor: [25, 25]
  });
  
  const marker = L.marker(config.coords, { icon: customIcon }).addTo(map);
  
  marker.on('click', () => {
    openStationModal(cityId);
  });
  
  // Добавляем простой popup с названием города
  marker.bindTooltip(config.name, {
    permanent: false,
    direction: 'top',
    offset: [0, -25],
    className: 'city-tooltip'
  });
  
  markers[cityId] = marker;
}

function updateMarker(cityId, probability) {
  const markerClass = getMarkerClass(probability);
  const iconHtml = `<div class="marker-icon ${markerClass}"><i class="fas fa-tower-broadcast"></i></div>`;
  
  const customIcon = L.divIcon({
    className: 'custom-marker',
    html: iconHtml,
    iconSize: [50, 50],
    iconAnchor: [25, 25]
  });
  
  markers[cityId].setIcon(customIcon);
}

// ===========================
// Modal Functions
// ===========================
function openStationModal(cityId) {
  const config = CONFIG[cityId];
  const data = dataHistory[cityId][dataHistory[cityId].length - 1];
  const probability = calculateRainProbability(cityId, data, dataHistory[cityId]);
  const rainInfo = getRainStatus(probability);
  
  // Проверка разницы температур
  const tempDiff = Math.abs(data.bme280_temperature - data.dht22_temperature);
  const tempWarning = tempDiff > 0.5;
  
  const modalBody = document.getElementById('modalBody');
  modalBody.innerHTML = `
    <div class="station-popup">
      <div class="station-header">
        <h2 class="station-title">
          <i class="fas fa-map-marker-alt"></i>
          Станция ${config.name}, ${config.district}
        </h2>
        <div class="station-photo">
          <i class="fas fa-microchip"></i>
        </div>
      </div>
      
      <div class="sensor-section">
        <h3 class="sensor-section-title">
          <i class="fas fa-temperature-half"></i>
          Температура
        </h3>
        <div class="sensor-data">
          <div class="sensor-item ${tempWarning ? 'warning' : ''}">
            <div class="sensor-label">BME280</div>
            <div class="sensor-value">${data.bme280_temperature.toFixed(1)}°C</div>
          </div>
          <div class="sensor-item ${tempWarning ? 'warning' : ''}">
            <div class="sensor-label">DHT22</div>
            <div class="sensor-value">${data.dht22_temperature.toFixed(1)}°C</div>
          </div>
        </div>
        ${tempWarning ? '<p style="color: var(--warning); font-size: 12px;"><i class="fas fa-exclamation-triangle"></i> Разница показаний более 0.5°C</p>' : ''}
      </div>
      
      <div class="sensor-section">
        <h3 class="sensor-section-title">
          <i class="fas fa-droplet"></i>
          Влажность
        </h3>
        <div class="sensor-data">
          <div class="sensor-item">
            <div class="sensor-label">BME280</div>
            <div class="sensor-value">${data.bme280_humidity.toFixed(1)}%</div>
          </div>
          <div class="sensor-item">
            <div class="sensor-label">DHT22</div>
            <div class="sensor-value">${data.dht22_humidity.toFixed(1)}%</div>
          </div>
        </div>
      </div>
      
      <div class="sensor-section">
        <h3 class="sensor-section-title">
          <i class="fas fa-gauge"></i>
          Давление и освещенность
        </h3>
        <div class="sensor-data">
          <div class="sensor-item">
            <div class="sensor-label">BME280 Давление</div>
            <div class="sensor-value">${Math.round(data.bme280_pressure)} гПа</div>
          </div>
          <div class="sensor-item">
            <div class="sensor-label">BH1750 Освещенность</div>
            <div class="sensor-value">${data.bh1750_illuminance.toFixed(1)} лк</div>
          </div>
        </div>
      </div>
      
      <div class="sensor-section">
        <p style="color: var(--text-secondary); font-size: 14px;">
          <i class="far fa-clock"></i>
          Время измерения: ${formatTimestamp(data.timestamp)}
        </p>
      </div>
      
      <div class="forecast-section">
        <h3 class="sensor-section-title">
          <i class="fas fa-cloud-rain"></i>
          Прогноз осадков на 3 часа
        </h3>
        <div class="forecast-chart-container">
          <canvas id="forecastChart"></canvas>
        </div>
        <div class="rain-probability">
          <p style="color: var(--text-secondary); margin-bottom: 10px;">Вероятность дождя:</p>
          <div class="probability-bar">
            <div class="probability-fill ${rainInfo.class}" style="width: ${probability}%"></div>
          </div>
          <p style="text-align: center; font-size: 24px; font-weight: 600; color: var(--accent); margin-top: 10px;">
            ${probability}%
          </p>
        </div>
        <div class="forecast-status">
          ${rainInfo.text}
        </div>
      </div>
    </div>
  `;
  
  document.getElementById('stationModal').style.display = 'block';
  
  // Рисуем график прогноза
  setTimeout(() => drawForecastChart(probability), 100);
}

function closeModal() {
  document.getElementById('stationModal').style.display = 'none';
}

function drawForecastChart(currentProbability) {
  const ctx = document.getElementById('forecastChart');
  if (!ctx) return;
  
  // Генерируем прогноз на 3 часа (6 точек по 30 минут)
  const labels = ['Сейчас', '+30мин', '+1ч', '+1.5ч', '+2ч', '+2.5ч', '+3ч'];
  const data = [currentProbability];
  
  // Генерируем тренд прогноза
  let current = currentProbability;
  for (let i = 0; i < 6; i++) {
    const change = (Math.random() - 0.4) * 15; // Слегка растущий тренд
    current = Math.max(0, Math.min(100, current + change));
    data.push(Math.round(current));
  }
  
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Вероятность осадков (%)',
        data: data,
        borderColor: '#00F0FF',
        backgroundColor: 'rgba(0, 240, 255, 0.2)',
        tension: 0.4,
        fill: true,
        pointRadius: 5,
        pointHoverRadius: 7
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          grid: {
            color: 'rgba(0, 240, 255, 0.1)'
          },
          ticks: {
            color: '#8E9AB0',
            callback: function(value) {
              return value + '%';
            }
          }
        },
        x: {
          grid: {
            display: false
          },
          ticks: {
            color: '#8E9AB0'
          }
        }
      }
    }
  });
}

// ===========================
// Background Particles
// ===========================
function createParticles() {
  const container = document.getElementById('particlesBg');
  const particleCount = 30;
  
  for (let i = 0; i < particleCount; i++) {
    const particle = document.createElement('div');
    particle.className = 'particle';
    
    const size = Math.random() * 4 + 2;
    const left = Math.random() * 100;
    const delay = Math.random() * 20;
    const duration = Math.random() * 10 + 15;
    
    particle.style.width = size + 'px';
    particle.style.height = size + 'px';
    particle.style.left = left + '%';
    particle.style.top = Math.random() * 100 + '%';
    particle.style.animationDelay = delay + 's';
    particle.style.animationDuration = duration + 's';
    
    container.appendChild(particle);
  }
}

// ===========================
// Data Update Functions
// ===========================
async function updateRealtimeData() {
  const latestData = await fetchLatestData();
  
  if (latestData) {
    // Обновляем данные для Алматы
    dataHistory.almaty.push(latestData);
    if (dataHistory.almaty.length > 10) dataHistory.almaty.shift();
    
    updateRealtimeCard('Алматы', latestData);
    updateMiniChart('almaty', dataHistory.almaty);
  }
}

async function updatePredictionData() {
  const prediction = await fetchPrediction();
  
  if (prediction) {
    // Обновляем предикты для Алматы
    updatePredictionCard('almaty', prediction, dataHistory.almaty);
    
    // Обновляем маркер на карте
    updateMarker('almaty', prediction.rainChance);
    
    // Проверяем на высокую уверенность для алертов
    if (prediction.confidence >= 90) {
      triggerAlert(prediction);
    }
  }
}

// ===========================
// Initialization
// ===========================
document.addEventListener('DOMContentLoaded', async () => {
  // Создаем частицы фона
  createParticles();
  
  // Инициализируем карту
  initMap();
  
  // Инициализируем алерт систему
  initAlertSystem();
  
  // Первоначальная загрузка данных
  await updateRealtimeData();
  await updatePredictionData();
  
  // Обновляем время каждую секунду
  updateCurrentTime();
  setInterval(updateCurrentTime, 1000);
  
  // Обновляем данные с Firebase каждые 5 секунд
  setInterval(updateRealtimeData, 5000);
  
  // Обновляем предикты каждые 10 секунд
  setInterval(updatePredictionData, 10000);
  
  // Закрываем модалку по клику вне её
  window.onclick = function(event) {
    const modal = document.getElementById('stationModal');
    if (event.target == modal) {
      modal.style.display = 'none';
    }
  };
  
  // Добавляем анимацию появления для элементов при скролле
  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -100px 0px'
  };
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
      }
    });
  }, observerOptions);
  
  document.querySelectorAll('.fade-in').forEach(el => {
    observer.observe(el);
  });
});
