const mineflayer = require('mineflayer');
const config = require('./config.json');

let botName = config.bot.name;
let reconnectAttempts = 0;
let autoNickAttempts = 0;
let failAttempts = 0;
const MAX_FAIL_ATTEMPTS = 3;

let target = null;
let attacking = false;

function createBot() {
  const bot = mineflayer.createBot({
    host: config.server.ip,
    port: config.server.port,
    username: botName,
    version: config.server.version
  });

  // --- Успешный вход ---
  bot.on('login', () => {
    console.log(`[${new Date().toLocaleTimeString()}] Бот ${botName} зашёл!`);
    reconnectAttempts = 0;
    autoNickAttempts = 0;
    failAttempts = 0;
  });

  bot.on('spawn', () => {
    console.log(`[${new Date().toLocaleTimeString()}] Бот в мире!`);
    startTasks(bot);
  });

  // --- ДВИЖЕНИЕ ---
  function startMovement(bot) {
    if (!config.features.movement.enabled) return;
    setInterval(() => {
      if (!bot.entity || target) return;
      const x = bot.entity.position.x + (Math.random() - 0.5) * config.features.movement.range;
      const z = bot.entity.position.z + (Math.random() - 0.5) * config.features.movement.range;
      bot.setControlState('forward', true);
      setTimeout(() => bot.setControlState('forward', false), 1000);
      bot.look(Math.random() * Math.PI * 2, 0);
    }, config.features.movement.delay);
  }

  // --- ЧАТ ---
  function startChat(bot) {
    if (!config.features.chat.enabled) return;
    let index = 0;
    setInterval(() => {
      const msg = config.features.chat.messages[index % config.features.chat.messages.length];
      bot.chat(msg);
      index++;
    }, config.features.chat.delay);
  }

  // --- АТАКА МОБОВ ---
  function startAttack(bot) {
    if (!config.features.attackMobs.enabled) return;
    setInterval(() => {
      if (target) return;
      const mob = bot.nearestEntity(entity => 
        entity.type === 'mob' && 
        bot.entity.position.distanceTo(entity.position) < config.features.attackMobs.range
      );
      if (mob) {
        target = mob;
        attackTarget(bot);
      }
    }, 2000);
  }

  // --- СОН ---
  function startSleep(bot) {
    if (!config.features.sleep.enabled) return;
    setInterval(() => {
      if (target) return;
      const bed = bot.findBlock({ matching: block => block.name === 'bed', maxDistance: 10 });
      if (bed) bot.sleep(bed);
    }, config.features.sleep.timeout);
  }

  // --- АТАКА ЦЕЛИ (ПРОСТАЯ) ---
  function attackTarget(bot) {
    if (!target || !target.isValid) {
      target = null;
      attacking = false;
      return;
    }

    // Останавливаем движение
    bot.setControlState('forward', false);
    bot.setControlState('back', false);
    bot.setControlState('left', false);
    bot.setControlState('right', false);

    // Смотрим на цель
    bot.lookAt(target.position.offset(0, 1.5, 0));
    
    // Бьём
    bot.attack(target);
    attacking = true;

    // Если цель умерла или убежала — сбрасываем
    if (!target.isValid || bot.entity.position.distanceTo(target.position) > 5) {
      target = null;
      attacking = false;
    }
  }

  // --- КОГДА БОТА УДАРИЛИ (ПРОСТОЙ СПОСОБ) ---
  bot.on('health', () => {
    if (!bot.entity) return;
    // Проверяем, есть ли кто-то рядом с мечом
    const nearby = bot.nearestEntity(entity => 
      entity.type === 'player' && 
      entity !== bot.entity &&
      bot.entity.position.distanceTo(entity.position) < 4
    );
    if (nearby && !target) {
      console.log(`[${new Date().toLocaleTimeString()}] Рядом игрок ${nearby.username}, проверяю...`);
      // Если у нас меньше здоровья, чем у него — считаем, что это он нас ударил
      if (bot.health < 20) {
        target = nearby;
        console.log(`[${new Date().toLocaleTimeString()}] Атакую ${nearby.username}!`);
        // Атакуем раз в 0.5 секунды
        const attackInterval = setInterval(() => {
          attackTarget(bot);
          if (!target) {
            clearInterval(attackInterval);
          }
        }, 500);
      }
    }
  });

  // --- ПОДБОР ПРЕДМЕТОВ ---
  bot.on('itemDrop', (entity) => {
    if (!entity.item) return;
    const distance = bot.entity.position.distanceTo(entity.position);
    if (distance < 5) {
      console.log(`[${new Date().toLocaleTimeString()}] Подбираю ${entity.item.name}`);
      bot.collectBlock(entity);
    }
  });

  // --- ЭКИПИРОВКА ---
  function equipBestGear(bot) {
    try {
      const items = bot.inventory.items();
      // Ищем меч
      const sword = items.find(item => item.name.includes('sword'));
      if (sword) {
        bot.equip(sword, 'hand');
        console.log(`[${new Date().toLocaleTimeString()}] Взял ${sword.name}`);
      }
      // Ищем броню
      const helmet = items.find(item => item.name.includes('helmet'));
      const chest = items.find(item => item.name.includes('chestplate'));
      const legs = items.find(item => item.name.includes('leggings'));
      const boots = items.find(item => item.name.includes('boots'));
      if (helmet) bot.equip(helmet, 'head');
      if (chest) bot.equip(chest, 'torso');
      if (legs) bot.equip(legs, 'legs');
      if (boots) bot.equip(boots, 'feet');
    } catch (err) {
      console.log(`[${new Date().toLocaleTimeString()}] Ошибка экипировки: ${err.message}`);
    }
  }

  // --- ЕДА ---
  function autoEat(bot) {
    try {
      if (bot.health < 12) {
        const food = bot.inventory.findItem(item => 
          item.name.includes('apple') || item.name.includes('bread') || 
          item.name.includes('pork') || item.name.includes('beef') ||
          item.name.includes('chicken')
        );
        if (food) {
          bot.equip(food, 'hand');
          bot.consume();
          console.log(`[${new Date().toLocaleTimeString()}] Съел ${food.name}`);
        }
      }
    } catch (err) {
      console.log(`[${new Date().toLocaleTimeString()}] Ошибка еды: ${err.message}`);
    }
  }

  // --- ЗАПУСК ---
  function startTasks(bot) {
    startMovement(bot);
    startChat(bot);
    startAttack(bot);
    startSleep(bot);
    setInterval(() => equipBestGear(bot), 30000);
    setInterval(() => autoEat(bot), 5000);
  }

  // --- ОБРАБОТКА ОТКЛЮЧЕНИЙ ---
  bot.on('kicked', (reason) => {
    console.log(`[${new Date().toLocaleTimeString()}] Кикнут: ${reason}`);
    target = null;
    attacking = false;
    handleDisconnect('kicked', reason);
  });

  bot.on('end', (reason) => {
    console.log(`[${new Date().toLocaleTimeString()}] Отключён: ${reason}`);
    target = null;
    attacking = false;
    handleDisconnect('end', reason);
  });

  bot.on('error', (err) => {
    console.log(`[${new Date().toLocaleTimeString()}] Ошибка: ${err.message}`);
    if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND') {
      failAttempts++;
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

// --- ЗАПУСК ---
createBot();
}

// --- ЗАПУСК ---
createBot();
