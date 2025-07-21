const form = document.getElementById('adminForm')
const input = document.getElementById('adminNumber')
const codeContainer = document.getElementById('codeContainer')
const pairingCode = document.getElementById('pairingCode')
const copyButton = document.getElementById('copyButton')

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  const number = input.value.trim()

  const res = await fetch('/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ number })
  })

  const data = await res.json()

  if (data.pairingCode) {
    pairingCode.textContent = data.pairingCode
    codeContainer.style.display = 'block'
  } else {
    alert('Erreur : ' + (data.error || 'aucun code généré'))
  }
})

copyButton.addEventListener('click', () => {
  navigator.clipboard.writeText(pairingCode.textContent)
  copyButton.textContent = 'Copié !'
  setTimeout(() => copyButton.textContent = 'Copier', 2000)
})
