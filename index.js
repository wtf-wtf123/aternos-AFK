const mineflayer = require('mineflayer');
const axios = require('axios');
const config = require('./config.json');

// --- ПЕРЕМЕННЫЕ ---
let botName = config.bot.name;
let reconnectAttempts = 0;
let failAttempts = 0;
const MAX_FAIL_ATTEMPTS = 3;
let minecraftBot = null;
let isBotRunning = false;
let nickInterval = null;

// --- ОТПРАВКА ЛОГОВ В DISCORD ЧЕРЕЗ ВЕБХУК ---
function sendLog(message) {
  // Вывод в консоль
  const timestamp = new Date().toLocaleString();
  const fullMessage = `[${timestamp}] ${message}`;
  console.log(fullMessage);

  // Отправка в Discord, если включено
  if (!config.discord.enabled || !config.discord.webhookUrl) return;

  axios.post(config.discord.webhookUrl, {
    content: fullMessage
  }).catch(err => {
    // Если вебхук не работает — просто молчим, чтобы не засорять консоль
  });
}

// --- ЗАПУСК MINECRAFT БОТА ---
function startMinecraftBot() {
  if (isBotRunning) return;
  isBotRunning = true;

  sendLog(`🚀 Запуск бота ${botName}...`);

  minecraftBot = mineflayer.createBot({
    host: config.server.ip,
    port: config.server.port,
    username: botName,
    version: config.server.version
  });

  // --- ВХОД ---
  minecraftBot.on('login', () => {
    sendLog(`✅ Бот ${botName} зашёл на сервер!`);
    reconnectAttempts = 0;
    failAttempts = 0;

    // Запускаем плавную смену ника (если включена)
    if (config.features.nickChanger.enabled) {
      if (nickInterval) clearInterval(nickInterval);
      nickInterval = setInterval(() => {
        const newNick = config.features.nickChanger.prefix + Date.now().toString().slice(-4);
        botName = newNick;
        sendLog(`🔄 Плавная смена ника на ${newNick}`);
        if (minecraftBot) {
          minecraftBot.end();
          setTimeout(() => {
            startMinecraftBot();
          }, 3000);
        }
      }, config.features.nickChanger.interval || 120000);
    }
  });

  // --- СПАВН В МИРЕ ---
  minecraftBot.on('spawn', () => {
    sendLog(`🌍 Бот появился в мире!`);
    startTasks(minecraftBot);
  });

  // --- ДВИЖЕНИЕ ---
  function startMovement(bot) {
    if (!config.features.movement.enabled) return;
    setInterval(() => {
      if (!bot.entity) return;
      const x = bot.entity.position.x + (Math.random() - 0.5) * config.features.movement.range;
      const z = bot.entity.position.z + (Math.random() - 0.5) * config.features.movement.range;
      bot.setControlState('forward', true);
      setTimeout(() => bot.setControlState('forward', false), 1000);
      bot.look(Math.random() * Math.PI * 2, 0);
    }, config.features.movement.delay);
  }

  // --- АТАКА МОБОВ ---
  function startAttack(bot) {
    if (!config.features.attackMobs.enabled) return;
    setInterval(() => {
      const mob = bot.nearestEntity(entity => 
        entity.type === 'mob' && 
        bot.entity.position.distanceTo(entity.position) < config.features.attackMobs.range
      );
      if (mob) bot.attack(mob);
    }, 2000);
  }

  // --- СОН ---
  function startSleep(bot) {
    if (!config.features.sleep.enabled) return;
    setInterval(() => {
      const bed = bot.findBlock({ matching: block => block.name === 'bed', maxDistance: 10 });
      if (bed) bot.sleep(bed);
    }, config.features.sleep.timeout);
  }

  function startTasks(bot) {
    startMovement(bot);
    startAttack(bot);
    startSleep(bot);
  }

  // --- ОБРАБОТКА ОТКЛЮЧЕНИЙ ---
  minecraftBot.on('kicked', (reason) => {
    const reasonText = typeof reason === 'string' ? reason : JSON.stringify(reason);
    sendLog(`❌ Кикнут: ${reasonText}`);
    handleDisconnect('kicked', reasonText);
  });

  minecraftBot.on('end', (reason) => {
    sendLog(`❌ Отключён: ${reason}`);
    handleDisconnect('end', reason);
  });

  minecraftBot.on('error', (err) => {
    sendLog(`⚠️ Ошибка: ${err.message}`);
    if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND') {
      failAttempts++;
      sendLog(`📉 Неудачная попытка (${failAttempts}/${MAX_FAIL_ATTEMPTS})`);
      if (failAttempts >= MAX_FAIL_ATTEMPTS && config.features.nickChanger.enabled) {
        const newNick = config.features.nickChanger.prefix + Date.now().toString().slice(-4);
        botName = newNick;
        sendLog(`🔄 Смена ника на ${newNick} из-за ошибок подключения`);
        failAttempts = 0;
        if (minecraftBot) {
          minecraftBot.end();
          setTimeout(() => startMinecraftBot(), 3000);
        }
      }
    }
  });

  function handleDisconnect(event, reason) {
    const isBan = typeof reason === 'string' && reason.toLowerCase().includes('banned');
    if (isBan && config.features.nickChanger.enabled) {
      const newNick = config.features.nickChanger.prefix + Date.now().toString().slice(-4);
      botName = newNick;
      sendLog(`🔄 Бан! Смена ника на ${newNick}`);
      setTimeout(() => {
        if (minecraftBot) {
          minecraftBot.end();
          setTimeout(() => startMinecraftBot(), 3000);
        }
      }, 3000);
      return;
    }

    if (config.features.autoReconnect.enabled) {
      const minDelay = config.features.autoReconnect.minDelay || 5000;
      const maxDelay = config.features.autoReconnect.maxDelay || 120000;
      let delay = Math.min(minDelay * Math.pow(2, reconnectAttempts), maxDelay);
      reconnectAttempts++;
      sendLog(`🔄 Переподключение через ${delay/1000}с (попытка ${reconnectAttempts})`);
      setTimeout(() => {
        if (!isBotRunning) return;
        startMinecraftBot();
      }, delay);
    }
  }
}

// --- ЗАПУСК ---
sendLog('📡 Бот запущен!');
startMinecraftBot();

// --- ОБРАБОТКА ОСТАНОВКИ (Ctrl+C) ---
process.on('SIGINT', () => {
  sendLog('🛑 Бот остановлен (Ctrl+C)');
  if (minecraftBot) minecraftBot.end();
  if (nickInterval) clearInterval(nickInterval);
  process.exit();
});
