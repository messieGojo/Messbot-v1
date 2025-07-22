function makeid(num = 6) {
  let result = ''
  let characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  for (let i = 0; i < num; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length))
  }
  return result
}

module.exports = { makeid }
