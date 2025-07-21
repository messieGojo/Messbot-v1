const form = document.getElementById('admin-form')
form.addEventListener('submit', async e => {
  e.preventDefault()
  const formData = new FormData(form)
  const res = await fetch('/set-admin', {
    method: 'POST',
    body: formData
  })
  const html = await res.text()
  document.getElementById('result').innerHTML = html
})
