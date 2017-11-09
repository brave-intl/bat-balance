var params = [
  'ddaa35e6-d86c-49ab-ba42-3b894b54b198'
]
var ledgerBalance = require('.')

/*
params.forEach((params) => {
  ledgerBalance.getBalance(params, { allP: true, debugP: true, verboseP: true, timeout: 5000 }, (err, provider, result) => {
    if (err) {
      return console.log('params=' + console.log(params) + ' provider=' + (provider || {}).name + ' ' +
                         ' error=' + JSON.stringify(err, null, 2))
    }

    console.log('getBalance: params=' + JSON.stringify(params) + ' provider=' + provider.name + ' balance=' +
                JSON.stringify(result, null, 2))
  })
})
 */

params.forEach((params) => {
  ledgerBalance.getProperties(params, { environment: 'staging', allP: true, debugP: true, verboseP: true, timeout: 5000 }, (err, provider, result) => {
    if (err) {
      return console.log('params=' + console.log(params) + ' provider=' + (provider || {}).name + ' ' +
                         ' error=' + JSON.stringify(err, null, 2))
    }

    console.log('getProperties: params=' + JSON.stringify(params) + ' provider=' + provider.name + ' properties=' +
                JSON.stringify(result, null, 2))
  })
})
