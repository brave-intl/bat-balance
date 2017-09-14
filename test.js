var addresses = [
  '0x7c31560552170ce96c4a7b018e93cddc19dc61b6'
]
var ledgerBalance = require('.')

addresses.forEach((address) => {
  ledgerBalance.getBalance(address, { allP: true, verboseP: true, timeout: 1000 }, (err, provider, result) => {
    if (err) {
      return console.log('address=' + address + ' provider=' + (provider || {}).name + ' ' +
                         'test=' + ledgerBalance.testnetAddressP(address) + ' error=' + JSON.stringify(err, null, 2))
    }

    console.log('address=' + address + ' provider=' + provider.name + ' balance=' + JSON.stringify(result, null, 2) +
                ' test=' + ledgerBalance.testnetAddressP(address))
  })
})
