// Мост: чат Twitch -> чат Minecraft.
// Читает чат Twitch (логин не нужен) и пишет сообщения на сервер Minecraft
// от имени отдельного игрока-«ретранслятора». Бот AIRI видит чат в игре и отвечает.
// Если в чате тихо, мост время от времени даёт AIRI новое задание, чтобы она играла сама.

import process from 'node:process'
import mineflayer from 'mineflayer'
import tmi from 'tmi.js'

const env = (key, fallback) => {
  const value = process.env[key]
  return value === undefined || value === '' ? fallback : value
}

const config = {
  twitchChannel: env('TWITCH_CHANNEL', ''),
  mcHost: env('MC_HOST', 'minecraft.railway.internal'),
  mcPort: Number(env('MC_PORT', '25565')),
  mcVersion: env('MC_VERSION', '1.21.4'),
  relayName: env('RELAY_USERNAME', 'Twitch'),
  botName: env('AIRI_BOT_NAME', 'AIRI'),
  // Контроль расходов на API: не чаще одного сообщения раз в N секунд
  minIntervalSec: Number(env('MIN_INTERVAL_SEC', '20')),
  // Если чат молчит, раз в N минут AIRI получает задание (0 = выключено)
  idleGoalMin: Number(env('IDLE_GOAL_MIN', '5')),
  maxQueue: Number(env('MAX_QUEUE', '5')),
  idleGoals: env('IDLE_GOALS', [
    'наруби деревьев и построй себе дом',
    'исследуй местность и расскажи, если найдёшь что-то интересное',
    'скрафти каменные инструменты',
    'найди еду и поешь',
    'выкопай шахту и найди железо',
    'ночью спрячься в безопасном месте от монстров',
  ].join('|')).split('|').map(s => s.trim()).filter(Boolean),
}

if (!config.twitchChannel) {
  console.error('Не задана переменная TWITCH_CHANNEL. Пример: TWITCH_CHANNEL=moy_kanal')
  process.exit(1)
}

const queue = []
let lastSentAt = 0
let lastActivityAt = Date.now()
let bot = null

function clean(text) {
  return text
    .replace(/[\r\n]+/g, ' ')
    .replace(/^[/!]+/, '') // чтобы зрители не могли отправлять команды (/op, !pause)
    .trim()
    .slice(0, 180)
}

function createBot() {
  bot = mineflayer.createBot({
    host: config.mcHost,
    port: config.mcPort,
    username: config.relayName,
    version: config.mcVersion,
    auth: 'offline',
  })

  bot.once('spawn', () => {
    console.log(`Подключён к серверу Minecraft: ${config.mcHost}:${config.mcPort} (${config.relayName})`)
  })

  bot.on('end', (reason) => {
    console.warn(`Соединение с Minecraft потеряно (${reason}). Переподключение через 10 секунд...`)
    setTimeout(createBot, 10_000)
  })

  bot.on('error', err => console.error('Ошибка Minecraft:', err.message))
  bot.on('kicked', reason => console.warn('Кикнут с сервера:', reason))
}

function sendToMinecraft(text) {
  if (!bot || !bot.entity) {
    console.warn('Minecraft ещё не готов, сообщение пропущено:', text)
    return
  }
  bot.chat(text)
  lastSentAt = Date.now()
  console.log('-> MC:', text)
}

// Отправляем сообщения из очереди не спеша
setInterval(() => {
  const now = Date.now()
  if (now - lastSentAt < config.minIntervalSec * 1000)
    return

  const next = queue.shift()
  if (next) {
    sendToMinecraft(next)
    return
  }

  if (config.idleGoalMin > 0 && now - lastActivityAt > config.idleGoalMin * 60_000) {
    const goal = config.idleGoals[Math.floor(Math.random() * config.idleGoals.length)]
    sendToMinecraft(`${config.botName}, твоё следующее задание: ${goal}`)
    lastActivityAt = now
  }
}, 1000)

const twitch = new tmi.Client({
  connection: { reconnect: true, secure: true },
  channels: [config.twitchChannel],
})

twitch.on('message', (_channel, tags, message, self) => {
  if (self)
    return
  const user = tags['display-name'] || tags.username || 'зритель'
  const text = clean(message)
  if (!text)
    return

  lastActivityAt = Date.now()
  if (queue.length >= config.maxQueue)
    queue.shift() // выбрасываем самое старое сообщение, добавляем новое
  queue.push(`${config.botName}, ${user} из Twitch пишет: ${text}`)
})

twitch.on('connected', () => console.log(`Подключён к чату Twitch: #${config.twitchChannel}`))

createBot()
twitch.connect().catch(err => console.error('Ошибка Twitch:', err))
