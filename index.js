const mineflayer = require('mineflayer');
const config = require('./config.json');

let botName = config.bot.name;
let reconnectAttempts = 0;
let autoNickAttempts = 0;
let failAttempts = 0;
const MAX_FAIL_ATTEMPTS = 3;

let target = null;
let attacker = null;

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
    // Включаем автоматическую экипировку
    setInterval(() => equipBestGear(bot), 30000);
    // Включаем авто-лечение
    setInterval(() => autoEat(bot), 5000);
  });

  // --- ОСНОВНЫЕ ФУНКЦИИ ---

  // 1. Движение
  function startMovement(bot) {
    if (!config.features.movement.enabled) return;
    setInterval(() => {
      if (!bot.entity || target) return; // Не двигаемся если есть цель
      const x = bot.entity.position.x + (Math.random() - 0.5) * config.features.movement.range;
      const z = bot.entity.position.z + (Math.random() - 0.5) * config.features.movement.range;
      bot.setControlState('forward', true);
      setTimeout(() => bot.setControlState('forward', false), 1000);
      bot.look(Math.random() * Math.PI * 2, 0);
    }, config.features.movement.delay);
  }

  // 2. Чат
  function startChat(bot) {
    if (!config.features.chat.enabled) return;
    let index = 0;
    setInterval(() => {
      const msg = config.features.chat.messages[index % config.features.chat.messages.length];
      bot.chat(msg);
      index++;
    }, config.features.chat.delay);
  }

  // 3. Атака мобов
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

  // 4. Сон
  function startSleep(bot) {
    if (!config.features.sleep.enabled) return;
    setInterval(() => {
      if (target) return;
      const bed = bot.findBlock({ matching: block => block.name === 'bed', maxDistance: 10 });
      if (bed) bot.sleep(bed);
    }, config.features.sleep.timeout);
  }

  // 5. АТАКА ЦЕЛИ (с аимботом)
  function attackTarget(bot) {
    if (!target) return;
    // Аимбот: смотрим на цель
    bot.lookAt(target.position.offset(0, 1.6, 0));
    bot.attack(target);
    // Если цель мертва или далеко — сбрасываем
    if (!target.isValid || bot.entity.position.distanceTo(target.position) > 6) {
      target = null;
    }
  }

  // 6. ОБРАБОТКА УДАРА ПО БОТУ
  bot.on('entityHurt', (entity) => {
    if (entity === bot.entity && entity.entity?.type !== 'mob') {
      const damageSource = entity.entity;
      if (damageSource && damageSource.type === 'player') {
        console.log(`[${new Date().toLocaleTimeString()}] Меня ударил ${damageSource.username}! Отвечаю!`);
        target = damageSource;
        attacker = damageSource;
        // Атакуем обидчика
        setInterval(() => {
          if (target && target.isValid) {
            attackTarget(bot);
          } else {
            target = null;
            attacker = null;
          }
        }, 300);
      }
    }
  });

  // 7. ПОДБОР ПРЕДМЕТОВ
  bot.on('itemDrop', (entity) => {
    if (!entity.item) return;
    const itemName = entity.item.name;
    const distance = bot.entity.position.distanceTo(entity.position);
    if (distance < 5) {
      console.log(`[${new Date().toLocaleTimeString()}] Подбираю ${itemName}`);
      bot.collectBlock(entity);
    }
  });

  // 8. ЭКИПИРОВКА ЛУЧШЕЙ БРОНИ И ОРУЖИЯ
  function equipBestGear(bot) {
    const inventory = bot.inventory.items();
    // Броня
    const armorSlots = ['head', 'chest', 'legs', 'feet'];
    armorSlots.forEach(slot => {
      const item = bot.inventory.findItem(item => 
        item.name.includes('helmet') || item.name.includes('chestplate') ||
        item.name.includes('leggings') || item.name.includes('boots')
      );
      if (item) {
        const equipped = bot.inventory.slots[getSlotIndex(slot)];
        if (!equipped || item.durability > equipped.durability) {
          bot.equip(item, slot);
          console.log(`[${new Date().toLocaleTimeString()}] Надел ${item.name}`);
        }
      }
    });

    // Оружие (лучший меч)
    const sword = bot.inventory.findItem(item => item.name.includes('sword'));
    if (sword) {
      const equipped = bot.inventory.slots[0]; // Основная рука
      if (!equipped || equipped.name !== sword.name) {
        bot.equip(sword, 'hand');
        console.log(`[${new Date().toLocaleTimeString()}] Взял ${sword.name}`);
      }
    }
  }

  // 9. АВТО-ЛЕЧЕНИЕ ЕДОЙ
  function autoEat(bot) {
    if (bot.health < 10) {
      const food = bot.inventory.findItem(item => item.name.includes('apple') || item.name.includes('bread') || item.name.includes('pork'));
      if (food) {
        bot.equip(food, 'hand');
        bot.consume();
        console.log(`[${new Date().toLocaleTimeString()}] Съел ${food.name}`);
      }
    }
  }

  // 10. ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ (индекс слота)
  function getSlotIndex(slot) {
    const map = { head: 5, chest: 6, legs: 7, feet: 8 };
    return map[slot] || 0;
  }

  // --- ЗАПУСК ВСЕХ ЗАДАЧ ---
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

// --- ЗАПУСК ---
createBot();
