#include <Wire.h>
#include <BH1750.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BME280.h>
#include <DHT.h>
#include <WiFi.h>
#include <Firebase_ESP_Client.h>

// ---------- НАСТРОЙКИ WiFi ----------
#define WIFI_SSID "BB"
#define WIFI_PASSWORD "Student111"

// ---------- НАСТРОЙКИ FIREBASE ----------
#define FIREBASE_HOST "aerospace-476fc-default-rtdb.europe-west1.firebasedatabase.app"
#define FIREBASE_SECRET "AIzaSyD86aOhBHIRiA-bsoBoeTIpvblTXYWJ16Q" // Получить в настройках Firebase

#define SEALEVELPRESSURE_HPA 1013.25

// ---------- ПИНЫ DHT22 ----------
#define DHTPIN 27           // DHT22 на пине 27
#define DHTTYPE DHT22       // Тип датчика DHT22

// ---------- I2C ОБЪЕКТЫ ----------
TwoWire I2C_BME = TwoWire(0);   // Wire
TwoWire I2C_LUX = TwoWire(1);   // Wire1

Adafruit_BME280 bme;
BH1750 lightMeter;
DHT dht(DHTPIN, DHTTYPE);

// ---------- FIREBASE ОБЪЕКТЫ ----------
FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;

// ---------- ПЕРЕМЕННЫЕ ДЛЯ ДАННЫХ ----------
unsigned long lastSendTime = 0;
const unsigned long sendInterval = 10000; // Отправка каждые 10 секунд

// ---------- SETUP ----------
void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("Инициализация датчиков...");

  // Подключение к WiFi
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Подключение к WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.println("✅ WiFi подключен");
  Serial.print("IP адрес: ");
  Serial.println(WiFi.localIP());

  // Настройка Firebase
  config.host = FIREBASE_HOST;
  config.signer.tokens.legacy_token = FIREBASE_SECRET;
  
  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);
  
  Serial.println("✅ Firebase инициализирован");

  // BME280 → SDA 21, SCL 22
  I2C_BME.begin(21, 22);

  if (!bme.begin(0x76, &I2C_BME)) { // иногда 0x77
    Serial.println("❌ BME280 не найден");
    while (1);
  }
  Serial.println("✅ BME280 инициализирован");

  // BH1750 → SDA 17, SCL 16
  I2C_LUX.begin(17, 16);

  if (!lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE, 0x23, &I2C_LUX)) {
    Serial.println("❌ BH1750 не найден");
    while (1);
  }
  Serial.println("✅ BH1750 инициализирован");

  // DHT22 на пине 27
  dht.begin();
  Serial.println("✅ DHT22 инициализирован (пин 27)");

  Serial.println("================================");
  delay(2000);
}

// ---------- ФУНКЦИЯ ОТПРАВКИ ДАННЫХ В FIREBASE ----------
void sendToFirebase(float tempBME, float humBME, float pressure, float lux, float tempDHT, float humDHT) {
  if (Firebase.ready()) {
    // Создаем путь с временной меткой
    String timestamp = String(millis());
    String path = "/sensor_data/" + timestamp;
    
    // Создаем JSON объект с данными
    FirebaseJson json;
    json.set("timestamp", timestamp);
    json.set("bme280/temperature", tempBME);
    json.set("bme280/humidity", humBME);
    json.set("bme280/pressure", pressure);
    json.set("bh1750/illuminance", lux);
    json.set("dht22/temperature", tempDHT);
    json.set("dht22/humidity", humDHT);
    
    // Отправляем данные
    Serial.println("📤 Отправка данных в Firebase...");
    if (Firebase.RTDB.setJSON(&fbdo, path, &json)) {
      Serial.println("✅ Данные успешно отправлены");
      Serial.print("  Путь: ");
      Serial.println(path);
      
      // Отправляем также в отдельные узлы для последнего значения
      Firebase.RTDB.setFloat(&fbdo, "/latest/bme280_temperature", tempBME);
      Firebase.RTDB.setFloat(&fbdo, "/latest/bme280_humidity", humBME);
      Firebase.RTDB.setFloat(&fbdo, "/latest/bme280_pressure", pressure);
      Firebase.RTDB.setFloat(&fbdo, "/latest/bh1750_illuminance", lux);
      Firebase.RTDB.setFloat(&fbdo, "/latest/dht22_temperature", tempDHT);
      Firebase.RTDB.setFloat(&fbdo, "/latest/dht22_humidity", humDHT);
      Firebase.RTDB.setString(&fbdo, "/latest/timestamp", timestamp);
      
    } else {
      Serial.println("❌ Ошибка отправки в Firebase");
      Serial.print("  Причина: ");
      Serial.println(fbdo.errorReason());
    }
  } else {
    Serial.println("⚠️ Firebase не готов");
  }
}

// ---------- LOOP ----------
void loop() {
  // ===== ЧТЕНИЕ BME280 =====
  float tempBME = bme.readTemperature();
  float humBME = bme.readHumidity();
  float pressure = bme.readPressure() / 100.0F;
  
  // ===== ЧТЕНИЕ BH1750 =====
  float lux = lightMeter.readLightLevel();

  // ===== ЧТЕНИЕ DHT22 =====
  float humDHT = dht.readHumidity();
  float tempDHT = dht.readTemperature();

  // ===== ВЫВОД В МОНИТОР ПОРТА =====
  Serial.println("\n📊 ДАННЫЕ BME280:");
  Serial.print("🌡 Температура: ");
  Serial.print(tempBME);
  Serial.println(" °C");
  Serial.print("💧 Влажность: ");
  Serial.print(humBME);
  Serial.println(" %");
  Serial.print("⏱ Давление: ");
  Serial.print(pressure);
  Serial.println(" hPa");

  Serial.println("\n📊 ДАННЫЕ BH1750:");
  Serial.print("💡 Освещенность: ");
  Serial.print(lux);
  Serial.println(" lx");

  Serial.println("\n📊 ДАННЫЕ DHT22 (пин 27):");
  
  if (isnan(humDHT) || isnan(tempDHT)) {
    Serial.println("❌ Ошибка чтения DHT22!");
    tempDHT = 0;
    humDHT = 0;
  } else {
    Serial.print("🌡 Температура: ");
    Serial.print(tempDHT);
    Serial.println(" °C");
    Serial.print("💧 Влажность: ");
    Serial.print(humDHT);
    Serial.println(" %");
  }

  // ===== ОТПРАВКА В FIREBASE =====
  unsigned long currentTime = millis();
  if (currentTime - lastSendTime >= sendInterval) {
    sendToFirebase(tempBME, humBME, pressure, lux, tempDHT, humDHT);
    lastSendTime = currentTime;
  }

  Serial.println("================================");
  delay(2000);
}
