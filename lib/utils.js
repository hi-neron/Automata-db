'use strict'
const crypto = require('crypto')
const _ = require('lodash')

const utils = {
  'encrypt': encrypt,
  'lowerCase': lowerCase,
  'capitalize': capitalize,
  'validateMessage': validateMessage,
  'findSkill': findSkill,
  'findBadge': findBadge,
  'findImageAward': findImageAward,
  'validateAlert': validateAlert,
  'getAwards': getAwards
}

const BADGESLIST = [
  'artista',
  'mixer',
  'leader'
]

const SKILLSLIST = [
  'crab',
  'bicycle',
  'poker'
]

const AWARDS = [
  'amazing',
  'takeMyMoney',
  'bastard'
]

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

function encrypt (params) {
  let shasum = crypto.createHash('sha256')
  shasum.update(params)
  return shasum.digest('hex')
}

function findSkill (skill) {
  return _.includes(SKILLSLIST, skill)
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
