const $ = id => document.getElementById(id);
const fileInput = $('file'), label = $('fileLabel'), msg = $('message'), form = $('faxForm'), submit = $('submit'), rows = $('rows');
let token = '', busy = false;
const pendingKey = 'faxbridge.pending';
let pendingId = sessionStorage.getItem(pendingKey);
function updateLabel() {const f = fileInput.files?.[0]; label.textContent = f ? `${f.name} (${(f.size / 1024).toFixed(1)} KB)` : 'Click to select or drop a PDF';}
fileInput.addEventListener('change', updateLabel);
const drop = $('drop');
for (const name of ['dragenter', 'dragover']) drop.addEventListener(name, event => {event.preventDefault(); drop.classList.add('over');});
for (const name of ['dragleave', 'drop']) drop.addEventListener(name, event => {event.preventDefault(); drop.classList.remove('over');});
drop.addEventListener('drop', event => {if (event.dataTransfer.files.length) {fileInput.files = event.dataTransfer.files; updateLabel();}});
const readFile = file => new Promise((resolve, reject) => {const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file);});
async function request(options = {}) {
  const response = await fetch('/api/faxes', {...options, headers: {...options.headers, Authorization: `Bearer ${token}`}, cache: 'no-store'});
  const data = await response.json();
  if (!response.ok) {const error = Error(data.error || 'Fax service unavailable.'); error.status = response.status; throw error;}
  return data;
}
function clearPending() {pendingId = null; sessionStorage.removeItem(pendingKey);}
async function reload() {
  const accessToken = token;
  const {jobs} = await request();
  if (!token || token !== accessToken) return;
  rows.replaceChildren();
  if (pendingId && jobs.some(job => job.id === pendingId)) clearPending();
  if (!jobs.length) {const tr = document.createElement('tr'), td = document.createElement('td'); td.colSpan = 4; td.className = 'empty'; td.textContent = 'No faxes yet.'; tr.append(td); rows.append(tr);}
  for (const job of jobs) {
    const tr = document.createElement('tr');
    for (const value of [job.filename, job.number, new Date(job.createdAt).toLocaleString(), job.status + (job.failure_reason ? `: ${job.failure_reason}` : '')]) {const td = document.createElement('td'); td.textContent = value; tr.append(td);} rows.append(tr);
  }
  submit.disabled = busy || !token || Boolean(pendingId);
  if (pendingId) throw Error('Previous request is unconfirmed. Refresh history and check Telnyx before sending again.');
}
$('unlock').addEventListener('submit', async event => {
  event.preventDefault(); token = $('token').value.trim(); $('token').value = '';
  try {await reload(); $('accessMessage').textContent = 'Workspace unlocked. Sending a fax incurs provider charges.';}
  catch (error) {$('accessMessage').textContent = error.message; submit.disabled = true;}
});
$('lock').addEventListener('click', () => {token = ''; submit.disabled = true; rows.replaceChildren(); form.reset(); updateLabel(); msg.textContent = ''; $('accessMessage').textContent = 'Workspace locked.';});
form.addEventListener('submit', async event => {
  event.preventDefault(); if (busy || !token || pendingId) return;
  msg.className = 'message'; msg.textContent = '';
  const file = fileInput.files?.[0], number = $('number').value.replace(/[\s()-]/g, '');
  if (!file || file.size > 3 * 1024 * 1024 || !file.name.toLowerCase().endsWith('.pdf')) {msg.textContent = 'Choose a PDF up to 3 MB.'; return;}
  if (!/^\+[1-9]\d{7,14}$/.test(number)) {msg.textContent = 'Enter an international fax number beginning with +.'; return;}
  busy = true; submit.disabled = true; submit.textContent = 'Submitting fax…';
  try {
    const contents = await readFile(file);
    pendingId = crypto.randomUUID(); sessionStorage.setItem(pendingKey, pendingId);
    const {job} = await request({method: 'POST', headers: {'Content-Type': 'application/json', 'Idempotency-Key': pendingId}, body: JSON.stringify({filename: file.name, file: contents, number})});
    clearPending();
    msg.className = ['failed', 'unknown'].includes(job.status) ? 'message error' : 'message success';
    msg.textContent = job.status === 'queued' ? 'Fax accepted by Telnyx. Delivery is pending.' : `Fax status: ${job.status}. ${job.failure_reason || ''}`;
    form.reset(); updateLabel(); await reload();
  } catch (error) {if ([400, 401, 403, 413, 422].includes(error.status)) clearPending(); msg.className = 'message error'; msg.textContent = error.message;}
  finally {busy = false; submit.disabled = !token || Boolean(pendingId); submit.textContent = 'Send fax →';}
});
$('refresh').addEventListener('click', () => reload().catch(error => {msg.textContent = error.message;}));
setInterval(() => {if (token && !busy) reload().catch(error => {$('accessMessage').textContent = error.message;});}, 15000);
