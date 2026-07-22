const mineflayer = require('mineflayer');
const axios = require('axios');
const settings = require('./settings.json');

// --- ПЕРЕМЕННЫЕ ---
let bot = null;
let botName = settings.bot.name;
let reconnectAttempts = 0;
let isBotRunning = false;
let nickInterval = null;

// --- ОТПРАВКА ЛОГОВ В DISCORD ---
function sendLog(message) {
  const timestamp = new Date().toLocaleString();
  const fullMessage = `[${timestamp}] ${message}`;
  console.log(fullMessage);

  if (!settings.discord?.enabled || !settings.discord.webhookUrl) return;
  
  axios.post(settings.discord.webhookUrl, { content: fullMessage }).catch(() => {});
}

// --- СОЗДАНИЕ БОТА ---
function createBot() {
  if (isBotRunning) return;
  isBotRunning = true;

  if (bot) {
    bot.end();
    bot = null;
  }

  sendLog(`🚀 Запуск бота ${botName}...`);

  bot = mineflayer.createBot({
    host: settings.server.ip,
    port: settings.server.port,
    username: botName,
    version: settings.server.version
  });

  // --- ВХОД ---
  bot.on('login', () => {
    sendLog(`✅ Бот ${botName} зашёл на сервер!`);
    reconnectAttempts = 0;

    // Запускаем плавную смену ника
    if (settings.utils.nickChanger?.enabled) {
      if (nickInterval) clearInterval(nickInterval);
      nickInterval = setInterval(() => {
        const newNick = settings.utils.nickChanger.prefix + Date.now().toString().slice(-4);
        botName = newNick;
        settings.bot.name = newNick;
        sendLog(`🔄 Плавная смена ника на ${newNick}`);
        if (bot) {
          bot.end();
          isBotRunning = false;
          setTimeout(() => {
            createBot();
          }, 3000);
        }
      }, settings.utils.nickChanger.interval || 180000);
    }
  });

  // --- СПАВН ---
  bot.on('spawn', () => {
    sendLog(`🌍 Бот появился в мире!`);
    startTasks(bot);
  });

  // --- ДВИЖЕНИЕ ---
  function startMovement(bot) {
    if (!settings.movement.enabled) return;
    setInterval(() => {
      if (!bot.entity) return;
      const x = bot.entity.position.x + (Math.random() - 0.5) * 10;
      const z = bot.entity.position.z + (Math.random() - 0.5) * 10;
      bot.setControlState('forward', true);
      setTimeout(() => bot.setControlState('forward', false), 1000);
      bot.look(Math.random() * Math.PI * 2, 0);
    }, 5000);
  }

  // --- ЧАТ (отключён) ---
  function startChat(bot) {
    if (!settings.utils['chat-messages']?.enabled) return;
    let index = 0;
    setInterval(() => {
      const msg = settings.utils['chat-messages'].messages[index % settings.utils['chat-messages'].messages.length];
      bot.chat(msg);
      index++;
    }, (settings.utils['chat-messages']['repeat-delay'] || 120) * 1000);
  }

  // --- АТАКА МОБОВ ---
  function startAttack(bot) {
    // Можно добавить позже
  }

  // --- СОН ---
  function startSleep(bot) {
    // Можно добавить позже
  }

  function startTasks(bot) {
    startMovement(bot);
    startChat(bot);
    startAttack(bot);
    startSleep(bot);
  }

  // --- ОБРАБОТКА ОТКЛЮЧЕНИЙ ---
  bot.on('kicked', (reason) => {
    const reasonText = typeof reason === 'string' ? reason : JSON.stringify(reason);
    sendLog(`❌ Кикнут: ${reasonText}`);
    handleDisconnect(reasonText);
  });

  bot.on('end', (reason) => {
    sendLog(`❌ Отключён: ${reason}`);
    handleDisconnect(reason);
  });

  bot.on('error', (err) => {
    sendLog(`⚠️ Ошибка: ${err.message}`);
    if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND') {
      handleDisconnect(err.message);
    }
  });

  function handleDisconnect(reason) {
    isBotRunning = false;
    if (nickInterval) {
      clearInterval(nickInterval);
      nickInterval = null;
    }

    const isBan = typeof reason === 'string' && reason.toLowerCase().includes('banned');
    
    if (isBan && settings.utils.nickChanger?.enabled) {
      const newNick = settings.utils.nickChanger.prefix + Date.now().toString().slice(-4);
      botName = newNick;
      settings.bot.name = newNick;
      sendLog(`🔄 Бан! Смена ника на ${newNick}`);
      setTimeout(() => {
        createBot();
      }, 3000);
      return;
    }

    if (settings.utils['auto-reconnect']?.enabled) {
      const minDelay = settings.utils['auto-reconnect'].delay || 5000;
      const maxDelay = settings.utils['auto-reconnect'].maxDelay || 120000;
      let delay = Math.min(minDelay * Math.pow(2, reconnectAttempts), maxDelay);
      reconnectAttempts++;
      sendLog(`🔄 Переподключение через ${delay/1000}с (попытка ${reconnectAttempts})`);
      setTimeout(() => {
        createBot();
      }, delay);
    }
  }
}

// --- ЗАПУСК БОТА ---
createBot();

// --- ОСТАНОВКА (Ctrl+C) ---
process.on('SIGINT', () => {
  sendLog('🛑 Бот остановлен (Ctrl+C)');
  if (bot) bot.end();
  if (nickInterval) clearInterval(nickInterval);
  process.exit();
});

// --- ПЕРЕЗАПУСК ПРИ ПАДЕНИИ ---
process.on('uncaughtException', (err) => {
  sendLog(`💥 Необработанная ошибка: ${err.message}`);
  if (bot) bot.end();
  setTimeout(() => createBot(), 5000);
});
