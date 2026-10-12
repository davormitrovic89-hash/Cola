// Schickt eine SYNTHETISCHE, unsignierte Testanfrage an den lokal laufenden Server
// (nur mit ALLOW_UNSIGNED_LOCAL=1). Keine echten Kundendaten verwenden.
const port = process.env.PORT || 8787;
const body = {
  name: 'save_catering_inquiry',
  call: { call_id: `lokal-${Date.now()}`, agent_id: 'lokal-test' },
  args: {
    intent: 'new_inquiry',
    event_type: 'Firmenapéro (Testdaten)',
    event_date: null,
    event_date_raw: 'nächsten Freitag',
    location: 'Testort',
    guest_count: 40,
    requested_services: ['Fingerfood', 'Getränke'],
    contact_name: 'Testperson',
    callback_number: '+41 00 000 00 00',
    summary: 'Synthetische Testanfrage',
    caller_confirmed: true,
  },
};
const res = await fetch(`http://127.0.0.1:${port}/t/catering/retell/functions/save_catering_inquiry`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
console.log(res.status, await res.json());
