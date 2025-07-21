const numberInput = document.getElementById('numberInput')
const submitBtn = document.getElementById('submitBtn')
const pairingCodeDisplay = document.getElementById('pairingCode')
const pairingSection = document.getElementById('pairingSection')
const copyBtn = document.getElementById('copyBtn')

submitBtn.addEventListener('click', async () => {
  const number = numberInput.value.trim()
  if (!number) {
    alert('Veuillez entrer un numéro WhatsApp')
    return
  }

  try {
    const res = await fetch('/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ number })
    })

    if (!res.ok) throw new Error('Erreur lors de l\'envoi du numéro')

      }
  catch (err) {
    alert('Erreur de communication avec le serveur')
    console.error(err)
  }
})

const socket = io()

socket.on('pairing', (code) => {
  pairingCodeDisplay.textContent = code
  pairingSection.style.display = 'block'
})


copyBtn.addEventListener('click', () => {
  const code = pairingCodeDisplay.textContent
  if (code) {
    navigator.clipboard.writeText(code)
    alert('Code copié dans le presse-papiers')
  }
})
