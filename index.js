const http = require('http')
const https = require('https')
const url = require('url')

const backoff = require('@ambassify/backoff-strategies')
const datax = require('data-expression')
const Joi = require('joi')
const underscore = require('underscore')
const npminfo = require('./package.json')

const schema = Joi.array().min(1).items(Joi.object().keys(
  { name: Joi.string().required().description('commonly-known name of provider'),
    site: Joi.string().uri().required().description('associated website'),
    server: Joi.string().uri({ schema: /https?/ }).required().description('HTTP(s) location of service'),
    path: Joi.string().required().description('path to evaluate for endpoint'),
    method: Joi.string().valid('GET', 'POST', 'PUT').optional().description('HTTP method'),
    payload: Joi.string().optional().description('expression to evaluate for HTTP payload'),
    confirmed: Joi.string().required().description('expression to evaluate to resolve to satoshis'),
    unconfirmed: Joi.string().optional().description('expression to evaluate to resolve to satoshis'),
    description: Joi.string().optional().description('a brief annotation'),
    environment: Joi.string().valid('production', 'staging').required().description('the environment')
  }
))

const providers = [
  { name: 'Brave Software International',
    environment: 'production',
    site: 'https://balance.mercury.basicattentiontoken.org',
    server: 'https://balance.mercury.basicattentiontoken.org',
    path: "'/v2/wallet/' + paymentId + '/balance'",
    confirmed: 'parseFloat(body.balance)',
    unconfirmed: 'parseFloat(body.unconfirmed)'
  },
  { name: 'Brave Software International Staging',
    environment: 'staging',
    site: 'https://balance-staging.mercury.basicattentiontoken.org',
    server: 'https://balance-staging.mercury.basicattentiontoken.org',
    path: "'/v2/wallet/' + paymentId + '/balance'",
    confirmed: 'parseFloat(body.balance)',
    unconfirmed: 'parseFloat(body.unconfirmed)'
  }
]

const uuidV4RegExp = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89AB][0-9a-f]{3}-[0-9a-f]{12}$/i

const getBalance = (params, options, callback) => {
  getProperties(params, options, (err, provider, payload, now) => {
    let result

    if (err) return callback(err, provider, payload)

    result = datax.evaluate(provider.confirmed, { body: payload })
    if (typeof result === 'number') {
      provider.score = Math.max(5000 - (underscore.now() - now), -250)
      if ((options.balancesP) && (provider.unconfirmed)) {
        try {
          result = { balance: result, unconfirmed: datax.evaluate(provider.unconfirmed, { body: payload }) }
        } catch (ex) {
          if ((options.debugP) || (options.verboseP)) {
            console.log('provider ' + provider.name + ' has invalid confirmed field [' + provider.confirmed + ']/1 for ' +
                      JSON.stringify(payload))
          }
        }
      }
      callback(null, provider, result)
      if (options.allP) throw new Error('')

      return
    }

    provider.score = -1001
    throw new Error('provider ' + provider.name + ' has invalid confirmed field [' + provider.confirmed + ']/2 for ' +
                    JSON.stringify(payload))
  })
}

const getProperties = (params, options, callback) => {
  let entries, services

  if (typeof options === 'function') {
    callback = options
    options = {}
  }

  if (typeof options.roundtrip !== 'undefined') {
    if (typeof options.roundtrip !== 'function') throw new Error('invalid roundtrip option (must be a function)')
  } else if (options.debugP) options.roundtrip = roundTrip
  else throw new Error('security audit requires options.roundtrip for non-debug use')

  if (typeof params === 'string') {
    if (uuidV4RegExp.test(params)) params = { addresses: { CARD_ID: params } }
    else params = { addresses: { BAT: params } }
  }

  services = providers.filter((provider) => { return provider.environment === (options.environment || 'production') })

  services.forEach((provider) => { if (typeof provider.score === 'undefined') provider.score = 0 })
  entries = underscore.sortBy(underscore.shuffle(services), (provider) => { return provider.score })

  const e = (provider, field) => {
    const result = datax.evaluate(provider[field], underscore.defaults(params))

    if (result) return result

    provider.score = -1001
    callback(new Error('provider ' + provider.name + ' has invalid ' + field + ' field: ' + provider[field]), provider)
  }

  const f = (i) => {
    let now, params, provider

    if (i === 0) {
      if (!options.allP) callback(new Error('no providers available'))
      return
    }

    provider = entries[--i]
    if (provider.score < -1000) return f(i)

    if ((options.balancesP) && (!provider.unconfirmed)) return f(i)

    params = underscore.defaults(underscore.pick(provider, [ 'server', 'method' ]), underscore.pick(options, [ 'timeout' ]))
    params.path = e(provider, 'path')
    if (!params.path) return f(i)

    if (provider.payload) {
      params.payload = e(provider, 'payload')
      if (!params.payload) return f(i)
    }

    now = underscore.now()
    retryTrip(params, options, (err, response, payload) => {
      if (err) {
        provider.score = (err.toString() === 'Error: timeout') ? -500  // timeout
                           : (typeof err.code !== 'undefined') ? -350  // DNS, etc.
                           : -750                                      // HTTP response error
      } else {
        try { return callback(null, provider, payload, now) } catch (ex) { err = ex }
      }

      if (err.message !== '') callback(new BalanceError(err, provider.name), provider)
      f(i)
    })
  }

  f(entries.length)
}

