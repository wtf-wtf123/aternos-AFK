const mineflayer = require('mineflayer');
const config = require('./config.json');

let botName = config.bot.name;
let reconnectAttempts = 0;
let autoNickAttempts = 0;
let failAttempts = 0;
const MAX_FAIL_ATTEMPTS = 3;

function createBot() {
  const bot = mineflayer.createBot({
    host: config.server.ip,
    port: config.server.port,
    username: botName,
    version: config.server.version
  });

  // --- Успешный вход ---
  bot.on('login', () => {
    console.log(`[${new Date().toLocaleTimeString()}] Бот ${botName} зашёл на сервер!`);
    reconnectAttempts = 0;
    autoNickAttempts = 0;
    failAttempts = 0;
  });

  bot.on('spawn', () => {
    console.log(`[${new Date().toLocaleTimeString()}] Бот появился в мире!`);
    startTasks(bot);
  });

  // --- Движение ---
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

  // --- Чат ---
  function startChat(bot) {
    if (!config.features.chat.enabled) return;
    let index = 0;
    setInterval(() => {
      const msg = config.features.chat.messages[index % config.features.chat.messages.length];
      bot.chat(msg);
      index++;
    }, config.features.chat.delay);
  }

  // --- Атака мобов ---
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

  // --- Сон ---
  function startSleep(bot) {
    if (!config.features.sleep.enabled) return;
    setInterval(() => {
      const bed = bot.findBlock({ matching: block => block.name === 'bed', maxDistance: 10 });
      if (bed) bot.sleep(bed);
    }, config.features.sleep.timeout);
  }

  function startTasks(bot) {
    startMovement(bot);
    startChat(bot);
    startAttack(bot);
    startSleep(bot);
  }

  // --- ОБРАБОТКА ОТКЛЮЧЕНИЙ И БАНА ---
  bot.on('kicked', (reason) => {
    console.log(`[${new Date().toLocaleTimeString()}] Кикнут: ${reason}`);
    handleDisconnect('kicked', reason);
  });

  bot.on('end', (reason) => {
    console.log(`[${new Date().toLocaleTimeString()}] Отключён: ${reason}`);
    handleDisconnect('end', reason);
  });

  bot.on('error', (err) => {
    console.log(`[${new Date().toLocaleTimeString()}] Ошибка: ${err.message}`);
    if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND') {
      failAttempts++;
      console.log(`[${new Date().toLocaleTimeString()}] Неудачная попытка (${failAttempts}/${MAX_FAIL_ATTEMPTS})`);
      if (failAttempts >= MAX_FAIL_ATTEMPTS && config.features.autoNickChange.enabled) {
        changeNickAndReconnect();
      }
    }
  });

  function changeNickAndReconnect() {
    if (autoNickAttempts >= config.features.autoNickChange.maxAttempts) {
      console.log(`[${new Date().toLocaleTimeString()}] Лимит смены ника. Бот остановлен.`);
      return;
    }
    const newNick = config.features.autoNickChange.prefix + Date.now().toString().slice(-4);
    console.log(`[${new Date().toLocaleTimeString()}] Меняю ник с ${botName} на ${newNick}`);
    botName = newNick;
    autoNickAttempts++;
    failAttempts = 0;
    setTimeout(() => createBot(), 3000);
  }

  function handleDisconnect(event, reason) {
    const isBan = typeof reason === 'string' && reason.toLowerCase().includes('banned');
    if (isBan && config.features.autoNickChange.enabled) {
      changeNickAndReconnect();
      return;
    }
    if (config.features.autoReconnect.enabled) {
      const minDelay = config.features.autoReconnect.minDelay || 5000;
      const maxDelay = config.features.autoReconnect.maxDelay || 120000;
      let delay = Math.min(minDelay * Math.pow(2, reconnectAttempts), maxDelay);
      reconnectAttempts++;
      console.log(`[${new Date().toLocaleTimeString()}] Переподключение через ${delay/1000}с (попытка ${reconnectAttempts})`);
      setTimeout(() => createBot(), delay);
    }
  }
}

// --- Запуск ---
createBot();
