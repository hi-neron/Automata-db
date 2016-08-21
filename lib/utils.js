'use strict'
const crypto = require('crypto')

const utils = {
  'encrypt': encrypt
}

function encrypt (params) {
  let shasum = crypto.createHash('sha256')
  shasum.update(params)

  return shasum.digest('hex')
}

module.exports = utils
