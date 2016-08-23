'use strict'
const crypto = require('crypto')

const utils = {
  'encrypt': encrypt,
  'lowerCase': lowerCase,
  'capitalize': capitalize,
  'validateMessage': validateMessage
}

function encrypt (params) {
  let shasum = crypto.createHash('sha256')
  shasum.update(params)

  return shasum.digest('hex')
}

function validateMessage (message) {
  if (message.from && message.message) {
    return true
  }
  return false
}

function lowerCase (data) {
  let result = data.toLowerCase()
  return result
}

function capitalize (data) {
  let result = data.charAt(0).toUpperCase() + data.slice(1)
  return result
}

module.exports = utils
