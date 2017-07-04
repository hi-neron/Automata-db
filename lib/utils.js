'use strict'
const crypto = require('crypto')
const _ = require('lodash')

const utils = {
  'encrypt': encrypt,
  'lowerCase': lowerCase,
  'capitalize': capitalize,
  'validateMessage': validateMessage,
  'findBadge': findBadge,
  'findImageAward': findImageAward,
  'validateAlert': validateAlert,
  'getAwards': getAwards,
  'isMastery': isMastery,
  'getTags': getTags
}

const BADGESLIST = [
  'artista',
  'mixer',
  'leader'
]

const AWARDS = [
  'amazing',
  'takeMyMoney',
  'bastard'
]

const MASTERIES = [
  'writing',
  'photography',
  'drawing',
  'motion',
  'graffiti',
  'tattoo'
]

function getTags (message) {
  message = message.toLowerCase()
  let tags = message.match(/#([A-z,0-9])\w+/g)
  let maxTags = 5

  if (tags.length > maxTags) {
    tags = tags.slice(0, 5)
  }

  for (let i = 0; i < tags.length; i++) {
    if (tags[i].length > 20) {
      tags.splice(i, 1)
    }
  }

  return tags
}

function getAwards () {
  let length = []
  for (let i = 0; i < AWARDS.length; i++) {
    length.push(0)
  }
  return _.zipObject(AWARDS, length)
}

function findImageAward (award) {
  return _.includes(AWARDS, award)
}

function isMastery (mastery) {
  return MASTERIES.includes(mastery)
}

function encrypt (params) {
  let shasum = crypto.createHash('sha256')
  shasum.update(params)
  return shasum.digest('hex')
}

function findBadge (badge) {
  return _.includes(BADGESLIST, badge)
}

function validateMessage (message) {
  if (message.from && message.message) {
    return true
  }
  return false
}

function validateAlert (alert) {
  if (alert.from && alert.message && alert.type) {
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
