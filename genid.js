function makeid(num = 4) {
  let result = ""
  let characters = "ABCDEFGHIJKLMNOPSRST0123456789UVWXYZ"
  let charactersLength = characters.length
  for (let i = 0; i < num; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength))
  }
  return result
}

module.exports = { makeid }
