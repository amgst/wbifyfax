let token = '';
const form = document.getElementById('unlock'), rows = document.getElementById('faxes'), notice = document.getElementById('notice');
async function request(url) {
  const response = await fetch(url, {headers: {Authorization: `Bearer ${token}`}, cache: 'no-store'});
  if (!response.ok) {const data = await response.json(); throw Error(data.error || 'Request failed');}
  return response;
}
form.addEventListener('submit', async event => {
  event.preventDefault(); token = document.getElementById('token').value.trim();
  document.getElementById('token').value = ''; rows.replaceChildren(); notice.textContent = 'Loading inbox…';
  try {
    const {faxes} = await (await request('/api/inbox')).json();
    for (const fax of faxes) {
      const row = document.createElement('tr');
      for (const value of [fax.sender, fax.recipient, new Date(fax.received_at).toLocaleString(), fax.page_count ?? 'Unknown']) {
        const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
      }
      const cell = document.createElement('td'), button = document.createElement('button');
      button.textContent = fax.partial ? 'Download partial PDF' : 'Download PDF'; button.className = 'outline';
      button.addEventListener('click', async () => {
        button.disabled = true;
        try {
          const blob = await (await request(`/api/inbox?id=${encodeURIComponent(fax.fax_id)}`)).blob();
          const url = URL.createObjectURL(blob), link = document.createElement('a');
          link.href = url; link.download = `${fax.fax_id}.pdf`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (error) {notice.textContent = error.message;} finally {button.disabled = false;}
      });
      cell.append(button); row.append(cell); rows.append(row);
    }
    notice.textContent = faxes.length ? `${faxes.length} received fax(es).` : 'No received faxes yet.';
  } catch (error) {notice.textContent = error.message;}
});
document.getElementById('lock').addEventListener('click', () => {token = ''; form.reset(); rows.replaceChildren(); notice.textContent = 'Inbox locked.';});
