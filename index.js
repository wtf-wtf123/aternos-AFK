const mineflayer = require('mineflayer');
const config = require('./config.json');
const { Client, GatewayIntentBits } = require('discord.js');

// --- ПЕРЕМЕННЫЕ ---
let botName = config.bot.name;
let reconnectAttempts = 0;
let autoNickAttempts = 0;
let failAttempts = 0;
const MAX_FAIL_ATTEMPTS = 3;
let minecraftBot = null;
let isBotRunning = false;
let nickInterval = null;

// --- ИНИЦИАЛИЗАЦИЯ DISCORD БОТА ---
const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

let logChannel = null;

function sendLog(message) {
  if (!config.discord.enabled) return;
  const timestamp = new Date().toLocaleString();
  if (logChannel) {
    logChannel.send(`[${timestamp}] ${message}`).catch(() => {});
  }
  console.log(`[${timestamp}] ${message}`);
}

discordClient.on('ready', () => {
  console.log(`Discord бот залогинился как ${discordClient.user.tag}`);
  if (config.discord.enabled && config.discord.channelId) {
    logChannel = discordClient.channels.cache.get(config.discord.channelId);
    if (logChannel) {
      sendLog('✅ Бот запущен и готов к работе!');
    } else {
      console.log('❌ Канал с ID ' + config.discord.channelId + ' не найден!');
    }
  }
});

discordClient.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(config.discord.commandPrefix || '!')) return;

  const args = message.content.slice(1).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  // --- КОМАНДЫ УПРАВЛЕНИЯ ---
  if (command === 'status') {
    const status = isBotRunning ? '🟢 Работает' : '🔴 Остановлен';
    const nick = isBotRunning ? botName : 'Неизвестно';
    message.reply(`Статус: ${status}\nТекущий ник: ${nick}`);
  }

  else if (command === 'start') {
    if (isBotRunning) {
      message.reply('⚠️ Бот уже запущен!');
      return;
    }
    message.reply('🔄 Запускаю бота...');
    startMinecraftBot();
  }

  else if (command === 'stop') {
    if (!isBotRunning || !minecraftBot) {
      message.reply('⚠️ Бот уже остановлен!');
      return;
    }
    message.reply('🛑 Останавливаю бота...');
    if (nickInterval) {
      clearInterval(nickInterval);
      nickInterval = null;
    }
    minecraftBot.end();
    isBotRunning = false;
    minecraftBot = null;
    sendLog('⏹️ Бот остановлен по команде из Discord');
  }

  else if (command === 'nick') {
    const newNick = args.join(' ');
    if (!newNick) {
      message.reply('❌ Укажи новый ник! Пример: `!nick MyBot2026`');
      return;
    }
    if (!isBotRunning || !minecraftBot) {
      message.reply('⚠️ Бот не запущен! Сначала выполни `!start`');
      return;
    }
    botName = newNick;
    sendLog(`🔄 Смена ника на ${newNick} по команде из Discord`);
    message.reply(`✅ Ник изменён на **${newNick}**. Бот перезапустится...`);
    // Перезапускаем бота с новым ником
    if (minecraftBot) {
      if (nickInterval) {
        clearInterval(nickInterval);
        nickInterval = null;
      }
      minecraftBot.end();
      setTimeout(() => {
        startMinecraftBot();
      }, 3000);
    }
  }

  else if (command === 'help') {
    message.reply(`Команды:
\`!status\` - статус бота
\`!start\` - запустить бота
\`!stop\` - остановить бота
\`!nick <ник>\` - сменить ник бота
\`!help\` - показать это сообщение`);
  }
});

// --- ЗАПУСК MINECRAFT БОТА ---
function startMinecraftBot() {
  if (isBotRunning) return;
  isBotRunning = true;

  minecraftBot = mineflayer.createBot({
    host: config.server.ip,
    port: config.server.port,
    username: botName,
    version: config.server.version
  });

  // --- ВХОД ---
  minecraftBot.on('login', () => {
    const msg = `✅ Бот ${botName} зашёл на сервер!`;
    sendLog(msg);
    reconnectAttempts = 0;
    autoNickAttempts = 0;
    failAttempts = 0;

    // Запускаем плавную смену ника
    if (config.features.nickChanger.enabled) {
      if (nickInterval) clearInterval(nickInterval);
      nickInterval = setInterval(() => {
        const newNick = config.features.nickChanger.prefix + Date.now().toString().slice(-4);
        botName = newNick;
        sendLog(`🔄 Плавная смена ника на ${newNick}`);
        // Перезапускаем бота с новым ником
        if (minecraftBot) {
          minecraftBot.end();
          setTimeout(() => {
            startMinecraftBot();
          }, 3000);
        }
      }, config.features.nickChanger.interval || 120000);
    }
  });

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
    sendLog(`❌ Кикнут: ${reason}`);
    handleDisconnect('kicked', reason);
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
        setTimeout(() => {
          if (minecraftBot) {
            minecraftBot.end();
            setTimeout(() => startMinecraftBot(), 3000);
          }
        }, 5000);
      }
    }
  });

  function handleDisconnect(event, reason) {
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

// --- ЗАПУСК ВСЕГО ---
discordClient.login(config.discord.token).catch(err => {
  console.error('❌ Ошибка логина в Discord:', err.message);
  console.log('⚠️ Запускаю Minecraft бота без Discord...');
  startMinecraftBot();
});

// Если Discord отключён в конфиге — просто запускаем бота
if (!config.discord.enabled) {
  console.log('ℹ️ Discord интеграция отключена в config.json');
  startMinecraftBot();
}
}

// --- Запуск ---
createBot();
