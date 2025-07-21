const socket = io();

const numberInput = document.getElementById('numberInput');
const submitBtn = document.getElementById('submitBtn');
const pairingSection = document.getElementById('pairingSection');
const pairingCodeElem = document.getElementById('pairingCode');
const copyBtn = document.getElementById('copyBtn');

submitBtn.onclick = () => {
  const num = numberInput.value.trim();
  if (num) {
    socket.emit('adminNumber', num);
  }
};

socket.on('pairingCode', code => {
  pairingCodeElem.textContent = code;
  pairingSection.style.display = 'block';
});

copyBtn.onclick = () => {
  navigator.clipboard.writeText(pairingCodeElem.textContent);
};
