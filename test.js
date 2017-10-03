var params = [
  'a4493d06-5f4f-45d5-9557-c5916800d7b0'
]
var ledgerBalance = require('.')

params.forEach((params) => {
  ledgerBalance.getBalance(params, { allP: true, debugP: true, verboseP: true, timeout: 1000 }, (err, provider, result) => {
    if (err) {
      return console.log('params=' + console.log(params) + ' provider=' + (provider || {}).name + ' ' +
                         ' error=' + JSON.stringify(err, null, 2))
    }

    console.log('params=' + JSON.stringify(params) + ' provider=' + provider.name + ' balance=' +
                JSON.stringify(result, null, 2))
  })
})
