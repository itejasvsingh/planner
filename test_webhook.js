fetch('http://localhost:3000/api/webhook', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{
      changes: [{
        value: {
          messages: [{
            from: '918130595547',
            type: 'text',
            text: { body: 'Buy milk' }
          }]
        }
      }]
    }]
  })
}).then(r => r.json()).then(console.log).catch(console.error);
