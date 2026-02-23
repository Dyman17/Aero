const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const { OpenAI } = require('openai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// OpenAI configuration
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Firebase URL
const FIREBASE_URL = 'https://aerospace-476fc-default-rtdb.europe-west1.firebasedatabase.app/latest.json';

// Кеширование данных
let cachedLatest = null;
let cachedPrediction = null;
let lastPredictionTime = 0;

// API для получения последних данных с Firebase
app.get('/api/latest', async (req, res) => {
  try {
    const response = await fetch(FIREBASE_URL);
    const data = await response.json();
    
    if (!data) {
      return res.json({});
    }
    
    cachedLatest = data;
    
    res.json(data);
  } catch (err) {
    console.error('Ошибка получения данных Firebase:', err);
    res.status(500).json({ error: 'Ошибка получения данных' });
  }
});

// API для получения прогноза от GPT
app.get('/api/predict', async (req, res) => {
  try {
    const now = Date.now();
    
    // Если есть кеш и он не старше 10 секунд, возвращаем его
    if (cachedPrediction && (now - lastPredictionTime) < 10000) {
      return res.json(cachedPrediction);
    }
    
    // Если нет данных для анализа
    if (!cachedLatest) {
      return res.json({ error: 'Нет данных для анализа' });
    }
    
    // Запрос к OpenAI (o4-mini) для анализа погоды
    const prompt = `Ты — аналитическая погодная модель.

Тебе передаются данные с метеостанции в формате JSON.
Нужно проанализировать текущие значения и выдать краткий прогноз на ближайшие 3 часа.

ВАЖНО:
- Верни ТОЛЬКО JSON.
- Никакого текста вне JSON.
- Без пояснений.
- Без markdown.
- Без комментариев.
- Только корректный JSON.

Анализируй:
- Температуру
- Влажность
- Давление
- Освещенность

Логика:
- Высокая влажность (>70%) + падающее давление → повышенная вероятность осадков
- Давление <1000 гПа → нестабильная атмосфера
- Резкие изменения температуры → высокий индекс изменений
- Низкая освещенность при высокой влажности → возможная облачность

Верни JSON строго в формате:
{
  "summary": "краткое описание погоды",
  "rainChance": число_0_100,
  "changeIndex": "Низкий | Средний | Высокий",
  "confidence": число_0_100,
  "trend": "Стабильно | Ухудшение | Улучшение",
  "riskLevel": "Низкий | Средний | Высокий"
}

Вот входные данные:
${JSON.stringify(cachedLatest, null, 2)}`;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 500,
        temperature: 0.3
      });

      const text = response.choices[0]?.message?.content || '';
      const prediction = JSON.parse(text.trim());
      
      // Валидация и дополнение данных
      prediction.city = 'Алматы';
      prediction.rainChance = Math.min(100, Math.max(0, prediction.rainChance || 0));
      prediction.confidence = Math.min(100, Math.max(0, prediction.confidence || 70));
      
      cachedPrediction = prediction;
      lastPredictionTime = now;
      
      res.json(prediction);
    } catch (openaiError) {
      console.error('Ошибка OpenAI API:', openaiError);
      
      // Fallback к простой логике если OpenAI недоступен
      const humidity = cachedLatest.bme280_humidity || 0;
      const pressure = cachedLatest.bme280_pressure || 0;
      const temperature = cachedLatest.bme280_temperature || 0;
      
      let rainChance = Math.min(100, Math.round(humidity * 0.8 + (1013 - pressure) * 2));
      let confidence = rainChance > 70 ? 85 : 75;
      
      if (humidity > 70 && pressure < 1000) {
        rainChance = Math.min(95, rainChance + 20);
        confidence = 90;
      }
      
      const fallbackPrediction = {
        city: 'Алматы',
        summary: rainChance > 70 ? 'Высокая вероятность осадков' : 'Стабильная погода',
        rainChance: rainChance,
        changeIndex: rainChance > 60 ? 'Высокий' : rainChance > 30 ? 'Средний' : 'Низкий',
        confidence: confidence,
        trend: pressure < 1005 ? 'Ухудшение' : 'Стабильно',
        riskLevel: rainChance > 80 ? 'Высокий' : rainChance > 50 ? 'Средний' : 'Низкий'
      };
      
      cachedPrediction = fallbackPrediction;
      lastPredictionTime = now;
      
      res.json(fallbackPrediction);
    }
  } catch (err) {
    console.error('Ошибка анализа:', err);
    res.status(500).json({ error: 'Ошибка анализа' });
  }
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
  console.log(`Откройте http://localhost:${PORT} в браузере`);
});