const retryTrip = (params, options, callback, retry) => {
  let method

  const loser = (reason) => { setTimeout(() => { callback(new Error(reason)) }, 0) }
  const rangeP = (n, min, max) => { return ((min <= n) && (n <= max) && (n === parseInt(n, 10))) }

  if (!retry) {
    retry = underscore.defaults(options.backoff || {}, {
      algorithm: 'binaryExponential', delay: 5 * 1000, retries: 3, tries: 0
    })
    if (!rangeP(retry.delay, 1, 30 * 1000)) return loser('invalid backoff delay')
    if (!rangeP(retry.retries, 0, 10)) return loser('invalid backoff retries')
    if (!rangeP(retry.tries, 0, retry.retries - 1)) return loser('invalid backoff tries')
  }
  method = retry.method || backoff[retry.algorithm]
  if (typeof method !== 'function') return loser('invalid backoff algorithm')
  method = method(retry.delay)

  options.roundtrip(params, options, (err, response, payload) => {
    const code = Math.floor(response.statusCode / 100)

    if ((!err) || (code !== 5) || (retry.retries-- < 0)) return callback(err, response, payload)

    return setTimeout(() => { retryTrip(params, options, callback, retry) }, method(++retry.tries))
  })
}

const roundTrip = (params, options, callback) => {
  let request, timeoutP
  const parts = url.parse(params.server)
  const client = parts.protocol === 'https:' ? https : http

  params = underscore.defaults(underscore.extend(underscore.pick(parts, 'protocol', 'hostname', 'port'), params),
                               { method: params.payload ? 'POST' : 'GET' })
  if (options.debugP) console.log('\nparams=' + JSON.stringify(params, null, 2))

  request = client.request(underscore.omit(params, [ 'payload', 'timeout' ]), (response) => {
    let body = ''

    if (timeoutP) return
    response.on('data', (chunk) => {
      body += chunk.toString()
    }).on('end', () => {
      let payload

      if (params.timeout) request.setTimeout(0)

      if (options.verboseP) {
        console.log('>>> HTTP/' + response.httpVersionMajor + '.' + response.httpVersionMinor + ' ' + response.statusCode +
                   ' ' + (response.statusMessage || ''))
        console.log('>>> via: ' + params.hostname + (params.path || ''))
        console.log('>>> ' + (body || '').split('\n').join('\n>>> '))
      }
      if (Math.floor(response.statusCode / 100) !== 2) {
        return callback(new Error('HTTP response ' + response.statusCode), response)
      }

      try {
        payload = (response.statusCode !== 204) ? JSON.parse(body) : null
      } catch (err) {
        return callback(new BalanceError(err, url.format(params)), response)
      }

      try {
        callback(null, response, payload)
      } catch (err0) {
        if (options.verboseP) console.log('callback: ' + err0.toString() + '\n' + err0.stack)
      }
    }).setEncoding('utf8')
  }).on('error', (err) => {
    callback(new BalanceError(err, url.format(params)))
  }).on('timeout', () => {
    timeoutP = true
    callback(new Error('timeout'))
  })
  if (params.payload) request.write(JSON.stringify(params.payload))
  request.end()
  if (params.timeout) request.setTimeout(params.timeout)

  if (!options.verboseP) return

  console.log('<<< ' + params.method + ' ' + params.protocol + '//' + params.hostname + (params.path || ''))
  console.log('<<<')
  if (params.payload) console.log('<<< ' + JSON.stringify(params.payload, null, 2).split('\n').join('\n<<< '))
}

const BalanceError = function (err, name) {
  if (!(this instanceof BalanceError)) return BalanceError(err, name)

  underscore.extend(this, underscore.pick(err, [ 'columnNumber', 'fileName', 'lineNumber', 'name', 'stack' ]))
  this.message = name + ': ' + underscore.message
}

module.exports = {
  getBalance: getBalance,
  getProperties: getProperties,
  providers: providers,
  schema: schema,
  version: npminfo.version
}

const validity = Joi.validate(providers, schema)
if (validity.error) throw new Error(validity.error)
